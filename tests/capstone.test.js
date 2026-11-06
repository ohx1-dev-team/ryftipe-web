import test from 'node:test';
import assert from 'node:assert/strict';
import {cssPixels,gapPixels,gridColumns,distributeTracks,trackPositions} from '../public/rte-tracks.js';
import {formFields,getFormURL} from '../public/rte-forms.js';
import {createLayoutCommands} from '../public/rte-layout.js';
import {parseCSS} from '../public/rte-css.js';

test('flex tracks distribute three children and apply gap',()=>{
 const widths=distributeTracks(3,900,{display:'flex',gap:20,widths:[null,null,null],grow:[1,1,1]});
 assert.equal(widths.length,3);
 assert.ok(widths.every(w=>Math.abs(w-286.667)<.1));
 const x=trackPositions(widths,20);
 assert.ok(x[1]>300&&x[2]>600);
 assert.equal(gapPixels({gap:'1rem'}),16);
 assert.equal(cssPixels('25%',800),200);
});
test('grid tracks support repeat, fractional columns and mixed widths',()=>{
 assert.deepEqual(gridColumns('repeat(2, 1fr)',790),[395,395]);
 const tracks=gridColumns('200px 1fr 2fr',800);
 assert.equal(tracks[0],200);
 assert.ok(tracks[2]>tracks[1]);
 assert.equal(distributeTracks(2,800,{display:'grid',gap:10,template:'repeat(2,1fr)'}).length,2);
});
test('GET form encodes values and excludes disabled or unchecked controls',()=>{
 const field=(name,value,extra={})=>({tag:'input',attrs:{name,value,...extra},children:[]});
 const submit={tag:'button',attrs:{name:'go',value:'1',type:'submit'},children:[]};
 const form={tag:'form',attrs:{action:'/search?lang=en',method:'get'},children:[
  field('q','a & b'),field('skip','x',{disabled:''}),field('notchecked','yes',{type:'checkbox'}),field('checked','yes',{type:'checkbox',checked:''}),submit
 ]};
 assert.deepEqual(formFields(form,submit),[['q','a & b'],['checked','yes'],['go','1']]);
 const url=new URL(getFormURL('https://example.org/page',form,submit));
 assert.equal(url.href.split('?')[0],'https://example.org/search');
 assert.equal(url.searchParams.get('q'),'a & b');
 assert.equal(url.searchParams.get('go'),'1');
 assert.equal(url.searchParams.get('skip'),null);
 assert.equal(url.searchParams.get('lang'),'en');
});
test('POST forms are rejected (not falsely marked implemented)',()=>{
 assert.throws(()=>getFormURL('https://example.org',{tag:'form',attrs:{method:'post'},children:[]}),/GET forms only/);
});
const context={font:'16px Arial',measureText(text){return {width:text.length*8};}};
test('flex row draws adjacent children side-by-side',()=>{
 const page={tag:'document',children:[{tag:'html',attrs:{},children:[{tag:'body',attrs:{},children:[{tag:'nav',attrs:{class:'bar'},children:[
  {tag:'div',attrs:{},children:[{text:'First'}]},{tag:'div',attrs:{},children:[{text:'Second'}]}
 ]}]}]}]};
 const css='.bar{display:flex;gap:20px;width:600px} .bar div{background-color:#abcdef}';
 const result=createLayoutCommands({document:page,rules:parseCSS(css,900),width:900,ctx:context,url:'https://example.org'});
 const words=result.commands.filter(x=>x.kind==='text');
 assert.equal(words.length,2);
 assert.ok(words[1].x>words[0].x+20);
 assert.ok(Math.abs(words[1].y-words[0].y)<3);
});
test('grid row draws cards in columns',()=>{
 const page={tag:'document',children:[{tag:'body',attrs:{},children:[{tag:'section',attrs:{class:'grid'},children:[
  {tag:'div',attrs:{},children:[{text:'Alpha'}]},{tag:'div',attrs:{},children:[{text:'Beta'}]}
 ]}]}]};
 const css='.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:20px}';
 const result=createLayoutCommands({document:page,rules:parseCSS(css,900),width:900,ctx:context,url:'https://example.org'});
 const words=result.commands.filter(x=>x.kind==='text');
 assert.equal(words.length,2);
 assert.ok(words[1].x>words[0].x+300);
 assert.ok(Math.abs(words[1].y-words[0].y)<3);
});
