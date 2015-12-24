var gulp = require('gulp');
var browserify = require('gulp-browserify');
var webserver = require('gulp-webserver');

gulp.task('build', function() {
	gulp.src('./src/*.js')
		.pipe(browserify({
		  insertGlobals : true,
		  debug : !gulp.env.production
		}))
		.pipe(gulp.dest('./assets'))
});
gulp.task('watch', function() {
	gulp.src('.')
    .pipe(webserver({
			fallback: 'index.html',
			port: 3000,
      livereload: true,
      directoryListing: true,
      open: true
    }));
	gulp.watch('./src/*.js', ['build']);
});
gulp.task('default', ['build']);
