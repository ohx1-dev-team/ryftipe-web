import test from 'node:test';
import assert from 'node:assert/strict';
import {controlLabel,controlGeometry} from '../public/rte-controls.js';
import {createLayoutCommands} from '../public/rte-layout.js';
import {parseCSS} from '../public/rte-css.js';

const measure=(label,size)=>label.length*size*.51;
test('button text comes from child nodes rather than fake Submit label',()=>{
 const button={tag:'button',attrs:{},children:[{tag:'span',attrs:{},children:[{text:'Microsoft Teams'}]}]};
 assert.equal(controlLabel(button),'Microsoft Teams');
 assert.equal(controlGeometry(button,{'font-size':'14px','padding-left':'8px'},400,measure).label,'Microsoft Teams');
});
test('compact controls do not expand to fixed 360px',()=>{
 const button={tag:'button',attrs:{},children:[{text:'Slack'}]};
 const g=controlGeometry(button,{'font-size':'12px',padding:'8px'},500,measure);
 assert.ok(g.width>=40&&g.width<100);
 assert.ok(g.height>=30&&g.height<60);
});
test('explicit CSS widths and heights are respected',()=>{
 const button={tag:'button',attrs:{},children:[{text:'Discord'}]};
 const g=controlGeometry(button,{width:'110px',height:'42px','font-size':'14px'},500,measure);
 assert.equal(g.width,110);assert.equal(g.height,42);
});
test('NoHello-like guide grid renders labels and individually sized controls',()=>{
 const buttons=['Microsoft Teams','Slack','Discord'].map(label=>({tag:'button',attrs:{},children:[{text:label}]}));
 const guide={tag:'div',attrs:{class:'guides'},children:buttons};
 const heading={tag:'h1',attrs:{},children:[{text:'NoHello'}]};
 const main={tag:'main',attrs:{class:'shell'},children:[heading,guide]};
 const body={tag:'body',attrs:{},children:[main]};
 const html={tag:'html',attrs:{},children:[body]};
 const dom={tag:'document',attrs:{},children:[html]};
 const ctx={font:'16px Arial',measureText(text){const n=parseFloat(this.font.match(/\d+(?:\.\d+)?px/)?.[0])||16;return{width:text.length*n*.51};}};
 const css='body{margin:0}.shell{width:700px;margin:20px auto}.guides{display:flex;gap:12px}.guides button{font-size:13px;padding:7px;background-color:#f5f7fa;color:#121212}';
 const result=createLayoutCommands({document:dom,rules:parseCSS(css,1000),width:1000,ctx,url:'https://nohello.org'});
 const text=result.commands.filter(x=>x.kind==='text').map(x=>x.text);
 for(const name of ['NoHello','Microsoft','Teams','Slack','Discord'])assert.ok(text.includes(name),'Missing '+name);
 const rectangles=result.commands.filter(x=>x.kind==='rect'&&x.color==='#f5f7fa');
 assert.equal(rectangles.length,3);
 assert.ok(rectangles.every(x=>x.w<250));
});
