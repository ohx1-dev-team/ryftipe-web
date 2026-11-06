// Ryftipe browser preferences and experimental features. No external dependencies.
export const FLAG_DEFINITIONS=Object.freeze([
 {id:'rte-scripts',title:'RTE JavaScript',description:'Allow supported classic scripts to run in the isolated RTE runtime. Does not add modern browser APIs.',default:true,restart:false},
 {id:'rte-document-layout',title:'Standards-based document layout',description:'Display RTE-fetched websites using the browser\'s native CSS box layout inside a script-disabled sandbox. Disable to use the experimental Canvas painter.',default:true,restart:false},
 {id:'rte-images',title:'Load images in RTE',description:'Fetch and paint images in the custom canvas renderer.',default:true,restart:false},
 {id:'compatibility-warnings',title:'Compatibility warnings',description:'Show nonblocking notices when RTE detects a website that may require unsupported features.',default:true,restart:false},
 {id:'performance-stats',title:'Performance statistics',description:'Display stream FPS and RTE drawing statistics in the status bar.',default:true,restart:false},
 {id:'compact-toolbar',title:'Compact toolbar',description:'Reduce browser chrome height for smaller displays.',default:false,restart:false},
 {id:'reduce-motion',title:'Reduced interface motion',description:'Disable decorative interface transitions and animations.',default:false,restart:false},
 {id:'homepage-shortcuts',title:'Homepage shortcuts',description:'Show quick links to Ryftipe internal tools on the homepage.',default:true,restart:false},
 {id:'bookmarks-bar',title:'Bookmarks bar',description:'Show saved bookmarks under the address bar. Ctrl+Shift+B toggles it.',default:true,restart:false}
]);
export const SEARCH_ENGINES=Object.freeze({
 duckduckgo:{name:'DuckDuckGo',template:'https://duckduckgo.com/?q=%s'},
 brave:{name:'Brave Search',template:'https://search.brave.com/search?q=%s'},
 google:{name:'Google',template:'https://www.google.com/search?q=%s'},
 bing:{name:'Bing',template:'https://www.bing.com/search?q=%s'}
});
export function defaultFlags(){return Object.fromEntries(FLAG_DEFINITIONS.map(x=>[x.id,x.default]));}
export function sanitizeFlags(value){const base=defaultFlags();if(value&&typeof value==='object'&&!Array.isArray(value))for(const name of Object.keys(base))if(typeof value[name]==='boolean')base[name]=value[name];return base;}
export function normalizeSearchEngine(value){return Object.hasOwn(SEARCH_ENGINES,value)?value:'duckduckgo';}
export function searchURL(term,engine){const config=SEARCH_ENGINES[normalizeSearchEngine(engine)];return config.template.replace('%s',encodeURIComponent(String(term).trim()));}
export function normalizeNavigation(input,engine='duckduckgo'){
 const text=String(input??'').trim();
 if(!text)return '';
 if(/^ryftipe:\/\//i.test(text))return text;
 if(/^https?:\/\//i.test(text))return text;
 if(/^[^\s\/]+\.[^\s]+$/.test(text)&&!text.includes('@'))return 'https://'+text;
 return searchURL(text,engine);
}
export function validSiteHost(input){
 try{const u=new URL(input);return ['http:','https:'].includes(u.protocol)?u.hostname.toLowerCase().replace(/\.$/,''):'';}catch{return '';}
}
export function sanitizeSitePermissions(value){
 const output={};
 if(!value||typeof value!=='object'||Array.isArray(value))return output;
 for(const [host,entry] of Object.entries(value).slice(0,150)){
  if(!/^[a-z0-9.-]{1,253}$/i.test(host)||!entry||typeof entry!=='object')continue;
  if(['default','allow','block'].includes(entry.javascript))output[host.toLowerCase()]={javascript:entry.javascript};
 }
 return output;
}
export function getSiteJavascript(siteMap,href,globalEnabled=true){
 const host=validSiteHost(href);
 const setting=host?siteMap?.[host]?.javascript:null;
 return setting==='block'?false:setting==='allow'?true:Boolean(globalEnabled);
}
export function sanitizeWorkspace(input){
 if(!Array.isArray(input))return [];
 return input.slice(0,12).filter(x=>x&&typeof x==='object').map(x=>{
  let url='ryftipe://home';
  if(typeof x.url==='string'&&x.url.length<2100){
   if(/^ryftipe:\/\/[a-z-]+$/i.test(x.url)||/^https?:\/\//i.test(x.url))url=x.url;
  }
  return {id:String(x.id||'').slice(0,50),url,title:String(x.title||'New tab').slice(0,90)};
 });
}
