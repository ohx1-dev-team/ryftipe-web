import {handleRTE} from './rte/handler.js';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { chromium } from 'playwright';

const PORT = Number(process.env.PORT || 3000);
// Optional private-mode password. Unset means no login prompt.
const PASSWORD = process.env.RYFTIPE_PASSWORD || '';
if (PASSWORD && PASSWORD.length < 12) {
  console.error('If RYFTIPE_PASSWORD is set, it must contain at least 12 characters.');
  process.exit(1);
}
const root = path.dirname(fileURLToPath(import.meta.url));
const activeTokens = new Map();
const MAX_CLIENTS = Math.max(1, Number(process.env.MAX_CLIENTS || 2));
let browser;
let browserPromise;
async function ensureBrowser(){
  if(browser)return browser;
  if(!browserPromise)browserPromise=chromium.launch({headless:true}).then(value=>(browser=value)).finally(()=>{browserPromise=null;});
  return browserPromise;
}
function isPublicIP(ip) {
  const kind = net.isIP(ip);
  if (kind === 4) {
    const p = ip.split('.').map(Number);
    return !(p[0] === 0 || p[0] === 10 || p[0] === 127 || p[0] >= 224 ||
      (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
      (p[0] === 198 && (p[1] === 18 || p[1] === 19)));
  }
  if (kind === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPublicIP(v.slice(7));
    return !(v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') ||
      /^fe[89ab]/.test(v) || v.startsWith('ff') || v.startsWith('2001:db8:'));
  }
  return false;
}
async function isPublicURL(target) {
  try {
    const u = new URL(target);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return false;
    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g,'').replace(/\.$/,'');
    if (host === 'localhost' || /\.(localhost|local|internal|test|invalid)$/.test(host)) return false;
    const results = await dns.lookup(host, { all: true });
    return results.length > 0 && results.every(item => isPublicIP(item.address));
  } catch { return false; }
}
function tokenFor(req) {
  const cookie = (req.headers.cookie || '').split(';').map(c => c.trim()).find(c => c.startsWith('ryftipe='));
  return cookie ? cookie.substring('ryftipe='.length) : '';
}
function authorized(req) {
  if (!PASSWORD) return true;
  const token = tokenFor(req);
  return Boolean(token && activeTokens.get(token) > Date.now());
}
function json(res, status, result) {
  res.writeHead(status, { 'Content-Type':'application/json', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
  res.end(JSON.stringify(result));
}
const server = http.createServer(async (req, res) => {
  if (req.url === '/health') return json(res, 200, { ok:true });
  if (req.url === '/api/auth') return json(res, 200, { authenticated:authorized(req), loginRequired:Boolean(PASSWORD) });
  if (req.url === '/api/login' && req.method === 'POST') {
    if (!PASSWORD) return json(res, 200, { ok:true });
    let body = '';
    for await (const chunk of req) {
      body += chunk.toString();
      if (body.length > 4096) return json(res, 413, { error:'Request too large' });
    }
    let candidate = '';
    try { candidate = String(JSON.parse(body).password || ''); }
    catch { return json(res, 400, { error:'Invalid JSON' }); }
    const a = Buffer.from(candidate), b = Buffer.from(PASSWORD);
    if (a.length !== b.length || !crypto.timingSafeEqual(a,b)) return json(res,401,{ error:'Invalid password' });
    const token = crypto.randomBytes(32).toString('hex');
    activeTokens.set(token, Date.now() + 43200000);
    res.setHeader('Set-Cookie', 'ryftipe=' + token + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200' + (process.env.NODE_ENV === 'production' ? '; Secure' : ''));
    return json(res,200,{ok:true});
  }
  if (req.url === '/api/logout' && req.method === 'POST') {
    if (!PASSWORD) return json(res,200,{ok:true});
    activeTokens.delete(tokenFor(req));
    res.setHeader('Set-Cookie','ryftipe=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
    return json(res,200,{ok:true});
  }
  if (req.url === '/api/diagnostics' && req.method === 'GET') {
    try{await ensureBrowser();}catch{return json(res,503,{error:'Chromium fallback unavailable'});}
    if (!authorized(req)) return json(res,401,{error:'Unauthorized'});
    try {
      const session=await browser.newBrowserCDPSession();
      try {
        const gpu=await session.send('SystemInfo.getInfo');
        const devices=(gpu.gpu?.devices || []).map(device=>({
          vendorId:device.vendorId,deviceId:device.deviceId,
          vendorString:device.vendorString,deviceString:device.deviceString,
          driverVendor:device.driverVendor,driverVersion:device.driverVersion
        }));
        return json(res,200,{
          browserVersion:browser.version(),
          platform:process.platform,architecture:process.arch,
          cpuCount:(await import('node:os')).cpus().length,
          devices,featureStatus:gpu.gpu?.featureStatus || {},
          auxAttributes:gpu.gpu?.auxAttributes || {},
          memoryUsedMB:Math.round(process.memoryUsage().rss/1048576),
          stream:'Chromium CDP JPEG screencast',audio:false
        });
      } finally { await session.detach().catch(()=>{}); }
    } catch(err) { return json(res,503,{error:'GPU diagnostics unavailable',detail:String(err.message).slice(0,180)}); }
  }
  if(req.url?.startsWith('/api/rte/')){if(!authorized(req))return json(res,401,{error:'Unauthorized'});return handleRTE(req,res);}
  const resources = { '/':'index.html','/app.js':'app.js','/rte.js':'rte.js','/rte-css.js':'rte-css.js','/rte-layout.js':'rte-layout.js','/rte-tracks.js':'rte-tracks.js','/rte-forms.js':'rte-forms.js','/rte-media.js':'rte-media.js','/rte-platform.js':'rte-platform.js','/rte-modules.js':'rte-modules.js','/rte-bridge.js':'rte-bridge.js','/rte-gradients.js':'rte-gradients.js','/rte-controls.js':'rte-controls.js','/rte-box.js':'rte-box.js','/rte-document.js':'rte-document.js','/rte-snapshot.js':'rte-snapshot.js','/rte-storage.js':'rte-storage.js','/browser-features.js':'browser-features.js','/browser-ui.js':'browser-ui.js','/rte-runtime.js':'rte-runtime.js','/sandbox.html':'sandbox.html','/style.css':'style.css' };
  if (req.method !== 'GET' || !resources[req.url]) return json(res,404,{error:'Not found'});
  const filename = resources[req.url];
  const sandbox=filename==='sandbox.html';
  res.writeHead(200, { 'Content-Type': filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.css') ? 'text/css' : 'text/html',
    'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':sandbox?"default-src 'none'; script-src 'unsafe-inline' blob:; connect-src 'none'; img-src 'none'; style-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';":"default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data: https: http:; media-src https: http: blob:; style-src 'self' blob:; style-src-elem 'self' blob: https: http:; style-src-attr 'unsafe-inline'; font-src https: http: data: blob:; script-src 'self'; frame-src 'self'; object-src 'none'; frame-ancestors 'none'" });
  fs.createReadStream(path.join(root,'public',filename)).pipe(res);
});
const wss = new WebSocketServer({ noServer:true });
server.on('upgrade', async (req,socket,head) => {
  let validOrigin = false;
  try { validOrigin = new URL(req.headers.origin).host === req.headers.host; } catch {}
  if (req.url !== '/stream' || !validOrigin || !authorized(req) || wss.clients.size >= MAX_CLIENTS) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  try{await ensureBrowser();}catch{socket.destroy();return;}
  if(socket.destroyed)return;
  wss.handleUpgrade(req,socket,head,ws => wss.emit('connection',ws));
});
const tell = (ws, message) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message)); };
wss.on('connection', async ws => {
  let context, page, cdp, closed=false, quality=82, resolution=1, lastResize=0;
  let frames=0, bytes=0, metricTimer, lastMetrics=Date.now();
  let lastFrame=0, framePending=false, screencastActive=false;
  const say = value => tell(ws,value);
  async function startCast() {
    if (!cdp || closed) return;
    if (screencastActive) await cdp.send('Page.stopScreencast').catch(()=>{});
    screencastActive = true;
    await cdp.send('Page.startScreencast', {format:'jpeg',quality,maxWidth:Math.round((page.viewportSize()?.width||1280)*resolution),maxHeight:Math.round((page.viewportSize()?.height||720)*resolution),everyNthFrame:1});
  }
  async function close() {
    if (closed) return;
    closed=true;
    clearInterval(metricTimer);
    await cdp?.send('Page.stopScreencast').catch(()=>{});
    await cdp?.detach().catch(()=>{});
    await context?.close().catch(()=>{});
  }
  ws.on('close',close);
  ws.on('error',()=>{});
  try {
    context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1,acceptDownloads:false});
    await context.route('**/*',async route=>{
      const requestURL=route.request().url();
      if (!await isPublicURL(requestURL)) return route.abort().catch(()=>{});
      return route.continue().catch(()=>{});
    });
    page=await context.newPage();
    page.on('framenavigated',frame=>{if(frame===page.mainFrame())say({type:'location',url:frame.url()});});
    page.on('domcontentloaded',()=>say({type:'title',title:page.url()}));
    page.on('crash',()=>say({type:'error',message:'Chromium tab crashed; reload to restart'}));
    cdp=await context.newCDPSession(page);
    await cdp.send('Page.enable');
    cdp.on('Page.screencastFrame',async ({data,sessionId})=>{
      // Always acknowledge frames to let Chromium send its next frame.
      cdp.send('Page.screencastFrameAck',{sessionId}).catch(()=>{});
      if(closed || ws.readyState!==WebSocket.OPEN) return;
      // Drop instead of queueing stale frames on slow connections.
      const now=Date.now();
      if(ws.bufferedAmount>768*1024 || now-lastFrame<33 || framePending)return;
      lastFrame=now;
      framePending=true;
      try {
        const payload=Buffer.from(data,'base64');
        if(ws.readyState===WebSocket.OPEN && ws.bufferedAmount<768*1024){
          ws.send(payload,{binary:true},()=>{framePending=false;});
          frames++;bytes+=payload.length;
        } else framePending=false;
      }catch{framePending=false;}
    });
    await startCast();
    // A Chromium session starts on about:blank. The Ryftipe homepage stays the
    // visible startup surface until the user explicitly navigates elsewhere.
    if(closed)return;
    say({type:'ready',quality,resolution,transport:'binary-cdp'});
    metricTimer=setInterval(()=>{
      const now=Date.now(),seconds=Math.max(0.1,(now-lastMetrics)/1000);
      say({type:'metrics',fps:Math.round(frames/seconds),kbps:Math.round(bytes*8/1024/seconds),quality});
      frames=0;bytes=0;lastMetrics=now;
    },2000);
    ws.on('message',async raw=>{
      if(closed || raw.length>16000)return;
      let msg;
      try{msg=JSON.parse(raw.toString());}catch{return;}
      try{
        if(msg.type==='navigate'){
          let target=String(msg.url||'').trim();
          if(!/^https?:\/\//i.test(target))target='https://'+target;
          if(!await isPublicURL(target))throw Error('Only public HTTP(S) URLs are supported');
          await page.goto(target,{waitUntil:'domcontentloaded',timeout:20000});
        } else if(msg.type==='back')await page.goBack({waitUntil:'domcontentloaded',timeout:15000});
        else if(msg.type==='forward')await page.goForward({waitUntil:'domcontentloaded',timeout:15000});
        else if(msg.type==='reload')await page.reload({waitUntil:'domcontentloaded',timeout:15000});
        else if(msg.type==='click'&&Number.isFinite(msg.x)&&Number.isFinite(msg.y))
          await page.mouse.click(Math.max(0,Math.min(1920,msg.x)),Math.max(0,Math.min(1200,msg.y)));
        else if(msg.type==='move'&&Number.isFinite(msg.x)&&Number.isFinite(msg.y))
          await page.mouse.move(Math.max(0,Math.min(1920,msg.x)),Math.max(0,Math.min(1200,msg.y)));
        else if(msg.type==='scroll'&&Number.isFinite(msg.dx)&&Number.isFinite(msg.dy))
          await page.mouse.wheel(Math.max(-1200,Math.min(1200,msg.dx)),Math.max(-1200,Math.min(1200,msg.dy)));
        else if(msg.type==='key'&&typeof msg.key==='string'&&msg.key.length<80)
          await page.keyboard.press(msg.key);
        else if(msg.type==='text'&&typeof msg.text==='string'&&msg.text.length<2048)
          await page.keyboard.insertText(msg.text);
        else if(msg.type==='resize'){
          const width=Math.round(Number(msg.width)),height=Math.round(Number(msg.height));
          if(width>=320&&width<=1920&&height>=240&&height<=1200&&Date.now()-lastResize>80){
            lastResize=Date.now();
            await page.setViewportSize({width,height});
            await startCast();
          }
        } else if(msg.type==='quality'){
          if(['balanced','sharp','fast'].includes(msg.preset)){
            quality=msg.preset==='sharp'?92:msg.preset==='fast'?62:82;
            resolution=msg.preset==='fast'?0.85:1;
            await startCast();
            say({type:'quality',preset:msg.preset,quality});
          }
        }
      }catch(err){say({type:'error',message:String(err.message).slice(0,180)});}
    });
  }catch(err){say({type:'error',message:'Remote browser failed to initialize: '+String(err.message).slice(0,100)});await close();}
});
// Chromium starts lazily only when the user chooses the fallback engine.
server.listen(PORT,'0.0.0.0',()=>console.log('Ryftipe listening on '+PORT));
async function shutdown() { wss.clients.forEach(ws=>ws.close()); server.close(); await browser?.close(); process.exit(0); }
process.on('SIGINT',shutdown); process.on('SIGTERM',shutdown);
