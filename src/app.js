var logic = require('./logic.js');
var async = require('async');
var JSZip = require("jszip");
var snabbdom = require('snabbdom');
var patch = snabbdom.init([ // Init patch function with choosen modules
  require('snabbdom/modules/class'), // makes it easy to toggle classes
  require('snabbdom/modules/props'), // for setting properties on DOM elements
  require('snabbdom/modules/style'), // handles styling on elements with support for animations
  require('snabbdom/modules/eventlisteners'), // attaches event listeners
]);
var h = require('snabbdom/h'); // helper function for creating VNodes

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
  actionCursor: -1,
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
        dispatch('calculate-cutting-points');
      });

    };
    reader.readAsArrayBuffer(data);
  } else if(type === 'calculate-cutting-points') {
    model.originalCuttingPoints = logic.cuttingPoints(model.data.getChannelData(0));
    model.cuttingPoints = JSON.parse(JSON.stringify(model.originalCuttingPoints));
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
  } else if(type === 'undo') {
    if(model.actionCursor >= 0) {
      model.actionCursor--;
      model.cuttingPoints = JSON.parse(JSON.stringify(model.originalCuttingPoints));
      for(var i = 0; i <= model.actionCursor; i++) {
        edit(model.actions[i][0], model.actions[i][1]);
      }
      dispatch();
    }
  } else if(type === 'redo') {
    if(model.actionCursor < model.actions.length -1) {
      model.actionCursor++;
      model.cuttingPoints = JSON.parse(JSON.stringify(model.originalCuttingPoints));
      for(var i = 0; i <= model.actionCursor; i++) {
        edit(model.actions[i][0], model.actions[i][1]);
      }
      dispatch();
    }
  } else if(type === 'delete' || type === 'up') {
    edit(type, data);
    model.actions.length = model.actionCursor + 1;
    model.actions.push([type, data]);
    model.actionCursor = model.actions.length - 1;
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
function edit(type, data) {
  if(type === 'delete') {
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
  return h('div#container.container', [
    h('label.btn.btn-default', {props:{for:'read'}, on: {
      change: function(e) {
        var file = e.target.files[0];
        dispatch('read-button', file);
      }
    }}, [
      h('span', ['Select .mp3 file']),
      h('input#read.read', {props:{type:'file'}})
    ]),
    h('button#create.btn.btn-primary', {
      on: {
        click: function() {
          dispatch('create-button');
        }
      }
    }, ['Create']),
    h('div#canvas-container', renderWaves())
  ]);
}
function renderWaves() {
  if(!model.data) {
    return [];
  }
  var waves = [];
  model.cuttingPoints.forEach(function(point, i) {
    waves.push(renderWave(point, i));
  });
  return waves;
}
function renderWave(point, index) {
  var height = 40;
  var width = (point[1] - point[0]) / model.data.sampleRate * 10;
  var deleteButton = h('span.wave-area-button.wave-area-delete.btn.btn-danger.glyphicon.glyphicon-remove', {
    on: {
      click: function(e) {
        dispatch('delete', index);
      }
    }
  });
  var upMergeButton = index > 0 ? h('span.wave-area-button.wave-area-up.btn.btn-default.glyphicon.glyphicon-arrow-up', {
    on: {
      click: function(e) {
        dispatch('up', index);
      }
    }
  }) : h('span.wave-area-button.wave-area-up.btn.btn-default.glyphicon.glyphicon-ban-circle');
  var playIconClass = 'glyphicon-play';
  if(model.playingPosition) {
    var currentPosition = model.playingPosition[0] + (model.currentTime - model.startTime) / 1000 * model.data.sampleRate;
    var inThisRange = model.cuttingPoints[index][0] <= currentPosition && currentPosition < model.cuttingPoints[index][1];
    if(inThisRange) {
      playIconClass = 'glyphicon-pause';
    }
  }
  var playButton = h('span.wave-area-button.wave-area-play.btn.btn-default.glyphicon.' + playIconClass, {
    on: {
      click: function(e) {
        dispatch('play', index);
      }
    }
  });
  var layer0 = h('canvas', {
    props: {
      'data-index': index,
      'width': width,
      'height': height,
    },
    hook: {
      create: function(_, vnode) {
        renderWaveOnCanvas0(vnode.elm, width, height, point, index);
      },
      update: function(oldVnode, vnode) {
        if(oldVnode.data.props.width !== vnode.data.props.width) {
          renderWaveOnCanvas0(vnode.elm, width, height, point, index);
        }
      }
    }
  });
  var layer1 = h('canvas', {
    props: {
      'width': width,
      'height': height,
    },
    on: {
      mousemove: function(e) {
        dispatch('hover', [index, e.layerX]);
      }
    },
    hook: {
      postpatch: function(oldVnode, vnode) {
        renderWaveOnCanvas1(vnode.elm, width, height, point, index);
      }
    }
  });
  var div = h('div.wave-area', [layer0, layer1, deleteButton, upMergeButton, playButton]);
  return div;
}
function renderWaveOnCanvas0(layer0, width, height, point, index) {
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
function renderWaveOnCanvas1(layer1, width, height, point, index) {
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
}
var requestRendering = 0;
var container = document.getElementById('container');
var old = container;

function dispatch(type, data) {
  // console.log(type);
  setTimeout(function() {
    update(type, data);
    requestRendering++;
  });
}
(function loop() {
  if(requestRendering) {
    // console.log(requestRendering);
    requestRendering = 0;
    var vnode = render();
    patch(old, vnode);
    old = vnode;
  }
  requestAnimationFrame(loop);
})();
document.onkeydown = function (e) {
  if(e.keyCode === 90 && e.ctrlKey) {
    dispatch('undo');
  } else if(e.keyCode === 89 && e.ctrlKey) {
    dispatch('redo');
  }
};
dispatch('init');
