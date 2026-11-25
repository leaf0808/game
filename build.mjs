// 打包第二关「毛毛虫的蘑菇森林」：three + 关卡源码 + 内联的 GLB 模型 → roam.bundle.js
// 产物是单个普通脚本，模型以 base64 内嵌，因此直接双击 roam.html 也能运行。
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));

await build({
  entryPoints: [path.join(root, 'caterpillar_tree/src/main.js')],
  outfile: path.join(root, 'caterpillar_tree/roam.bundle.js'),
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  minify: true,
  legalComments: 'none',
  loader: { '.glb': 'binary', '.png': 'dataurl' },
  logLevel: 'info',
});
