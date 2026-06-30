const express = require('express');
const https   = require('https');
const http    = require('http');
const path    = require('path');
const fs      = require('fs');
try { require('dotenv').config(); } catch(e){}

const app  = express();
const PORT = process.env.PORT || 3000;
const TMDB_TOKEN = (process.env.TMDB_TOKEN||'').trim();

console.log('ShockTV | PORT:',PORT,'| TOKEN:',TMDB_TOKEN?'OK':'MISSING');

app.use(express.static(path.join(__dirname,'public'),{index:false}));
app.get('/',serveIndex); app.get('/index.html',serveIndex);
function serveIndex(req,res){
  let html=fs.readFileSync(path.join(__dirname,'public','index.html'),'utf8');
  html=html.replace('</head>',`<script>window.__TMDB_TOKEN__="${TMDB_TOKEN}";</script></head>`);
  res.setHeader('Content-Type','text/html').send(html);
}

// Helper HTTP
function fetch2(url,headers={}){
  return new Promise((res,rej)=>{
    const u=new URL(url);
    const lib=u.protocol==='https:'?https:http;
    const req=lib.request({hostname:u.hostname,path:u.pathname+u.search,method:'GET',
      headers:{'User-Agent':'Mozilla/5.0','Accept':'text/html,application/json',
               'Accept-Language':'es-ES,es;q=0.9',...headers}},r=>{
      if(r.statusCode>=300&&r.statusCode<400&&r.headers.location)
        return fetch2(r.headers.location,headers).then(res).catch(rej);
      let d=''; r.on('data',c=>d+=c); r.on('end',()=>res({s:r.statusCode,b:d,h:r.headers}));
    });
    req.on('error',rej); req.setTimeout(12000,()=>{req.destroy();rej(new Error('timeout'));}); req.end();
  });
}

// ── AnimeFLV scraper — buscar anime y obtener embed ──
// GET /api/flv/search?q=one+piece
app.get('/api/flv/search',async(req,res)=>{
  const q=(req.query.q||'').trim();
  if(!q) return res.json([]);
  try{
    const r=await fetch2(`https://www3.animeflv.net/browse?q=${encodeURIComponent(q)}`);
    const html=r.b;
    // Extraer resultados: cada item tiene id/titulo/portada
    const matches=[...html.matchAll(/href="\/anime\/([^"]+)"[\s\S]*?<img[^>]+src="([^"]+)"[\s\S]*?<h3[^>]*>([^<]+)<\/h3>/g)];
    const results=matches.slice(0,8).map(m=>({
      id:m[1], poster:m[2].startsWith('http')?m[2]:'https://www3.animeflv.net'+m[2], title:m[3].trim()
    }));
    res.json(results);
  }catch(e){res.status(500).json({error:e.message});}
});

// GET /api/flv/embed?id=one-piece&ep=1
app.get('/api/flv/embed',async(req,res)=>{
  const {id,ep=1}=req.query;
  if(!id) return res.status(400).json({error:'id required'});
  try{
    const r=await fetch2(`https://www3.animeflv.net/ver/${id}-${ep}`);
    const html=r.b;
    if(r.s===404||html.includes('404')) return res.status(404).json({error:'not found'});
    // Extraer los servers del script
    const scriptMatch=html.match(/var\s+videos\s*=\s*(\{[^;]+\})/);
    let servers=[];
    if(scriptMatch){
      try{
        const vids=eval('('+scriptMatch[1]+')'); // eslint-disable-line
        const sub=vids.SUB||vids.sub||[];
        const lat=vids.LAT||vids.lat||[];
        // Preferir latino
        servers=[...lat,...sub];
      }catch(e){}
    }
    // Extraer embeds individuales como fallback
    const embedMatches=[...html.matchAll(/src="(https?:\/\/(?:www3\.animeflv\.net\/embed|streamani|ok\.ru\/videoembed)[^"]+)"/g)];
    embedMatches.forEach(m=>{if(!servers.find(s=>s.code===m[1]))servers.push({title:'Direct',code:m[1]});});
    
    // Buscar el embed de animeflv propio
    const ownEmbed=html.match(/embed\.php\?[^"]+/);
    if(ownEmbed) servers.unshift({title:'AnimeFLV',code:'https://www3.animeflv.net/'+ownEmbed[0]});

    res.json({id,ep:parseInt(ep),servers,page:`https://www3.animeflv.net/ver/${id}-${ep}`});
  }catch(e){res.status(500).json({error:e.message});}
});

// GET /api/flv/info?id=one-piece  — info + lista de eps
app.get('/api/flv/info',async(req,res)=>{
  const {id}=req.query; if(!id) return res.status(400).json({error:'id required'});
  try{
    const r=await fetch2(`https://www3.animeflv.net/anime/${id}`);
    const html=r.b;
    // Título, sinopsis, imagen
    const title=(html.match(/<h1[^>]*class="Title"[^>]*>([^<]+)<\/h1>/)||html.match(/<h2[^>]*>([^<]+)<\/h2>/)|| ['',''])[1].trim();
    const syn=(html.match(/<div[^>]*class="Description"[^>]*><p>([^<]+)/)||['',''])[1].trim();
    const img=(html.match(/<img[^>]*class="img-fluid"[^>]*src="([^"]+)"/)||['',''])[1];
    // Episodios: buscar lista
    const epsMatch=[...html.matchAll(/href="\/ver\/[^-]+-(\d+)"/g)];
    const eps=[...new Set(epsMatch.map(m=>parseInt(m[1])))].sort((a,b)=>a-b);
    res.json({id,title,synopsis:syn,image:img?( img.startsWith('http')?img:'https://www3.animeflv.net'+img):'',episodes:eps});
  }catch(e){res.status(500).json({error:e.message});}
});

app.get('/api/health',(req,res)=>res.json({status:'ok',token:!!TMDB_TOKEN}));
app.get('/api/token',(req,res)=>{
  if(!TMDB_TOKEN)return res.status(500).json({error:'TMDB_TOKEN not set'});
  res.json({token:TMDB_TOKEN});
});
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

app.listen(PORT,'0.0.0.0',()=>console.log(`✅ ShockTV :${PORT}`));
