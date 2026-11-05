// RTE forms subset. Supports user-initiated GET navigation, not POST or uploads.
const FORM_CONTROLS=new Set(['input','textarea','select','button']);
export function controlsWithin(node,out=[]){
 if(!node||typeof node!=='object')return out;
 if(FORM_CONTROLS.has(node.tag))out.push(node);
 for(const child of node.children||[])if(child&&typeof child==='object')controlsWithin(child,out);
 return out;
}
export function extractText(node){
 if(!node)return '';
 if(Object.hasOwn(node,'text'))return String(node.text);
 return (node.children||[]).map(extractText).join('');
}
export function formFields(form,submitter){
 const fields=[];
 for(const node of controlsWithin(form)){
  if(!node.attrs?.name)continue;
  const type=String(node.attrs.type||'text').toLowerCase();
  if(type==='file'||type==='password'&&node.attrs.value===undefined)continue;
  if(['button','reset'].includes(type))continue;
  if(type==='submit'&&node!==submitter)continue;
  if(['checkbox','radio'].includes(type)&&!Object.hasOwn(node.attrs,'checked'))continue;
  if(node.attrs.disabled!==undefined)continue;
  let value=node.attrs.value;
  if(node.tag==='textarea')value=value??extractText(node);
  if(node.tag==='select'){
   const options=(node.children||[]).filter(c=>c.tag==='option');
   const selected=options.find(c=>c.attrs?.selected!==undefined)||options[0];
   value=value??selected?.attrs?.value??extractText(selected);
  }
  fields.push([String(node.attrs.name),String(value??(['checkbox','radio'].includes(type)?'on':''))]);
 }
 return fields;
}
export function getFormURL(base,form,submitter){
 const method=String(form?.attrs?.method||'get').toLowerCase();
 if(method!=='get')throw Error('RTE currently supports GET forms only. POST is not implemented.');
 const action=String(submitter?.attrs?.formaction||form?.attrs?.action||base);
 const url=new URL(action,base);
 if(!['https:','http:'].includes(url.protocol))throw Error('Unsupported form destination');
 for(const [name,value] of formFields(form,submitter))url.searchParams.append(name,value);
 return url.href;
}
