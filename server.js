const express = require('express');
const https = require('https');
const path = require('path');

// Load .env only in development
try { require('dotenv').config(); } catch(e) {}

const app = express();
const PORT = process.env.PORT || 3000;
const TMDB_TOKEN = process.env.TMDB_TOKEN || '';

console.log('=== ShockTV Starting ===');
console.log('PORT:', PORT);
console.log('TMDB_TOKEN set:', TMDB_TOKEN ? 'YES (' + TMDB_TOKEN.slice(0,10) + '...)' : 'NO ❌');

app.use(express.static(path.join(__dirname, 'public')));

function tmdbGet(urlPath) {
  return new Promise((resolve, reject) => {
    if (!TMDB_TOKEN) {
      return reject(new Error('TMDB_TOKEN environment variable is not set'));
    }
    const options = {
      hostname: 'api.themoviedb.org',
      path: urlPath,
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'Authorization': 'Bearer ' + TMDB_TOKEN
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.success === false) {
            return reject(new Error('TMDB error: ' + parsed.status_message));
          }
          resolve(parsed);
        } catch (e) {
          reject(new Error('JSON parse error: ' + data.slice(0, 100)));
        }
      });
    });
    req.on('error', (e) => reject(new Error('Network error: ' + e.message)));
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

// Health check — visit /api/health to diagnose
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    token_set: !!TMDB_TOKEN,
    token_preview: TMDB_TOKEN ? TMDB_TOKEN.slice(0, 20) + '...' : 'MISSING',
    node_version: process.version,
    env: process.env.NODE_ENV || 'none'
  });
});

app.get('/api/trending', async (req, res) => {
  try {
    const [movies, tv] = await Promise.all([
      tmdbGet('/3/trending/movie/week?language=es-ES'),
      tmdbGet('/3/trending/tv/week?language=es-ES')
    ]);
    res.json({ movies: movies.results || [], tv: tv.results || [] });
  } catch (e) {
    console.error('[/api/trending]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/movies/popular', async (req, res) => {
  try {
    const data = await tmdbGet('/3/movie/popular?language=es-ES&page=1');
    res.json(data.results || []);
  } catch (e) {
    console.error('[/api/movies/popular]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/tv/popular', async (req, res) => {
  try {
    const data = await tmdbGet('/3/tv/popular?language=es-ES&page=1');
    res.json(data.results || []);
  } catch (e) {
    console.error('[/api/tv/popular]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/search', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.json([]);
  try {
    const data = await tmdbGet('/3/search/multi?query=' + encodeURIComponent(q) + '&language=es-ES');
    const results = (data.results || []).filter(i => i.media_type !== 'person');
    res.json(results);
  } catch (e) {
    console.error('[/api/search]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/detail/:type/:id', async (req, res) => {
  const { type, id } = req.params;
  try {
    const [detail, credits, videos] = await Promise.all([
      tmdbGet('/3/' + type + '/' + id + '?language=es-ES'),
      tmdbGet('/3/' + type + '/' + id + '/credits?language=es-ES'),
      tmdbGet('/3/' + type + '/' + id + '/videos?language=es-ES')
    ]);
    res.json({ ...detail, credits, videos: videos.results || [] });
  } catch (e) {
    console.error('[/api/detail]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/movies/toprated', async (req, res) => {
  try {
    const data = await tmdbGet('/3/movie/top_rated?language=es-ES&page=1');
    res.json(data.results || []);
  } catch (e) {
    console.error('[/api/movies/toprated]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('ShockTV listening on 0.0.0.0:' + PORT);
});
