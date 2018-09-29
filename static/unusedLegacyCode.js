
  var aardOpenTags = []
  var aardOpenLineTag = false;
  function aardCloseOpenLineTag() {
    var aardTag = aardOpenTags.pop();
    if(aardTag.name !== aardOpenLineTag.name) {
      throw "open aard line-terminated tag does not match currently open tag";
    }
    return aardTagHandler(aardOpenLineTag)
    .then(()=> {
      aardOpenLineTag = false;
    });
  }

  var AARD_TAG_CLOSE_METHOD = {
    MATCHED:0,
    LINE:1,
    MAPSTART:3,
  }
  var aardTagTypes = {
    affon:AARD_TAG_CLOSE_METHOD.LINE,
    affoff:AARD_TAG_CLOSE_METHOD.LINE,
    bigmap:AARD_TAG_CLOSE_METHOD.MATCHED,
    coords:AARD_TAG_CLOSE_METHOD.LINE,
    chan:AARD_TAG_CLOSE_METHOD.LINE,
    edit:AARD_TAG_CLOSE_METHOD.MATCHED,
    equip:AARD_TAG_CLOSE_METHOD.MATCHED,
    exits:AARD_TAG_CLOSE_METHOD.LINE,
    helpbody:AARD_TAG_CLOSE_METHOD.MATCHED,
    help:AARD_TAG_CLOSE_METHOD.MATCHED,
    helpkeywords:AARD_TAG_CLOSE_METHOD.LINE,
    inventory:AARD_TAG_CLOSE_METHOD.MATCHED,
    mapstart:AARD_TAG_CLOSE_METHOD.MAPSTART,
    rdesc:AARD_TAG_CLOSE_METHOD.MATCHED,
    rname:AARD_TAG_CLOSE_METHOD.LINE,
    say:AARD_TAG_CLOSE_METHOD.LINE,
    score:AARD_TAG_CLOSE_METHOD.MATCHED,
    tell:AARD_TAG_CLOSE_METHOD.LINE,
    roomchars:AARD_TAG_CLOSE_METHOD.MATCHED,
    roomobjs:AARD_TAG_CLOSE_METHOD.MATCHED,
    scan:AARD_TAG_CLOSE_METHOD.MATCHED,
    repop:AARD_TAG_CLOSE_METHOD.LINE,
  } 

  function readAardTag(buffer) {
    return readUntil(TELNET.CLOSED_CURLY_BRACKET)
    .then(shedLastByte)
    .then(listToString)
    .then(tagText => {
      console.log("GOT RTAG"+JSON.stringify(tagText))
      var tagName = tagText.toLowerCase();
      if(tagName[0] == "/") {
        var closesTagName = tagName.slice(1);
        var topTag = aardOpenTags[aardOpenTags.length-1];
        
        if(closesTagName == topTag.name) {
          var tagType = aardTagTypes[topTag.name];
          var lastTag = aardOpenTags.pop();
          return readByte()
          .then((c)=> {
            if(c !== TELNET.LF) {
              throw "expecting close tag to be followed by LF but got "+c;
            }
          })
          .then(readByte)
          .then(c => {
            if(c !== TELNET.CR) {
              throw "expecting close tag to be secondairly  followed by CR but got "+c;
            }
          })
          .then(()=> {
            return lastTag;
          })
        }
        else {
          throw "trying to close aard tag "+closesTagName+" but the currently open tags are "+JSON.stringify(aardOpenTags);
        }
      }
      else {
        var tagBits = tagText.split(" ");
        var tagName = tagBits[0].toLowerCase();
        var tagType = aardTagTypes[tagName];
        if(typeof(tagType) == 'undefined') {
          throw "unknown aard tag "+JSON.stringify(tagName);
        }
        var aardTag = {name:tagName, buffer:new MudBuffer(inputState)};
        if(tagType == AARD_TAG_CLOSE_METHOD.MATCHED) {
          aardOpenTags.push(aardTag);
          readUntil(TELNET.CR)
          .then(discards => {
            console.log(tagName+" DISCARDED"+JSON.stringify(listToString(discards)))
          })
        }
        else if(tagType == AARD_TAG_CLOSE_METHOD.LINE) {
          aardOpenTags.push(aardTag);
          aardOpenLineTag = aardTag;
        }
        else {
          throw "dont know how to handle the tag type for "+tagName+" "+tagType;
        }
        
      }
    })
  }

  function findBuffer() {
    if(aardOpenTags.length > 0) {
      var topTag = aardOpenTags[aardOpenTags.length-1];
      return topTag.buffer;
    }
    return screenCursor;
  }
  function aardTagHandler(aardTag) {
    var tagName = aardTag.name;
    var tagType = aardTagTypes[tagName];
    var wrapper = (tagType == AARD_TAG_CLOSE_METHOD.MATCHED) ? $("<div>") : $("<div>");
    wrapper.addClass("aardTag-"+tagName);
    var buffer = findBuffer();
    for(var i=0; i< 2; i++) {
      var b = aardTag.buffer.actionBuffer.slice(-1);
      if( b == TELNET.CF || TELNET.LF) {
        aardTag.buffer.pop();
      }
    }
    console.log(aardTag.buffer.actionBuffer)
    return aardTag.buffer.readOnto(wrapper)
    .then(()=> {
      if(tagName == "rdesc") {
        $(wrapper).find("br").map(function() {
          this.replaceWith(String.fromCharCode(TELNET.SPACE));
        });
        buffer.writeAction(wrapper);
      }
      else if(tagName == "exits") {
        var exitText = wrapper.text();
        wrapper.empty();
        exitText.split(" ")
        .filter(x => x != "Exits:")
        .map(exitText => {
          var exitElement = $("<span>");
          exitElement.text(exitText);
          exitElement.addClass("exitButton");
          exitElement.click(()=> {
            sendCommand(exitText);
          });
          wrapper.append(" ");
          wrapper.append(exitElement);
        })
        buffer.writeAction(wrapper);
      }
      else if(tagName == "roomchars") {
        var l = brToDivs(wrapper);
        l.addClass("aardTag-roomchars");
        l.children().each(function() {
          $(this).addClass("roomChar");
          var desc = $(this).find(".ansi-yellow").first();
          if(desc) {
            var name = desc.text().split(" ")[0];
            $(this).click(()=> {
              sendCommand("look "+name);
            });
          }
        })
        buffer.writeAction(l);
      }
      else {
        buffer.writeAction(wrapper);
      }
      return Promise.resolve();
    });
    function brToDivs(el) {
      var elements = el.children().toArray();
      var objs = $("<div>");
      var currentObj = $("<div>");
      for(var i=0; i < elements.length; i++) {
        var element = elements[i];
        if(element.tagName == "BR") {
          objs.append(currentObj);
          currentObj = $("<div>");
        }
        else {
          currentObj.append(element);
        }
      }
      return objs;
    }
    
    //buffer.appendInputState(aardTag.buffer);
  }

  function handleTelnetByte(c) {
    function readAnsiColorSequence() {
      function isParamByte(c) {
        return c >= 48 && c < 64;
      }
      function isIntermediateByte(c) {
        return c >= 32 && c < 48;
      }
      function isFinalByte(c) {
        return c >= 64 && c < 127;
      }
      function readOne() {
        return readByte()
        .then(c => {
          if(isParamByte(c)) {
            if(intermediate.length > 0) {
              throw "received ANSI CSI parameter byte after receiving action byte";
            }
            param += String.fromCharCode(c);
            return readOne();
          }
          else if(isIntermediateByte(c)) {
            intermediate += String.fromCharCode(c);
            return readOne();
          }
          else if(isFinalByte(c)) {
            final = String.fromCharCode(c);
            return;
          }
        });
      }
      var param = "";
      var intermediate = "";
      var final;
      return readOne()
      .then(action=> {
        return Promise.resolve({param:param, intermediate:intermediate,final:final});
      });
    }
    function gotAnsiColorSequence(seq) {
      var c = seq.final;
      if(c == ANSI.CHAR_ATTR) {
        handleAnsiSequence(seq.param);
      }
      else if(c == ANSI.ERASE_IN_DISPLAY) {
        // do nothing, we aint clearing our scrollback just cus the mud told us too
      }
      else {
        throw "unknown ansi final byte "+c;
      }
    }
    function readAnsiSequence() {
      return readByte()
      .then(c => {
        if( c == ANSI.CSI) {
          return readAnsiColorSequence()
          .then(gotAnsiColorSequence);
        }
        else {
          throw "unknown Ansi sequence character "+c;
        }
      })
    }
    var buffer = findBuffer();
    var handler;
    if(c == TELNET.IAC) {
      handler = readIacControlSequence();
    }
    else if(c == TELNET.ESC) {
      handler = readAnsiSequence();
    }
    else if(c == TELNET.SB) {
      throw "SUB NOT IMPLEMENTED";
    }
    else {
      plainTextBuffer.append(String.fromCharCode(c));
      if(aardTagsEnabled && inputState.aardLineLock == false && c == TELNET.OPENED_CURLY_BRACKET) {
        handler = readAardTag(buffer)
        .then(finalizedTag => {
          if(finalizedTag) {
            return aardTagHandler(finalizedTag);
          }
        })
      } 
      else {
        var writeChar = Promise.resolve(buffer.writeAction(c));
        if(c == TELNET.LF) {
          var beforeLineHooks = [];
          if(aardOpenLineTag != false) {
            beforeLineHooks.push(aardCloseOpenLineTag());
          }
          handler = Promise.all(beforeLineHooks)
          .then(writeChar);
        }
        else {
          handler = writeChar;
        }
      }
    }
    return handler
  }

  function readTelnetData() {
    return readByte()
    .then(handleTelnetByte)
    .then(readTelnetData);
  }
  function readUntil(END) {
    return readByte()
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
  function readSubData() {
    return readUntil(TELNET.IAC)
    .then(shedLastByte)
    .then(data => {
      console.log("GOT RAW SUB READ "+data)
    })
  }
 
  var features = {}
  var aardTagsEnabled = false;
  features[FEATURE.AARD] = {
    sbHandler: function() {
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

  function readIacControlSequence() {
    return readByte()
    .then(c => {
      console.log("GOT CONTROL SEQ "+c)
      if(c == TELNET.WILL) {
        return readByte()
        .then(iacHandleWill)
      }
      if(c == TELNET.WONT) {
        return readByte()
        .then(iacHandleWont)
      }
      else if(c == TELNET.DO) {
        return readByte()
        .then(iacHandleDo);
      }
      else if(c == TELNET.DONT) {
        return readByte()
        .then(iacHandleDont);
      }
      else if(c == TELNET.GA) {
        return Promise.resolve()
      }
      else if(c == TELNET.SB) {
        return readByte()
        .then(subType => {
          var feature = features[subType];
          if(typeof(feature) === 'undefined') {
            throw "unknown IAC subtype negotiation requested "+subType;
          }
          else if(typeof(feature.sbHandler) == 'undefined') {
            throw "no SB handler for IAC type "+subType;
          }
          else {
            if(feature.sbHandler) {
              return feature.sbHandler()
              .then(()=> {
                return readByte()
                .then(cx => {
                  if(cx !== TELNET.SE) {
                    throw "IAC subnegotiation end not followed by IAC SE "+cx;
                  }
                })
              });
            }
            else {
              return readSubData()
            }
          }
        })
      }
      else {
        throw "unknown IAC control character "+c;
      }
    })
  }
  function sendRawCodes(responseData) {
    var responseData = responseData
      .map(x => String.fromCharCode(x))
      .join("");
    console.log("RAW CODE DATA IS "+JSON.stringify(responseData))
    return send("telnetWrite", responseData);
  }
  function send(action, payload) {
    var data = {
      action:action,
      payload:payload
    } 
    console.log("GOT payload "+payload)
    console.log("GOT stirnigfied payload "+JSON.stringify(payload))
    console.log("Client sending "+JSON.stringify(data))
    webSocket.send(JSON.stringify(data));
  }
  function sendRaw() {
  }
  function sendCommand(cmd) {
    var output = cmd+"\r\n";
    // local echo
    for(var i=0; i < output.length; i++) {
      socketBuffer.append(output.charCodeAt(i));
    }
    send('telnetWrite', output)
  }
  webSocket.sendCommand = sendCommand;
