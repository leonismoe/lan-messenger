var electron = require('electron');
var messenger = require('./messenger').client;

var APP_ROOT = `file://${__dirname}/app`;

var app = electron.app;
var ipc = electron.ipcMain;
var dialog = electron.dialog;
var BrowserWindow = electron.BrowserWindow;
var window = null;
var initialWnd = null;

var client = new messenger({
  recvMessage: function(data) {
    if(window) {
      window.webContents.send('messenger', data);
    }
  },
  socketError: function(err) {
    notifyError(err);
  }
});

process.on('uncaughtException', function(err) {
  notifyError(err);
});

function notifyError(err) {
  if(err === undefined || err === null) {
    return;
  }

  if(!err.hasOwnProperty('message')) {
    err.message = JSON.stringify(err);
  }
  if(!err.hasOwnProperty('stack')) {
    err.stack = '';
  }

  if(err.code == 'ECONNRESET') {
    if(window) {
      window.webContents.send('callback.connection', {
        lost: true
      });
    }
    client.reconnect(function(data, err) {
      if(window) {
        if(err) {
          window.webContents.send('callback.connection', err);
        } else {
          window.webContents.send('callback.connection', {
            reconnected: true
          });
        }
      }
    });
    return;
  }

  if(err.code == 'ECONNREFUSED') {
    if(window) {
      window.webContents.send('callback.connection', {
        type: 'error',
        message: '无法打开到主机的连接。连接失败',
        ns: 'refused'
      });
    }
    return;
  }

  if(window) {
    window.webContents.send('MainProcessError', {
      error: err
    });
  } else {
    dialog.showErrorBox('Error', `${err.message}\nStack:\n${err.stack}`);
  }
}

function createWindow() {
  window = new BrowserWindow({
    width: 800,
    height: 600,
    // frame: false
  });
  window.setMenu(null);
  // window.webContents.openDevTools();
  window.loadURL(`${APP_ROOT}/index.html`);
  window.on('closed', function() {
    window = null;
  });
  initialWnd.close();
}

function initMessenger(callback) {
  if(!client.configured) {
    initialWnd = new BrowserWindow({
      width: 450,
      height: 254,
      frame: false
    });
    initialWnd.on('closed', function() {
      initialWnd = null;
    });
    initialWnd.loadURL(`${APP_ROOT}/connection_settings.html`);
    initialWnd.show();
    if(callback && typeof callback == 'function') {
      callback.call(null);
    }
    return;
  }

  if(!client.connected) {
    client.connect(function(err) {
      if(err) {
        client.configured = false;
        if(callback && typeof callback == 'function') {
          callback.call(null, err);
        }
        return false;
      }
      initMessenger();
    });
    return;
  }

  if(!client.logged) {
    initialWnd.setSize(450, 313);
    initialWnd.loadURL(`${APP_ROOT}/login.html`);
    if(callback && typeof callback == 'function') {
      callback.call(null);
    }
    return;
  }

  createWindow();
}

app.on('ready', initMessenger);

app.on('window-all-closed', function() {
  if(process.platform !== 'darwin') {
    client.disconnect();
    app.quit();
  }
});

app.on('activate', function() {
  if(window === null) {
    initMessenger();
  }
});

ipc.on('messenger.set-connection-config', function(event, address) {
  var {host, port} = address.split(':');
  client.setConfig({
    server: {
      host: host,
      port: port
    }
  });
  client.configured = true;
  initMessenger(function(error) {
    if(error) {
      event.sender.send('messenger.response', '无法连接服务器:<br>' + error.message);
    }
  });
});

ipc.on('messenger.login', function(event, args) {
  client.login(args.username, args.password, function(data) {
    if(data.hasOwnProperty('ok') && !data.ok) {
      event.sender.send('messenger.response', data.message);
      return;
    }
    initMessenger();
  });
});

ipc.on('messenger.logout', function(event) {
  client.logout(function(data) {
    event.sender.send('callback.logout', data);
  });
});

ipc.on('messenger.echo', function(event, data) {
  client.echo(data, function(data) {
    event.sender.send('callback.echo', data);
  });
});

ipc.on('messenger.sendmsg.personal', function(event, to, message) {
  client.sendPersonalMessage(to, message);
});

ipc.on('messenger.sendmsg.group', function(event, groupId, message) {
  client.sendGroupMessage(groupId, message);
});

ipc.on('messenger.group.join', function(event, groupId) {
  client.joinGroup(groupId, function(data) {
    event.sender.send('callback.group.join', data);
  });
});

ipc.on('messenger.group.quit', function(event, groupId) {
  client.quitGroup(groupId, function(data) {
    event.sender.send('callback.group.quit', data);
  });
});

ipc.on('messenger.group.members', function(event, groupId) {
  client.getGroupMembers(groupId, function(data) {
    event.sender.send('callback.group.members', data);
  });
});

ipc.on('messenger.group.participated', function(event) {
  client.getParticipatedGroups(function(data) {
    event.sender.send('callback.group.participated', data);
  });
});

ipc.on('messenger.online.users', function(event) {
  client.getOnlineUsers(function(data) {
    event.sender.send('callback.online.users', data);
  });
});

ipc.on('messenger.online.groups', function(event) {
  client.getOnlineGroups(function(data) {
    event.sender.send('callback.online.groups', data);
  });
});

ipc.on('messenger.profile.my', function(event) {
  event.sender.send('callback.profile.my', {
    userId: client.userId,
    username: client.username,
    nickname: client.nickname
  });
});
