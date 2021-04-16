# AMT CIRA Simulator

## Description
This simple NodeJS application simulates multiple AMT CIRA connections to an MPS. The CIRA client will mimic APF protocol client end point up to the ability to send keep alive packets. Each client can be controlled to connect and disconnect independently. The purpose of this code is to simulate parallel transaction to understand MPS for deployment scaling.

Note: it does not simulate AMT WSMAN transaction but it simulates SOL transaction.

## How to use this

1. Install Meshcentral 2 in WAN mode.
2. Create an AMT only device group and lookup the device group id from websocket inspection of control.ashx
```
{"action":"meshes","meshes":[{"type":"mesh","_id":"mesh//6JaMchA1YIwCZGrA$FxqUzxIYhliyw65eOiVvZ@p8zyJXK8zADhORwo5lQzR8$Xg","name":"CIRA","mtype":1,"desc":"","domain":"","links":{"user//admin":{"name":"admin","rights":4294967295}},"creation":1618592519911,"creatorid":"user//admin","creatorname":"admin"}]}
```
Pay attention to _id, take 16 characters after "mesh//". In this example, the value is: *6JaMchA1YIwCZGrA*. We will use that as the autoresponder device group filter and username of CiraClient.
3. Modify autoresponder.js 
Look at the following section 
```
var mesh_id_raw = "6JaMchA1YIwCZGrA";//16 characters unmodified prefix of mesh_id

var config = {
    baseurl: "https://localhost/",// CHANGE THIS
    meshprefix: mesh_id_raw,// CHANGE THIS
    username: "admin",// CHANGE THIS, your meshcentral username
    password: "P@ssw0rd" // CHANGE THIS, your meshcentral password
}
```
Additional section to change the traffic load is here:
```
var message_loop = "Can't touch this....";//CHANGE THIS to simulate the size of text to shuffle
var hammer_period = 500; // half second
//message_loop = require('fs').readFileSync('LICENSE');//use license file instead
```

4. Modify mass-simulator.js
Look at the following section
```
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
```
5. Running the simulation
Execute the auto responder:
```
node autoresponder.js
```
On separate terminal, execure mass simulator
```
node mass-simulator.js
```
You should see:
```
Client name: CIRA-Simulator-1
Client name: CIRA-Simulator-2
Client name: CIRA-Simulator-3
...
...
```
This indicate instances of CIRA simulators are spawned.
The auto responder terminal will start showing:
```

Data received from node//EjRWeJq83vEjRRI0VniQERI0VniavN7xI0USNFZ4kBESNFZ4mrze8SNFEjRWeJAR
Data sent to node//EjRWeJq83vEjRRI0VniQExI0VniavN7xI0USNFZ4kBMSNFZ4mrze8SNFEjRWeJAT
Data sent to node//EjRWeJq83vEjRRI0VniQEhI0VniavN7xI0USNFZ4kBISNFZ4mrze8SNFEjRWeJAS
Data sent to node//EjRWeJq83vEjRRI0VniQFBI0VniavN7xI0USNFZ4kBQSNFZ4mrze8SNFEjRWeJAU
Data sent to node//EjRWeJq83vEjRRI0VniQFhI0VniavN7xI0USNFZ4kBYSNFZ4mrze8SNFEjRWeJAW
Data sent to node//EjRWeJq83vEjRRI0VniQFRI0VniavN7xI0USNFZ4kBUSNFZ4mrze8SNFEjRWeJAV
Data received from node//EjRWeJq83vEjRRI0VniQExI0VniavN7xI0USNFZ4kBMSNFZ4mrze8SNFEjRWeJAT
Data received from node//EjRWeJq83vEjRRI0VniQEhI0VniavN7xI0USNFZ4kBISNFZ4mrze8SNFEjRWeJAS
Data received from node//EjRWeJq83vEjRRI0VniQFBI0VniavN7xI0USNFZ4kBQSNFZ4mrze8SNFEjRWeJAU
Data received from node//EjRWeJq83vEjRRI0VniQFhI0VniavN7xI0USNFZ4kBYSNFZ4mrze8SNFEjRWeJAW
Data received from node//EjRWeJq83vEjRRI0VniQFRI0VniavN7xI0USNFZ4kBUSNFZ4mrze8SNFEjRWeJAV
....
```
This indicates that the auto responder has reacted to the connection by initiating SOL transaction.
Upon termination of mass simulator, the auto responder should delete the node.
```
AMT node node//EjRWeJq83vEjRRI0VniQExI0VniavN7xI0USNFZ4kBMSNFZ4mrze8SNFEjRWeJAT goes offline, deleting it.
AMT node node//EjRWeJq83vEjRRI0VniQERI0VniavN7xI0USNFZ4kBESNFZ4mrze8SNFEjRWeJAR goes offline, deleting it.
AMT node node//EjRWeJq83vEjRRI0VniQEBI0VniavN7xI0USNFZ4kBASNFZ4mrze8SNFEjRWeJAQ goes offline, deleting it.
AMT node node//EjRWeJq83vEjRRI0VniQDxI0VniavN7xI0USNFZ4kA8SNFZ4mrze8SNFEjRWeJAP goes offline, deleting it.
AMT node node//EjRWeJq83vEjRRI0VniQDRI0VniavN7xI0USNFZ4kA0SNFZ4mrze8SNFEjRWeJAN goes offline, deleting it.
AMT node node//EjRWeJq83vEjRRI0VniQChI0VniavN7xI0USNFZ4kAoSNFZ4mrze8SNFEjRWeJAK goes offline, deleting it.
AMT node node//EjRWeJq83vEjRRI0VniQDhI0VniavN7xI0USNFZ4kA4SNFZ4mrze8SNFEjRWeJAO goes offline, deleting it.
AMT node node//EjRWeJq83vEjRRI0VniQDBI0VniavN7xI0USNFZ4kAwSNFZ4mrze8SNFEjRWeJAM goes offline, deleting it.
AMT node node//EjRWeJq83vEjRRI0VniQCxI0VniavN7xI0USNFZ4kAsSNFZ4mrze8SNFEjRWeJAL goes offline, deleting it.
AMT node node//EjRWeJq83vEjRRI0VniQCRI0VniavN7xI0USNFZ4kAkSNFZ4mrze8SNFEjRWeJAJ goes offline, deleting it.
AMT node node//EjRWeJq83vEjRRI0VniQCBI0VniavN7xI0USNFZ4kAgSNFZ4mrze8SNFEjRWeJAI goes offline, deleting it.
```