// Site-scoped RTE storage: bounded data in the host browser, isolated by website origin.
// The sandbox receives only the current site's values, never Ryftipe's own preferences.
export const STORAGE_PREFIX='ryftipe.site-storage:';
export function siteStorageKey(url){
 try{
  const parsed=new URL(url);
  if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)return null;
  return STORAGE_PREFIX+parsed.origin;
 }catch{return null;}
}
export function sanitizeSiteStorage(input){
 const result=Object.create(null);
 if(!input||typeof input!=='object'||Array.isArray(input))return result;
 let used=0,count=0;
 for(const [name,value] of Object.entries(input)){
  if(count>=80)break;
  if(typeof value!=='string'||name.length>128||value.length>4096||['__proto__','constructor','prototype'].includes(name))continue;
  const size=name.length+value.length;
  if(used+size>65536)break;
  result[name]=value;used+=size;count++;
 }
 return result;
}
export function readSiteStorage(storage,page){
 const key=siteStorageKey(page);if(!key)return Object.create(null);
 try{return sanitizeSiteStorage(JSON.parse(storage.getItem(key)||'{}'));}catch{return Object.create(null);}
}
export function applySiteStorageMessage(storage,page,message){
 const key=siteStorageKey(page);
 if(!key||!message||typeof message!=='object'||!['set','remove','clear'].includes(message.operation))return false;
 const values=readSiteStorage(storage,page);
 if(message.operation==='clear')for(const name of Object.keys(values))delete values[name];
 else{
  if(typeof message.key!=='string'||message.key.length>128||['__proto__','constructor','prototype'].includes(message.key))return false;
  if(message.operation==='remove')delete values[message.key];
  else{
   if(typeof message.value!=='string'||message.value.length>4096)return false;
   values[message.key]=message.value;
  }
 }
 try{storage.setItem(key,JSON.stringify(sanitizeSiteStorage(values)));return true;}catch{return false;}
}
export function clearSiteStorage(storage){
 let removed=0;
 try{for(let i=storage.length-1;i>=0;i--){const key=storage.key(i);if(key?.startsWith(STORAGE_PREFIX)){storage.removeItem(key);removed++;}}}catch{}
 return removed;
}
