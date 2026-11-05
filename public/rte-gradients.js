// Lightweight linear-gradient painter for the RTE canvas.
// This is a supported subset of CSS gradients, not full color interpolation.
export function splitCSSArguments(value){
 const result=[];let start=0,depth=0,quote='';
 const input=String(value||'');
 for(let i=0;i<input.length;i++){
  const char=input[i];
  if(quote){if(char===quote&&input[i-1]!=='\\')quote='';continue;}
  if(char==='"'||char==="'"){quote=char;continue;}
  if(char==='(')depth++;else if(char===')')depth=Math.max(0,depth-1);
  else if(char===','&&depth===0){result.push(input.slice(start,i).trim());start=i+1;}
 }
 result.push(input.slice(start).trim());
 return result.filter(Boolean);
}
export function parseLinearGradient(raw){
 const match=String(raw||'').trim().match(/^linear-gradient\(([\s\S]*)\)$/i);
 if(!match)return null;
 const parts=splitCSSArguments(match[1]);
 if(parts.length<2)return null;
 let angle=180,start=0;
 const direction=parts[0].toLowerCase();
 if(direction.startsWith('to ')){
  angle=direction.includes('right')?(direction.includes('bottom')?135:direction.includes('top')?45:90):direction.includes('left')?(direction.includes('bottom')?225:direction.includes('top')?315:270):direction.includes('top')?0:180;
  start=1;
 }else if(/^-?\d+(?:\.\d+)?deg$/.test(direction)){angle=Number.parseFloat(direction);start=1;}
 const chunks=parts.slice(start);
 if(chunks.length<2||chunks.length>16)return null;
 const stops=chunks.map((entry,index)=>{
  const m=entry.match(/^(.*?)(?:\s+(-?\d+(?:\.\d+)?)%)?$/);
  if(!m)return null;
  const color=m[1].trim(),offset=m[2]===undefined?null:Math.max(0,Math.min(1,Number(m[2])/100));
  if(!color||color.length>100)return null;
  return {color,offset,index};
 });
 if(stops.some(x=>!x))return null;
 for(let i=0;i<stops.length;i++)if(stops[i].offset===null)stops[i].offset=i/(stops.length-1);
 return {angle,stops};
}
export function paintGradient(ctx,command){
 const parsed=parseLinearGradient(command.gradient);
 if(!parsed)return false;
 const angle=parsed.angle*Math.PI/180;
 const cx=command.x+command.w/2,cy=command.y+command.h/2;
 const span=Math.abs(Math.sin(angle))*command.w+Math.abs(Math.cos(angle))*command.h;
 const dx=Math.sin(angle)*span/2,dy=-Math.cos(angle)*span/2;
 const fill=ctx.createLinearGradient(cx-dx,cy-dy,cx+dx,cy+dy);
 try{
  for(const item of parsed.stops)fill.addColorStop(item.offset,item.color);
  ctx.fillStyle=fill;
  ctx.fillRect(command.x,command.y,command.w,command.h);
  return true;
 }catch{return false;}
}
