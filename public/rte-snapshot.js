// RTE snapshot application policy.
// Preserve the standards-parsed original HTML until isolated scripts actually change
// visible content; the limited script sandbox's initial copy omits SVG and rich markup.
export function summarizeRTEContent(root,maxNodes=8000){
 let nodes=0,text='',meaningful=0;
 const stack=[root];
 while(stack.length&&nodes<maxNodes){
  const node=stack.pop();if(!node)continue;nodes++;
  if(typeof node.text==='string'){
   const chunk=node.text.trim().replace(/\s+/g,' ').slice(0,1200);
   if(chunk){meaningful++;text+=chunk+' ';}
  }else if(Array.isArray(node.children)){
   for(let i=node.children.length-1;i>=0;i--)stack.push(node.children[i]);
  }
 }
 return {nodes,text:text.trim().slice(0,160000),textLength:text.trim().length,meaningful};
}
export function shouldReplaceRTEOriginal(original,snapshot){
 const before=summarizeRTEContent(original),after=summarizeRTEContent(snapshot);
 if(!after.textLength||after.text===before.text)return false;
 // Reject major content loss caused by an incomplete script-sandbox DOM.
 if(before.textLength>80&&after.textLength<before.textLength*.65)return false;
 // Permit a genuine text mutation (including short text like "off" -> "on").
 return after.meaningful>0&&after.textLength>=Math.min(12,before.textLength*.5);
}
