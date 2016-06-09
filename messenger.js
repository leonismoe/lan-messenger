var Server = require('./messenger-server');
var Client = require('./messenger-client');

module.exports = {
  server: {
    init: Server.init,
    handle: Server.handle,
    disconnect: Server.disconnect
  },
  client: Client
};
