const express = require('express');
const https = require('https');
const path = require('path');
try { require('dotenv').config(); } catch(e) {}

const app = express();
const PORT = process.env.PORT || 3000;
const TMDB_TOKEN = process.env.TMDB_TOKEN || '';

console.log('ShockTV starting | PORT:', PORT, '| TOKEN:', TMDB_TOKEN ? 'OK' : 'MISSING ❌');

app.use(express.static(path.join(__dirname, 'public')));

// El frontend pide el token a este endpoint (nunca está en el HTML)
app.get('/api/token', (req, res) => {
  if (!TMDB_TOKEN) return res.status(500).json({ error: 'TMDB_TOKEN not set in Railway Variables' });
  res.json({ token: TMDB_TOKEN });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', token_set: !!TMDB_TOKEN, node: process.version });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Listening on 0.0.0.0:${PORT}`);
});
