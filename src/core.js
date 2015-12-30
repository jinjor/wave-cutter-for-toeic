
function start(options) {
  var requestRendering = 0;
  var patch = options.patch;
  var update = options.update;
  var render = options.render;
  var old = null;

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

  return dispatch;
}
module.exports = {
  start: start
};
