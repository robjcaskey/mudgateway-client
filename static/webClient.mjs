import {GeneralBuffer} from './GeneralBuffer.mjs';
import {setupMudSession} from './telnetCommon.mjs';
import {AnsiCursor} from './AnsiCursor.mjs';

// undefined to use mudgateway or ws://hostname.goes.here:8080
var PORTAL_URL = undefined;

function draw(el) {
  flushOutputBuffer();
  return unbufferedDraw(el);
}
function unbufferedDraw(el) {
  $(insertionPoint).append(el);
  scrollBottom();
  return Promise.resolve();
}
function flushOutputBuffer() {
  var txt = outputBuffer;
  outputBuffer = "";
  var element = document.createTextNode(txt);
  return unbufferedDraw(element);
}

function debounce(fun, wait, runNow) {
  var timeout;
  return function() {
    var ctx = this;
    var args = arguments;
    var delayedFun = function() {
      timeout = null;
      if (!runNow) fun.apply(ctx, args);
    };
    var callNow = runNow && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(delayedFun, wait);
    if (callNow) fun.apply(ctx, args);
  };
};

var outputBuffer = "";
var flushOutputBufferRegularly = debounce(flushOutputBuffer, 0);
function bulkDrawChar(c) {
  if(c < 32 || c > 239) {
    throw "unexpected non-printable character "+c;
  }
  //console.log(c+" "+String.fromCharCode(c));
  var sc = String.fromCharCode(c);
  outputBuffer += sc;
  return flushOutputBufferRegularly();
}
function writeStringToScreen(x) {
  flushOutputBuffer();
  var s = document.createTextNode(x);
  draw(x);
  screenCursor.inputState.lineStarted = false;
}


var screenBuffer = new GeneralBuffer();
var screenCursor = new AnsiCursor(screenBuffer);

function justUseUrl() {
  return Promise.resolve(PORTAL_URL);
}

var lookUpMudGatewayUrl = function(options) {
  var apiRoot = "https://api-dev.mudgateway.com";
  var apiUrl = apiRoot+"/getPortalUrl";
  return new Promise((resolve, reject) => {
    $.post(apiUrl, {
      host:options.host,
      port:options.port
    }, (data) => {
      resolve(data.portalUrl);
    }, "json");
  });
}
var getPortalUrl = typeof(PORTAL_URL) !== 'undefined' ? justUseUrl : lookUpMudGatewayUrl;


setupMudSession(WebSocket, getPortalUrl, {
  scrollBottom:scrollBottom,
  //host:'3k.org',
  //port:'3000',
  //host:'mush.pennmush.org',
  //port:'4201',
  //host:'8bit.fansi.org',
  //host:'mush.pennmush.org',
  //port:'4201',
  //host:'midmud.com',
  //port:'5555',
  host:'aardmud.org',
  port:'23',
  //host:'boa.sindome.org',
  //port:'5555',
  screenCursor:screenCursor,
  onConnect:initMudSession
})


function scrollBottom() {
  $('html, body').scrollTop($(document).height());
  setTimeout(()=> {
    $('html, body').scrollTop($(document).height());
  }, 0);
}
var insertionStack = [];
var insertionPoint;
function insertionPush(x) {
  flushOutputBuffer();
  insertionPoint.append(x);
  insertionStack.push(x);
  insertionPoint = x;
}
function insertionPop() {
  flushOutputBuffer();
  insertionStack.pop();
  recalculateInsertionPoint();
}
function recalculateInsertionPoint() {
  var idx = insertionStack.length - 1;
  insertionPoint = insertionStack[idx];
}
function BufferTarget(element) {
  this.element = element;
}
BufferTarget.prototype.append = function(x) {
  if($(x).hasClass('ansi')) {
    $(x).addClass("ansi-direct");
    
/*
    $(x).contents()
    .filter(()=> {
      return this.attr('nodeType') === 3;
    })
    .map(textNode => {
      alert(textNode);
      textNode.remove();
      //textNode.replace(TELNET.SPACE, TELNET.NONBREAKING_SPACE);
    })
*/
  }
  this.element.append(x);
  scrollBottom();
}

function initMudSession(mudSession) {
  insertionPoint = $("#scrollback");
  var screenOutput = new BufferTarget($("#scrollback"));
  screenCursor.pipe(screenOutput);

  insertionStack = [insertionPoint];
  if(localStorage.autorun) {
    setTimeout(()=>{
      mudSession.sendCommand(localStorage.autorun);
    },1000);
  }
 $("#commandLine").keypress(e => {
    if(e.which == 13) {
      var val = $("#commandLine").val();
      mudSession.sendCommand(val);
      //writeStringToScreen(val)
      //screen.doCarriageReturn();
      $("#commandLine").val("");
      scrollBottom();
    }
  });
  $("#commandLine").focus();
}

$(()=> {
});

