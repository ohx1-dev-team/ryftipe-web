import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {chromium} from 'playwright';
// Browser-level sandbox integration smoke. Fixtures are local; no YouTube claim.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..','public');
const paths=new Map([['/sandbox.html','sandbox.html'],['/rte-runtime.js','rte-runtime.js'],['/rte-platform.js','rte-platform.js']]);
const server=http.createServer(async(req,res)=>{
 if(req.url==='/api/rte/data?url=https%3A%2F%2Fexample.org%2Ftest.json'){
  res.writeHead(200,{'Content-Type':'application/json'});
  res.end(JSON.stringify({url:'https://example.org/test.json',type:'application/json',body:'{"hello":"network-ok"}'}));return;
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
 page.on('console',m=>console.log('Browser console',m.type(),m.text()));
 page.on('request',req=>{if(req.url().includes('/api/rte/'))console.log('RTE browser request',req.url());});
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
    {kind:'classic',inline:'fetch("/test.json").then(r=>r.json()).then(d=>{document.getElementById("status").textContent+=" "+d.hello})'}
   ]};
  const loaded=await runtime.load(data);
  return {loaded,metrics:runtime.metrics};
 });
 console.log('RTE runtime after load:',JSON.stringify(result));
 console.log('RTE snapshot sample:',JSON.stringify(await page.evaluate(()=>window.__snapshots?.slice(-5))));
 const frame=page.frames().find(f=>f.url().endsWith('/sandbox.html'));
 console.log('Sandbox diagnostic:',JSON.stringify(await frame.evaluate(()=>({pending:[...pendingFetch.keys()],active,pageURL,content:document.body.textContent,hasResponse:typeof Response}))));
 assert.equal(result.loaded,true,'The sandbox must finish loading');
 await page.waitForFunction(()=>window.__snapshots?.some(s=>s.includes('network-ok')),null,{timeout:4000});
 const outcome=await page.evaluate(()=>({snapshots:window.__snapshots.slice(-3),errors:window.__errors,metrics:window.__rte.metrics}));
 assert.equal(outcome.metrics.executed,3,'Classic and module scripts must execute');
 assert.ok(outcome.metrics.networkRequests>=1,'The fetch bridge should receive a request');
 assert.equal(outcome.metrics.networkFailures,0);
 assert.ok(outcome.snapshots.some(s=>s.includes('classic-ok')&&s.includes('module-ok')&&s.includes('network-ok')));
 console.log('PASS: sandbox, import-free ES module, DOM mutation and same-origin JSON fetch');
 console.log(JSON.stringify(outcome.metrics));
 await page.evaluate(()=>window.__rte.dispose());
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
}
