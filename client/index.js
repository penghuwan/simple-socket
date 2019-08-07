var ee = require('event-emitter');
var emitter = ee();
var $ = require("jquery");

// readystate
var OPEN = 'OPEN';
var CLOSED = 'CLOSED';
// transport
var POLLING = 'polling';
var WEB_SOCKET = 'websocket';
var EVENT_SOURCE = 'eventsource';

const url = 'localhost:3000';

function Client(host) {
    this.host = host
    this.readyState = CLOSED;
    this.ws = null;
    this.es = null;
    this.ajax = null;
    init.call(this);
    listen.call(this);
}

function init() {
    if (window.WebSocket) {
        this.type = WEB_SOCKET;
        this.ws = new WebSocket(`ws://${url}`);
        this.ws.onopen = function () { this.readyState = OPEN }
        return;
    }
    if (window.EventSource) {
        this.type = EVENT_SOURCE;
        this.es = new EventSource(`http://${url}/eventsource?connection=true`)
        return;
    }

    this.type = POLLING;
    this.ajax = window.superagent;

    this.on = function (event, cb) {
        emitter.on(event, cb)
    }
}

function listen() {
    var self = this;
    switch (this.type) {
        case WEB_SOCKET:
            this.ws.onopen = function () {
                emitter.emit('connect', self);
            }
            this.ws.onmessage = function (payload) {
                var dataObj = null;
                try {
                    dataObj = JSON.parse(payload.data);
                } catch (error) {
                    // 倘若dataStr不为JSON结构的字符串，则
                    return;
                }
                var event = dataObj.event;
                var data = dataObj.data;
                if (!event || !data) return;
                emitter.emit(event, data);
            }
            break;
        case EVENT_SOURCE:
            this.es.onopen = function () {
                emitter.emit('connect', self);
            }
            this.es.addEventListener("message", function (e) {
                var payload = null;
                try {
                    payload = JSON.parse(e.data);;
                } catch (error) {
                    console.error('当前通信方式为event-source，且返回数据格式错误')
                    return;
                }
                var event = payload.event;
                var data = payload.data;
                emitter.emit(event, data);
            }, false);
            break;
        case POLLING:
            // 表示是否为首次连接
            let connection = true;
            (function setPolling() {
                $.ajax({
                    type: 'GET',
                    url: `/polling?connection=${connection}`,
                    success: function (dataArr) {
                        if (connection) {
                            emitter.emit('connect', self);
                            connection = false;
                        }
                        // 判断返回数据为数组才进行解析
                        if (dataArr instanceof Array) {
                            // 接收到的是事件对象组成的数组
                            dataArr.forEach(e => {
                                if (e.event && e.data) {
                                    emitter.emit(e.event, e.data);
                                }
                            });
                        }
                        setPolling();
                    },
                    error: function () {
                        setPolling();
                    }
                });
            })();
            break;
        default:
            break;
    }
}

var EventObj = {
    'websocket': {
        on: function (event, cb) {
            emitter.on(event, cb);
        },
        emit: function (event, data) {
            if (this.ws.readyState !== 1) return;
            this.ws.send(JSON.stringify({
                event: event,
                data: data
            }));
        }
    },
    'eventsource': {
        on: function (event, cb) {
            emitter.on(event, cb);
        },
        emit: function (event, data) {
            // 单纯的AJAX  (」゜ロ゜)」
            $.ajax({
                type: 'POST',
                url: `http://${url}/eventsource`,
                data: { event, data },
                success: function () {
                }
            });
        }
    },
    'polling': {
        on: function (event, cb) {
            emitter.on(event, cb);
        },
        emit: function (event,data) {
            // 单纯的AJAX  (」゜ロ゜)」
            $.ajax({
                type: 'POST',
                url: '/polling?connection=false',
                data: { event, data }
            });
        }
    }
}

// 这里的on和emit不是同一套的  (→_→)
Client.prototype.emit = function (event, data) {
    EventObj[this.type].emit.call(this, event, data);
}

Client.prototype.on = function (event, cb) {
    EventObj[this.type].on.call(this, event, cb);
}

module.exports = Client;
