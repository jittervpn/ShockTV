const express = require('express');
const https   = require('https');
const path    = require('path');
const fs      = require('fs');
try { require('dotenv').config(); } catch(e){}

const app  = express();
const PORT = process.env.PORT || 3000;
const TMDB_TOKEN = (process.env.TMDB_TOKEN || '').trim();

console.log('ShockTV | PORT:', PORT, '| TOKEN:', TMDB_TOKEN ? 'OK' : 'MISSING');

app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.get('/', serveIndex);
app.get('/index.html', serveIndex);

function serveIndex(req, res) {
  let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  html = html.replace('</head>', `<script>window.__TMDB_TOKEN__="${TMDB_TOKEN}";</script></head>`);
  res.setHeader('Content-Type', 'text/html').send(html);
}

// ── Fetch helper ──
function fetchJSON(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
      headers: { 'User-Agent': 'ShockTV/1.0', 'Accept': 'application/json', ...headers }
    };
    const req = https.request(opts, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch(e) { reject(new Error('JSON parse error: ' + d.slice(0,100))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

// ── Proxy Anify → evita CORS en browser ──
// GET /api/anify/episodes/:anifyId
app.get('/api/anify/episodes/:id', async (req, res) => {
  try {
    const data = await fetchJSON(`https://api.anify.tv/episodes/${req.params.id}`);
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/anify/sources?anifyId=xxx&episodeId=yyy&providerId=zzz&subType=dub
app.get('/api/anify/sources', async (req, res) => {
  const { anifyId, episodeId, providerId, subType = 'dub' } = req.query;
  if (!anifyId || !episodeId || !providerId)
    return res.status(400).json({ error: 'anifyId, episodeId, providerId required' });
  try {
    // Anify sources endpoint
    const url = `https://api.anify.tv/sources?animeId=${anifyId}&episodeId=${encodeURIComponent(episodeId)}&providerId=${encodeURIComponent(providerId)}&subType=${subType}&id=${anifyId}`;
    const data = await fetchJSON(url);
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/anify/search?q=naruto&type=anime
app.get('/api/anify/search', async (req, res) => {
  const { q, type = 'anime' } = req.query;
  if (!q) return res.json([]);
  try {
    const data = await fetchJSON(
      `https://api.anify.tv/search/${type}/${encodeURIComponent(q)}?fields=[id,title,coverImage,currentEpisode,rating]`
    );
    res.json(data?.results || data || []);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/anify/seasonal
app.get('/api/anify/seasonal', async (req, res) => {
  try {
    const data = await fetchJSON(
      'https://api.anify.tv/seasonal/anime?fields=[id,title,coverImage,bannerImage,currentEpisode,rating,status,year]'
    );
    res.json(data || {});
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', token: !!TMDB_TOKEN }));
app.get('/api/token',  (req, res) => {
  if (!TMDB_TOKEN) return res.status(500).json({ error: 'TMDB_TOKEN not set' });
  res.json({ token: TMDB_TOKEN });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`✅ ShockTV :${PORT}`));
