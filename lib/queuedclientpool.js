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
	this.connections=[];
	var i;
	for(i=0;i<this.numconns;i++) {
		this.connections[i]=new Client();
		hashish.update(this.connections[i],config || {});
		this.connections[i].on('connected',this._runqueue);
	}
	this._queue=[];
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
			return;
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
				self._runqueue();
				//BEFORE you run the callback...so we don't have connection-monopolization (need to try to run the queue as close as possible to FIFO)
				//run this nextTick to avoid queue starvation?
				queue_elem.callback(result,rows,fields);
			});
		}
	}
	console.warn("_runqueue finished, and the _queue is *not* empty: ",this._queue.length);
	console.warn("And there are ",connected," connections that are connected.");
}

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

