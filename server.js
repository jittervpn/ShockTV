const express = require('express');
const https   = require('https');
const http    = require('http');
const path    = require('path');
const fs      = require('fs');
try { require('dotenv').config(); } catch(e) {}

const app  = express();
const PORT = process.env.PORT || 3000;
const TMDB_TOKEN    = (process.env.TMDB_TOKEN    || '').trim();
const ANIME_API_KEY = (process.env.ANIME_API_KEY || 'sk-013a7d0b4cff2d87b2d67aea4ed18e0380ad933876681973').trim();

console.log('ShockTV | PORT:', PORT, '| TMDB:', TMDB_TOKEN?'OK':'MISSING', '| AnimeAPI:', ANIME_API_KEY?'OK':'MISSING');

// ── Static + inject token ──
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.get('/', serveIndex);
app.get('/index.html', serveIndex);
function serveIndex(req, res) {
  let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  html = html.replace('</head>',
    `<script>window.__TMDB_TOKEN__="${TMDB_TOKEN}";window.__ANIME_API_KEY__="${ANIME_API_KEY}";</script></head>`);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}

// ── HTTP helper ──
function fetchUrl(urlStr, headers={}, method='GET', body=null) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const opts = {
      hostname: u.hostname, path: u.pathname + u.search, method,
      headers: { 'User-Agent':'ShockTV/1.0', 'Accept':'application/json', ...headers }
    };
    const req = lib.request(opts, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        return fetchUrl(res.headers.location, headers, method, body).then(resolve).catch(reject);
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

// ── Health ──
app.get('/api/health', (req, res) => res.json({ status:'ok', tmdb:!!TMDB_TOKEN, animeapi:!!ANIME_API_KEY }));
app.get('/api/token',  (req, res) => {
  if (!TMDB_TOKEN) return res.status(500).json({ error:'TMDB_TOKEN not set' });
  res.json({ token: TMDB_TOKEN, animeApiKey: ANIME_API_KEY });
});

// ── Proxy hacia AnimeAPIplatform — evita CORS en el browser ──
// GET /api/animeplatform?path=/anime/search&q=naruto
app.get('/api/animeplatform', async (req, res) => {
  const apiPath = req.query.path || '/anime';
  // Construir query string con todos los params excepto "path"
  const params = new URLSearchParams(req.query);
  params.delete('path');
  const qs = params.toString() ? '?' + params.toString() : '';
  const url = `https://animeapiplatform.com/api${apiPath}${qs}`;
  try {
    const r = await fetchUrl(url, {
      'Authorization': `Bearer ${ANIME_API_KEY}`,
      'x-api-key': ANIME_API_KEY,
      'Accept': 'application/json'
    });
    res.status(r.status).setHeader('Content-Type','application/json').send(r.body);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── SPA fallback ──
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`✅ ShockTV http://0.0.0.0:${PORT}`));
