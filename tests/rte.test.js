import test from 'node:test';
import assert from 'node:assert/strict';
import {entities,attrs,parseHTML,stylesFrom,validateURL} from '../rte/engine.js';
test('entity decoding',()=>assert.equal(entities('A &amp; B &#x1F680;'),'A & B 🚀'));
test('HTML tree and script skipping',()=>{const x=parseHTML('<h1>Hello <b>world</b></h1><script>alert(1)</script><p>Done</p>');assert.equal(x.children[0].tag,'h1');assert.equal(x.children[0].children[1].tag,'b');assert.equal(x.children.at(-1).tag,'p');});
test('attributes',()=>assert.deepEqual(attrs('href="/x" class=top disabled'),{href:'/x',class:'top',disabled:''}));
test('stylesheet discovery',()=>{const s=stylesFrom('<style>h1{color:red}</style><link rel="stylesheet" href="/a.css">');assert.match(s.inline,/color:red/);assert.deepEqual(s.links,['/a.css']);});
test('unsafe URLs',()=>{for(const u of ['file:///etc/passwd','http://localhost','https://example.com:8443'])assert.throws(()=>validateURL(u));});
