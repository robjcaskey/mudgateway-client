function GeneralBufferCursor(buffer) {
  this.buffer = buffer;
  this.position = 0;
  this.debugLog = false;
}
GeneralBufferCursor.prototype.readNext = function() {
  this.position++;
  if(!this.debugLog) {
    return this.buffer.readPosition(this.position - 1);
  }
  else {
    return this.buffer.readPosition(this.position - 1)
    .then(val => {
      this.debugLog(val);
      return val;
    });
  }
}
GeneralBufferCursor.prototype.clone = function() {
  var cursor = new GeneralBufferCursor(this.buffer);
  cursor.position = this.position;
  return cursor;
}
GeneralBufferCursor.prototype.prepend = function(val) {
  return this.buffer.insert(this.position, val);
}
/*
GeneralBufferCursor.prototype.readUntil = function(testVal) {
  return this.buffer.readNext(val => {
    if(val == testVal) {
      return Promise.resolve(val);
    }
    else {
      return this.readUntil(testVal);
    }
  })
}
*/


var BEFORE_BUFFER = new Error("Read position already evicted from buffer");

export function GeneralBuffer() {
  this.pendingRequests = [];
  this.pendingChangeNotifications = [];
  this.start = 0;
  this.end = 0;
  this.data = [];
}
GeneralBuffer.prototype.readPosition = function(position) {
  var idx = position - this.start;
  if(idx < this.data.length) {
    return Promise.resolve(this.data[idx]);
  }
  if(idx < 0) {
    throw BEFORE_BUFFER;
  }
  // insert into list in order so that closer requests are at end of array
  // yeah, this would be more efficient as a b-tree or similar
  var insertIdx = 0;
  for(var i = this.pendingRequests.length -1; i >= 0; i--) {
    var request = this.pendingRequests[i];
    if(request.position >= position) {
      insertIdx = i + 1;
      break;
    }
  }
  return new Promise((resolve, reject) => {
    this.pendingRequests.splice(insertIdx, 0, {
      position:position,
      resolve:resolve
    });
  });
}

function inOrderPromise(requests, position) {
  // insert into list in order so that closer requests are at end of array
  // yeah, this would be more efficient as a b-tree or similar
  var insertIdx = 0;
  for(var i = requests.length -1; i >= 0; i--) {
    var request = requests[i];
    if(request.position >= position) {
      insertIdx = i + 1;
      break;
    }
  }
  var listener;
  var promise =  new Promise((resolve, reject) => {
    listener = {
      position:position,
      resolve:(result)=> {
        stopWaiting();
        return resolve(result)
      }
    }
    requests.splice(insertIdx, 0, listener);
  });
  function stopWaiting() {
    var idx = requests.indexOf(listener)
    requests.splice(insertIdx, 1);
  }
  return {
    promise:promise,
    stopWaiting:stopWaiting
  }
}

GeneralBuffer.prototype.waitForChangeAtOrAfterPosition = function(position) {
  //console.log("Taking out a change notification for "+position)
  var requests = this.pendingChangeNotifications;
  return inOrderPromise(requests, position);
}
function fireAtOrAfterPosition(events, position, val) {
  var resolutions = [];
  if(events.length > 0) {
    // they are sorted by position so we can stop when we find the first one we arent ready for yet
    for(var i = events.length -1; i >= 0; i--) {
      var request = events[i];
      if(request.position >= position) {
        events.pop();
        console.log("Firing event at position",request.position)
        resolutions.push(request.resolve(val));
      }
      if(request.position < position) {
        break;
      }
    }
  }
  return Promise.all(resolutions, val);
}
function fireAtOrBeforePosition(events, position, val) {
  var resolutions = [];
  if(events.length > 0) {
    // they are sorted by position so we can stop when we find the first one we arent ready for yet
    for(var i = events.length -1; i >= 0; i--) {
      var request = events[i];
      if(request.position <= position) {
        events.pop();
        resolutions.push(request.resolve(val));
      }
      if(request.position > position) {
        break;
      }
    }
  }
  return Promise.all(resolutions);
}
GeneralBuffer.prototype.splice = function(fromPosition, len, ...rest) {
  var fromIdx = fromPosition - this.start;
  this.data.splice(fromIdx, len);
  return Promise.resolve()
  .then(()=> {
    return Promise.all(rest.map((item, idx) => {
      var insertPosition = fromPosition+idx;
      return this.insert(insertPosition, item);
    }));
  })
  .then(()=> {
    console.log("Firing change events ",fromPosition, this.pendingChangeNotifications)
    return fireAtOrAfterPosition(this.pendingChangeNotifications, fromPosition)
  })
  .then(()=> {
    return this.data;
  });
}
GeneralBuffer.prototype.slice = function(fromPosition, toPosition) {
  //console.log("SLICING FROM "+fromPosition+" to "+toPosition)
  var promises = [];
  for(var i=fromPosition; i < toPosition; i++) {
    promises.push(this.readPosition(i));
  }
  return Promise.all(promises);
}
GeneralBuffer.prototype.insert = function(position, val) {
  var idx = position - this.start;
  this.data.splice(idx, 0, val);
  this.end++;
  // trigger any awaiting promises
  var resolutions = [];
  if(this.pendingRequests.length > 0) {
    // they are sorted by position so we can stop when we find the first one we arent ready for yet
    for(var i = this.pendingRequests.length -1; i >= 0; i--) {
      var request = this.pendingRequests[i];
      if(request.position <= position) {
        this.pendingRequests.pop();
        resolutions.push(request.resolve(val));
      }
      if(request.position > position) {
        break;
      }
    }
  }
  return Promise.all(resolutions);
}
GeneralBuffer.prototype.append = function(val) {
  this.data.push(val);
  this.end++;
  // trigger any awaiting promises
  var resolutions = [];
  if(this.pendingRequests.length > 0) {
    // they are sorted by position so we can stop when we find the first one we arent ready for yet
    for(var i = this.pendingRequests.length -1; i >= 0; i--) {
      var request = this.pendingRequests[i];
      if(request.position <= this.end) {
        this.pendingRequests.pop();
        resolutions.push(request.resolve(val));
      }
      if(request.position > this.end) {
        break;
      }
    }
  }
  return Promise.all(resolutions);
}
GeneralBuffer.prototype.cursor = function() {
  var cursor = new GeneralBufferCursor(this);
  cursor.position = this.end;
  return cursor;
}

