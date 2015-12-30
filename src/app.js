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
var namingTypes = require('./names.js');
var core = require('./core.js');

function mobile() {
  var ua = navigator.userAgent;
  // return true;
  return ((ua.indexOf('iPhone') > 0 && ua.indexOf('iPad') < 0)
    || ua.indexOf('iPod') > 0
    || ua.indexOf('Android') > 0);
}
function encodeMp3(samples/*Int16Array*/, channels, sampleRate, kbps, cb) {
  var lameWorker = new Worker('./assets/lame-work.js');
  lameWorker.addEventListener('message', function(e) {
    try {
      lameWorker.terminate();
      cb(null, e.data);
    } catch(e) {
      cb(e);
    }
  }, false);
  lameWorker.addEventListener('error', function(e) {
    console.log(e);
    try {
      lameWorker.terminate();
      cb(e);
    } catch(e2) {
      cb([e, e2]);
    }
  });
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
  startPosition: null,
  startTime: null,
  currentTime: null,
  hover: null,
  toBeCut: null,
  fixControl: false,
  maxRows: 0,
  namingTypes: namingTypes,
  namingType: 2,
  encodedFiles: [],
  audioContext: window.AudioContext ? new AudioContext() : null
};

function update(type, data) {
  if(type === 'init') {

  } else if(type === 'read-button') {
    var reader = new FileReader();
    reader.onload = function(e) {
      var context = model.audioContext;
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
    model.maxRows = model.cuttingPoints.length;
    //
    var value = loadActionsAndState();
    if(value) {
      var yes = confirm('Do you want to restore the previous edits?');
      if(yes) {
        try {
          model.actions = value.actions;
          model.namingType = value.namingType;
          model.actionCursor = model.actions.length - 1;
          replay();
        } catch(e) {
          alert('failed to restore data');
          removeActionsAndState();
        }
      } else {
        removeActionsAndState();
      }
    }
  } else if(type === 'fix-control') {
    model.fixControl = data;
  } else if(type === 'naming') {
    var newType = model.namingType + data;
    if(newType >= model.namingTypes.length) {
      newType = 0;
    } else if(newType < 0) {
      newType = model.namingTypes.length - 1;
    }
    model.namingType = newType;
    saveActionsAndState();
  } else if(type === 'play') {
    var index = data;
    var context = model.audioContext;
    var playing = model.currentTime !== null;
    var playingIndex = indexOfPosition(currentPosition());
    if(playing) {
      model.source.stop();
      refreshSource();
    }
    if(!playing || (playingIndex !== index)) {
      if(indexOfPosition(model.toBeCut) === index) {
        model.startPosition = model.toBeCut;
      } else {
        model.startPosition = model.cuttingPoints[index][0];
      }
      model.startTime = new Date().getTime();
      model.currentTime = new Date().getTime();
      var start = model.startPosition / model.data.sampleRate;
      model.source.start(0, start);
    } else {
      model.startPosition = null;
      model.startTime = null;
      model.currentTime = null;
    }
    if(!playing) {
      dispatch('tick');
    }
  } else if(type === 'click-canvas') {
    var index = data[0];
    var canvasLeft = data[1];
    var canvasWidth = data[2];
    model.toBeCut = findNearestToBeCut(index, canvasLeft, canvasWidth);

    var wasPlaying = model.currentTime;
    if(wasPlaying) {
      model.startTime = new Date().getTime();
      model.startPosition = model.toBeCut;
      model.currentTime = new Date().getTime();
      model.source.stop();
      refreshSource();
      var start = model.toBeCut / model.data.sampleRate;
      model.source.start(0, start);
    }

  } else if(type === 'tick') {
    if(model.currentTime !== null) {
      model.currentTime = new Date().getTime();
      var currentPos = currentPosition();
      var startIndex = indexOfPosition(model.startPosition);
      var interval = 100;
      var nextPos = currentPos + (interval / 1000) * model.sampleRate;
      var nextIndex = indexOfPosition(nextPos);
      if(startIndex === nextIndex && nextIndex !== null) {
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
      replay();
    }
  } else if(type === 'redo') {
    if(model.actionCursor < model.actions.length -1) {
      model.actionCursor++;
      replay();
    }
  } else if(type === 'delete' || type === 'up' || type === 'cut') {
    edit(type, data);
    model.actions.length = model.actionCursor + 1;
    model.actions.push([type, data]);
    model.actionCursor = model.actions.length - 1;
    saveActionsAndState();
  } else if(type === 'hover') {
    model.hover = data;
  } else if(type === 'create-button') {
    model.encodedFiles = [];
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
          var name = model.namingTypes[model.namingType].names[i];
          var fileName = (i + 1) + (name ? '_no' + name : '') + '.mp3';
          var reader = new FileReader();
          reader.onload = function() {
            zip.file(fileName, reader.result, {binary:true});
            model.encodedFiles.push(fileName);
            dispatch();
            cb();
          };
          reader.readAsArrayBuffer(blob);
        });
      };
    });
    async.series(functions, function(e) {
      var content = zip.generate({type : "blob"});
      saveAs(content, model.fileName.split('.mp3')[0] + '.zip');
      dispatch('save-done');
    });

    model.saving = true;
  } else if(type === 'save-done') {
    model.saving = false;
  }
}
function findNearestToBeCut(index, canvasLeft, canvasWidth) {
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
  return nearest;
}
function refreshSource() {
  var context = model.audioContext;
  var source = context.createBufferSource();
  source.buffer = model.data;
  source.connect(context.destination);
  model.source = source;
}
function currentPosition() {
  return model.startPosition + dataLengthOfTime(model.currentTime - model.startTime);
}
function dataLengthOfTime(ms) {
  return model.sampleRate * (ms / 1000);
}
function indexOfPosition(position) {
  for(var i = model.cuttingPoints.length -1; i >= 0; i--) {
    if(model.cuttingPoints[i][0] <= position && position < model.cuttingPoints[i][1]) {
      return i;
    }
  }
  return null;
}
function inRangeOf(index, pos) {
  return model.cuttingPoints[index][0] <= pos && pos < model.cuttingPoints[index][1];
}
function replay() {
  model.cuttingPoints = JSON.parse(JSON.stringify(model.originalCuttingPoints));
  for(var i = 0; i <= model.actionCursor; i++) {
    edit(model.actions[i][0], model.actions[i][1]);
  }
  dispatch();
}


function edit(type, data) {
  if(type === 'delete') {
    var index = data;
    if(model.startPosition !== null) {
      var currentPos = currentPosition();
      if(inRangeOf(index)) {
        stop();
      }
    }
    model.cuttingPoints.splice(index, 1);
  } else if(type === 'up') {
    var index = data;
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
    model.maxRows = model.cuttingPoints.length;
  }
}

function saveActionsAndState() {
  try {
    var key = model.fileName + ':' + model.data.length;
    var value = {
      actions: model.actions,
      namingType: model.namingType
    }
    localStorage.setItem(key, JSON.stringify(value));
  } catch(e) {
    console.log(e);
  }
}
function removeActionsAndState() {
  try {
    var key = model.fileName + ':' + model.data.length;
    localStorage.removeItem(key);
  } catch(e) {
    console.log(e);
  }
}
function loadActionsAndState() {
  try {
    var key = model.fileName + ':' + model.data.length;
    var str = localStorage.getItem(key);
    if(str) {
      return JSON.parse(str);
    } else {
      return null;
    }
  } catch(e) {
    console.log(e);
    return null;
  }
}
function stop() {
  model.source.stop();
  refreshSource();
  model.startTime = null;
  model.currentTime = null;
}
function render() {
  var contents;
  if(mobile()) {
    contents = [
      renderHeader(),
      h('div#container.container', [
        h('div.mobile-message', ['Sorry, this application is for PC only.']),
        renderGithubLink(),
        renderShareButtons()
      ])
    ];
  } else {
    contents = [renderHeader(), renderControls(), renderMain()];
  }
  return h('div', contents);
}
function renderMain() {
  var main = model.saving ?
    renderLoading('Now compressing waves...(' +
      model.encodedFiles.length + '/' + model.cuttingPoints.length + ' done)') :
    (model.loading ? renderLoading('Now loading and processing...') : renderWaves());
  return h('div#container.container', {
    on: {
      mousemove: function(e) {
        if(e.target.tagName !== 'CANVAS' && model.hover) {
          dispatch('hover', null);
        }
      }
    }
  }, [ h('div#canvas-container', main) ]);
}
function renderGithubLink() {
  return h('a.icon-github' + (mobile() ? '' : '.pull-right'),
    { props: { target: '_blank', href: 'https://github.com/jinjor/wave-cutter-for-toeic'}}, ['Source']);
}
function renderShareButtons() {
  return h('div#share-buttons.pull-right', [
    h('a', {
      props: {
        href: 'http://www.facebook.com/sharer.php?u=http://jinjor.github.io/wave-cutter-for-toeic/',
        target: '_blank'
      }
    }, [ h('img', { props: { src: './assets/facebook.png', alt: 'Facebook'}})]),
    h('a', {
      props: {
        href: 'https://twitter.com/share?url=http://jinjor.github.io/wave-cutter-for-toeic/&amp;text=Wave%20Cutter%20for%20TOEIC&amp;hashtags=wc4t',
        target: '_blank'
      }
    }, [ h('img', { props: { src: './assets/twitter.png', alt: 'Twitter'}})])
  ]);
}
function renderHeader() {
  var navContents = [
    h('div.navbar-header', [
      h('a.navbar-brand', {props: { href: '.'} }, [ 'Wave Cutter for TOEIC®'])
    ])
  ];
  if(!mobile()) {
    navContents.push(renderShareButtons());
    navContents.push(renderGithubLink());
  }
  return h('nav.navbar.navbar-default', [
    h('div.container', navContents)
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
function renderUndoButton() {
  return h('button.btn.btn-default.icon-undo', {
    props: {
      disabled: model.actionCursor < 0
    },
    on: {
      click: function() {
        dispatch('undo');
      }
    }
  });
}
function renderRedoButton() {
  return h('button.btn.btn-default.icon-redo', {
    props: {
      disabled: model.actionCursor >= model.actions.length - 1
    },
    on: {
      click: function() {
        dispatch('redo');
      }
    }
  });
}
function renderNamingButton() {
  var name = h('div.naming-button', [model.namingTypes[model.namingType].name]);
  var prev = h('div.btn.prev-step', {
    on: {
      click: function() {
        dispatch('naming', -1);
      }
    }
  });
  var next = h('div.btn.next-step', {
    on: {
      click: function() {
        dispatch('naming', 1);
      }
    }
  });

  return h('div.naming-button-container', [prev, name, next]);
}
function renderSaveButton(step) {
  return h('button.btn.btn-' + (step === 1 ? 'primary' : 'default'), {
    on: {
      click: function() {
        dispatch('create-button');
      }
    }
  }, ['Save']);
}
function renderLoadButton(step) {
  return h('label.btn.btn-' + (step === 0 ? 'primary' : 'default'), {
    props:{for:'read'},
    on: {
      change: function(e) {
        var file = e.target.files[0];
        dispatch('read-button', file);
      }
    }
  }, [
    h('span', ['Choose file']),
    h('input#read.read', {props:{type:'file', accept:'.wav,.mp3,.ogg,.aac'}})
  ]);
}

function renderControls() {
  var step = model.cuttingPoints ? 1 : 0;
  var children = [renderLoadButton(step)];
  if(model.cuttingPoints) {
    children.push(renderSaveButton(step));
    children.push(renderUndoButton());
    children.push(renderRedoButton());
    children.push(renderNamingButton());

    var expected = model.namingTypes[model.namingType].names.length;
    var actual = model.cuttingPoints.length;
    var count = h('div.wave-count' + (expected === actual ? '.matched' : ''), [
      h('span.wave-count-number', [actual]),
      h('span', ['/ ' + expected + ' waves'])
    ]);
    children.push(count);
  }
  return h('div.controls-container' + (model.fixControl ? '.fixed' : ''), [h('div.container', [h('div.controls', children)])]);
}
function renderWaves() {
  if(!model.data) {
    return [];
  }
  var waves = [];
  model.cuttingPoints.forEach(function(point, i) {
    waves.push(renderWave(point, i));
  });
  for(var i = model.cuttingPoints.length; i < model.maxRows; i++) {
    waves.push(h('div.wave-area.empty'));
  }
  return waves;
}
function renderWave(point, index) {
  var height = 34;
  var width = (point[1] - point[0]) / model.data.sampleRate * 10;
  var name = h('span.wave-area-name', [model.namingTypes[model.namingType].names[index] || '　']);
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
  if(model.currentTime) {
    var currentPos = currentPosition();
    if(inRangeOf(index, currentPos)) {
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
        e.preventDefault();
        dispatch('hover', [index, e.offsetX]);
      },
      click: function(e) {
        dispatch('click-canvas', [index, e.offsetX, width]);
      }
    },
    hook: {
      postpatch: function(oldVnode, vnode) {
        renderWaveOnCanvas1(vnode.elm, width, height, point, index);
      }
    }
  });
  var children =  [layer0, layer1, name, deleteButton, upMergeButton, playButton]
  if(model.toBeCut && model.cuttingPoints[index][0] < model.toBeCut &&
      model.toBeCut < model.cuttingPoints[index][1]) {
    var left = width * ((model.toBeCut - model.cuttingPoints[index][0]) / (model.cuttingPoints[index][1] - model.cuttingPoints[index][0]));
    var cutHelper = h('span.wave-area-button.wave-area-cut.btn.btn-default.icon-scissors', {
      style: {
        'margin-left': (left - 13) + 'px'
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
    ctx.moveTo(i + 0.5, height);
    ctx.lineTo(i + 0.5, height - height * value * 2);
    ctx.closePath();
    ctx.stroke();
  }
}
function renderWaveOnCanvas1(layer1, width, height, point, index) {
  var ctx = layer1.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  if(model.hover && (model.hover[0] === index)) {
    var toBeCut = findNearestToBeCut(model.hover[0], model.hover[1], width);
    var left = width * ((toBeCut - model.cuttingPoints[index][0]) / (model.cuttingPoints[index][1] - model.cuttingPoints[index][0]));
    ctx.strokeStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(left + 0.5, height);
    ctx.lineTo(left + 0.5, 0);
    ctx.closePath();
    ctx.stroke();
  }
  if(model.toBeCut) {
    if(model.cuttingPoints[index][0] <= model.toBeCut &&
      model.toBeCut < model.cuttingPoints[index][1]) {
      var left = width * ((model.toBeCut - model.cuttingPoints[index][0]) / (model.cuttingPoints[index][1] - model.cuttingPoints[index][0]));
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(left + 0.5, height);
      ctx.lineTo(left + 0.5, 0);
      ctx.closePath();
      ctx.stroke();
    }
  }
  if(model.startPosition !== null) {
    var currentPos = currentPosition();
    if(inRangeOf(index, currentPos)) {
      var currentPos = currentPosition();
      var dataIndex = currentPos - model.cuttingPoints[index][0];
      var pos = width * (dataIndex / (model.cuttingPoints[index][1] - model.cuttingPoints[index][0]));
      ctx.strokeStyle = '#adf';
      ctx.beginPath();
      ctx.moveTo(pos + 0.5, height);
      ctx.lineTo(pos + 0.5, 0);
      ctx.closePath();
      ctx.stroke();
    }
  }
}

document.onkeydown = function (e) {
  if(e.keyCode === 90 && e.ctrlKey && e.shiftKey) {
    dispatch('redo');
  } else if(e.keyCode === 90 && e.ctrlKey) {
    dispatch('undo');
  } else if(e.keyCode === 89 && e.ctrlKey) {
    dispatch('redo');
  }
};
document.addEventListener('scroll', function() {
  var scroll = document.body.scrollTop;
  if(scroll > 60) {
    dispatch('fix-control', true);
  } else {
    dispatch('fix-control', false);
  }
});
var dispatch = core.start({
  update: update,
  render: render,
  patch: function(oldVNode, newVNode) {
    oldVNode = oldVNode || document.getElementById('container');
    patch(oldVNode, newVNode);
  }
});
dispatch('init');
