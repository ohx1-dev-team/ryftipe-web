const $=id=>document.getElementById(id);
let ws,connected=false,lastError='';
const frame=$('frame');
function send(value){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(value));}
function status(s){$('status').textContent=s;$('status').hidden=!s;}
function resize(){if(!connected)return;const r=$('screen').getBoundingClientRect();send({type:'resize',width:Math.min(1920,Math.max(320,Math.round(r.width))),height:Math.min(1200,Math.max(240,Math.round(r.height)))});}
function showBrowser(){$('login').hidden=true;$('browser').hidden=false;connect();}
async function checkAuth(){const r=await fetch('/api/auth');if((await r.json()).authenticated)showBrowser();}
$('login-form').addEventListener('submit',async e=>{e.preventDefault();const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('password').value})});if(!r.ok){$('login-error').textContent='Invalid password';return;}$('password').value='';showBrowser();});
function connect(){
  ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/stream');
  ws.onopen=()=>{connected=true;$('connection').textContent='● Connected';$('connection').style.color='#8ddea4';status('Starting Chromium…');resize();};
  ws.onclose=()=>{connected=false;$('connection').textContent='● Disconnected';$('connection').style.color='#ff9a9a';status('Disconnected. Reload to reconnect.');};
  ws.onerror=()=>status('WebSocket error');
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.type==='ready'){status('');resize();}
    if(m.type==='frame')frame.src='data:image/jpeg;base64,'+m.jpeg;
    if(m.type==='location')$('url').value=m.url;
    if(m.type==='error'){lastError=m.message;status(lastError);setTimeout(()=>{if($('status').textContent===lastError)status('');},6000);}
  };
}
$('url-form').addEventListener('submit',e=>{e.preventDefault();send({type:'navigate',url:$('url').value});$('url').blur();});
for(const action of ['back','forward','reload'])$(action).onclick=()=>send({type:action});
$('disconnect').onclick=async()=>{ws?.close();await fetch('/api/logout',{method:'POST'});location.reload();};
frame.addEventListener('click',e=>{const r=frame.getBoundingClientRect();send({type:'click',x:Math.round((e.clientX-r.left)/r.width*frame.naturalWidth),y:Math.round((e.clientY-r.top)/r.height*frame.naturalHeight)});frame.focus();});
$('screen').addEventListener('wheel',e=>{e.preventDefault();send({type:'scroll',dx:e.deltaX,dy:e.deltaY});},{passive:false});
frame.addEventListener('keydown',e=>{e.preventDefault();const mods=[e.ctrlKey?'Control':null,e.altKey?'Alt':null,e.shiftKey?'Shift':null,e.metaKey?'Meta':null].filter(Boolean);const key=e.key===' '?'Space':e.key;if(key.length===1&&!mods.length)send({type:'text',text:key});else send({type:'key',key:[...mods,key].join('+')});});
new ResizeObserver(resize).observe($('screen'));
checkAuth().catch(()=>{});
