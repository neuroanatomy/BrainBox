const exec = require('child_process').execSync;
const del = require('del');

const gulp = require('gulp');
const concat = require('gulp-concat');
const rename = require('gulp-rename');
const uglify = require('gulp-uglify-es').default;
const sourcemaps = require('gulp-sourcemaps');
const download = require('gulp-download');
const gulpif = require('gulp-if');
const print = require('gulp-print');

const brainboxFiles = ['view/dist/atlasMaker.*js', 'view/brainbox/*.js'];
const atlasmakerFiles = ['view/downloads/*.js', 'view/atlasMaker/*.js', 'view/dist/atlasMaker-*.js'];
const jsdest = 'view/dist/';
const tmpFiles = ['atlasMaker-resources.js'];

gulp.task('default', ['brainbox-dev']);

gulp.task('brainbox-dev', ['pack-brainbox-dev']);
gulp.task('brainbox', ['pack-brainbox']);
gulp.task('atlasMaker-dev', ['pack-atlasMaker-dev']);
gulp.task('atlasMaker', ['pack-atlasMaker']);

gulp.task('pack-brainbox-dev', ['pack-atlasMaker-dev'], function () {
    return gulp.src(brainboxFiles)
        .pipe(print())
        .pipe(sourcemaps.init())
        //.pipe(gulpif(file => !(file.path.includes('.min.js')), uglify()))
        .pipe(concat('brainbox.js'))
        //.pipe(gulp.dest(jsdest))
        //.pipe(rename('brainbox.min.js'))
        .pipe(sourcemaps.write())
        .pipe(gulp.dest(jsdest));
});

gulp.task('pack-atlasMaker-dev', ['download', 'pack-resources'], function () {
    return gulp.src(atlasmakerFiles)
        //.pipe(sourcemaps.init())
        //.pipe(gulpif(file => !(file.path.includes('.min.js')), uglify()))
        .pipe(concat('atlasMaker.js'))
        //.pipe(gulp.dest(jsdest))
        //.pipe(rename('atlasMaker.min.js'))
        //.pipe(sourcemaps.write())
        .pipe(gulp.dest(jsdest));
});

gulp.task('pack-brainbox', ['pack-atlasMaker'], function () {
    return gulp.src(brainboxFiles)
        .pipe(gulpif(file => !(file.path.includes('.min.js')), uglify()))
        .pipe(concat('brainbox.js'))
        .pipe(gulp.dest(jsdest))
        .pipe(rename('brainbox.min.js'))
        .pipe(gulp.dest(jsdest));
});

gulp.task('pack-atlasMaker', ['download', 'pack-resources'], function () {
    return gulp.src(atlasmakerFiles)
        .pipe(gulpif(file => !(file.path.includes('.min.js')), uglify()))
        .pipe(concat('atlasMaker.js'))
        .pipe(gulp.dest(jsdest))
        .pipe(rename('atlasMaker.min.js'))
        .pipe(gulp.dest(jsdest));
});

gulp.task('clean-brainbox-dev', ['pack-brainbox-dev'], function () {
    return del(tmpFiles);
});
gulp.task('clean-brainbox', ['pack-brainbox'], function () {
    return del(tmpFiles);
});
gulp.task('clean-atlasMaker-dev', ['pack-atlasMaker-dev'], function () {
    return del(tmpFiles);
});
gulp.task('clean-atlasMaker', ['pack-atlasMaker'], function () {
    return del(tmpFiles);
});

gulp.task('download', function () {
    download([
        'https://code.jquery.com/jquery-3.2.1.min.js',
        'https://code.jquery.com/ui/1.12.1/jquery-ui.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/pako/1.0.6/pako.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/dompurify/1.0.2/purify.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/fast-json-patch/2.0.6/fast-json-patch.min.js',
        'https://cdn.rawgit.com/r03ert0/structjs/v0.0.1/struct.js'
    ])
    .pipe(gulp.dest('view/downloads'));

});
gulp.task('pack-resources', function () {
    exec('node scripts/alltogethernow.js "view/atlasMaker/" "AtlasMakerResources.js"');
    exec('mv "AtlasMakerResources.js" "view/dist/atlasMaker-resources.js"');
});

gulp.task('copy', function () {
    exec('cp view/dist/brainbox.js public/lib/brainbox.js');
    exec('cp view/dist/brainbox.js /Library/WebServer/Documents/braincatalogue/public/lib/brainbox.js');
});

gulp.task('copy-min', function () {
    exec('cp view/dist/brainbox.min.js public/lib/brainbox.min.js');
});

