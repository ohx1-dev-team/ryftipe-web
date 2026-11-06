import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('Ryftipe opens its own homepage and never preloads an external sample site',()=>{
 const app=readFileSync(resolve(root,'public/app.js'),'utf8');
 const server=readFileSync(resolve(root,'server.js'),'utf8');
 assert.match(app,/remoteURL='ryftipe:\/\/home'/);
 assert.match(app,/openInternal\('home',\{replace:true\}\)/);
 assert.doesNotMatch(server,/page\.goto\(['"]https?:\/\/(?:www\.)?example\./);
 assert.match(server,/The Ryftipe homepage stays the/);
});
test('no public runtime file hardcodes a demo website',()=>{
 for(const path of ['public/app.js','public/index.html','public/browser-ui.js','public/browser-features.js','server.js']){
  const data=readFileSync(resolve(root,path),'utf8');
  assert.doesNotMatch(data,/https?:\/\/(?:www\.)?example\.(?:org|com|net)/i,'Demo URL is hard-coded in '+path);
 }
});
