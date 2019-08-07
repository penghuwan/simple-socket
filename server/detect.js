var url = require('url');
module.exports = {
    isWebSocket(req) {
        var connection = req.headers.connection || '';
        var upgrade = req.headers.upgrade || '';
        return connection.toLowerCase().indexOf('upgrade') >= 0 &&
            upgrade.toLowerCase() === 'websocket';
    },

    isEventSource(req) {
        var pathname = url.parse(req.url).pathname;
        return pathname === '/eventsource';
    },

    isPolling(req) {
        var pathname = url.parse(req.url).pathname;
        return pathname === '/polling';
    },

    isConnection(req) {
        var query = url.parse(req.url, true).query || {};
        return query.connection == 'true';
    }
}