// rollup.config.js
import typescript from '@rollup/plugin-typescript';
import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from '@rollup/plugin-node-resolve';

// Needed to minimize the resulting bundle.
import { terser } from 'rollup-plugin-terser';

// Used to get the locales for embedding into the bundle.
import yaml from '@rollup/plugin-yaml';

// HTML templates used to add language text.
import postHTML from 'rollup-plugin-posthtml-template';

// Reduces the size of the HTML.
import minifyHTML from 'rollup-plugin-minify-html-literals';

// Embed the CSS into the bundle.
import { string } from 'rollup-plugin-string';

export default {
  input: './src/main.ts',
  plugins: [
    commonjs(),
    nodeResolve(),
    postHTML({ template: true }),
    minifyHTML(),
    string({ include: ['**/*.css', '**/*.svg', '**/*.js'] }),
    typescript({
      sourceMap: false,
      tsconfig: './tsconfig.json'
    }),
    yaml()
  ],
  treeshake: 'smallest',
  output: [
    {
      file: './dist/ok-audit.js',
      format: 'iife',
      sourcemap: true
    },
    {
      file: './dist/ok-audit.min.js',
      format: 'iife',
      sourcemap: false,
      plugins: [
        terser()
      ]
    },
    {
      file: '../paf-mvp-demo-express/public/assets/ok-audit.js',
      format: 'iife',
      sourcemap: true
    },
    {
      file: '../paf-mvp-demo-express/public/assets/ok-audit.min.js',
      format: 'iife',
      sourcemap: false,
      plugins: [
        terser()
      ]
    }
  ]
};