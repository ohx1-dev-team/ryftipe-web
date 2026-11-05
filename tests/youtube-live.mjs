// Ryftipe Web live YouTube probe. Informational test: DO NOT interpret fixture tests as YouTube support.
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import net from 'node:net';
import {chromium} from 'playwright';
const VIDEO='https://www.youtube.com/watch?v=jNQXAC9IVRw'; // "Me at the zoo" public test URL
async function freePort(){
 const srv=net.createServer();
 await new Promise(resolve=>srv.listen(0,'127.0.0.1',resolve));
 const port=srv.address().port;
 await new Promise(resolve=>srv.close(resolve));
 return port;
}
const port=await freePort();
const root='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port),RYFTIPE_PASSWORD:''},stdio:['ignore','pipe','pipe']});
let stderr='';server.stderr.on('data',chunk=>{stderr+=chunk.toString().slice(0,1200);});
let browser,record={video:VIDEO,status:'not-tested',playback:false};
try{
 let healthy=false;
 for(let i=0;i<40;i++){
  if(server.exitCode!==null)throw Error('Ryftipe server exited early: '+stderr.slice(0,250));
  try{const response=await fetch(root+'/health',{signal:AbortSignal.timeout(700)});if(response.ok){healthy=true;break;}}catch{}
  await delay(200);
 }
 if(!healthy)throw Error('Ryftipe server startup timed out');
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 const errors=[];page.on('pageerror',e=>errors.push(String(e.message).slice(0,180)));
 await page.goto(root,{waitUntil:'domcontentloaded',timeout:12000});
 await page.waitForSelector('#browser:not([hidden])',{timeout:10000});
 await page.locator('#url').fill(VIDEO);
 await page.locator('#url').press('Enter');
 await delay(18000);
 const initial=await page.evaluate(()=>{
  const video=document.querySelector('.rte-media-layer video');
  const notice=document.querySelector('#notice');
  return {rteCanvasVisible:!document.querySelector('#rte-screen')?.hidden,videoElements:document.querySelectorAll('.rte-media-layer video').length,readyState:video?.readyState??0,currentTime:video?.currentTime??0,notice:notice&&!notice.hidden?notice.textContent:'',compatibility:!document.querySelector('#rte-warning')?.hidden,documentTitle:document.title};
 });
 record={...initial,status:initial.videoElements?'video-present':'video-not-present',errors:errors.slice(0,6)};
 if(initial.videoElements){
  await page.evaluate(()=>document.querySelector('.rte-media-layer video')?.play().catch(()=>{}));
  await delay(3200);
  const after=await page.evaluate(()=>{const video=document.querySelector('.rte-media-layer video');return {readyState:video?.readyState||0,currentTime:video?.currentTime||0,errorCode:video?.error?.code||null};});
  record={...record,after,playback:after.currentTime>initial.currentTime+.5&&after.readyState>=2};
 }else record.playback=false;
 console.log('YOUTUBE_RTE_PROBE '+JSON.stringify(record));
 if(!record.playback){
  console.log('RESULT: NOT PLAYABLE IN RTE. Network restrictions and missing browser APIs are possible contributing factors.');
  process.exitCode=1;
 }else console.log('RESULT: Playback advanced; additional tests required for site features and normal-browser performance.');
}catch(error){record={...record,status:'probe-failed',error:String(error.message||error).slice(0,250),playback:false};console.log('YOUTUBE_RTE_PROBE '+JSON.stringify(record));process.exitCode=1;}
finally{
 await browser?.close();
 server.kill('SIGTERM');
 await Promise.race([new Promise(resolve=>server.once('exit',resolve)),delay(2500)]);
 if(server.exitCode===null)server.kill('SIGKILL');
}
