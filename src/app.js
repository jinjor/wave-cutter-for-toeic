var core = require('./core.js');
var view = require('./view.js');
var model = require('./model.js');

core.start({
  model: model,
  view: view
});
