
function ProgressiveRegex(readChar, pattern) {
  var parser = new ProgressiveRegexParser(pattern); 
  return new Promise((resolve, reject) => {
    function readAndThink() {
      return readChar()
      .then(c => {
        var match = parser.test(c);
        if(typeof(match) !== 'undefined') { 
          resolve(match);
        }
        else {
          return readAndThink();
        }
      });
    }
    return readAndThink();
  });
}


function feed(contents) {
  return function() {
    var chunk = contents[0];
    contents = contents.slice(1);
    console.log("FEEDING "+chunk)
    return Promise.resolve(chunk);
  }
}
/*
var p = ProgressiveRegex(feed("dogs are coolX"), "dogs are dumb");
p.then(()=> {
  console.log("GOT TEST")
})
*/

var paragraph = 'The quick brown fox jumped over the lazy dog. It barked.';
var regex = /?!(^The)/;
var found = paragraph.match(regex);
console.log(found)
