"use strict";
var util = require('util');
var Socket = require('net').Socket;
var auth = require('./auth');
var constants = require('./constants');
var Parser = require('./parser');
var OutgoingPacket = require('./outgoing_packet');
var Query = require('./query');
var EventEmitter = require('events').EventEmitter;

function Client() {
  if (!(this instanceof Client) || arguments.length) {
    throw new Error('deprecated: use mysql.createClient() instead');
  }

  EventEmitter.call(this);

  this.host = 'localhost';
  this.port = 3306;
  this.user = 'root';
  this.password = null;
  this.database = '';

  this.typeCast = true;
  this.flags = Client.defaultFlags;
  this.maxPacketSize = 0x01000000;
  this.charsetNumber = constants.UTF8_UNICODE_CI;
  this.debug = false;
  this.ending = false;
  this.connected = false;

  this._greeting = null;
  this._socket = null;
  this._parser = null;
	this.timeout = 2147483647; //set in case you use Client directly

	this.current = null;
};
util.inherits(Client, EventEmitter);
module.exports = Client;

// Client.prototype.connect = function() {
//   throw new Error('deprecated: connect() is now done automatically.');
// };

Client.prototype.connect = function() {
	if(this.connected) {
		this.emit('error',new Error("already connected."));
		return this; //just for chaining
	}
	if(this._socket) {
		this.emit('error',new Error("Not connected yet, but connection request has already been queued."));
		return this; //just for chaining
	}
  var socket = this._socket = new Socket();
  var parser = this._parser = new Parser();
  var self = this;
	var current = function () {console.warn("I dunno. something. whatever.")};
  socket
    .on('error', this._connectionErrorHandler())
    .on('data', parser.write.bind(parser))
    .on('end', function() {
			console.warn("SOCKET IS ENDING. Value of 'current' is: ",self.current);
      if (self.ending) {
        // @todo destroy()?
        self.connected = false;
        self.ending = false;

        // if (self._queue.length) {
        //   self._connect();
        // }
				self.emit

        return;
      }
			if(this.current) {
				console.warn("Socket is ending WHILE a query is running!");
				self.emit('error',new Error("Socket closing"));
			}

      if (!self.connected) {
        this.emit('error', new Error('reconnection attempt failed before connection was fully set up'));
        return;
      }

      //self._connect();
    })
		.on('close',function(why) {
			console.warn("CLOSE IS HAPPENING: ",why," current is: ",this.current); 
			this.emit('error',new Error('socket is closing'));
			if(this.current) {
				this.current.delegate.emit('error',new Error("Socket is closing while running a query"));
				console.warn("AND we havea  current query!!!!");
			}
			self.connected=false;
			//self._socket=null; //is this necessary? This yanks the socket from existence - don't we want to ease it on out?
		})
		.on('timeout',function () {
			console.warn("Timed out connecting client");
			self.emit('error',new Error("Timed Out"));
		})
    .connect(this.port, this.host);

	socket.setTimeout(self.timeout*1000);
	socket.on('connect',function () {this.setTimeout(0); console.warn("Socket is connected - but you ain't.")});
	
	this.on('error',function (err) {
		console.log("Client got thrown an error:",err);
		if(this.current && this.current.delegate) {
			//there's a currently-running query; it needs to be aborted and have its callback invoked
			this.current.delegate.emit('error',err);
		}
		if(this.listeners('error').length<=1) {
			throw err; //otherwise, someone else is on top of this.
		}
	});

  parser.on('packet', function (packet) {
		console.log("=============== I GOTTED A PACKET: ",packet);
		console.log("Packet sqlstate is: ",packet.sqlState);
		//if packet from here is 'server is shutting down' then mark socket as bad, or mark disconnected?
		self._handlePacket.bind(self)(packet);
	});
	return this;
};

Client.prototype.query = function(sql, params, cb) {
	console.log("QUERY INVOKED FOR: ",sql);
  if (Array.isArray(params)) {
    sql = this.format(sql, params);
  } else {
    cb = arguments[1];
  }

  var query = new Query({
    typeCast: this.typeCast,
    sql: sql
  });
	console.warn("Query object created ok for query: ",sql);

  var self = this;
  if (cb) {
    var rows = [], fields = {};
    query
      .on('error', function(err) {
				console.log("ERROR - blanking current query.");
        self.current=null; //YES, GOOD, HERE!
        cb(err);
      })
      .on('field', function(field) {
        fields[field.name] = field;
      })
      .on('row', function(row) {
        rows.push(row);
      })
      .on('end', function(result) {
				console.log("CURRENT QUERY IS FINISHING - SETTING TO NULL");
				self.current=null; //YES, HERE!
        if (result) {
					console.warn("calling back with just result.");
          cb(null, result);
        } else {
					console.warn("calling back with rows and fields.");
          cb(null, rows, fields);
        }

      });
  } else {
    query
      .on('error', function(err) {
        if (query.listeners('error').length < 1) {
          self.emit('error', err);
        } else {
					query.emit('error',err);
				}
				console.log("Query errored without callback, current query is now null");
        self.current=null; //YES, VERIFIED
      })
      .on('end', function(result) {
				console.log("Query without callback finished, current query is now null");
				self.current=null; //YES, VERIFIED
				console.warn("End of query...whassat mean?");
      });
  }
	console.warn("Callbacks set correctly on query..maybe?");

  this._execute(function () {
		console.warn("We are being invoked within _execute for the query: ",sql);
    var packet = new OutgoingPacket(1 + Buffer.byteLength(sql, 'utf-8'));

    packet.writeNumber(1, constants.COM_QUERY);
    packet.write(sql, 'utf-8');
    if(!self.write(packet)) {
			//error while writing pakcet!
			console.warn("_execute says it cannot write to socket.");
			//self._socket.destroy(); //should this be 'destroy'?
			//self._socket=null;
			self.connected=false; //must not be connected if the socket ain't writable.
			//DONT hose the socket....in case that somehow we can write to null sockets? That seems odd. Whatever.
			console.warn("COULD NOT WRITE TO SOCKET!!!!!!!!!!!");
			query.emit('error',new Error("Could not write to socket for query"));
			self.emit('error',new Error("Could not write to socket, connection is bad?"));
		} else {
			console.warn("Got no problem writing to your socket for query: ",sql);
		}
  }, query);

  return query;
};

Client.prototype.busy =function () {
	console.warn("NOT Current: ",!this.current," Is it connected?: ",this.connected);
	console.warn("THUS MAKING: ",!this.current && this.connected);
	return(this.current || !this.connected);
};

Client.prototype.write = function(packet) {
  if (this.debug) {
    console.log('-> %s', packet.buffer.inspect());
  }
	//console.log("Stuff about the socket? ",this._socket);
	if(!this._socket.writable) {
		//this.emit('error',new Error("Socket not writable"));
		//this.emit('error',new Error("Socket not writable"));
		//we don't emit at *this* level because we want the query to 'emit' instead
		return 0;
	} else {
  	this._socket.write(packet.buffer,function () {console.log("I wroted it!",arguments);});
		return 1;
	}
};

Client.prototype.format = function(sql, params) {
  var escape = this.escape;
  params = params.concat();

  sql = sql.replace(/\?/g, function() {
    if (params.length == 0) {
      throw new Error('too few parameters given');
    }

    return escape(params.shift());
  });

  if (params.length) {
    throw new Error('too many parameters given');
  }

  return sql;
};

Client.prototype.escape = function(val) {
  if (val === undefined || val === null) {
    return 'NULL';
  }

  switch (typeof val) {
    case 'boolean': return (val) ? 'true' : 'false';
    case 'number': return val+'';
  }

  if (typeof val === 'object') {
    val = (typeof val.toISOString === 'function')
      ? val.toISOString()
      : val.toString();
  }

  val = val.replace(/[\0\n\r\b\t\\\'\"\x1a]/g, function(s) {
    switch(s) {
      case "\0": return "\\0";
      case "\n": return "\\n";
      case "\r": return "\\r";
      case "\b": return "\\b";
      case "\t": return "\\t";
      case "\x1a": return "\\Z";
      default: return "\\"+s;
    }
  });
  return "'"+val+"'";
};

Client.prototype.ping = function(cb) {
  var self = this;
  this._execute(function ping() {
    var packet = new OutgoingPacket(1);
    packet.writeNumber(1, constants.COM_PING);
    self.write(packet);
  }, cb);
};

Client.prototype.statistics = function(cb) {
  var self = this;
  this._execute(function statistics() {
    var packet = new OutgoingPacket(1);
    packet.writeNumber(1, constants.COM_STATISTICS);
    self.write(packet);
  }, cb);
};

Client.prototype.useDatabase = function(database, cb) {
  var self = this;
  this._execute(function useDatabase() {
    var packet = new OutgoingPacket(1 + Buffer.byteLength(database, 'utf-8'));
    packet.writeNumber(1, constants.COM_INIT_DB);
    packet.write(database, 'utf-8');
    self.write(packet);
  }, cb);
};

Client.prototype.destroy = function() {
  if (this._socket) {
    this._socket.destroy();
  }

  this._socket = null;
  this._parser = null;
  this.connected = false;
}

Client.prototype.end = function(cb) {
  var self = this;

  this.ending = true;

  this._execute(function end() {
    var packet = new OutgoingPacket(1);
    packet.writeNumber(1, constants.COM_QUIT);
    self.write(packet);

    // @todo handle clean shut down properly
    if (cb) {
      self._socket.on('end', cb);
    }

    //self._dequeue();
  }, cb);
};

Client.prototype._execute = function(fn,delegate) {
	
	if(!this._socket || !this.connected) {
		console.warn("Found a socket to be not yet connected within _execute - this is ODD");
		if(delegate) {
			delegate.emit('error',new Error("Socket Not Connected"));
		} else {
			this.emit('error',new Error("Socket Not Connected"));
		}
		return;
	}
	if(this.current) {
		if(delegate) {
			delegate.emit('error',new Error("Connection is already busy"));
		} else {
			this.emit('error',new Error("Connection is already busy. running: "+util.inspect(this.current)));
		}
		return;
	}
	this.current={fn: fn, delegate: delegate};
	fn();
}
/*Client.prototype._enqueue = function(fn, delegate) {
  if (!this._socket) {
    this._connect();
  }

  this._queue.push({fn: fn, delegate: delegate});
  if (this._queue.length === 1 && this.connected) {
    fn();
  }
};

Client.prototype._dequeue = function() {
  this._queue.shift();

  if (!this._queue.length) {
    return;
  }

  if (!this.connected) {
    this._connect();
    return;
  }

  this._queue[0].fn();
};
*/

Client.prototype._handlePacket = function(packet) {
  if (this.debug) {
    this._debugPacket(packet);
  }

  if (packet.type == Parser.GREETING_PACKET) {
    this._sendAuth(packet);
    return;
  }

  if (packet.type == Parser.USE_OLD_PASSWORD_PROTOCOL_PACKET) {
    this._sendOldAuth(this._greeting);
    return;
  }

  if (!this.connected) {
    if (packet.type != Parser.ERROR_PACKET) { //should this be == Parser.OK_PACKET ?
      this.connected = true;
			console.log("Connection is completing, setting current query to null");
			this.current=null;//and we're finished connecting, too //VETTED - yes, current is FALSE

      //if (this._queue.length) this._queue[0].fn();
			this.emit('connected');
      return;
    }

    this._connectionErrorHandler()(Client._packetToUserObject(packet));
    return;
  }
	
  // @TODO Simplify the code below and above as well
  var type = packet.type;
  var delegate = (this.current)
        ? this.current.delegate
        : null;

  if (delegate instanceof Query) {
		console.log("Delegating packet what thing what? sqlState: ",packet.sqlState);
    delegate._handlePacket(packet);
    return;
  }

  if (type != Parser.ERROR_PACKET) {
    //this.connected = true; //why do I do this twice?
    if (delegate) {
      delegate(null, Client._packetToUserObject(packet));
    }
  } else {
		console.warn("ERROR PACKET OUTSIDE OF CONTEXT OF AUTHENTICATION - _handlePacket: ",packet);
		if(packet.sqlState='08S01') {
			console.warn("------------------------- SERVER SHUTTING DOWN!!!!!!!!!!");
			
		}
    packet = Client._packetToUserObject(packet);
    if (delegate) {
      delegate(packet);
    } else {
      this.emit('error', packet);
    }
  }
};

Client.prototype._connectionErrorHandler = function() {
  return function(err) {
		console.warn("_connectionErrorHandler INVOKE");
    this.destroy();

    var delegate = (this.current)
      ? this.current.delegate
      : null;

    if (delegate instanceof Query) {
      delegate.emit('error', err);
      return;
    }

    if (!delegate) {
      this.emit('error', err);
    } else {
      delegate(err);
      //this.current=null; //I guess we're done - why deal with this queue business?
    }
  }.bind(this);
};

Client.prototype._sendAuth = function(greeting) {
  var token = auth.token(this.password, greeting.scrambleBuffer);
  var packetSize = (
    4 + 4 + 1 + 23 +
    this.user.length + 1 +
    token.length + 1 +
    this.database.length + 1
  );
  var packet = new OutgoingPacket(packetSize, greeting.number+1);

  packet.writeNumber(4, this.flags);
  packet.writeNumber(4, this.maxPacketSize);
  packet.writeNumber(1, this.charsetNumber);
  packet.writeFiller(23);
  packet.writeNullTerminated(this.user);
  packet.writeLengthCoded(token);
  packet.writeNullTerminated(this.database);

  this.write(packet);

  // Keep a reference to the greeting packet. We might receive a
  // USE_OLD_PASSWORD_PROTOCOL_PACKET as a response, in which case we will need
  // the greeting packet again. See _sendOldAuth()
  this._greeting = greeting;
};

Client._packetToUserObject = function(packet) {
  var userObject = (packet.type == Parser.ERROR_PACKET)
    ? new Error()
    : {};

  for (var key in packet) {
    var newKey = key;
    if (key == 'type' || key == 'number' || key == 'length' || key == 'received') {
      continue;
    }

    if (key == 'errorMessage') {
      newKey = 'message';
    } else if (key == 'errorNumber') {
      newKey = 'number';
    }

    userObject[newKey] = packet[key];
  }

  return userObject;
};

Client.prototype._debugPacket = function(packet) {
  var packetName = null;
  for (var key in Parser) {
    if (!key.match(/_PACKET$/)) {
      continue;
    }

    if (Parser[key] == packet.type) {
      packetName = key;
      break;
    }
  }
  console.log('<- %s: %j', packetName, packet);
};

Client.prototype._sendOldAuth = function(greeting) {
  var token = auth.scramble323(greeting.scrambleBuffer, this.password);
  var packetSize = (
    token.length + 1
  );
  var packet = new OutgoingPacket(packetSize, greeting.number+3);

  // I could not find any official documentation for this, but from sniffing
  // the mysql command line client, I think this is the right way to send the
  // scrambled token after receiving the USE_OLD_PASSWORD_PROTOCOL_PACKET.
  packet.write(token);
  packet.writeFiller(1);

  this.write(packet);
};

Client.defaultFlags =
    constants.CLIENT_LONG_PASSWORD
  | constants.CLIENT_FOUND_ROWS
  | constants.CLIENT_LONG_FLAG
  | constants.CLIENT_CONNECT_WITH_DB
  | constants.CLIENT_ODBC
  | constants.CLIENT_LOCAL_FILES
  | constants.CLIENT_IGNORE_SPACE
  | constants.CLIENT_PROTOCOL_41
  | constants.CLIENT_INTERACTIVE
  | constants.CLIENT_IGNORE_SIGPIPE
  | constants.CLIENT_TRANSACTIONS
  | constants.CLIENT_RESERVED
  | constants.CLIENT_SECURE_CONNECTION
  | constants.CLIENT_MULTI_STATEMENTS
  | constants.CLIENT_MULTI_RESULTS;
