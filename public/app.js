const $=id=>document.getElementById(id);
const canvas=$('screen'),ctx=canvas.getContext('2d',{alpha:false});
let ws,connected=false,ready=false,currentURL='',imageBusy=false,pendingFrame=null,lastObjectURL='';
let noticeTimeout,resizeTimeout;
function send(obj){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj));}
function notice(message,ms=5000){$('notice').textContent=message;$('notice').hidden=false;clearTimeout(noticeTimeout);noticeTimeout=setTimeout(()=>$('notice').hidden=true,ms);}
function dimensions(){const r=canvas.getBoundingClientRect();return{width:Math.min(1920,Math.max(320,Math.round(r.width))),height:Math.min(1200,Math.max(240,Math.round(r.height)))};}
function resize(){const d=dimensions();if(canvas.width!==d.width||canvas.height!==d.height){canvas.width=d.width;canvas.height=d.height;}if(ready)send({type:'resize',...d});}
function showBrowser(){$('login').hidden=true;$('browser').hidden=false;connect();}
async function checkAuth(){try{const r=await fetch('/api/auth');const v=await r.json();if(v.authenticated)showBrowser();else $('login').hidden=false;}catch{$('login').hidden=false;notice('Cannot contact Ryftipe server');}}
$('login-form').addEventListener('submit',async e=>{
 e.preventDefault();
 const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('password').value})});
 if(!r.ok){$('login-error').textContent='Invalid password';return;}
 $('password').value='';showBrowser();
});
async function drawNext(){
 if(imageBusy||!pendingFrame)return;
 imageBusy=true;const blob=pendingFrame;pendingFrame=null;
 try{
   const bmp=await createImageBitmap(blob);
   if(canvas.width!==bmp.width||canvas.height!==bmp.height){ // Keep input dimensions matched to remote viewport.
     const d=dimensions();if(canvas.width!==d.width||canvas.height!==d.height)resize();
   }
   ctx.drawImage(bmp,0,0,canvas.width,canvas.height);bmp.close();
   $('waiting').hidden=true;
 }catch(e){console.warn('Frame decode failed',e);}
 imageBusy=false;if(pendingFrame)drawNext();
}
function connect(){
 ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/stream');
 ws.binaryType='blob';
 ws.onopen=()=>{connected=true;$('connection').textContent='Connected';document.querySelector('.light').classList.add('online');resize();};
 ws.onclose=()=>{connected=false;ready=false;$('connection').textContent='Disconnected';document.querySelector('.light').classList.remove('online');notice('Session disconnected. Refresh to reconnect.',10000);};
 ws.onerror=()=>notice('Connection error: unable to reach Chromium stream');
 ws.onmessage=e=>{
   if(e.data instanceof Blob){pendingFrame=e.data;drawNext();return;}
   let m;try{m=JSON.parse(e.data);}catch{return;}
   if(m.type==='ready'){ready=true;resize();return;}
   if(m.type==='location'){currentURL=m.url;$('url').value=currentURL;try{$('tab-title').textContent=new URL(m.url).hostname;}catch{$('tab-title').textContent='New tab';}}
   if(m.type==='metrics'){$('fps').textContent=m.fps+' FPS';$('bitrate').textContent=m.kbps+' kbps';}
   if(m.type==='error')notice(m.message,7000);
 };
}
$('url-form').addEventListener('submit',e=>{
 e.preventDefault();const value=$('url').value.trim();if(!value)return;
 send({type:'navigate',url:value});$('url').blur();canvas.focus();
});
for(const id of ['back','forward','reload'])$(id).onclick=()=>send({type:id});
$('home').onclick=()=>send({type:'navigate',url:'https://example.com'});
$('settings-toggle').onclick=()=>{$('settings-panel').hidden=!$('settings-panel').hidden;};
document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{
 document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('selected',b===button));
 const preset=button.dataset.preset;$('quality-label').textContent=preset[0].toUpperCase()+preset.slice(1);
 send({type:'quality',preset});
}));
function pointer(e){const r=canvas.getBoundingClientRect();return{x:Math.max(0,Math.round((e.clientX-r.left)/r.width*canvas.width)),y:Math.max(0,Math.round((e.clientY-r.top)/r.height*canvas.height))};}
canvas.addEventListener('click',e=>{send({type:'click',...pointer(e)});canvas.focus();});
let lastMove=0;
canvas.addEventListener('mousemove',e=>{const now=performance.now();if(now-lastMove<50)return;lastMove=now;send({type:'move',...pointer(e)});});
canvas.addEventListener('wheel',e=>{e.preventDefault();send({type:'scroll',dx:e.deltaX,dy:e.deltaY});},{passive:false});
canvas.addEventListener('keydown',e=>{
 if(['Tab','Backspace','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Escape','PageUp','PageDown','Home','End','Delete'].includes(e.key)||e.ctrlKey||e.altKey||e.metaKey){
   e.preventDefault();
   const mods=[e.ctrlKey?'Control':null,e.altKey?'Alt':null,e.shiftKey?'Shift':null,e.metaKey?'Meta':null].filter(Boolean);
   send({type:'key',key:[...mods,e.key===' '?'Space':e.key].join('+')});
 }else if(e.key.length===1){e.preventDefault();send({type:'text',text:e.key});}
});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='l'){e.preventDefault();$('url').focus();$('url').select();}});
new ResizeObserver(()=>{clearTimeout(resizeTimeout);resizeTimeout=setTimeout(resize,120);}).observe($('viewport'));
checkAuth();
