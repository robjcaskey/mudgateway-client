var minimatch = require('minimatch');
var matchOptions = {
  dot:true
}
var src  = '/home/ubuntu/mudgateway/static/GeneralBuffer.mjs';
var dst = '/home/ubuntu/mudgateway/deploy/../static/*.mjs';
console.log(minimatch(src, dst, matchOptions))

