const uuidv4 = require('uuid/v4');
const Koa = require('koa');
const session = require('koa-session');
const bodyParser = require('koa-bodyparser');
const { createHash } = require('crypto');
const fs = require('fs');
const stream = require('stream');
const url = require('url');
const events = require('events');
const util = require('util');

const detect = require('./detect.js');
const sleep = require('./util/sleep.js');
const { decodeFrame, encodeFrame } = require('./util/handleFrame.js');

const CONFIG = {
    key: 'koa:sess',   //cookie key (default is koa:sess)
    maxAge: 86400000,  // cookie的过期时间 maxAge in ms (default is 1 days)
    overwrite: true,  //是否可以overwrite    (默认default true)
    httpOnly: true, //cookie是否只有服务器端可以访问 httpOnly or not (default true)
    signed: true,   //签名默认true
    rolling: false,  //在每次请求时强行设置cookie，这将重置cookie过期时间（默认：false）
    renew: false,  //(boolean) renew session when session is nearly expired,
};

// 保存Socket对象,以socketId - socket实例为键值对
const sockObjMap = {};

// stream.Duplex构造函数
function EventStream() {
    stream.Duplex.call(this);
}
util.inherits(EventStream, stream.Duplex);
EventStream.prototype._read = function () { }
EventStream.prototype._write = function () { }

class Socket extends events.EventEmitter {
    constructor(socketId) {
        super();
        this.id = socketId;     // SocketId
        this.netSocket = null   // updrage时获取的net.socket的实例,供WebSocket通信使用
        this.eventStream = null // Stream.readable实例，供Event-Source通信使用
        this.transport = null;  // 标记通信方式 
        this.toSendMes = [];    // 待发送的信息，HTTP轮询时使用 TODO;
        this.chunks = [];
    }

    // 设置net.socket实例，同时开始监听data事件
    setNetSocket(netSocket, socket) {
        this.netSocket = netSocket;
        this.netSocket.on('data', payload => {
            // 根据Node文档,payload的可能为Buffer或String
            const str = Buffer.isBuffer(payload) ? decodeFrame(payload).PayloadLength : payload;
            let o = null;
            try {
                o = JSON.parse(str);
            } catch (error) {
                return;
            }
            if (!o.event || !o.data) return;
            socket._emit(o.event, o.data);
        });
    }

    setEventStream(eventStream) {
        this.eventStream = eventStream;
    }

    setTransport(transport) {
        this.transport = transport;
    }

    addMessage(event, data) {
        this.toSendMes.push({
            event,
            data
        })
    }

    // 表示EventEmitter原始的emit方法
    _emit(event, data) {
        super.emit(event, data);
    }
    // 表示EventEmitter原始的on方法
    _on(event, callback) {
        super.on(event, callback)
    }

    // 自定义的emit,触发的是前端的on
    emit(event, data) {
        const dataStr = JSON.stringify({
            event,
            data
        })
        if (this.transport === 'websocket') {
            if (!this.netSocket) { throw new Error('socket对象不存在,无法emit') };
            const dataFrame = encodeFrame({
                FIN: 1,           // 1表示是最后一个数据帧,一定要为1！！，不然onMessage收不到数据
                Opcode: 1,        // 1表示数据为TEXT类型
                PayloadData: dataStr // 数据载荷
            })
            this.netSocket.write(dataFrame);
        } else if (this.transport === 'eventsource') {
            if (!this.eventStream) { throw new Error('eventStream不存在,无法emit') };
            this.eventStream.push(`event:message\ndata:${dataStr}\n\n`);
        } else if (this.transport === 'polling') {
            debugger;
            this.addMessage(event, data);
        }
    }

    // 自定义的on,响应的是前端的emit
    on(event, cb) {
        if (this.transport === 'websocket') {
            if (!this.netSocket) { throw new Error('socket对象不存在，无法on') };
            super.on(event, cb);
        } else if (this.transport === 'eventsource') {
            super.on(event, cb);
        } else if (this.transport === 'polling') {
            super.on(event, cb);
        }
    }
}

class Server extends events.EventEmitter {
    constructor(opt) {
        super();
        this.httpSrv = opt.httpSrv;
        this._initHttp();
        this._initWebSocket();
    }

    onconnect(cb) {
        events.on('connect', cb);
    }

    _initWebSocket() {
        this.httpSrv.on('upgrade', (req, netSocket) => {
            netSocket.setKeepAlive(true);
            // 因为通信过程中使用同一个socket对象,所以websocket不分配socketId
            // 也不存入sockObjMap中
            const socket = new Socket(null);
            // 设置socket通信方式
            socket.setTransport('websocket');
            // upgrade完成时绑定net.Socket
            socket.setNetSocket(netSocket, socket);
            // 处理WebSocket握手过程
            this._handleWShandShake(req, netSocket, () => {
                // 握手成功后触发onConnection方法,TODO
                this.emit('connect', socket);
            })
        });
    }

    _initHttp() {
        const app = new Koa();
        app.keys = ['some secret'];
        app.use(bodyParser());
        app.use(session(CONFIG, app));
        app.use(this._loadStatic);
        app.use(this._handleMiddleWare.bind(this));
        this.httpSrv.on('request', app.callback());
    }

    async _handleMiddleWare(ctx, next) {
        let socket = null;
        let socketId = ctx.cookies.get('socketId');
        if (socketId && sockObjMap[socketId]) {
            // 非首次连接
            socket = sockObjMap[socketId];
        } else {
            // 首次连接
            socketId = uuidv4();
            ctx.cookies.set('socketId', socketId);
            socket = new Socket(socketId, ctx);
            // 保存socket，
            sockObjMap[socketId] = socket;
        }

        if (detect.isEventSource(ctx.req)) {
            if (detect.isConnection(ctx.req)) {
                this._handleEShandShake(ctx, socket);
            } else {
                this._handleEventSource(ctx, socket);
            }
            return;
        }

        if (detect.isPolling(ctx.req)) {
            const isConnection = detect.isConnection(ctx.req);
            await this._handlePolling(ctx, socket, isConnection);
        }
        await next()
    }

    _handleWShandShake(req, netSocket, cb) {
        if (!detect.isWebSocket(req)) {
            return;
        }
        const key =
            req.headers['sec-websocket-key'] !== undefined
                ? req.headers['sec-websocket-key'].trim()
                : '';
        const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
        const digest = createHash('sha1')
            .update(key + GUID)
            .digest('base64');
        const headers = [
            'HTTP/1.1 101 Switching Protocols',
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Accept: ${digest}`
        ];

        let protocol = req.headers['sec-websocket-protocol'];
        if (protocol) {
            protocol = protocol.trim().split(/ *, */)[0];
            if (protocol) {
                headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
            }
        }

        netSocket.write(headers.concat('\r\n').join('\r\n'));
        cb();
    }

    _handleEventSource(ctx, socket) {
        // 接收普通的AJAX的请求
        const { event, data } = ctx.request.body;
        ctx.status = 200;
        socket._emit(event, data);
    }

    _handleEShandShake(ctx, socket) {
        const eventStream = new EventStream();
        // 设置eventStream
        socket.setEventStream(eventStream);
        // 设置socket通信方式
        socket.setTransport('eventsource');
        // 握手成功后触发onConnection方法,TODO
        // 设置符合Event-Source要求的首部
        ctx.set({
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        });
        // 先发个消息过去，目的是触发前端的eventsource.onopen方法
        const data = JSON.stringify({ event: 'reply', data: "收到回复" })
        eventStream.push(`event:message\ndata:${data}\n\n`);
        // 将Stream赋给body,Koa底层会判断Stream类型并调用pipe方法流入response
        ctx.body = eventStream;
        ctx.status = 200;
        this.emit('connect', socket);
    }

    async _handlePolling(ctx, socket, isConnection) {
        socket.setTransport('polling');
        if (isConnection) {
            // 首次连接
            this.emit('connect', socket);
            ctx.status = 200;
        } else {
            // 先等一段时间再返回处理结果，避免频繁请求消耗资源
            await sleep();
            // 非首次连接,并默认请求是成功的
            ctx.status = 200;
            // 处理发送信息到客户端的逻辑
            if (socket.toSendMes.length > 0) {
                ctx.body = socket.toSendMes;
                // 清空已发消息
                socket.toSendMes = [];
            }
            // 处理从客户端接收消息的逻辑
            const { event, data } = ctx.request.body;
            if (!event || !data) {
                return;
            }
            socket._emit(event, data);
        }
    }

    async _loadStatic(ctx, next) {
        let pathname = ctx.path;
        let data = null;
        let targetPath = null;
        if (pathname === '/') {
            pathname = '/main.html'
        }
        targetPath = `../client${pathname}`;
        if (fs.existsSync(targetPath)) {
            data = fs.readFileSync(targetPath);
            ctx.body = data.toString();
            ctx.status = 200;
        } else {
            await next();
        }
    }
}
module.exports = Server;