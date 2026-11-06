import {createBrowserUX} from '/browser-ui.js';
const $=id=>document.getElementById(id);
const historyAPI=window.history;
const canvas=$('screen'),ctx=canvas.getContext('2d',{alpha:false});
let ws,connected=false,ready=false,remoteURL='https://example.com',internal='home';
let pendingFrame=null,imageBusy=false,resizeTimeout,noticeTimeout,lastMetrics={fps:0,kbps:0};
let engine=localStorage.getItem('ryftipe.engine')||'rte',rte=null,rteLoading=null;
let theme=localStorage.getItem('ryftipe.theme')||'dark';if(!['dark','light'].includes(theme))theme='dark';
let pendingNavigation=null;
let jsEnabled=localStorage.getItem('ryftipe.javascript')!=='off';
if(!['rte','chromium'].includes(engine))engine='rte';
const known=new Set(['home','newtab','settings','gpu','about','history','bookmarks','help','javascript','flags','privacy','site-settings','engine','media']);
let quality=localStorage.getItem('ryftipe.quality')||'balanced';
if(!['fast','balanced','sharp'].includes(quality))quality='balanced';
const getList=(name)=>{try{const v=JSON.parse(localStorage.getItem('ryftipe.'+name)||'[]');return Array.isArray(v)?v:[];}catch{return [];}};
const saveList=(name,list)=>localStorage.setItem('ryftipe.'+name,JSON.stringify(list.slice(0,200)));
let history=getList('history'),bookmarks=getList('bookmarks');
let browserUX=null,zoom=1;
function renderBookmarksBar(){
 const target=$('bookmark-bar-items');if(!target)return;target.replaceChildren();
 for(const entry of bookmarks.slice(0,30)){
  if(!/^https?:\/\//i.test(entry.url))continue;
  const button=document.createElement('button');button.className='bookmark-chip';button.title=entry.url;
  try{button.textContent='☆ '+(entry.title||new URL(entry.url).hostname).slice(0,34);}catch{continue;}
  button.onclick=()=>navigate(entry.url);target.append(button);
 }
 if(!target.children.length){const hint=document.createElement('span');hint.className='bookmark-empty';hint.textContent='Save a website to see it here';target.append(hint);}
}

const escapeHTML=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function send(o){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(o));}
function notice(m,ms=5000){$('notice').textContent=m;$('notice').hidden=false;clearTimeout(noticeTimeout);noticeTimeout=setTimeout(()=>$('notice').hidden=true,ms);}
function dimensions(){const r=canvas.getBoundingClientRect();return {width:Math.min(1920,Math.max(320,Math.round(r.width))),height:Math.min(1200,Math.max(240,Math.round(r.height)))};}
function resize(){const d=dimensions();if(canvas.width!==d.width||canvas.height!==d.height){canvas.width=d.width;canvas.height=d.height;}if(ready)send({type:'resize',...d});}
function showBrowser(){
 $('login').hidden=true;$('browser').hidden=false;applyTheme(theme);
 browserUX=createBrowserUX({navigate,openInternal,getURL:()=>remoteURL,notice,escapeHTML,clearHistory:()=>{history=[];saveList('history',history);},clearBookmarks:()=>{bookmarks=[];saveList('bookmarks',bookmarks);renderBookmarksBar();}});
 browserUX.start();renderBookmarksBar();openInternal('home',{replace:true});initRTE();
 if(engine==='chromium')connect();else nativeStatus();
}
async function checkAuth(){try{const r=await fetch('/api/auth');const v=await r.json();if(v.authenticated)showBrowser();else $('login').hidden=false;}catch{$('login').hidden=false;}}
$('login-form').addEventListener('submit',async e=>{e.preventDefault();const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('password').value})});if(!r.ok){$('login-error').textContent='Invalid password';return;}$('password').value='';showBrowser();});
function applyTheme(next){theme=next;document.documentElement.dataset.theme=next;localStorage.setItem('ryftipe.theme',next);$('theme-toggle').textContent=next==='dark'?'☀':'☾';$('theme-toggle').title=next==='dark'?'Switch to light theme':'Switch to dark theme';const themeMeta=document.querySelector('meta[name="theme-color"]');if(themeMeta)themeMeta.content=next==='dark'?'#0b1124':'#e9eefb';}
function nativeStatus(){$('connection').textContent='RTE active';document.querySelector('.light').classList.add('online');$('quality-label').textContent='RTE';$('fps').textContent='Document';$('bitrate').textContent='Local layout';}
function updateLocation(value,title){$('url').value=value;browserUX?.updateTab(value,title);}
function label(page){return({home:'Home',newtab:'New tab',settings:'Settings',gpu:'GPU diagnostics',about:'About Ryftipe',history:'History',bookmarks:'Bookmarks',help:'Help',javascript:'JavaScript',flags:'Flags',privacy:'Privacy','site-settings':'Site settings',engine:'RTE diagnostics',media:'Media diagnostics'})[page]||'Ryftipe';}
function tiles(){return [['settings','⚙','Settings','Choose your preferred stream quality.'],['gpu','◈','GPU diagnostics','Inspect remote Chromium acceleration.'],['bookmarks','☆','Bookmarks','Your locally saved websites.'],['history','◷','History','Recently visited pages.'],['about','ⓘ','About','Version and engine details.'],['javascript','⌘','JavaScript','Isolated script execution status.'],['flags','⚑','Flags','Experimental features and controls.'],['privacy','◈','Privacy','Local browsing data.'],['engine','◉','Engine','Live RTE diagnostics and supported features.'],['media','▶','Media','Inspect native video/audio and codec support.'],['help','?','Help','Ryftipe internal pages and shortcuts.']].map(([p,i,t,s])=>'<button class="tile" data-page="'+p+'"><span class="glyph">'+i+'</span><strong>'+t+'</strong><small>'+s+'</small></button>').join('');}
function rowHTML(entry,index,kind){return '<div class="entry"><div><a href="#" data-go="'+escapeHTML(entry.url)+'">'+escapeHTML(entry.title||entry.url)+'</a><br><small>'+escapeHTML(entry.url)+'</small></div>'+(kind==='bookmarks'?'<button data-remove="'+index+'">Remove</button>':'')+'</div>';}
function pageHTML(p){
 const heading=(name,sub)=>'<div class="eyebrow">Ryftipe internal</div><h1 class="page-heading">'+name+'</h1><p class="subtle">'+sub+'</p>';
 const featurePage=browserUX?.pageHTML(p);if(featurePage!==null&&featurePage!==undefined)return featurePage;
 if(p==='home'||p==='newtab')return '<section class="hero"><span class="symbol">◈</span><div class="eyebrow">Welcome to Ryftipe</div><h1>Your browser, your space.</h1><p>Ryftipe Engine: original rendering with Chromium fallback.</p><form class="hero-search" id="hero-search"><input id="hero-url" placeholder="Search or enter a website" autocomplete="off"><button>Go</button></form></section><div class="grid">'+(browserUX?.getFlag('homepage-shortcuts')?tiles():'')+'</div>';
 if(p==='settings')return heading('Settings','Configure your Ryftipe experience. Settings on this device are stored locally until accounts are introduced.')+(browserUX?.settingsSection()||'')+'<div class="panel"><div class="setting-row"><div><strong>RTE JavaScript</strong><small>Run classic website scripts inside a separate, sandboxed document. Modern browser APIs remain incomplete.</small></div><select id="js-select"><option value="on">Enabled (experimental)</option><option value="off">Disabled</option></select></div><div class="setting-row"><div><strong>Appearance</strong><small>Switch between dark and light browser themes.</small></div><select id="theme-select"><option value="dark">Dark</option><option value="light">Light</option></select></div><div class="setting-row"><div><strong>Rendering engine</strong><small>RTE is experimental; Chromium supports more websites.</small></div><select id="engine-select"><option value="rte">Ryftipe Engine (RTE)</option><option value="chromium">Chromium fallback</option></select></div><div class="setting-row"><div><strong>Stream quality</strong><small>Higher quality uses more bandwidth and server resources.</small></div><select id="preset-select"><option value="fast">Fast</option><option value="balanced">Balanced</option><option value="sharp">Sharp</option></select></div><div class="setting-row"><div><strong>Browser home</strong><small>Open your Ryftipe start page.</small></div><button class="minor" data-page="home">Open home</button></div></div><h2 class="section-title">Diagnostics</h2><button class="minor" data-page="gpu">View remote GPU information</button>';
 if(p==='media')return heading('RTE media diagnostics','Detected media capabilities of the browser running Ryftipe Web—not Render.')+'<div class="panel"><div class="diag"><span>HTML video</span><strong>'+(typeof HTMLVideoElement==='undefined'?'Unavailable':'Available')+'</strong></div><div class="diag"><span>HTML audio</span><strong>'+(typeof HTMLAudioElement==='undefined'?'Unavailable':'Available')+'</strong></div><div class="diag"><span>MediaSource Extensions</span><strong>'+(typeof MediaSource==='undefined'?'Unavailable':'Available (RTE integration incomplete)')+'</strong></div><div class="diag"><span>WebCodecs VideoDecoder</span><strong>'+(typeof VideoDecoder==='undefined'?'Unavailable':'Available (not integrated with RTE)')+'</strong></div><div class="diag"><span>MP4 H.264</span><strong>'+escapeHTML(document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E"')||'Not reported')+'</strong></div><div class="diag"><span>WebM VP9</span><strong>'+escapeHTML(document.createElement('video').canPlayType('video/webm; codecs="vp9"')||'Not reported')+'</strong></div><div class="diag"><span>WebM AV1</span><strong>'+escapeHTML(document.createElement('video').canPlayType('video/webm; codecs="av01.0.05M.08"')||'Not reported')+'</strong></div></div><p class="subtle">RTE now supports ordinary HTML video/audio elements backed by the device media decoder. It does not yet implement YouTube’s adaptive streaming player, JavaScript modules, MediaSource integrations, DRM, or modern site APIs.</p>';
 if(p==='engine')return heading('RTE diagnostics','Live instrumentation for the experimental custom renderer.')+'<div class="panel"><div class="diag"><span>Engine mode</span><strong>'+escapeHTML(engine==='rte'?'Ryftipe Engine':'Chromium fallback')+'</strong></div><div class="diag"><span>Current URL</span><strong>'+escapeHTML(remoteURL)+'</strong></div><div class="diag"><span>Draw commands</span><strong>'+String(rte?.stats?.commands??0)+'</strong></div><div class="diag"><span>Rendered text runs</span><strong>'+String(rte?.stats?.textCommands??0)+'</strong></div><div class="diag"><span>CSS rules</span><strong>'+String(rte?.stats?.cssRules??0)+'</strong></div><div class="diag"><span>External stylesheets loaded</span><strong>'+String(rte?.stats?.stylesheetStats?.loaded??0)+'</strong></div><div class="diag"><span>Stylesheet fetch failures</span><strong>'+String(rte?.stats?.stylesheetStats?.failed??0)+'</strong></div><div class="diag"><span>Gradient backgrounds</span><strong>'+String(rte?.stats?.gradientCommands??0)+'</strong></div><div class="diag"><span>Last canvas paint</span><strong>'+String((rte?.stats?.paintMs??0).toFixed(2))+' ms</strong></div><div class="diag"><span>Average canvas paint</span><strong>'+String((rte?.stats?.averagePaintMs??0).toFixed(2))+' ms</strong></div><div class="diag"><span>Paint count</span><strong>'+String(rte?.stats?.paintCount??0)+'</strong></div><div class="diag"><span>Document height</span><strong>'+String(Math.round(rte?.stats?.documentHeight??0))+' px</strong></div><div class="diag"><span>Zoom</span><strong>'+Math.round(zoom*100)+'%</strong></div><div class="diag"><span>JavaScript status</span><strong>'+escapeHTML(rte?.scriptStatus||'not started')+'</strong></div><div class="diag"><span>Scripts executed</span><strong>'+String(rte?.stats?.scriptMetrics?.executed??0)+'</strong></div><div class="diag"><span>Scripts skipped</span><strong>'+String(rte?.stats?.scriptMetrics?.skipped??0)+'</strong></div><div class="diag"><span>Data requests</span><strong>'+String(rte?.stats?.scriptMetrics?.networkRequests??0)+'</strong></div></div><h2 class="section-title">Current engine capabilities</h2><div class="panel"><p>Supported subsets: HTML tree parsing, CSS selectors, box layout, inline text wrapping, experimental Flexbox/Grid tracks, image painting, links, GET forms, sandboxed classic JavaScript, search within painted text, page zoom.</p><p class="subtle">Ordinary video/audio elements now use a native media layer. Still unsupported: full CSS standards, modern JavaScript modules, Shadow DOM, adaptive video streaming, WebGL and YouTube compatibility in RTE.</p></div><button class="minor" id="engine-refresh">Refresh diagnostics</button>';
 if(p==='gpu')return heading('GPU diagnostics','These are the server-side Chromium graphics capabilities, not your device GPU.')+'<div class="notice-inline">GPU acceleration depends on your Render instance and Chromium launch configuration. Software rendering is normal on some cloud hosts. This page reports detected capabilities; it does not enable GPU acceleration.</div><div class="panel" style="margin-top:18px" id="gpu-detail"><p>Loading Chromium GPU information…</p></div><h2 class="section-title">Full diagnostic data</h2><pre class="raw" id="gpu-raw">Loading…</pre><div class="page-actions"><button class="minor" id="refresh-gpu">Refresh diagnostics</button></div>';
 if(p==='javascript')return heading('JavaScript compatibility','Experimental RTE JavaScript support and limitations.')+'<div class="panel"><div class="diag"><span>Execution mode</span><strong>Sandboxed iframe with opaque origin</strong></div><div class="diag"><span>Enabled</span><strong>'+ (jsEnabled?'Yes':'No')+'</strong></div><div class="diag"><span>Current status</span><strong>'+escapeHTML(rte?.scriptStatus||'Not running')+'</strong></div><div class="diag"><span>DOM APIs</span><strong>querySelector, getElementById, createElement, classList, events, timers and mutations</strong></div><div class="diag"><span>Canvas</span><strong>Mutations repainted through RTE</strong></div><div class="diag"><span>Not supported</span><strong>fetch/XHR, modules, WebGL, video/audio, full browser APIs</strong></div></div><p class="subtle">External scripts are limited to same-origin classic scripts and import-free modules. Same-origin GET fetch supports bounded text/JSON; full module imports, Shadow DOM styling and XHR/POST are unsupported. A sandbox is not a complete security boundary; this remains an experimental implementation.</p><button class="minor" data-page="settings">Change settings</button><div class="page-actions" style="margin-top:18px"><button class="minor" id="js-self-test">Run JavaScript sandbox self-test</button></div><p id="js-test-status" class="subtle">Not tested in this session.</p>';
 if(p==='about')return heading('About Ryftipe','Independent remote browser project by OHx1.')+'<div class="panel"><div class="diag"><span>Version</span><strong>0.22.1</strong></div><div class="diag"><span>Rendering</span><strong>RTE Canvas + sandboxed JavaScript, optional Chromium fallback</strong></div><div class="diag"><span>Transport</span><strong>CDP JPEG frames over binary WebSocket</strong></div><div class="diag"><span>Audio</span><strong>Not supported yet</strong></div><div class="diag"><span>Saved profiles</span><strong>Not supported yet — no PostgreSQL integration</strong></div></div>';
 if(p==='help')return heading('Help & internal pages','Enter these addresses directly in the Ryftipe address bar.')+'<div class="grid">'+tiles()+'</div><p class="subtle">Internal addresses use <code>ryftipe://home</code>, <code>ryftipe://settings</code>, <code>ryftipe://gpu</code>, <code>ryftipe://bookmarks</code>, <code>ryftipe://history</code>, <code>ryftipe://about</code>, <code>ryftipe://javascript</code>, <code>ryftipe://engine</code>, <code>ryftipe://media</code> and <code>ryftipe://help</code>. Ctrl+L focuses the address bar. These pages work without a remote Chromium frame.</p>';
 if(p==='history')return heading('History','Recent external pages on this device. No account sync yet.')+'<div class="page-actions"><button class="minor" id="clear-history">Clear history</button></div><div class="panel" style="margin-top:20px">'+(history.length?history.map((v,i)=>rowHTML(v,i,'history')).join(''):'<p class="subtle">No browsing history yet.</p>')+'</div>';
 if(p==='bookmarks')return heading('Bookmarks','Saved on this device, not synced across updates or devices.')+'<div class="page-actions"><button class="minor" id="add-bookmark">Bookmark current remote website</button></div><div class="panel" style="margin-top:20px">'+(bookmarks.length?bookmarks.map((v,i)=>rowHTML(v,i,'bookmarks')).join(''):'<p class="subtle">No bookmarks yet.</p>')+'</div>';
 return heading('Page not found','That internal address does not exist.')+'<button class="minor" data-page="home">Go home</button>';
}
function internalFromURL(raw){
 try{
  const url=new URL(raw,location.origin);
  if(url.protocol==='ryftipe:')return (url.hostname||url.pathname.replace(/^\/+/, '')||'home').toLowerCase();
  if(url.origin===location.origin){const p=url.searchParams.get('page');if(p)return p.toLowerCase();const hash=url.hash.match(/^#\/([a-z-]+)/i);if(hash)return hash[1].toLowerCase();}
 }catch{}
 return null;
}
function openInternal(p,{replace=false}={}){
 if(!$('find-panel').hidden)closeFind();
 $('compat').hidden=true;$('rte-warning').hidden=true;
 const page=String(p||'home').toLowerCase();
 internal=known.has(page)?page:'unknown';rte?.hide();
 $('internal').hidden=false;canvas.hidden=true;$('waiting').hidden=true;
 updateLocation('ryftipe://'+page,label(page));
 $('internal-content').innerHTML=pageHTML(internal);$('internal').scrollTop=0;
 const webURL=new URL(location.href);webURL.searchParams.set('page',page);webURL.hash='';
 if(replace)historyAPI.replaceState({ryftipePage:page},'',webURL);
 else if(new URL(location.href).searchParams.get('page')!==page)historyAPI.pushState({ryftipePage:page},'',webURL);
 bindInternal();browserUX?.bindPage(page);if(page==='gpu')loadGPU();
}
function showRemote(){if(!$('find-panel').hidden)closeFind();$('compat').hidden=true;$('rte-warning').hidden=true;internal=null;const webURL=new URL(location.href);if(webURL.searchParams.has('page')){webURL.searchParams.delete('page');historyAPI.replaceState({},'',webURL);}$('internal').hidden=true;if(engine==='rte'){canvas.hidden=true;$('waiting').hidden=true;rte?.show();$('quality-label').textContent='RTE';}else{rte?.hide();canvas.hidden=false;$('waiting').hidden=Boolean(pendingFrame||hadFrame);resize();$('quality-label').textContent=capitalize(quality);}updateLocation(remoteURL,hostName(remoteURL));}
let hadFrame=false;
function hostName(u){try{return new URL(u).hostname;}catch{return 'Website';}}
function navigate(value){
 let url=String(value||'').trim();if(!url)return;
 const page=internalFromURL(url);if(page!==null){openInternal(page||'home');return;}
 url=browserUX?.normalizeNavigation(url)||url;
 remoteURL=url;showRemote();if(engine==='rte'){initRTE().then(instance=>instance?.navigate(url));return;}if(!ready){pendingNavigation=url;notice('Starting Chromium fallback…');return;}send({type:'navigate',url});
}
async function initRTE(){
 if(rte)return rte;if(rteLoading)return rteLoading;
 rteLoading=import('/rte.js').then(({createRTE})=>{
  rte=createRTE($('rte-screen'),{onNavigate:navigate,onError:notice,onCompatibility:m=>showCompatibility(m),javascriptEnabled:()=>browserUX?browserUX.allowJavascript(remoteURL,jsEnabled):jsEnabled,imagesEnabled:()=>browserUX?.getFlag('rte-images')!==false,documentLayoutEnabled:()=>browserUX?.getFlag('rte-document-layout')!==false,onLocation:m=>{
   if(!m.url)return;remoteURL=m.url;if(!internal)updateLocation(m.url,m.title||hostName(m.url));
   if(m.title&&(!browserUX||browserUX.shouldSaveHistory())&&history[0]?.url!==m.url){history.unshift({url:m.url,title:m.title,when:Date.now()});saveList('history',history);}
  },onStats:m=>{if(engine==='rte'){$('fps').textContent=m.mode==='document'?m.domNodes+' nodes':m.commands+' objects';$('bitrate').textContent=m.mode==='document'?'Document layout':'Canvas';}}});
  rte.setZoom(zoom);
  return rte;
 }).catch(e=>{notice('RTE unavailable: '+e.message,12000);return null;}).finally(()=>{rteLoading=null;});
 return rteLoading;
}
function switchEngine(next){if(next===engine)return;engine=next;localStorage.setItem('ryftipe.engine',engine);if(engine==='chromium'){if(!ws||ws.readyState>=WebSocket.CLOSING){ready=false;connect();}$('engine-label').textContent='Chromium fallback';}else{ws?.close();initRTE();nativeStatus();$('engine-label').textContent='Ryftipe Engine';}if(!internal)navigate(remoteURL);}
function showCompatibility(info){if(engine!=='rte'||internal||browserUX?.getFlag('compatibility-warnings')===false)return;$('compat').hidden=true;const warning=$('rte-warning');warning.hidden=false;$('rte-warning-title').textContent='Experimental RTE rendering — '+hostName(info.url||remoteURL);$('rte-warning-detail').textContent=info.attemptingScripts?'Trying supported JavaScript. Complex browser APIs, layouts and media may remain unsupported.':'JavaScript is unavailable or disabled for this page. Some features may be missing.';}
function addBookmark(){if(!/^https?:\/\//i.test(remoteURL)){notice('Open a website first');return;}bookmarks=bookmarks.filter(x=>x.url!==remoteURL);bookmarks.unshift({url:remoteURL,title:hostName(remoteURL)});saveList('bookmarks',bookmarks);renderBookmarksBar();notice('Bookmarked '+hostName(remoteURL));}
function bindInternal(){
 $('internal-content').querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>openInternal(b.dataset.page)));
 $('internal-content').querySelectorAll('[data-go]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();navigate(a.dataset.go);}));
 $('internal-content').querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>{bookmarks.splice(Number(b.dataset.remove),1);saveList('bookmarks',bookmarks);renderBookmarksBar();openInternal('bookmarks');}));
 $('hero-search')?.addEventListener('submit',e=>{e.preventDefault();navigate($('hero-url').value);});
 $('preset-select')?.addEventListener('change',e=>{quality=e.target.value;localStorage.setItem('ryftipe.quality',quality);send({type:'quality',preset:quality});$('quality-label').textContent=capitalize(quality);});
 if($('preset-select'))$('preset-select').value=quality;
 $('theme-select')?.addEventListener('change',e=>applyTheme(e.target.value));if($('theme-select'))$('theme-select').value=theme;
 $('js-select')?.addEventListener('change',e=>{jsEnabled=e.target.value==='on';localStorage.setItem('ryftipe.javascript',jsEnabled?'on':'off');notice('JavaScript preference updated. Reload the website to apply.');});if($('js-select'))$('js-select').value=jsEnabled?'on':'off';
 $('engine-select')?.addEventListener('change',e=>switchEngine(e.target.value));if($('engine-select'))$('engine-select').value=engine;
 $('add-bookmark')?.addEventListener('click',()=>{addBookmark();openInternal('bookmarks');});
 $('clear-history')?.addEventListener('click',()=>{history=[];saveList('history',history);openInternal('history');});
 $('refresh-gpu')?.addEventListener('click',loadGPU);
 $('engine-refresh')?.addEventListener('click',()=>openInternal('engine'));
 $('js-self-test')?.addEventListener('click',runScriptSelfTest);
}
async function runScriptSelfTest(){
 const output=$('js-test-status');if(!output)return;output.textContent='Starting isolated JavaScript runtime…';
 let worker;
 try{
  const {createScriptRuntime}=await import('/rte-runtime.js');
  let passed=false;
  worker=createScriptRuntime({onSnapshot:body=>{
   const serialized=JSON.stringify(body);
   if(serialized.includes('JavaScript executed')){passed=true;output.textContent='PASS: JavaScript updated the DOM inside the sandbox.';}
  },onError:message=>{output.textContent='Script error: '+message;}});
  await worker.load({url:'https://example.com',title:'RTE JS self-test',dom:{tag:'document',children:[{tag:'div',attrs:{id:'rte-demo'},children:[{text:'Waiting'}]}]},scripts:[{inline:'document.getElementById("rte-demo").textContent="JavaScript executed";'}]});
  setTimeout(()=>{if(!passed&&output.isConnected)output.textContent='FAIL: Sandbox did not return the expected DOM update.';worker?.dispose();},1500);
 }catch(e){output.textContent='FAIL: '+e.message;worker?.dispose();}
}
const capitalize=s=>s[0].toUpperCase()+s.slice(1);
async function loadGPU(){
 const detail=$('gpu-detail'),raw=$('gpu-raw');if(!detail||!raw)return;
 try{
  const r=await fetch('/api/diagnostics',{cache:'no-store'});const info=await r.json();if(!r.ok)throw Error(info.detail||info.error);
  const fields=[['Chromium version',info.browserVersion],['Server platform',info.platform+' / '+info.architecture],['CPU logical cores',info.cpuCount],['Server process RAM',info.memoryUsedMB+' MB'],['Graphics device',info.devices?.map(d=>d.deviceString||'Unknown device').join(', ')||'Not reported'],['Driver',info.devices?.map(d=>[d.driverVendor,d.driverVersion].filter(Boolean).join(' ')).filter(Boolean).join(', ')||'Not reported'],['Streaming',info.stream],['Audio support',info.audio?'Available':'Not implemented'],['Delivered stream',lastMetrics.fps+' FPS / '+lastMetrics.kbps+' kbps']];
  detail.replaceChildren(...fields.map(([k,v])=>{const row=document.createElement('div');row.className='diag';const key=document.createElement('span');key.textContent=k;const val=document.createElement('strong');val.textContent=String(v);row.append(key,val);return row;}));
  raw.textContent=JSON.stringify({featureStatus:info.featureStatus,devices:info.devices,auxAttributes:info.auxAttributes},null,2);
 }catch(e){detail.textContent='Diagnostics unavailable: '+e.message;raw.textContent='No data';}
}
async function drawNext(){
 if(imageBusy||!pendingFrame)return;imageBusy=true;
 const blob=pendingFrame;pendingFrame=null;
 try{const bmp=await createImageBitmap(blob);ctx.drawImage(bmp,0,0,canvas.width,canvas.height);bmp.close();hadFrame=true;if(!internal)$('waiting').hidden=true;}catch(e){console.warn('Frame decode failed',e);}
 imageBusy=false;if(pendingFrame)drawNext();
}
function connect(){
 ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/stream');ws.binaryType='blob';
 ws.onopen=()=>{connected=true;$('connection').textContent='Connected';document.querySelector('.light').classList.add('online');resize();};
 ws.onclose=()=>{connected=false;ready=false;if(engine==='rte')return;$('connection').textContent='Disconnected';document.querySelector('.light').classList.remove('online');notice('Remote Chromium disconnected. Internal pages still work.',8000);};
 ws.onerror=()=>notice('Remote Chromium stream connection failed');
 ws.onmessage=e=>{
  if(e.data instanceof Blob){pendingFrame=e.data;drawNext();return;}
  let m;try{m=JSON.parse(e.data);}catch{return;}
  if(m.type==='ready'){ready=true;send({type:'quality',preset:quality});resize();if(pendingNavigation){send({type:'navigate',url:pendingNavigation});pendingNavigation=null;}return;}
  if(m.type==='location'){if(/^https?:\/\//i.test(m.url)){remoteURL=m.url;if(!internal){updateLocation(remoteURL,hostName(remoteURL));}if((!browserUX||browserUX.shouldSaveHistory())&&history[0]?.url!==remoteURL){history.unshift({url:remoteURL,title:hostName(remoteURL),when:Date.now()});saveList('history',history);}}}
  if(m.type==='metrics'){lastMetrics={fps:m.fps,kbps:m.kbps};$('fps').textContent=m.fps+' FPS';$('bitrate').textContent=m.kbps+' kbps';}
  if(m.type==='error')notice(m.message,7000);
 };
}
$('url-form').addEventListener('submit',e=>{e.preventDefault();navigate($('url').value);$('url').blur();});
for(const id of ['back','forward','reload'])$(id).onclick=()=>{if(internal){if(id==='reload')openInternal(internal);else if(id==='back')showRemote();else openInternal('home');}else if(engine==='rte'){rte?.[id]();}else send({type:id});};
$('home').onclick=()=>openInternal('home');
$('theme-toggle').onclick=()=>applyTheme(theme==='dark'?'light':'dark');
$('bookmark-current').onclick=addBookmark;
$('bookmark-bar-add').onclick=addBookmark;
$('bookmark-bar-manage').onclick=()=>openInternal('bookmarks');
$('compat-switch').onclick=()=>{switchEngine('chromium');};
$('compat-home').onclick=()=>openInternal('home');
$('rte-warning-fallback').onclick=()=>switchEngine('chromium');
$('rte-warning-dismiss').onclick=()=>{$('rte-warning').hidden=true;};
$('settings-toggle').onclick=()=>openInternal('settings');
function setZoom(next){
 if(internal||engine!=='rte'){notice('Zoom is currently supported in RTE website mode');return;}
 zoom=Math.max(.5,Math.min(2,Math.round(next*10)/10));rte?.setZoom(zoom);$('zoom-label').textContent=Math.round(zoom*100)+'%';
}
$('zoom-out').onclick=()=>setZoom(zoom-.1);
$('zoom-in').onclick=()=>setZoom(zoom+.1);
$('zoom-label').onclick=()=>setZoom(1);
function closeFind(){$('find-panel').hidden=true;$('find-query').value='';rte?.findText('');}
function findPage(direction=1){
 if(engine!=='rte'||internal){$('find-count').textContent='RTE only';return;}
 const match=rte?.findText($('find-query').value,direction)||{found:0,total:0};
 $('find-count').textContent=match.found+'/'+match.total;
}
$('find-toggle').onclick=()=>{if(engine!=='rte'||internal){notice('Find in Page is available on RTE websites');return;}$('find-panel').hidden=false;$('find-query').focus();$('find-query').select();};
$('find-query').addEventListener('input',()=>findPage());
$('find-query').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();findPage(e.shiftKey?-1:1);}});
$('find-prev').onclick=()=>findPage(-1);
$('find-next').onclick=()=>findPage(1);
$('find-close').onclick=closeFind;
window.addEventListener('popstate',()=>{const p=internalFromURL(location.href);if(p)openInternal(p,{replace:true});else openInternal('home',{replace:true});});
function pointer(e){const r=canvas.getBoundingClientRect();return{x:Math.max(0,Math.round((e.clientX-r.left)/r.width*canvas.width)),y:Math.max(0,Math.round((e.clientY-r.top)/r.height*canvas.height))};}
canvas.addEventListener('click',e=>{if(engine!=='chromium')return;send({type:'click',...pointer(e)});canvas.focus();});
let lastMove=0;canvas.addEventListener('mousemove',e=>{if(engine!=='chromium')return;const now=performance.now();if(now-lastMove<50)return;lastMove=now;send({type:'move',...pointer(e)});});
canvas.addEventListener('wheel',e=>{if(engine!=='chromium')return;e.preventDefault();send({type:'scroll',dx:e.deltaX,dy:e.deltaY});},{passive:false});
canvas.addEventListener('keydown',e=>{if(engine!=='chromium')return;
 if(['Tab','Backspace','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Escape','PageUp','PageDown','Home','End','Delete'].includes(e.key)||e.ctrlKey||e.altKey||e.metaKey){
 e.preventDefault();const mods=[e.ctrlKey?'Control':null,e.altKey?'Alt':null,e.shiftKey?'Shift':null,e.metaKey?'Meta':null].filter(Boolean);send({type:'key',key:[...mods,e.key===' '?'Space':e.key].join('+')});
 }else if(e.key.length===1){e.preventDefault();send({type:'text',text:e.key});}
});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&!$('find-panel').hidden){closeFind();return;}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'){e.preventDefault();$('find-toggle').click();return;}
 if((e.ctrlKey||e.metaKey)&&['=','+','-','0'].includes(e.key)&&!internal){e.preventDefault();setZoom(e.key==='0'?1:zoom+(e.key==='-'?-.1:.1));return;}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='l'){e.preventDefault();$('url').focus();$('url').select();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){e.preventDefault();addBookmark();}if(e.altKey&&e.key==='ArrowLeft'&&!internal){e.preventDefault();if(engine==='rte')rte?.back();else send({type:'back'});}});
new ResizeObserver(()=>{clearTimeout(resizeTimeout);resizeTimeout=setTimeout(()=>{if(engine==='rte')rte?.resize();else resize();},120);}).observe($('viewport'));
checkAuth();
