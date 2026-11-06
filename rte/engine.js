import dns from 'node:dns/promises';
import net from 'node:net';
import {classifyScript,limitScriptEntries} from '../public/rte-platform.js';
import {collectStylesheets} from './stylesheets.js';
// RTE tokenizer / DOM tree builder. This engine never evaluates website scripts.
const VOID=new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
export function entities(s){return String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);?/gi,(_,v)=>{if(v[0]==='#'){const n=v[1]?.toLowerCase()==='x'?parseInt(v.slice(2),16):parseInt(v.slice(1),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'�';}return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[v.toLowerCase()]||'&'+v+';';});}
export function attrs(s){const out={};for(const m of s.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)){out[m[1].toLowerCase()]=entities(m[2]??m[3]??m[4]??'');if(Object.keys(out).length>40)break;}return out;}
export function parseHTML(html){
 const root={tag:'document',attrs:{},children:[]},stack=[root];let skip=null,count=0;
 for(const m of html.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][^>]*>|[^<]+/g)){
  const token=m[0];if(token.startsWith('<!--')||token.startsWith('<!'))continue;
  if(token.startsWith('</')){const t=token.match(/^<\/([\w:-]+)/)?.[1]?.toLowerCase();if(skip===t){skip=null;continue;}if(skip)continue;for(let i=stack.length-1;i>0;i--)if(stack[i].tag===t){stack.length=i;break;}continue;}
  if(token.startsWith('<')){const m=token.match(/^<([\w:-]+)/);if(!m)continue;const tag=m[1].toLowerCase();if(skip)continue;if(['script','style','noscript','template'].includes(tag)){skip=tag;continue;}if(['iframe','object','embed','svg','canvas'].includes(tag))continue;
   const node={tag,attrs:attrs(token.slice(m[0].length).replace(/\/?>$/,'')),children:[]};stack.at(-1).children.push(node);
   if(!VOID.has(tag)&&stack.length<60)stack.push(node);
  }else if(!skip){const text=entities(token).replace(/\s+/g,' ');if(text.trim())stack.at(-1).children.push({text:text.slice(0,4000)});}
  if(++count>5000)break;
 }
 return root;
}
export function stylesFrom(html){return {inline:[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(x=>x[1]).join('\n').slice(0,160000),links:[...html.matchAll(/<link\b([^>]+)>/gi)].map(x=>attrs(x[1])).filter(x=>(x.rel||'').includes('stylesheet')&&x.href).slice(0,16).map(x=>x.href)};}
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
  const limit=kind==='html'?1200000:kind==='css'?300000:kind==='script'?160000:kind==='data'?524288:800000,reader=r.body.getReader();let len=0;const chunks=[];
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
 return limitScriptEntries(entries,20);
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
 return {url:page.url,title:entities(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||new URL(page.url).hostname).slice(0,100),dom:parseHTML(html),css:css.slice(0,420000),stylesheets:stylesheetResult.diagnostics,scripts,engine:'RTE/0.18',compatibility:{javascriptRequired:dynamic,scriptCount,reason:dynamic?'This site depends on JavaScript and browser APIs that RTE does not implement.':'Experimental HTML/CSS support.'}};
}
