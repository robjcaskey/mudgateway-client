import {GeneralBuffer} from './GeneralBuffer.mjs';
import {AnsiCursor} from './AnsiCursor.mjs';
import {TELNET, ANSI, FEATURE} from './constants.mjs';
import {ansiListToString, replaceMatches} from './util.mjs';



export function MudBuffer() {
  this.pendingReads = []
  this.actionBuffer = [];
}
MudBuffer.prototype.draw = function(el) {
  this.writeAction(el);
}
MudBuffer.prototype.flush = function() {
  
}

MudBuffer.prototype.writeAction = function(action) {
  if(this.waitingForAction) {
    this.waitingForAction(action);
    this.waitingForAction = false;
  }
  else {
    this.actionBuffer.push(action);
  }
}
MudBuffer.prototype.pipe = function(element) {
  return this.readAction()
  .then(action => {
    return this.doRenderAction(action, element);
  })
  .then(()=> {
    return this.pipe(element);
  });
}
MudBuffer.prototype.readOnto = function(element) {
  if(this.actionBuffer.length > 0) {
    return this.readAction()
    .then(action => {
      return this.doRenderAction(action, element);
    })
    .then(()=> {
      return this.readOnto(element);
    });
  }
  else {
    return Promise.resolve();
  }
}
MudBuffer.prototype.pop = function() {
  return this.actionBuffer.pop();
}
MudBuffer.prototype.readAction = function() {
  if(this.actionBuffer.length >  0) {
    var action = this.actionBuffer.shift();
    return Promise.resolve(action);
  }
  else {
    return new Promise((resolve, reject) => {
      this.waitingForAction = resolve;
    });
  }
}

export var telnetStartState = {
  aardLineLock:false,
  ansi:{}
}
var inputState = telnetStartState;

 
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



function charDesc(c) {
  if(c == TELNET.ESC) {
    return "ESC -------------------------------------";
  }
  else if(c > 32 || c < 239) {
    return String.fromCharCode(c);
  }
  else {
    return "unprintable";
  }
}
function telnetListToString(data) {
  return data.map(x => String.fromCharCode(x))
  .join("");
}
function listToGmcpString(data) {
  function encodeChar(x) {
    if(x > 127) {
      var hexVal = x.toString(16);
      return "\\"+hexVal;
    }
    return String.fromCharCode(x);
  }
  return data.map(encodeChar)
  .join("");
}



var ansiByteTriggers = []
var gmcpTriggers = [];
var telnetByteTriggers = [];
var outputBuffer = new GeneralBuffer();

function setupTriggers(mudSession) {
  telnetByteTriggers.push({order:100,disabled:false,description:"telnet IAC master logic",match:(cursor) => {
    var features = {}
    var aardTagsEnabled = false;
    function readUntil(END) {
      return cursor.readNext()
      .then(c => {
        if(c == END) {
          return [c];
        }
        else {
          return readUntil(END)
          .then(rest => {
            return [c].concat(rest);
          });
        }
      })
    }
    function shedLastByte(l) {
      l.pop();
      return Promise.resolve(l);
    }
    features[FEATURE.EOR] = {}
    features[FEATURE.AARD] = {
      sbHandler: function() {
        console.log("Handling Aard")
        aardTagsEnabled = true;
        return readUntil(TELNET.IAC)
        .then(shedLastByte)
        .then(rawData => {
          var data = telnetListToString(rawData);
        });
      }
    }
    features[FEATURE.ATCP] = {
      sbHandler: function() {
        console.log("Handling Atcp")
        return readUntil(TELNET.IAC)
        .then(shedLastByte)
        .then(rawAtcpData => {
          var atcpData = telnetListToString(rawAtcpData);
          console.log("GOT ATCP DATA "+atcpData)
        });
      }
    }
    features[FEATURE.GMCP] = {
      sbHandler: function() {
        console.log("Handling Gmcp")
        console.log("STARTING GMCP")
        var gmcpPackage;
        var jsonData;
        return readUntil(TELNET.SPACE)
        .then(shedLastByte)
        .then(rawPackageData => {
          var packageNameData = telnetListToString(rawPackageData);
          return readUntil(TELNET.IAC)
          .then(shedLastByte)
          .then(rawJsonData => {
            var jsonData = listToGmcpString(rawJsonData);
            console.log("RAW PACKAGE "+packageNameData)
            console.log("GOT JSON "+jsonData)
            try {
              var result = JSON.parse(jsonData);
              console.log("GMCP Package: "+gmcpPackage+" "+JSON.stringify(result));
            }
            catch(e) {
              throw "unable to parse JSON from gmcp for gmcpPackage "+packageNameData+" "+jsonData;
            }
            return mudSession.onGmcpEvent(packageNameData, result);
          });
        })
      }
    }
    //features[FEATURE.MXP] = {}

    function iacHandleWill() {
      return cursor.readNext()
      .then((featureCode)=> {
        var feature = features[featureCode];
        if(typeof(feature) !== 'undefined') {
          console.log("GOT FEATURE REQUEST")
          mudSession.sendRawCodes([TELNET.IAC,TELNET.DO, featureCode])
          console.log("Enabling feature")
        }
        console.log("GOT FREATURE REQUEST "+featureCode)
      })
    }

    function iacHandleDo(featureCode) {
      console.log("GOT DO REQUEST "+featureCode);
      return cursor.readNext();
    }
    function iacHandleDont(featureCode) {
      console.log("GOT DONT REQUEST "+featureCode);
      return cursor.readNext();
    }
    function iacHandleWont(featureCode) {
      console.log("GOT WONT REQUEST "+featureCode);
      return cursor.readNext();
    }
    function unimplementedSbHandler() {
      return readUntil(TELNET.IAC);
    }
    function readIacControlSequence() {
      console.log("____*** NEW IAC EQ ",cursor.position)
      return cursor.readNext()
      .then(c => {
        if(c == TELNET.WILL) {
          return iacHandleWill();
        }
        if(c == TELNET.WONT) {
          return iacHandleWont();
        }
        else if(c == TELNET.DO) {
          return iacHandleDo();
        }
        else if(c == TELNET.DONT) {
          return iacHandleDont();
        }
        else if(c == TELNET.GA) {
          alert("GOT GA")
          return Promise.resolve()
        }
        else if(c == TELNET.SB) {
              //console.log("_____________ START SB HANDLE " ,cursor.position)
          return cursor.readNext()
          .then(subType => {
            var feature = features[subType];
            if(typeof(feature) === 'undefined') {
              throw "unknown IAC subtype negotiation requested "+subType;
            }
            else if(typeof(feature.sbHandler) == 'undefined') {
              throw "no SB handler for IAC type "+subType;
            }
            else {
              var handler = feature.sbHandler ? feature.sbHandler : unimplementedSbHandler;
              //var handler = unimplementedSbHandler;
              return handler()
              .then(result => {
                return cursor.readNext()
                .then(b => {
                  if(b != TELNET.SE) {
                    throw "IAC Subnegotation terminated by IAC but then not followed immediately by SE - instead got "+b;
                  }
                  console.log("_____________ END SB HANDLE ",cursor.position," for subtype",subType)
                });
              });
            }
          })
        }
        else {
          throw "unknown IAC control character "+c;
        }
      })
    }
    //console.log("STARTING CURSOR ",cursor, cursor.buffer.data.slice(1946,1956))
    var startCursor = cursor.clone();
    return cursor.readNext()
    .then(b => {
      if(b == TELNET.IAC) {
        cursor.debugLog = x => console.log("IAC Control Sequence:",x,charDesc(x))
        return readIacControlSequence()
        .then(()=> {
          console.log("___ END IAC")
          cursor.debugLog = false;
          return {
            startCursor:startCursor,
            afterCursor:cursor
          }
        })
      }
    })
  }, fire:(match)=>{
    console.log("REPLACING IAC MATCH",match,match.startCursor.position,match.afterCursor.position,match.afterCursor.buffer)
    return replaceMatches([match])
  }});
  var telnetTriggerCursor = mudSession.socketBuffer.cursor();
  var ansiBuffer = new GeneralBuffer();
  var ansiTriggerCursor = ansiBuffer.cursor();

  doTriggerType(telnetByteTriggers, telnetTriggerCursor, ansiTriggerCursor);
  doTriggerType(ansiByteTriggers, ansiTriggerCursor, screenCursor, $("#statusBar"));

}



var screenCursor;
var scrollBottom;

function doTriggerType(Triggers, triggerCursor, outputCursor, statusElement) {
  function fireTriggersForPosition() {
    // work on all the triggers
    // if a match fires then rerun all other triggers that haven't already fired

    // clone array with slice
    var remainingTriggers = Triggers.slice(0);
    var changes = false;
    var waitForChanges = triggerCursor.buffer.waitForChangeAtOrAfterPosition(triggerCursor.position);
    waitForChanges.promise.then(()=> {
      //alert("GOT CHANGES")
      changes = true;
    });
    function nextTrigger() {
      function redoTriggers() {
        waitForChanges.stopWaiting();
        triggerCursor.position = triggerCursor.position -  1;
        return fireTriggersForPosition();
      }
      var cursor = triggerCursor.clone();
      if(remainingTriggers.length > 0) {
        var trigger = remainingTriggers.shift();
        $(statusElement).text("checking for trigger "+trigger.description)
        return trigger.match(cursor)
        .then(matchResult => {
          $(statusElement).empty();
          if(changes) {
            return redoTriggers();
          }
          else {
            if(matchResult) {
              console.log("firing "+trigger.description)
              return Promise.resolve(trigger.fire(matchResult))
              .then(()=> {
                if(changes) {
                  return redoTriggers();
                }
                else {
                  return nextTrigger();
                }
              })
            }
            else {
              return nextTrigger();
            }
          }
        });
      }
      else {
        waitForChanges.stopWaiting();
        return cursor.buffer.readPosition(cursor.position)
        .then(data => {
          outputCursor.buffer.append(data)
        })
      }
    }
    return nextTrigger();
  }
  function doTriggers() {
    function outputCurrentCharacter() {
      
    }
    return fireTriggersForPosition()
    .then(()=> {
        return triggerCursor.readNext()
    })
    .then(outputCurrentCharacter)
    .then(doTriggers);
  }
  doTriggers();
}




function LiteralTrigger(txt) {
  return function(cursor) {
    var remaining = txt;
    function checkCurrentLetter() {
      if(remaining.length == 0) {
        return true;
      }
      else {
        var expectedC = remaining[0];
        remaining = remaining.slice(1);
        return cursor.readNext()
        .then(b => {
          var c = String.fromCharCode(b);
          if(c == expectedC) {
            return checkCurrentLetter();
          }
          else {
            return false;
          }
        });  
      }
    }
    return checkCurrentLetter();
  }
}



function RegexTrigger(regex, bufferSize) {
  return function(cursor) {
    var txt = "";
    function tryNext(depth) {
      // hacky optimziation dont wait for regexes to be completed :(
      // should eat least recheck once after a few ms
      if(cursor.position == cursor.buffer.data.length) {
        return Promise.resolve();
      }
      return cursor.readNext()
      .then(byte => {
        txt += String.fromCharCode(byte);
        var result = regex.exec(txt);
        if(result) {
          return Promise.resolve({
            match:result[0],
            startCursor:startCursor,
            afterCursor:cursor,
          });
        }
        else {
          if(depth < bufferSize) {
            return tryNext(depth+1);
          }
          else {
            return Promise.resolve();
          }
        }
      })
    }
    var startCursor = cursor.clone();
    return tryNext(0);
  }
}





ansiByteTriggers.sort(trigger => trigger.order);
ansiByteTriggers = ansiByteTriggers.filter(trigger => !trigger.disabled);

function MudSession(webSocket) {
  this.webSocket = webSocket;
  this.socketBuffer = new GeneralBuffer();
}
MudSession.prototype.sendRawCodes = function(responseData) {
  var responseData = responseData
    .map(x => String.fromCharCode(x))
    .join("");
  console.log("RAW CODE DATA IS "+JSON.stringify(responseData))
  return this.sendToProxy("telnetWrite", responseData);
}
MudSession.prototype.sendCommand = function(cmd) {
    var output = cmd+"\r\n";
    // local echo
    for(var i=0; i < output.length; i++) {
      this.socketBuffer.append(output.charCodeAt(i));
    }
    this.sendToProxy('telnetWrite', output)
  }
MudSession.prototype.sendToProxy = function(action, payload) {
  var data = {
    action:action,
    payload:payload
  } 
  console.log("GOT payload "+payload)
  console.log("GOT stirnigfied payload "+JSON.stringify(payload))
  console.log("Client sending "+JSON.stringify(data))
  this.webSocket.send(JSON.stringify(data));
}
MudSession.prototype.addAnsiByteTrigger = function(trigger) {
  return ansiByteTriggers.push(trigger);
};
MudSession.prototype.addGmcpTrigger = function(trigger) {
  return gmcpTriggers.push(trigger);
};
MudSession.prototype.onGmcpEvent = function(name, data) {
  Promise.all(gmcpTriggers.map(trigger => {
    return trigger.fire(name, data);
  }));
};

export function setupMudSession(WebSocketClass, getPortalUrl, options) {
  return getPortalUrl(options)
  .then(portalUrl => {
    scrollBottom = options.scrollBottom;
    screenCursor = options.screenCursor;

    var webSocket = new WebSocketClass(portalUrl, ['echo-protocol']);
    var mudSession = new MudSession(webSocket);

    setupTriggers(mudSession)
    function onConnect() {
      mudSession.sendRawCodes([TELNET.IAC,TELNET.WILL,FEATURE.EOR])
      mudSession.sendRawCodes([TELNET.IAC,TELNET.WILL,FEATURE.MXP])
      mudSession.sendRawCodes([TELNET.IAC,TELNET.WILL,FEATURE.GMCP])
      mudSession.sendRawCodes([TELNET.IAC,TELNET.WILL,FEATURE.ATCP])
      mudSession.sendRawCodes([TELNET.IAC,TELNET.WILL,FEATURE.AARD])
      if(options.onConnect) {
        options.onConnect(mudSession);
      }
    }
    webSocket.onopen = function() {
      console.log('WebSocket Client Connected');
      mudSession.sendToProxy('connect', {host:options.host,port:options.port})
    }
    var cursor = mudSession.socketBuffer.cursor();
    webSocket.onerror = function(error) {
        console.log("Connection Error: " + JSON.stringify(error))
    }
    webSocket.onclose = function() {
        console.log('echo-protocol Connection Closed');
    }
    webSocket.onmessage = function(message) {
      var waitingForData = false;

      function waitForData() {
        return new Promise((resolve, reject) => {
          waitingForData = resolve;
        });
      }

      if (message.type === 'message') {
        var data = JSON.parse(message.data);
        console.log(data)
        var action = data.action;
        var payload = data.payload;
        if(action == "telnetData") {
          var data = payload.data;
          for(var i=0; i < data.length; i++) {
            mudSession.socketBuffer.append(data[i])
          }
          if(waitingForData) {
            waitingForData();
            waitingForData = false;
          }
        }
        else if(action == "connected") {
          onConnect();
        }
        else if(action == "proxyError") {
          throw message;
        }
        else {
          //console.log("Client received: '" + message.utf8Data + "'");
        }
      }
    }
    return mudSession;
  });
}

export function makeScreen() {
  return new GeneralBuffer();
}

if(typeof(module) !== 'undefined') {
  module.exports = {
    setupConnection:setupConnection,
    TELNET:TELNET,
  }
}
