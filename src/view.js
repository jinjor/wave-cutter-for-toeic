var snabbdom = require('snabbdom');
var patch = snabbdom.init([
  require('snabbdom/modules/class'),
  require('snabbdom/modules/props'),
  require('snabbdom/modules/attributes'),
  require('snabbdom/modules/style'),
  require('snabbdom/modules/eventlisteners'),
]);
var h = require('snabbdom/h');

function mobile() {
  var ua = navigator.userAgent;
  // return true;
  return ((ua.indexOf('iPhone') > 0 && ua.indexOf('iPad') < 0)
    || ua.indexOf('iPod') > 0
    || ua.indexOf('Android') > 0);
}

module.exports = function(model, dispatch) {

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
        disabled: !model.canUndo
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
        disabled: !model.canRedo
      },
      on: {
        click: function() {
          dispatch('redo');
        }
      }
    });
  }
  function renderNamingButton() {
    var name = renderNamingRuleLabel();
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
  function renderNamingRuleLabel() {
    var rule = model.namingRule();
    var children = [rule.name];
    if(rule.name === 'From') {
      children.push(h('input.name-from-input', { on: {
        input: function(e) {
          dispatch('name-from-input', e.target.value);
        },
        blur: function(e) {
          setTimeout(dispatch);
        }
      }, props: {
        value: '' + model.namingFrom
      }}))
    }
    return h('div.naming-button', children);
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
    return [ h('label.btn.btn-' + (step === 0 ? 'primary' : 'default'), {
      attrs:{for:'read'},
    }, [
      h('span', ['Choose file']),
    ]), h('input#read.read', {
      props:{type:'file', accept:'.wav,.mp3,.ogg,.aac'},
      on: {
        change: function(e) {
          var file = e.target.files[0];
          dispatch('read-button', file);
        }
      }
    })];
  }

  function renderControls() {
    var step = model.cuttingPoints ? 1 : 0;
    var children = renderLoadButton(step);
    if(model.cuttingPoints) {
      children.push(renderSaveButton(step));
      children.push(renderUndoButton());
      children.push(renderRedoButton());
      children.push(renderNamingButton());

      var expected = model.namingRuleLength();
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
    var name = h('span.wave-area-name', [model.naming(index) || '　']);
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
      var currentPos = model.currentPosition();
      if(model.inRangeOf(index, currentPos)) {
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
      var toBeCut = model.findNearestToBeCut(model.hover[0], model.hover[1], width);
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
      var currentPos = model.currentPosition();
      if(model.inRangeOf(index, currentPos)) {
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

  return {
    render: render,
    patch: function(oldVNode, newVNode) {
      oldVNode = oldVNode || document.getElementById('container');
      patch(oldVNode, newVNode);
    }
  };
}
