// cast-chat
// main.js

var fs                  = require('fs');
var url                 = require('url');
var mmdbreader          = require('maxmind-db-reader');
var WebSocketServer     = require('websocket').server;

var port                = process.env.PORT || 3000;
var local               = process.env.PORT ? false : true;
var mixLocation         = process.env.PORT ? "heroku" : "localhost";
var instanceName        = mixLocation + "-chat-" + uniqueToken(3);

///////////////////////////////
//      process stuff
///////////////////////////////

process.on('SIGTERM', function() {
  console.log('shutdown: sigterm received – shutting down');
  app.close(function(){
    console.log('shutdown: http server shut down successfully');
    wss.shutDown();
    console.log('shutdown: websocket server shut down successfully');
    process.exit(0);
  });
});

///////////////////////////////
//        http server
///////////////////////////////

var app = require('http').createServer(function(request, response) {
    if (request.url === '/ping'){
        response.end('pong');
    } else {
        response.writeHead(301, {
            "location" : "https://tinycast.audio/"
        });
        response.end();
    }
});

///////////////////////////////
//      websocket server
///////////////////////////////

var wss = new WebSocketServer({
    httpServer: app,
    autoAcceptConnections: false
}).on('request', onRequest);

var CHANNELS = { };

function onRequest(socket) {
    var origin = socket.origin + socket.resource;

    if (    socket.origin === 'https://127.0.0.1:3001' ||
            socket.origin === 'http://127.0.0.1:3000'  ||
            socket.origin === 'https://tinycast-frontend.herokuapp.com' ||
            socket.origin === 'https://tinycast.audio' ){

        ipDatabase.getGeoData(socket.remoteAddress, function (err, geodata){
            var countryCode = "";
            if (!err && geodata && geodata.country && geodata.country.iso_code){
                countryCode = geodata.country.iso_code;
            }

            var socketID = uniqueToken(3);

            console.log("socket-" + socketID + " accepted; ip=" + socket.remoteAddress + " (" + countryCode + "), origin=" + socket.origin + ", user-agent=" + socket.httpRequest.headers["user-agent"]);
            var websocket = socket.accept(null, origin);

            websocket.on('message', function(message) {
                if (message.type === 'utf8') {
                    onMessage(JSON.parse(message.utf8Data), websocket, socketID);
                } else {
                    console.log("socket-" + socketID + " error: message of type " + message.type + " rejected (utf8 only)");
                }
            });

            websocket.on('close', function() {
                console.log("socket-" + socketID + " closed; ip=" + socket.remoteAddress);
                truncateChannels(websocket);
            });
        });
    } else {
        var socketID = uniqueToken(3);
        console.log("socket-" + socketID + " rejected; ip=" + socket.remoteAddress + ", origin=" + socket.origin + ", user-agent=" + socket.httpRequest.headers["user-agent"]);
        socket.reject();
    }

}

function onMessage(message, websocket, socketID) {
    if (message.checkPresence)
        checkPresence(message, websocket);
    else if (message.open)
        onOpen(message, websocket);
    else
        sendMessage(message, websocket, socketID);
}

function onOpen(message, websocket) {
    var channel = CHANNELS[message.channel];

    if (channel)
        CHANNELS[message.channel][channel.length] = websocket;
    else
        CHANNELS[message.channel] = [websocket];
}

function sendMessage(message, websocket, socketID) {
    message.data = JSON.stringify(message.data);
    var channel = CHANNELS[message.channel];
    if (!channel) {
        console.error("socket-" + socketID + " error: no such channel exists");
        return;
    }

    for (var i = 0; i < channel.length; i++) {
        if (channel[i] && channel[i] != websocket) {
            try {
                channel[i].sendUTF(message.data);
            } catch(e) {
            }
        }
    }
}

function checkPresence(message, websocket) {
    websocket.sendUTF(JSON.stringify({
        isChannelPresent: !!CHANNELS[message.channel]
    }));
}

function swapArray(arr) {
    var swapped = [],
        length = arr.length;
    for (var i = 0; i < length; i++) {
        if (arr[i])
            swapped[swapped.length] = arr[i];
    }
    return swapped;
}

function truncateChannels(websocket) {
    for (var channel in CHANNELS) {
        var _channel = CHANNELS[channel];
        for (var i = 0; i < _channel.length; i++) {
            if (_channel[i] == websocket)
                delete _channel[i];
        }
        CHANNELS[channel] = swapArray(_channel);
        if (CHANNELS && CHANNELS[channel] && !CHANNELS[channel].length)
            delete CHANNELS[channel];
    }
}
app.listen(port);

console.log('');
console.log('tinycast-chat (' + instanceName + ') loaded on port ' + port);

/////////////////////
//    ip/geo db
/////////////////////

console.log("loading ip/geo database...");
var ipDatabase      = mmdbreader.openSync('./static/IPDatabase/GeoLite2-Country.mmdb');
console.log("ip/geo database loaded");

/////////////////////
// helpers/prototypes
/////////////////////

function uniqueToken(length) {
    var fullToken = (Math.random() * new Date().getTime()).toString(36).toUpperCase().replace(/\./g, '-');
    if (length === null){
        return fullToken;
    } else {
        var shortenedToken = fullToken.substring(0, length);
        return shortenedToken;
    }
}
