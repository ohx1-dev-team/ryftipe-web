const MAX_BOOKMARKS=200;
const decodeEntities=value=>String(value).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_,entity)=>{
 const key=entity.toLowerCase();
 if(key==='amp')return '&';if(key==='lt')return '<';if(key==='gt')return '>';if(key==='quot')return '"';if(key==='apos')return "'";if(key==='nbsp')return ' ';
 if(key.startsWith('#x')){const n=parseInt(key.slice(2),16);return Number.isFinite(n)&&n<=0x10ffff?String.fromCodePoint(n):'';}
 if(key.startsWith('#')){const n=parseInt(key.slice(1),10);return Number.isFinite(n)&&n<=0x10ffff?String.fromCodePoint(n):'';}
 return '';
});
const cleanURL=value=>{try{const url=new URL(String(value||''));return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}};
export function parseBookmarksHTML(source){
 const html=String(source||'').slice(0,5_000_000),seen=new Set(),items=[];
 const anchors=/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;let match;
 while((match=anchors.exec(html))&&items.length<MAX_BOOKMARKS){
  const href=match[1].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const url=cleanURL(href?.[1]??href?.[2]??href?.[3]);if(!url||seen.has(url))continue;
  const title=decodeEntities(match[2].replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()).slice(0,300)||new URL(url).hostname;
  seen.add(url);items.push({url,title});
 }
 return items;
}
export function serializeBookmarksHTML(entries){
 const escape=value=>String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
 const valid=[];
 for(const entry of Array.isArray(entries)?entries:[]){
  const url=cleanURL(entry?.url);if(!url||valid.some(item=>item.url===url))continue;
  valid.push({url,title:String(entry.title||new URL(url).hostname).slice(0,300)});
  if(valid.length>=MAX_BOOKMARKS)break;
 }
 const rows=valid.map(item=>'    <DT><A HREF="'+escape(item.url)+'">'+escape(item.title)+'</A>').join('\n');
 return '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Ryftipe Bookmarks</TITLE>\n<H1>Ryftipe Bookmarks</H1>\n<DL><p>\n'+rows+'\n</DL><p>\n';
}
