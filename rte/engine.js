import dns from 'node:dns/promises';
import net from 'node:net';
import {classifyScript,limitScriptEntries,MAX_SCRIPT_CHARS} from '../public/rte-platform.js';
import {collectStylesheets} from './stylesheets.js';
// RTE's bounded HTML tree builder. It produces a lightweight DOM snapshot; website
// scripts execute only in the separate, unprivileged RTE sandbox.
const VOID=new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
const DROP_CONTENT=new Set(['script','style','noscript','template','iframe','object']);
const DROP_ELEMENT=new Set(['embed']);
const SVG_ATTR_NAMES={viewbox:'viewBox',preserveaspectratio:'preserveAspectRatio',gradientunits:'gradientUnits',gradienttransform:'gradientTransform',patternunits:'patternUnits',patterncontentunits:'patternContentUnits',clippathunits:'clipPathUnits',markerwidth:'markerWidth',markerheight:'markerHeight',refx:'refX',refy:'refY',strokewidth:'strokeWidth',strokelinecap:'strokeLinecap',strokelinejoin:'strokeLinejoin',fillrule:'fillRule',cliprule:'clipRule',fontfamily:'fontFamily',fontsize:'fontSize',textanchor:'textAnchor'};
const BLOCK_START=new Set('address article aside blockquote div dl fieldset footer form h1 h2 h3 h4 h5 h6 header hr main nav ol p pre section table ul'.split(' '));
const MAX_HTML_CHARS=2_000_000,MAX_NODES=12_000,MAX_DEPTH=80,MAX_TEXT=8_000;
export function entities(s){return String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);?/gi,(_,v)=>{if(v[0]==='#'){const n=v[1]?.toLowerCase()==='x'?parseInt(v.slice(2),16):parseInt(v.slice(1),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'�';}return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[v.toLowerCase()]||'&'+v+';';});}
export function attrs(s){
 const out=Object.create(null);
 for(const m of String(s).matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>\x60]+)))?/g)){
  const name=m[1].toLowerCase();
  const normalized=SVG_ATTR_NAMES[name]||name;
  if(!Object.hasOwn(out,normalized))out[normalized]=entities(m[2]??m[3]??m[4]??'');
  if(Object.keys(out).length>=80)break;
 }
 return out;
}
function tagEnd(source,start){
 let quote='';
 for(let i=start;i<source.length;i++){
  const c=source[i];
  if(quote){if(c===quote)quote='';}
  else if(c==='"'||c==="'")quote=c;
  else if(c==='>')return i+1;
 }
 return -1;
}
function popThrough(stack,tag){
 for(let i=stack.length-1;i>0;i--)if(stack[i].tag===tag){stack.length=i;return true;}
 return false;
}
function closeImplied(stack,tag){
 const top=()=>stack.at(-1)?.tag;
 if(tag==='li'&&stack.some(n=>n.tag==='li'))popThrough(stack,'li');
 if((tag==='dt'||tag==='dd')&&(top()==='dt'||top()==='dd'))stack.pop();
 if(tag==='option'&&top()==='option')stack.pop();
 if(tag==='optgroup'&&(top()==='option'||top()==='optgroup')){if(top()==='option')stack.pop();if(top()==='optgroup')stack.pop();}
 if(tag==='tr'&&stack.some(n=>n.tag==='tr'))popThrough(stack,'tr');
 if((tag==='td'||tag==='th')&&(top()==='td'||top()==='th'))stack.pop();
 if(tag==='th'&&top()==='td'||tag==='td'&&top()==='th')stack.pop();
 if(tag==='p'||BLOCK_START.has(tag)){if(stack.some(n=>n.tag==='p'))popThrough(stack,'p');}
 if(tag==='a'&&stack.some(n=>n.tag==='a'))popThrough(stack,'a');
 if(tag==='form'&&stack.some(n=>n.tag==='form'))popThrough(stack,'form');
}
function appendText(parent,value){
 if(!value)return;
 const last=parent.children.at(-1);
 if(last&&Object.hasOwn(last,'text'))last.text=(last.text+value).slice(0,MAX_TEXT);
 else if(parent.children.length<MAX_NODES)parent.children.push({text:value.slice(0,MAX_TEXT)});
}
export function parseHTML(input){
 const html=String(input??'').slice(0,MAX_HTML_CHARS);
 const root={tag:'document',attrs:{},children:[]},stack=[root];
 let cursor=0,nodes=0;
 while(cursor<html.length&&nodes<MAX_NODES){
  const parent=stack.at(-1),lt=html.indexOf('<',cursor);
  if(lt<0){appendText(parent,entities(html.slice(cursor)));break;}
  if(lt>cursor)appendText(parent,entities(html.slice(cursor,lt)));
  cursor=lt;
  if(html.startsWith('<!--',cursor)){
   const end=html.indexOf('-->',cursor+4);cursor=end<0?html.length:end+3;continue;
  }
  if(/^<!|^<\?/.test(html.slice(cursor,cursor+2))){
   const end=tagEnd(html,cursor+2);cursor=end<0?html.length:end;continue;
  }
  const end=tagEnd(html,cursor+1);
  if(end<0){appendText(parent,'<');cursor++;continue;}
  const token=html.slice(cursor,end);cursor=end;
  const closing=token.match(/^<\/\s*([a-zA-Z][\w:-]*)/);
  if(closing){popThrough(stack,closing[1].toLowerCase());continue;}
  const opening=token.match(/^<\s*([a-zA-Z][\w:-]*)/);
  if(!opening){appendText(stack.at(-1),entities(token));continue;}
  const tag=opening[1].toLowerCase();
  if(DROP_CONTENT.has(tag)){
   const close=new RegExp('</\\s*'+tag+'\\s*>','ig');close.lastIndex=cursor;
   const match=close.exec(html);cursor=match?close.lastIndex:html.length;continue;
  }
  if(DROP_ELEMENT.has(tag))continue;
  closeImplied(stack,tag);
  const node={tag,attrs:attrs(token.slice(opening[0].length).replace(/\/?>$/,'')),children:[]};
  stack.at(-1).children.push(node);nodes++;
  if((tag==='textarea'||tag==='title')&&!/\/\s*>$/.test(token)){
   const close=new RegExp('</\\s*'+tag+'\\s*>','ig');close.lastIndex=cursor;
   const match=close.exec(html),stop=match?match.index:html.length;
   appendText(node,entities(html.slice(cursor,stop)));cursor=match?close.lastIndex:html.length;continue;
  }
  if(!VOID.has(tag)&&! /\/\s*>$/.test(token)&&stack.length<MAX_DEPTH)stack.push(node);
 }
 return root;
}
export function stylesFrom(html){return {inline:[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(x=>x[1]).join('\n').slice(0,160000),links:[...html.matchAll(/<link\b([^>]+)>/gi)].map(x=>attrs(x[1])).filter(x=>(x.rel||'').toLowerCase().split(/\s+/).includes('stylesheet')&&x.href).slice(0,16).map(x=>x.href)};}
export function validateURL(raw){const u=new URL(raw);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port&&![80,443].includes(+u.port))throw Error('Only public HTTP(S) URLs');const h=u.hostname.toLowerCase();if(h==='localhost'||/\.(local|internal|test|invalid|localhost)$/.test(h))throw Error('Private hostname');return u;}
function publicIP(ip){if(net.isIP(ip)===4){const p=ip.split('.').map(Number);return !(p[0]===0||p[0]===10||p[0]===127||p[0]>=224||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&(p[1]===168||p[1]===0))||(p[0]===100&&p[1]>=64&&p[1]<=127));}if(net.isIP(ip)===6){const v=ip.toLowerCase();if(v.startsWith('::ffff:'))return publicIP(v.slice(7));return !(v==='::'||v==='::1'||v.startsWith('fc')||v.startsWith('fd')||/^fe[89ab]/.test(v)||v.startsWith('ff'));}return false;}
async function checked(raw){const u=validateURL(raw);const ips=await dns.lookup(u.hostname,{all:true});if(!ips.length||!ips.every(x=>publicIP(x.address)))throw Error('Private IP blocked');return u;}
export class UpstreamHTTPError extends Error{
 constructor(status,url){super('Website returned HTTP '+status);this.name='UpstreamHTTPError';this.upstreamStatus=status;this.site=new URL(url).hostname;}
}
export async function fetchResource(raw,kind='html'){
 for(let i=0;i<4;i++){
  const u=await checked(raw);const r=await fetch(u,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{Accept:kind==='html'?'text/html':kind==='css'?'text/css':kind==='script'?'text/javascript,application/javascript':kind==='data'?'application/json,text/plain,text/html,application/xml,*/*':'image/*','User-Agent':'RyftipeEngine/0.4'}});
  if([301,302,303,307,308].includes(r.status)){const loc=r.headers.get('location');await r.body?.cancel();if(!loc)throw Error('Invalid redirect');raw=new URL(loc,u).href;continue;}
  if(!r.ok){await r.body?.cancel();throw new UpstreamHTTPError(r.status,u.href);}
  const type=(r.headers.get('content-type')||'').toLowerCase();
  if(kind==='html'&&!/text\/html|application\/xhtml\+xml/.test(type)||kind==='css'&&!type.includes('text/css')||kind==='script'&&!/(javascript|ecmascript|text\/plain)/.test(type)||kind==='data'&&!/(?:^text\/|json|xml|javascript)/.test(type)||kind==='image'&&!/^image\/(png|jpeg|webp|gif|avif|bmp)/.test(type))throw Error('Unsupported content type');
  const limit=kind==='html'?1200000:kind==='css'?300000:kind==='script'?MAX_SCRIPT_CHARS:kind==='data'?524288:800000,reader=r.body.getReader();let len=0;const chunks=[];
  try{while(true){const {value,done}=await reader.read();if(done)break;len+=value.length;if(len>limit)throw Error('Resource too large');chunks.push(value);}}finally{reader.cancel().catch(()=>{});}
  return {url:u.href,body:Buffer.concat(chunks),type};
 }
 throw Error('Too many redirects');
}
export function scriptsFrom(html){
 const entries=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
  .map(m=>({attributes:attrs(m[1]),inline:m[2]}))
  .map(s=>({kind:classifyScript(s.attributes),src:s.attributes.src,inline:s.inline}))
  .filter(s=>s.kind&&(s.src||s.inline?.trim()));
 return limitScriptEntries(entries,80);
}
export async function loadPage(raw){
 const page=await fetchResource(raw,'html'),html=page.body.toString('utf8'),styles=stylesFrom(html);
 const resolvedBase=html.match(/<base\b[^>]*href=["']([^"']+)["']/i)?.[1];
 let base=page.url;try{if(resolvedBase)base=new URL(resolvedBase,page.url).href;}catch{}
 const stylesheetResult=await collectStylesheets({linked:styles.links,inline:styles.inline,base,fetchCSS:async url=>(await fetchResource(url,'css')).body.toString('utf8')});
 const css=stylesheetResult.css;
 const scriptCount=(html.match(/<script\b/gi)||[]).length;
 const appHints=/<(?:div|main)[^>]+(?:id|class)=["'][^"']*(?:root|app|__next|__nuxt|yt-app|ytd-app)/i.test(html);
 const heavySite=/^(?:www\.|m\.)?(?:youtube\.com|youtu\.be|google\.com|facebook\.com|instagram\.com|tiktok\.com|netflix\.com|discord\.com)$/.test(new URL(page.url).hostname);
 const dynamic=heavySite||(scriptCount>=15&&(appHints||scriptCount>=28));
 const scripts=scriptsFrom(html);
 const scriptStats={declared:scriptCount,selected:scripts.length,omitted:Math.max(0,scriptCount-scripts.length)};
 return {url:page.url,markup:html.slice(0,1800000),title:entities(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||new URL(page.url).hostname).slice(0,100),dom:parseHTML(html),css:css.slice(0,420000),stylesheets:stylesheetResult.diagnostics,scripts,scriptStats,engine:'RTE/0.20',compatibility:{javascriptRequired:dynamic,scriptCount,reason:dynamic?'This site depends on JavaScript and browser APIs that RTE does not implement.':'Experimental HTML/CSS support.'}};
}
