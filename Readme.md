# AMT CIRA Simulator

This simple NodeJS application simulates multiple AMT CIRA connections to an MPS. The CIRA client will mimic APF protocol client end point up to the ability to send keep alive packets. Each client can be controlled to connect and disconnect independently.

Note: it does not simulate AMT WSMAN or REDIR payload yet.

TODO: adjustable keepalive timer via KEEPALIVE_OPTION message