var uuid = require('uuid');
var utils = require('./utils');

var Server = {};

Server.sockets = {};
Server.users = {};
Server.groups = {};

Server.init = function(config) {
  Server.sockets = config.sockets;
};

Server.handle = function(socket, data) {
  if(!data.hasOwnProperty('action')) {
    return;
  }
  var socketId = socket.socketId;
  if(socketId !== undefined && Server.sockets[socketId] === undefined) {
    Server.sockets[socketId] = socket;
  }

  try {
    switch(data.action) {
      case 'echo':
        Server.send(socketId, data.message, data);
        return;
      case 'reconnect':
        Server.send(socketId, Server.login(socketId, data.userId, data.sessionId, true), data);
        return;
      case 'login':
        if(data.userId && Server.users[data.userId] !== undefined) {
          Server.send(socketId, `You have already logged as identity "${data.userId}"`, data);
          return;
        }
        Server.send(socketId, Server.login(socketId, data.username, data.password), data);
        return;
      case 'logout':
        Server.send(socketId, Server.logout(data.userId), data);
        return;
    }

    if(!data.userId) {
      Server.send(socketId, 'Please login first.', data);
      return;
    }
    switch(data.action) {
      case 'sendmsg.personal':
        data.timestamp = (new Date()).getTime();
        if(Server.users[data.to] !== undefined) {
          Server.send(Server.users[data.to], data);
        }
        break;
      case 'sendmsg.group':
        data.timestamp = (new Date()).getTime();
        Server.group.broadcast(data.groupId, data);
        break;
      case 'group.join':
        Server.send(socketId, Server.group.join(data.userId, data.groupId), data);
        break;
      case 'group.quit':
        Server.send(socketId, Server.group.quit(data.userId, data.groupId), data);
        break;
      case 'group.members':
        Server.send(socketId, Server.group.members(data.groupId), data);
        break;
      case 'group.participated':
        var groups = [];
        Server.groups.forEach(function(groupId, members) {
          if(members.indexOf(data.userId) > -1) {
            groups.push(groupId);
          }
        });
        Server.send(socketId, {
          groups: groups
        }, data);
        break;
      case 'online.users':
        Server.send(socketId, {
          users: Object.keys(Server.users)
        }, data);
        break;
      case 'online.groups':
        Server.send(socketId, {
          groups: Object.keys(Server.groups)
        }, data);
        break;
      default:
        throw new Error(`Unknown action "${data.action}"`);
    }
  } catch(e) {
    return socket.emit('error', e);
  }
};

Server.pre_process_data = function(data, previous_data) {
  var _data = data;
  if(typeof data == 'boolean') {
    _data = {
      ok: data,
      message: ''
    };
  } else if(typeof data == 'string') {
    _data = {
      ok: false,
      message: data
    };
  } else if(data instanceof Error) {
    _data = {
      ok: false,
      message: data.message
    };
  }
  if(utils.isPlainObject(_data)) {
    _data.uuid = uuid.v4();
    if(previous_data && previous_data.uuid) {
      _data.previous_uuid = previous_data.uuid;
    }
  }
  return JSON.stringify(_data);
};

Server.send = function(socketIds, data, previous_data) {
  if(typeof socketIds == 'number') {
    socketIds = [socketIds];
  }

  var _data = Server.pre_process_data(data, previous_data);
  console.info('\n< Data sent to those clients: %s\n%s', socketIds, _data);
  socketIds.forEach(function(socketId) {
    if(Server.sockets[socketId] !== undefined) {
      Server.sockets[socketId].write(_data);
    }
  });
};

Server.broadcast = function(data) {
  var _data = Server.pre_process_data(data);
  console.log('\n< Broadcast:\n%s', _data);
  for(var socketId in Server.sockets) {
    Server.sockets[socketId].write(_data);
  }
};

Server.group = {};
Server.group.join = function(userId, groupId) {
  if(!Server.groups[groupId] !== undefined) {
    Server.groups[groupId] = [];
  }
  Server.groups[groupId].push(userId);
  return true;
};

Server.group.quit = function(userId, groupId) {
  if(Server.groups[groupId] !== undefined) {
    var index = Server.groups[groupId].indexOf(userId);
    if(index > -1) {
      Server.groups[groupId].splice(index, 1);
      if(!Server.groups[groupId].length) {
        delete Server.groups[groupId];
      }
      return true;
    }
  }
  return false;
};

Server.group.members = function(groupId) {
  if(Server.groups[groupId] !== undefined) {
    return {
      groupId: groupId,
      members: Server.groups[groupId]
    };
  }
  return false;
}

Server.group.broadcast = function(groupId, data) {
  if(Server.groups[groupId] !== undefined) {
    var socketids = [];
    Server.groups[groupId].forEach(function(userId) {
      if(Server.users[userId] !== undefined) {
        socketids.push(Server.users[userId]);
      }
    });
    Server.send(socketids, data);
  }
};

Server.login = function(socketId, username, password, reconnect) {
  if(reconnect && !username) {
    return {
      ok: true
    };
  }
  if(Server.users[username] !== undefined && Server.sockets[socketId] !== undefined) {
    return new Error(`User "${username}" is currently online!`);
  }
  Server.users[username] = socketId;
  Server.broadcast({
    action: 'broadcast',
    event: reconnect ? 'reconnect' : 'login',
    timestamp: (new Date()).getTime(),
    userId: username,
    username: username,
    message: `User "${username}" connected.`
  });
  return {
    ok: true,
    userId: username,
    sessionId: socketId,
    username: username,
    nickname: username
  };
};

Server.disconnect = function(socketId) {
  if(Server.sockets[socketId] !== undefined) {
    Server.sockets[socketId].end();
    delete Server.sockets[socketId];
  }
  Object.keys(Server.users).forEach(function(userId) {
    var sockid = Server.users[userId];
    if(socketId == sockid) {
      Server.logout(userId);
    }
  });
};

Server.logout = function(userId) {
  if(Server.users[userId] !== undefined) {
    if(Server.sockets[Server.users[userId]] !== undefined) {
      Server.sockets[Server.users[userId]].end();
    }
    delete Server.users[userId];

    Server.broadcast({
      action: 'broadcast',
      event: 'logout',
      timestamp: (new Date()).getTime(),
      userId: userId,
      username: userId,
      message: `User "${userId}" disconnected.`
    });

    // Object.keys(Server.groups).forEach(function(groupId) {
    //   Server.group.quit(userId, groupId);
    // });
  }
  return true;
};

module.exports = Server;
