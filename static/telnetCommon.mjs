import {GeneralBuffer} from './GeneralBuffer.mjs';
import {AnsiCursor} from './AnsiCursor.mjs';
import {TELNET, ANSI, FEATURE} from './constants.mjs';



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
function listToString(data) {
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
var telnetByteTriggers = [];
var outputBuffer = new GeneralBuffer();

function setupAardwolfTriggers() {
/*
  ansiByteTriggers.push({disabled:true,order:400,description:"Prompt",match:GlobTrigger("\n* > "), fire:FireElementWrap($("<div>").addClass("aardPrompt"), (element, matches)=>{
    return matches.map(match => {
      return ()=> {
        return readMatchOnto(match, element);
      }
    }).reduce((p, f) => p.then(f), Promise.resolve())
    .then(()=> {
      $("#prompt").empty();
      //return div.addClass("aardPrompt")
      $("#prompt").append(element);
      scrollBottom();
    });
  })});
  ansiByteTriggers.push({disabled:false,order:400,description:"Reconnecting",match:GlobTrigger("\n*Reconnecting to Game"), fire:(matches)=>{
    return Promise.resolve();
  }});
*/
  ansiByteTriggers.push({order:400,disabled:false,description:"Create character prompt",match:GlobTrigger("create a new character\n"), fire:FireWraps(extract =>  {
    return $("<div>")
    .addClass("btn btn-outline-primary")
    .css({
      "border":"2px solid blue"
    })
    .text(listToString(extract))
    .click(()=>{
      mudSession.sendCommand("NEW")
    });
  })});
  ansiByteTriggers.push({order:400,disabled:false,description:"auto opt-in to color at character-create",match:GlobTrigger("\rUse Color?"), fire:()=> {
    mudSession.sendCommand("Y")
  }});
  ansiByteTriggers.push({order:400,disabled:false,description:"Choose class",match:GlobTrigger("Choose your primary class,"), fire:FireWraps(extract =>  {
    var container = $("<span>");
    container.append($("<h4>",{text:"Choose your primary class."}))
    var options = ["Mage","Warrior","Thief","Ranger","Psi","Paladin","Cleric"].map(option => {
      return $("<span>")
      .addClass("btn btn-outline-primary")
      .css({
        "border":"2px solid blue"
      })
      .text(option)
      .click(()=>{
        mudSession.sendCommand(option)
      });
    });
    return $(container).append(options);
  })});
  ansiByteTriggers.push({disabled:false,order:400,description:"Map",match:GlobTrigger("<MAPSTART>@<MAPEND>"), fire:matches => {
    var outboundElement = $("<span>").addClass("aardMap");
    return readMatchOnto(matches[1], outboundElement)
    .then(()=> {
      outboundElement.find("span:contains('Exits')").last().remove()
      $("#map").empty();
      $("#map").append(outboundElement);
      var replacementElement = $("<span>").text("Map was here");
      return replaceMatches(matches, document.createComment("MAP was here but replaced by trigger"))
    });
  }});
/*
  SIMPLE MAP EXAMPLE
  ansiByteTriggers.push({disabled:false,order:400,description:"Map",match:GlobTrigger("<MAPSTART>@<MAPEND>"), fire:matches => {
    var outboundElement = $("<span>").addClass("aardMap");
    return readMatchOnto(matches[1], outboundElement)
    .then(()=> {
      $("#map").empty();
      $("#map").append(outboundElement);
      var replacementElement = $("<span>").text("Map was here");
      return replaceMatches(matches, document.createComment("MAP was here but replaced by trigger"))
    });
  }});
*/
/*
  ansiByteTriggers.push({order:400,disabled:false,description:"Choose subclass",match:GlobTrigger("* SUBCLASSES ]"), fire:FireWraps(extract =>  {
    var container = $("<span>");
    container.append($("<h4>",{text:"Choose your subclass."}))
    var options = ["TEST A","TEST B"].map(option => {
      return $("<span>")
      .addClass("btn btn-outline-primary")
      .css({
        "border":"2px solid blue"
      })
      .text(option)
      .click(()=>{
        mudSession.sendCommand(option)
      });
    });
    return $(container).append(options);
  })});
*/
  ansiByteTriggers.push({order:400,disabled:false,description:"Choose Yes No",match:GlobTrigger("[Y/N]"), fire:FireWraps(extract =>  {
    var yes = $("<span>")
    .addClass("btn btn-outline-primary")
    .css({
      "border":"2px solid blue"
    })
    .text("Yes")
    .click(()=>{
      mudSession.sendCommand("Y")
    });
    var no  = $("<span>")
    .addClass("btn btn-outline-primary")
    .css({
      "border":"2px solid blue"
    })
    .text("No")
    .click(()=>{
      mudSession.sendCommand("N")
    });
    return $("<span>").append([yes, no]);
  })});
  ansiByteTriggers.push({order:400,disabled:false,description:"Line Rule",match:GlobTrigger("-----------------------------------------------------------------------------\n"), fire:FireWraps(()=>$("<hr>"))});
  function sayMatches(matches) {
   console.log("wrap fired hr matches "+matches,matches)
  }
  function aardUnmatchedTrigger(tagName, elementTemplate) {
    ansiByteTriggers.push({order:400,disabled:false,description:"aardTag-unmatched-"+tagName,match:GlobTrigger("{"+tagName+"}@\n"), fire:(matches => {
      var element = elementTemplate ? elementTemplate.clone() : $("<span>");
      var tagContent = element.addClass("aardTag-"+tagName);
      return readMatchOnto(matches[1], tagContent)
      .then(()=> {
        return replaceMatches(matches, tagContent)
      });
    })})
  }
  function aardMatchedTrigger(tagName, elementTemplate) {
    ansiByteTriggers.push({order:400,disabled:false,description:"aardTag-matched-"+tagName,match:GlobTrigger("{"+tagName+"}\n@{/"+tagName+"}\n"), fire:(matches => {
      var element = elementTemplate ? elementTemplate.clone() : $("<span>");
      var tagContent = element.addClass("aardTag-"+tagName);
      return readMatchOnto(matches[1], tagContent)
      .then(()=> {
        return replaceMatches(matches, tagContent)
      });
    })})
  }
  aardUnmatchedTrigger("rname",$("<div>"));
  aardMatchedTrigger("rdesc");
  aardMatchedTrigger("roomobjs");
  aardMatchedTrigger("roomchars");
  aardUnmatchedTrigger("exits");
  aardUnmatchedTrigger("coords");
  //ansiByteTriggers.push({order:400,disabled:false,description:"aardTag-matched-chan",match:GlobTrigger("{chan ch=*}*"), fire:ClassWrap("div","aardTag-chan")});
  aardUnmatchedTrigger("repop");
  aardUnmatchedTrigger("affon");
  aardUnmatchedTrigger("affoff");

}


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
    features[FEATURE.AARD] = {
      sbHandler: function() {
        console.log("Handling Aard")
        aardTagsEnabled = true;
        return readUntil(TELNET.IAC)
        .then(shedLastByte)
        .then(rawData => {
          var data = listToString(rawData);
        });
      }
    }
    features[FEATURE.ATCP] = {
      sbHandler: function() {
        console.log("Handling Atcp")
        return readUntil(TELNET.IAC)
        .then(shedLastByte)
        .then(rawAtcpData => {
          var atcpData = listToString(rawAtcpData);
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
          var packageData = listToString(rawPackageData);
          return readUntil(TELNET.IAC)
          .then(shedLastByte)
          .then(rawJsonData => {
            var jsonData = listToGmcpString(rawJsonData);
            console.log("RAW PACKAGE "+packageData)
            console.log("GOT JSON "+jsonData)
            try {
              var result = JSON.parse(jsonData);
              console.log("GMCP Package: "+gmcpPackage+" "+JSON.stringify(result));
              return Promise.resolve();
            }
            catch(e) {
              throw "unable to parse JSON from gmcp for gmcpPackage "+gmcpPackage+" "+jsonData;
            }
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
              //var handler = feature.sbHandler ? feature.sbHandler : unimplementedSbHandler;
              var handler = unimplementedSbHandler;
              return handler()
              .then(result => {
                return cursor.readNext()
                .then(b => {
                  if(b != TELNET.SE) {
                    throw "IAC Subnegotation terminated by IAC but then not followed immediately by SE - instead got "+b;
                  }
                  console.log("_____________ END SB HANDLE ",cursor.position)
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
function GlobMatch(txt) {
  var characterClassState = {
    excludedCharacters:[]
  }
  return InnerGlobMatch(txt, characterClassState);
}
function InnerGlobMatch(txt, characterClassState) {
  return function(cursor) {
    var startCursor = cursor.clone();
    var remaining = txt;

    function testRemainingUntilSuccess() {
      var splitCursor = cursor.clone();
      var wildcardStartCursor = cursor.clone();
      console.log("head Split pos was "+splitCursor.position)
      var literalMatch = {
        type:'literal',
        startCursor:startCursor,
        afterCursor:splitCursor,
      }
      function tryNext() {
        return cursor.readNext()
        .then(b => {
          if(characterClassState.excludedCharacters.indexOf(b) !== -1) {
            return;
          }
          var preMatchAttemptCursor = cursor.clone();
          var subtrigger = InnerGlobMatch(remaining, characterClassState);
          return subtrigger(cursor)
          .then(subMatches => {
            if(subMatches) {
              var wildcardMatch = {
                type:'wildcard',
                startCursor:wildcardStartCursor,
                afterCursor:preMatchAttemptCursor
              }
              console.log(txt,"found subhead match ", [literalMatch, wildcardMatch, ...subMatches]);
              return [literalMatch, wildcardMatch, ...subMatches];
            }
            else {
              cursor.position = preMatchAttemptCursor.position;
              return tryNext();
            }
          });
        });
      }
      return tryNext();
    }
    function checkCurrentLetter() {
      if(remaining.length == 0) {
        var match = {
          startCursor:startCursor,
          afterCursor:cursor
        }
        console.log(txt,"Found head match of",match)
        return [match];
      }
      else {
        var expectedC = remaining[0];
        remaining = remaining.slice(1);
        if(expectedC == "@") {
          return testRemainingUntilSuccess();
        }
        else if(expectedC == "*") {
          characterClassState.excludedCharacters.push(TELNET.LF);
          return testRemainingUntilSuccess();
        }
        else if(expectedC == "$") {
          return checkCurrentLetter();
        }
        else {
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


function GlobTrigger(pattern) {
  return GlobMatch(pattern);
}

function FireWraps(...wraps) {
  return function(matches) {
    console.log("FireWraps for "+matches.length+" matches")
    console.log(wraps)
    console.log(matches)
    return Promise.all(matches.map((match, i) => {
      var wrap = wraps[i];
      console.log("Firing wrap for match "+i, wrap)
      var len = match.afterCursor.position - match.startCursor.position;
      return match.afterCursor.buffer.slice(match.startCursor.position,match.afterCursor.position)
      .then(wrap)
      .then(el => {
        console.log("Wrap got element",match.startCursor.position,len,el)
        return match.afterCursor.buffer.splice(match.startCursor.position, len, el)
      });
    }));
  }
}
function replaceMatches(matches, ...replacementElements) {
  var firstMatch = matches[0];
  var buffer = firstMatch.startCursor.buffer;
  var lastMatch = matches.slice(-1)[0];
  var startPosition = firstMatch.startCursor.position;
  var endPosition = lastMatch.afterCursor.position;
  var len = endPosition - startPosition;
  console.log("Cutting out "+buffer.data.slice(startPosition, startPosition+len))
  return buffer.splice(startPosition, len, ...replacementElements);
}


function readMatchOnto(match, el) {
  var buffer = new GeneralBuffer();
  var cursor = new AnsiCursor(buffer);
  console.log(match)
  console.log("STARTING SLICE from",match.startCursor.position,"to",match.afterCursor.position)
  return match.startCursor.buffer.slice(match.startCursor.position, match.afterCursor.position)
  .then(excerpt => {
    console.log("GOT EXCERPT")
    console.log(excerpt);
    excerpt.map(val => buffer.append(val));
    var element = $(el);
    return cursor.writeAll(element)
    
  });
}
function FireElementWrap(elementTemplate, wrap) {
  return function(matches) {
    var element = elementTemplate.clone();
    return Promise.resolve(wrap(element, matches))
    .then(()=> {
      return replaceMatches(matches, element);
    })
  }
}
function ClassWrap(elementType, className) {
  return $("<hr>");
/*
  return FireElementWrap(elementType, div => {
    div.addClass(className);
    return div;
  });
*/
}

/*
ansiByteTriggers.push({order:400,description:"Snails turf?",match:GlobTrigger("SNAILZ TURF!"), fire:FireWraps(matches =>  {
  return $("<span>")
  .css({
    "background-color":"red",
    "margin":"3em",
    "border-radius":"1em",
  })
  .text(listToString(matches[0]));
})});

ansiByteTriggers.push({order:400,description:"Embed jpg",match:GlobTrigger("https://*.jpg"), fire:FireWraps(matches =>  {
  return $("<img>")
  .css({
    "background-color":"yellow",
    "margin":"3em",
    "border-radius":"1em",
  })
  .attr("src", listToString(matches[0]));
})});

ansiByteTriggers.push({order:400,description:"Who",match:GlobTrigger("\x1b[1;37m\x1b[44m*Aardwolf Players Online*Max on*37m]"), fire:FireElementWrap("div", div =>  {
    alert("WHEE")
  div.addClass("aardCmd-who");
  return div;
})});
ansiByteTriggers.push({order:400,description:"Chat",match:GlobTrigger("{chat ch=tech}"), fire:FireWraps(extract =>  {
  return $("<pre>")
  .css({
    "background-color":"yellow",
    "margin":"3em",
    "border-radius":"1em",
  })
  .text(listToString(extract));
})});
*/

/*
ansiByteTriggers.push({order:500,description:"Image trigger",match:function(cursor) {
  var startCursor = cursor.clone();
  var textMatch = GlobMatch("https://*.png ");
  return textMatch(cursor)
  .then(match => {
    if(match) { 
      return {
        match:match,
        startCursor:startCursor,
        afterCursor:cursor,
      }
    }
  })
}, fire:(result)=>{
  return result.afterCursor.buffer.slice(result.startCursor.position,result.afterCursor.position)
  .then(urlData => {
    console.log("SLICING "+listToString(urlData))
    var url = listToString(urlData);
    var img = $("<img>");
    img.attr("src", url);
    $("#scrollback").append(img);
    return "Dog";
  });
}})
*/

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

export function setupMudSession(WebSocketClass, options) {
  scrollBottom = options.scrollBottom;
  screenCursor = options.screenCursor;

  var webSocket = new WebSocketClass(options.portalUrl, ['echo-protocol']);
  var mudSession = new MudSession(webSocket);

  setupTriggers(mudSession)
  webSocket.onopen = function() {
    console.log('WebSocket Client Connected');
    mudSession.sendToProxy('connect', {host:options.host,port:options.port})
    mudSession.sendRawCodes([TELNET.IAC,TELNET.WILL,FEATURE.MXP])
    mudSession.sendRawCodes([TELNET.IAC,TELNET.WILL,FEATURE.GMCP])
    mudSession.sendRawCodes([TELNET.IAC,TELNET.WILL,FEATURE.ATCP])
    mudSession.sendRawCodes([TELNET.IAC,TELNET.WILL,FEATURE.AARD])
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
      else if(action == "proxyError") {
        throw message;
      }
      else {
        //console.log("Client received: '" + message.utf8Data + "'");
      }
    }
  }
  return mudSession;
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
