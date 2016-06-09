var net = require('net');
var uuid = require('uuid');
var JSONStream = require('JSONStream');
var utils = require('./utils');

var defaults = {
  server: {
    host: '127.0.0.1',
    port: 9000
  },
  recvMessage: function(data) {
    console.log(data);
  },
  socketError: function(err) {
    console.error(err);
  }
};

function Client(options) {
  this.options = utils.extend(true, {}, defaults, options);
  this.connected = false;
  this.logged = false;
  this.sessionId = null;
  this.socket = null;
  this.stream = null;
  this.userId = null;
  this.username = '';
  this.connect_retries = 0;
  this.res_callbacks = {};
}

Client.prototype.setConfig = function(options) {
  this.options = utils.extend(true, this.options, options);
};

Client.prototype.connect = function(callback) {
  if(this.connected) {
    if(callback) {
      callback.call(this);
    }
    return false;
  }
  this.connect_retries++;
  var self = this;
  var stream = JSONStream.parse();
  var socket = net.createConnection(this.options.server.port, this.options.server.host, function() {
    self.connected = true;
    self.connect_retries = false;
    stream.on('data', function(data) {
      self.handle(data);
    });
    stream.on('error', function(err) {
      console.error('Parse Error: %s', err.message);
      socket.end();
    });
    socket.setKeepAlive(true);
    socket.pipe(stream);
    if(callback) {
      callback.call(this);
    }
  });
  socket.on('error', function(err) {
    if(self.options.socketError) {
      self.options.socketError.call(null, err);
    }
    if(callback) {
      try {
        callback.call(null, err);
      } catch(e) {}
    }
  });
  socket.on('close', function() {
    // self.userId = null;
    // self.username = '';
    // self.logged = false;
    self.connected = false;
  });

  this.socket = socket;
  this.stream = stream;
};

Client.prototype.reconnect = function(callback) {
  var self = this;
  if(this.socket) {
    this.socket.end(function() {
      self.socket = null;
      self.reconnect(callback);
    });
    return;
  }
  if(this.connecting) {
    clearTimeout(this.connecting);
  }
  this.connected = false;
  this.connect(function(error) {
    if(error) {
      if(self.connect_retries > 10) {
        if(callback) callback.call(null, null, {
          type: 'error',
          message: '多次重连服务器失败，请重新启动客户端'
        });
      } else {
        // if(callback) callback.call(null, null, {
        //   type: 'info',
        //   message: `第 ${self.connect_retries} 次尝试重连...`
        // });
        self.connecting = setTimeout(function() {
          self.reconnect(callback);
        }, 5000);
      }
      return;
    }
    self.request('reconnect', {
      sessionId: self.sessionId
    }, callback);
  });
};

Client.prototype.disconnect = function() {
  this.socket.end();
};

Client.prototype.addResCallback = function(uuid, callback) {
  this.res_callbacks[uuid] = callback;
};

Client.prototype.triggerResCallback = function(uuid) {
  var args = Array.prototype.slice.call(arguments, 1);
  if(this.res_callbacks[uuid]) {
    this.res_callbacks[uuid].apply(null, args);
  }
};

Client.prototype.removeResCallback = function(uuid) {
  if(this.res_callbacks[uuid]) {
    delete this.res_callbacks[uuid];
  }
};

Client.prototype.request = function(action, data, callback) {
  if(!data) {
    data = action;
  }
  var _data;
  if(utils.isPlainObject(data)) {
    _data = utils.extend({}, data, {
      action: action,
      userId: this.userId,
      uuid: uuid.v4()
    });
  } else {
    _data = data;
  }
  if(callback && _data && _data.uuid) {
    this.addResCallback(_data.uuid, callback);
  }
  this.socket.write(JSON.stringify(_data));
};

Client.prototype.handle = function(data) {
  if(utils.isPlainObject(data)) {
    if(data.hasOwnProperty('previous_uuid')) {
      this.triggerResCallback(data.previous_uuid, data);
      this.removeResCallback(data.previous_uuid);
      return;
    }
    if(!data.hasOwnProperty('action')) {
      return;
    }
    switch(data.action) {
      case 'sendmsg.personal':
      case 'sendmsg.group':
      case 'broadcast':
        this.options.recvMessage.call(null, data);
        break;
      default:
        console.error('Unknown action "%s"', data.action);
        break;
    }
  }
};

Client.prototype.echo = function(message, callback) {
  this.request('echo', {
    message: message
  }, callback);
};

Client.prototype.login = function(username, password, callback) {
  var self = this;
  if(this.userId) {
    if(callback) {
      callback.call(null, {
        ok: false,
        message: 'You have already logged in.'
      });
    }
    return false;
  }
  this.request('login', {
    username: username,
    password: password
  }, function(data) {
    if(data.ok) {
      self.userId = data.userId;
      self.sessionId = data.sessionId;
      self.username = username;
      self.logged = true;
    }
    if(callback) {
      callback.call(null, data);
    }
  });
};

Client.prototype.logout = function(callback) {
  var self = this;
  this.request('logout', {}, function(data) {
    if(data.ok) {
      self.userId = null;
      self.username = '';
      self.logged = false;
    }
    if(callback) {
      callback.call(null, data);
    }
  });
};

Client.prototype.sendPersonalMessage = function(to, message) {
  this.request('sendmsg.personal', {
    from: this.userId,
    to: to,
    message: message
  });
};

Client.prototype.sendGroupMessage = function(groupId, message) {
  this.request('sendmsg.group', {
    from: this.userId,
    groupId: groupId,
    message: message
  });
};

Client.prototype.joinGroup = function(groupId, callback) {
  this.request('group.join', {
    groupId: groupId
  }, callback);
};

Client.prototype.quitGroup = function(groupId, callback) {
  this.request('group.quit', {
    groupId: groupId
  }, callback);
};

Client.prototype.getGroupMembers = function(groupId, callback) {
  this.request('group.members', {
    groupId: groupId
  }, callback);
};

Client.prototype.getParticipatedGroups = function(callback) {
  this.request('group.participated', {}, callback);
};

Client.prototype.getOnlineUsers = function(callback) {
  this.request('online.users', {}, callback);
};

Client.prototype.getOnlineGroups = function(callback) {
  this.request('online.groups', {}, callback);
};

module.exports = Client;
