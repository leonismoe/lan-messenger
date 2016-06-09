(function() {

  'use strict';

  var ipc = require('electron').ipcRenderer;
  var crypto = require('crypto');
  window.PNGlib = require('./assets/vendor/identicon.js/pnglib');
  window.Identicon = require('./assets/vendor/identicon.js/identicon');
  var notifications = new Notifications($('.notifications'));
  window.notifications = notifications;

  var active_users = new Set();
  var active_groups = new Set();
  var my_groups = new Set();
  var my = {};
  var msglogs = {
    personal: {},
    group: {}
  };
  var active_tab = {};

  window.addEventListener('error', function(e) {
    console.error(e.error);
    notifications.add(e.message, 'error', e.message);
  });

  ipc.on('MainProcessError', function(event, err) {
    if(err === undefined || err === null) {
      return;
    }
    err = err.error;
    console.error(err);
    if(!err.message) {
      err.message = err.code || err.errno || '';
    }
    if(err.message) {
      notifications.add(err.message, 'error', err.message);
    }
  });

  ipc.on('messenger', function(event, data) {
    if(!data) {
      return;
    }

    if(data.hasOwnProperty('action')) {
      switch(data.action) {
        case 'broadcast':
          handleBroadcast(data);
          break;
        case 'sendmsg.personal':
          handlePersonalMessage(data);
          break;
        case 'sendmsg.group':
          handleGroupMessage(data);
          break;
      }
    }
  });

  function toggleDevTools() {
    require('electron').remote.getCurrentWindow().toggleDevTools();
  }
  window.toggleDevTools = toggleDevTools;

  function handleBroadcast(data) {
    var message;
    switch(data.event) {
      case 'login':
        message = `用户 <strong>${data.username}</strong> 已上线`;
        active_users.add(data.userId);
        addToFriendList(data);
        break;
      case 'logout':
        message = `用户 <strong>${data.username}</strong> 已下线`;
        active_users.delete(data.userId);
        var $item = $(`.list-friends > li[data-id="${data.userId}"][data-isgroup=false]`);
        $item.find('.status').removeClass('on').addClass('off').text('离线');
        break;
      case 'reconnect':
        data.event += data.username;
        message = `用户 <strong>${data.username}</strong> 已重新连接`;
        active_users.add(data.userId);
        addToFriendList(data);
        break;
      default:
        message = data.message;
    }
    if(message) {
      notifications.add(data.event, 'info', message, 4000);
    }
  }

  function handlePersonalMessage(data) {
    data.time = moment(data.timestamp).format('YYYY-MM-DD HH:mm:ss');
    data.myself = data.from === my.userId;
    data.name = data.from;
    if(!msglogs.personal[data.from]) {
      msglogs.personal[data.from] = [];
    }
    msglogs.personal[data.from].push(data);
    if(active_tab.userId === data.from) {
      addMessage(data.time, data.from, data.message, data.myself);
    } else {
      var short = htmlspecialchars(data.message.length > 30 ? data.message.substr(0, 30) + '...' : data.message);
      var message = `您收到一条来自 <strong>${data.from}</strong> 的消息: ${short}`;
      notifications.add('personal-msg-from-' + data.from, 'info', message, 4000);
    }
  }

  function handleGroupMessage(data) {
    data.time = moment(data.timestamp).format('YYYY-MM-DD HH:mm:ss');
    data.myself = data.from === my.userId;
    data.name = data.from;
    if(!msglogs.group[data.groupId]) {
      msglogs.group[data.groupId] = [];
    }
    msglogs.group[data.groupId].push(data);
    if(active_tab.groupId === data.groupId) {
      addMessage(data.time, data.from, data.message, data.myself);
    }
  }

  ipc.on('callback.logout', function(event, data) {
  });

  ipc.on('callback.echo', function(event, data) {
  });

  ipc.on('callback.connection', function(event, data) {
    var message = data.message || '';
    var type = data.type || 'info';
    var ns = data.ns || '';
    if(data.lost) {
      type = 'error';
      ns = 'disconnected';
      message = '与服务器的连接已断开!';
    } else if(data.reconnected) {
      type = 'done';
      ns = 'reconnected';
      message = '已恢复与服务器的连接';
    }
    notifications.add('connection' + ns, type, message, 4000);
  });

  ipc.on('callback.sendmsg.personal', function(event, data) {
	  // TODO
  });

  ipc.on('callback.sendmsg.group', function(event, data) {
    // TODO
  });

  ipc.on('callback.group.join', function(event, data) {
    // TODO
  });

  ipc.on('callback.group.quit', function(event, data) {
    // TODO
  });

  ipc.on('callback.group.members', function(event, data) {
    // TODO
  });

  ipc.on('callback.group.participated', function(event, data) {
    // TODO
  });

  ipc.on('callback.online.users', function(event, data) {
    data.users.forEach(function(userId) {
      active_users.add(userId);
      addToFriendList({
        userId: userId
      });
    });
  });

  ipc.on('callback.online.groups', function(event, data) {
    data.groups.forEach(function(groupId) {
      active_groups.add(groupId);
      addToFriendList({
        groupId: groupId
      });
    });
  });

  ipc.on('callback.profile.my', function(event, data) {
    my = data;
    if(!active_tab.userId && !active_tab.groupId) {
      var $top = $('.chat > .top');
      $top.find('.name').text(data.userId);
      $top.find('img').attr('src', avatar_url(data.userId));
    }
  });

  ipc.send('messenger.online.users');
  ipc.send('messenger.online.groups');
  ipc.send('messenger.profile.my');

  var $messages = $('.messages');
  var $textbox = $('#texxt');
  var $usertpl = $('#template-user-list-item').html();
  var $msgtpl = $('#template-message').html();

  moment.locale('zh-CN');

  function resizeScroll() {
    var scrollTo = $messages.prop('scrollHeight') - $messages.height();
    if(scrollTo > 0) {
      $messages.getNiceScroll(0).resize();
      $messages.getNiceScroll(0).doScrollTop(scrollTo, 800);
    }
  }

  function sendMessage() {
    var innerText = $.trim($textbox.val());
    if(innerText == '') {
      return false;
    }

    var data = {
      from: my.userId,
      to: active_tab.userId,
      groupId: active_tab.groupId,
      name: my.userId,
      time: moment().format('YYYY-MM-DD HH:mm:ss'),
      timestamp: (new Date()).getTime(),
      message: innerText,
      myself: true
    }

    if(active_tab.groupId) {
      if(!msglogs.group[data.groupId]) {
        msglogs.group[data.groupId] = [];
      }
      msglogs.group[data.groupId].push(data);
      ipc.send('messenger.sendmsg.group', data.groupId, data.message);
    } else {
      if(!msglogs.personal[data.to]) {
        msglogs.personal[data.to] = [];
      }
      msglogs.personal[data.to].push(data);
      ipc.send('messenger.sendmsg.personal', data.to, data.message);
    }
    addMessage(data.time, data.from, data.message, true);
  }

  function parseMessage(time, name, message, myself) {
    var tpl = $msgtpl
      .replace(/{{who}}/, myself ? 'myself' : 'friend')
      .replace(/{{time}}/, htmlspecialchars(time))
      .replace(/{{name}}/, htmlspecialchars(name))
      .replace(/{{message}}/, htmlspecialchars(message));
    var $tpl = $(tpl);
    if(myself) {
      var $head = $tpl.find('.head');
      var $name = $head.find('.name');
      $name.remove().appendTo($head);
    }
    return $tpl;
  }

  function addMessage(time, name, message, myself) {
    var $count = $('.chat > .top .count');
    $count.attr('data-count', ($count.attr('data-count') | 0) + 1);
    $messages.append(parseMessage(time, name, message, myself));
    resizeScroll();
  }

  function addMultiMessages(messages) {
    var list = [];
    messages.forEach(function(message) {
      list.push(parseMessage(message.time, message.name, message.message, message.myself));
    });
    $messages.append(list);
    resizeScroll();
  }

  function activateTab(id, isGroup) {
    var $top = $('.chat > .top');
    $top.find('.name').text(id);
    if(isGroup) {
      if(active_tab.groupId == id) {
        return;
      }
      $messages.empty();
      if(msglogs.group[id]) {
        $top.find('.count').attr('data-count', msglogs.group[id].length);
        addMultiMessages(msglogs.group[id]);
      } else {
        $top.find('.count').attr('data-count', 0);
      }
      var avatar_url = $('.list-friends > li').removeClass('active')
        .filter(`[data-id="${id}"][data-isgroup=true]`).addClass('active')
        .find('img').attr('src');
      active_tab.groupId = id;
      active_tab.userId = null;
    } else {
      if(active_tab.userId == id) {
        return;
      }
      $messages.empty();
      if(msglogs.personal[id]) {
        $top.find('.count').attr('data-count', msglogs.personal[id].length);
        addMultiMessages(msglogs.personal[id]);
      } else {
        $top.find('.count').attr('data-count', 0);
      }
      var avatar_url = $('.list-friends > li').removeClass('active')
        .filter(`[data-id="${id}"][data-isgroup=false]`).addClass('active')
        .find('img').attr('src');
      active_tab.userId = id;
      active_tab.groupId = null;
    }
    $top.find('img').attr('src', avatar_url);
  }

  function addToFriendList(data) {
    if(data.groupId) {
      data.id = data.groupId;
      data.isGroup = true;
    } else {
      if(data.userId == my.userId) {
        return;
      }
      data.id = data.userId;
      data.isGroup = false;
    }
    var $item = $(`.list-friends > li[data-id="${data.id}"][data-isgroup=${data.isGroup}]`);
    if($item.length) {
      $item.find('.status').removeClass('off').addClass('on').text('在线');
      return;
    }
    var tpl = $usertpl
      .replace(/{{id}}/, data.id)
      .replace(/{{isGroup}}/, data.isGroup)
      .replace(/{{name}}/, data.id)
      .replace(/{{status}}/, 'on')
      .replace(/{{status_text}}/, '在线')
      .replace(/{{avatar_url}}/, avatar_url(data.id));
    $('.list-friends').append(tpl);
  }

  // http://locutus.io/php/strings/htmlspecialchars/
  function htmlspecialchars(string, quoteStyle, charset, doubleEncode) {
    var optTemp = 0;
    var i = 0;
    var noquotes = false;
    if(typeof quoteStyle === 'undefined' || quoteStyle === null) {
      quoteStyle = 2;
    }
    string = string || '';
    string = string.toString();

    if(doubleEncode !== false) {
      string = string.replace(/&/g, '&amp;');
    }

    string = string
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    var OPTS = {
      'ENT_NOQUOTES': 0,
      'ENT_HTML_QUOTE_SINGLE': 1,
      'ENT_HTML_QUOTE_DOUBLE': 2,
      'ENT_COMPAT': 2,
      'ENT_QUOTES': 3,
      'ENT_IGNORE': 4
    };
    if(quoteStyle === 0) {
      noquotes = true;
    }
    if(typeof quoteStyle !== 'number') {
      quoteStyle = [].concat(quoteStyle);
      for (i = 0; i < quoteStyle.length; i++) {
        if(OPTS[quoteStyle[i]] === 0) {
          noquotes = true;
        } else if(OPTS[quoteStyle[i]]) {
          optTemp = optTemp | OPTS[quoteStyle[i]];
        }
      }
      quoteStyle = optTemp;
    }
    if(quoteStyle & OPTS.ENT_HTML_QUOTE_SINGLE) {
      string = string.replace(/'/g, '&#039;');
    }
    if(!noquotes) {
      string = string.replace(/"/g, '&quot;');
    }

    return string;
  }

  function checksum(str, algorithm, encoding) {
    return crypto
      .createHash(algorithm || 'md5')
      .update(str, 'utf8')
      .digest(encoding || 'hex');
  }

  function md5(str) {
    return checksum(str);
  }

  function avatar_url(id) {
    var hash = md5(id);
    var data = new Identicon(hash).toString();
    return 'data:image/png;base64,' + data;
  }

  $('form.search').on('submit', function(e) {
    e.preventDefault();
  });

  $(document).ready(function() {
    $('.list-friends').niceScroll({
      cursorcolor: '#696c75',
      cursorwidth: '4px',
      cursorborder: 'none'
    });
    $messages.niceScroll({
      cursorcolor: '#cdd2d6',
      cursorwidth: '4px',
      cursorborder: 'none'
    });
    $textbox.on('keypress', function(e) {
      if(e.keyCode === 10 && e.ctrlKey) {
        sendMessage();
        $textbox.val('');
        return false;
      }
    });
    $('.send').on('click', function(e) {
      sendMessage();
      $textbox.val('');
      return false;
    });
    $('.list-friends').on('click', 'a', function(e) {
      e.preventDefault();
      var $item = $(this).closest('li');
      activateTab($item.data('id'), $item.data('isgroup'));
    });
  });

}).call(this);
