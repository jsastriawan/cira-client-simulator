module.exports.CreateCiraClient = function (parent, args) {
    var obj = {};
    obj.parent = parent;
    obj.args = args;
    obj.tls = require('tls');
    obj.common = require('./common.js');
    obj.constants = require('constants');
    obj.forwardClient = null;
    obj.pfwd_idx = 0;
    // keep alive timer
    obj.timer = null;    

    function Debug(str) {
        if (obj.parent.debug) {
            console.log(str);
        }
    }
    // CIRA state     
    var CIRASTATE = {
        INITIAL: 0,
        PROTOCOL_VERSION_SENT: 1,
        AUTH_SERVICE_REQUEST_SENT: 2,
        AUTH_REQUEST_SENT: 3,
        PFWD_SERVICE_REQUEST_SENT: 4,
        GLOBAL_REQUEST_SENT: 5,
        FAILED: -1
    }
    obj.cirastate = CIRASTATE.INITIAL;

    // REDIR state
    var REDIR_TYPE = {
        REDIR_UNKNOWN: 0,
        REDIR_SOL: 1,
        REDIR_KVM: 2,
        REDIR_IDER: 3        
    }

    // redirection start command
    obj.RedirectStartSol = String.fromCharCode(0x10, 0x00, 0x00, 0x00, 0x53, 0x4F, 0x4C, 0x20);
    obj.RedirectStartKvm = String.fromCharCode(0x10, 0x01, 0x00, 0x00, 0x4b, 0x56, 0x4d, 0x52);
    obj.RedirectStartIder = String.fromCharCode(0x10, 0x00, 0x00, 0x00, 0x49, 0x44, 0x45, 0x52);
    obj.redirstate = REDIR_TYPE.REDIR_UNKNOWN;
    obj.redir_sol_chan = 0;

    // AMT forwarded port list for non-TLS mode
    var pfwd_ports = [ 16992, 623, 16994, 5900];
    // protocol definitions
    var APFProtocol = {
        UNKNOWN: 0,
        DISCONNECT: 1,
        SERVICE_REQUEST: 5,
        SERVICE_ACCEPT: 6,
        USERAUTH_REQUEST: 50,
        USERAUTH_FAILURE: 51,
        USERAUTH_SUCCESS: 52,
        GLOBAL_REQUEST: 80,
        REQUEST_SUCCESS: 81,
        REQUEST_FAILURE: 82,
        CHANNEL_OPEN: 90,
        CHANNEL_OPEN_CONFIRMATION: 91,
        CHANNEL_OPEN_FAILURE: 92,
        CHANNEL_WINDOW_ADJUST: 93,
        CHANNEL_DATA: 94,
        CHANNEL_CLOSE: 97,
        PROTOCOLVERSION: 192,
        KEEPALIVE_REQUEST: 208,
        KEEPALIVE_REPLY: 209,
        KEEPALIVE_OPTIONS_REQUEST: 210,
        KEEPALIVE_OPTIONS_REPLY: 211
    }
    
    var APFDisconnectCode = {
        HOST_NOT_ALLOWED_TO_CONNECT: 1,
        PROTOCOL_ERROR: 2,
        KEY_EXCHANGE_FAILED: 3,
        RESERVED: 4,
        MAC_ERROR: 5,
        COMPRESSION_ERROR: 6,
        SERVICE_NOT_AVAILABLE: 7,
        PROTOCOL_VERSION_NOT_SUPPORTED: 8,
        HOST_KEY_NOT_VERIFIABLE: 9,
        CONNECTION_LOST: 10,
        BY_APPLICATION: 11,
        TOO_MANY_CONNECTIONS: 12,
        AUTH_CANCELLED_BY_USER: 13,
        NO_MORE_AUTH_METHODS_AVAILABLE: 14,
        INVALID_CREDENTIALS: 15,
        CONNECTION_TIMED_OUT: 16,
        BY_POLICY: 17,
        TEMPORARILY_UNAVAILABLE: 18
    }
    
    var APFChannelOpenFailCodes = {
        ADMINISTRATIVELY_PROHIBITED: 1,
        CONNECT_FAILED: 2,
        UNKNOWN_CHANNEL_TYPE: 3,
        RESOURCE_SHORTAGE: 4,
    }
    
    var APFChannelOpenFailureReasonCode = {
        AdministrativelyProhibited: 1,
        ConnectFailed: 2,
        UnknownChannelType: 3,
        ResourceShortage: 4,
    }

    obj.onSecureConnect = function() {
        Debug("CIRA TLS socket connected.");
        obj.forwardClient.tag = { accumulator: ''};
        obj.forwardClient.setEncoding('binary');
        obj.forwardClient.on('data', function (data) {
            obj.forwardClient.tag.accumulator+=data;
            try {
                var len = 0;
                do {
                    len = ProcessData(obj.forwardClient);
                    if (len > 0) { 
                        obj.forwardClient.tag.accumulator = obj.forwardClient.tag.accumulator.substring(len); 
                    } 
                    if (obj.cirastate == CIRASTATE.FAILED) {
                        Debug("CIRA: in a failed state, destroying socket.")
                        obj.forwardClient.end();                        
                    }            
                } while (len > 0);
            } catch (e) {
                Debug(e);
            }
        });
        obj.forwardClient.on('error', function (e) {
            Debug("CIRA: Connection error, ending connecting.");
            if (obj.timer!=null) {
                clearInterval(obj.timer);
                obj.timer = null;
            }
        });
        
        obj.forwardClient.on('close', function (e) {
            Debug("CIRA: Connection is closing.");
            if (obj.timer!=null) {
                clearInterval(obj.timer);
                obj.timer = null;
            }
        });
        
        obj.forwardClient.on('end', function (data) {
            Debug("CIRA: Connection end.");
            if (obj.timer!=null) {
                clearInterval(obj.timer);
                obj.timer = null;
            }
        });

        obj.state = CIRASTATE.INITIAL;
        SendProtocolVersion(obj.forwardClient, obj.args.uuid);
        SendServiceRequest(obj.forwardClient,'auth@amt.intel.com');
    }

    function guidToStr(g) { return g.substring(6, 8) + g.substring(4, 6) + g.substring(2, 4) + g.substring(0, 2) + "-" + g.substring(10, 12) + g.substring(8, 10) + "-" + g.substring(14, 16) + g.substring(12, 14) + "-" + g.substring(16, 20) + "-" + g.substring(20); }
    function strToGuid(s) {
        s = s.replace(/-/g,'');
        var ret = s.substring(6,8) +s.substring(4,6)+s.substring(2,4)+s.substring(0,2);
        ret += s.substring(10, 12) + s.substring(8, 10) + s.substring(14, 16) + s.substring(12, 14) + s.substring(16, 20) + s.substring(20);
        return ret;
    }
    
    function SendProtocolVersion(socket, uuid) {
        var buuid = strToGuid(uuid);
        var data = String.fromCharCode(APFProtocol.PROTOCOLVERSION)+ '' + obj.common.IntToStr(1)+obj.common.IntToStr(0)+obj.common.IntToStr(0)+obj.common.hex2rstr(buuid)+Buffer.alloc(64);
        socket.write(Buffer.from(data,'binary'));
        Debug("CIRA: Send protocol version 1 0 "+uuid);
        obj.cirastate = CIRASTATE.PROTOCOL_VERSION_SENT;
    }

    function SendServiceRequest(socket, service) {
        var data = String.fromCharCode(APFProtocol.SERVICE_REQUEST)+obj.common.IntToStr(service.length)+service;
        socket.write(Buffer.from(data,'binary'));
        Debug("CIRA: Send service request "+service);
        if (service == 'auth@amt.intel.com') {
            obj.cirastate = CIRASTATE.AUTH_SERVICE_REQUEST_SENT;
        } else if (service == 'pfwd@amt.intel.com') {
            obj.cirastate = CIRASTATE.PFWD_SERVICE_REQUEST_SENT;
        }
    }

    function SendUserAuthRequest(socket,user, pass) {
        var service = "pfwd@amt.intel.com";
        var data = String.fromCharCode(APFProtocol.USERAUTH_REQUEST)+obj.common.IntToStr(user.length)+user+obj.common.IntToStr(service.length)+service;
        //password auth
        data +=obj.common.IntToStr(8)+'password';        
        data += Buffer.alloc(1)+obj.common.IntToStr(pass.length)+pass;
        socket.write(Buffer.from(data,'binary'));
        Debug("CIRA: Send username password authentication to MPS");
        obj.cirastate = CIRASTATE.AUTH_REQUEST_SENT;
    }

    function SendGlobalRequestPfwd(socket,amthostname,amtport) {
        var tcpipfwd = 'tcpip-forward';
        var data = String.fromCharCode(APFProtocol.GLOBAL_REQUEST)+obj.common.IntToStr(tcpipfwd.length)+tcpipfwd+Buffer.alloc(1,1);
        data += obj.common.IntToStr(amthostname.length)+amthostname+obj.common.IntToStr(amtport);
        socket.write(Buffer.from(data,'binary'));
        Debug("CIRA: Send tcpip-forward "+amthostname+":"+amtport);
        obj.cirastate = CIRASTATE.GLOBAL_REQUEST_SENT;
    }

    function SendKeepAliveRequest(socket) {
        var data = String.fromCharCode(APFProtocol.KEEPALIVE_REQUEST)+obj.common.IntToStr(255);
        socket.write(Buffer.from(data,'binary'));
        Debug("CIRA: Send keepalive request");
    }

    function SendKeepAliveReply(socket, cookie) {
        var data = String.fromCharCode(APFProtocol.KEEPALIVE_REPLY)+obj.common.IntToStr(cookie);
        socket.write(Buffer.from(data,'binary'));
        Debug("CIRA: Send keepalive reply");
    }

    function ProcessData(socket) {
        var cmd = socket.tag.accumulator.charCodeAt(0);
        var len = socket.tag.accumulator.length;
        var data = socket.tag.accumulator;
        if (len == 0) { return 0;}
        // respond to MPS according to obj.cirastate
        switch (cmd) {
            case APFProtocol.SERVICE_ACCEPT: {
                var slen = obj.common.ReadInt(data,1);
                var service = data.substring(5, 6 + slen);
                Debug("CIRA: Service request to " +service+ " accepted.");
                if (service=='auth@amt.intel.com') {
                    if (obj.cirastate>=CIRASTATE.AUTH_SERVICE_REQUEST_SENT) {
                        SendUserAuthRequest(socket, obj.args.username, obj.args.password);
                    }
                } else if (service=='pfwd@amt.intel.com') {
                    if (obj.cirastate>=CIRASTATE.PFWD_SERVICE_REQUEST_SENT) {
                        SendGlobalRequestPfwd(socket,obj.args.clientName,pfwd_ports[obj.pfwd_idx++]);
                    }
                }
                return 5+slen;
            }
            case APFProtocol.REQUEST_SUCCESS: {
                if (len>=5) {
                    var port = obj.common.ReadInt(data,1);
                    Debug("CIRA: Request to port forward "+port+" successful.");
                    // iterate to pending port forward request
                    if (obj.pfwd_idx<pfwd_ports.length) {
                        SendGlobalRequestPfwd(socket,obj.args.clientName,pfwd_ports[obj.pfwd_idx++]);
                    } else {
                        // no more port forward, now setup timer to send keep alive
                        Debug("CIRA: Start keep alive for every "+obj.args.keepalive+" ms.");
                        obj.timer = setInterval( function () {
                            SendKeepAliveRequest(obj.forwardClient);
                        }, obj.args.keepalive);// 
                    }
                    return 5;
                } 
                Debug("CIRA: Request successful.");                
                return 1;
            }
            case APFProtocol.USERAUTH_SUCCESS: {
                Debug("CIRA: User Authentication successful");
                // Send Pfwd service request
                SendServiceRequest(socket,'pfwd@amt.intel.com');
                return 1;
            }
            case APFProtocol.USERAUTH_FAILURE: {
                Debug("CIRA: User Authentication failed");
                obj.cirastate = CIRASTATE.FAILED;
                return 14;
            }
            case APFProtocol.KEEPALIVE_REQUEST: {
                Debug("CIRA: Keep Alive Request with cookie: "+obj.common.ReadInt(data,1));
                SendKeepAliveReply(socket,obj.common.ReadInt(data,1));
                return 5;
            }
            case APFProtocol.KEEPALIVE_REPLY: {
                Debug("CIRA: Keep Alive Reply with cookie: "+obj.common.ReadInt(data,1));
                return 5;
            }
            // Channel management
            case APFProtocol.CHANNEL_OPEN: {
                //parse CHANNEL OPEN request
                var p_res = parseChannelOpen(data);
                Debug("CIRA: CHANNEL_OPEN request: "+ JSON.stringify(p_res));
                if (p_res.connected_port==16994) {
                    SendChannelOpenConfirm(socket, p_res);
                } else {
                    SendChannelOpenFailure(socket, p_res);
                }
                return p_res.len;
            }
            case APFProtocol.CHANNEL_OPEN_CONFIRMATION: {
                Debug("CIRA: CHANNEL_OPEN_CONFIRMATION");
                return 17;
            }
            case APFProtocol.CHANNEL_CLOSE: {
                var rcpt_chan = obj.common.ReadInt(data,1); 
                Debug("CIRA: CHANNEL_CLOSE: "+rcpt_chan);                
                SendChannelClose(socket, rcpt_chan);
                // check if this is redil_sol_chan
                if (rcpt_chan == obj.redir_sol_chan) {
                    Debug("CIRA: Reset SOL Redirection");
                    obj.redir_sol_chan = 0;
                    obj.redirstate = REDIR_TYPE.REDIR_UNKNOWN;
                }
                return 5;
            }
            case APFProtocol.CHANNEL_DATA: {
                Debug("CIRA: CHANNEL_DATA: "+ JSON.stringify(obj.common.rstr2hex(data)));
                var rcpt_chan = obj.common.ReadInt(data,1);
                var chan_data_len = obj.common.ReadInt(data,5);
                var chan_data = data.substring(9, 9 + chan_data_len);
                processRedirData(socket, rcpt_chan, chan_data);
                return 9 + chan_data_len;
            }
            case APFProtocol.CHANNEL_WINDOW_ADJUST: {
                Debug("CIRA: CHANNEL_WINDOW_ADJUST ");
                return 9;
            }
            default: {
                Debug("CMD: "+cmd+ " is not implemented.");
                obj.cirastate = CIRASTATE.FAILED;
                return 0;
            }
        }
    }

    function processRedirData(socket, rcpt_chan, data) {
        // if unknown, we expect some protocol specification to be sent
        if (obj.redirstate==REDIR_TYPE.REDIR_UNKNOWN) {
            var redir_cmd = data.substring(0,8);
            Debug("CIRA: SOL redir_cmd: "+redir_cmd);
            if (redir_cmd == obj.RedirectStartSol) {
                Debug("CIRA: SOL receive StartRedirectionSession");
                obj.redirstate = REDIR_TYPE.REDIR_SOL;
                obj.redir_sol_chan = rcpt_chan;
                SendChannelWindowAdjust(socket, rcpt_chan, 0);
                // send StartRedirectionSessionReply success
                var reply = String.fromCharCode(0x11, 0x0, 0x00, 0x00, 0x01, 0x00, 0x0B, 0x08, 0x57, 0x01,0x00, 0x00, 0x00);
                Debug("CIRA: SOL send StartRedirectionSessionReply: " + obj.common.rstr2hex(reply));
                SendChannelData(socket, rcpt_chan, 13, reply);
                SendChannelWindowAdjust(socket, rcpt_chan, 0);            
            } else {
                // other than SOL, it is not supported yet, will refine later
                SendChannelClose(socket, rcpt_chan);                    
            }
        } else if (obj.redirstate== REDIR_TYPE.REDIR_SOL) {
            // SOL state machine
            Debug("CIRA: SOL: "+ obj.common.rstr2hex(data));
            var sol_cmd = data.charCodeAt(0);
            switch (sol_cmd) {
                case 0x13: {
                    if (data.length<=13)
                    { // Authentication query reply capabilities
                        var reply = String.fromCharCode(0x14, 0x00, 0x00, 0x00, 0x02, 0x03, 0x00, 0x00, 0x00, 0x04, 0x03, 0x01);
                        SendChannelData(socket, rcpt_chan, 12, reply);
                    } else {
                        // authentication bypass, don't care what was sent, just say YES you are authorized
                        var reply = String.fromCharCode(0x14, 0x01, 0x00, 0x00, 0x02, 0x03, 0x00, 0x00, 0x00, 0x04, 0x03, 0x01);
                        SendChannelData(socket, rcpt_chan, 12, reply);
                    }
                    break;
                }
                case 0x20: {
                    var reply = String.fromCharCode(0x21, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x0B, 0x08, 0x00, 0x20, 0x01, 0x00, 0x00, 0x00, 0x57, 0x01, 0x00, 0x00, 0x00);
                    SendChannelData(socket, rcpt_chan, 23, reply);
                    break;
                }
                case 0x27: {
                    // Response to setting ack, do nothing
                    break;
                }
                case 0x2B: {
                    // heartbeat, send back exact heartbeat data
                    SendChannelData(socket, rcpt_chan, 8, data.substring(0,8));
                    break;
                }
                case 0x28: {
                    // Data to host, incoming data, just loopback with Data from host reply
                    var dlen = obj.common.ReadShortX(data,8);
                    Debug("CIRA: SOL data dlen="+dlen+", value="+data.substring(10,10+dlen));
                    var reply = String.fromCharCode(0x2A,0x00,0x00,0x00)+data.substring(4,8)+obj.common.ShortToStrX(dlen)+data.substring(10,10+dlen);
                    SendChannelData(socket, rcpt_chan, 10+dlen, reply);
                    break;
                }
                default: {
                    SendChannelClose(socket, rcpt_chan);                    
                }
            }            
        } else {
            SendChannelClose(socket, rcpt_chan);                    
        }
    }

    function parseChannelOpen(data) {
        var result = {
            len: 0, //to be filled later
            cmd: APFProtocol.CHANNEL_OPEN,
            chan_type: "", //to be filled later
            sender_chan: 0, //to be filled later
            window_size: 0, //to be filled later
            connected_address: "", //to be filled later
            connected_port: 0, //to be filled later
            origin_address: "", //to be filled later
            origin_port: 0, //to be filled later            
        };
        var chan_type_slen = obj.common.ReadInt(data,1);
        result.chan_type = data.substring(5,5+chan_type_slen);
        result.sender_chan = obj.common.ReadInt(data, 5 + chan_type_slen);
        result.window_size = obj.common.ReadInt(data, 9 + chan_type_slen);
        var c_len = obj.common.ReadInt(data, 17 + chan_type_slen);
        result.connected_address = data.substring(21 + chan_type_slen, 21 + chan_type_slen + c_len);
        result.connected_port = obj.common.ReadInt(data, 21 + chan_type_slen + c_len);
        var o_len = obj.common.ReadInt(data, 25 + chan_type_slen + c_len);
        result.origin_address = data.substring(29 + chan_type_slen + c_len, 29 + chan_type_slen + c_len + o_len);
        result.origin_port = obj.common.ReadInt(data, 29 + chan_type_slen + c_len + o_len );
        result.len = 33 + chan_type_slen + c_len + o_len;
        return result;
    }
    function SendChannelOpenFailure(socket, chan_data) { 
        var data = String.fromCharCode(APFProtocol.CHANNEL_OPEN_FAILURE)+obj.common.IntToStr(chan_data.sender_chan)
        + obj.common.IntToStr(2) + obj.common.IntToStr(0) + obj.common.IntToStr(0);
        socket.write(Buffer.from(data,'binary'));
        Debug("CIRA: Send ChannelOpenFailure");
    }
    function SendChannelOpenConfirm(socket, chan_data) {
        var data = String.fromCharCode(APFProtocol.CHANNEL_OPEN_CONFIRMATION)+obj.common.IntToStr(chan_data.sender_chan)
        + obj.common.IntToStr(chan_data.sender_chan) + obj.common.IntToStr(chan_data.window_size)+obj.common.IntToStr(0xFFFFFFFF);
        socket.write(Buffer.from(data,'binary'));
        Debug("CIRA: Send ChannelOpenConfirmation");
    }

    function SendChannelWindowAdjust(socket, chan, size) {
        var data = String.fromCharCode(APFProtocol.CHANNEL_WINDOW_ADJUST)+obj.common.IntToStr(chan) + obj.common.IntToStr(size);
        socket.write(Buffer.from(data,'binary'));
        Debug("CIRA: Send ChannelWindowAdjust: "+ obj.common.rstr2hex(data));
    }

    function SendChannelData(socket, chan, len, data) {
        var buf = String.fromCharCode(APFProtocol.CHANNEL_DATA)+obj.common.IntToStr(chan) + obj.common.IntToStr(len)+data;
        socket.write(Buffer.from(buf,'binary'));
        Debug("CIRA: Send ChannelData: "+ obj.common.rstr2hex(buf));
    }

    function SendChannelClose(socket, chan) {
        var buf = String.fromCharCode(APFProtocol.CHANNEL_CLOSE)+obj.common.IntToStr(chan);
        socket.write(Buffer.from(buf,'binary'));
        Debug("CIRA: Send ChannelClose: "+ obj.common.rstr2hex(buf));
    }

    obj.connect = function () {
        if (obj.forwardClient!=null) {
            try {
                obj.forwardClient.end();
            } catch (e) {
                Debug(e);
            }
            //obj.forwardClient = null;
        }
        obj.cirastate = CIRASTATE.INITIAL;
        obj.pfwd_idx = 0;
        var tlsoptions = { secureProtocol: 'SSLv23_method', 
            ciphers: 'RSA+AES:!aNULL:!MD5:!DSS', 
            secureOptions: obj.constants.SSL_OP_NO_SSLv2 | obj.constants.SSL_OP_NO_SSLv3 | obj.constants.SSL_OP_NO_COMPRESSION | obj.constants.SSL_OP_CIPHER_SERVER_PREFERENCE, 
            rejectUnauthorized: false };
        obj.forwardClient = obj.tls.connect(obj.args.port,obj.args.host, tlsoptions, obj.onSecureConnect);
    }

    obj.disconnect = function () {
        try {
            obj.forwardClient.end();            
        } catch (e) {
            Debug(e);
        }
    }

    return obj;
}
