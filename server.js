var os = require('os');
var net = require('net');
var colors = require('colors');
var JSONStream = require('JSONStream');
var messenger = require('./messenger').server;

// Maintain a hash of all connected sockets
var sockets = {}, nextSocketId = 0;

messenger.init({
  sockets: sockets
});

var server = net.createServer(function(socket) {
  var client_addr = `${socket.remoteAddress}:${socket.remotePort}`;

  var stream = JSONStream.parse();
  stream.on('data', function(data) {
    console.info('\n> message received from %s, socket id %d\n%j', client_addr, socket.socketId, data);
    messenger.handle(socket, data);
  });
  stream.on('error', function(err) {
    console.error('Parse Error: %s'.red, err.message);
    socket.end();
  });

  socket.pipe(stream);
}).on('error', function(err) {
  console.error(`Caught Error: ${err.message}`);
});

server.on('connection', function(socket) {
  var client_addr = `${socket.remoteAddress}:${socket.remotePort}`;

  // Add a newly connected socket
  var socketId = nextSocketId++;
  socket.socketId = socketId;
  sockets[socketId] = socket;
  console.info('* client connected from %s, socket id %d'.yellow, client_addr, socketId);

  // Remove the socket when it closes
  socket.on('close', function(has_error) {
    console.info('* client disconnected from %s%s, socket id %d'.yellow, client_addr, has_error ? ' with error' : '', socketId);
    if(sockets[socketId] !== undefined) {
      delete sockets[socketId];
    }
    messenger.disconnect(socketId);
  });

  socket.on('error', function(err) {
    console.info('* an error occurred from %s, socket id %d\n%s'.magenta, client_addr, socketId, err.message);
  });

  socket.setKeepAlive(true);
});

server.listen(9000, '0.0.0.0', function() {
  var port = server.address().port;
  console.log('Server is listening at following addresses:');

  // Reference: http://stackoverflow.com/a/8440736/6166203
  var ifaces = os.networkInterfaces();
  Object.keys(ifaces).forEach(function(ifname) {
    var alias = 0;
    ifaces[ifname].forEach(function(iface) {
      if('IPv4' !== iface.family) {
        // skip non-ipv4 addresses
        return;
      }
      console.log('  %s:%d', iface.address, port);
      ++alias;
    });
  });
});
