const express = require('express');
const https = require('https');
const path = require('path');
const fs = require('fs');
try { require('dotenv').config(); } catch(e) {}

const app = express();
const PORT = process.env.PORT || 3000;
const TMDB_TOKEN = (process.env.TMDB_TOKEN || '').trim();

console.log('=== ShockTV ===');
console.log('PORT:', PORT);
console.log('TMDB_TOKEN:', TMDB_TOKEN ? `SET (${TMDB_TOKEN.slice(0,15)}...)` : 'MISSING ❌');

// Servir archivos estáticos EXCEPTO index.html
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// index.html — inyectar token directamente en el HTML
app.get('/', serveIndex);
app.get('/index.html', serveIndex);

function serveIndex(req, res) {
  let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  // Inyectar el token como variable global antes de app.js
  const injection = `<script>window.__TMDB_TOKEN__="${TMDB_TOKEN}";</script>`;
  html = html.replace('</head>', injection + '</head>');
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}

// Endpoint de salud
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    token_set: !!TMDB_TOKEN,
    token_preview: TMDB_TOKEN ? TMDB_TOKEN.slice(0,20)+'...' : 'MISSING',
    port: PORT,
    node: process.version
  });
});

// Endpoint de token (backup)
app.get('/api/token', (req, res) => {
  if (!TMDB_TOKEN) return res.status(500).json({ error: 'TMDB_TOKEN not set' });
  res.json({ token: TMDB_TOKEN });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Listening on http://0.0.0.0:${PORT}`);
});
