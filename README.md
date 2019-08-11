# simple-socket
simple-socket是我写的一个Web实时通信工具简单实现，在参考了相关源码和资料的基础上，实现了前后端实时互通的基本功能，
选用了WebSocket ->server-sent-event -> AJAX轮询这三种方式做降级兼容，分为simple-socket-client和simple-socket-server两套代码，
实现了最简化的API：
+ 前后端各自通过connect事件触发，获取各自的socket对象
+ 前端socket.emit('message', "data"); 服务端socket.on('message', function (data) { //... })接收
+ 服务端socket.emit('message', "data"); 服务端socket.on('message', function (data) { //... })接收

# NPM
```
npm i simple-socket-serve   （服务端npm包）
npm i simple-socket-client   (客户端npm包)
```
# Usage
```
// Client
var client = require('simple-socket-client');
var client = new Client();
client.on('connect', socket => {
    socket.on('reply', function (data) {
        console.log(data)
    })
    socket.emit('message', "pppppppp");
})
```

```
// Server
const SocketServer = require('simple-socket-serve');
const http = require('http');

const server = http.createServer(function (request, response) {
    // 你的其他代码~~
})

// Usage start
const ss = new SocketServer({
    httpSrv: server, // 需传入Server对象
});
ss.on('connect', socket => {
    socket.on('message', data => {
        console.log(data);
    });
    setTimeout(() => {
        socket.emit('reply', "aaaa");
    }, 3000);
});
// Usage end

server.listen(3000);
```

# Output
```
前端: 约3秒后输出aaaa
服务端端：输出pppppp
```
