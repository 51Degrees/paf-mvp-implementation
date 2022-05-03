// rollup.config.js
import typescript from '@rollup/plugin-typescript';
import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from '@rollup/plugin-node-resolve';

// Needed to minimize the resulting bundle.
import { terser } from 'rollup-plugin-terser';

// HTML templates used to add language text.
import postHTML from 'rollup-plugin-posthtml-template';

// Reduces the size of the HTML.
import minifyHTML from 'rollup-plugin-minify-html-literals';

// Embed the CSS into the bundle.
import { string } from 'rollup-plugin-string';

// Used to set the locale for each of the bundles.
import replace from '@rollup/plugin-replace';

// Used to get the locales available for each of the bundles.
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// Get the locale and the text as JSON.
async function getLocales() {
  const directory = './src/locales';
  const locales = new Map();
  fs.readdirSync('./src/locales').forEach(localeFile => {
    if (path.extname(localeFile) === '.yaml') {
      const language = localeFile.split('.')[0];
      const text = JSON.stringify(yaml.load(fs.readFileSync(path.join(directory, localeFile), 'utf8')));
      locales.set(language, text);
    }
  });
  if (locales.size == 0) {
    throw 'No locale files found. Check the "/src/locales" folder.';
  }
  return locales;
}

function buildLoader() {
  return {
    input: './src/loader.ts',
    plugins: [
      typescript({
        tsconfig: './tsconfig.loader.json'
      }),
      commonjs(),
      nodeResolve()
    ],
    treeshake: true,
    output: [
      {
        file: `./dist/ok-ui.js`,
        sourcemap: true,
        format: 'iife'
      },
      {
        file: `./dist/ok-ui.min.js`,
        format: 'iife',
        sourcemap: false,
        plugins: [
          terser()]
      },
      {
        file: `../paf-mvp-demo-express/public/assets/cmp/ok-ui.js`,
        sourcemap: true,
        format: 'iife'
      },
      {
        file: `../paf-mvp-demo-express/public/assets/cmp/ok-ui.min.js`,
        format: 'iife',
        sourcemap: false,
        plugins: [
          terser()]
      },
    ]
  }
}

function buildLocaleConfig(locale, value) {
  return {
    input: './src/main.ts',
    plugins: [
      typescript({
        tsconfig: './tsconfig.main.json'
      }),
      commonjs(),
      nodeResolve(),
      postHTML({ template: true }),
      minifyHTML(),
      string({ include: ['**/*.css', '**/*.svg', '**/*.js'] }),
      replace({
        exclude: 'node_modules/**',
        preventAssignment: true,
        __localeJSON__: value,
      })
    ],
    treeshake: true,
    output: [
      {
        file: `./dist/ok-ui-${locale}.js`,
        sourcemap: true,
        format: 'iife'
      },
      {
        file: `./dist/ok-ui-${locale}.min.js`,
        format: 'iife',
        sourcemap: false,
        plugins: [
          terser()]
      },
      {
        file: `../paf-mvp-demo-express/public/assets/cmp/ok-ui-${locale}.js`,
        sourcemap: true,
        format: 'iife'
      },
      {
        file: `../paf-mvp-demo-express/public/assets/cmp/ok-ui-${locale}.min.js`,
        format: 'iife',
        sourcemap: false,
        plugins: [
          terser()]
      },
    ]
  }
}

// Create the template for each locale bundle and the loader if server side selection is not being used.
async function getConfigs(locales) {
  const configs = [];
  configs.push(buildLoader());
  locales.forEach((value, locale) => {
    configs.push(buildLocaleConfig(locale, value));
  });
  return configs;
}

// Finally export the configurations for each of the locales.
export default getLocales().then(getConfigs);