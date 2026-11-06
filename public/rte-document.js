// RTE document layout: sandboxed, script-disabled document rendered by the host browser.
// Site HTML/CSS never executes in Ryftipe's privileged UI. This replaces the
// hand-written canvas box painter for standards-based HTML/CSS layout.
const BLOCKED='script,iframe,frame,frameset,object,embed,applet,portal,base,meta[http-equiv],link,template';
const URL_ATTRIBUTES=new Set(['href','src','poster','action','formaction','cite','background','data']);
const DIRECT_URL=new Set(['http:','https:','mailto:','tel:']);
function absoluteResource(raw,base){
 try{
  const value=String(raw||'').trim();
  if(!value||value.startsWith('#'))return value;
  const url=new URL(value,base);
  if(!DIRECT_URL.has(url.protocol)||url.username||url.password)return '';
  return url.href;
 }catch{return '';}
}
function normalizeSrcset(text,base){
 return String(text||'').split(',').slice(0,24).map(item=>{
  const [raw,...description]=item.trim().split(/\s+/);
  const href=absoluteResource(raw,base);
  return href&&/^https?:/.test(href)?href+(description.length?' '+description.join(' '):''):'';
 }).filter(Boolean).join(', ');
}
export function sanitizeRTEHTML(raw,pageURL){
 const source=String(raw||'').slice(0,1800000);
 const page=new URL(pageURL);
 if(!['http:','https:'].includes(page.protocol))throw Error('Unsupported document URL');
 const parsed=new DOMParser().parseFromString(source,'text/html');
 for(const node of parsed.querySelectorAll(BLOCKED))node.remove();
 // Remove scripts and active embedded navigation surfaces, including SVG script tags.
 const all=parsed.querySelectorAll('*');
 if(all.length>16000)throw Error('Document exceeds RTE node limit');
 for(const el of all){
  if(!el.isConnected)continue;
  for(const attribute of [...el.attributes]){
   const name=attribute.name.toLowerCase();
   if(name.startsWith('on')||name==='srcdoc'||name==='integrity'||name==='nonce'){
    el.removeAttribute(attribute.name);continue;
   }
   if(name==='srcset'||name==='imagesrcset'){
    const normalized=normalizeSrcset(attribute.value,page.href);
    if(normalized)el.setAttribute(name,normalized);else el.removeAttribute(name);
    continue;
   }
   if(URL_ATTRIBUTES.has(name)){
    const normalized=absoluteResource(attribute.value,page.href);
    if(normalized)el.setAttribute(name,normalized);else el.removeAttribute(name);
   }
  }
  if(el.tagName==='A'){
   el.removeAttribute('download');
   el.setAttribute('target','_self');
   el.setAttribute('rel','noopener noreferrer');
  }
  if(el.tagName==='FORM')el.setAttribute('autocomplete','off');
  if(el.tagName==='IMG'&&!el.hasAttribute('loading'))el.setAttribute('loading','lazy');
 }
 // Site styles are loaded as a bounded, separately fetched CSS blob. Drop
 // original inline stylesheets to avoid double application and remote loading.
 for(const style of parsed.querySelectorAll('style'))style.remove();
 parsed.head.querySelectorAll('base,meta[http-equiv],script').forEach(el=>el.remove());
 const base=parsed.createElement('base');base.href=page.href;
 parsed.head.prepend(base);
 if(!parsed.head.querySelector('meta[charset]')){
  const meta=parsed.createElement('meta');meta.charset='utf-8';parsed.head.prepend(meta);
 }
 return parsed;
}
export function renderTreeHTML(tree){
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const tags=new Set('html head body main section article nav header footer aside div p h1 h2 h3 h4 h5 h6 ul ol li blockquote pre code span strong em b i small a button form input textarea select option label table thead tbody tr td th img picture source video audio svg path title br hr canvas details summary figure figcaption time address'.split(' '));
 const voids=new Set(['input','img','source','br','hr']);
 let count=0;
 const visit=(node,depth=0)=>{
  if(!node||depth>70||++count>18000)return '';
  if(Object.hasOwn(node,'text'))return escape(node.text);
  if(!tags.has(node.tag))return (node.children||[]).map(child=>visit(child,depth+1)).join('');
  const attributes=[];
  for(const [name,value] of Object.entries(node.attrs||{})){
   if(!/^[a-zA-Z][\w:-]*$/.test(name)||/^on/i.test(name)||['srcdoc','nonce'].includes(name))continue;
   attributes.push(' '+name+'="'+escape(value)+'"');
  }
  if(Number.isSafeInteger(node.rteId))attributes.push(' data-rte-id="'+node.rteId+'"');
  return '<'+node.tag+attributes.join('')+'>'+(voids.has(node.tag)?'':(node.children||[]).map(child=>visit(child,depth+1)).join('')+'</'+node.tag+'>');
 };
 return '<!doctype html>'+visit(tree);
}
export function createDocumentRenderer(canvas,{onNavigate=()=>{},onEvent=async()=>false,onStats=()=>{},onError=()=>{}}={}){
 const frame=document.createElement('iframe');
 frame.id='rte-document';
 frame.title='RTE document layout (website scripts disabled)';
 frame.setAttribute('sandbox','allow-same-origin');
 frame.referrerPolicy='no-referrer';
 frame.style.cssText='position:absolute;inset:0;width:100%;height:100%;border:0;background:white;transform-origin:top left;z-index:1';
 frame.hidden=true;
 canvas.parentElement.append(frame);
 let styleURL='',pageURL='',lastMarkup='',lastCSS='',revision=0,zoom=1,visible=false,loaded=false,renderCount=0;
 let stats={mode:'document',domNodes:0,documentHeight:0,stylesheets:0,renderCount:0};
 function revoke(){if(styleURL){URL.revokeObjectURL(styleURL);styleURL='';}}
 function applyDocument(markup,css,url,{tree=false}={}){
  const current=++revision;
  if(tree&&lastMarkup===markup)return;
  lastMarkup=markup;lastCSS=css;pageURL=url;
  const parsed=sanitizeRTEHTML(markup,url);
  revoke();
  styleURL=URL.createObjectURL(new Blob([String(css||'').slice(0,500000)],{type:'text/css'}));
  const stylesheet=parsed.createElement('link');
  stylesheet.rel='stylesheet';stylesheet.href=styleURL;
  parsed.head.append(stylesheet);
  loaded=false;
  frame.srcdoc='<!doctype html>'+parsed.documentElement.outerHTML;
  return current;
 }
 function closest(element,selector){
  return typeof element?.closest==='function'?element.closest(selector):element?.parentElement?.closest?.(selector);
 }
 async function click(event){
  const el=event.target;
  const link=closest(el,'a[href]');
  const button=closest(el,'[data-rte-id]');
  if(link)event.preventDefault();
  const id=Number(button?.getAttribute('data-rte-id'));
  if(Number.isSafeInteger(id)&&id>0){
   const prevented=await onEvent({id,event:'click'});
   if(prevented)return;
  }
  if(link&&link.href){
   try{const target=new URL(link.href,pageURL);if(['http:','https:'].includes(target.protocol))onNavigate(target.href);}catch{}
  }
 }
 function submit(event){
  event.preventDefault();const form=event.target;
  try{
   const target=new URL(form.getAttribute('action')||pageURL,pageURL);
   if(!['http:','https:'].includes(target.protocol))return;
   if((form.method||'get').toLowerCase()!=='get'){onError('RTE supports GET forms only');return;}
   const params=new URLSearchParams(new FormData(form));for(const [key,value] of params)if(typeof value==='string')target.searchParams.append(key,value);
   onNavigate(target.href);
  }catch(error){onError(String(error.message||error));}
 }
 frame.addEventListener('load',()=>{
  if(!frame.contentDocument)return;
  loaded=true;renderCount++;
  const doc=frame.contentDocument;
  doc.addEventListener('click',click,true);
  doc.addEventListener('submit',submit,true);
  stats={mode:'document',domNodes:doc.querySelectorAll('*').length,documentHeight:doc.documentElement.scrollHeight,stylesheets:doc.styleSheets.length,renderCount};
  onStats(stats);
 });
 function show(){visible=true;frame.hidden=false;canvas.hidden=true;applyZoom();}
 function hide(){visible=false;frame.hidden=true;}
 function applyZoom(){
  frame.style.width=(100/zoom)+'%';frame.style.height=(100/zoom)+'%';
  frame.style.transform='scale('+zoom+')';
 }
 function setZoom(value){zoom=Math.max(.5,Math.min(2,Number(value)||1));applyZoom();return zoom;}
 function findText(query,direction=1){
  const term=String(query||'').trim();
  const doc=frame.contentDocument;
  if(!term||!doc){doc?.getSelection()?.removeAllRanges();return {found:0,total:0};}
  const text=doc.body?.textContent||'';
  const total=text.toLowerCase().split(term.toLowerCase()).length-1;
  const found=frame.contentWindow?.find?.(term,false,direction<0,true,false,false,false);
  return {found:found?1:0,total};
 }
 function dispose(){revoke();frame.remove();}
 return {
  frame,show,hide,dispose,setZoom,findText,
  renderHTML:(html,css,url)=>applyDocument(html,css,url),
  renderTree:(tree,css,url)=>applyDocument(renderTreeHTML(tree),css,url,{tree:true}),
  get visible(){return visible;},
  get loaded(){return loaded;},
  get stats(){return {...stats};}
 };
}
