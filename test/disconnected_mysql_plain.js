#!/usr/local/bin/node
"use strict";

var util = require('util');
var sys=require('sys');

var username='root',dbname='brite_verify_development';

var conn = new require("../index").createClient({user: username,database: dbname});


conn.connect().on('connected',function () {
	console.warn("CONNECTED!!!!!!!!!!!!");
	conn.query("SELECT * FROM users WHERE 1=0",function (err,results,fields) {
   //we need to run this in this callback context otherwise the database won't have been connected-to
   sys.debug("Database connection is connected for sure");
   conn.query("SELECT * FROM users LIMIT 1",function (err,results,fields) {
       sys.debug("THIS WILL NEVER GET CALLED!!!!! "+sys.inspect(err)+" "+sys.inspect(results)+" "+sys.inspect(fields));
			 conn.query("SELECT * FROM users WHERE 1=1 LIMIT 10",function (err,results,fields) {
				sys.debug("Here are the results:"+sys.inspect(arguments));
				sys.debug("Neither will this get called.");
				conn.end();
			});
		});
	});
});

