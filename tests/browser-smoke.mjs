import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {chromium} from 'playwright';
// Browser-level sandbox integration smoke. Fixtures are local; no YouTube claim.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..','public');
const paths=new Map([['/sandbox.html','sandbox.html'],['/rte-runtime.js','rte-runtime.js'],['/rte-platform.js','rte-platform.js'],['/rte-modules.js','rte-modules.js'],['/rte.js','rte.js'],['/rte-css.js','rte-css.js'],['/rte-layout.js','rte-layout.js'],['/rte-tracks.js','rte-tracks.js'],['/rte-forms.js','rte-forms.js'],['/rte-media.js','rte-media.js']]);
const server=http.createServer(async(req,res)=>{
 if(req.url==='/api/rte/data?url=https%3A%2F%2Fexample.org%2Ftest.json'){
  res.writeHead(200,{'Content-Type':'application/json'});
  res.end(JSON.stringify({url:'https://example.org/test.json',type:'application/json',body:'{"hello":"network-ok"}'}));return;
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
 res.writeHead(200,{'Content-Type':'text/html','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; frame-src 'self'; connect-src 'self'"});
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
  window.__snapshots=[];window.__errors=[];
  const runtime=createScriptRuntime({onSnapshot:(body)=>window.__snapshots.push(JSON.stringify(body)),onError:(message)=>window.__errors.push(message)});
  window.__rte=runtime;
  const data={url:'https://example.org',title:'RTE test',
   dom:{tag:'document',children:[{tag:'html',children:[{tag:'body',children:[{tag:'div',attrs:{id:'status'},children:[{text:'Initial'}]}]}]}]},
   scripts:[
    {kind:'classic',inline:'document.getElementById("status").textContent="classic-ok";'},
    {kind:'module',inline:'document.getElementById("status").textContent+=" module-ok";'},
    {kind:'classic',inline:'fetch("/test.json").then(r=>r.json()).then(d=>{document.getElementById("status").textContent+=" "+d.hello})'},
    {kind:'classic',inline:'const host=document.createElement("div");host.id="shadow-host";const shadow=host.attachShadow({mode:"open"});shadow.innerHTML="<span>shadow-ok</span>";document.body.append(host);'},
    {kind:'module',inline:'import {dependency} from "./dep.js";document.getElementById("status").textContent+=" "+dependency;'}
   ]};
  const loaded=await runtime.load(data);
  return {loaded,metrics:runtime.metrics};
 });
 assert.equal(result.loaded,true,'The sandbox must finish loading');
 await page.waitForFunction(()=>window.__snapshots?.some(s=>s.includes('network-ok')),null,{timeout:10000});
 const outcome=await page.evaluate(()=>({snapshots:window.__snapshots.slice(-3),errors:window.__errors,metrics:window.__rte.metrics}));
 console.log('MODULE_GRAPH_DEBUG '+JSON.stringify({metrics:outcome.metrics,errors:outcome.errors,snapshots:outcome.snapshots}));
 assert.equal(outcome.metrics.executed,5,'Classic and module scripts must execute');
 assert.ok(outcome.metrics.networkRequests>=1,'The fetch bridge should receive a request');
 assert.equal(outcome.metrics.networkFailures,0);
 assert.ok(outcome.snapshots.some(s=>s.includes('classic-ok')&&s.includes('module-ok')&&s.includes('network-ok')));
 assert.ok(outcome.snapshots.some(s=>s.includes('graph-ok')),'Static module import should modify the DOM');
 assert.ok(outcome.metrics.moduleDependencies>=1);
 assert.ok(outcome.snapshots.some(s=>s.includes('shadow-ok')),'Open Shadow DOM text must appear in RTE snapshots');
 console.log('PASS: sandbox, static ES module graph, DOM mutation, open Shadow DOM and same-origin JSON fetch');
 console.log(JSON.stringify(outcome.metrics));
 await page.evaluate(()=>window.__rte.dispose());
 const painted=await page.evaluate(async()=>{
  const box=document.createElement('div');box.style.cssText='position:relative;width:860px;height:500px';
  const canvas=document.createElement('canvas');canvas.style.cssText='display:block;width:860px;height:500px';
  box.append(canvas);document.body.append(box);
  const {createRTE}=await import('/rte.js');
  const rte=createRTE(canvas,{onNavigate(){},onLocation(){},onError(message){throw new Error(message);},onStats(){}});
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
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
}
