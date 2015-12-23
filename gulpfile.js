var gulp = require('gulp');
var browserify = require('gulp-browserify');
var gls = require('gulp-live-server');

gulp.task('build', function() {
	gulp.src('./src/*.js')
		.pipe(browserify({
		  insertGlobals : true,
		  debug : !gulp.env.production
		}))
		.pipe(gulp.dest('./public'))
});
gulp.task('watch', function() {
  var server = gls.new('server.js');
  server.start();
  gulp.watch('./src/*.js', ['build']);
});
gulp.task('default', ['build']);
