import test from 'node:test';
import assert from 'node:assert/strict';
import {createLayoutCommands,READER_CSS} from '../public/rte-layout.js';
import {parseCSS} from '../public/rte-css.js';

const context={font:'16px Arial',measureText(text){const size=parseFloat(this.font.match(/\d+(?:\.\d+)?px/)?.[0])||16;return {width:[...text].length*size*.51};}};
function fixture(){
 return {tag:'document',attrs:{},children:[{tag:'html',attrs:{},children:[{tag:'body',attrs:{},children:[{tag:'div',attrs:{},children:[
 {tag:'h1',attrs:{},children:[{text:'Fixture Page'}]},
 {tag:'p',attrs:{},children:[{text:'This is a documentation example with '},{tag:'a',attrs:{href:'https://www.iana.org/'},children:[{text:'Learn more'}]},{text:' information.'}]}
 ]}]}]}]};
}
test('RTE produces centered styled box and page background',()=>{
 const css='body{background-color:#f0f0f2;margin:0;padding:0}div{width:600px;margin:5em auto;padding:2em;background-color:#fdfdff}a:link,a:visited{color:#38488f}';
 const result=createLayoutCommands({document:fixture(),rules:parseCSS(css,1100),width:1100,ctx:context,url:'https://fixture.test'});
 assert.equal(result.background,'#f0f0f2');
 const box=result.commands.find(x=>x.kind==='rect'&&x.color==='#fdfdff');
 assert.ok(box);assert.ok(box.x>200&&box.x<400);assert.ok(box.w>=550);
 const words=result.commands.filter(x=>x.kind==='text');
 assert.ok(words.some(x=>x.font.includes('bold 32px')&&x.text==='Fixture'));
 assert.equal(words.find(x=>x.text==='Learn').color,'#38488f');
 assert.ok(words.some(x=>x.text==='information.'));
 assert.ok(result.hits.length>0);
});
test('unstyled pages get readable centered document instead of tiny page-edge text',()=>{
 const result=createLayoutCommands({document:fixture(),rules:parseCSS(READER_CSS,1100),width:1100,ctx:context,url:'https://fixture.test',readerMode:true});
 assert.equal(result.background,'#f1f3f8');
 const card=result.commands.find(x=>x.kind==='rect'&&x.color==='#fff');
 assert.ok(card&&card.x>100&&card.w>500);
});
test('long multilingual text wraps within viewport',()=>{
 const page={tag:'document',children:[{tag:'html',attrs:{},children:[{tag:'body',attrs:{},children:[{tag:'p',attrs:{},children:[{text:'中文'.repeat(300)+' العربية Русский français 中文'}]}]}]}]};
 const result=createLayoutCommands({document:page,rules:parseCSS(READER_CSS,480),width:480,ctx:context,url:'https://fixture.test'});
 const words=result.commands.filter(x=>x.kind==='text');
 assert.ok(words.length>2);
 assert.ok(words.every(x=>x.x>=0&&x.x<=480));
 assert.ok(result.height>50);
});
