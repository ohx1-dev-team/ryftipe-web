import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedPageRequest,limitScriptEntries,MAX_PAGE_SCRIPT_CHARS} from '../public/rte-platform.js';
import {resolveImport,loadModuleGraph} from '../public/rte-modules.js';

test('RTE fetch policy accepts public cross-origin GET URLs but rejects writes and credentials',()=>{
 const page='https://www.youtube.com/watch?v=abc';
 assert.equal(allowedPageRequest(page,'https://www.youtubei.googleapis.com/youtubei/v1/player'),'https://www.youtubei.googleapis.com/youtubei/v1/player');
 assert.equal(allowedPageRequest(page,'https://i.ytimg.com/vi/abc/hqdefault.jpg'),'https://i.ytimg.com/vi/abc/hqdefault.jpg');
 assert.equal(allowedPageRequest(page,'https://user:pass@example.com/data'),null);
 assert.equal(allowedPageRequest(page,'https://example.com/data','POST'),null);
 assert.equal(allowedPageRequest(page,'file:///etc/passwd'),null);
});

test('module resolver supports absolute cross-origin HTTPS dependencies but blocks unsafe URLs',()=>{
 assert.equal(resolveImport('https://cdn.example.net/app.js','https://site.example/app.js','https://site.example'),'https://cdn.example.net/app.js');
 assert.equal(resolveImport('//cdn.example.net/app.js','https://site.example/app.js','https://site.example'),'https://cdn.example.net/app.js');
 assert.equal(resolveImport('javascript:alert(1)','https://site.example/app.js','https://site.example'),null);
 assert.equal(resolveImport('https://user:pass@example.net/x.js','https://site.example/app.js','https://site.example'),null);
 assert.equal(resolveImport('react','https://site.example/app.js','https://site.example'),null);
});

test('bounded module graph fetches cross-origin dependencies and enforces its budget',async()=>{
 const sources=new Map([
  ['https://site.example/main.js',"import {value} from 'https://cdn.example.net/lib.js'; window.result=value;"],
  ['https://cdn.example.net/lib.js','export const value=42;']
 ]);
 const graph=await loadModuleGraph('https://site.example/main.js',async url=>sources.get(url));
 assert.equal(graph.modules.length,2);
 assert.equal(graph.modules[0].url,'https://cdn.example.net/lib.js');
 assert.ok(graph.bytes>0&&graph.bytes<=MAX_PAGE_SCRIPT_CHARS);
});

test('script entry selection allows a larger bounded application bundle',()=>{
 const entries=Array.from({length:100},(_,i)=>({kind:'classic',src:'https://cdn.example.net/'+i+'.js'}));
 assert.equal(limitScriptEntries(entries).length,80);
});
