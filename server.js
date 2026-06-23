const express = require('express');
const https = require('https');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const TMDB_TOKEN = process.env.TMDB_TOKEN;
const BASE_URL = 'api.themoviedb.org';

app.use(express.static(path.join(__dirname, 'public')));

// Helper: HTTPS request to TMDB
function tmdbGet(urlPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
      path: urlPath,
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'Authorization': `Bearer ${TMDB_TOKEN}`
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse error')); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// Trending
app.get('/api/trending', async (req, res) => {
  try {
    const [movies, tv] = await Promise.all([
      tmdbGet('/3/trending/movie/week?language=es-ES'),
      tmdbGet('/3/trending/tv/week?language=es-ES')
    ]);
    res.json({ movies: movies.results || [], tv: tv.results || [] });
  } catch (e) {
    console.error('trending error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Popular movies
app.get('/api/movies/popular', async (req, res) => {
  try {
    const data = await tmdbGet('/3/movie/popular?language=es-ES&page=1');
    res.json(data.results || []);
  } catch (e) {
    console.error('movies error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Popular TV
app.get('/api/tv/popular', async (req, res) => {
  try {
    const data = await tmdbGet('/3/tv/popular?language=es-ES&page=1');
    res.json(data.results || []);
  } catch (e) {
    console.error('tv error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Search
app.get('/api/search', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.json([]);
  try {
    const data = await tmdbGet(`/3/search/multi?query=${encodeURIComponent(q)}&language=es-ES`);
    const results = (data.results || []).filter(i => i.media_type !== 'person');
    res.json(results);
  } catch (e) {
    console.error('search error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Detail
app.get('/api/detail/:type/:id', async (req, res) => {
  const { type, id } = req.params;
  try {
    const [detail, credits, videos] = await Promise.all([
      tmdbGet(`/3/${type}/${id}?language=es-ES`),
      tmdbGet(`/3/${type}/${id}/credits?language=es-ES`),
      tmdbGet(`/3/${type}/${id}/videos?language=es-ES`)
    ]);
    res.json({ ...detail, credits, videos: videos.results || [] });
  } catch (e) {
    console.error('detail error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Top rated
app.get('/api/movies/toprated', async (req, res) => {
  try {
    const data = await tmdbGet('/3/movie/top_rated?language=es-ES&page=1');
    res.json(data.results || []);
  } catch (e) {
    console.error('toprated error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Discover
app.get('/api/discover/:type', async (req, res) => {
  const { type } = req.params;
  const genre = req.query.genre || '';
  try {
    const data = await tmdbGet(`/3/discover/${type}?language=es-ES&with_genres=${genre}&sort_by=popularity.desc`);
    res.json(data.results || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', token: TMDB_TOKEN ? 'set' : 'MISSING' });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`ShockTV running on port ${PORT}`);
  console.log(`TMDB_TOKEN: ${TMDB_TOKEN ? 'OK ✓' : '❌ MISSING'}`);
});
