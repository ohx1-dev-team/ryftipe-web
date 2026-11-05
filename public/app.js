import {createRTE} from '/rte.js';
const $=id=>document.getElementById(id);
const canvas=$('screen'),ctx=canvas.getContext('2d',{alpha:false});
let ws,connected=false,ready=false,remoteURL='https://example.com',internal='home';
let pendingFrame=null,imageBusy=false,resizeTimeout,noticeTimeout,lastMetrics={fps:0,kbps:0};
let engine=localStorage.getItem('ryftipe.engine')||'rte',rte=null;
if(!['rte','chromium'].includes(engine))engine='rte';
const known=new Set(['home','newtab','settings','gpu','about','history','bookmarks','help']);
let quality=localStorage.getItem('ryftipe.quality')||'balanced';
if(!['fast','balanced','sharp'].includes(quality))quality='balanced';
const getList=(name)=>{try{const v=JSON.parse(localStorage.getItem('ryftipe.'+name)||'[]');return Array.isArray(v)?v:[];}catch{return [];}};
const saveList=(name,list)=>localStorage.setItem('ryftipe.'+name,JSON.stringify(list.slice(0,200)));
let history=getList('history'),bookmarks=getList('bookmarks');
const escapeHTML=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function send(o){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(o));}
function notice(m,ms=5000){$('notice').textContent=m;$('notice').hidden=false;clearTimeout(noticeTimeout);noticeTimeout=setTimeout(()=>$('notice').hidden=true,ms);}
function dimensions(){const r=canvas.getBoundingClientRect();return {width:Math.min(1920,Math.max(320,Math.round(r.width))),height:Math.min(1200,Math.max(240,Math.round(r.height)))};}
function resize(){const d=dimensions();if(canvas.width!==d.width||canvas.height!==d.height){canvas.width=d.width;canvas.height=d.height;}if(ready)send({type:'resize',...d});}
function showBrowser(){$('login').hidden=true;$('browser').hidden=false;initRTE();openInternal('home');if(engine==='chromium')connect();else nativeStatus();}
async function checkAuth(){try{const r=await fetch('/api/auth');const v=await r.json();if(v.authenticated)showBrowser();else $('login').hidden=false;}catch{$('login').hidden=false;}}
$('login-form').addEventListener('submit',async e=>{e.preventDefault();const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('password').value})});if(!r.ok){$('login-error').textContent='Invalid password';return;}$('password').value='';showBrowser();});
function nativeStatus(){$('connection').textContent='RTE active';document.querySelector('.light').classList.add('online');$('quality-label').textContent='RTE';$('fps').textContent='Canvas';$('bitrate').textContent='No stream';}
function updateLocation(value,title){$('url').value=value;$('tab-title').textContent=title;}
function label(page){return({home:'Home',newtab:'New tab',settings:'Settings',gpu:'GPU diagnostics',about:'About Ryftipe',history:'History',bookmarks:'Bookmarks',help:'Help'})[page]||'Ryftipe';}
function tiles(){return [['settings','⚙','Settings','Choose your preferred stream quality.'],['gpu','◈','GPU diagnostics','Inspect remote Chromium acceleration.'],['bookmarks','☆','Bookmarks','Your locally saved websites.'],['history','◷','History','Recently visited pages.'],['about','ⓘ','About','Version and engine details.'],['help','?','Help','Ryftipe internal pages and shortcuts.']].map(([p,i,t,s])=>'<button class="tile" data-page="'+p+'"><span class="glyph">'+i+'</span><strong>'+t+'</strong><small>'+s+'</small></button>').join('');}
function rowHTML(entry,index,kind){return '<div class="entry"><div><a href="#" data-go="'+escapeHTML(entry.url)+'">'+escapeHTML(entry.title||entry.url)+'</a><br><small>'+escapeHTML(entry.url)+'</small></div>'+(kind==='bookmarks'?'<button data-remove="'+index+'">Remove</button>':'')+'</div>';}
function pageHTML(p){
 const heading=(name,sub)=>'<div class="eyebrow">Ryftipe internal</div><h1 class="page-heading">'+name+'</h1><p class="subtle">'+sub+'</p>';
 if(p==='home'||p==='newtab')return '<section class="hero"><span class="symbol">◈</span><div class="eyebrow">Welcome to Ryftipe</div><h1>Your browser, your space.</h1><p>Ryftipe Engine: original rendering with Chromium fallback.</p><form class="hero-search" id="hero-search"><input id="hero-url" placeholder="Search or enter a website" autocomplete="off"><button>Go</button></form></section><div class="grid">'+tiles()+'</div>';
 if(p==='settings')return heading('Settings','Configure your Ryftipe experience. Settings on this device are stored locally until accounts are introduced.')+'<div class="panel"><div class="setting-row"><div><strong>Rendering engine</strong><small>RTE is experimental; Chromium supports more websites.</small></div><select id="engine-select"><option value="rte">Ryftipe Engine (RTE)</option><option value="chromium">Chromium fallback</option></select></div><div class="setting-row"><div><strong>Stream quality</strong><small>Higher quality uses more bandwidth and server resources.</small></div><select id="preset-select"><option value="fast">Fast</option><option value="balanced">Balanced</option><option value="sharp">Sharp</option></select></div><div class="setting-row"><div><strong>Browser home</strong><small>Open your Ryftipe start page.</small></div><button class="minor" data-page="home">Open home</button></div></div><h2 class="section-title">Diagnostics</h2><button class="minor" data-page="gpu">View remote GPU information</button>';
 if(p==='gpu')return heading('GPU diagnostics','These are the server-side Chromium graphics capabilities, not your device GPU.')+'<div class="notice-inline">GPU acceleration depends on your Render instance and Chromium launch configuration. Software rendering is normal on some cloud hosts. This page reports detected capabilities; it does not enable GPU acceleration.</div><div class="panel" style="margin-top:18px" id="gpu-detail"><p>Loading Chromium GPU information…</p></div><h2 class="section-title">Full diagnostic data</h2><pre class="raw" id="gpu-raw">Loading…</pre><div class="page-actions"><button class="minor" id="refresh-gpu">Refresh diagnostics</button></div>';
 if(p==='about')return heading('About Ryftipe','Independent remote browser project by OHx1.')+'<div class="panel"><div class="diag"><span>Version</span><strong>0.4.0</strong></div><div class="diag"><span>Rendering</span><strong>RTE Canvas renderer + optional Chromium fallback</strong></div><div class="diag"><span>Transport</span><strong>CDP JPEG frames over binary WebSocket</strong></div><div class="diag"><span>Audio</span><strong>Not supported yet</strong></div><div class="diag"><span>Saved profiles</span><strong>Not supported yet — no PostgreSQL integration</strong></div></div>';
 if(p==='help')return heading('Help & internal pages','Enter these addresses directly in the Ryftipe address bar.')+'<div class="grid">'+tiles()+'</div><p class="subtle">Internal addresses use <code>ryftipe://home</code>, <code>ryftipe://settings</code>, <code>ryftipe://gpu</code>, <code>ryftipe://bookmarks</code>, <code>ryftipe://history</code>, <code>ryftipe://about</code> and <code>ryftipe://help</code>. Ctrl+L focuses the address bar. These pages work without a remote Chromium frame.</p>';
 if(p==='history')return heading('History','Recent external pages on this device. No account sync yet.')+'<div class="page-actions"><button class="minor" id="clear-history">Clear history</button></div><div class="panel" style="margin-top:20px">'+(history.length?history.map((v,i)=>rowHTML(v,i,'history')).join(''):'<p class="subtle">No browsing history yet.</p>')+'</div>';
 if(p==='bookmarks')return heading('Bookmarks','Saved on this device, not synced across updates or devices.')+'<div class="page-actions"><button class="minor" id="add-bookmark">Bookmark current remote website</button></div><div class="panel" style="margin-top:20px">'+(bookmarks.length?bookmarks.map((v,i)=>rowHTML(v,i,'bookmarks')).join(''):'<p class="subtle">No bookmarks yet.</p>')+'</div>';
 return heading('Page not found','That internal address does not exist.')+'<button class="minor" data-page="home">Go home</button>';
}
function openInternal(p){internal=known.has(p)?p:'unknown';rte?.hide();$('internal').hidden=false;canvas.hidden=true;$('waiting').hidden=true;updateLocation('ryftipe://'+p,label(p));$('internal-content').innerHTML=pageHTML(internal);$('internal').scrollTop=0;bindInternal();if(p==='gpu')loadGPU();}
function showRemote(){internal=null;$('internal').hidden=true;if(engine==='rte'){canvas.hidden=true;$('waiting').hidden=true;rte?.show();$('quality-label').textContent='RTE';}else{rte?.hide();canvas.hidden=false;$('waiting').hidden=Boolean(pendingFrame||hadFrame);resize();$('quality-label').textContent=capitalize(quality);}updateLocation(remoteURL,hostName(remoteURL));}
let hadFrame=false;
function hostName(u){try{return new URL(u).hostname;}catch{return 'Website';}}
function navigate(value){
 let url=String(value||'').trim();if(!url)return;
 if(/^ryftipe:\/\//i.test(url)){let page=url.slice(10).replace(/\/.*$/,'').toLowerCase();openInternal(page||'home');return;}
 if(/^https?:\/\//i.test(url)===false){if(url.includes(' ')||!url.includes('.'))url='https://www.google.com/search?q='+encodeURIComponent(url);else url='https://'+url;}
 remoteURL=url;showRemote();if(engine==='rte'){rte?.navigate(url);return;}if(!ready){notice('Remote Chromium is still connecting.');return;}send({type:'navigate',url});
}
function initRTE(){if(rte)return;rte=createRTE($('rte-screen'),{onNavigate:navigate,onError:notice,onLocation:m=>{if(!m.url)return;remoteURL=m.url;if(!internal)updateLocation(m.url,m.title||hostName(m.url));if(m.title&&history[0]?.url!==m.url){history.unshift({url:m.url,title:m.title,when:Date.now()});saveList('history',history);}},onStats:m=>{if(engine==='rte'){$('fps').textContent=m.commands+' objects';$('bitrate').textContent='Canvas';}}});}
function switchEngine(next){if(next===engine)return;engine=next;localStorage.setItem('ryftipe.engine',engine);if(engine==='chromium'){connect();}else{ws?.close();nativeStatus();}if(!internal)navigate(remoteURL);}
function bindInternal(){
 $('internal-content').querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>openInternal(b.dataset.page)));
 $('internal-content').querySelectorAll('[data-go]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();navigate(a.dataset.go);}));
 $('internal-content').querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>{bookmarks.splice(Number(b.dataset.remove),1);saveList('bookmarks',bookmarks);openInternal('bookmarks');}));
 $('hero-search')?.addEventListener('submit',e=>{e.preventDefault();navigate($('hero-url').value);});
 $('preset-select')?.addEventListener('change',e=>{quality=e.target.value;localStorage.setItem('ryftipe.quality',quality);send({type:'quality',preset:quality});$('quality-label').textContent=capitalize(quality);});
 if($('preset-select'))$('preset-select').value=quality;
 $('engine-select')?.addEventListener('change',e=>switchEngine(e.target.value));if($('engine-select'))$('engine-select').value=engine;
 $('add-bookmark')?.addEventListener('click',()=>{if(!/^https?:\/\//i.test(remoteURL)){notice('Visit a website first.');return;}bookmarks=bookmarks.filter(x=>x.url!==remoteURL);bookmarks.unshift({url:remoteURL,title:hostName(remoteURL)});saveList('bookmarks',bookmarks);openInternal('bookmarks');});
 $('clear-history')?.addEventListener('click',()=>{history=[];saveList('history',history);openInternal('history');});
 $('refresh-gpu')?.addEventListener('click',loadGPU);
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
  if(m.type==='ready'){ready=true;send({type:'quality',preset:quality});resize();return;}
  if(m.type==='location'){if(/^https?:\/\//i.test(m.url)){remoteURL=m.url;if(!internal){updateLocation(remoteURL,hostName(remoteURL));}if(history[0]?.url!==remoteURL){history.unshift({url:remoteURL,title:hostName(remoteURL),when:Date.now()});saveList('history',history);}}}
  if(m.type==='metrics'){lastMetrics={fps:m.fps,kbps:m.kbps};$('fps').textContent=m.fps+' FPS';$('bitrate').textContent=m.kbps+' kbps';}
  if(m.type==='error')notice(m.message,7000);
 };
}
$('url-form').addEventListener('submit',e=>{e.preventDefault();navigate($('url').value);$('url').blur();});
for(const id of ['back','forward','reload'])$(id).onclick=()=>{if(internal){if(id==='reload')openInternal(internal);else if(id==='back')showRemote();else openInternal('home');}else if(engine==='rte'){rte?.[id]();}else send({type:id});};
$('home').onclick=()=>openInternal('home');
$('settings-toggle').onclick=()=>openInternal('settings');
function pointer(e){const r=canvas.getBoundingClientRect();return{x:Math.max(0,Math.round((e.clientX-r.left)/r.width*canvas.width)),y:Math.max(0,Math.round((e.clientY-r.top)/r.height*canvas.height))};}
canvas.addEventListener('click',e=>{if(engine!=='chromium')return;send({type:'click',...pointer(e)});canvas.focus();});
let lastMove=0;canvas.addEventListener('mousemove',e=>{if(engine!=='chromium')return;const now=performance.now();if(now-lastMove<50)return;lastMove=now;send({type:'move',...pointer(e)});});
canvas.addEventListener('wheel',e=>{if(engine!=='chromium')return;e.preventDefault();send({type:'scroll',dx:e.deltaX,dy:e.deltaY});},{passive:false});
canvas.addEventListener('keydown',e=>{if(engine!=='chromium')return;
 if(['Tab','Backspace','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Escape','PageUp','PageDown','Home','End','Delete'].includes(e.key)||e.ctrlKey||e.altKey||e.metaKey){
 e.preventDefault();const mods=[e.ctrlKey?'Control':null,e.altKey?'Alt':null,e.shiftKey?'Shift':null,e.metaKey?'Meta':null].filter(Boolean);send({type:'key',key:[...mods,e.key===' '?'Space':e.key].join('+')});
 }else if(e.key.length===1){e.preventDefault();send({type:'text',text:e.key});}
});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='l'){e.preventDefault();$('url').focus();$('url').select();}});
new ResizeObserver(()=>{clearTimeout(resizeTimeout);resizeTimeout=setTimeout(()=>{if(engine==='rte')rte?.resize();else resize();},120);}).observe($('viewport'));
checkAuth();
