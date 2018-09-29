import {TELNET, ANSI} from './constants.mjs';

var ansiColors = [ 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white' ]

export function AnsiCursor(buffer) {
  this.buffer = buffer;
  this.generalCursor = buffer.cursor();
  this.ansi = {}
  this.pendingControlSequence = []
}
AnsiCursor.prototype.clone = function() {
  var cursor = AnsiCursor(this.buffer);  
  cursor.ansi = this.ansi;
  cursor.pendingControlSequence = this.pendingControlSequence;
  cursor.generalCursor.position = this.generalCursor.position;
  return cursor;
}
AnsiCursor.prototype.writeAll = function(element) {
  if(this.generalCursor.position >= this.buffer.end - 1) {
    return Promise.resolve();
  }
  return this.generalCursor.readNext()
  .then(val => {
    // finally after all those function definitions actually do stuff
    if(val == TELNET.ESC) {
      return readAnsiSequence(this);
    } 
    else {
      return renderElement(this, val, element);
    }
  })
  .then(()=> {
    return this.writeAll(element);
  });
}
AnsiCursor.prototype.pipe = function(element) {
  return this.generalCursor.readNext()
  .then(val => {
    // finally after all those function definitions actually do stuff
    if(val == TELNET.ESC) {
      return readAnsiSequence(this);
    } 
    else {
      return renderElement(this, val, element);
    }
  })
  .then(()=> {
    return this.pipe(element);
  });
}
AnsiCursor.prototype.cursorAtPosition = function(position) {
  function readUntilPosition() {
    return cursor.readNext()
    .then(byte => {
      if(byte == TELNET.ESC) {
        return readAnsiSequence(this);
      }
      if(cursor.position < position) {
        return readUntilPosition();
      }
    });
  }
  var cursor = this.clone();
  cursor.position = 0;
  return readUntilPosition()
  .then(()=> {
    return cursor;
  });
}

function renderElement(cursor, val, element) {
  function createAnsiContainerElement(state) {
    var newElement = $("<span>");
    newElement.addClass("ansi");
    if(state.bold) {
      newElement.addClass("ansi-bold");
    }
    if(state.inverted) {
      if(state.bg) {
        newElement.addClass("ansi-fg-"+state.bg);
      }
      if(state.fg) {
        newElement.addClass("ansi-bg-"+state.fg);
      }
    }
    else {
      if(state.bg) {
        newElement.addClass("ansi-bg-"+state.bg);
      }
      if(state.fg) {
        newElement.addClass("ansi-fg-"+state.fg);
      }
    }
    return newElement;
  }

  if(typeof(val) == 'object') {
    cursor.textNode = false;
    element.append(val);
  }
  else {
    var c = val;
    if(c == TELNET.CR) {
      cursor.textNode = false;
      element.append(document.createComment("telnetCR"))
    }
    else if(c == TELNET.LF) {
      cursor.textNode = false;
      element.append("<br class='telnetLF'>");
    }
    else {
      if(!cursor.textNode) {
        var newTextNode = document.createTextNode("");
        var newAnsiContainer = createAnsiContainerElement(cursor.ansi);
        //newAnsiContainer.attr('data-start-char',c)
        newAnsiContainer.append(newTextNode);
        element.append(newAnsiContainer);
        cursor.textNode = newTextNode;
      }

      if(c == TELNET.SPACE) {
        cursor.textNode.textContent += String.fromCharCode(TELNET.SPACE);
        //this.textNode.textContent += String.fromCharCode(TELNET.NONBREAKING_SPACE);
      }
      else {
        cursor.textNode.textContent += String.fromCharCode(c);
      }
    }
  }
}

function readAnsiSequence(cursor) {
  function readNext() {
    return cursor.generalCursor.readNext()
    .then(c => {
      cursor.pendingControlSequence.push(c);
      return c;
    });
  }
  function handleAnsiSequence(rawParams) {
    var state = cursor.ansi;
    console.log("INPUT STATE "+JSON.stringify(state))
    console.log("INPUT RAW ANSII "+JSON.stringify(rawParams))
    var params = rawParams.split(";");
    function readParam() {
      var param = params.shift();
      //console.log("got ansi param "+param)
      return parseInt(param);
    }
    function recursivelyParseParams() {
      var v = readParam();
      //console.log("RAW INPUT GOT V "+v)
      if(v == 0) {
        cursor.ansi = {}
        state = cursor.ansi;
      }
      else if(v == 1) {
        state.bold = true;
      }
      else if(v == 7) {
        state.inverted = true;
      }
      else {
        if(v >= 30 && v <= 37) {
          var colorIdx = v - 30 - 1;
          state.fg = ansiColors[colorIdx];
        }
        else if(v >= 40 && v <= 47) {
          var colorIdx = v - 40 - 1;
          state.bg = ansiColors[colorIdx];
        }
        else if(v >= 90 && v <= 97) {
          var colorIdx = v - 90 - 1;
          state.bg = "bright"+ansiColors[colorIdx];
        }
        else if(v >= 100 && v <= 107) {
          var colorIdx = v - 100 - 1;
          state.ansi.bg = "bright"+ansiColors[colorIdx];
        }
        else if(v == 38) {
          var subtype = readParam();
          if(subtype == 5) {
           var colorCode = readParam();
          }
          else if(subtype == 2) {
           var r = readParam();
           var g = readParam();
           var b = readParam();
          }
          else {
            throw "invalid subtype when parsing expanded foreground color";
          }
        }
        else {
          throw 'unknown ansi color param '+param;
        }
      }
    }
    while( params.length > 0) {
      recursivelyParseParams();
    }
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
      return readNext()
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
  return readNext()
  .then(c => {
    if( c == ANSI.CSI) {
      return readAnsiColorSequence()
      .then(gotAnsiColorSequence);
    }
    else {
      throw "unknown Ansi sequence character "+c;
    }
  })
  .then(()=> {
    cursor.pendingControlSequence = [];
  });
}
