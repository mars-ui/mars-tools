const sass = require('sass');
const path = require('path');
const postcss = require('postcss');
const autoprefixer = require('autoprefixer');

function transformSass(sassFile, config = {}) {
  const { cwd = process.cwd() } = config;
  const resolvedSassFile = path.resolve(cwd, sassFile);

  const sassOpts = {
    file: resolvedSassFile,
  };
  return sass
    .renderSync(sassOpts)
    .then(result => postcss([autoprefixer]).process(result.css, { from: undefined }))
    .then(r => r.css);
}

module.exports = transformSass;
