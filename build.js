import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

const isWatch = process.argv.includes('--watch');

async function buildPlugin() {
  if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist', { recursive: true });
  }

  // 1. Build plugin main thread (code.ts -> dist/code.js)
  const codeConfig = {
    entryPoints: ['src/code.ts'],
    bundle: true,
    platform: 'browser',
    target: 'es2020',
    outfile: 'dist/code.js',
    logLevel: 'info',
  };

  // 2. Build UI thread (src/ui/ui.ts inlined into dist/ui.html)
  async function compileUI() {
    const uiResult = await esbuild.build({
      entryPoints: ['src/ui/ui.ts'],
      bundle: true,
      write: false,
      format: 'iife',
      target: 'es2020',
      logLevel: 'info',
    });

    const bundledJs = uiResult.outputFiles[0].text;
    const cssPath = path.resolve('src/ui/styles.css');
    const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf-8') : '';
    const htmlPath = path.resolve('src/ui/index.html');
    let html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf-8') : '<html><body><div id="app"></div></body></html>';

    // Inline CSS and JS
    if (html.includes('<!-- INLINE_CSS -->')) {
      html = html.replace('<!-- INLINE_CSS -->', `<style>${css}</style>`);
    } else {
      html = html.replace('</head>', `<style>${css}</style></head>`);
    }

    if (html.includes('<!-- INLINE_JS -->')) {
      html = html.replace('<!-- INLINE_JS -->', `<script>${bundledJs}</script>`);
    } else {
      html = html.replace('</body>', `<script>${bundledJs}</script></body>`);
    }

    fs.writeFileSync('dist/ui.html', html, 'utf-8');
    console.log('UI bundle updated: dist/ui.html');
  }

  if (isWatch) {
    const codeCtx = await esbuild.context(codeConfig);
    await codeCtx.watch();
    console.log('Watching main thread (code.ts)...');

    await compileUI();
    fs.watch('src/ui', { recursive: true }, async () => {
      try {
        await compileUI();
      } catch (err) {
        console.error('Error rebuilding UI:', err);
      }
    });
  } else {
    await esbuild.build(codeConfig);
    await compileUI();
    console.log('Build complete: dist/code.js and dist/ui.html created.');
  }
}

buildPlugin().catch((err) => {
  console.error(err);
  process.exit(1);
});
