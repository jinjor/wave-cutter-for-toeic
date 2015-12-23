var Buffer = require('buffer').Buffer;

function readData(data, current) {
  if(!current.riff) {
    var tag = data.slice(0, 4).toString();
    var size = data.readUInt32LE(4);
    var type = data.slice(8, 12).toString();
    current.riff = {
      tag: tag,
      size: size,
      type: type,
      raw: data.slice(0, 12)
    };
    data = data.slice(12);
  }
  if(!current.format) {
    var tag = data.slice(0, 4).toString();
    var size = data.readUInt32LE(4);
    var wFormatTag = data.readUInt16LE(8);
    var wChannels = data.readUInt16LE(10);
    var dwSamplesPerSec = data.readUInt32LE(12);
    var dwAvgBytesPerSec = data.readUInt32LE(16);
    var wBlockAlign = data.readUInt16LE(20);
    var wBitsPerSample = data.readUInt16LE(22);
    current.format = {
      tag: tag,
      size: size,
      wFormatTag: wFormatTag,
      wChannels: 1,
      dwSamplesPerSec: dwSamplesPerSec,
      dwAvgBytesPerSec: dwAvgBytesPerSec/wChannels,
      wBlockAlign: wBlockAlign/wChannels,
      wBitsPerSample: wBitsPerSample,
      raw: data.slice(0, 8 + size)
    };
    data = data.slice(8 + size);
  }
  if(!current.buf) {
    var id = data.slice(0, 4).toString();
    var dataSize = data.readUInt32LE(4);
    current.buf = new Buffer(dataSize/2);//monoral
    data = data.slice(8);
  }
  var monoral = toMonoral(data);
  monoral.copy(current.buf, current.cursor);
  current.cursor += monoral.length;
}
function toMonoral(data) {
  var monoral = new Buffer(data.length/2);
  for(i = 0; i < data.length; i += 4) {
    monoral[i/2] = data[i];
    monoral[i/2+1] = data[i+1];
  }
  return monoral;
}
function cuttingPoints(data) {
  var points = [];
  var threshold = 0.01;
  var start = 0;
  var silentLength = 0;

  for(i = 0; i < data.length; i++) {
    var l = data[i];
    if(Math.abs(l) < threshold) {
      silentLength++;
    } else {
      if(silentLength > 60000) {
        points.push([start, i-1]);
        start = i-1;
      }
      silentLength = 0;
    }
  }
  points.push([start, data.length - 1]);
  return points;
}
function cut(data, points, cb) {
  points.forEach(function(point, i) {
    cb(data.slice(point[0], point[1]), i);
  });
}

function createWavFileBuffer(riff, format, buf) {
  var dataLength = buf.length;
  var riffDataSize = 4 + format.raw.length + 8 + dataLength;
  var riffHeader = new Buffer(12);
  riff.raw.copy(riffHeader);
  riffHeader.writeUInt32LE(riffDataSize, 4);

  var formatChunk = new Buffer(format.raw.length);
  format.raw.copy(formatChunk);
  formatChunk.writeUInt16LE(format.wChannels, 10);
  formatChunk.writeUInt32LE(format.dwAvgBytesPerSec, 16);
  formatChunk.writeUInt16LE(format.wBlockAlign, 20);

  var dataChunk = new Buffer(dataLength);
  dataChunk.write('data', 0, 4, 'ascii');
  dataChunk.writeUInt32LE(dataLength, 4);
  buf.copy(dataChunk, 8);

  var all = Buffer.concat([riffHeader, formatChunk, dataChunk]);
  return all;
}
function createFile(fileName, blob, cb) {
  (window.requestFileSystem || window.webkitRequestFileSystem)(window.TEMPORARY, 1024*1024, function(fs) {
    fs.root.getFile(fileName, {create: true}, function(fileEntry) {
      fileEntry.remove(function() {
        fs.root.getFile(fileName, {create: true}, function(fileEntry) {
          fileEntry.createWriter(function(fileWriter) {
            fileWriter.onwriteend = function(e) {
              console.log(e);
              cb(null, fileEntry);
            };
            fileWriter.onerror = function(e) {
              cb(e);
            };
            fileWriter.write(blob);
          }, cb);
        });
      }, cb);
    }, cb);
  });
}
module.exports = {
  createFile: createFile,
  createWavFileBuffer: createWavFileBuffer,
  cut: cut,
  cuttingPoints: cuttingPoints
};
