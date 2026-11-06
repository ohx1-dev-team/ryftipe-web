// RTE box geometry subset: padding-box, border-box, auto margins, and max-width.
// A single coordinate convention keeps canvas rectangles and child layout aligned.
import {length as cssLength} from './rte-css.js';
export function boxGeometry(style,available,font=16){
 const calc=(v,f=0)=>cssLength(v,f,available,font,available);
 const pl=calc(style['padding-left'],calc(style.padding)),pr=calc(style['padding-right'],calc(style.padding));
 const pt=calc(style['padding-top'],calc(style.padding)),pb=calc(style['padding-bottom'],calc(style.padding));
 const leftAuto=style['margin-left']==='auto',rightAuto=style['margin-right']==='auto';
 const ml=leftAuto?0:calc(style['margin-left'],calc(style.margin)),mr=rightAuto?0:calc(style['margin-right'],calc(style.margin));
 const border=calc(style['border-width'],0);
 const availableOuter=Math.max(0,available-ml-mr);
 const explicit=style.width&&style.width!=='auto'?calc(style.width,availableOuter):null;
 const min=style['min-width']?calc(style['min-width'],0):0;
 const max=style['max-width']?calc(style['max-width'],availableOuter):Infinity;
 const borderBox=style['box-sizing']==='border-box';
 let outer=explicit===null?availableOuter:(borderBox?explicit:explicit+pl+pr+border*2);
 outer=Math.max(min,Math.min(max,outer,availableOuter));
 const content=Math.max(1,outer-pl-pr-border*2);
 const x=leftAuto&&rightAuto?Math.max(0,(available-outer)/2):ml;
 return {outer,content,offsetX:x,pl,pr,pt,pb,ml,mr,border};
}
