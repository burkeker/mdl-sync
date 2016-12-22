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
    let jsonexport = require('jsonexport');
    let fs = require('fs');
    let appConfig = require('./appConfig');

    let accessTokenCookieName = 'accessToken';
    let refreshTokenCookieName = 'refreshToken';
    let tokenExchangePath = '/oauth/token-exchange';
    let documents = [];
    let members = [];
    let total;
    let startTime = new Date().getTime();
    let endpoint = '/members';

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
            console.log('Access token set, redirecting to', endpoint);
            res.redirect(endpoint);
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
            profile_id: appConfig.gbifProfileId,
            view: "all",
            limit: "100"
        };

        api.documents.list(options)
            .then(function(result) {
                console.info('There are ' + result.total + ' documents in total');
                total = result.total;
                documents = documents.concat(result.items);
                return resultsPager(result, documents);
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

    app.get('/members', function(req, res) {
        let api = sdk({
            authFlow: sdk.Auth.refreshTokenFlow({
                refreshToken: req.cookies[refreshTokenCookieName],
                clientId: config.clientId,
                clientSecret: config.clientSecret
            })
        });

        let options = {
            profile_id: appConfig.gbifPublicGroupId,
            view: "all",
            limit: "100"
        };

        api.groups.members(appConfig.gbifPublicGroupId, options)
            .then(function(result) {
                console.info('There are ' + result.total + ' members in total');
                total = result.total;
                members = members.concat(result.items);
                return resultsPager(result, members, total);
            })
            .then(function(members){
                if (members.length > 0) {
                    const promises = members.map(member => api.profiles.retrieve(member.profile_id));
                    return Promise.all(promises);
                }
            })
            .then(function(membersDetail){
                if (membersDetail.length > 0) {
                    // strip out unnecessary objects.
                    /*
                    membersDetail.map(function(member){
                        let redundent = ['discipline', 'desciplines', 'photo', 'photos'];
                        redundent.map(function(property){
                            if (member.hasOwnProperty(property)) {
                                delete(member[property]);
                            }
                        });
                    });
                    let exportOptions = {
                        rowDelimiter: "\t"
                    };
                    jsonexport(membersDetail, function(err, csv){
                        if (err) return new Error(err.message);
                    });
                     */
                    return fs.writeFile('/tmp/members.json', JSON.stringify(membersDetail), (err) => {
                        if (err) throw err;
                        var endTime = new Date().getTime();
                        var timeLapsed = (endTime - startTime) / 1000;

                        var message = 'Members retrieved and saved. Time lapsed: ' + timeLapsed + ' seconds.';
                        console.info(message);
                        res.json({message: message});
                        process.exit(0);
                    });
                }
            })
            .catch(function(reason) {
                res.status(reason.status).send();
            });
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
                res.redirect(endpoint);
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

    function resultsPager(result, container, total) {
        return new Bluebird(function(resolve, reject){
            if (typeof result.next === 'function') {
                result.next()
                    .then(function(result){
                        container = container.concat(result.items);
                        console.info('Retrieved ' + container.length + ' items.');
                        resolve(resultsPager(result, container, total));
                    })
                    .catch(function(err){
                        reject(err);
                    });
            }
            else if (container.length == total) {
                resolve(container);
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
