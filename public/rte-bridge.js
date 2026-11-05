// RTE event protocol shared by canvas and the isolated DOM.
// Only primitives cross the boundary. Site scripts never execute in the privileged UI.
export const RTE_EVENTS=Object.freeze(['click','input','change','submit','focus','blur','keydown','keyup']);
export function normalizeRTEEvent(value){
 if(!value||typeof value!=='object'||!RTE_EVENTS.includes(value.event))return null;
 const id=Number(value.id);
 if(!Number.isSafeInteger(id)||id<1||id>1000000)return null;
 const result={event:value.event,id};
 if(typeof value.value==='string')result.value=value.value.slice(0,2000);
 if(typeof value.key==='string')result.key=value.key.slice(0,24);
 if(value.checked===true||value.checked===false)result.checked=value.checked;
 return result;
}
export function normalizeRTEBridgeRequest(input,method='GET'){
 const verb=String(method).toUpperCase();
 if(!['GET','HEAD'].includes(verb))return null;
 if(typeof input!=='string'||input.length>2048)return null;
 return {method:verb,url:input};
}
export function normalizeRTELocation(url){
 try{
  const parsed=new URL(url);
  if(!['http:','https:'].includes(parsed.protocol))return null;
  return {href:parsed.href,origin:parsed.origin,protocol:parsed.protocol,host:parsed.host,hostname:parsed.hostname,pathname:parsed.pathname,search:parsed.search,hash:parsed.hash};
 }catch{return null;}
}
