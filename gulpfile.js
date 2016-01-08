var gulp = require('gulp');
var browserify = require('browserify');
var webserver = require('gulp-webserver');
var plumber = require('gulp-plumber');
var source = require('vinyl-source-stream');
var uglify = require('gulp-uglify');
var buffer = require('vinyl-buffer');
var sourcemaps = require('gulp-sourcemaps');

gulp.task('build', function() {
	return browserify({
      entries: ['src/app.js'],
      extensions: ['.js'],
			// debug: true
    })
    .bundle()
    .pipe(source('app.js'))
		.pipe(buffer())
		.pipe(sourcemaps.init())
		.pipe(uglify())
		.pipe(sourcemaps.write('.'))
    .pipe(plumber())
    .pipe(gulp.dest('./assets'));
});
gulp.task('watch', function() {
	gulp.run('build');
	gulp.src('.')
    .pipe(webserver({
			fallback: 'index.html',
			port: 3000,
      livereload: true,
      directoryListing: true,
      open: false
    }));
	gulp.watch('./src/*.js', ['build']);
});
gulp.task('default', ['build']);
