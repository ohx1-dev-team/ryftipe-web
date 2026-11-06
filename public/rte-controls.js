// Intrinsic control sizing for RTE's canvas renderer.
import {length as cssLength} from './rte-css.js';
export function controlLabel(node){
 const a=node?.attrs||{};
 if(node?.tag==='input')return String(a.value??a.placeholder??(a.type==='checkbox'?'□':a.type==='radio'?'○':'')).slice(0,1000);
 if(node?.tag==='textarea')return String(a.value??flattenText(node)??a.placeholder??'').slice(0,1000);
 return flattenText(node).trim()||String(a.value||'Submit');
}
export function flattenText(node){
 if(!node)return '';
 if(typeof node.text==='string')return node.text;
 return (node.children||[]).map(flattenText).join('');
}
export function controlGeometry(node,style,available,measure){
 const font=Math.max(10,Math.min(48,cssLength(style['font-size'],16,16,16)));
 const padX=cssLength(style['padding-left'],cssLength(style.padding,10,available,font),available,font);
 const padY=cssLength(style['padding-top'],cssLength(style.padding,8,available,font),available,font);
 const label=controlLabel(node);
 const intrinsic=Math.max(24,measure(label,font)+padX*2+4);
 const explicit=style.width?cssLength(style.width,intrinsic,available,font):intrinsic;
 const width=Math.max(24,Math.min(available,explicit));
 const h=style.height?cssLength(style.height,Math.max(30,font*1.4+padY*2),available,font):Math.max(30,font*1.4+padY*2);
 return {label,width,height:Math.max(24,Math.min(400,h)),padX:Math.max(2,padX),padY:Math.max(2,padY),font};
}
