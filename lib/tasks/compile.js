// eslint-disable-next-line import/order
const { getProjectPath, injectRequire } = require('../utils/projectHelper')

injectRequire()

const merge2 = require('merge2')
const through2 = require('through2')
const babel = require('gulp-babel')
const ts = require('gulp-typescript')
const stripCode = require('gulp-strip-code')
const gulp = require('gulp')
const rimraf = require('rimraf')
const argv = require('minimist')(process.argv.slice(2));
const transformSass = require('./common/transformSass')
const getBabelCommonConfig = require('./common/getBabelCommonConfig')
const tsConfig = require('./common/getTSCommonConfig')()
const replaceLib = require('./common/replaceLib')
const { cssInjection } = require('../utils/styleUtil');

const tsDefaultReporter = ts.reporter.defaultReporter()
const libDir = getProjectPath('lib')
const esDir = getProjectPath('es')

function babelify(js, modules) {
    const babelConfig = getBabelCommonConfig(modules)
    delete babelConfig.cacheDirectory
    if (modules === false) {
        babelConfig.plugins.push(replaceLib)
    }
    let stream = js.pipe(babel(babelConfig)).pipe(
        through2.obj(function (file, encoding, next) {
            this.push(file.clone());
            if (file.path.match(/(\/|\\)style(\/|\\)index\.js/)) {
              const content = file.contents.toString(encoding);
              if (content.indexOf("'react-native'") !== -1) {
                // actually in antd-mobile@2.0, this case will never run,
                // since we both split style/index.mative.js style/index.js
                // but let us keep this check at here
                // in case some of our developer made a file name mistake ==
                next();
                return;
              }
      
              file.contents = Buffer.from(cssInjection(content));
              file.path = file.path.replace(/index\.js/, 'css.js');
              this.push(file);
              next();
            } else {
              next();
            }
        })
    )
    if (modules === false) {
        stream = stream.pipe(
          stripCode({
            start_comment: '@remove-on-es-build-begin',
            end_comment: '@remove-on-es-build-end',
          })
        );
      }
      return stream.pipe(gulp.dest(modules === false ? esDir : libDir));
}

function compile(modules) {
    rimraf.sync(modules !== false ? libDir : esDir)

    // compile sass files
    const sass = gulp
        .src(['components/**/*.scss'])
        .pipe(
            through2.obj(function (file, encoding, next) {
                this.push(file)

                if (
                    file.path.match(/(\/|\\)style(\/|\\)index\.scss$/) ||
                    file.path.match(/(\/|\\)style(\/|\\)v2-compatible-reset\.scss$/)
                ) {
                    transformSass(file.path)
                        .then((css) => {
                            file.contents = Buffer.from(css)
                            file.path = file.path.replace(/\.scss$/, '.css')
                            this.push(file)
                            next()
                        })
                        .catch(e => {
                            console.error(e);
                        });
                } else {
                    next()
                }
            })
        )
        .pipe(gulp.dest(modules === false ? esDir : libDir))
    
    // copy assets
    const assets = gulp
        .src(['components/**/*.@(png|svg)'])
        .pipe(gulp.dest(modules === false ? esDir : libDir))

    let error = 0
    const source = [
        'components/**/*.tsx',
        'components/**/*.ts',
        'typings/**/*.d.ts',
        '!components/**/__tests__/**',
    ]

    const tsResult = gulp.src(source).pipe(
        ts(tsConfig, {
            error(e) {
                tsDefaultReporter.error(e);
                error = 1;
            },
            finish: tsDefaultReporter.finish,
        })
    )
    function check() {
        if (error && !argv['ignore-error']) {
            process.exit(1);
        }
    }

    tsResult.on('finish', check)
    tsResult.on('end', check)

    const tsFilesStream = babelify(tsResult.js, modules);
    const tsd = tsResult.dts.pipe(gulp.dest(modules === false ? esDir : libDir))
    return merge2([sass, tsFilesStream, tsd, assets])
}

gulp.task('compile-with-es', done => {
    console.log('[Parallel] Compile to es...');
    compile(false).on('finish', done);
})
  
gulp.task('compile-with-lib', done => {
    console.log('[Parallel] Compile to js...');
    compile().on('finish', done);
})

gulp.task(
    'compile',
    gulp.series(gulp.parallel('compile-with-es', 'compile-with-lib'))
)

