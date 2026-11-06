import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleImports,resolveImport,isUnsupportedModule,loadModuleGraph} from '../public/rte-modules.js';

test('RTE static import and re-export discovery',()=>{
 const source='import {name} from "./dependency.js"; export {value} from "./other.js"; import "./side.js";';
 assert.deepEqual(moduleImports(source),['./dependency.js','./other.js','./side.js']);
});
test('RTE module policy blocks bare and cross-origin modules',()=>{
 assert.equal(resolveImport('./dep.js','https://fixture.test/path/entry.js','https://fixture.test'),'https://fixture.test/path/dep.js');
 assert.equal(resolveImport('react','https://fixture.test/app.js','https://fixture.test'),null);
 assert.equal(resolveImport('https://elsewhere.com/app.js','https://fixture.test/app.js','https://fixture.test'),null);
 assert.equal(resolveImport('javascript:alert(1)','https://fixture.test/app.js','https://fixture.test'),null);
 assert.equal(isUnsupportedModule('import("./x.js")'),true);
 assert.equal(isUnsupportedModule('console.log(import.meta.url)'),true);
});
test('RTE module graph orders dependencies before entry',async()=>{
 const files=new Map([
  ['https://fixture.test/main.js','import {message} from "./dep.js"; document.body.textContent = message;'],
  ['https://fixture.test/dep.js','export const message = "module graph working";']
 ]);
 const graph=await loadModuleGraph('https://fixture.test/main.js',async url=>{assert.ok(files.has(url));return files.get(url);});
 assert.equal(graph.modules.length,2);
 assert.equal(graph.modules[0].url,'https://fixture.test/dep.js');
 assert.equal(graph.modules[1].url,'https://fixture.test/main.js');
 assert.equal(graph.modules[1].dependencies[0].specifier,'./dep.js');
});
test('RTE graph refuses cyclic imports and budget overruns',async()=>{
 const files=new Map([
 ['https://fixture.test/a.js','import "./b.js"'],
 ['https://fixture.test/b.js','import "./a.js"']
 ]);
 await assert.rejects(()=>loadModuleGraph('https://fixture.test/a.js',url=>files.get(url)),/Cyclic/);
 await assert.rejects(()=>loadModuleGraph('https://fixture.test/a.js',()=>Promise.resolve('x'.repeat(500)),{maxBytes:100}),/byte limit/);
});

test('RTE allows a bounded 220 KB static ES module',async()=>{
 const source='/*'+'x'.repeat(220000)+'*/export const ok=true;';
 const result=await loadModuleGraph('https://fixture.test/bundle.js',async()=>source);
 assert.equal(result.modules[0].source.length,source.length);
 assert.equal(result.bytes,source.length);
});
