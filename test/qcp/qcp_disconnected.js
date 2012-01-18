#!/usr/local/bin/node
"use strict";

var util = require('util');
var sys=require('sys');

var child=require('child_process');
var username='root',dbname='brite_verify_development';

var conn = new require("../../index").createClient({user: username,database: dbname,timeout: 120,retry: 5});

conn.query("SELECT * FROM users WHERE 1=0",function (err,results,fields) {
    //we need to run this in this callback context otherwise the database won't have been connected-to
    sys.debug("Database connection is connected for sure ",err," results: ",results," Fields: ",fields);
    var shut=child.spawn("/usr/local/mysql/bin/mysqladmin",["-u", username, "shutdown"]);
    shut.on('exit',function() {
        sys.debug("I have correctly shut down the database");
        conn.query("SELECT * FROM users LIMIT 1",function (err,results,fields) {
            sys.debug("THIS WILL NEVER GET CALLED!!!!! "+sys.inspect(err)+" "+sys.inspect(results)+" "+sys.inspect(fields));
        });
				conn.query("SELECT * FROM users WHERE 1=1 LIMIT 1000",function (err,results,fields) {
					sys.debug("Neither will this get called.");
				});
				conn.end(); //the queries are at least enqueued.
				var restart=child.exec("/usr/local/mysql/bin/mysqld --basedir=/usr/local/mysql --datadir=/usr/local/mysql/data --user=mysql --log-error=/usr/local/mysql/data/Bradys-MacBook-Pro.local.err --pid-file=/usr/local/mysql/data/Bradys-MacBook-Pro.local.pid &");
				restart.on('exit',function() {console.warn("I have finished spawning db")});
				// restart.stdout.on('data',function(data) {console.warn("stdout: "+data)});
				// restart.stderr.on('data',function(data) {console.warn("stderr: "+data)});
    });
});
