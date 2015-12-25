var gulp = require('gulp');
var browserify = require('browserify');
var webserver = require('gulp-webserver');
var plumber = require('gulp-plumber');
var source = require('vinyl-source-stream');

gulp.task('build', function() {
	return browserify({
      entries: ['src/app.js'],
      extensions: ['.js']
    })
    .bundle()
    .pipe(source('app.js'))
    .pipe(plumber())
    .pipe(gulp.dest('./assets'));
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
