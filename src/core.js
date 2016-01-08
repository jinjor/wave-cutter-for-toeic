
function start(options) {
  var requestRendering = 0;
  var patch = options.patch;
  var model = options.model(dispatch);
  var view = options.view(model, dispatch);
  var old = null;

  function dispatch(type, data) {
    console.log(type);
    setTimeout(function() {
      model.update(type, data);
      requestRendering++;
    });
  }
  function loop() {
    if(requestRendering) {
      // console.log(requestRendering);
      requestRendering = 0;
      var vnode = view.render();
      view.patch(old, vnode);
      old = vnode;
    }
    requestAnimationFrame(loop);
  };
  loop();

  dispatch('init');
}
module.exports = {
  start: start
};
