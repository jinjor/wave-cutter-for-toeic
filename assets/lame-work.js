importScripts('lame.min.js');

self.addEventListener('message', function(e) {
  var samples = e.data.samples;
  var channels = e.data.channels;
  var sampleRate = e.data.sampleRate;
  var kbps = e.data.kbps;

  var lib = new lamejs();
  var mp3encoder = new lib.Mp3Encoder(channels, sampleRate, kbps);
  var mp3Data = [];
  var sampleBlockSize = 1152; //multiple of 576

  var mp3Data = [];
  for (var i = 0; i < samples.length; i += sampleBlockSize) {
    sampleChunk = samples.subarray(i, i + sampleBlockSize);
    var mp3buf = mp3encoder.encodeBuffer(sampleChunk);
    if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
    }
  }
  var mp3buf = mp3encoder.flush();   //finish writing mp3

  if (mp3buf.length > 0) {
      mp3Data.push(new Int8Array(mp3buf));
  }
  var blob = new Blob(mp3Data, {type: 'audio/mp3'});
  self.postMessage(blob);
}, false);
