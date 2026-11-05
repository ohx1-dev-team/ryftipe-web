// RTE stylesheet collector. Bounded expansion of @import, preserving import order.
// fetchCSS is injected for testability; the backend retains public URL validation.
export function cssImports(text){
 const imports=[],css=String(text||'');
 const pattern=/@import\s+(?:url\(\s*(?:"([^"]+)"|'([^']+)'|([^)\s]+))\s*\)|"([^"]+)"|'([^']+)')\s*([^;]*);/gi;
 for(const m of css.matchAll(pattern)){
  const href=[m[1],m[2],m[3],m[4],m[5]].find(Boolean);
  if(href)imports.push({href,media:String(m[6]||'').trim(),index:m.index,length:m[0].length});
 }
 return imports;
}
export function resolveStylesheetURL(raw,base){
 try{
  const u=new URL(raw,base);
  if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.href.length>2048)return null;
  return u.href;
 }catch{return null;}
}
export function rewriteCSSURLs(input,base){
 return String(input||'').replace(/url\(\s*(["']?)([^)'"]+)\1\s*\)/gi,(whole,quote,raw)=>{
  const value=String(raw).trim();
  if(/^data:|^blob:|^#/.test(value))return whole;
  const absolute=resolveStylesheetURL(value,base);
  return absolute?'url("'+absolute.replace(/"/g,'%22')+'")':whole;
 });
}
export async function collectStylesheets({linked=[],inline='',base,fetchCSS,maxSheets=16,maxDepth=3,maxCharacters=420000}){
 const visited=new Set(),diagnostics={requested:0,loaded:0,failed:0,imports:0,truncated:false};

 async function expand(source,location,depth){
  if(depth>maxDepth){diagnostics.truncated=true;return '';}
  const imports=cssImports(source);
  let cursor=0,out='';
  for(const item of imports){
   out+=source.slice(cursor,item.index);
   cursor=item.index+item.length;
   diagnostics.imports++;
   const target=resolveStylesheetURL(item.href,location);
   if(!target||visited.has(target)||diagnostics.requested>=maxSheets){diagnostics.truncated=true;continue;}
   visited.add(target);diagnostics.requested++;
   try{
    const imported=String(await fetchCSS(target));
    diagnostics.loaded++;
    const processed=await expand(imported,target,depth+1);
    if(!item.media||item.media==='all')out+=processed;
    else if(/^(screen|print|only screen|not print|\(|screen and)/i.test(item.media))out+='@media '+item.media+' {'+processed+'}\n';
   }catch{diagnostics.failed++;}
  }
  out+=source.slice(cursor);
  return rewriteCSSURLs(out.slice(0,maxCharacters),location).slice(0,maxCharacters);
 }
 let combined='';
 for(const href of linked){
  const target=resolveStylesheetURL(href,base);
  if(!target||visited.has(target)||diagnostics.requested>=maxSheets)continue;
  visited.add(target);diagnostics.requested++;
  try{const css=String(await fetchCSS(target));diagnostics.loaded++;combined+=await expand(css,target,0)+'\n';if(combined.length>=maxCharacters){diagnostics.truncated=true;break;}}
  catch{diagnostics.failed++;}
 }
 if(inline&&combined.length<maxCharacters)combined+=await expand(String(inline),base,0);
 if(combined.length>maxCharacters)diagnostics.truncated=true;
 return {css:combined.slice(0,maxCharacters),diagnostics};
}
