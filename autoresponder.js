var common = require('./common.js');

var config = {
    baseurl: "https://your-meshcentral-fqdn/",// CHANGE THIS
    meshprefix: "mesh_cira_username",// CHANGE THIS
    username: "your_username",// CHANGE THIS, your meshcentral username
    password: "your_password" // CHANGE THIS, your meshcentral password
}

var chgdev_tpl = {
    action:"changedevice",
    nodeid:"",//To be dynamically changed
    intelamt:{
        user:"admin",
        pass:"P@ssw0rd",//Change this
        tls:0
    }
}
var deldev_tpl = {
    action: "removedevices",
    nodeids: []
}

var sol_tmr = {};

var message_loop = "Can't touch this....";//CHANGE THIS to simulate the size of text to shuffle

var request = require('request');
var constants = require('constants');
var tls_options = { rejectUnauthorized: false, strictSSL: false, secureOptions: constants.SSL_OP_NO_SSLv2 | constants.SSL_OP_NO_SSLv3 | constants.SSL_OP_NO_TLSv1 };
var specialRequest = request.defaults(tls_options);
var net = require('net');
var WebSocket = require('ws');
var Url = require('url');
var querystring = require("querystring");
var https = require('https');

// perform simple https authentication to get Cookie
function getCookie(cfg, cb) {
    var cred = {
        username: cfg["username"],
        password: cfg["password"]
    }
    var url = Url.parse(cfg["baseurl"]);
    var auth_postdata = querystring.stringify(cred);
    var options = JSON.parse(JSON.stringify(tls_options));
    options.hostname = url.hostname;
    options.method = "POST";
    options.port = (url.port == null) ? "443" : url.port;
    options.path = "/login";
    options.timeout = 10000;
    options.followRedirect = true;
    options.maxRedirects = 10;
    options.headers = {
        'Content-type': 'application/x-www-form-urlencoded',
        'Content-length': Buffer.byteLength(auth_postdata)
    }

    var req = https.request(options, function(res) {
        var cookie = null;
        if (res.statusCode == 302) {
            cookie = res.headers['set-cookie'];
        }
        if (cb) cb(cookie);
    });
    req.write(auth_postdata);
    req.end();
}

function termHammer(cfg, cookie, nodeid) {
    console.log("TermHammer "+ nodeid);

    var ws_headers = {
        'Cookie': cookie
    };
    var url = Url.parse(cfg["baseurl"]);    
    var ws_options = JSON.parse(JSON.stringify(tls_options));
    ws_options.headers = ws_headers;    
    var ws = new WebSocket("wss://" + url.hostname + ":" + "/webrelay.ashx?p=2&host="+nodeid+"&port=16994&tls=0",[], ws_options);
    ws.amtseq = 0;

    // ws event handling
    ws.on('open', function() {
        //console.log("WS open");
        var redirectStartSol = String.fromCharCode(0x10, 0x00, 0x00, 0x00, 0x53, 0x4F, 0x4C, 0x20);
        ws.send(redirectStartSol);
    });

    ws.on('close', function(code, reason) {
        //console.log("WS close: "+ code +":"+reason);
    });
    
    ws.on('error', function(err) {
        //console.log("WS error: "+ err);
    });
    ws.on('message', function (buf) {
        var data = ""+buf;        
        //console.log("RECV: "+common.rstr2hex(data));
        var cmd = data.charCodeAt(0);        
        switch (cmd) {
            case 0x11: {
                // Start redir reply 
                var statusCode = data.charCodeAt(1);
                if (statusCode==0) {
                    // Query available authentication
                    //console.log("Query available authentication");
                    ws.send(String.fromCharCode(0x13, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00));
                } else {
                    ws.close();
                }
                break;
            } 
            case 0x14: {
                // assuming authentication hack
                var statusCode = data.charCodeAt(1);
                var authType = data.charCodeAt(4);
                if (authType==2 && statusCode ==0) {
                    ws.send(common.hex2rstr("200000000100000010276400000010276400000000000000"));
                    ws.amtseq = 1;
                }
                break;
            }
            case 0x21: {
                // setting ack-ed
                ws.send(String.fromCharCode(0x27,0x00,0x00,0x00)+ common.IntToStrX(ws.amtseq++) + String.fromCharCode(0x00, 0x00, 0x1B, 0x00, 0x00, 0x00));
                var tmr = setInterval( function(){
                    var x = message_loop;
                    console.log("Data sent: "+ x);
                    ws.send(String.fromCharCode(0x28, 0x00, 0x00, 0x00) + common.IntToStrX(ws.amtseq++) + common.ShortToStrX(x.length) + x);
                },500);//CHANGE THIS, rate limit the frequency fo sending packet
                sol_tmr[nodeid] = tmr;
                break;
            }
            case 0x2A: {
                console.log("Data received: "+ data.substring(10));
                break;
            }
            default: {
                //console.log("Unknown CMD: "+cmd);
                ws.close();
            }
        }
    });
}

function watchControl(cfg, cookie) {
    var ws_headers = {
        'Cookie': cookie
    };
    var url = Url.parse(cfg["baseurl"]);    
    var ws_options = JSON.parse(JSON.stringify(tls_options));
    ws_options.headers = ws_headers;

    var ws = new WebSocket("wss://" + url.hostname + ":" + "/control.ashx",[], ws_options);

    // ws event handling
    ws.on('open', function() {
        //console.log("WS open");
    });

    ws.on('close', function(code, reason) {
        //console.log("WS close: "+ code +":"+reason);
    });
    
    ws.on('error', function(err) {
        //console.log("WS error: "+ err);
    });
    ws.on('message', function (data) {
        var msg = null;
        try {
            msg = JSON.parse(data);
        } catch (e) {
            msg = data;
        }
        
        if (msg!=null && msg.action!=null && msg.action=="event") {
            if (msg.event && msg.event.action=="nodeconnect") {
                var event = msg.event;
                var meshname = event.meshid.split('/')[2];
                
                if (meshname!=null && meshname.startsWith(cfg["meshprefix"])) {
                    if (event.conn==2) {                    
                        console.log("Patching AMT credential for "+ event.nodeid);
                        var upd_cred = JSON.parse(JSON.stringify(chgdev_tpl));
                        upd_cred.nodeid = event.nodeid;
                        ws.send(JSON.stringify(upd_cred));
                        termHammer(cfg, cookie, event.nodeid);
                    } else if (event.conn==0) {
                        if (sol_tmr[event.nodeid]!=null) {
                            //console.log("Interval timer removed");
                            clearInterval(sol_tmr[event.nodeid]);
                            delete sol_tmr[event.nodeid];
                        }
                        console.log("AMT node "+ event.nodeid +" goes offline, deleting it.");
                        var del_dev = JSON.parse(JSON.stringify(deldev_tpl));
                        del_dev.nodeids.push(event.nodeid);
                        ws.send(JSON.stringify(del_dev));                        
                    }   
                }                             
            }
        }
    });
}
getCookie(config, function(c) {    
    watchControl(config, c);
});