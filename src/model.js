var logic = require('./logic.js');
var async = require('async');
var JSZip = require("jszip");
var namingTypes = require('./names.js');

module.exports = function(dispatch) {

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
    namingType: 1,
    namingFrom: 1,
    encodedFiles: [],
    audioContext: window.AudioContext ? new AudioContext() : null,
    fileName: null,
    loading: false,
    data: null,
    sampleRate: null,
    originalCuttingPoints: null,
    cuttingPoints: null,
    saving: false
  };

  function update(type, data) {
    if(type === 'init') {

    } else if(type === 'read-button') {
      var reader = new FileReader();
      reader.onload = function(e) {
        // reset
        model.actions = [];
        model.actionCursor = -1;
        model.source = null;
        model.startPosition = null;
        model.startTime = null;
        model.currentTime = null;
        model.hover = null;
        model.toBeCut = null;
        model.fixControl = false;
        model.maxRows = 0;
        model.encodedFiles = [];
        //
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
            if(value.namingType < model.namingTypes.length) {
              model.namingType = value.namingType;
            }
            model.namingFrom = value.namingFrom || 1;
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
    } else if(type === 'name-from-input') {
      var num = parseInt(data);
      if(!isNaN(num)) {
        model.namingFrom = num;
        saveActionsAndState();
      }
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
      if(model.currentTime) {
        stop();
      }
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
            var fileName = fileNameOfIndex(i);
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
        namingType: model.namingType,
        namingFrom: model.namingFrom
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

  function namingRuleLength() {
    var rule = namingRule();
    if(rule.name === 'From') {
      return model.cuttingPoints.length;
    } else {
      return rule.names.length;
    }
  }
  function namingRule() {
    return model.namingTypes[model.namingType];
  }
  function fileNameOfIndex(i) {
    var rule = namingRule();
    if(rule.name === 'From') {
      return (model.namingFrom + i) + '.mp3';
    } else {
      var name = naming(i);
      var fileName = (i + 1) + (name ? '_no' + name : '') + '.mp3';
      return fileName
    }
  }
  function naming(i) {
    var rule = namingRule();
    if(rule.name === 'From') {
      return '' + (model.namingFrom + i);
    } else {
      return rule.names[i];
    }
  }

  return {
    get source() { return model.source; },
    get startPosition() { return model.startPosition; },
    get startTime() { return model.startTime; },
    get currentTime() { return model.currentTime; },
    get hover() { return model.hover; },
    get toBeCut() { return model.toBeCut; },
    get fixControl() { return model.fixControl; },
    get maxRows() { return model.maxRows; },
    get namingFrom() { return model.namingFrom; },
    get encodedFiles() { return model.encodedFiles; },
    get fileName() { return model.fileName; },
    get loading() { return model.loading; },
    get cuttingPoints() { return model.cuttingPoints; },
    get data() { return model.data; },
    get sampleRate() { return model.sampleRate; },
    get saving() { return model.saving; },
    get canUndo() { return model.actionCursor >= 0; },
    get canRedo() { return model.actionCursor < model.actions.length - 1; },
    update: update,
    currentPosition: currentPosition,
    dataLengthOfTime: dataLengthOfTime,
    indexOfPosition: indexOfPosition,
    inRangeOf: inRangeOf,
    namingRuleLength: namingRuleLength,
    namingRule: namingRule,
    naming: naming,
    findNearestToBeCut: findNearestToBeCut,
  };
}
