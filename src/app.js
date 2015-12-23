var logic = require('./logic.js');
var async = require('async');
var JSZip = require("jszip");

var E = function(tag, attributes, children) {
  var el = document.createElement(tag);
  attributes && Object.keys(attributes).forEach(function(key) {
    el.setAttribute(key, attributes[key]);
  });
  children && R(el, children);
  return el;
};
var Q = document.querySelectorAll.bind(document);
var R = function(el, children) {
  el.innerHTML = '';
  children.forEach(function(child) {
    if(typeof child === 'string') {
      child = el.createTextNode(child);
    }
    el.appendChild(child);
  });
};
function encodeMp3(samples/*Int16Array*/, channels, sampleRate, kbps) {
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

  var url = window.URL.createObjectURL(blob);
  console.log('MP3 URl: ', url);
  return blob;
}

var model = {
  actions: [],
  source: null,
  playingPosition: null,
  startTime: null,
  hover: null,
  audioContext: new AudioContext()
};

function update(type, data) {
  if(type === 'init') {

  } else if(type === 'read-button') {
    var reader = new FileReader();
    reader.onload = function(e) {
      var context = model.audioContext;
      console.log('decoding...');
      context.decodeAudioData(e.target.result, function(decodedData) {
        model.data = decodedData;
        var source = context.createBufferSource();
        source.buffer = model.data;
        source.connect(context.destination);
        model.source = source;
        dispatch('read-complete');
      });

    };
    reader.readAsArrayBuffer(data);
  } else if(type === 'read-complete') {
    model.cuttingPoints = logic.cuttingPoints(model.data.getChannelData(0));
    console.log(model.cuttingPoints.length);
  } else if(type === 'play') {
    var index = data;
    var context = model.audioContext;
    var playing = model.playingPosition !== null;
    if(playing) {
      model.source.stop();
      var source = context.createBufferSource();
      source.buffer = model.data;
      source.connect(context.destination);
      model.source = source;
    }
    if(!playing || model.playingPosition[0] !== model.cuttingPoints[index][0]) {
      var start = model.cuttingPoints[index][0] / model.data.sampleRate;
      model.source.start(0, start);
      model.playingPosition = model.cuttingPoints[index];
      model.startTime = new Date().getTime();
      model.currentTime = new Date().getTime();
    } else {
      model.playingPosition = null;
      model.startTime = null;
    }
    if(!playing) {
      dispatch('tick');
    }
  } else if(type === 'tick') {
    model.currentTime = new Date().getTime();
    if(model.playingPosition !== null) {
      var sampleLength = model.playingPosition[1] - model.playingPosition[0];
      var length = sampleLength / model.data.sampleRate * 1000;
      var interval = 100;
      if(model.currentTime - model.startTime + interval < length) {
        setTimeout(function() {
          dispatch('tick');
        }, interval);
      } else {
        dispatch('stop');
      }
    }
  } else if(type === 'stop') {
    stop();
  } else if(type === 'delete') {
    var index = data;
    if(model.playingPosition) {
      var currentPosition = model.playingPosition[0] + (model.currentTime - model.startTime) / 1000 * model.data.sampleRate;
      var inThisRange = model.cuttingPoints[index][0] <= currentPosition && currentPosition < model.cuttingPoints[index][1];
      if(inThisRange) {
        stop();
      }
    }
    model.cuttingPoints.splice(index, 1);
  } else if(type === 'up') {
    var index = data;
    if(model.playingPosition) {
      var currentPosition = model.playingPosition[0] + (model.currentTime - model.startTime) / 1000 * model.data.sampleRate;
      var inPrevRange = model.cuttingPoints[index-1][0] <= currentPosition && currentPosition < model.cuttingPoints[index-1][1];
      var inThisRange = model.cuttingPoints[index][0] <= currentPosition && currentPosition < model.cuttingPoints[index][1];
      if(inPrevRange) {
        model.playingPosition[1] = model.cuttingPoints[index][1];
      } else if(inThisRange) {
        model.playingPosition[0] = model.cuttingPoints[index-1][0];
        model.startTime -= (model.cuttingPoints[index-1][1] - model.cuttingPoints[index-1][0]) / model.data.sampleRate * 1000;
      }
    }
    model.cuttingPoints[index-1][1] = model.cuttingPoints[index][1];
    model.cuttingPoints.splice(index, 1);
  } else if(type === 'hover') {
    model.hover = data;
  } else if(type === 'create-button') {
    var zip = new JSZip();
    var count = 0;
    logic.cut(model.data.getChannelData(0), model.cuttingPoints, function(buf, i) {
      var samples = new Int16Array(buf.length);
      for(var j = 0; j < buf.length; j++) {
        samples[j] = Math.floor(buf[j] * 32767);
      }
      var blob = encodeMp3(samples/*Int16Array*/, 1, model.data.sampleRate, 128);
      var fileName = i + '.mp3';
      var reader = new FileReader();
      reader.onload = function() {
          zip.file(fileName, reader.result, {binary:true});
          count++;
          if(count === model.cuttingPoints.length) {
            console.log(zip);
            var content = zip.generate({type : "blob"});
            logic.createFile('all.zip', content, function(e, file) {
              if(e) {
              } else {
                var url = file.toURL();
                console.log(url);
                location.href = url;
              }
            });
          }
      };
      reader.readAsArrayBuffer(blob);
    });

  }
}
function stop() {
  model.source.stop();
  var source = model.audioContext.createBufferSource();
  source.buffer = model.data;
  source.connect(model.audioContext.destination);
  model.source = source;
  model.playingPosition = null;
  model.startTime = null;
}
function render() {
  renderWaves();
}
function renderWaves() {
  // console.log('renderWaves');
  var container = document.getElementById('canvas-container');
  if(!model.data) {
    return;
  }
  var waves = [];
  model.cuttingPoints.forEach(function(point, i) {
    waves.push(renderWave(point, i));
  });
  if(model.actions[0][0] !== 'hover' && model.actions[0][0] !== 'tick') {
    R(container, waves);
  }
}
function renderWave(point, index) {
  var height = 40;
  var width = (point[1] - point[0]) / model.data.sampleRate * 10;
  var div;
  if(model.actions[0][0] === 'hover' || model.actions[0][0] === 'tick') {
    div = Q('.wave-area')[index];
  } else {
    var deleteButton = E('span', {
      'class': 'wave-area-button wave-area-delete btn btn-danger glyphicon glyphicon-remove',
      'data-index': index,
    });
    var upMergeButton = E('span', {
      'class': 'wave-area-button wave-area-up btn btn-default glyphicon glyphicon-arrow-up',
      'data-index': index,
    });
    var playIconClass = 'glyphicon-play';
    if(model.playingPosition) {
      var currentPosition = model.playingPosition[0] + (model.currentTime - model.startTime) / 1000 * model.data.sampleRate;
      var inThisRange = model.cuttingPoints[index][0] <= currentPosition && currentPosition < model.cuttingPoints[index][1];
      if(inThisRange) {
        console.log(index);
         playIconClass = 'glyphicon-pause';
      }
    }
    var playButton = E('span', {
      'class': 'wave-area-button wave-area-play btn btn-default glyphicon ' + playIconClass,
      'data-index': index,
    });
    var layer0 = E('canvas', {
      'data-index': index,
      'width': width,
      'height': height
    });
    var layer1 = E('canvas', {
      'data-index': index,
      'width': width,
      'height': height
    });
    div = E('div', {
      'class': 'wave-area'
    }, [layer0, layer1, deleteButton, upMergeButton, playButton]);
  }
  var canvases = div.querySelectorAll('canvas');

  renderWaveOnCanvas(canvases, width, height, point, index);
  return div;
}
function renderWaveOnCanvas(canvases, width, height, point, index) {
  var layer0 = canvases[0];
  var layer1 = canvases[1];
  if(model.actions[0][0] === 'hover' || model.actions[0][0] === 'tick') {
    var ctx = layer1.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    if(model.hover) {
      var hoverIndex = model.hover[0];
      var hoverLeft = model.hover[1];
      if(hoverIndex === index) {
        ctx.strokeStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(hoverLeft+0.5, height);
        ctx.lineTo(hoverLeft+0.5, 0);
        ctx.closePath();
        ctx.stroke();
      }
    }
    if(model.playingPosition) {
      var currentPosition = model.playingPosition[0] + (model.currentTime - model.startTime) / 1000 * model.data.sampleRate;
      var inThisRange = model.cuttingPoints[index][0] <= currentPosition && currentPosition <= model.cuttingPoints[index][1];
      if(inThisRange) {
        var pos = (model.currentTime - model.startTime) / 1000 * 10;
        ctx.strokeStyle = '#adf';
        ctx.beginPath();
        ctx.moveTo(pos+0.5, height);
        ctx.lineTo(pos+0.5, 0);
        ctx.closePath();
        ctx.stroke();
      }
    }
  } else {
    var ctx = layer0.getContext('2d');
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#afd';
    var data = model.data.getChannelData(0)
    for(var i = 0; i < width; i++) {
      var pos = point[0] + Math.floor((point[1] - point[0]) * (i / width));
      var value = Math.abs(data[pos]);
      ctx.beginPath();
      ctx.moveTo(i+0.5, height);
      ctx.lineTo(i+0.5, height - height * value * 2);
      ctx.closePath();
      ctx.stroke();
    }
  }
}
var requestRendering = 0;
function dispatch(type, data) {
  // console.log(type);
  setTimeout(function(){
    model.actions.unshift([type, data]);
    update(type, data);
    // requestRendering++;

    render();
  });

}
// (function loop() {
//   if(requestRendering) {
//     requestRendering = 0;
//     render();
//   }
//   requestAnimationFrame(loop);
// })();
$document = Gator(document);
function listenToEvents() {
  $document.on('change', '#read', function(e) {
    var file = e.target.files[0];
    dispatch('read-button', file);
  }, false);
  $document.on('click', '#create', function(e) {
    dispatch('create-button');
  });
  $document.on('click', '.wave-area-play', function(e) {
    dispatch('play', +this.getAttribute('data-index'));
  });
  $document.on('click', '.wave-area-delete', function(e) {
    dispatch('delete', +this.getAttribute('data-index'));
  });
  $document.on('click', '.wave-area-up', function(e) {
    dispatch('up', +this.getAttribute('data-index'));
  });
  $document.on('mousemove', '.wave-area canvas', function(e) {
    dispatch('hover', [+this.getAttribute('data-index'), e.layerX]);
  });
}
listenToEvents();
dispatch('init');
