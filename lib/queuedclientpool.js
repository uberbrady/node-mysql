"use strict";
var EventEmitter = require('events').EventEmitter;
var hashish = require('hashish');
var Client = require('./client');
var constants = require('./constants');
var util=require('util');

function QueuedClientPool(config) {
	if(!config.queuelength) {
		this.maxqueue=2147483647;
	} else {
		this.maxqueue=config.maxqueue;
	}
	if(!config.numconns) {
		this.numconns=1;
	} else {
		this.numconns=config.numconns;
	}
	if(!config.timeout) {
		this.timeout=2147483647;
	} else {
		this.timeout=config.timeout;
	}
	if(!config.retry) {
		config.retry=30;
	} else {
		this.retry=config.retry;
	}
	this.connections=[];
	this._queue=[];
	this.config=config;
	var i;
	for(i=0;i<this.numconns;i++) {
		this.connect_forever(i);
	}
	process.on('exit',function() {console.log("WE ARE EXITING!")});
}
util.inherits(QueuedClientPool,EventEmitter);
module.exports = QueuedClientPool;

QueuedClientPool.prototype.connect = function() {
  throw new Error('deprecated: connect() is now done automatically.');
};

QueuedClientPool.prototype._runqueue = function()
{
	//invoked as a hint to try to run the queue
	//if the queue runs dry it should return very quickly
	//we need to try to make sure we don't starve out the queue
	var self=this;
	var connected=0;
	var i;
	for(i=0;i<this.numconns;i++) {
		if(this._queue.length==0) {
			if(this.closing) {
				console.log("QUEUE IS DRY, AND WE ARE CLOSING!");
				for(i=0;i<this.numconns;i++) {
					this.connections[i].end(function() {console.log("yeah, you ended.");});
				}
			}
			return;
		}
		if(!this.connections[i]) {
			console.warn("Connection ",i," is not yet defined.");
			continue;
		}
		if(this.connections[i].connected) {
			connected++;
		}
		if(!this.connections[i].busy()) {
			//we found an idle connection to use for query!
			var queue_elem=this._queue.shift();
			console.warn("QUEUE ELEM IS: ",queue_elem);
			this.connections[i].query(queue_elem.sql,function (result,rows,fields) {
				clearTimeout(queue_elem.timeout);
				//a query will have completed, try to re-run the queue *before* you invoke the query's callback - to avoid starving the queue
				self._runqueue(); //yes, this is semi-recursive - but set in the future - after the query has actually returned
				//BEFORE you run the callback...so we don't have connection-monopolization (need to try to run the queue as close as possible to FIFO)
				//run this nextTick to avoid queue starvation?
				queue_elem.callback(result,rows,fields);
			});
		}
	}
	if(this._queue) {
		console.warn("_runqueue finished, and the _queue is *not* empty: ",this._queue.length);
	}
	console.warn("And there are ",connected," connections that are connected.");
}

QueuedClientPool.prototype.connect_forever = function (index)
{
	var self=this;
	console.warn("RECONNECT called for: ",index);
	this.connections[index]=new Client();
	hashish.update(this.connections[index],self.config || {});
	console.warn("RECONNECT - setting timeout to ",self.timeout);
	var reconnection=function () {
		console.warn("reconnection scriptlet invoked.");
//		self.connections[index].end(); //we wouldn't be reconnecting unless we were connected or nearly connected before
		self.connect_forever(index)
	};
	var conntimeout=setTimeout(function() {
		console.warn("RECONNECT - Connection: ",index," has timed out and not emitted 'connect'. Retrying for next tick");
		clearTimeout(conntimeout);
		//we've *already* waited the self.retry amount, so retry *now*
		process.nextTick(reconnection);
	},self.retry*1000);
	
	this.connections[index].on('error',function() {
		console.warn("RECONNECT - Connection: ",index," has emitted an error. Setting up for retry in ",self.retry*1000," seconds");
		clearTimeout(conntimeout); //just in case it happened before the timeout fired, or while it was still valid
		//instead of nextTick, should htis be setTimeout with 'self.retry' as the timeout?
		setTimeout(reconnection,self.retry*1000);
	});
	this.connections[index].on('connected',function () {
		console.warn("RECONNECT - Connection: ",index," has CONNECTED!!!!");
		clearTimeout(conntimeout);
		self._runqueue();
	});
	this.connections[index].connect();
};

QueuedClientPool.prototype.query=function (sql,callback) {
	var i;
	var to=setTimeout(function () { //the clock starts ticking NOW
		callback(new Error('timeout'));
	},this.timeout*1000);
	if(this._queue.length >= this.maxqueue) {
		this.emit('overflow'); //sure? Why not?
		callback(new Error("Query Queue Overflow"),null,null);
	} else {
		this._queue.push({sql: sql,callback: callback, timeout: to});
	}
	//try to run what's in the queue, de-queuing the first element
	this._runqueue();
}

QueuedClientPool.prototype.end=function(cb) {
	console.log("Better close eventually!");
	this.closing=true;
	this._runqueue();
};
