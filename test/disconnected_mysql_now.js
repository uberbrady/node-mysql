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
    console.warn("Database connection is connected for sure");
    var shut=require('child_process').spawn("/usr/local/mysql/bin/mysqladmin",["-u", username, "shutdown"]);
    shut.on('exit',function() {
        console.warn("I have correctly shut down the database");
				console.warn("Here's information about the second *right* after having shut down MySQL: ",conn._socket);
        conn.query("SELECT * FROM users LIMIT 1",function (err,results,fields) {
            console.warn("THIS WILL NEVER GET CALLED!!!!! "+sys.inspect(err)+" "+sys.inspect(results)+" "+sys.inspect(fields));
						conn.query("SELECT * FROM users WHERE 1=1 LIMIT 1000",function (err,results,fields) {
							console.warn("Neither will this get called.");
						});
        });
    });
	});
});

