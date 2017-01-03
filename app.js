'use strict';

let express = require('express');

let app = express();
let appConfig = require('./appConfig');
let url = appConfig.appUrl;
let port = appConfig.appPort;
let credentialFilePath = appConfig.credentialFilePath;

let credentials = require(credentialFilePath).mendeley;
let config = {
    clientId: credentials.app_id,
    clientSecret: credentials.app_secret,
    responseType: 'code'
};

// Require oauth-app for auth code flow if configured for a "code" response type
if (config.responseType === 'code') {
    config.redirectUri = url + ':' + port + '/oauth/token-exchange';
    require('./oauth-app')(app, config);
}

// Error handling
app.use(function(error, req, res, next) {
    if (error) {
        console.error(error.stack);
        res.status(500).send('Failed on the Nodejs app.');
    }
});

// Run the server
let server = app.listen(port, 'localhost', function() {
    console.info('App running on port: ' + port + ', using "' + config.responseType + '" oauth flow');
});