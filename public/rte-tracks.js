// Experimental RTE track sizing. Flexbox/Grid subset: no wrapping, intrinsic sizing or subgrid.
// Pure functions allow deterministic tests across viewport sizes.
export function cssPixels(value,base=0,font=16){
 if(value==null)return null;
 const s=String(value).trim();
 const m=/^(-?\d+(?:\.\d+)?)(px|rem|em|%)?$/.exec(s);
 if(!m)return null;
 const n=Number(m[1]);
 return m[2]==='%'?n*base/100:m[2]==='em'?n*font:m[2]==='rem'?n*16:n;
}
export function gapPixels(style,base=0,font=16){
 return Math.max(0,cssPixels(style['column-gap']||style.gap||'0',base,font)||0);
}
export function gridColumns(template,available){
 const expression=String(template||'').trim().replace(/\s+/g,' ');
 const repeat=expression.match(/^repeat\(\s*(\d+)\s*,\s*(.+)\)$/);
 let tracks=repeat?Array(Math.min(8,Math.max(1,Number(repeat[1])))).fill(repeat[2]):expression.split(/\s+(?![^()]*\))/).filter(Boolean);
 if(!tracks.length)tracks=['1fr'];
 tracks=tracks.slice(0,8);
 const fixed=tracks.map(t=>cssPixels(t,available));
 const fractions=tracks.map(t=>{
  const m=t.match(/^(\d+(?:\.\d+)?)fr$/);
  return m?Number(m[1]):t.includes('minmax(')?1:0;
 });
 const fixedTotal=fixed.reduce((s,v)=>s+(v||0),0);
 const fractionSum=fractions.reduce((a,b)=>a+b,0);
 const leftover=Math.max(0,available-fixedTotal);
 return tracks.map((t,i)=>Math.max(25,fixed[i]??(fractionSum?leftover*fractions[i]/fractionSum:available/tracks.length)));
}
export function distributeTracks(count,available,{display='flex',gap=0,template='',widths=[],grow=[],shrink=[]}={}){
 if(!Number.isInteger(count)||count<1)return [];
 const gaps=Math.max(0,count-1)*Math.max(0,gap);
 const usable=Math.max(0,available-gaps);
 let columns;
 if(display==='grid'){
  const tracks=gridColumns(template,usable);
  columns=Array.from({length:count},(_,i)=>tracks[i%tracks.length]);
 }else{
  const fixed=Array.from({length:count},(_,i)=>typeof widths[i]==='number'&&Number.isFinite(widths[i])?Math.max(0,widths[i]):null);
  const total=fixed.reduce((a,b)=>a+(b||0),0),unspecified=fixed.filter(x=>x===null).length;
  const remaining=Math.max(0,usable-total);
  const baseline=fixed.map(v=>v===null?(unspecified?remaining/unspecified:0):v);
  const baselineSum=baseline.reduce((a,b)=>a+b,0);
  if(baselineSum>usable){
   const weights=baseline.map((v,i)=>v*Math.max(0,Number(shrink[i]??1)));
   const weightSum=weights.reduce((a,b)=>a+b,0);
   const excess=baselineSum-usable;
   columns=baseline.map((v,i)=>Math.max(10,v-(weightSum?excess*weights[i]/weightSum:0)));
  }else{
   const extra=Math.max(0,usable-baselineSum),growth=grow.map(x=>Math.max(0,Number(x)||0));
   const totalGrow=growth.reduce((a,b)=>a+b,0);
   columns=baseline.map((v,i)=>Math.max(10,v+(totalGrow?extra*(growth[i]||0)/totalGrow:0)));
  }
 }
 return columns.map(x=>Math.max(25,x));
}
export function trackPositions(widths,gap=0){
 const offsets=[];let x=0;
 for(const width of widths){offsets.push(x);x+=width+Math.max(0,gap);}
 return offsets;
}
