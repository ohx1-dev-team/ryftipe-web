import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML,attrs,entities,stylesFrom} from '../rte/engine.js';

function find(node,tag,out=[]){if(node?.tag===tag)out.push(node);for(const child of node?.children||[])if(child.tag)find(child,tag,out);return out;}

test('parses quoted, unquoted, boolean and entity-decoded attributes',()=>{
 const node=parseHTML('<input disabled id=x value="A &amp; B" data-note=hello>');
 const input=find(node,'input')[0];
 assert.equal(input.attrs.disabled,'');
 assert.equal(input.attrs.id,'x');
 assert.equal(input.attrs.value,'A & B');
 assert.equal(input.attrs['data-note'],'hello');
 assert.equal(entities('&lt;&gt;&#65;&#x1F642;'),'<>A🙂');
});

test('keeps text whitespace and preformatted content',()=>{
 const node=parseHTML('<pre> one\n  two\nthree </pre>');
 assert.equal(find(node,'pre')[0].children[0].text,' one\n  two\nthree ');
});

test('handles implied paragraph, list and table closing tags',()=>{
 const node=parseHTML('<p>one<p>two<ul><li>a<li>b</ul><table><tr><td>x<td>y</table>');
 assert.equal(find(node,'p').length,2);
 assert.equal(find(node,'li').length,2);
 assert.equal(find(node,'tr').length,1);
 assert.equal(find(node,'td').length,2);
});

test('does not mistake tag-like text inside script/style for markup',()=>{
 const node=parseHTML('<main><script>const x="<div>no</div>";</script><style>.x:after{content:"<p>"}</style><div>yes</div></main>');
 assert.equal(find(node,'div').length,1);
 assert.equal(find(node,'script').length,0);
 assert.equal(find(node,'style').length,0);
 assert.equal(find(node,'div')[0].children[0].text,'yes');
});

test('handles comments, malformed closing tags and RCDATA elements',()=>{
 const node=parseHTML('<!-- hidden --><main><textarea>&lt;b&gt;safe</textarea><title>Title &amp; more</title></main></wrong>');
 assert.equal(find(node,'textarea')[0].children[0].text,'<b>safe');
 assert.equal(find(node,'title')[0].children[0].text,'Title & more');
});

test('drops embedded browsing contexts and caps pathological input',()=>{
 const node=parseHTML('<main><iframe><p>bad</p></iframe><object>bad</object><svg><text>bad</text></svg><p>ok</p></main>');
 assert.equal(find(node,'iframe').length,0);
 assert.equal(find(node,'object').length,0);
 assert.equal(find(node,'svg').length,0);
 assert.equal(find(node,'p').length,1);
 assert.ok(parseHTML('<p>'+('x'.repeat(2_100_000))+'</p>'));
});

test('extracts only stylesheet links with stylesheet rel token',()=>{
 const result=stylesFrom('<link rel="icon stylesheet" href="/a.css"><link rel="preload" href="/b.css"><link rel=stylesheet href=/c.css>');
 assert.deepEqual(result.links,['/a.css','/c.css']);
});
