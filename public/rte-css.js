// Ryftipe CSS engine: independently parses a useful subset of CSS for Canvas layout.
const INHERIT=['color','font-family','font-size','font-weight','font-style','line-height','text-align','letter-spacing','white-space'];
export function declarations(css){
 const out={};let key='',value='',readingKey=true,depth=0,quote='';
 function save(){const k=key.trim().toLowerCase(),v=value.trim();if(k&&v)out[k]=v;key='';value='';readingKey=true;}
 for(const c of String(css)){
  if(quote){if(c===quote)quote='';(readingKey?null:null);if(readingKey)key+=c;else value+=c;continue;}
  if(c==='"'||c==="'"){quote=c;if(readingKey)key+=c;else value+=c;continue;}
  if(c==='(')depth++;if(c===')')depth=Math.max(0,depth-1);
  if(readingKey&&c===':'){readingKey=false;continue;}
  if(!readingKey&&c===';'&&depth===0){save();continue;}
  if(readingKey)key+=c;else value+=c;
 }
 save();return out;
}
export function parseCSS(input,viewportWidth=1024){
 const css=String(input||'').replace(/\/\*[\s\S]*?\*\//g,'');
 const rules=[];let order=0;
 function read(start,end){
  let i=start;
  while(i<end&&rules.length<1500){
   while(i<end&&/[\s;}]/.test(css[i]))i++;
   const headerStart=i;let quote='',paren=0,terminated=false;
   while(i<end){const c=css[i];if(quote){if(c===quote)quote='';}else if(c==='"'||c==="'")quote=c;else if(c==='(')paren++;else if(c===')')paren=Math.max(0,paren-1);else if(c==='{'&&paren===0)break;else if(c===';'&&paren===0){terminated=true;i++;break;}i++;}
   if(terminated)continue;
   if(i>=end)break;
   const header=css.slice(headerStart,i).trim(),open=i++;let depth=1;
   while(i<end&&depth){if(css[i]==='{')depth++;else if(css[i]==='}')depth--;i++;}
   const close=i-1;if(!header||close<=open)continue;
   if(/^@media\b/.test(header)){const max=header.match(/max-width\s*:\s*(\d+)px/i),min=header.match(/min-width\s*:\s*(\d+)px/i);if((!max||viewportWidth<=Number(max[1]))&&(!min||viewportWidth>=Number(min[1])))read(open+1,close);continue;}
   if(/^@(?:supports|layer|container)\b/.test(header)){read(open+1,close);continue;}
   if(header.startsWith('@'))continue;
   const props=declarations(css.slice(open+1,close));
   for(const raw of header.split(',')){
    const selector=raw.trim().replace(/:root\b/g,'html').replace(/::[\w-]+/g,'').replace(/:(?:hover|focus|active|visited|link|focus-visible|first-child|last-child)\b/g,'');
    if(!selector||selector.length>170||/[+~]/.test(selector))continue;
    rules.push({selector,props,order:order++,specificity:(selector.match(/#/g)||[]).length*100+(selector.match(/\./g)||[]).length*10+(selector.match(/(?:^|\s|>)\w/g)||[]).length});
   }
  }
 }
 read(0,css.length);return rules;
}
function matchesPart(node,part){
 if(!node||!node.tag)return false;
 part=part.trim();
 if(part==='*')return true;
 const tag=part.match(/^[a-z][\w-]*/i)?.[0];if(tag&&tag.toLowerCase()!==node.tag)return false;
 const id=part.match(/#([\w-]+)/)?.[1];if(id&&node.attrs?.id!==id)return false;
 for(const m of part.matchAll(/\.([\w-]+)/g))if(!String(node.attrs?.class||'').split(/\s+/).includes(m[1]))return false;
 const attrs=[...part.matchAll(/\[([\w-]+)(?:=["']?([^"'\]]+)["']?)?\]/g)];
 for(const m of attrs)if(!(m[1] in (node.attrs||{}))||(m[2]&&node.attrs[m[1]]!==m[2]))return false;
 return true;
}
export function matchesSelector(node,selector,ancestors=[]){
 const parts=selector.replace(/\s*>\s*/g,' > ').trim().split(/\s+/);
 let p=parts.length-1;
 if(!matchesPart(node,parts[p--]))return false;
 let cursor=ancestors.length-1;
 while(p>=0){
  if(parts[p]==='>'){p--;if(cursor<0||!matchesPart(ancestors[cursor--],parts[p--]))return false;continue;}
  let found=false;for(;cursor>=0;cursor--)if(matchesPart(ancestors[cursor],parts[p])){found=true;cursor--;break;}
  if(!found)return false;p--;
 }
 return true;
}
export function length(value,fallback=0,base=700,fontSize=16,viewport=700){
 if(value==null)return fallback;
 const s=String(value).trim().toLowerCase();if(s==='auto')return fallback;
 const m=s.match(/^(-?\d+(?:\.\d+)?)(px|em|rem|%|vw|vh|pt)?$/);
 if(!m)return fallback;
 const x=Number(m[1]);switch(m[2]){case 'em':return x*fontSize;case 'rem':return x*16;case '%':return x*base/100;case 'vw':return x*viewport/100;case 'vh':return x*viewport/100;case 'pt':return x*4/3;default:return x;}
}
function expandBox(style,prop){
 const v=style[prop];if(!v)return;
 const a=v.trim().split(/\s+/).filter(Boolean);if(!a.length)return;
 const [t,r,b,l]=[a[0],a[1]||a[0],a[2]||a[0],a[3]||a[1]||a[0]];
 for(const [side,val] of Object.entries({top:t,right:r,bottom:b,left:l}))if(style[prop+'-'+side]===undefined)style[prop+'-'+side]=val;
}
export function computeStyle(node,parent={},rules=[],ancestors=[]){
 const s={};
 for(const key of INHERIT)if(parent[key]!==undefined)s[key]=parent[key];
 for(const [k,v] of Object.entries(parent))if(k.startsWith('--'))s[k]=v;
 if(node.tag==='a')s.color='#2257ac';
 if(/^h[1-6]$/.test(node.tag)){s['font-weight']='bold';s['font-size']=({h1:'32px',h2:'26px',h3:'21px',h4:'18px',h5:'16px',h6:'14px'})[node.tag];}
 if(node.tag==='b'||node.tag==='strong')s['font-weight']='bold';
 if(node.tag==='small')s['font-size']='12px';
 if(node.tag==='body')s['background-color']='#fff';
 for(const rule of rules.filter(r=>matchesSelector(node,r.selector,ancestors)).sort((a,b)=>a.specificity-b.specificity||a.order-b.order))Object.assign(s,rule.props);
 Object.assign(s,declarations(node.attrs?.style||''));
 for(const [k,v] of Object.entries(s))if(typeof v==='string'&&v.includes('var('))s[k]=v.replace(/var\((--[\w-]+)(?:,\s*([^()]+))?\)/g,(_,key,fallback)=>s[key]||fallback||'initial');
 expandBox(s,'margin');expandBox(s,'padding');
 if(s.background&&!s['background-color']&&/^(#[0-9a-f]{3,8}|rgba?\([^)]+\)|transparent)$/i.test(s.background))s['background-color']=s.background;
 return s;
}
