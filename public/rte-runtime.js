// RTE isolated script runner. Remote JavaScript never executes in Ryftipe's privileged page.
export function createScriptRuntime({onSnapshot,onError}){
 let iframe=null,token='',listener=null,readyResolver=null,executionResolver=null,stopped=false;
 const MAX_SCRIPTS=8;
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
  release();stopped=false;token=crypto.randomUUID();
  iframe=document.createElement('iframe');
  iframe.setAttribute('sandbox','allow-scripts');
  iframe.setAttribute('title','Isolated RTE JavaScript runtime');
  iframe.setAttribute('aria-hidden','true');
  iframe.style.cssText='position:absolute;width:0;height:0;border:0;opacity:0;pointer-events:none';
  const thisFrame=iframe;
  listener=event=>{
   if(event.source!==thisFrame.contentWindow||event.origin!=='null')return;
   const m=event.data;if(!m||typeof m!=='object')return;
   if(m.type==='rte-loaded'){send('load',{tree:page.dom,title:page.title});return;}
   if(m.token!==token||stopped)return;
   if(m.type==='rte-ready'){readyResolver?.(true);readyResolver=null;}
   if(m.type==='rte-executed'){executionResolver?.(Boolean(m.ok));executionResolver=null;if(!m.ok)onError?.('Website script failed: '+String(m.error||'unknown'));}
   if(m.type==='rte-snapshot'){
    if(!m.body||m.body.tag!=='body'||typeof m.title!=='string')return;
    try{if(JSON.stringify(m.body).length>1400000)return;}catch{return;}
    onSnapshot?.(m.body,m.title.slice(0,120));
   }
  };
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
     if(target.origin!==new URL(page.url).origin)continue;
     const r=await fetch('/api/rte/script?url='+encodeURIComponent(target.href));
     if(!r.ok)continue;
     code=await r.text();
    }else code=String(entry.inline||'');
   }catch{continue;}
   if(!code||code.length>140000)continue;
   const ack=new Promise(resolve=>{executionResolver=resolve;});
   send('run',{code});
   await Promise.race([ack,new Promise(resolve=>setTimeout(()=>resolve(false),2000))]);
  }
  if(!stopped)send('lifecycle');
  return !stopped;
 }
 function event(id){
  if(!stopped&&iframe&&Number.isFinite(id))send('event',{id,event:'click'});
 }
 return {load,event,dispose:release,get active(){return !!iframe&&!stopped;}};
}
