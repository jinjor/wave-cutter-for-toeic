var logic = require('./logic.js');
var async = require('async');
var JSZip = require("jszip");
var snabbdom = require('snabbdom');
var patch = snabbdom.init([
  require('snabbdom/modules/class'),
  require('snabbdom/modules/props'),
  require('snabbdom/modules/style'),
  require('snabbdom/modules/eventlisteners'),
]);
var h = require('snabbdom/h');

function encodeMp3(samples/*Int16Array*/, channels, sampleRate, kbps, cb) {
  var lameWorker = new Worker('./assets/lame-work.js');
  lameWorker.addEventListener('message', function(e) {
    cb(null, e.data);
  }, false);
  lameWorker.postMessage({
    samples: samples,
    channels: channels,
    sampleRate: sampleRate,
    kbps: kbps
  });
}

var model = {
  actions: [],
  actionCursor: -1,
  source: null,
  playingPosition: null,
  startTime: null,
  hover: null,
  toBeCut: null,
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
        model.data = decodedData.getChannelData(0);
        model.sampleRate = decodedData.sampleRate;
        dispatch('calculate-cutting-points');
      });
    };
    reader.readAsArrayBuffer(data);
    model.fileName = data.name;
    model.loading = true;
  } else if(type === 'calculate-cutting-points') {
    var context = model.audioContext;
    var buf = context.createBuffer(1, model.data.length, model.sampleRate);
    if(buf.copyToChannel) {
      buf.copyToChannel(model.data, 0, 0);
    } else {
      var dest = buf.getChannelData(0);
      for(var i = 0; i < dest.length; i++) {
        dest[i] = model.data[i];
      }
    }
    model.data = buf;
    var source = context.createBufferSource();
    source.buffer = model.data;
    source.connect(context.destination);
    model.source = source;
    //
    model.loading = false;
    model.originalCuttingPoints = logic.cuttingPoints(model.data.getChannelData(0), 60000);
    model.cuttingPoints = JSON.parse(JSON.stringify(model.originalCuttingPoints));
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
  } else if(type === 'click-canvas') {
    var index = data[0];
    var canvasLeft = data[1];
    var canvasWidth = data[2];
    var dataLength = model.cuttingPoints[index][1] - model.cuttingPoints[index][0];
    var dataIndex = dataLength * (canvasLeft / canvasWidth);

    var points = logic.cuttingPoints(model.data.getChannelData(0), 20000,
      model.cuttingPoints[index][0], model.cuttingPoints[index][1]);
    var minLag = Infinity;
    var nearest = null;
    points.forEach(function(point) {
      var lag = Math.abs(point[0] - (dataIndex + model.cuttingPoints[index][0]));
      if(lag < minLag) {
        minLag = lag;
        nearest = point[0];
      }
    });
    model.toBeCut = nearest;
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
  } else if(type === 'delete' || type === 'up' || type === 'cut') {
    edit(type, data);
    model.actions.length = model.actionCursor + 1;
    model.actions.push([type, data]);
    model.actionCursor = model.actions.length - 1;
  } else if(type === 'hover') {
    model.hover = data;
  } else if(type === 'create-button') {
    var zip = new JSZip();

    var data = model.data.getChannelData(0);
    var functions = model.cuttingPoints.map(function(point, i) {
      return function(cb) {
        var buf = data.slice(point[0], point[1]);
        var samples = new Int16Array(buf.length);
        for(var j = 0; j < buf.length; j++) {
          samples[j] = Math.floor(buf[j] * 32767);
        }
        encodeMp3(samples/*Int16Array*/, 1, model.data.sampleRate, 128, function(e, blob) {
          var fileName = i + '.mp3';
          var reader = new FileReader();
          reader.onload = function() {
            zip.file(fileName, reader.result, {binary:true});
            cb();
          };
          reader.readAsArrayBuffer(blob);
        });

      };
    });
    async.series(functions, function(e) {
      var content = zip.generate({type : "blob"});
      logic.createFile(model.fileName.split('.mp3')[0] + '.zip', content, function(e, file) {
        if(e) {
        } else {
          var url = file.toURL();
          console.log(url);
          location.href = url;
          dispatch('save-done');
        }
      });
    });

    model.saving = true;
  } else if(type === 'save-done') {
    model.saving = false;
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
  } else if(type === 'cut') {
    var toBeCut = data;
    for(var i = model.cuttingPoints.length - 1; i >= 0; i--) {
      var points = model.cuttingPoints[i];
      if(points[0] <= toBeCut && toBeCut < points[1]) {
        model.cuttingPoints.splice(i + 1, 0, [toBeCut, points[1]]);
        model.cuttingPoints[i][1] = toBeCut - 1;
      }
    }
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
  var main = model.saving ? renderLoading('Now compressing waves...') : model.loading ? renderLoading('Now loading and processing...') : renderWaves();
  return h('div#container.container', [
    renderControls(),
    h('div#canvas-container', main)
  ]);
}
function renderLoading(message) {
  return [h('div.loading', [
    h('div.loading-bar.loading-bar1'),
    h('div.loading-bar.loading-bar2'),
    h('div.loading-bar.loading-bar3'),
    h('div.loading-bar.loading-bar4'),
    h('div.loading-bar.loading-bar5')
  ]), h('div.loading-message', [message])];
}
function renderControls() {
  var step = model.cuttingPoints ? 1 : 0;
  var children = [h('label.btn.btn-' + (step === 0 ? 'primary' : 'default'), {
    props:{for:'read'},
    on: {
      change: function(e) {
        var file = e.target.files[0];
        dispatch('read-button', file);
      }
    }
  }, [
    h('span', ['Choose file']),
    h('input#read.read', {props:{type:'file'}})
  ])];
  if(model.cuttingPoints) {
    children.push(h('button.btn.btn-' + (step === 1 ? 'primary' : 'default'), {
      on: {
        click: function() {
          dispatch('create-button');
        }
      }
    }, ['Save']));
    children.push(h('button.btn.btn-default.icon-undo', {
      props: {
        disabled: model.actionCursor < 0
      },
      on: {
        click: function() {
          dispatch('undo');
        }
      }
    }));
    children.push(h('button.btn.btn-default.icon-redo', {
      props: {
        disabled: model.actionCursor >= model.actions.length - 1
      },
      on: {
        click: function() {
          dispatch('redo');
        }
      }
    }));


    var count = h('div.wave-count', [
      h('span.wave-count-number', [model.cuttingPoints.length]),
      h('span', ['waves'])
    ]);
    children.push(count);
  }
  return h('div.controls', children);
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
  var height = 34;
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
  }) : h('span.wave-area-button.wave-area-up.btn.btn-default.icon-smile');
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
      },
      click: function(e) {
        dispatch('click-canvas', [index, e.layerX, width]);
      }
    },
    hook: {
      postpatch: function(oldVnode, vnode) {
        renderWaveOnCanvas1(vnode.elm, width, height, point, index);
      }
    }
  });
  var children =  [layer0, layer1, deleteButton, upMergeButton, playButton]
  if(model.toBeCut && model.cuttingPoints[index][0] < model.toBeCut &&
      model.toBeCut < model.cuttingPoints[index][1]) {
    var left = width * ((model.toBeCut - model.cuttingPoints[index][0]) / (model.cuttingPoints[index][1] - model.cuttingPoints[index][0]));
    var cutHelper = h('span.wave-area-button.wave-area-cut.btn.btn-default.icon-scissors', {
      style: {
        'margin-left': (left - 19) + 'px'
      },
      on: {
        click: function(e) {
          dispatch('cut', model.toBeCut);
        }
      }
    });
    children.push(cutHelper);
  }
  var div = h('div.wave-area', children);
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
  if(model.toBeCut) {
    if(model.cuttingPoints[index][0] <= model.toBeCut &&
      model.toBeCut < model.cuttingPoints[index][1]) {
      var left = width * ((model.toBeCut - model.cuttingPoints[index][0]) / (model.cuttingPoints[index][1] - model.cuttingPoints[index][0]));
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(left+0.5, height);
      ctx.lineTo(left+0.5, 0);
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
  if(e.keyCode === 90 && e.ctrlKey && e.shiftKey) {
    dispatch('redo');
  } else if(e.keyCode === 90 && e.ctrlKey) {
    dispatch('undo');
  } else if(e.keyCode === 89 && e.ctrlKey) {
    dispatch('redo');
  }
};
dispatch('init');
