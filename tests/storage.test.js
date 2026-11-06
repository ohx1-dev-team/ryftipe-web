import test from 'node:test';
import assert from 'node:assert/strict';
import {siteStorageKey,sanitizeSiteStorage,readSiteStorage,applySiteStorageMessage,clearSiteStorage} from '../public/rte-storage.js';
import {UpstreamHTTPError} from '../rte/engine.js';

function fakeStorage(){
 const state=new Map();
 return {get length(){return state.size;},key(i){return [...state.keys()][i]??null;},getItem(k){return state.get(k)??null;},setItem(k,v){state.set(k,String(v));},removeItem(k){state.delete(k);}};
}
test('storage is strictly separated by website origin and Ryftipe settings',()=>{
 const storage=fakeStorage();storage.setItem('ryftipe.theme','dark');
 assert.equal(siteStorageKey('https://fixture.test/a'),siteStorageKey('https://fixture.test/b'));
 assert.notEqual(siteStorageKey('https://fixture.test'),siteStorageKey('https://other.org'));
 assert.equal(siteStorageKey('file:///secret'),null);
 assert.equal(applySiteStorageMessage(storage,'https://fixture.test',{operation:'set',key:'visited',value:'yes'}),true);
 assert.equal(readSiteStorage(storage,'https://fixture.test').visited,'yes');
 assert.equal(readSiteStorage(storage,'https://other.org').visited,undefined);
 assert.equal(readSiteStorage(storage,'https://fixture.test')['ryftipe.theme'],undefined);
 assert.equal(storage.getItem('ryftipe.theme'),'dark');
 assert.equal(clearSiteStorage(storage),1);
 assert.equal(storage.getItem('ryftipe.theme'),'dark');
 assert.equal(readSiteStorage(storage,'https://fixture.test').visited,undefined);
});
test('storage is capped and rejects prototype keys and oversize values',()=>{
 const storage=fakeStorage(),origin='https://fixture.test';
 assert.equal(applySiteStorageMessage(storage,origin,{operation:'set',key:'__proto__',value:'malicious'}),false);
 assert.equal(applySiteStorageMessage(storage,origin,{operation:'set',key:'large',value:'x'.repeat(5000)}),false);
 assert.equal(Object.keys(sanitizeSiteStorage(Object.fromEntries(Array.from({length:100},(_,i)=>['key'+i,'v'])))).length,80);
 assert.equal(applySiteStorageMessage(storage,origin,{operation:'clear'}),true);
});
test('upstream failure retains the website status and hostname',()=>{
 const error=new UpstreamHTTPError(418,'https://archiveofourown.org/works/123');
 assert.equal(error.upstreamStatus,418);
 assert.equal(error.site,'archiveofourown.org');
 assert.match(error.message,/HTTP 418/);
});
