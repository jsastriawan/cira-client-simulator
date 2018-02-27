# AMT CIRA Simulator

This simple NodeJS application simulates multiple AMT CIRA connection to an MPS. The CIRA client will mimic APF protocol client end point up to keep alive. Each client can be controlled to connect and disconnect.

Note: it does not simulate AMT WSMAN or REDIR payload yet.

TODO: adjustable keepalive timer via KEEPALIVE_OPTION message