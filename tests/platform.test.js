import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedPageRequest,classifyScript,containsModuleImports,limitScriptEntries,MAX_SCRIPT_CHARS} from '../public/rte-platform.js';
test('same-origin GET policy forbids cross-origin and non-GET requests',()=>{
 assert.equal(allowedPageRequest('https://fixture.test/path','/api/data'),'https://fixture.test/api/data');
 assert.equal(allowedPageRequest('https://fixture.test','https://other.org/path'),null);
 assert.equal(allowedPageRequest('https://fixture.test','/api','POST'),null);
 assert.equal(allowedPageRequest('https://fixture.test','file:///etc/passwd'),null);
 assert.equal(allowedPageRequest('https://fixture.test','https://user:pass@fixture.test/data'),null);
 assert.equal(allowedPageRequest('https://fixture.test','javascript:alert(1)'),null);
});
test('classifies classic, module, and unsupported script types',()=>{
 assert.equal(classifyScript({type:'module'}),'module');
 assert.equal(classifyScript({type:'text/javascript'}),'classic');
 assert.equal(classifyScript({}),'classic');
 assert.equal(classifyScript({type:'application/ld+json'}),null);
});
test('import-free module detection is conservative',()=>{
 assert.equal(containsModuleImports('document.body.textContent="ok";'),false);
 assert.equal(containsModuleImports('import x from "./x.js";'),true);
 assert.equal(containsModuleImports('import("./x.js")'),true);
 assert.equal(containsModuleImports('export {x} from "./x.js"'),true);
});
test('script entry list is bounded and rejects invalid entries',()=>{
 const list=Array.from({length:33},(_,i)=>({kind:i%2?'module':'classic',inline:'ok'+i}));
 assert.equal(limitScriptEntries(list).length,20);
 assert.equal(limitScriptEntries([{kind:'json',inline:'{}'},{kind:'module',src:'/app.js'}]).length,1);
});

test('larger bundles are kept whole and oversized inline scripts are rejected, not truncated',()=>{
 const large='x'.repeat(230000),oversize='y'.repeat(MAX_SCRIPT_CHARS+1);
 const selected=limitScriptEntries([{kind:'classic',inline:large},{kind:'classic',inline:oversize},{kind:'classic',src:'/app.js'}]);
 assert.equal(selected.length,2);
 assert.equal(selected[0].inline.length,230000);
 assert.equal(selected[1].src,'/app.js');
});
