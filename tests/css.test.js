import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCSS,computeStyle,length,matchesSelector} from '../public/rte-css.js';

test('fixture.test-style CSS paints body, centers content and styles links',()=>{
 const sheet='body{background-color:#f0f0f2;margin:0;padding:0}div{width:600px;margin:5em auto;padding:2em;background-color:#fdfdff}a:link,a:visited{color:#38488f;text-decoration:none}@media(max-width:700px){div{width:auto;margin:0 auto}}';
 const rules=parseCSS(sheet,1024);
 const body={tag:'body',attrs:{}},div={tag:'div',attrs:{}},a={tag:'a',attrs:{}};
 const bs=computeStyle(body,{},rules),ds=computeStyle(div,bs,rules,[body]),as=computeStyle(a,ds,rules,[body,div]);
 assert.equal(bs['background-color'],'#f0f0f2');
 assert.equal(ds.width,'600px');assert.equal(ds['margin-left'],'auto');assert.equal(ds['padding-left'],'2em');
 assert.equal(as.color,'#38488f');
 assert.equal(length('5em',0,700),80);
 assert.equal(computeStyle(div,bs,parseCSS(sheet,400),[body]).width,'auto');
});
test('descendant selector, specificity and CSS variables',()=>{
 const rules=parseCSS('div.card a{color:red}#nav a{color:blue}:root{--ink:#192b46}a{color:var(--ink)}');
 const body={tag:'body',attrs:{}},div={tag:'div',attrs:{class:'card',id:'nav'}},a={tag:'a',attrs:{}};
 assert.equal(matchesSelector(a,'div.card a',[body,div]),true);
 assert.equal(computeStyle(a,{},rules,[body,div]).color,'blue');
});

test('CSS @charset does not suppress the first rule',()=>{
 const css='@charset "UTF-8"; body{background-color:#abc} h1{color:green}';
 const rules=parseCSS(css);
 assert.equal(computeStyle({tag:'body',attrs:{}},{},rules)['background-color'],'#abc');
 assert.equal(computeStyle({tag:'h1',attrs:{}},{},rules).color,'green');
});
test('CSS root variables resolve on descendants',()=>{
 const rules=parseCSS(':root{--color:#223344}body{color:var(--color)}');
 const html={tag:'html',attrs:{}},body={tag:'body',attrs:{}};
 const hs=computeStyle(html,{},rules),bs=computeStyle(body,hs,rules,[html]);
 assert.equal(bs.color,'#223344');
});
