const express = require('express');
const path    = require('path');
const fs      = require('fs');
try { require('dotenv').config(); } catch(e){}

const app  = express();
const PORT = process.env.PORT || 3000;
const TMDB_TOKEN = (process.env.TMDB_TOKEN||'').trim();

console.log('ShockTV | PORT:', PORT, '| TOKEN:', TMDB_TOKEN ? 'OK' : 'MISSING');

// ── Importar animeflv-api (si está disponible) ──
let flvApi = null;
try {
  flvApi = require('animeflv-api');
  console.log('✅ animeflv-api cargado');
} catch(e) {
  console.warn('⚠️  animeflv-api no disponible, usando scraper manual');
}

// ── Static + inject token ──
app.use(express.static(path.join(__dirname,'public'),{index:false}));
app.get('/', serveIndex);
app.get('/index.html', serveIndex);
function serveIndex(req,res){
  let html = fs.readFileSync(path.join(__dirname,'public','index.html'),'utf8');
  html = html.replace('</head>',`<script>window.__TMDB_TOKEN__="${TMDB_TOKEN}";</script></head>`);
  res.setHeader('Content-Type','text/html').send(html);
}

// ── Health ──
app.get('/api/health',(req,res)=>res.json({status:'ok',token:!!TMDB_TOKEN,flv:!!flvApi}));
app.get('/api/token',(req,res)=>{
  if(!TMDB_TOKEN) return res.status(500).json({error:'TMDB_TOKEN not set'});
  res.json({token:TMDB_TOKEN});
});

// ── AnimeFLV: buscar anime ──
// GET /api/anime/search?q=naruto
app.get('/api/anime/search', async(req,res)=>{
  const q = (req.query.q||'').trim();
  if(!q) return res.json({data:[]});
  if(!flvApi) return res.status(503).json({error:'flv not available'});
  try {
    const result = await flvApi.searchAnime(q);
    // Normalizar campos
    const data = (result?.data||[]).map(a=>({
      id:    a.id,
      title: a.title,
      cover: a.cover,
      synopsis: a.synopsis||'',
      rating: a.rating||'',
      type:  a.type||'Anime',
      url:   a.url||''
    }));
    res.json({data});
  } catch(e) {
    console.error('[/api/anime/search]', e.message);
    res.status(500).json({error:e.message});
  }
});

// ── AnimeFLV: info de anime (sinopsis, géneros, episodios) ──
// GET /api/anime/info?id=one-piece-tv
app.get('/api/anime/info', async(req,res)=>{
  const id = (req.query.id||'').trim();
  if(!id) return res.status(400).json({error:'id required'});
  if(!flvApi) return res.status(503).json({error:'flv not available'});
  try {
    const info = await flvApi.getAnimeInfo(id);
    res.json({
      id,
      title:    info.title||'',
      synopsis: info.synopsis||'',
      cover:    info.cover||'',
      rating:   info.rating||'',
      genres:   info.genres||[],
      status:   info.status||'',
      episodes: (info.episodes||[]).map(e=>({index:e.index,id:e.id}))
    });
  } catch(e) {
    console.error('[/api/anime/info]', e.message);
    res.status(500).json({error:e.message});
  }
});

// ── AnimeFLV: videos de un episodio ──
// GET /api/anime/episode?id=one-piece-tv&ep=1
app.get('/api/anime/episode', async(req,res)=>{
  const animeId = (req.query.id||'').trim();
  const ep      = parseInt(req.query.ep)||1;
  if(!animeId) return res.status(400).json({error:'id required'});
  if(!flvApi)  return res.status(503).json({error:'flv not available'});
  try {
    // animeflv-api devuelve los servidores de video para el episodio
    const videos = await flvApi.getEpisodeVideos(ep, animeId);
    // videos es un array de arrays [[server1, server2, ...], [sub], [lat]]
    // o un array plano de URLs/objetos
    let servers = [];
    if(Array.isArray(videos)){
      // Puede ser array plano de strings (URLs) o array de objetos
      const flat = videos.flat ? videos.flat(2) : videos;
      servers = flat
        .filter(v => v && (typeof v === 'string' || v.code || v.url))
        .map(v => typeof v === 'string' ? {code:v,title:'Server'} : {code:v.code||v.url||'',title:v.title||v.server||'Server'});
    }
    res.json({animeId, ep, servers});
  } catch(e) {
    console.error('[/api/anime/episode]', e.message);
    res.status(500).json({error:e.message});
  }
});

// ── AnimeFLV: últimos episodios (home anime) ──
// GET /api/anime/latest
app.get('/api/anime/latest', async(req,res)=>{
  if(!flvApi) return res.status(503).json({error:'flv not available'});
  try {
    const latest = await flvApi.getLatest();
    const data = (latest||[]).map(a=>({
      title:   a.title||'',
      chapter: a.chapter||1,
      cover:   a.cover||'',
      url:     a.url||'',
      id:      (a.url||'').replace('https://www3.animeflv.net/ver/','').replace(/-\d+$/,'')
    }));
    res.json({data});
  } catch(e) {
    res.status(500).json({error:e.message});
  }
});

// ── AnimeFLV: anime en emisión ──
// GET /api/anime/onair
app.get('/api/anime/onair', async(req,res)=>{
  if(!flvApi) return res.status(503).json({error:'flv not available'});
  try {
    const onair = await flvApi.getOnAir();
    res.json({data: onair||[]});
  } catch(e) {
    res.status(500).json({error:e.message});
  }
});

// ── SPA fallback ──
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,'0.0.0.0',()=>console.log(`✅ ShockTV :${PORT}`));
