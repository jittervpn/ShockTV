const express = require('express');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_TOKEN = process.env.TMDB_TOKEN;
const BASE_URL = 'https://api.themoviedb.org/3';

app.use(express.static(path.join(__dirname, 'public')));

const tmdbHeaders = {
  accept: 'application/json',
  Authorization: `Bearer ${TMDB_TOKEN}`
};

// Trending movies & series
app.get('/api/trending', async (req, res) => {
  try {
    const [movies, tv] = await Promise.all([
      fetch(`${BASE_URL}/trending/movie/week?language=es-ES`, { headers: tmdbHeaders }),
      fetch(`${BASE_URL}/trending/tv/week?language=es-ES`, { headers: tmdbHeaders })
    ]);
    const moviesData = await movies.json();
    const tvData = await tv.json();
    res.json({ movies: moviesData.results, tv: tvData.results });
  } catch (e) {
    res.status(500).json({ error: 'Error fetching trending' });
  }
});

// Popular movies
app.get('/api/movies/popular', async (req, res) => {
  try {
    const r = await fetch(`${BASE_URL}/movie/popular?language=es-ES&page=1`, { headers: tmdbHeaders });
    const data = await r.json();
    res.json(data.results);
  } catch (e) {
    res.status(500).json({ error: 'Error fetching movies' });
  }
});

// Popular TV
app.get('/api/tv/popular', async (req, res) => {
  try {
    const r = await fetch(`${BASE_URL}/tv/popular?language=es-ES&page=1`, { headers: tmdbHeaders });
    const data = await r.json();
    res.json(data.results);
  } catch (e) {
    res.status(500).json({ error: 'Error fetching TV shows' });
  }
});

// Search
app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  try {
    const r = await fetch(`${BASE_URL}/search/multi?query=${encodeURIComponent(q)}&language=es-ES`, { headers: tmdbHeaders });
    const data = await r.json();
    res.json(data.results.filter(item => item.media_type !== 'person'));
  } catch (e) {
    res.status(500).json({ error: 'Error searching' });
  }
});

// Detail (movie or tv)
app.get('/api/detail/:type/:id', async (req, res) => {
  const { type, id } = req.params;
  try {
    const [detail, credits, videos] = await Promise.all([
      fetch(`${BASE_URL}/${type}/${id}?language=es-ES`, { headers: tmdbHeaders }),
      fetch(`${BASE_URL}/${type}/${id}/credits?language=es-ES`, { headers: tmdbHeaders }),
      fetch(`${BASE_URL}/${type}/${id}/videos?language=es-ES`, { headers: tmdbHeaders })
    ]);
    const detailData = await detail.json();
    const creditsData = await credits.json();
    const videosData = await videos.json();
    res.json({ ...detailData, credits: creditsData, videos: videosData.results });
  } catch (e) {
    res.status(500).json({ error: 'Error fetching detail' });
  }
});

// Top rated movies
app.get('/api/movies/toprated', async (req, res) => {
  try {
    const r = await fetch(`${BASE_URL}/movie/top_rated?language=es-ES&page=1`, { headers: tmdbHeaders });
    const data = await r.json();
    res.json(data.results);
  } catch (e) {
    res.status(500).json({ error: 'Error fetching top rated' });
  }
});

// Genres
app.get('/api/genres/:type', async (req, res) => {
  const { type } = req.params;
  try {
    const r = await fetch(`${BASE_URL}/genre/${type}/list?language=es-ES`, { headers: tmdbHeaders });
    const data = await r.json();
    res.json(data.genres);
  } catch (e) {
    res.status(500).json({ error: 'Error fetching genres' });
  }
});

// Discover by genre
app.get('/api/discover/:type', async (req, res) => {
  const { type } = req.params;
  const { genre } = req.query;
  try {
    const r = await fetch(`${BASE_URL}/discover/${type}?language=es-ES&with_genres=${genre}&sort_by=popularity.desc`, { headers: tmdbHeaders });
    const data = await r.json();
    res.json(data.results);
  } catch (e) {
    res.status(500).json({ error: 'Error discovering' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`ShockTV running on port ${PORT}`);
});
