// Live nohello.org rendering probe. Informational because external sites can change or block CI.
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import net from 'node:net';
import {chromium} from 'playwright';
const target='https://nohello.org/';
const listen=net.createServer();await new Promise(resolve=>listen.listen(0,'127.0.0.1',resolve));
const port=listen.address().port;await new Promise(resolve=>listen.close(resolve));
const server=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port),RYFTIPE_PASSWORD:''},stdio:['ignore','pipe','pipe']});
let logs='';server.stderr.on('data',c=>logs+=String(c).slice(0,1000));
let browser;const result={site:target,status:'unknown'};
try{
 let up=false;
 for(let i=0;i<40;i++){
  if(server.exitCode!==null)throw Error('Server exited: '+logs.slice(0,300));
  try{const r=await fetch('http://127.0.0.1:'+port+'/health',{signal:AbortSignal.timeout(600)});if(r.ok){up=true;break;}}catch{}
  await delay(200);
 }
 if(!up)throw Error('Server did not become healthy');
 const root='http://127.0.0.1:'+port;
 try{
  const r=await fetch(root+'/api/rte/document?url='+encodeURIComponent(target),{signal:AbortSignal.timeout(25000)});
  const page=await r.json();
  if(!r.ok)result.loaderError=page.error||r.status;
  else{
   const count=(node)=>node?((typeof node.text==='string'&&node.text.trim()?1:0)+(node.children||[]).reduce((n,c)=>n+count(c),0)):0;
   result.document={title:page.title,htmlTextNodes:count(page.dom),cssCharacters:page.css?.length||0,stylesheets:page.stylesheets,scriptCount:page.scripts?.length||0};
  }
 }catch(error){result.loaderError=String(error.message).slice(0,140);}
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const tab=await browser.newPage({viewport:{width:1024,height:768}});
 const errors=[];tab.on('pageerror',e=>errors.push(e.message.slice(0,120)));
 await tab.goto(root,{waitUntil:'domcontentloaded',timeout:15000});
 await tab.waitForSelector('#browser:not([hidden])',{timeout:12000});
 await tab.locator('#url').fill(target);
 await tab.locator('#url').press('Enter');
 await delay(10000);
 await tab.waitForFunction(()=>{
  const frame=document.querySelector('#rte-document');
  return frame&&!frame.hidden&&frame.contentDocument?.readyState==='complete'&&frame.contentDocument?.body;
 },null,{timeout:8000}).catch(()=>{});
 result.render=await tab.evaluate(()=>{
  const frame=document.querySelector('#rte-document'),doc=frame?.contentDocument;
  const body=doc?.body,heading=doc?.querySelector('h1');
  const main=doc?.querySelector('main'),rect=main?.getBoundingClientRect();
  const links=doc?[...doc.querySelectorAll('a[href]')]:[];
  const computed=heading&&frame?.contentWindow?.getComputedStyle(heading);
  return {
   mode:frame&&!frame.hidden?'document':'canvas',
   activeURL:document.getElementById('url')?.value,
   documentReady:doc?.readyState||'unavailable',
   heading:heading?.textContent?.slice(0,100)||'',
   visibleTextCharacters:body?.innerText?.trim().length||0,
   domNodes:doc?.querySelectorAll('*')?.length||0,
   links:links.length,
   stylesheetCount:doc?.styleSheets?.length||0,
   mainWidth:rect?Math.round(rect.width):null,
   mainOffsetX:rect?Math.round(rect.x):null,
   headingFont:computed?.fontFamily||'',
   notice:document.getElementById('notice')?.textContent||''
  };
 });
 try{
  const frame=tab.locator('#rte-document');
  if(await frame.count()&&!result.render?.notice)await frame.screenshot({path:'nohello-rte.png',timeout:5000});
 }catch(error){result.screenshotError=String(error.message).slice(0,140);}
 result.browserErrors=errors.slice(0,6);
 result.status=result.render?.mode==='document'&&result.render?.visibleTextCharacters>100&&result.render?.domNodes>20?'document-rendered':'render-incomplete';
 console.log('NOHELLO_RTE_PROBE '+JSON.stringify(result));
}catch(error){result.status='probe-error';result.error=String(error.message||error).slice(0,250);console.log('NOHELLO_RTE_PROBE '+JSON.stringify(result));process.exitCode=1;}
finally{await browser?.close();server.kill('SIGTERM');await Promise.race([new Promise(resolve=>server.once('exit',resolve)),delay(1800)]);if(server.exitCode===null)server.kill('SIGKILL');}
