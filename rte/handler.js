import {loadPage,fetchResource} from './engine.js';
export async function handleRTE(req,res){
 const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
 try{
  if(req.method!=='GET')return send(405,{error:'GET required'});
  const u=new URL(req.url,'http://localhost'),raw=u.searchParams.get('url');
  if(!raw||raw.length>2000)return send(400,{error:'Invalid URL'});
  if(u.pathname==='/api/rte/document')return send(200,await loadPage(raw));
  if(u.pathname==='/api/rte/image'){const image=await fetchResource(raw,'image');res.writeHead(200,{'Content-Type':image.type.split(';')[0],'Cache-Control':'private, max-age=120','X-Content-Type-Options':'nosniff'});return res.end(image.body);}
  return send(404,{error:'Unknown endpoint'});
 }catch(e){return send(422,{error:String(e.message||e).slice(0,200)});}
}
