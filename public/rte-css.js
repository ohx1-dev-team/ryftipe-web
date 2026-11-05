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
export function mediaMatches(query,viewportWidth=1024,colorScheme='light'){
 const parts=String(query||'').trim().toLowerCase().split(/\s*,\s*/);
 return parts.some(part=>{
  if(/\bprint\b/.test(part)&&!/\bnot\s+print\b/.test(part))return false;
  const dark=part.match(/prefers-color-scheme\s*:\s*(dark|light)/);
  if(dark&&dark[1]!==colorScheme)return false;
  const max=part.match(/max-width\s*:\s*(\d+(?:\.\d+)?)px/);
  const min=part.match(/min-width\s*:\s*(\d+(?:\.\d+)?)px/);
  if(max&&viewportWidth>Number(max[1]))return false;
  if(min&&viewportWidth<Number(min[1]))return false;
  if(/\bnot\s+(?:all|screen)\b/.test(part))return false;
  return true;
 });
}
export function splitSelectors(header){
 const parts=[];let depth=0,brackets=0,quote='',start=0;
 const input=String(header||'');
 for(let i=0;i<input.length;i++){
  const char=input[i];
  if(quote){if(char===quote&&input[i-1]!=='\\')quote='';continue;}
  if(char==='"'||char==="'"){quote=char;continue;}
  if(char==='(')depth++;else if(char===')')depth=Math.max(0,depth-1);
  if(char==='[')brackets++;else if(char===']')brackets=Math.max(0,brackets-1);
  if(char===','&&depth===0&&brackets===0){parts.push(input.slice(start,i).trim());start=i+1;}
 }
 parts.push(input.slice(start).trim());
 return parts.filter(Boolean);
}
export function parseCSS(input,viewportWidth=1024,options={}){
 const colorScheme=options?.colorScheme==='dark'?'dark':'light';
 const css=String(input||'').replace(/\/\*[\s\S]*?\*\//g,'');
 const rules=[];let order=0;
 function read(start,end){
  let i=start;
  while(i<end&&rules.length<8000){
   while(i<end&&/[\s;}]/.test(css[i]))i++;
   const headerStart=i;let quote='',paren=0,terminated=false;
   while(i<end){const c=css[i];if(quote){if(c===quote)quote='';}else if(c==='"'||c==="'")quote=c;else if(c==='(')paren++;else if(c===')')paren=Math.max(0,paren-1);else if(c==='{'&&paren===0)break;else if(c===';'&&paren===0){terminated=true;i++;break;}i++;}
   if(terminated)continue;
   if(i>=end)break;
   const header=css.slice(headerStart,i).trim(),open=i++;let depth=1;
   while(i<end&&depth){if(css[i]==='{')depth++;else if(css[i]==='}')depth--;i++;}
   const close=i-1;if(!header||close<=open)continue;
   if(/^@media\b/.test(header)){if(mediaMatches(header.replace(/^@media\s*/i,''),viewportWidth,colorScheme))read(open+1,close);continue;}
   if(/^@(?:supports|layer|container)\b/.test(header)){read(open+1,close);continue;}
   if(header.startsWith('@'))continue;
   const props=declarations(css.slice(open+1,close));
   for(const raw of splitSelectors(header)){
    if(/::(?:before|after|marker)|:(?:hover|focus|active|focus-visible|first-child|last-child|nth-child|has)\b/i.test(raw))continue;
    const selector=raw.trim().replace(/:root\b/g,'html').replace(/::[\w-]+/g,'').replace(/:(?:visited|link)\b/g,'');
    if(!selector||selector.length>240||/[+~]/.test(selector))continue;
    rules.push({selector,props,order:order++,specificity:(selector.match(/#/g)||[]).length*100+(selector.match(/\./g)||[]).length*10+(selector.match(/(?:^|\s|>)\w/g)||[]).length});
   }
  }
 }
 read(0,css.length);
 const index={any:[],tag:new Map(),class:new Map(),id:new Map()};
 for(const rule of rules){
  const tail=rule.selector.trim().split(/\s*>\s*|\s+/).at(-1)?.replace(/:(?:not|is|where)\([^()]*\)/g,'');
  const id=tail?.match(/#([\w-]+)/)?.[1];
  const cls=tail?.match(/\.([\w-]+)/)?.[1];
  const tag=tail?.match(/^[a-z][\w-]*/i)?.[0]?.toLowerCase();
  let bucket=index.any;
  if(id){if(!index.id.has(id))index.id.set(id,[]);bucket=index.id.get(id);}
  else if(cls){if(!index.class.has(cls))index.class.set(cls,[]);bucket=index.class.get(cls);}
  else if(tag){if(!index.tag.has(tag))index.tag.set(tag,[]);bucket=index.tag.get(tag);}
  bucket.push(rule);
 }
 Object.defineProperty(rules,'rteIndex',{value:index});
 return rules;
}
function matchesPart(node,part){
 if(!node||!node.tag)return false;
 part=part.trim();
 for(const match of [...part.matchAll(/:(not|is|where)\(([^()]*)\)/g)]){
  const choices=match[2].split(',').map(x=>x.trim()).filter(Boolean);
  const accepted=choices.some(x=>matchesPart(node,x));
  if(match[1]==='not'?accepted:!accepted)return false;
 }
 part=part.replace(/:(?:not|is|where)\([^()]*\)/g,'');
 if(part==='*'||part==='')return true;
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
 const idx=rules.rteIndex;
 let candidates=rules;
 if(idx){
  const classes=String(node.attrs?.class||'').split(/\s+/).filter(Boolean);
  candidates=[...idx.any,...(idx.tag.get(node.tag)||[]),...(idx.id.get(node.attrs?.id)||[])];
  for(const cls of classes)candidates.push(...(idx.class.get(cls)||[]));
  if(candidates.length>1)candidates=[...new Set(candidates)];
 }
 for(const rule of candidates.filter(r=>matchesSelector(node,r.selector,ancestors)).sort((a,b)=>a.specificity-b.specificity||a.order-b.order))Object.assign(s,rule.props);
 Object.assign(s,declarations(node.attrs?.style||''));
 for(const [k,v] of Object.entries(s))if(typeof v==='string'&&v.includes('var('))s[k]=v.replace(/var\((--[\w-]+)(?:,\s*([^()]+))?\)/g,(_,key,fallback)=>s[key]||fallback||'initial');
 expandBox(s,'margin');expandBox(s,'padding');
 if(s.background&&!s['background-color']&&/^(#[0-9a-f]{3,8}|rgba?\([^)]+\)|transparent)$/i.test(s.background))s['background-color']=s.background;
 if(s.background&&/^(linear-gradient|radial-gradient)\(/i.test(s.background))s['background-image']=s.background;
 if(s['background-image']&&/gradient\(/i.test(s['background-image']))s['background-gradient']=s['background-image'];
 if(s['box-sizing']==='border-box')s['rte-border-box']=true;
 return s;
}
