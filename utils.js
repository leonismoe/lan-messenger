var slice = [].slice;
var class2type = {};

'Boolean Number String Function Array Date RegExp Object Error'.split(' ').forEach(function(name) {
  class2type[ '[object ' + name + ']' ] = name.toLowerCase();
});

var isArray = Array.isArray || function(object) {
  return object instanceof Array;
};

function type(obj) {
  return obj == null ? String(obj) : class2type[toString.call(obj)] || 'object';
}

function isFunction(value) {
  return type(value) == 'function';
}

function isObject(obj) {
  return type(obj) == 'object';
}

function isPlainObject(obj) {
  return isObject(obj) && Object.getPrototypeOf(obj) == Object.prototype;
}

function _extend(target, source, deep) {
  for(key in source) {
    if(deep && (isPlainObject(source[key]) || isArray(source[key]))) {
      if(isPlainObject(source[key]) && !isPlainObject(target[key])) {
        target[key] = {};
      }
      if(isArray(source[key]) && !isArray(target[key])) {
        target[key] = [];
      }
      _extend(target[key], source[key], deep);
    } else if(source[key] !== undefined) {
      target[key] = source[key];
    }
  }
}

function extend(target) {
  var deep, args = slice.call(arguments, 1)
  if(typeof target == 'boolean') {
    deep = target;
    target = args.shift();
  }
  args.forEach(function(arg) {
    _extend(target, arg, deep);
  });
  return target;
}

module.exports = {
  type: type,
  isFunction: isFunction,
  isObject: isObject,
  isPlainObject: isPlainObject,
  isArray: isArray,
  _extend: _extend,
  extend: extend
};
