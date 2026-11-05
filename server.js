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
  const resources = { '/':'index.html','/app.js':'app.js','/style.css':'style.css' };
  if (req.method !== 'GET' || !resources[req.url]) return json(res,404,{error:'Not found'});
  const filename = resources[req.url];
  res.writeHead(200, { 'Content-Type': filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.css') ? 'text/css' : 'text/html',
    'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':"default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'" });
  fs.createReadStream(path.join(root,'public',filename)).pipe(res);
});
const wss = new WebSocketServer({ noServer:true });
server.on('upgrade', (req,socket,head) => {
  let validOrigin = false;
  try { validOrigin = new URL(req.headers.origin).host === req.headers.host; } catch {}
  if (req.url !== '/stream' || !validOrigin || !authorized(req) || wss.clients.size >= MAX_CLIENTS) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req,socket,head,ws => wss.emit('connection',ws));
});
const tell = (ws, message) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message)); };
wss.on('connection', async ws => {
  let context, page, timer, busy = false;
  const cleanup = async () => { clearInterval(timer); if (context) await context.close().catch(()=>{}); };
  ws.on('close',cleanup);
  try {
    context = await browser.newContext({viewport:{width:1280,height:720},acceptDownloads:false});
    await context.route('**/*', async route => {
      if (!await isPublicURL(route.request().url())) return route.abort().catch(()=>{});
      return route.continue().catch(()=>{});
    });
    page = await context.newPage();
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) tell(ws,{type:'location',url:frame.url()});
    });
    await page.goto('https://example.com',{waitUntil:'domcontentloaded',timeout:20000}).catch(()=>{});
    if (ws.readyState !== WebSocket.OPEN) return cleanup();
    tell(ws,{type:'ready'});
    timer = setInterval(async () => {
      if (busy || ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > 1_000_000) return;
      busy = true;
      try {
        const screenshot = await page.screenshot({type:'jpeg',quality:55,animations:'disabled',timeout:4000});
        tell(ws,{type:'frame',jpeg:screenshot.toString('base64')});
      } catch {}
      finally { busy = false; }
    },250);
    ws.on('message', async raw => {
      if (raw.length > 16000) return;
      let msg;
      try { msg=JSON.parse(raw.toString()); } catch { return; }
      try {
        if (msg.type === 'navigate') {
          let url = String(msg.url || '').trim();
          if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
          if (!await isPublicURL(url)) throw Error('Only public HTTP(S) URLs are allowed');
          await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000});
        } else if (msg.type === 'back') await page.goBack({waitUntil:'domcontentloaded',timeout:15000});
        else if (msg.type === 'forward') await page.goForward({waitUntil:'domcontentloaded',timeout:15000});
        else if (msg.type === 'reload') await page.reload({waitUntil:'domcontentloaded',timeout:15000});
        else if (msg.type === 'click' && Number.isFinite(msg.x) && Number.isFinite(msg.y))
          await page.mouse.click(Math.max(0,Math.min(1920,msg.x)),Math.max(0,Math.min(1200,msg.y)));
        else if (msg.type === 'scroll' && Number.isFinite(msg.dx) && Number.isFinite(msg.dy))
          await page.mouse.wheel(Math.max(-1000,Math.min(1000,msg.dx)),Math.max(-1000,Math.min(1000,msg.dy)));
        else if (msg.type === 'key' && typeof msg.key === 'string' && msg.key.length < 80)
          await page.keyboard.press(msg.key);
        else if (msg.type === 'text' && typeof msg.text === 'string' && msg.text.length < 2048)
          await page.keyboard.insertText(msg.text);
        else if (msg.type === 'resize') {
          const width=Math.round(Number(msg.width)),height=Math.round(Number(msg.height));
          if (width>=320 && width<=1920 && height>=240 && height<=1200) await page.setViewportSize({width,height});
        }
      } catch(err) { tell(ws,{type:'error',message:String(err.message).slice(0,180)}); }
    });
  } catch(err) { tell(ws,{type:'error',message:'Browser initialization failed'}); await cleanup(); }
});
browser = await chromium.launch({headless:true});
server.listen(PORT,'0.0.0.0',()=>console.log('Ryftipe listening on '+PORT));
async function shutdown() { wss.clients.forEach(ws=>ws.close()); server.close(); await browser.close(); process.exit(0); }
process.on('SIGINT',shutdown); process.on('SIGTERM',shutdown);
