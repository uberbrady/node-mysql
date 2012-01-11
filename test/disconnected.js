#!/usr/local/bin/node
"use strict";

var util = require('util');
var sys=require('sys');

var username='root',dbname='dev_brite_verify';

var conn = new require("../index").createClient({user: username,database: dbname});

conn.query("SELECT * FROM users WHERE 1=0",function (err,results,fields) {
    //we need to run this in this callback context otherwise the database won't have been connected-to
    sys.debug("Database connection is connected for sure");
    var shut=require('child_process').spawn("/usr/local/mysql/bin/mysqladmin",["-u", username, "shutdown"]);
    shut.on('exit',function() {
        sys.debug("I have correctly shut down the database");
        conn.query("SELECT * FROM users LIMIT 1",function (err,results,fields) {
            sys.debug("THIS WILL NEVER GET CALLED!!!!! "+sys.inspect(err)+" "+sys.inspect(results)+" "+sys.inspect(fields));
        });
				conn.query("SELECT * FROM users WHERE 1=1 LIMIT 1000",function (err,results,fields) {
					sys.debug("Neither will this get called.");
				});
    });
});