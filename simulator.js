var obj = {
    debug: true,
    ciraclients: []
};

var args_template = {
    host: "mpsfqdn",
    port: mpsport,
    clientName: 'hostname-prefix',
    uuid: "12345678-9abc-def1-2345-123456789000",//GUID template, last few chars of the string will be replaced
    username: 'standalone', // mps username
    password: 'P@ssw0rd', // mps password
    keepalive: 60000 // interval for keepalive ping
};

var count = 10;
var tail_len = count.toString(16).length;

for (var i=0; i< count; i++) {
    var args = JSON.parse(JSON.stringify(args_template));
    args.clientName +='-'+i;
    args.uuid = args.uuid.substring(0, args.uuid.length - tail_len);
    args.uuid += i.toString(16).toLocaleLowerCase();    
    obj.ciraclients[i] = require('./ciraclient.js').CreateCiraClient(obj, args);
}

for (var i=0; i< count; i++) {
    obj.ciraclients[i].connect();
}

var flipflop = function() {
    var idx = Math.floor(Math.random()*count);
    console.log("Flipflop: flip-floping ciraclients idx:"+idx);    
    obj.ciraclients[idx].disconnect();
    obj.ciraclients[idx].connect();
}
// run random connect/disconnect after 5 seconds
setTimeout(function() {
    var tmr = setInterval(function(){
        flipflop();
    }, 2000);
}, 5000); 
