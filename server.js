const express = require('express');
const https   = require('https');
const http    = require('http');
const path    = require('path');
const fs      = require('fs');
try { require('dotenv').config(); } catch(e) {}

const app  = express();
const PORT = process.env.PORT || 3000;
const TMDB_TOKEN = (process.env.TMDB_TOKEN || '').trim();

console.log('ShockTV | PORT:', PORT, '| TOKEN:', TMDB_TOKEN ? 'OK' : 'MISSING ❌');

// ── Static files ──
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// ── Inject token into index.html ──
function serveIndex(req, res) {
  let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  html = html.replace('</head>', `<script>window.__TMDB_TOKEN__="${TMDB_TOKEN}";</script></head>`);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}
app.get('/', serveIndex);
app.get('/index.html', serveIndex);

// ── Health ──
app.get('/api/health', (req, res) => res.json({ status:'ok', token:!!TMDB_TOKEN, node:process.version }));
app.get('/api/token',  (req, res) => {
  if (!TMDB_TOKEN) return res.status(500).json({ error:'TMDB_TOKEN not set' });
  res.json({ token: TMDB_TOKEN });
});

// ── HTTP fetch helper ──
function fetchUrl(url, headers={}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const opts = Object.assign(new URL(url), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Accept': 'text/html,application/json,*/*',
        'Accept-Language': 'es-ES,es;q=0.9',
        ...headers
      }
    });
    const req = lib.request(opts, res => {
      // Follow redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, headers).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

// ── LATanime scraper helpers ──
function slugify(title) {
  return title
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // quitar acentos
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function extractBetween(html, before, after) {
  const i = html.indexOf(before);
  if (i < 0) return '';
  const j = html.indexOf(after, i + before.length);
  if (j < 0) return '';
  return html.slice(i + before.length, j).trim();
}

// ── LATANIME: buscar anime por título ──
// GET /api/latanime/search?q=naruto
app.get('/api/latanime/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  try {
    // LATanime tiene AJAX search en /api/search con csrf token
    // Primero obtenemos el home para el csrf token
    const home = await fetchUrl('https://latanime.org/');
    const csrf = extractBetween(home.body, 'meta name="csrf-token" content="', '"')
              || extractBetween(home.body, "csrf-token\" content=\"", "\"");
    
    // Llamada al endpoint interno
    const resp = await fetchUrl(`https://latanime.org/api/search?query=${encodeURIComponent(q)}`, {
      'X-CSRF-TOKEN': csrf,
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': 'https://latanime.org/',
      'Accept': 'application/json'
    });

    let results = [];
    try { results = JSON.parse(resp.body); } catch(e) {
      // Fallback: parsear HTML del directorio
      const dir = await fetchUrl(`https://latanime.org/animes?buscar=${encodeURIComponent(q)}`);
      const cards = dir.body.match(/href="https:\/\/latanime\.org\/anime\/([^"]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[\s\S]*?<\/a>/g) || [];
      results = cards.slice(0, 8).map(m => {
        const slug  = (m.match(/\/anime\/([^"]+)"/) || [])[1] || '';
        const img   = (m.match(/src="([^"]+)"/)     || [])[1] || '';
        const title = (m.match(/alt="([^"]+)"/)     || [])[1] || slug.replace(/-/g,' ');
        return { slug, title, image: img };
      });
    }
    res.json(results);
  } catch(e) {
    console.error('[latanime/search]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── LATANIME: obtener info de anime (episodios) ──
// GET /api/latanime/anime/:slug
app.get('/api/latanime/anime/:slug', async (req, res) => {
  const slug = req.params.slug;
  try {
    const page = await fetchUrl(`https://latanime.org/anime/${slug}`);
    const html = page.body;

    // Título
    const title = extractBetween(html, '<h1 class="Title">', '</h1>').trim()
               || extractBetween(html, '<h1>', '</h1>').trim()
               || slug.replace(/-/g,' ');

    // Imagen portada
    const image = (html.match(/class="lazy"[^>]+data-src="([^"]+)"/) || 
                   html.match(/class="[^"]*poster[^"]*"[^>]+src="([^"]+)"/) ||
                   ['',''])[1];

    // Lista de episodios: buscar links /ver/{slug}-episodio-N
    const epMatches = html.match(/href="https?:\/\/latanime\.org\/ver\/[^"]*episodio-(\d+)"/g) || [];
    const epNums = [...new Set(epMatches.map(m => parseInt(m.match(/episodio-(\d+)/)[1])))].sort((a,b)=>a-b);

    // Descripción
    const desc = extractBetween(html, '<div class="Description">', '</div>').replace(/<[^>]+>/g,'').trim()
              || extractBetween(html, 'class="sinopsis">', '</').replace(/<[^>]+>/g,'').trim()
              || '';

    res.json({ slug, title, image, episodes: epNums, description: desc });
  } catch(e) {
    console.error('[latanime/anime]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── LATANIME: obtener URL de video de un episodio ──
// GET /api/latanime/ep/:slug/:ep
app.get('/api/latanime/ep/:slug/:ep', async (req, res) => {
  const { slug, ep } = req.params;
  const url = `https://latanime.org/ver/${slug}-episodio-${ep}`;
  try {
    const page = await fetchUrl(url);
    const html = page.body;
    if (page.status === 404 || html.includes('404')) return res.status(404).json({ error: 'Episodio no encontrado' });

    // Extraer iframes / sources de video
    // LATanime usa múltiples fuentes: uqload, videobin, mp4upload, ok.ru
    const iframes = [];
    const iframeMatches = html.matchAll(/src="(https?:\/\/(?:uqload\.|videobin\.|mp4upload\.|ok\.ru|streamtape)[^"]+)"/gi);
    for (const m of iframeMatches) iframes.push(m[1]);

    // También puede haber en atributo data-src o en script
    const dataSrc = html.matchAll(/data-src="(https?:\/\/[^"]+(?:embed|player|video)[^"]+)"/gi);
    for (const m of dataSrc) iframes.push(m[1]);

    res.json({
      page_url: url,
      slug, episode: parseInt(ep),
      sources: [...new Set(iframes)],
      embed_url: url  // Fallback: abrir la página directamente en iframe
    });
  } catch(e) {
    console.error('[latanime/ep]', e.message);
    res.status(500).json({ error: e.message, page_url: url });
  }
});

// ── SPA fallback ──
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`✅ ShockTV http://0.0.0.0:${PORT}`));
