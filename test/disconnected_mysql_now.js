#!/usr/local/bin/node
"use strict";

var util = require('util');
var sys=require('sys');

var username='root',dbname='brite_verify_development';

var mysql=require("../index");

//var conn = new require("../index").createClient({user: username,database: dbname});
var conn = new mysql.Client();
conn.user= username;
conn.database= dbname;
conn.debug=false;
conn.on('error',function (err) {console.warn("***************************** HEY! We have an error. Bummer: ",err)});

conn.connect();


conn.connect().on('connected',function () { /* connect() *should* emit an error, because it was already called above */
	console.warn("CONNECTED!!!!!!!!!!!!");
	conn.query("SELECT fribdenfrotz FROM florgendorf WHERE 1=0",function (err,results,fields) {
    //we need to run this in this callback context otherwise the database won't have been connected-to
    console.warn("Database connection is connected for sure");
		console.warn("Results from garbage query is: ",err,results,fields);
    var shut=require('child_process').spawn("/usr/local/mysql/bin/mysqladmin",["-u", username, "shutdown"]);
    shut.on('exit',function() {
        console.warn("I have correctly shut down the database");
				//console.warn("Here's information about the second *right* after having shut down MySQL: ",conn._socket);
        conn.query("SELECT * FROM users LIMIT 1",function (err,results,fields) {
            console.warn("******************* THIS WILL NEVER GET CALLED!!!!! Err: "+sys.inspect(err)+" Results: "+sys.inspect(results)+" Fields: "+sys.inspect(fields));
						conn.query("SELECT * FROM users WHERE 1=1 LIMIT 1000",function (err,results,fields) {
							console.warn("******************* NEITHER WILL THIS get called.");
						});
        });
    });
	});
});

