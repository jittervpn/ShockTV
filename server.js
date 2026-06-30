// ═══════════════════════════════════════════════
//  ShockTV Server — TMDB proxy + Anime1v API
// ═══════════════════════════════════════════════
require('dotenv').config();
const express = require('express');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;
const TMDB_TOKEN  = (process.env.TMDB_TOKEN  || '').trim();
// Anime1v API Key interna — usamos una fija ya que es nuestro propio servidor
const ANIME_KEY   = process.env.ANIME_API_KEY || 'shocktv-internal-key';

app.use(express.json());

// ── Archivos estáticos ──
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.get('/', serveIndex);
app.get('/index.html', serveIndex);
function serveIndex(req, res) {
  let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  html = html.replace('</head>',
    `<script>window.__TMDB_TOKEN__="${TMDB_TOKEN}";window.__ANIME_KEY__="${ANIME_KEY}";</script></head>`);
  res.setHeader('Content-Type', 'text/html').send(html);
}

// ── Health / Token ──
app.get('/api/health', (req, res) => res.json({ status:'ok', tmdb:!!TMDB_TOKEN }));
app.get('/api/token',  (req, res) => {
  if (!TMDB_TOKEN) return res.status(500).json({ error:'TMDB_TOKEN not set' });
  res.json({ token: TMDB_TOKEN, animeKey: ANIME_KEY });
});

// ══════════════════════════════════════════════
//  ANIME1V API — rutas integradas
//  Endpoints:
//    GET /api/anime/search?q=naruto
//    GET /api/anime/info?url=https://animeav1.com/media/naruto
//    GET /api/anime/episode?url=https://animeav1.com/media/naruto/1
//    GET /api/anime/catalog?page=1
// ══════════════════════════════════════════════
const { ApiError } = require('./src/utils/api-error');
const animeService = require('./src/services/anime.service');

function asyncH(fn) {
  return async (req, res, next) => {
    try { await fn(req, res, next); }
    catch(e) { next(e); }
  };
}

// Auth simple: la key que inyectamos nosotros mismos
function authAnime(req, res, next) {
  const key = req.header('x-api-key') || req.query.apiKey || '';
  if (key !== ANIME_KEY) {
    return res.status(401).json({ success:false, message:'API Key inválida' });
  }
  req.apiKey = key;
  next();
}

app.get('/api/anime/search', authAnime, asyncH(async (req, res) => {
  const { q, domain } = req.query;
  if (!q) return res.status(400).json({ success:false, message:'Falta parámetro q' });
  const data = await animeService.searchAnime(q, domain);
  res.json(data);
}));

app.get('/api/anime/info', authAnime, asyncH(async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ success:false, message:'Falta parámetro url' });
  const data = await animeService.getAnimeInfo(url);
  res.json(data);
}));

app.get('/api/anime/episode', authAnime, asyncH(async (req, res) => {
  const { url, includeMega, excludeServers } = req.query;
  if (!url) return res.status(400).json({ success:false, message:'Falta parámetro url' });
  const data = await animeService.getEpisodeLinks(url, includeMega, excludeServers);
  res.json(data);
}));

app.get('/api/anime/catalog', authAnime, asyncH(async (req, res) => {
  const data = await animeService.getCatalog?.(req.query.page, req.query.genre)
    || { success:false, message:'No soportado' };
  res.json(data);
}));

// Error handler
app.use((err, req, res, next) => {
  const status = err.statusCode || 500;
  res.status(status).json({ success:false, message: err.message || 'Error interno' });
});

// SPA fallback
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ ShockTV :${PORT} | TMDB:${TMDB_TOKEN?'OK':'MISSING'}`);
});
