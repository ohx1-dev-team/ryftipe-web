import {computeStyle,length as cssLength} from './rte-css.js';
import {cssPixels,gapPixels,gridColumns,distributeTracks,trackPositions} from './rte-tracks.js';
import {mediaSource,mediaCandidates} from './rte-media.js';

// RTE block/inline layout engine. Produces deterministic draw commands; canvas paints them.
const BLOCK=new Set('html body main section article nav header footer div p h1 h2 h3 h4 h5 h6 ul ol li blockquote pre form figure figcaption table tr td th details summary address'.split(' '));
const OMIT=new Set('head meta link title script style noscript template'.split(' '));
const DEFAULT={color:'#202838','font-size':'16px','font-weight':'normal','font-family':'Arial','text-align':'left','line-height':'normal'};
const READER_CSS='body{font-family:Arial,sans-serif;color:#202838;margin:0;background-color:#f1f3f8}body>div,body>main,body>article{max-width:720px;margin:48px auto;padding:32px;background-color:#fff;border-radius:12px}h1{font-size:30px}p{line-height:1.55}a{color:#315aa9}';
const measure=(ctx,text,font)=>{ctx.font=font;return ctx.measureText(text).width;};
export function createLayoutCommands({document:root,rules,width,ctx,url,onImage,readerMode=false}){
 const commands=[],hits=[];let count=0;
 width=Math.max(320,Math.round(width));
 const viewport=Math.max(320,width);
 const num=(v,fallback=0,base=width,size=16)=>cssLength(v,fallback,base,size,viewport);
 function fontStyle(s){
  const size=Math.max(9,Math.min(64,num(s['font-size'],16,16,16)));
  const family=/monospace/.test(s['font-family']||'')?'monospace':'Arial, sans-serif';
  const weight=s['font-weight']==='bold'||Number(s['font-weight'])>=600?'bold ':'';
  const italic=s['font-style']==='italic'?'italic ':'';
  const declaredLine=String(s['line-height']||'').trim();
  const lineHeight=/^(?:\d+(?:\.\d+)?)$/.test(declaredLine)?Number(declaredLine)*size:num(declaredLine,size*1.35,size,size);
  return {value:italic+weight+size+'px '+family,size,line:Math.max(size*1.1,lineHeight)};
 }
 function absolute(raw){try{const target=new URL(raw,url);return ['http:','https:'].includes(target.protocol)?target.href:null;}catch{return null;}}
 function inlineSegments(node,parent,ancestors,href,listenerId,out){
  if(++count>12000)return;
  if(Object.hasOwn(node,'text')){out.push({text:String(node.text),style:parent,href,nodeId:listenerId});return;}
  if(OMIT.has(node.tag))return;
  const s=computeStyle(node,parent,rules,ancestors);
  if(s.display==='none'||s.visibility==='hidden')return;
  if(node.tag==='br'){out.push({br:true});return;}
  const link=node.tag==='a'?absolute(node.attrs?.href||'')||href:href;
  const id=Number.isFinite(node.rteId)?node.rteId:listenerId;
  for(const child of node.children||[])inlineSegments(child,s,[...ancestors,node],link,id,out);
 }
 function paintLines(segments,x,y,w,alignment='left'){
  const lines=[];let line=[],cursor=0,lineHeight=0;
  const flush=()=>{if(line.length){lines.push({items:line,width:cursor,height:lineHeight||20});line=[];cursor=0;lineHeight=0;}};
  for(const part of segments){
   if(part.br){flush();lines.push({items:[],width:0,height:20});continue;}
   const f=fontStyle(part.style),tokens=part.text.replace(/\s+/g,' ').split(/(\s+)/);
   for(let token of tokens){
    if(!token)continue;
    if(!line.length&&!token.trim())continue;
    let size=measure(ctx,token,f.value);
    if(cursor+size>w&&line.length){flush();if(!token.trim())continue;}
    if(size>w){
     // Break long non-whitespace runs instead of overflowing the viewport.
     let fragment='';
     for(const char of token){
      if(measure(ctx,fragment+char,f.value)>w&&fragment){
       const fw=measure(ctx,fragment,f.value);
       line.push({token:fragment,x:cursor,width:fw,style:part.style,font:f,href:part.href,nodeId:part.nodeId});
       cursor+=fw;lineHeight=Math.max(lineHeight,f.line);flush();fragment='';
      }
      fragment+=char;
     }
     token=fragment;size=measure(ctx,token,f.value);
    }
    if(token){
     line.push({token,x:cursor,width:size,style:part.style,font:f,href:part.href,nodeId:part.nodeId});
     cursor+=size;lineHeight=Math.max(lineHeight,f.line);
    }
   }
  }
  flush();let cursorY=y;
  for(const item of lines){
   const align=alignment==='center'?(w-item.width)/2:alignment==='right'?(w-item.width):0;
   for(const part of item.items){
    if(!part.token.trim())continue;
    const px=x+Math.max(0,align)+part.x;
    commands.push({kind:'text',text:part.token,x:px,y:cursorY+(item.height-part.font.line)/2,h:part.font.line,font:part.font.value,color:part.style.color||DEFAULT.color,underline:part.style['text-decoration']==='underline'||part.style['text-decoration-line']==='underline'});
    if(part.href)hits.push({x:px,y:cursorY,w:part.width,h:item.height,url:part.href,nodeId:part.nodeId});
   }
   cursorY+=item.height;
  }
  return cursorY;
 }
 function paintNode(n,parent,x,y,w,ancestors=[],depth=0,link=null,nodeId=null,formNode=null){
  if(++count>12000||depth>65)return y;
  if(Object.hasOwn(n,'text'))return paintLines([{text:n.text,style:parent,href:link,nodeId}],x,y,w,parent['text-align']);
  if(OMIT.has(n.tag))return y;
  const s=computeStyle(n,parent,rules,ancestors);
  if(s.display==='none'||s.visibility==='hidden')return y;
  if(Number.isFinite(n.rteId))nodeId=n.rteId;
  if(n.tag==='form')formNode=n;
  const fs=fontStyle(s).size;
  const margin=num(s.margin,0,w,fs),pad=num(s.padding,0,w,fs);
  const mt=num(s['margin-top'],margin,w,fs),mb=num(s['margin-bottom'],margin,w,fs);
  const pl=num(s['padding-left'],pad,w,fs),pr=num(s['padding-right'],pad,w,fs);
  const pt=num(s['padding-top'],pad,w,fs),pb=num(s['padding-bottom'],pad,w,fs);
  const ml=num(s['margin-left'],margin,w,fs),mr=num(s['margin-right'],margin,w,fs);
  const maxWidth=s['max-width']?num(s['max-width'],w,w,fs):w;
  const specified=s.width?num(s.width,w,w,fs):w;
  const inside=Math.max(30,Math.min(w-pl-pr,Math.min(specified,maxWidth)-pl-pr));
  const centered=s['margin-left']==='auto'&&s['margin-right']==='auto';
  const left=x+(centered?Math.max(0,(w-inside-pl-pr)/2):ml);
  const boxY=y+mt;let cursorY=boxY+pt;
  const background=s['background-color']||null;
  const borderMatch=String(s.border||'').match(/([\d.]+)px\s+(?:solid|dashed)\s+([^\s]+)/);
  const borderWidth=Math.max(0,Math.min(12,num(s['border-width'],borderMatch?Number(borderMatch[1]):0,w,fs)));
  const borderColor=s['border-color']||borderMatch?.[2]||'#cbd5e1';
  const radius=Math.max(0,Math.min(30,num(s['border-radius'],0,w,fs)));
  const bg=background&&background!=='transparent'?{kind:'rect',x:left,y:boxY,w:inside+pl+pr,h:0,color:background,radius}:null;
  const border=borderWidth?{kind:'border',x:left,y:boxY,w:inside+pl+pr,h:0,color:borderColor,lineWidth:borderWidth,radius}:null;
  if(bg)commands.push(bg);
  const gradient=s['background-gradient']?{kind:'gradient',x:left,y:boxY,w:inside+pl+pr,h:0,gradient:s['background-gradient']}:null;
  if(gradient)commands.push(gradient);
  if(border)commands.push(border);
  if(n.tag==='br')return cursorY+fs*1.3;
  if(n.tag==='hr'){commands.push({kind:'rect',x:left,y:cursorY,w:inside,h:1,color:'#c6cfdd'});return cursorY+15+mb;}
  if(n.tag==='video'||n.tag==='audio'){
   const mediaURL=mediaSource(n,url),candidates=mediaCandidates(n,url);
   const mw=n.tag==='video'?640:320;
   const mediaWidth=Math.min(inside,Math.max(80,num(n.attrs?.width||s.width,mw,inside,fs)));
   const mediaHeight=n.tag==='video'?Math.min(900,Math.max(45,num(n.attrs?.height||s.height,mediaWidth*9/16,inside,fs))):Math.max(45,Math.min(70,num(n.attrs?.height||s.height,54,inside,fs)));
   if(mediaURL)commands.push({kind:'media',tag:n.tag,url:mediaURL,candidates,attrs:n.attrs||{},mediaId:n.rteId??'media-'+count,x:left+pl,y:cursorY,w:mediaWidth,h:mediaHeight});
   else commands.push({kind:'rect',x:left+pl,y:cursorY,w:mediaWidth,h:mediaHeight,color:'#111827'});
   return cursorY+mediaHeight+pb+mb;
  }
  if(n.tag==='img'){
   const src=absolute(n.attrs?.src||'');
   const imageWidth=Math.min(inside,Math.max(20,num(n.attrs?.width||s.width,240,inside,fs)));
   const imageHeight=Math.min(600,Math.max(20,num(n.attrs?.height||s.height,140,inside,fs)));
   if(src){commands.push({kind:'image',url:src,x:left+pl,y:cursorY,w:imageWidth,h:imageHeight});onImage?.(src);}
   return cursorY+imageHeight+pb+mb;
  }
  if(n.tag==='input'||n.tag==='textarea'||n.tag==='button'){
   const inputW=Math.min(inside,360),label=n.attrs?.placeholder||n.attrs?.value||(n.tag==='button'?'Submit':'Text input');
   commands.push({kind:'rect',x:left+pl,y:cursorY,w:inputW,h:36,color:'#e5ebf4'});
   paintLines([{text:label,style:{...s,color:'#31435c','font-size':'14px'}}],left+pl+8,cursorY+7,inputW-16);
   hits.push({x:left+pl,y:cursorY,w:inputW,h:36,input:n.tag==='input'||n.tag==='textarea'?n:null,submit:n.tag==='button'?n:null,form:formNode,nodeId});
   return cursorY+44+pb+mb;
  }
  if(n.tag==='li')commands.push({kind:'text',text:'•',x:left+pl-14,y:cursorY,h:fs*1.3,font:fs+'px Arial',color:s.color||DEFAULT.color});
  // Simple flex/grid row layout for navigation bars, cards and responsive columns.
  // Rows do not yet support complete min-content, wrapping, align-content or subgrid.
  const children=(n.children||[]).filter(child=>Object.hasOwn(child,'text')||!OMIT.has(child.tag));
  if((s.display==='flex'||s.display==='inline-flex'||s.display==='grid')&&children.length){
   const nonText=children.filter(child=>!Object.hasOwn(child,'text'));
   if(nonText.length&&nonText.length===children.length&&s['flex-direction']!=='column'){
    const gap=gapPixels(s,inside,fs);
    const grid=s.display==='grid';
    const template=s['grid-template-columns']||'1fr 1fr';
    const columns=grid?gridColumns(template,Math.max(50,inside-gap)):null;
    const childStyles=nonText.map(child=>computeStyle(child,s,rules,[...ancestors,n]));
    const basis=childStyles.map(st=>cssPixels(st['flex-basis']||st.width,inside,fs));
    const growth=childStyles.map(st=>Number(st['flex-grow']||0));
    const tracks=grid?columns:distributeTracks(nonText.length,inside,{display:'flex',gap,widths:basis,grow:growth});
    const offsets=trackPositions(tracks,gap);
    let rowTop=cursorY,rowBottom=cursorY;
    for(let i=0;i<nonText.length;i++){
     if(grid&&i>0&&i%tracks.length===0){rowTop=rowBottom;}
     const col=grid?i%tracks.length:i;
     const child=nonText[i],st=childStyles[i];
     const leftOffset=offsets[col];
     const childWidth=tracks[col];
     const cy=paintNode(child,s,left+pl+leftOffset,rowTop,childWidth,[...ancestors,n],depth+1,link,nodeId,formNode);
     rowBottom=Math.max(rowBottom,cy);
    }
    cursorY=rowBottom+pb;
    if(bg)bg.h=Math.max(1,cursorY-boxY);
    if(gradient)gradient.h=Math.max(1,cursorY-boxY);
    if(border)border.h=Math.max(1,cursorY-boxY);
    return cursorY+mb;
   }
  }
  // Consecutive inline children share the same line box and wrap together.
  let inline=[];
  const flush=()=>{if(inline.length){cursorY=paintLines(inline,left+pl,cursorY,inside,s['text-align']);inline=[];}};
  for(const child of n.children||[]){
   if(Object.hasOwn(child,'text')){inline.push({text:child.text,style:s,href:link,nodeId});continue;}
   if(OMIT.has(child.tag))continue;
   const style=computeStyle(child,s,rules,[...ancestors,n]);
   const childBlock=BLOCK.has(child.tag)||['img','video','audio','input','textarea','button','hr'].includes(child.tag)||style.display==='block'||style.display==='flex'||style.display==='grid';
   if(childBlock){
    flush();
    cursorY=paintNode(child,s,left+pl,cursorY,inside,[...ancestors,n],depth+1,link,nodeId,formNode);
   }else inlineSegments(child,s,[...ancestors,n],link,nodeId,inline);
  }
  flush();
  cursorY+=pb;
  if(bg)bg.h=Math.max(1,cursorY-boxY);
  if(gradient)gradient.h=Math.max(1,cursorY-boxY);
  if(border)border.h=Math.max(1,cursorY-boxY);
  return cursorY+mb;
 }
 // Base presentation: normal user-agent defaults are intentionally conservative.
 let document=root;
 if(readerMode){
  // Unstyled pages are formatted as readable documents, without changing their content.
  const body=(function find(n){if(n?.tag==='body')return n;for(const child of n?.children||[]){const value=find(child);if(value)return value;}return null;})(document);
  if(body&&!body.children?.some(x=>x.tag==='div'||x.tag==='main'||x.tag==='article')){
   body.children=[{tag:'main',attrs:{},children:body.children||[]}];
  }
 }
 const rootStyle={...DEFAULT};
 const height=paintNode(document,rootStyle,0,0,width,[],0)+18;
 const find=(node,name)=>{if(node?.tag===name)return node;for(const child of node?.children||[]){const a=find(child,name);if(a)return a;}return null;};
 const html=find(document,'html'),body=find(document,'body');
 const hs=html?computeStyle(html,rootStyle,rules,[document]):rootStyle;
 const bs=body?computeStyle(body,hs,rules,[document,html].filter(Boolean)):hs;
 const background=bs['background-color']||hs['background-color']||'#fff';
 return {commands,hits,height,background};
}
export {READER_CSS};
