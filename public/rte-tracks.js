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
export function distributeTracks(count,available,{display='flex',gap=0,template='',widths=[],grow=[]}={}){
 if(!Number.isInteger(count)||count<1)return [];
 const gaps=Math.max(0,count-1)*Math.max(0,gap);
 const usable=Math.max(0,available-gaps);
 let columns;
 if(display==='grid'){
  const tracks=gridColumns(template,usable);
  columns=Array.from({length:count},(_,i)=>tracks[i%tracks.length]);
 }else{
  const fixed=widths.map(v=>typeof v==='number'&&Number.isFinite(v)?Math.max(0,v):null);
  const sum=fixed.reduce((a,b)=>a+(b||0),0);
  const unspecified=fixed.filter(v=>v===null).length;
  const free=Math.max(0,usable-sum);
  const growTotal=grow.reduce((a,b)=>a+Math.max(0,b||0),0);
  columns=fixed.map((v,i)=>v===null?(unspecified?free/unspecified:0):Math.max(25,v+(growTotal?free*Math.max(0,grow[i]||0)/growTotal:0)));
 }
 return columns.map(x=>Math.max(25,x));
}
export function trackPositions(widths,gap=0){
 const offsets=[];let x=0;
 for(const width of widths){offsets.push(x);x+=width+Math.max(0,gap);}
 return offsets;
}
