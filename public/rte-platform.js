// URL and request policy shared by RTE's sandbox data bridge.
// Read-only, same-origin HTTP(S), bounded resources; never forwards credentials.
export const MAX_SCRIPT_CHARS=900000;
export const MAX_PAGE_SCRIPT_CHARS=2400000;
export function allowedPageRequest(pageURL, raw, method='GET'){
 if(String(method).toUpperCase()!=='GET')return null;
 let page,target;
 try{page=new URL(pageURL);target=new URL(raw,page);}catch{return null;}
 if(!['https:','http:'].includes(page.protocol)||!['https:','http:'].includes(target.protocol))return null;
 if(target.username||target.password||target.origin!==page.origin)return null;
 if(target.href.length>2000)return null;
 return target.href;
}
export function classifyScript(attrs={}){
 const type=String(attrs.type||'').trim().toLowerCase();
 if(!type||type==='text/javascript'||type==='application/javascript'||type==='text/ecmascript')return 'classic';
 if(type==='module')return 'module';
 return null;
}
export function containsModuleImports(source){
 const text=String(source||'');
 // Conservative: reject module syntax requiring module resolution, including dynamic import.
 return /(^|[\n;]\s*)import\s*(?:[\w*{]|['"])|(^|[\n;]\s*)export\s+.*\s+from\s*['"]|\bimport\s*\(/m.test(text);
}
export function limitScriptEntries(list,max=20){
 if(!Array.isArray(list))return [];
 return list.filter(x=>x&&['classic','module'].includes(x.kind)&&(typeof x.src==='string'||typeof x.inline==='string'))
 .filter(x=>!x.inline||x.inline.length<=MAX_SCRIPT_CHARS)
 .slice(0,max).map(x=>({kind:x.kind,...(x.src?{src:String(x.src).slice(0,2048)}:{inline:String(x.inline)})}));
}
