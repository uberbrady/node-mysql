#!/usr/local/bin/node
"use strict";

var util = require('util');
var sys=require('sys');

var child=require('child_process');
var username='root',dbname='brite_verify_development';

var conn = new require("../../index").createClient({user: username,database: dbname,timeout: 10,retry: 5});

conn.query("SELECT * FROM users WHERE 1=0",function (err,results,fields) {
    //we need to run this in this callback context otherwise the database won't have been connected-to
    sys.debug("Database connection is connected for sure ",err," results: ",results," Fields: ",fields);
    conn.query("SELECT * FROM users LIMIT 1",function (err,results,fields) {
        sys.debug("FIRST QUERY!!!! "+sys.inspect(err)+" "+sys.inspect(results)+" "+sys.inspect(fields));
    });
		conn.query("SELECT * FROM users WHERE 1=1 LIMIT 1000",function (err,results,fields) {
			sys.debug("Second Query.");
			conn.end();
		});
});
