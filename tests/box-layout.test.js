import test from 'node:test';
import assert from 'node:assert/strict';
import {boxGeometry} from '../public/rte-box.js';
import {distributeTracks} from '../public/rte-tracks.js';
import {createLayoutCommands} from '../public/rte-layout.js';
import {parseCSS} from '../public/rte-css.js';

const ctx={font:'16px Arial',measureText(t){const size=Number.parseFloat(this.font.match(/\d+px/)?.[0])||16;return {width:[...t].length*size*.5}}};
function layout(children,css=''){
 const dom={tag:'document',children:[{tag:'html',attrs:{},children:[{tag:'body',attrs:{},children}]}]};
 return createLayoutCommands({document:dom,rules:parseCSS(css,1000),width:1000,ctx,url:'https://nohello.org'});
}
test('centered max-width box uses border-box sizing and does not overflow',()=>{
 const g=boxGeometry({width:'600px','max-width':'700px',padding:'20px','box-sizing':'border-box','margin-left':'auto','margin-right':'auto'},1000);
 assert.equal(g.outer,600);assert.equal(g.content,560);assert.equal(g.offsetX,200);
});
test('auto width fills available space less horizontal margins and padding',()=>{
 const g=boxGeometry({'margin-left':'20px','margin-right':'20px','padding-left':'12px','padding-right':'8px'},500);
 assert.equal(g.outer,460);assert.equal(g.content,440);assert.equal(g.offsetX,20);
});
test('flex intrinsic content width leaves unused space unless items grow',()=>{
 const widths=distributeTracks(3,1000,{display:'flex',gap:12,widths:[70,90,110],grow:[0,0,0]});
 assert.deepEqual(widths,[70,90,110]);
 const expanded=distributeTracks(3,1000,{display:'flex',gap:12,widths:[70,90,110],grow:[1,1,1]});
 assert.ok(expanded.every(w=>w>250));
});
test('flex shrinking keeps tracks within the parent',()=>{
 const widths=distributeTracks(3,300,{display:'flex',gap:10,widths:[200,200,200]});
 assert.ok(widths.reduce((a,b)=>a+b,0)<=280.01);
});
test('NoHello-style flex navigation packs links rather than equal full-width columns',()=>{
 const nav={tag:'nav',attrs:{class:'nav'},children:['Why it works','Quick start','Examples'].map(t=>({tag:'a',attrs:{href:'#'},children:[{text:t}]}))};
 const res=layout([nav],'.nav{display:flex;gap:12px;width:800px}.nav a{font-size:13px}');
 const labels=res.commands.filter(c=>c.kind==='text');
 const x=labels.filter(c=>c.text.trim()).map(c=>c.x);
 assert.ok(x.length>=3);
 assert.ok(x[1]-x[0]<180,'intrinsic links should not occupy one third of the container');
 assert.ok(x[2]-x[1]<180);
});
test('grid row-gap advances second row below first',()=>{
 const grid={tag:'section',attrs:{class:'grid'},children:['A','B','C','D'].map(t=>({tag:'div',attrs:{class:'item'},children:[{text:t}]}))};
 const res=layout([grid],'.grid{display:grid;grid-template-columns:repeat(2,1fr);column-gap:10px;row-gap:35px}.item{font-size:16px}');
 const labels=res.commands.filter(c=>c.kind==='text');
 assert.equal(labels.length,4);
 assert.ok(labels[2].y-labels[0].y>=40);
});
