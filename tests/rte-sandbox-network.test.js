import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../public/sandbox.html',import.meta.url),'utf8');
const match=source.match(/function resolveRTERequestURL\(raw,base\)\{[\s\S]*?\n\}/);
assert.ok(match,'sandbox request URL policy helper exists');
const resolveRTERequestURL=vm.runInNewContext('('+match[0]+')',{URL});

test('sandbox resolves cross-origin public HTTP(S) resources',()=>{
 assert.equal(resolveRTERequestURL('https://cdn.topeaglerservers.com/assets/app.js','https://topeaglerservers.com/'),'https://cdn.topeaglerservers.com/assets/app.js');
 assert.equal(resolveRTERequestURL('/api/status','https://topeaglerservers.com/'),'https://topeaglerservers.com/api/status');
});

test('sandbox rejects unsafe schemes, credentials, and oversized URLs',()=>{
 assert.equal(resolveRTERequestURL('file:///etc/passwd','https://topeaglerservers.com/'),null);
 assert.equal(resolveRTERequestURL('https://user:pass@cdn.example/app.js','https://topeaglerservers.com/'),null);
 assert.equal(resolveRTERequestURL('https://cdn.example/'+ 'x'.repeat(2100),'https://topeaglerservers.com/'),null);
});

test('fetch and XHR share the cross-origin GET bridge',()=>{
 assert.match(source,/const absolute=resolveRTERequestURL\(raw,pageURL\)/);
 assert.match(source,/window\.fetch=\(input,options=\{\}\)=>/);
 assert.match(source,/async send\(body=null\)/);
 assert.match(source,/window\.XMLHttpRequest=RTEHttpRequest/);
 assert.match(source,/method!=='GET'/);
 assert.doesNotMatch(source,/absolute\.origin!==new URL\(pageURL\)\.origin/);
});
