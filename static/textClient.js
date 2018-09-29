#!/usr/bin/env node

var WebSocket = require('websocket').w3cwebsocket;

var readline = require('readline');
var telnetCommon = require('./telnetCommon');
var TELNET = telnetCommon.TELNET;

var URL = 'ws://54.197.28.49:8080/';

function prompt() {
  const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
  });
  return new Promise((resolve, reject) => {
    rl.question('> ', (value) => {
      rl.close();
      resolve(value);
    });
  });
}

var host = process.argv[2];
var port = process.argv[3] ;

var screen = { }

screen.doTab = function() {
  process.stdout.write(String.fromCharCode(TELNET.TAB))
  return Promise.resolve();
};
screen.doLineFeed = function() {
  process.stdout.write(String.fromCharCode(TELNET.LF))
  return Promise.resolve();
};
screen.gotAnsiColorParam = function(param) {
}
screen.doCarriageReturn = function() {
  process.stdout.write(String.fromCharCode(TELNET.CR))
  return Promise.resolve();
}


var client = telnetCommon.setupConnection(WebSocket, {
    portalUrl:URL,
    host:host,
    port:port,
    prompt:prompt,
    screen:screen,
});
