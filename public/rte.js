// RTE Canvas layout/paint pipeline: original HTML/CSS subset; never executes remote JavaScript.
function decl(css){const out={};for(const m of css.matchAll(/([\w-]+)\s*:\s*([^;{}]+)/g))out[m[1]]=m[2].trim();return out;}
function parseCSS(text){const rules=[];for(const m of text.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{([^{}]+)\}/g)){for(const s of m[1].split(',')){const selector=s.trim();if(/^(?:[\w-]+)?(?:#[\w-]+)?(?:\.[\w-]+)*$/.test(selector))rules.push({selector,props:decl(m[2])});}if(rules.length>800)break;}return rules;}
function match(n,s){const tag=s.match(/^[\w-]+/)?.[0],id=s.match(/#([\w-]+)/)?.[1];if(tag&&tag!==n.tag||id&&id!==n.attrs?.id)return false;return [...s.matchAll(/\.([\w-]+)/g)].every(x=>String(n.attrs?.class||'').split(/\s+/).includes(x[1]));}
const BLOCK=new Set('html body main section article nav header footer div p h1 h2 h3 h4 h5 h6 ul ol li blockquote pre form figure figcaption table tr td th'.split(' '));
const OMIT=new Set('head meta link title script style noscript template'.split(' '));
const base={color:'#1f2937','font-size':'16px','font-weight':'normal','font-family':'Arial'};
const defaults={body:{'background-color':'#fff'},a:{color:'#2052af'},h1:{'font-size':'32px','font-weight':'bold'},h2:{'font-size':'26px','font-weight':'bold'},h3:{'font-size':'21px','font-weight':'bold'},b:{'font-weight':'bold'},strong:{'font-weight':'bold'},small:{'font-size':'12px'},code:{'font-family':'monospace'}};
function px(value,fallback=0,base=700){if(!value)return fallback;const v=String(value);if(v.endsWith('%'))return parseFloat(v)*base/100;return /^[\d.]+(?:px)?$/.test(v)?+parseFloat(v):fallback;}
export function createRTE(canvas,{onNavigate,onLocation,onError,onStats}){
 const c=canvas.getContext('2d',{alpha:false});
 let url='',doc=null,rules=[],scroll=0,commands=[],hits=[],height=0,active=false,generation=0,history=[],position=-1;
 const images=new Map();let repaintTimer=0;
 function style(n,parent){const s={...base,...parent,...(defaults[n.tag]||{})};for(const r of rules)if(match(n,r.selector))Object.assign(s,r.props);Object.assign(s,decl(n.attrs?.style||''));return s;}
 function font(s){const z=Math.min(52,Math.max(10,px(s['font-size'],16)));return {size:z,value:(s['font-weight']==='bold'||parseInt(s['font-weight'])>=600?'bold ':'')+z+'px '+(s['font-family']==='monospace'?'monospace':'Arial')};}
 function absolute(raw){try{const u=new URL(raw,url);return /^https?:$/.test(u.protocol)?u.href:null;}catch{return null;}}
 function image(raw){const target=absolute(raw);if(!target)return null;if(!images.has(target)){images.set(target,{status:'loading'});fetch('/api/rte/image?url='+encodeURIComponent(target)).then(r=>{if(!r.ok)throw Error();return r.blob();}).then(createImageBitmap).then(b=>{images.set(target,{status:'ready',bitmap:b});paint();}).catch(()=>images.set(target,{status:'error'}));}return target;}
 function drawText(text,s,x,y,width,href){
  const f=font(s);c.font=f.value;const line=f.size*1.32;let xx=x,yy=y;
  for(const word of String(text).replace(/\s+/g,' ').split(/(\s+)/)){
   if(!word)continue;const w=c.measureText(word).width;
   if(xx+w>x+width&&xx>x){xx=x;yy+=line;}
   if(word.trim()){commands.push({kind:'text',text:word,x:xx,y:yy,h:line,font:f.value,color:s.color||'#20232b'});if(href)hits.push({x:xx,y:yy,w,h:line,url:href});}
   xx+=w;
  }
  return yy+line;
 }
 function renderNode(n,parent,x,y,w,href,depth){
  if(depth>60||commands.length>10000)return y;
  if('text'in n)return drawText(n.text,parent,x,y,w,href);
  if(OMIT.has(n.tag))return y;
  const s=style(n,parent);if(s.display==='none'||s.visibility==='hidden')return y;
  const isBlock=BLOCK.has(n.tag)||s.display==='block',margin=px(s.margin,0,w),pad=px(s.padding,0,w);
  const left=x+px(s['margin-left'],isBlock?margin:0,w),top=y+px(s['margin-top'],isBlock?margin:0,w);
  let insideW=Math.max(50,w-pad*2-margin*2),yy=top+pad;
  if(s.width)insideW=Math.min(insideW,px(s.width,insideW,w));
  if(n.tag==='br')return yy+font(s).size*1.25;
  if(n.tag==='hr'){commands.push({kind:'rect',x:left,y:yy,w:insideW,h:2,color:'#d2d9e4'});return yy+16;}
  if(n.tag==='img'){const target=image(n.attrs?.src||'');const iw=Math.min(insideW,Math.max(32,px(n.attrs?.width||s.width,240,w))),ih=Math.min(500,Math.max(26,px(n.attrs?.height||s.height,140,w)));if(target)commands.push({kind:'image',url:target,x:left,y:yy,w:iw,h:ih});return yy+ih+8;}
  if(n.tag==='input'||n.tag==='button'){const label=n.attrs?.placeholder||n.attrs?.value||(n.tag==='button'?'Button':'Text input');commands.push({kind:'rect',x:left,y:yy,w:Math.min(w,350),h:34,color:'#e7edf6'});drawText(label,{...s,'font-size':'14px',color:'#34445b'},left+8,yy+6,Math.min(w,325));hits.push({x:left,y:yy,w:Math.min(w,350),h:34,input:n.tag==='input'?n:null});return yy+42;}
  if(n.tag==='li'){commands.push({kind:'text',text:'•',x:left,y:yy,h:20,font:'16px Arial',color:s.color||'#222'});}
  const bg=s['background-color']||(/^(#|rgb)/.test(s.background||'')?s.background:null);
  const r=bg?{kind:'rect',x:left,y:top,w:insideW+pad*2,h:1,color:bg}:null;
  if(r)commands.push(r);
  const link=n.tag==='a'?absolute(n.attrs?.href||'')||href:href;
  let buf='';
  const flush=()=>{if(buf){yy=drawText(buf,s,left+pad,yy,insideW,link);buf='';}};
  for(const child of n.children||[]){if('text'in child){buf+=child.text;continue;}flush();yy=renderNode(child,s,left+pad,yy,insideW,link,depth+1);}
  flush();yy+=pad;if(r)r.h=Math.max(1,yy-top);
  return yy+px(s['margin-bottom'],isBlock?margin:0,w);
 }
 function layout(){
  if(!doc)return;commands=[];hits=[];const w=Math.max(320,canvas.clientWidth);
  height=renderNode(doc,base,12,14,w-24,null,0)+30;
  scroll=Math.min(scroll,Math.max(0,height-canvas.clientHeight));paint();
 }
 function paint(){
  if(!active)return;
  const w=Math.max(320,Math.round(canvas.clientWidth)),h=Math.max(240,Math.round(canvas.clientHeight));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  c.fillStyle='#fff';c.fillRect(0,0,w,h);c.save();c.translate(0,-scroll);
  for(const v of commands){if(v.y+v.h<scroll-80||v.y>scroll+h+80)continue;
   if(v.kind==='rect'){c.fillStyle=v.color;c.fillRect(v.x,v.y,v.w,v.h);}
   if(v.kind==='text'){c.fillStyle=v.color;c.font=v.font;c.textBaseline='top';c.fillText(v.text,v.x,v.y);}
   if(v.kind==='image'){const im=images.get(v.url);if(im?.status==='ready')c.drawImage(im.bitmap,v.x,v.y,v.w,v.h);else{c.fillStyle='#e4e8f0';c.fillRect(v.x,v.y,v.w,v.h);}}
  }
  c.restore();onStats?.({commands:commands.length,height});
 }
 function show(){active=true;canvas.hidden=false;layout();}
 function hide(){active=false;canvas.hidden=true;}
 async function navigate(target,{replace=false}={}){
  const token=++generation;onLocation?.({url:target,loading:true});
  try{const r=await fetch('/api/rte/document?url='+encodeURIComponent(target),{cache:'no-store'}),page=await r.json();if(token!==generation)return false;if(!r.ok)throw Error(page.error||'Page load failed');
   url=page.url;doc=page.dom;rules=parseCSS(page.css);scroll=0;
   if(!replace){history=history.slice(0,position+1);history.push(url);position=history.length-1;}
   show();onLocation?.({url,title:page.title,loading:false});return true;
  }catch(e){if(token===generation)onError?.(e.message);return false;}
 }
 function back(){if(position>0){position--;navigate(history[position],{replace:true});}}
 function forward(){if(position<history.length-1){position++;navigate(history[position],{replace:true});}}
 function reload(){if(url)navigate(url,{replace:true});}
 canvas.addEventListener('wheel',e=>{if(!active)return;e.preventDefault();scroll=Math.min(Math.max(0,height-canvas.clientHeight),Math.max(0,scroll+e.deltaY));paint();},{passive:false});
 canvas.addEventListener('click',e=>{if(!active)return;const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*canvas.width,y=(e.clientY-r.top)/r.height*canvas.height+scroll;const v=hits.findLast(v=>x>=v.x&&x<v.x+v.w&&y>=v.y&&y<v.y+v.h);if(v?.url)onNavigate?.(v.url);else if(v?.input){const answer=prompt('Enter value',v.input.attrs.value||'');if(answer!==null){v.input.attrs.value=answer;layout();}}});
 return {navigate,back,forward,reload,show,hide,resize:layout,get active(){return active;},get url(){return url;}};
}
