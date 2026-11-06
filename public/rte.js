import {createScriptRuntime} from '/rte-runtime.js';
import {parseCSS,computeStyle,length as cssLength} from '/rte-css.js';
import {createLayoutCommands,READER_CSS} from '/rte-layout.js';
import {getFormURL} from '/rte-forms.js';
import {createMediaLayer} from '/rte-media.js';
import {paintGradient} from '/rte-gradients.js';
import {createDocumentRenderer} from '/rte-document.js';
// RTE Canvas layout/paint pipeline: original HTML/CSS subset; never executes remote JavaScript.
const BLOCK=new Set('html body main section article nav header footer div p h1 h2 h3 h4 h5 h6 ul ol li blockquote pre form figure figcaption table tr td th'.split(' '));
const OMIT=new Set('head meta link title script style noscript template'.split(' '));
const base={color:'#1f2937','font-size':'16px','font-weight':'normal','font-family':'Arial'};
const defaults={body:{'background-color':'#fff'},a:{color:'#2052af'},h1:{'font-size':'32px','font-weight':'bold'},h2:{'font-size':'26px','font-weight':'bold'},h3:{'font-size':'21px','font-weight':'bold'},b:{'font-weight':'bold'},strong:{'font-weight':'bold'},small:{'font-size':'12px'},code:{'font-family':'monospace'}};
function px(value,fallback=0,base=700){return cssLength(value,fallback,base,16,typeof window!=='undefined'?window.innerWidth:base);}
export function createRTE(canvas,{onNavigate,onLocation,onError,onStats,onCompatibility,javascriptEnabled=()=>true,imagesEnabled=()=>true,documentLayoutEnabled=()=>true}){
 const c=canvas.getContext('2d',{alpha:false});
 const mediaLayer=createMediaLayer(canvas,{onError:message=>onError?.(message)});
 let url='',doc=null,rules=[],cssSource='',scroll=0,commands=[],hits=[],height=0,active=false,generation=0,history=[],position=-1;
 let pageBackground='#fff',lastWidth=0,zoom=1,lastFindIndex=-1,stylesheetStats={};
 let scriptRuntime=null,scriptStatus='off',lastScriptMetrics={};
 const docRenderer=createDocumentRenderer(canvas,{onNavigate,onError,onEvent:payload=>scriptRuntime?.event(payload)??false,onStats});
 let currentMarkup='',initialDocument=true;
 const documentMode=()=>Boolean(documentLayoutEnabled());
 const images=new Map();let repaintTimer=0,paintRaf=0,paintCostMs=0,averagePaintMs=0,paintCount=0;
 function style(n,parent,ancestors){return computeStyle(n,parent,rules,ancestors);}
 function font(s){const z=Math.min(52,Math.max(10,px(s['font-size'],16)));return {size:z,value:(s['font-weight']==='bold'||parseInt(s['font-weight'])>=600?'bold ':'')+z+'px '+(s['font-family']==='monospace'?'monospace':'Arial')};}
 function absolute(raw){try{const u=new URL(raw,url);return /^https?:$/.test(u.protocol)?u.href:null;}catch{return null;}}
 function image(raw){if(!imagesEnabled())return null;const target=absolute(raw);if(!target)return null;if(!images.has(target)){images.set(target,{status:'loading'});fetch('/api/rte/image?url='+encodeURIComponent(target)).then(r=>{if(!r.ok)throw Error();return r.blob();}).then(createImageBitmap).then(b=>{images.set(target,{status:'ready',bitmap:b});schedulePaint();}).catch(()=>images.set(target,{status:'error'}));}return target;}
 function drawText(text,s,x,y,width,href,nodeId){
  const f=font(s);c.font=f.value;const line=f.size*1.32;let xx=x,yy=y;
  for(const word of String(text).replace(/\s+/g,' ').split(/(\s+)/)){
   if(!word)continue;const w=c.measureText(word).width;
   if(xx+w>x+width&&xx>x){xx=x;yy+=line;}
   if(word.trim()){commands.push({kind:'text',text:word,x:xx,y:yy,h:line,font:f.value,color:s.color||'#20232b'});if(href)hits.push({x:xx,y:yy,w,h:line,url:href,nodeId});}
   xx+=w;
  }
  return yy+line;
 }
 function renderNode(n,parent,x,y,w,href,depth,nodeId=null,ancestors=[]){
  if(depth>60||commands.length>10000)return y;
  if('text'in n)return drawText(n.text,parent,x,y,w,href,nodeId);
  if(OMIT.has(n.tag))return y;
  const s=style(n,parent,ancestors);if(s.display==='none'||s.visibility==='hidden')return y;
  if(Number.isFinite(n.rteId)&&n.rteId>0)nodeId=n.rteId;
  const isBlock=BLOCK.has(n.tag)||s.display==='block',margin=px(s.margin,0,w),pad=px(s.padding,0,w);
  const pt=px(s['padding-top'],pad,w),pb=px(s['padding-bottom'],pad,w);
  const pl=px(s['padding-left'],pad,w),pr=px(s['padding-right'],pad,w);
  const ml=px(s['margin-left'],isBlock?margin:0,w),mr=px(s['margin-right'],isBlock?margin:0,w);
  const desired=s.width?px(s.width,w-pl-pr-ml-mr,w):w-pl-pr-ml-mr;
  let insideW=Math.max(50,Math.min(w-pl-pr,desired));
  const centered=(s['margin-left']==='auto'&&s['margin-right']==='auto');
  const left=x+(centered?Math.max(0,(w-insideW-pl-pr)/2):ml);
  const top=y+px(s['margin-top'],isBlock?margin:0,w);
  let yy=top+pt;
  if(n.tag==='br')return yy+font(s).size*1.25;
  if(n.tag==='hr'){commands.push({kind:'rect',x:left,y:yy,w:insideW,h:2,color:'#d2d9e4'});return yy+16;}
  if(n.tag==='img'){const target=image(n.attrs?.src||'');const iw=Math.min(insideW,Math.max(32,px(n.attrs?.width||s.width,240,w))),ih=Math.min(500,Math.max(26,px(n.attrs?.height||s.height,140,w)));if(target)commands.push({kind:'image',url:target,x:left,y:yy,w:iw,h:ih});return yy+ih+8;}
  if(n.tag==='input'||n.tag==='button'){const label=n.attrs?.placeholder||n.attrs?.value||(n.tag==='button'?'Button':'Text input');commands.push({kind:'rect',x:left,y:yy,w:Math.min(w,350),h:34,color:'#e7edf6'});drawText(label,{...s,'font-size':'14px',color:'#34445b'},left+8,yy+6,Math.min(w,325));hits.push({x:left,y:yy,w:Math.min(w,350),h:34,input:n.tag==='input'?n:null,nodeId});return yy+42;}
  if(n.tag==='li'){commands.push({kind:'text',text:'•',x:left,y:yy,h:20,font:'16px Arial',color:s.color||'#222'});}
  const bg=s['background-color']||(/^(#|rgb)/.test(s.background||'')?s.background:null);
  const r=bg?{kind:'rect',x:left,y:top,w:insideW+pl+pr,h:1,color:bg}:null;
  if(r)commands.push(r);
  const link=n.tag==='a'?absolute(n.attrs?.href||'')||href:href;
  let buf='';
  const flush=()=>{if(buf){yy=drawText(buf,s,left+pl,yy,insideW,link,nodeId);buf='';}};
  for(const child of n.children||[]){if('text'in child){buf+=child.text;continue;}flush();yy=renderNode(child,s,left+pl,yy,insideW,link,depth+1,nodeId,[...ancestors,n]);}
  flush();yy+=pb;if(r)r.h=Math.max(1,yy-top);
  return yy+px(s['margin-bottom'],isBlock?margin:0,w);
 }
 function layout(){
  if(!doc)return;
  if(documentMode()){onStats?.({mode:'document',...docRenderer.stats});return;}
  const w=Math.max(320,Math.round(canvas.clientWidth/zoom));
  const readerMode=!cssSource.trim();
  if(w!==lastWidth){rules=parseCSS(readerMode?READER_CSS:cssSource,w,{colorScheme:window.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light'});lastWidth=w;}
  const result=createLayoutCommands({
    document:doc,rules,width:w,ctx:c,url,onImage:image,readerMode
  });
  commands=result.commands;hits=result.hits;height=result.height;pageBackground=result.background;
  scroll=Math.min(scroll,Math.max(0,height-canvas.clientHeight/zoom));
  paint();
 }
 function schedulePaint(){if(!active||paintRaf)return;paintRaf=requestAnimationFrame(()=>{paintRaf=0;paint();});}
 function paint(){
  if(!active)return;
  const started=performance.now();
  const w=Math.max(320,Math.round(canvas.clientWidth)),h=Math.max(240,Math.round(canvas.clientHeight));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  c.fillStyle=pageBackground;c.fillRect(0,0,w,h);c.save();c.scale(zoom,zoom);c.translate(0,-scroll);
  for(const v of commands){if(v.y+v.h<scroll-80||v.y>scroll+h+80)continue;
   if(v.kind==='rect'){c.fillStyle=v.color;if(v.radius&&typeof c.roundRect==='function'){c.beginPath();c.roundRect(v.x,v.y,v.w,v.h,v.radius);c.fill();}else c.fillRect(v.x,v.y,v.w,v.h);}
   if(v.kind==='gradient')paintGradient(c,v);
   if(v.kind==='border'){c.strokeStyle=v.color;c.lineWidth=v.lineWidth||1;if(v.radius&&typeof c.roundRect==='function'){c.beginPath();c.roundRect(v.x,v.y,v.w,v.h,v.radius);c.stroke();}else c.strokeRect(v.x,v.y,v.w,v.h);}
   if(v.kind==='text'){c.fillStyle=v.color;c.font=v.font;c.textBaseline='top';c.fillText(v.text,v.x,v.y);if(v.underline){c.strokeStyle=v.color;c.lineWidth=1;c.beginPath();c.moveTo(v.x,v.y+v.h-3);c.lineTo(v.x+c.measureText(v.text).width,v.y+v.h-3);c.stroke();}}
   if(v.kind==='image'){const im=images.get(v.url);if(im?.status==='ready')c.drawImage(im.bitmap,v.x,v.y,v.w,v.h);else{c.fillStyle='#e4e8f0';c.fillRect(v.x,v.y,v.w,v.h);}}
  }
  c.restore();
  mediaLayer.sync(commands,{scroll,zoom,viewportWidth:canvas.clientWidth,viewportHeight:canvas.clientHeight});
  paintCostMs=performance.now()-started;paintCount++;
  averagePaintMs=paintCount===1?paintCostMs:averagePaintMs*.9+paintCostMs*.1;
  onStats?.({commands:commands.length,height,paintMs:paintCostMs,averagePaintMs,paintCount});
 }
 function show(){active=true;if(documentMode()){canvas.hidden=true;mediaLayer.hide();docRenderer.show();}else{docRenderer.hide();canvas.hidden=false;mediaLayer.show();layout();}}
 function hide(){active=false;if(paintRaf)cancelAnimationFrame(paintRaf);paintRaf=0;canvas.hidden=true;docRenderer.hide();mediaLayer.hide();scriptRuntime?.dispose();scriptRuntime=null;scriptStatus='paused';}
 function dispose(){if(paintRaf)cancelAnimationFrame(paintRaf);paintRaf=0;scriptRuntime?.dispose();scriptRuntime=null;docRenderer.dispose();mediaLayer.dispose();active=false;}
 async function navigate(target,{replace=false}={}){
  const token=++generation;onLocation?.({url:target,loading:true});
  try{const r=await fetch('/api/rte/document?url='+encodeURIComponent(target),{cache:'no-store'}),page=await r.json();if(token!==generation)return false;if(!r.ok)throw Error(page.error||'Page load failed');
   url=page.url;doc=page.dom;stylesheetStats=page.stylesheets||{};mediaLayer.reset(url);
   currentMarkup=page.markup||'';initialDocument=true;
   if(documentMode()){
    if(currentMarkup)docRenderer.renderHTML(currentMarkup,page.css||'',url);
    else docRenderer.renderTree(doc,page.css||'',url);
   }cssSource=page.css||'';lastWidth=0;rules=parseCSS(cssSource.trim()?cssSource:READER_CSS,canvas.clientWidth,{colorScheme:window.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light'});scroll=0;lastFindIndex=-1;
   lastScriptMetrics=scriptRuntime?.metrics||lastScriptMetrics;scriptRuntime?.dispose();scriptRuntime=null;scriptStatus='off';
   if(!replace){history=history.slice(0,position+1);history.push(url);position=history.length-1;}
   show();onLocation?.({url,title:page.title,loading:false});
   if(page.compatibility?.javascriptRequired)onCompatibility?.({...page.compatibility,url:page.url,attemptingScripts:Boolean(page.scripts?.length&&javascriptEnabled())});
   if(page.scripts?.length&&javascriptEnabled()){
    scriptRuntime=createScriptRuntime({
     onSnapshot:(body,title)=>{if(token!==generation)return;doc=body;
      if(documentMode()){
       // Preserve standards-parsed original HTML for static sites. The old
       // hand-written HTML parser loses too much markup to replace it here.
       // For script-driven sites snapshots can update the isolated renderer.
       if(!currentMarkup||page.compatibility?.javascriptRequired){docRenderer.renderTree(body,cssSource,url);initialDocument=false;}
      }else layout();
      if(title)onLocation?.({url,title,loading:false});},
     onError:msg=>{if(token===generation)onError?.(msg);}
    });
    const running=scriptRuntime;scriptStatus='loading';
    running.load(page).then(()=>{if(token===generation){scriptStatus='ready';lastScriptMetrics=running.metrics;}}).catch(e=>{if(token===generation){scriptStatus='failed';lastScriptMetrics=running.metrics;onError?.('RTE JavaScript: '+e.message);}});
   }
   return true;
  }catch(e){if(token===generation)onError?.(e.message);return false;}
 }
 function setZoom(value){
  zoom=Math.max(.5,Math.min(2,Math.round(Number(value)*10)/10||1));
  if(documentMode())docRenderer.setZoom(zoom);
  else if(doc){lastWidth=0;layout();}
  return zoom;
 }
 function findText(query,direction=1){
  if(documentMode())return docRenderer.findText(query,direction);
  const term=String(query||'').trim().toLowerCase();if(!term){lastFindIndex=-1;paint();return{found:0,total:0};}
  const found=commands.map((cmd,i)=>({cmd,i})).filter(v=>v.cmd.kind==='text'&&v.cmd.text.toLowerCase().includes(term));
  if(!found.length)return{found:0,total:0};
  const next=direction>=0?found.findIndex(v=>v.i>lastFindIndex):found.findLastIndex(v=>v.i<lastFindIndex);
  const index=next<0?(direction>=0?0:found.length-1):next;
  lastFindIndex=found[index].i;
  scroll=Math.min(Math.max(0,height-canvas.clientHeight/zoom),Math.max(0,found[index].cmd.y-80));
  schedulePaint();return{found:index+1,total:found.length};
 }
 function back(){if(position>0){position--;navigate(history[position],{replace:true});}}
 function forward(){if(position<history.length-1){position++;navigate(history[position],{replace:true});}}
 function reload(){if(url)navigate(url,{replace:true});}
 canvas.addEventListener('wheel',e=>{if(!active)return;e.preventDefault();scroll=Math.min(Math.max(0,height-canvas.clientHeight/zoom),Math.max(0,scroll+e.deltaY/zoom));schedulePaint();},{passive:false});
 canvas.addEventListener('click',async e=>{
  if(!active)return;
  const r=canvas.getBoundingClientRect();
  const x=(e.clientX-r.left)/r.width*canvas.width/zoom;
  const y=(e.clientY-r.top)/r.height*canvas.height/zoom+scroll;
  const v=hits.findLast(hit=>x>=hit.x&&x<hit.x+hit.w&&y>=hit.y&&y<hit.y+hit.h);
  if(!v)return;
  const currentGeneration=generation;
  let value=null,checked=null;
  if(v.input){
   const type=String(v.input.attrs?.type||'text').toLowerCase();
   if(type==='checkbox'||type==='radio'){
    checked=type==='radio'?true:!Object.hasOwn(v.input.attrs,'checked');
    if(checked)v.input.attrs.checked='';else delete v.input.attrs.checked;
    value=v.input.attrs.value||'on';
   }else{
    const answer=prompt('Edit '+(v.input.attrs?.name||'field'),v.input.attrs?.value||'');
    if(answer===null)return;
    value=answer;v.input.attrs.value=answer.slice(0,2000);
   }
  }
  if(scriptRuntime?.active&&v.nodeId){
   const payload={id:v.nodeId,event:'click'};
   if(value!==null)payload.value=value;
   if(checked!==null)payload.checked=checked;
   const prevented=await scriptRuntime.event(payload);
   if(currentGeneration!==generation)return;
   if(v.input){
    await scriptRuntime.event({id:v.nodeId,event:'input',...value!==null?{value}:{},...checked!==null?{checked}:{}});
    await scriptRuntime.event({id:v.nodeId,event:'change',...value!==null?{value}:{},...checked!==null?{checked}:{}});
   }
   if(prevented)return;
  }
  if(v.url)onNavigate?.(v.url);
  else if(v.submit&&v.form){
   if(scriptRuntime?.active&&Number.isFinite(v.form.rteId)){
    const blocked=await scriptRuntime.event({id:v.form.rteId,event:'submit'});
    if(blocked||currentGeneration!==generation)return;
   }
   try{onNavigate?.(getFormURL(url,v.form,v.submit));}catch(err){onError?.(err.message);}
  }else if(v.input)layout();
 });
 return {navigate,back,forward,reload,show,hide,dispose,resize:layout,setZoom,findText,get zoom(){return zoom;},get active(){return active;},get url(){return url;},get scriptStatus(){return scriptStatus;},get stats(){return {mode:documentMode()?'document':'canvas',...(documentMode()?docRenderer.stats:{}),commands:commands.length,textCommands:commands.filter(c=>c.kind==='text').length,gradientCommands:commands.filter(c=>c.kind==='gradient').length,cssRules:rules.length,stylesheetStats,documentHeight:documentMode()?docRenderer.stats.documentHeight:height,zoom,scriptStatus,paintMs:paintCostMs,averagePaintMs,paintCount,scriptMetrics:scriptRuntime?.metrics||lastScriptMetrics};}};
}
