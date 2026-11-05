import test from 'node:test';
import assert from 'node:assert/strict';
import {cssImports,resolveStylesheetURL,rewriteCSSURLs,collectStylesheets} from '../rte/stylesheets.js';
import {parseCSS,computeStyle,mediaMatches} from '../public/rte-css.js';
import {parseLinearGradient,splitCSSArguments,paintGradient} from '../public/rte-gradients.js';

test('CSS imports, nested URLs and stylesheet order',async()=>{
 const resources=new Map([
  ['https://site.example/assets/base.css','@import "./colors.css" screen; .card{padding:12px;background-image:linear-gradient(to right,#ff0000,#0000ff)}'],
  ['https://site.example/assets/colors.css','.card{color:#334455}']
 ]);
 const result=await collectStylesheets({base:'https://site.example/home',linked:['/assets/base.css'],inline:'.card{border-radius:12px}',fetchCSS:async url=>{assert.ok(resources.has(url),'Unknown stylesheet '+url);return resources.get(url);}});
 assert.equal(result.diagnostics.loaded,2);
 assert.equal(result.diagnostics.imports,1);
 assert.match(result.css,/@media screen \{/);
 assert.ok(result.css.indexOf('color:#334455')<result.css.indexOf('padding:12px'));
 assert.ok(result.css.indexOf('padding:12px')<result.css.indexOf('border-radius:12px'));
 assert.equal(cssImports('@import url("./theme.css") screen and (min-width:600px);')[0].href,'./theme.css');
 assert.equal(resolveStylesheetURL('javascript:alert(1)','https://site.example'),null);
 assert.match(rewriteCSSURLs('background:url(../bg.png)','https://site.example/css/a.css'),/https:\/\/site\.example\/bg\.png/);
});
test('CSS import graph handles cyclic imports and budget restrictions',async()=>{
 const result=await collectStylesheets({base:'https://site.example/',linked:['a.css'],fetchCSS:async url=>url.endsWith('/a.css')?'@import "b.css"; .a{color:red}':'@import "a.css"; .b{color:blue}',maxSheets:3});
 assert.equal(result.diagnostics.requested,2);
 assert.equal(result.diagnostics.loaded,2);
 assert.match(result.css,/\.a\{color:red\}/);
 assert.match(result.css,/\.b\{color:blue\}/);
});
test('CSS media queries respect color scheme and viewport',()=>{
 const css='body{color:black;background-color:white}@media(prefers-color-scheme:dark){body{color:white;background-color:#101020}}@media (min-width:700px){body{width:680px}}@media print{body{display:none}}';
 const body={tag:'body',attrs:{}};
 const light=computeStyle(body,{},parseCSS(css,900,{colorScheme:'light'}));
 const dark=computeStyle(body,{},parseCSS(css,900,{colorScheme:'dark'}));
 assert.equal(light.color,'black');
 assert.equal(dark.color,'white');
 assert.equal(light['background-color'],'white');
 assert.equal(dark['background-color'],'#101020');
 assert.equal(light.width,'680px');
 assert.notEqual(dark.display,'none');
 assert.equal(mediaMatches('(max-width:600px)',900),false);
});
test('CSS gradients preserve commas within color functions and paint',()=>{
 const stops=splitCSSArguments('to right,rgba(0, 0, 0, .6) 0%,#ffffff 100%');
 assert.equal(stops.length,3);
 const parsed=parseLinearGradient('linear-gradient(to right, rgba(0, 0, 0, .6) 0%, #ffffff 100%)');
 assert.equal(parsed.angle,90);
 assert.equal(parsed.stops.length,2);
 let painted=false;
 const ctx={createLinearGradient(){return{addColorStop(){}};},fillRect(){painted=true;},set fillStyle(v){}};
 assert.equal(paintGradient(ctx,{gradient:'linear-gradient(#000,#fff)',x:0,y:0,w:600,h:400}),true);
 assert.equal(painted,true);
});

test('indexed selectors honor :not, :is and :where pseudo classes',()=>{
 const css='.button{color:black}.button:not(.disabled){color:green}.button:is(.primary,.secondary){background-color:#eee}.button:hover{color:red}';
 const rules=parseCSS(css,800);
 const primary={tag:'button',attrs:{class:'button primary'}};
 const disabled={tag:'button',attrs:{class:'button disabled'}};
 assert.equal(computeStyle(primary,{},rules).color,'green');
 assert.equal(computeStyle(disabled,{},rules).color,'black');
 assert.equal(computeStyle(primary,{},rules)['background-color'],'#eee');
 assert.equal(computeStyle({tag:'button',attrs:{class:'button secondary'}},{},rules)['background-color'],'#eee');
});
test('indexed stylesheet supports thousands of rules without dropping late rules',()=>{
 const input=Array.from({length:2200},(_,i)=>'.item-'+i+'{color:#000}').join('')+'.last{color:rgb(1,2,3)}';
 const rules=parseCSS(input);
 assert.ok(rules.length>2000);
 assert.equal(computeStyle({tag:'div',attrs:{class:'last'}},{},rules).color,'rgb(1,2,3)');
});
