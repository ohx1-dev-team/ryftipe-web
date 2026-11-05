import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedPageRequest,classifyScript,containsModuleImports,limitScriptEntries} from '../public/rte-platform.js';
test('same-origin GET policy forbids cross-origin and non-GET requests',()=>{
 assert.equal(allowedPageRequest('https://example.org/path','/api/data'),'https://example.org/api/data');
 assert.equal(allowedPageRequest('https://example.org','https://other.org/path'),null);
 assert.equal(allowedPageRequest('https://example.org','/api','POST'),null);
 assert.equal(allowedPageRequest('https://example.org','file:///etc/passwd'),null);
 assert.equal(allowedPageRequest('https://example.org','https://user:pass@example.org/data'),null);
 assert.equal(allowedPageRequest('https://example.org','javascript:alert(1)'),null);
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
