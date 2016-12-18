/*jshint camelcase: false */
module.exports = function(app, config) {

    'use strict';

    const oauth2 = require('simple-oauth2').create({
        client: {
            id: config.clientId,
            secret: config.clientSecret
        },
        auth: {
            tokenHost: 'https://api.mendeley.com',
            tokenPath: '/oauth/token',
            authorizeHost: 'https://api.mendeley.com',
            authorizePath: '/oauth/authorize'
        }
    });

    let request = require('request');
    let sdk = require('@mendeley/api');
    let cookieParser = require('cookie-parser');
    let Bluebird = require('bluebird');
    let fs = require('fs');

    let accessTokenCookieName = 'accessToken';
    let refreshTokenCookieName = 'refreshToken';
    let tokenExchangePath = '/oauth/token-exchange';
    let documents = [];
    let total;
    let startTime = new Date().getTime();

    app.use(cookieParser());

    app.use(function(req, res, next) {
        res.locals.authFlow = serverAuthCodeFlow(req, res);
        next();
    });

    app.get('/', function(req, res) {
        let token = res.locals.authFlow.getToken();

        if (!token) {
            console.log('No token set - authenticate');
            res.locals.authFlow.authenticate();
        } else {
            console.log('Access token set, redirecting to', '/group');
            res.redirect('/group');
        }
    });

    app.get('/group', function(req, res) {
        let api = sdk({
            authFlow: sdk.Auth.refreshTokenFlow({
                refreshToken: req.cookies[refreshTokenCookieName],
                clientId: config.clientId,
                clientSecret: config.clientSecret
            })
        });

        let options = {
            profile_id: "9f94630a-5585-3ec3-980d-65173c916aaf",
            view: "all",
            limit: "100"
        };

        api.documents.list(options)
            .then(function(result) {
                console.info('There are ' + result.total + ' documents in total');
                total = result.total;
                documents = documents.concat(result.items);
                return documentPager(result);
            })
            .then(function(result){
                if (result === 'done') {
                    // @todo write to a sensible place.
                    fs.writeFile('/tmp/documents.json', JSON.stringify(documents), (err) => {
                        if (err) throw err;
                        var endTime = new Date().getTime();
                        var timeLapsed = (endTime - startTime) / 1000;

                        var message = 'Documents retrieved and saved. Time lapsed: ' + timeLapsed + ' seconds.';
                        console.info(message);
                        res.json({message: message});
                        process.exit(0);
                    });
                }
            })
            .catch(function(reason) {
                res.status(reason.status).send();
            })
    });

    app.get(tokenExchangePath, function (req, res, next) {
        console.log('Starting token exchange');
        let code = req.query.code;

        oauth2.authorizationCode.getToken({
            redirect_uri: config.redirectUri,
            code: code,
        }, function(error, result) {
            if (error) {
                console.log('Error exchanging token', error);
                res.redirect('/logout');
            } else {
                setCookies(res, result);
                res.redirect('/group');
            }
        });
    });

    app.get('/login', function(req, res) {
        console.log('Logging in, clearing any existing cookies');
        res.clearCookie(accessTokenCookieName);
        res.clearCookie(refreshTokenCookieName);
        res.locals.authFlow.authenticate();
    });

    app.get('/oauth/refresh', function(req, res, next) {
        res.set('Content-Type', 'application/json');

        res.locals.authFlow.refreshToken().then(function() {
            return {
                json: '{ message: "Refresh token succeeded" }',
                status: 200
            };
        }).catch(function() {
            return {
                status: 401,
                json: '{ message: "Refresh token invalid" }'
            };
        }).then(function(result) {
            res.status(result.status).send(result.json);
        });
    });

    function documentPager(result) {
        return new Bluebird(function(resolve, reject){
            if (typeof result.next === 'function') {
                result.next()
                    .then(function(result){
                        documents = documents.concat(result.items);
                        console.info('Retrieved ' + documents.length + ' documents.');
                        resolve(documentPager(result));
                    })
                    .catch(function(err){
                        reject(err);
                    });
            }
            else {
                resolve('done');
            }
        });
    }

    function setCookies(res, token) {
        res.cookie(accessTokenCookieName, token.access_token, { maxAge: token.expires_in * 1000 });
        res.cookie(refreshTokenCookieName, token.refresh_token, { httpOnly: true });
    }

    function serverAuthCodeFlow(req, res) {
        let accessToken = req.cookies[accessTokenCookieName];
        let refreshToken = req.cookies[refreshTokenCookieName];

        return {
            authenticate: function() {
                const authorizationUri = oauth2.authorizationCode.authorizeURL({
                    redirect_uri: config.redirectUri,
                    scope: 'all',
                    state: '213653957730.97845'
                });
                console.log('No cookie defined, redirecting to', authorizationUri);
                res.redirect(authorizationUri);
            },

            getToken: function() {
                return accessToken;
            },

            refreshToken: function() {
                if (!refreshToken) {
                    return Bluebird.reject(new Error('No refresh token'));
                } else {
                    return new Bluebird(function(resolve, reject) {
                        oauth2.accessToken.create({
                            access_token: accessToken,
                            refresh_token: refreshToken
                        }).refresh(function(error, result) {
                            if (error) {
                                console.log('Error while refreshing token', error);
                                reject(error);
                            } else {
                                accessToken = result.token.access_token;
                                refreshToken = result.token.refresh_token;
                                setCookies(res, result.token);
                                resolve();
                            }
                        });
                    });
                }
            }

        };
    }
};
