// Bounded same-origin ES module graph. Bare, cross-origin and dynamic imports are not supported.
import {MAX_SCRIPT_CHARS,MAX_PAGE_SCRIPT_CHARS} from './rte-platform.js';
const IMPORTS=/\b(?:import\s*(?:[\w*{},\s]+\s+from\s*)?|export\s+(?:(?:\*|\{[^}]*\})\s+from\s*))(['"])([^'"\n]+)\1/g;
export function moduleImports(source){
 return [...String(source).matchAll(IMPORTS)].map(m=>m[2]);
}
export function isUnsupportedModule(source){
 return /\bimport\s*\(/.test(source)||/\bimport\.meta\b/.test(source);
}
export function resolveImport(specifier,base,origin){
 if(typeof specifier!=='string'||!specifier||(!specifier.startsWith('/')&&!specifier.startsWith('.')))return null;
 try{
  const target=new URL(specifier,base);
  if(target.origin!==origin||!['https:','http:'].includes(target.protocol)||target.username||target.password||target.href.length>2048)return null;
  return target.href;
 }catch{return null;}
}
export async function loadModuleGraph(entry,fetchSource,{maxDepth=6,maxModules=25,maxBytes=MAX_PAGE_SCRIPT_CHARS}={}){
 const origin=new URL(entry).origin,records=new Map(),visiting=new Set();
 let total=0;
 async function load(url,depth){
  if(records.has(url))return;
  if(visiting.has(url))throw Error('Cyclic module dependency');
  if(depth>maxDepth||records.size+visiting.size>=maxModules)throw Error('Module graph depth/count limit');
  visiting.add(url);
  try{
   const source=String(await fetchSource(url));
   total+=source.length;if(source.length>MAX_SCRIPT_CHARS||total>maxBytes)throw Error('Module graph byte limit');
   if(isUnsupportedModule(source))throw Error('Dynamic imports/import.meta unsupported');
   const dependencies=moduleImports(source).map(spec=>{
    const target=resolveImport(spec,url,origin);
    if(!target)throw Error('Bare and cross-origin module imports are blocked');
    return {specifier:spec,url:target};
   });
   for(const dep of dependencies)await load(dep.url,depth+1);
   records.set(url,{url,source,dependencies});
  }finally{visiting.delete(url);}
 }
 await load(entry,0);
 return {entry,modules:[...records.values()],bytes:total};
}
