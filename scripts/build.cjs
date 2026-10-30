const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
async function build() {
  const dist = path.join(root, 'dist');
  fs.rmSync(dist, {recursive: true, force: true}); fs.mkdirSync(dist);
  for (const name of ['index', 'board']) for (const sandbox of [false, true]) {
    await esbuild.build({absWorkingDir: root, entryPoints: [`src/widgets/${name}.tsx`], outfile: `dist/${name}${sandbox ? '-sandbox' : ''}.js`, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', minify: true, define: {'process.env.NODE_ENV': '"production"'}, banner: sandbox ? undefined : {js: 'const IMPORT_META=import.meta;'}, legalComments: 'eof'});
  }
  fs.cpSync(path.join(root, 'public'), dist, {recursive: true});
  fs.copyFileSync(path.join(root, 'README.md'), path.join(dist, 'README.md'));
  // The public SDK renderer requests App.css for both native and sandbox widgets.
  fs.copyFileSync(path.join(dist, 'board.css'), path.join(dist, 'App.css'));
  fs.writeFileSync(path.join(dist, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="App.css"><body><script type="module">const name=new URLSearchParams(location.search).get('widgetName');if(['index','board'].includes(name)){const s=document.createElement('script');s.src=name+'-sandbox.js';document.body.append(s)}else{document.body.innerHTML='<p style="padding:24px;font-family:system-ui">这是 RemNote 数据库看板的插件文件服务。请在 RemNote 内加载插件，再通过命令菜单打开看板。<a href="README.md">使用说明</a></p>'}</script></body></html>`);
  await esbuild.build({absWorkingDir: root, entryPoints: ['src/preview.tsx'], outfile: 'dist/preview.js', bundle: true, format: 'iife', platform: 'browser', target: 'es2020', minify: true, define: {'process.env.NODE_ENV': '"production"'}, legalComments: 'eof'});
  fs.writeFileSync(path.join(dist, 'preview.html'), '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RemNote 数据库看板 · 交互演示</title><link rel="stylesheet" href="preview.css"><body style="margin:0"><div id="root"></div><script src="preview.js"></script></body></html>');
  const zip = path.join(root, 'PluginZip.zip'); fs.rmSync(zip, {force: true});
  // The installable plugin contains no standalone fixture or fixture data.
  execFileSync('/usr/bin/zip', ['-qr', zip, '.', '-x', 'preview*'], {cwd: dist});
  console.log('Built dist/ and PluginZip.zip');
}
build().catch(e => {console.error(e); process.exit(1);});
