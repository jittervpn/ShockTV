// ═══════════════════════════════════════════════
//  ShockTV Server — TMDB proxy + Anime1v API
// ═══════════════════════════════════════════════
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;
const TMDB_TOKEN  = (process.env.TMDB_TOKEN  || '').trim();
// Anime1v API Key interna — usamos una fija ya que es nuestro propio servidor
const ANIME_KEY   = process.env.ANIME_API_KEY || 'shocktv-internal-key';

// ── CORS: permitir el frontend de GitHub Pages (y localhost en dev) ──
const ALLOWED_ORIGINS = [
  'https://jittervpn.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];
app.use(cors({
  origin(origin, cb) {
    // Permite peticiones sin origin (curl, apps nativas) y las de la whitelist
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('CORS bloqueado para: ' + origin));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-api-key']
}));

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
//  ANIMEAV1-API — rutas integradas (paquete oficial npm)
//  Endpoints:
//    GET /api/anime/search?q=naruto
//    GET /api/anime/info?slug=naruto
//    GET /api/anime/episode?slug=naruto&number=1
//    GET /api/anime/catalog?page=1&genre=accion
// ══════════════════════════════════════════════
const { getAnime, getCatalog, searchAnime, getEpisode } = require('animeav1-api');

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
  const { q } = req.query;
  if (!q) return res.status(400).json({ success:false, message:'Falta parámetro q' });
  const results = await searchAnime(q);
  res.json({ success:true, data:{ results } });
}));

app.get('/api/anime/info', authAnime, asyncH(async (req, res) => {
  const { slug } = req.query;
  if (!slug) return res.status(400).json({ success:false, message:'Falta parámetro slug' });
  const anime = await getAnime(slug);
  if (!anime) return res.status(404).json({ success:false, message:'Anime no encontrado' });
  res.json({ success:true, data: anime });
}));

app.get('/api/anime/episode', authAnime, asyncH(async (req, res) => {
  const { slug, number } = req.query;
  if (!slug || !number) return res.status(400).json({ success:false, message:'Faltan parámetros slug y number' });
  const episode = await getEpisode(slug, Number(number));
  if (!episode) return res.status(404).json({ success:false, message:'Episodio no encontrado' });
  const e=episode.embeds||{};
  const lat=e.LAT||e.LATINO||e['ES_LA']||e['ES-419']||e.DUB||[];
  const servers={lat,sub:e.SUB||[],dub:e.DUB||[]};
  res.json({ success:true, data:{ ...episode, servers } });
}));

app.get('/api/anime/catalog', authAnime, asyncH(async (req, res) => {
  const { page, letter, genre, category, minYear, maxYear, status, order } = req.query;
  const data = await getCatalog({
    page: page ? Number(page) : undefined,
    letter, category, minYear: minYear ? Number(minYear) : undefined,
    maxYear: maxYear ? Number(maxYear) : undefined, status, order,
    genre: Array.isArray(genre) ? genre : genre
  });
  res.json({ success:true, data });
}));

// ══════════════════════════════════════════════
//  JIKAN v4 (MyAnimeList no oficial) — SOLO metadata
//  Uso: dar títulos alternativos (inglés/japonés/sinónimos)
//  para reintentar la búsqueda en AnimeAV1 cuando el título
//  de TMDB (en español) no encuentra coincidencia directa.
//  No provee servidores de video — no reemplaza AnimeAV1.
//  Endpoint: GET /api/jikan/titles?q=Nombre
// ══════════════════════════════════════════════
const jikanCache = new Map(); // cache simple en memoria (TTL 1h) — Jikan tiene rate limit público
app.get('/api/jikan/titles', authAnime, asyncH(async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ success:false, message:'Falta parámetro q' });

  const ck = q.toLowerCase().trim();
  const hit = jikanCache.get(ck);
  if (hit && Date.now() - hit.t < 3600000) {
    return res.json({ success:true, data:{ titles: hit.v } });
  }

  const r = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}&limit=3`);
  if (!r.ok) {
    // Jikan devuelve 429 si se pasa el rate limit público (~3 req/s) — no rompemos la app, solo sin sugerencias
    return res.json({ success:true, data:{ titles: [] } });
  }
  const json = await r.json();
  const items = json?.data || [];
  const titles = new Set();
  items.forEach(it => {
    if (it.title) titles.add(it.title);
    if (it.title_english) titles.add(it.title_english);
    if (it.title_japanese) titles.add(it.title_japanese);
    (it.title_synonyms || []).forEach(s => titles.add(s));
  });
  const out = [...titles].filter(Boolean).slice(0, 10);
  jikanCache.set(ck, { v: out, t: Date.now() });
  res.json({ success:true, data:{ titles: out } });
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
