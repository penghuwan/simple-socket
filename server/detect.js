var url = require('url');
module.exports = {
    // 判断请求的浏览器是否选择了websocket进行通信
    isWebSocket(req) {
        var connection = req.headers.connection || '';
        var upgrade = req.headers.upgrade || '';
        return connection.toLowerCase().indexOf('upgrade') >= 0 &&
            upgrade.toLowerCase() === 'websocket';
    },
    // 判断请求的浏览器是否选择了event-source（SSE）进行通信
    isEventSource(req) {
        var pathname = url.parse(req.url).pathname;
        return pathname === '/eventsource';
    },
    // 判断请求的浏览器是否选择了AJAX轮询进行通信
    isPolling(req) {
        var pathname = url.parse(req.url).pathname;
        return pathname === '/polling';
    },

    isConnection(req) {
        var query = url.parse(req.url, true).query || {};
        return query.connection == 'true';
    }
}