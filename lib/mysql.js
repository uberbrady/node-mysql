var mysql = exports;
var hashish = require('hashish');
exports.Client = require('./client');
var qcp = require('./queuedclientpool');
var constants = require('./constants');
var fs = require('fs');

mysql.PACKAGE = (function() {
  var json = fs.readFileSync(__dirname + '/../package.json', 'utf8');
  return JSON.parse(json);
})();

mysql.createClient = function(config) {
  var client = new qcp(config);
  //hashish.update(client, config || {});
  return client;
};

hashish.update(exports, constants);
