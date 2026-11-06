import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {chromium} from 'playwright';
// Browser-level sandbox integration smoke. Fixtures are local; no YouTube claim.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..','public');
const paths=new Map([['/sandbox.html','sandbox.html'],['/rte-runtime.js','rte-runtime.js'],['/rte-platform.js','rte-platform.js'],['/rte-modules.js','rte-modules.js'],['/rte-bridge.js','rte-bridge.js'],['/rte.js','rte.js'],['/rte-css.js','rte-css.js'],['/rte-layout.js','rte-layout.js'],['/rte-tracks.js','rte-tracks.js'],['/rte-forms.js','rte-forms.js'],['/rte-media.js','rte-media.js'],['/rte-gradients.js','rte-gradients.js'],['/rte-storage.js','rte-storage.js'],['/rte-controls.js','rte-controls.js'],['/rte-box.js','rte-box.js'],['/rte-document.js','rte-document.js']]);
const server=http.createServer(async(req,res)=>{
 if(req.url?.startsWith('/api/rte/data?url=')&&new URL(req.url,'http://localhost').searchParams.get('url')==='https://example.org/test.json'){
  res.writeHead(200,{'Content-Type':'application/json'});
  res.end(JSON.stringify({url:'https://example.org/test.json',type:'application/json',body:'{"hello":"network-ok"}'}));return;
 }
 if(req.url?.startsWith('/api/rte/document?')&&new URL(req.url,'http://localhost').searchParams.get('url')==='https://nohello.org/'){
  const markup='<html><head><title>NoHello</title></head><body><main class="shell"><h1>NoHello</h1><p class="intro">Skip the hi and silence</p><section class="guides"><a class="guide" href="/teams">Microsoft Teams</a><a class="guide" href="/slack">Slack</a><a class="guide" href="/discord">Discord</a></section><script>parent.__siteCodeExecuted=true</script></main></body></html>';
  const css='body{font-family:Arial,sans-serif;background:#fafafa;color:#111}.shell{width:700px;max-width:calc(100% - 32px);margin:44px auto}.guides{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.guide{display:block;color:#123;border:1px solid #ddd;border-radius:8px;padding:12px;background:#fff}.intro{font-size:14px}';
  res.writeHead(200,{'Content-Type':'application/json'});
  res.end(JSON.stringify({url:'https://nohello.org/',title:'NoHello',markup,css,dom:{tag:'document',children:[]},scripts:[],stylesheets:{loaded:2,failed:0},compatibility:{javascriptRequired:false}}));
  return;
 }
 if(req.url?.startsWith('/api/rte/document?')){
  res.writeHead(200,{'Content-Type':'application/json'});
  res.end(JSON.stringify({url:'https://example.org/demo',title:'RTE Paint Fixture',engine:'RTE/test',css:'body{background-color:#f0f0f2}main{max-width:640px;margin:30px auto;padding:20px;background-color:#fff}h1{font-size:32px}',scripts:[],dom:{tag:'document',children:[{tag:'body',attrs:{},children:[{tag:'main',attrs:{},children:[{tag:'h1',attrs:{},children:[{text:'RTE Paint Fixture'}]},{tag:'p',attrs:{},children:[{text:'Canvas performance test.'}]}]}]}]}}));
  return;
 }
 if(req.url?.startsWith('/api/rte/script?')){
  const u=new URL(req.url,'http://localhost').searchParams.get('url');
  if(u==='https://example.org/dep.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end('export const dependency = "graph-ok";');return;}
  res.writeHead(404);res.end('Not found');return;
 }
 const file=paths.get(req.url);
 if(file){
  const isSandbox=file==='sandbox.html';
  res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html':'text/javascript',
   'Content-Security-Policy':isSandbox?"default-src 'none'; script-src 'unsafe-inline' blob:; connect-src 'none'; img-src 'none'; style-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';":"default-src 'self'; connect-src 'self'; frame-src 'self'; script-src 'self';"});
  res.end(await readFile(resolve(root,file)));return;
 }
 res.writeHead(200,{'Content-Type':'text/html','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; frame-src 'self'; connect-src 'self'; style-src 'self' blob:; style-src-elem 'self' blob:; style-src-attr 'unsafe-inline'; img-src 'self' https: data:"});
 res.end('<!doctype html><html><body><p>RTE smoke test</p></body></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();
 page.on('pageerror',e=>console.error('Browser page error:',e.message));
 await page.goto(base,{waitUntil:'load'});
 const result=await page.evaluate(async()=>{
  const {createScriptRuntime}=await import('/rte-runtime.js');
  localStorage.setItem('ryftipe.theme','private-host-setting');
  window.__snapshots=[];window.__errors=[];
  const runtime=createScriptRuntime({onSnapshot:(body)=>window.__snapshots.push(JSON.stringify(body)),onError:(message)=>window.__errors.push(message)});
  window.__rte=runtime;
  const data={url:'https://example.org',title:'RTE test',
   dom:{tag:'document',children:[{tag:'html',children:[{tag:'body',children:[{tag:'div',attrs:{id:'status'},children:[{text:'Initial'}]},{tag:'button',attrs:{id:'interactive'},children:[{text:'Click'}]},{tag:'input',attrs:{id:'field',type:'text',value:'before'},children:[]}]}]}]},
   scripts:[
    {kind:'classic',inline:'document.getElementById("status").textContent="classic-ok";'},
    {kind:'module',inline:'document.getElementById("status").textContent+=" module-ok";'},
    {kind:'classic',inline:'fetch("/test.json").then(r=>r.json()).then(d=>{document.getElementById("status").textContent+=" "+d.hello})'},
    {kind:'classic',inline:'const host=document.createElement("div");host.id="shadow-host";const shadow=host.attachShadow({mode:"open"});shadow.innerHTML="<span>shadow-ok</span>";document.body.append(host);'},
    {kind:'module',inline:'import {dependency} from "./dep.js";document.getElementById("status").textContent+=" "+dependency;'},
    {kind:'classic',inline:'const btn=document.getElementById("interactive");btn.addEventListener("click",event=>{event.preventDefault();document.getElementById("status").textContent+=" click-ok"});document.getElementById("field").addEventListener("input",event=>{document.getElementById("status").textContent+=" input-"+event.target.value})'},
    {kind:'classic',inline:'const xhr=new XMLHttpRequest();xhr.open("GET","/test.json");xhr.onload=()=>{const data=JSON.parse(xhr.responseText);document.getElementById("status").textContent+=" xhr-"+data.hello};xhr.send();'},
    {kind:'classic',inline:'localStorage.setItem("site-key","stored-ok");sessionStorage.setItem("session-key","session-ok");document.getElementById("status").textContent+=" "+localStorage.getItem("site-key")+" "+sessionStorage.getItem("session-key")+" "+(localStorage.getItem("ryftipe.theme")===null?"isolated-ok":"storage-leak");'}
   ]};
  const loaded=await runtime.load(data);
  return {loaded,metrics:runtime.metrics};
 });
 assert.equal(result.loaded,true,'The sandbox must finish loading');
 await page.waitForFunction(()=>window.__snapshots?.some(s=>s.includes('xhr-network-ok')),null,{timeout:10000});
 const interaction=await page.evaluate(async()=>{
   const tree=JSON.parse(window.__snapshots.at(-1));
   const button=tree.children.find(x=>x.attrs?.id==='interactive');
   const input=tree.children.find(x=>x.attrs?.id==='field');
   return {clickedPrevented:await window.__rte.event({id:button.rteId,event:'click'}),inputPrevented:await window.__rte.event({id:input.rteId,event:'input',value:'edited'})};
 });
 assert.equal(interaction.clickedPrevented,true,'A DOM click handler must be able to cancel canvas navigation');
 await page.waitForFunction(()=>window.__snapshots?.some(s=>s.includes('input-edited')),null,{timeout:4000});
 const outcome=await page.evaluate(()=>({snapshots:window.__snapshots.slice(-8),errors:window.__errors,metrics:window.__rte.metrics}));
 console.log('MODULE_GRAPH_DEBUG '+JSON.stringify({metrics:outcome.metrics,errors:outcome.errors,snapshots:outcome.snapshots}));
 assert.equal(outcome.metrics.executed,8,'Classic and module scripts must execute');
 assert.ok(outcome.metrics.networkRequests>=2,'The fetch bridge should receive a request');
 assert.equal(outcome.metrics.networkFailures,0);
 assert.ok(outcome.snapshots.some(s=>s.includes('classic-ok')&&s.includes('module-ok')&&s.includes('network-ok')));
 assert.ok(outcome.snapshots.some(s=>s.includes('click-ok')&&s.includes('input-edited')),'DOM events and input updates must reach the RTE renderer');
 assert.ok(outcome.snapshots.some(s=>s.includes('stored-ok')&&s.includes('session-ok')&&s.includes('isolated-ok')),'Site storage must not expose host preferences');
 await page.waitForFunction(()=>Boolean(localStorage.getItem('ryftipe.site-storage:https://example.org')),{timeout:4000});
 const saved=await page.evaluate(()=>({host:localStorage.getItem('ryftipe.theme'),site:JSON.parse(localStorage.getItem('ryftipe.site-storage:https://example.org')||'{}')}));
 assert.equal(saved.host,'private-host-setting');assert.equal(saved.site['site-key'],'stored-ok');
 assert.ok(outcome.snapshots.some(s=>s.includes('xhr-network-ok')),'XHR must update DOM after fetching');
 assert.ok(outcome.snapshots.some(s=>s.includes('graph-ok')),'Static module import should modify the DOM');
 assert.ok(outcome.metrics.moduleDependencies>=1);
 assert.ok(outcome.snapshots.some(s=>s.includes('shadow-ok')),'Open Shadow DOM text must appear in RTE snapshots');
 console.log('PASS: RTE modules, fetch, XHR, DOM events, isolated site storage and open Shadow DOM');
 console.log(JSON.stringify(outcome.metrics));
 await page.evaluate(()=>window.__rte.dispose());
 const painted=await page.evaluate(async()=>{
  const box=document.createElement('div');box.style.cssText='position:relative;width:860px;height:500px';
  const canvas=document.createElement('canvas');canvas.style.cssText='display:block;width:860px;height:500px';
  box.append(canvas);document.body.append(box);
  const {createRTE}=await import('/rte.js');
  const rte=createRTE(canvas,{onNavigate(){},onLocation(){},onError(message){throw new Error(message);},onStats(){},documentLayoutEnabled:()=>false});
  const ok=await rte.navigate('https://example.org/demo');
  const first={...rte.stats};
  canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:100,cancelable:true}));
  await new Promise(resolve=>setTimeout(resolve,120));
  const second={...rte.stats};rte.dispose();
  return {ok,first,second};
 });
 assert.equal(painted.ok,true);
 assert.ok(painted.first.commands>=2,'Renderer must produce paint commands');
 assert.ok(painted.first.paintCount>=1,'Renderer must have painted a frame');
 assert.ok(Number.isFinite(painted.first.paintMs),'Canvas paint must be measured');
 assert.ok(painted.second.paintCount>painted.first.paintCount,'Wheel input should queue a new animation frame');
 console.log('PASS: RTE canvas paint, measured costs and scheduled wheel repaint',JSON.stringify(painted.second));
 // The new default RTE rendering path must exercise native CSS layout,
 // script removal, sandbox isolation, and internal navigation together.
 const documentResult=await page.evaluate(async()=>{
  const box=document.createElement('div');box.style.cssText='width:1000px;height:640px;position:relative';
  const canvas=document.createElement('canvas');canvas.style.cssText='display:block;width:100%;height:100%';
  box.append(canvas);document.body.append(box);
  const {createRTE}=await import('/rte.js');
  const routes=[];
  const rte=createRTE(canvas,{onNavigate:url=>routes.push(url),onLocation(){},onError:message=>{throw new Error(message);},javascriptEnabled:()=>false,documentLayoutEnabled:()=>true});
  const ok=await rte.navigate('https://nohello.org/');
  const frame=box.querySelector('#rte-document');
  await new Promise((resolve,reject)=>{
   const since=Date.now();
   const poll=()=>frame.contentDocument?.querySelector('.guides .guide')?resolve():Date.now()-since>4500?reject(new Error('Document layout timed out')):setTimeout(poll,60);
   poll();
  });
  const doc=frame.contentDocument;
  await Promise.race([doc.fonts.ready,new Promise(resolve=>setTimeout(resolve,800))]);
  const shell=doc.querySelector('.shell'),guides=[...doc.querySelectorAll('.guide')];
  const grid=frame.contentWindow.getComputedStyle(doc.querySelector('.guides')); // see corrected below
  const result={ok,canvasHidden:canvas.hidden,frameVisible:!frame.hidden,heading:doc.querySelector('h1')?.textContent,cardCount:guides.length,shellX:shell?.getBoundingClientRect().x,shellWidth:shell?.getBoundingClientRect().width,columns:grid.gridTemplateColumns,positions:guides.map(x=>x.getBoundingClientRect().x),scriptPresent:doc.querySelectorAll('script').length,siteCodeExecuted:Boolean(window.__siteCodeExecuted),cssColor:frame.contentWindow.getComputedStyle(shell).color};
  guides[1].click();
  await new Promise(resolve=>setTimeout(resolve,40));
  result.routes=routes;
  rte.dispose();
  return result;
 });
 console.log('RTE_NATIVE_LAYOUT '+JSON.stringify(documentResult));
 assert.equal(documentResult.ok,true);
 assert.equal(documentResult.canvasHidden,true);
 assert.equal(documentResult.frameVisible,true);
 assert.equal(documentResult.heading,'NoHello');
 assert.equal(documentResult.cardCount,3);
 assert.ok(documentResult.shellX>70&&documentResult.shellWidth<=710,'Centered native CSS layout');
 assert.ok(documentResult.positions[2]>documentResult.positions[1]+80&&documentResult.positions[1]>documentResult.positions[0]+80,'Grid must lay out three columns');
 assert.equal(documentResult.scriptPresent,0);
 assert.equal(documentResult.siteCodeExecuted,false);
 assert.ok(documentResult.routes.includes('https://nohello.org/slack'),'Links must route through Ryftipe');
 console.log('PASS: native RTE document layout, complex CSS grid, script sandbox and link navigation');
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
}
