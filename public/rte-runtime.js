import {allowedPageRequest,containsModuleImports} from '/rte-platform.js';
// RTE isolated script runner. Remote JavaScript never executes in Ryftipe's privileged page.
export function createScriptRuntime({onSnapshot,onError}){
 let iframe=null,token='',listener=null,readyResolver=null,executionResolver=null,stopped=false,currentPage='';
 const MAX_SCRIPTS=20;
 let telemetry={executed:0,failed:0,skipped:0,networkRequests:0,networkFailures:0};
 function release(){
  stopped=true;if(listener)window.removeEventListener('message',listener);
  iframe?.remove();iframe=null;listener=null;
  readyResolver?.(false);executionResolver?.(false);
  readyResolver=null;executionResolver=null;
 }
 function send(action,other={}){
  if(iframe?.contentWindow)iframe.contentWindow.postMessage({type:'rte-command',token,action,...other},'*');
 }
 async function load(page){
  telemetry={executed:0,failed:0,skipped:0,networkRequests:0,networkFailures:0};
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
    send('fetch-result',{id,body:body.body,type:body.type,status:200});
   }catch(error){telemetry.networkFailures++;send('fetch-result',{id,error:String(error.message||error).slice(0,130)});}
  }
  window.addEventListener('message',listener);
  const whenReady=new Promise(resolve=>{readyResolver=resolve;});
  document.body.append(iframe);iframe.src='/sandbox.html';
  const timer=new Promise(resolve=>setTimeout(()=>resolve(false),4500));
  if(!(await Promise.race([whenReady,timer]))||stopped){release();throw Error('RTE script sandbox did not start');}
  for(const entry of (page.scripts||[]).slice(0,MAX_SCRIPTS)){
   if(stopped)break;
   let code='';
   try{
    if(entry.src){
     const target=new URL(entry.src,page.url);
     if(target.origin!==new URL(page.url).origin){telemetry.skipped++;continue;}
     const r=await fetch('/api/rte/script?url='+encodeURIComponent(target.href));
     if(!r.ok){telemetry.skipped++;continue;}
     code=await r.text();
    }else code=String(entry.inline||'');
   }catch{continue;}
   if(!code||code.length>160000){telemetry.skipped++;continue;}
   if(entry.kind==='module'&&containsModuleImports(code)){telemetry.skipped++;continue;}
   const ack=new Promise(resolve=>{executionResolver=resolve;});
   send('run',{code,scriptType:entry.kind==='module'?'module':'classic'});
   await Promise.race([ack,new Promise(resolve=>setTimeout(()=>resolve(false),2000))]);
  }
  if(!stopped)send('lifecycle');
  return !stopped;
 }
 function event(id){
  if(!stopped&&iframe&&Number.isFinite(id))send('event',{id,event:'click'});
 }
 return {load,event,dispose:release,get metrics(){return {...telemetry};},get active(){return !!iframe&&!stopped;}};
}
