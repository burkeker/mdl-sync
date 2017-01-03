// Run this script with Casperjs, which can be installed by using npm or homebrew on macOS.

var appConfig = require('./appConfig');
var casper = require('casper').create({
    verbose: true,
    userAgent: 'Mozilla/5.0  poi poi poi (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/537.22 (KHTML, like Gecko) Chrome/25.0.1364.172 Safari/537.22',
    pageSettings: {}
});
var credentialFilePath = appConfig.credentialFilePath;

var credentials = require(credentialFilePath).mendeley;

console.log('Ready to authenticate.');

// print out all the messages in the headless browser context
casper.on('remote.message', function(msg) {
    this.echo('remote message caught: ' + msg);
});

// print out all the messages in the headless browser context
casper.on("page.error", function(msg, trace) {
    this.echo("Mendeley authentication page error: " + msg, "ERROR");
});

casper.start(appConfig.appUrl + ':' + appConfig.appPort, function(){
    this.waitForSelector('#login');
});

casper.then(function(){
    this.fill('form#login', {
        username: credentials.username,
        password: credentials.password
    }, true);
});

casper.then(function(){
    this.echo(this.getPageContent());
});

casper.run();
