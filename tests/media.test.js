import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from '../rte/engine.js';
import {mediaSource,mediaCandidates,mediaAttributes,mediaRect} from '../public/rte-media.js';
import {createLayoutCommands} from '../public/rte-layout.js';
import {parseCSS} from '../public/rte-css.js';
const src='https://media.example.org/sample.mp4';
test('RTE parser retains HTML5 video, audio and source elements',()=>{
 const dom=parseHTML('<video controls width="640"><source src="/a.webm" type="video/webm"><source src="/a.mp4" type="video/mp4"></video><audio controls src="/sound.mp3"></audio>');
 assert.deepEqual(dom.children.map(n=>n.tag),['video','audio']);
 assert.equal(dom.children[0].children.length,2);
 assert.equal(dom.children[0].children[0].tag,'source');
});
test('media source resolution and scheme filtering',()=>{
 const node={tag:'video',attrs:{controls:''},children:[{tag:'source',attrs:{src:'/a.webm',type:'video/webm'}},{tag:'source',attrs:{src:'https://cdn.example.org/a.mp4',type:'video/mp4'}}]};
 assert.equal(mediaSource(node,'https://example.org/watch'),'https://example.org/a.webm');
 assert.equal(mediaCandidates(node,'https://example.org/watch').length,2);
 assert.equal(mediaCandidates({tag:'video',attrs:{src:'javascript:alert(1)'}},'https://example.org').length,0);
 assert.equal(mediaSource({tag:'video',attrs:{src:'file:///etc/passwd'}},'https://example.org'),null);
 assert.equal(mediaSource({tag:'video',attrs:{src}},'https://example.org'),src);
});
test('media attributes block unmuted autoplay',()=>{
 assert.equal(mediaAttributes({attrs:{autoplay:'',controls:''}}).autoplay,false);
 assert.equal(mediaAttributes({attrs:{autoplay:'',muted:''}}).autoplay,true);
 assert.equal(mediaAttributes({attrs:{loop:'',preload:'bogus'}}).preload,'metadata');
});
test('media rectangles track zoom, scroll and visibility',()=>{
 const command={x:40,y:300,w:640,h:360};
 assert.deepEqual(mediaRect(command,{scroll:250,zoom:1.5,viewportWidth:1200,viewportHeight:700}),{x:60,y:75,w:960,h:540});
 assert.equal(mediaRect(command,{scroll:2000,zoom:1,viewportWidth:1200,viewportHeight:700}),null);
});
test('RTE layout creates video media commands with meaningful dimensions',()=>{
 const dom=parseHTML('<main><video controls width="640" height="360" src="/video.mp4"></video><p>After video</p></main>');
 const ctx={font:'16px Arial',measureText(text){return{width:text.length*8};}};
 const rendered=createLayoutCommands({document:dom,rules:parseCSS('video{display:block}'),width:900,ctx,url:'https://example.org'});
 const media=rendered.commands.find(c=>c.kind==='media');
 assert.ok(media);assert.equal(media.url,'https://example.org/video.mp4');
 assert.equal(media.w,640);assert.equal(media.h,360);
 assert.equal(media.attrs.controls,'');
 assert.ok(rendered.height>=360);
 assert.ok(rendered.commands.some(x=>x.kind==='text'&&x.text==='After'));
});
