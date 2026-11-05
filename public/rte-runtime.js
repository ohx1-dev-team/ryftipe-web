import {normalizeRTEEvent} from '/rte-bridge.js';
import {loadModuleGraph} from '/rte-modules.js';
import {allowedPageRequest,containsModuleImports} from '/rte-platform.js';
// RTE isolated script runner. Remote JavaScript never executes in Ryftipe's privileged page.
export function createScriptRuntime({onSnapshot,onError}){
 let iframe=null,token='',listener=null,readyResolver=null,executionResolver=null,stopped=false,currentPage='';
 const pendingEvents=new Map();let nextEvent=0;
 const MAX_SCRIPTS=20;
 let telemetry={executed:0,failed:0,skipped:0,networkRequests:0,networkFailures:0,moduleGraphs:0,moduleDependencies:0};
 function release(){
  stopped=true;if(listener)window.removeEventListener('message',listener);
  for(const cb of pendingEvents.values())cb(false);pendingEvents.clear();
  iframe?.remove();iframe=null;listener=null;
  readyResolver?.(false);executionResolver?.(false);
  readyResolver=null;executionResolver=null;
 }
 function send(action,other={}){
  if(iframe?.contentWindow)iframe.contentWindow.postMessage({...other,type:'rte-command',token,action},'*');
 }
 async function load(page){
  telemetry={executed:0,failed:0,skipped:0,networkRequests:0,networkFailures:0,moduleGraphs:0,moduleDependencies:0};
  release();stopped=false;token=crypto.randomUUID();currentPage=page.url;
  iframe=document.createElement('iframe');
  iframe.setAttribute('sandbox','allow-scripts');
  iframe.setAttribute('title','Isolated RTE JavaScript runtime');
  iframe.setAttribute('aria-hidden','true');
  iframe.style.cssText='position:absolute;width:0;height:0;border:0;opacity:0;pointer-events:none';
  const thisFrame=iframe;
  listener=event=>{
   if(event.source!==thisFrame.contentWindow||event.origin!=='null')return;
   const m=event.data;if(!m||typeof m!=='object')return;
   if(m.type==='rte-loaded'){send('load',{tree:page.dom,title:page.title,url:page.url});return;}
   if(m.token!==token||stopped)return;
   if(m.type==='rte-ready'){readyResolver?.(true);readyResolver=null;}
   if(m.type==='rte-executed'){if(m.ok)telemetry.executed++;else telemetry.failed++;executionResolver?.(Boolean(m.ok));executionResolver=null;if(!m.ok)onError?.('Website script failed: '+String(m.error||'unknown'));}
   if(m.type==='rte-fetch'){void proxyFetch(m);return;}
   if(m.type==='rte-event-result'){const callback=pendingEvents.get(m.requestId);if(callback){pendingEvents.delete(m.requestId);callback(Boolean(m.prevented));}return;}
   if(m.type==='rte-snapshot'){
    if(!m.body||m.body.tag!=='body'||typeof m.title!=='string')return;
    try{if(JSON.stringify(m.body).length>1400000)return;}catch{return;}
    onSnapshot?.(m.body,m.title.slice(0,120));
   }
  };
  async function proxyFetch(message){
   const id=Number(message.id);
   if(!Number.isSafeInteger(id)||id<0||id>100000||message.token!==token)return;
   telemetry.networkRequests++;
   const target=allowedPageRequest(currentPage,String(message.url||''),String(message.method||'GET'));
   if(!target){telemetry.networkFailures++;send('fetch-result',{id,error:'RTE only supports same-origin GET requests'});return;}
   try{
    const reply=await fetch('/api/rte/data?url='+encodeURIComponent(target),{cache:'no-store'});
    const body=await reply.json();
    if(stopped||token!==message.token)return;
    if(!reply.ok){telemetry.networkFailures++;send('fetch-result',{id,error:body.error||'Request failed'});return;}
    if(new URL(body.url).origin!==new URL(currentPage).origin){telemetry.networkFailures++;send('fetch-result',{id,error:'Cross-origin redirect blocked'});return;}
    send('fetch-result',{id,body:body.body,contentType:body.type,status:200});
   }catch(error){telemetry.networkFailures++;send('fetch-result',{id,error:String(error.message||error).slice(0,130)});}
  }
  window.addEventListener('message',listener);
  const whenReady=new Promise(resolve=>{readyResolver=resolve;});
  document.body.append(iframe);iframe.src='/sandbox.html';
  const timer=new Promise(resolve=>setTimeout(()=>resolve(false),4500));
  if(!(await Promise.race([whenReady,timer]))||stopped){release();throw Error('RTE script sandbox did not start');}
  async function fetchScript(target){
   const url=new URL(target,page.url);
   if(url.origin!==new URL(page.url).origin)throw Error('Cross-origin script blocked');
   const r=await fetch('/api/rte/script?url='+encodeURIComponent(url.href),{cache:'no-store'});
   if(!r.ok)throw Error('Script request failed');
   return r.text();
  }
  for(const entry of (page.scripts||[]).slice(0,MAX_SCRIPTS)){
   if(stopped)break;
   try{
    const code=entry.src?await fetchScript(entry.src):String(entry.inline||'');
    if(!code||code.length>160000){telemetry.skipped++;continue;}
    let instruction={scriptType:'classic',code};
    if(entry.kind==='module'){
     const entryURL=entry.src?new URL(entry.src,page.url).href:page.url;
     const graph=await loadModuleGraph(entryURL,url=>url===entryURL?code:fetchScript(url));
     instruction={scriptType:'module-graph',entryURL,modules:graph.modules};
     telemetry.moduleGraphs++;telemetry.moduleDependencies+=graph.modules.length-1;
    }
    const ack=new Promise(resolve=>{executionResolver=resolve;});
    send('run',instruction);
    const ok=await Promise.race([ack,new Promise(resolve=>setTimeout(()=>resolve(false),5000))]);
    if(!ok)telemetry.skipped++;
   }catch(err){telemetry.skipped++;onError?.('Script skipped: '+String(err.message||err).slice(0,120));}
  }
  if(!stopped)send('lifecycle');
  return !stopped;
 }
 function event(payload){
  const data=normalizeRTEEvent(typeof payload==='number'?{id:payload,event:'click'}:payload);
  if(!data||stopped||!iframe)return Promise.resolve(false);
  const requestId=++nextEvent;
  return new Promise(resolve=>{
   pendingEvents.set(requestId,resolve);
   send('event',{...data,requestId});
   setTimeout(()=>{const callback=pendingEvents.get(requestId);if(callback){pendingEvents.delete(requestId);callback(false);}},1000);
  });
 }
 return {load,event,dispose:release,get metrics(){return {...telemetry};},get active(){return !!iframe&&!stopped;}};
}
