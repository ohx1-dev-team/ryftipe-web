// RTE media foundation: HTML video/audio elements rendered at RTE layout coordinates.
// Uses the local platform's media decoder (not a website iframe or Render screencast).
const ALLOWED=new Set(['http:','https:']);
export function mediaCandidates(node,base){
 const sources=[];
 if(!node||!['video','audio'].includes(node.tag))return sources;
 const items=node.attrs?.src?[{attrs:{src:node.attrs.src}}]:(node.children||[]).filter(c=>c.tag==='source');
 for(const item of items.slice(0,12)){
  const raw=item?.attrs?.src;if(!raw)continue;
  try{const u=new URL(String(raw),base);if(!ALLOWED.has(u.protocol)||u.username||u.password)continue;sources.push({url:u.href,type:String(item.attrs?.type||'').slice(0,120)});}catch{}
 }
 return sources;
}
export function mediaSource(node,base){return mediaCandidates(node,base)[0]?.url||null;}
export function mediaAttributes(node){
  const attrs=node?.attrs||{};
  return {
    controls: Object.hasOwn(attrs,'controls'),
    muted: Object.hasOwn(attrs,'muted'),
    loop: Object.hasOwn(attrs,'loop'),
    // Prevent automatic unsolicited audio; autoplay only allowed if explicitly muted.
    autoplay:Object.hasOwn(attrs,'autoplay')&&Object.hasOwn(attrs,'muted'),
    preload:['none','metadata','auto'].includes(attrs.preload)?attrs.preload:'metadata',
    poster: typeof attrs.poster==='string'?attrs.poster:null
  };
}
export function mediaRect(command,{scroll=0,zoom=1,viewportWidth=800,viewportHeight=600}={}){
  if(!command||!Number.isFinite(command.x)||!Number.isFinite(command.y)||!Number.isFinite(command.w)||!Number.isFinite(command.h))return null;
  const ratio=Math.max(.5,Math.min(2,Number(zoom)||1));
  const x=command.x*ratio,y=(command.y-scroll)*ratio,w=command.w*ratio,h=command.h*ratio;
  if(w<=0||h<=0||x>=viewportWidth||y>=viewportHeight||y+h<=0||x+w<=0)return null;
  return {x,y,w,h};
}
export function createMediaLayer(canvas,{onError=()=>{}}={}){
 const host=canvas.parentElement;
 if(!host)throw Error('RTE viewport has no media host');
 const layer=document.createElement('div');
 layer.className='rte-media-layer';
 layer.style.cssText='position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:1';
 host.append(layer);
 const nodes=new Map();
 let currentURL='',generation=0;
 function reset(url=''){
  generation++;currentURL=url;
  for(const element of nodes.values()){element.pause();element.removeAttribute('src');element.load();element.remove();}
  nodes.clear();
 }
 function sync(commands,opts={}){
  const used=new Set();
  for(const [index,command] of commands.entries()){
   if(command.kind!=='media'||!['video','audio'].includes(command.tag))continue;
   const rect=mediaRect(command,opts);
   const key=String(command.mediaId??index);
   used.add(key);
   if(!rect){const old=nodes.get(key);if(old)old.style.display='none';continue;}
   let element=nodes.get(key);
   if(!element||element.tagName.toLowerCase()!==command.tag){
    if(element){element.pause();element.remove();}
    element=document.createElement(command.tag);
    element.style.cssText='position:absolute;box-sizing:border-box;pointer-events:auto;background:#06090f;max-width:none';
    element.addEventListener('error',()=>onError('Media failed to load: unsupported format, unavailable source, or site restrictions'));
    layer.append(element);nodes.set(key,element);
   }
   const attrs=mediaAttributes(command);
   element.controls=attrs.controls;
   element.muted=attrs.muted;
   element.loop=attrs.loop;
   element.preload=attrs.preload;
   if(command.tag==='video')element.playsInline=true;
   if(attrs.poster&&command.tag==='video'){
     try{const u=new URL(attrs.poster,currentURL);if(ALLOWED.has(u.protocol))element.poster=u.href;}catch{}
   }
   const sources=(command.candidates?.length?command.candidates:[{url:command.url,type:''}]);
   const fingerprint=JSON.stringify(sources);
   if(element.dataset.rteSrc!==fingerprint){
    element.dataset.rteSrc=fingerprint;element.pause();element.removeAttribute('src');element.replaceChildren();
    if(sources.length===1&&!sources[0].type){element.src=sources[0].url;}
    else for(const item of sources){const child=document.createElement('source');child.src=item.url;if(item.type)child.type=item.type;element.append(child);}
    element.load();if(attrs.autoplay)element.play().catch(()=>{});
   }
   Object.assign(element.style,{left:rect.x+'px',top:rect.y+'px',width:rect.w+'px',height:rect.h+'px',display:'block'});
  }
  for(const [key,element] of nodes){if(!used.has(key)){element.pause();element.remove();nodes.delete(key);}}
 }
 function hide(){layer.hidden=true;for(const el of nodes.values())el.pause();}
 function show(){layer.hidden=false;}
 function dispose(){reset();layer.remove();}
 return {reset,sync,hide,show,dispose,get count(){return nodes.size;}};
}
