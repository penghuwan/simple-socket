const SocketServer = require('./server.js');
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
