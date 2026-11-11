import {clearSiteStorage} from '/rte-storage.js';
import {FLAG_DEFINITIONS,SEARCH_ENGINES,defaultFlags,sanitizeFlags,normalizeNavigation,normalizeSearchEngine,sanitizeSitePermissions,getSiteJavascript,validSiteHost} from '/browser-features.js';
import {parseBookmarksHTML,serializeBookmarksHTML} from '/bookmark-io.js';
export function createBrowserUX({navigate,openInternal,getURL,notice,clearHistory,clearBookmarks,escapeHTML}){
 const read=(name,fallback)=>{try{return JSON.parse(localStorage.getItem(name)||'null')??fallback;}catch{return fallback;}};
 let flags=sanitizeFlags(read('ryftipe.flags',{}));
 let sitePermissions=sanitizeSitePermissions(read('ryftipe.sitePermissions',{}));
 let searchEngine=normalizeSearchEngine(localStorage.getItem('ryftipe.search'));
 let saveHistory=localStorage.getItem('ryftipe.saveHistory')!=='off';
 let tabs=[{id:1,url:'ryftipe://home',title:'Home'}],currentId=1,seq=1;
 const current=()=>tabs.find(t=>t.id===currentId);
 function persistFlags(){localStorage.setItem('ryftipe.flags',JSON.stringify(flags));applyFlags();}
 function applyFlags(){
  document.documentElement.classList.toggle('compact-toolbar',flags['compact-toolbar']);
  document.documentElement.classList.toggle('reduce-motion',flags['reduce-motion']);
  document.documentElement.classList.toggle('hide-metrics',!flags['performance-stats']);
  document.documentElement.classList.toggle('hide-bookmarks-bar',!flags['bookmarks-bar']);
 }
 function updateTab(url,title){const t=current();if(t){t.url=url;t.title=title||t.title;renderTabs();}}
 function renderTabs(){
  const strip=document.getElementById('tab-strip');if(!strip)return;strip.replaceChildren();
  for(const tab of tabs){
   const element=document.createElement('div');element.className='tab'+(tab.id===currentId?' active':'');
   const opener=document.createElement('button');opener.className='tab-open';opener.textContent=tab.title;opener.title=tab.url;opener.setAttribute('aria-label','Open '+tab.title);opener.onclick=()=>switchTab(tab.id);
   const closer=document.createElement('button');closer.className='tab-close';closer.textContent='×';closer.title='Close tab';closer.onclick=()=>closeTab(tab.id);
   element.append(opener,closer);strip.append(element);
  }
 }
 function newTab(){if(tabs.length>=10){notice('Maximum of 10 tabs per session');return;}const tab={id:++seq,url:'ryftipe://home',title:'Home'};tabs.push(tab);currentId=tab.id;openInternal('home');renderTabs();}
 function switchTab(id){if(id===currentId)return;const tab=tabs.find(t=>t.id===id);if(!tab)return;currentId=id;renderTabs();navigate(tab.url);}
 function closeTab(id){const at=tabs.findIndex(t=>t.id===id);if(at<0)return;const isCurrent=id===currentId;tabs.splice(at,1);if(!tabs.length)tabs=[{id:++seq,url:'ryftipe://home',title:'Home'}];if(isCurrent){currentId=tabs[Math.min(at,tabs.length-1)].id;navigate(current().url);}else renderTabs();}
 function setFlag(id,value){if(!FLAG_DEFINITIONS.some(x=>x.id===id))return;flags[id]=Boolean(value);persistFlags();}
 function savePermissions(){localStorage.setItem('ryftipe.sitePermissions',JSON.stringify(sitePermissions));}
 const safe=escapeHTML;
 const header=(title,description)=>'<div class="eyebrow">Ryftipe internal</div><h1 class="page-heading">'+title+'</h1><p class="subtle">'+description+'</p>';
 function pageHTML(page){
  if(page==='flags')return header('Experimental flags','Toggle real Ryftipe features. These are not Chromium flags.')+'<div class="page-actions"><input id="flag-search" class="flag-search" placeholder="Search flags" aria-label="Search flags"><button class="minor" id="flags-reset">Reset flags</button></div><div class="panel" style="margin-top:18px">'+FLAG_DEFINITIONS.map(x=>'<div class="setting-row flag-row" data-filter="'+safe((x.id+' '+x.title+' '+x.description).toLowerCase())+'"><div><strong>'+safe(x.title)+'</strong><small>'+safe(x.description)+'</small><code>#'+safe(x.id)+'</code></div><select data-flag="'+safe(x.id)+'"><option value="default">Default</option><option value="on">Enabled</option><option value="off">Disabled</option></select></div>').join('')+'</div>';
  if(page==='privacy')return header('Privacy','Locally stored history and site preferences.')+'<div class="panel"><div class="setting-row"><div><strong>Save history</strong><small>Stop storing new visited addresses on this device.</small></div><select id="privacy-history"><option value="on">Enabled</option><option value="off">Disabled</option></select></div><div class="setting-row"><div><strong>Per-site JavaScript</strong><small>Controls scripts in the RTE engine only.</small></div><button data-page="site-settings" class="minor">Site settings</button></div></div><h2 class="section-title">Clear local data</h2><div class="page-actions"><button id="privacy-clear-history" class="minor">Clear history</button><button id="privacy-clear-bookmarks" class="minor">Clear bookmarks</button><button id="privacy-clear-permissions" class="minor">Clear site permissions</button><button id="privacy-clear-site-data" class="minor">Clear RTE website storage</button></div><p class="subtle">These controls do not clear remote Chromium cookies or data held by websites. There is no network-wide ad blocker in this version.</p>';
  if(page==='site-settings'){const host=validSiteHost(getURL());const items=Object.entries(sitePermissions).map(([name,p])=>'<div class="setting-row"><div><strong>'+safe(name)+'</strong><small>RTE JavaScript: '+safe(p.javascript)+'</small></div><button class="minor" data-reset-site="'+safe(name)+'">Reset</button></div>').join('');return header('Site settings','Per-site JavaScript permissions for experimental RTE.')+'<div class="panel"><div class="setting-row"><div><strong>Current website</strong><small>'+safe(host||'No external website selected')+'</small></div><select id="site-js"'+(host?'':' disabled')+'><option value="default">Use global setting</option><option value="allow">Allow JavaScript</option><option value="block">Block JavaScript</option></select></div></div><h2 class="section-title">Overrides</h2><div class="panel">'+(items||'<p class="subtle">No overrides saved.</p>')+'</div>';}
  return null;
 }
 function settingsSection(){
  return '<div class="panel"><div class="setting-row"><div><strong>Search engine</strong><small>Used for text typed into the address bar.</small></div><select id="search-engine">'+Object.entries(SEARCH_ENGINES).map(([k,v])=>'<option value="'+k+'">'+safe(v.name)+'</option>').join('')+'</select></div><div class="setting-row"><div><strong>Save history</strong><small>Store visited URLs on this device only.</small></div><select id="settings-history"><option value="on">On</option><option value="off">Off</option></select></div><div class="setting-row"><div><strong>Privacy & flags</strong><small>Experimental features and site controls.</small></div><div class="page-actions"><button class="minor" data-page="privacy">Privacy</button><button class="minor" data-page="flags">Flags</button></div></div></div><h2 class="section-title">Browser preferences</h2>';
 }
 function bindPage(page){
  const root=document.getElementById('internal-content');if(!root)return;
  const search=root.querySelector('#flag-search');
  search?.addEventListener('input',()=>{const q=search.value.trim().toLowerCase();root.querySelectorAll('.flag-row').forEach(x=>x.hidden=!x.dataset.filter.includes(q));});
  root.querySelector('#flags-reset')?.addEventListener('click',()=>{flags=defaultFlags();persistFlags();openInternal('flags');notice('Flags reset to defaults');});
  root.querySelectorAll('[data-flag]').forEach(select=>{
   const def=FLAG_DEFINITIONS.find(x=>x.id===select.dataset.flag);if(!def)return;
   select.value=flags[def.id]===def.default?'default':flags[def.id]?'on':'off';
   select.addEventListener('change',()=>{flags[def.id]=select.value==='default'?def.default:select.value==='on';persistFlags();if(['rte-scripts','rte-images'].includes(def.id))notice('Reload website to apply this flag');});
  });
  const searchEngineSelect=root.querySelector('#search-engine');if(searchEngineSelect){searchEngineSelect.value=searchEngine;searchEngineSelect.addEventListener('change',()=>{searchEngine=normalizeSearchEngine(searchEngineSelect.value);localStorage.setItem('ryftipe.search',searchEngine);});}
  for(const name of ['settings-history','privacy-history']){const input=root.querySelector('#'+name);if(input){input.value=saveHistory?'on':'off';input.addEventListener('change',()=>{saveHistory=input.value==='on';localStorage.setItem('ryftipe.saveHistory',saveHistory?'on':'off');});}}
  root.querySelector('#privacy-clear-history')?.addEventListener('click',()=>{clearHistory();notice('Local history cleared');});
  root.querySelector('#privacy-clear-bookmarks')?.addEventListener('click',()=>{clearBookmarks();notice('Local bookmarks cleared');});
  root.querySelector('#privacy-clear-permissions')?.addEventListener('click',()=>{sitePermissions={};localStorage.removeItem('ryftipe.sitePermissions');notice('Permissions cleared');openInternal('site-settings');});
  root.querySelector('#privacy-clear-site-data')?.addEventListener('click',()=>{const removed=clearSiteStorage(localStorage);notice('Cleared RTE storage for '+removed+' website(s)');});
  const currentHost=validSiteHost(getURL()),siteInput=root.querySelector('#site-js');
  if(siteInput){siteInput.value=sitePermissions[currentHost]?.javascript||'default';siteInput.addEventListener('change',()=>{if(!currentHost)return;if(siteInput.value==='default')delete sitePermissions[currentHost];else sitePermissions[currentHost]={javascript:siteInput.value};savePermissions();notice('Permission saved: reload website to apply');openInternal('site-settings');});}
  root.querySelectorAll('[data-reset-site]').forEach(button=>button.addEventListener('click',()=>{delete sitePermissions[button.dataset.resetSite];savePermissions();openInternal('site-settings');}));
 }
 function installBookmarkTransfer(){
  const bar=document.getElementById('bookmarks-bar');if(!bar||bar.querySelector('#bookmark-import'))return;
  const input=document.createElement('input');input.type='file';input.accept='.html,.htm,text/html';input.hidden=true;input.id='bookmark-import-file';
  const importButton=document.createElement('button');importButton.id='bookmark-import';importButton.textContent='Import';importButton.title='Import bookmarks from an HTML file';
  const exportButton=document.createElement('button');exportButton.id='bookmark-export';exportButton.textContent='Export';exportButton.title='Export bookmarks as an HTML file';
  importButton.onclick=()=>input.click();
  input.addEventListener('change',async()=>{
   const file=input.files?.[0];if(!file)return;
   try{
    if(file.size>5_000_000)throw Error('Bookmark file is larger than 5 MB');
    const imported=parseBookmarksHTML(await file.text());
    if(!imported.length)throw Error('No valid HTTP(S) bookmarks were found');
    const existing=read('ryftipe.bookmarks',[]),merged=[...imported,...(Array.isArray(existing)?existing:[])],seen=new Set();
    const result=merged.filter(item=>item&&typeof item.url==='string'&&!seen.has(item.url)&&seen.add(item.url)).slice(0,200);
    localStorage.setItem('ryftipe.bookmarks',JSON.stringify(result));
    notice('Imported '+(result.length-(Array.isArray(existing)?existing.length:0))+' bookmark(s). Reload the bookmarks page to refresh the list.');
   }catch(error){notice('Bookmark import failed: '+error.message,8000);}
   finally{input.value='';}
  });
  exportButton.onclick=()=>{
   const entries=read('ryftipe.bookmarks',[]),html=serializeBookmarksHTML(entries);
   const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
   const link=document.createElement('a');link.href=url;link.download='ryftipe-bookmarks.html';link.click();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
   notice('Bookmark export prepared');
  };
  bar.append(input,importButton,exportButton);
 }
 function start(){
  applyFlags();renderTabs();installBookmarkTransfer();
  document.getElementById('new-tab').onclick=newTab;
  const toggle=document.getElementById('menu-toggle'),menu=document.getElementById('browser-menu');
  toggle.onclick=()=>{menu.hidden=!menu.hidden;};
  menu.querySelectorAll('[data-menu-page]').forEach(b=>b.addEventListener('click',()=>{menu.hidden=true;openInternal(b.dataset.menuPage);}));
  menu.querySelectorAll('[data-menu-action]').forEach(b=>b.addEventListener('click',()=>{menu.hidden=true;if(b.dataset.menuAction==='new-tab')newTab();if(b.dataset.menuAction==='theme')document.getElementById('theme-toggle').click();}));
  document.addEventListener('keydown',e=>{
   if(!(e.ctrlKey||e.metaKey))return;
   const key=e.key.toLowerCase();
   if(key==='b'&&e.shiftKey){e.preventDefault();setFlag('bookmarks-bar',!flags['bookmarks-bar']);}else if(key==='t'){e.preventDefault();newTab();}
   else if(key==='w'){e.preventDefault();closeTab(currentId);}
   else if(key==='tab'){e.preventDefault();const at=tabs.findIndex(t=>t.id===currentId);switchTab(tabs[(at+(e.shiftKey?-1:1)+tabs.length)%tabs.length].id);}
  });
 }
 return {start,updateTab,pageHTML,settingsSection,bindPage,normalizeNavigation:input=>normalizeNavigation(input,searchEngine),getFlag:id=>Boolean(flags[id]),setFlag,allowJavascript:(href,enabled)=>flags['rte-scripts']&&getSiteJavascript(sitePermissions,href,enabled),shouldSaveHistory:()=>saveHistory};
}
