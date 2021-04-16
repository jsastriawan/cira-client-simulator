var obj = {
    debug: false,
    ciraclients: []
};
var mesh_id = "6JaMchA1YIwCZGrA";//modified 16 chars mesh prefix (replace $ or @ with X)

var args_template = {
    host: "localhost",// CHANGE THIS
    port: 4433,// CHANGE THIS
    clientName: 'CIRA-Simulator',
    uuid: "12345678-9abc-def1-2345-123456789000",//GUID template, last few chars of the string will be replaced
    username: mesh_id, // CHANGE THIS
    password: 'P@ssw0rd', // CHANGE THIS
    keepalive: 60000 // interval for keepalive ping
};

var count = 50;//CHANGE THIS to scale the number of CIRA connections per instance of mass-simulator
var tail_len = count.toString(16).length;

for (var i=0; i<count; i++) {
    var args = JSON.parse(JSON.stringify(args_template));
    args.clientName +='-'+i;
    console.log("Client name: " + args.clientName);
    args.uuid = args.uuid.substring(0, args.uuid.length - tail_len);
    var t = i.toString(16).toLocaleLowerCase();
    var pt = '';
    for (var j=t.length; j<tail_len; j++) {
        pt+='0';
    }
    pt+=t;
    args.uuid += pt;
    obj.ciraclients[i] = require('./ciraclient.js').CreateCiraClient(obj, args);
}

for (var i=0; i< count; i++) {
    obj.ciraclients[i].connect();
}
