import test from 'node:test';
import assert from 'node:assert/strict';
import {FLAG_DEFINITIONS,defaultFlags,sanitizeFlags,SEARCH_ENGINES,normalizeNavigation,normalizeSearchEngine,searchURL,validSiteHost,sanitizeSitePermissions,getSiteJavascript,sanitizeWorkspace} from '../public/browser-features.js';
test('all flags have unique ids and boolean defaults',()=>{
 const ids=FLAG_DEFINITIONS.map(x=>x.id);assert.equal(new Set(ids).size,ids.length);
 for(const x of FLAG_DEFINITIONS){assert.equal(typeof x.default,'boolean');assert.ok(x.description);assert.equal(typeof defaultFlags()[x.id],'boolean');}
});
test('unknown and malformed settings are ignored',()=>{
 assert.deepEqual(sanitizeFlags({'rte-images':false,notReal:true,'performance-stats':'maybe'}),{...defaultFlags(),'rte-images':false});
 assert.deepEqual(sanitizeFlags(null),defaultFlags());
});
test('search engine routing uses encoded search terms',()=>{
 assert.equal(normalizeSearchEngine('missing'),'duckduckgo');
 assert.equal(normalizeNavigation('ryftipe://flags'),'ryftipe://flags');
 assert.equal(normalizeNavigation('fixture.test/path'),'https://fixture.test/path');
 assert.equal(normalizeNavigation('https://fixture.test'),'https://fixture.test');
 assert.equal(normalizeNavigation('hello world','brave'),searchURL('hello world','brave'));
 assert.match(searchURL('a & b','google'),/a%20%26%20b/);
 assert.equal(Object.keys(SEARCH_ENGINES).length,4);
});
test('per-site script permission choices',()=>{
 const saved=sanitizeSitePermissions({'fixture.test':{javascript:'block'},'youtube.com':{javascript:'allow'},'malformed':{javascript:'hack'}});
 assert.equal(getSiteJavascript(saved,'https://fixture.test',true),false);
 assert.equal(getSiteJavascript(saved,'https://youtube.com',false),true);
 assert.equal(getSiteJavascript(saved,'https://unknown.org',false),false);
 assert.equal(validSiteHost('ryftipe://flags'),'');
 assert.equal(saved.malformed,undefined);
});
test('workspace accepts bounded URL-only tab records',()=>{
 const w=sanitizeWorkspace([{id:1,url:'ryftipe://home',title:'Home'},{id:2,url:'javascript:alert(1)',title:'bad'},{id:3,url:'https://fixture.test',title:'Fixture'}]);
 assert.equal(w.length,3);assert.equal(w[1].url,'ryftipe://home');assert.equal(w[2].url,'https://fixture.test');
});
