// ===================== CONFIG =====================
// Token se inyecta desde config.js (no subir ese archivo a GitHub)
// Para GitHub Pages: crear public/config.js con:
//   window.TMDB_TOKEN = 'tu_token_aqui';
// Para Railway: el servidor inyecta /api/config que devuelve el token

const IMG_W500 = 'https://image.tmdb.org/t/p/w500';
const IMG_W780 = 'https://image.tmdb.org/t/p/w780';
const IMG_ORIGINAL = 'https://image.tmdb.org/t/p/original';
const TMDB_BASE = 'https://api.themoviedb.org/3';

let TOKEN = '';
let heroItems = [], heroIndex = 0, heroInterval = null;

const $ = id => document.getElementById(id);
const show = id => $(id) && $(id).classList.remove('hidden');
const hide = id => $(id) && $(id).classList.add('hidden');

// ===================== INIT =====================
document.addEventListener('DOMContentLoaded', async () => {
  show('loading-overlay');
  setupNavScroll();
  setupSearchEnter();

  // Obtener token desde el servidor o desde config.js local
  await loadToken();

  if (!TOKEN) {
    showError('No se encontró el token de TMDB.<br>Configura la variable <strong>TMDB_TOKEN</strong> en Railway → Variables.');
    hide('loading-overlay');
    return;
  }

  await loadHome();
  setTimeout(() => hide('loading-overlay'), 500);
});

async function loadToken() {
  // 1) Intentar desde servidor Railway (/api/token)
  try {
    const r = await fetch('/api/token');
    if (r.ok) {
      const d = await r.json();
      if (d.token) { TOKEN = d.token; return; }
    }
  } catch(e) {}

  // 2) Fallback: window.TMDB_TOKEN (config.js local para desarrollo)
  if (window.TMDB_TOKEN) { TOKEN = window.TMDB_TOKEN; return; }
}

function tmdbHeaders() {
  return { 'accept': 'application/json', 'Authorization': 'Bearer ' + TOKEN };
}

async function tmdb(path) {
  const r = await fetch(TMDB_BASE + path, { headers: tmdbHeaders() });
  const data = await r.json();
  if (!r.ok || data.success === false) throw new Error(data.status_message || 'Error TMDB');
  return data;
}

// ===================== SETUP =====================
function setupNavScroll() {
  window.addEventListener('scroll', () => {
    $('navbar').classList.toggle('scrolled', window.scrollY > 60);
  });
}
function setupSearchEnter() {
  $('search-input').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
}

function showError(msg) {
  hide('loading-overlay');
  const existing = $('global-error');
  if (existing) existing.remove();
  const div = document.createElement('div');
  div.id = 'global-error';
  div.style.cssText = 'background:#1a0a0a;border:1px solid #e5001a;border-radius:10px;padding:24px;margin:24px auto;max-width:700px;font-size:0.88rem;line-height:1.7;color:#ccc;';
  div.innerHTML = `<div style="color:#e5001a;font-weight:bold;font-size:1rem;margin-bottom:8px;">⚠️ Error</div>${msg}`;
  $('main-content').prepend(div);
}

// ===================== HOME =====================
async function loadHome() {
  try {
    const [trendMovies, trendTV, movies, tv] = await Promise.all([
      tmdb('/trending/movie/week?language=es-ES'),
      tmdb('/trending/tv/week?language=es-ES'),
      tmdb('/movie/popular?language=es-ES&page=1'),
      tmdb('/tv/popular?language=es-ES&page=1'),
    ]);

    heroItems = (trendMovies.results || []).filter(m => m.backdrop_path).slice(0, 8);
    if (heroItems.length) { renderHero(heroItems[0], 'movie'); startHeroRotation(); }

    const allTrending = [...(trendMovies.results||[]).slice(0,10), ...(trendTV.results||[]).slice(0,10)];
    renderSlider('trending-slider', allTrending, true);
    renderSlider('movies-slider', movies.results || []);
    renderSlider('tv-slider', tv.results || [], false, true);
  } catch(e) {
    showError('No se pudieron cargar los datos: <strong>' + e.message + '</strong>');
  }
}

// ===================== HERO =====================
function renderHero(item, type) {
  if (!item) return;
  const title = item.title || item.name || '';
  const backdrop = item.backdrop_path ? IMG_ORIGINAL + item.backdrop_path : '';
  const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
  const year = (item.release_date || item.first_air_date || '').slice(0,4);
  const mediaType = item.media_type || type;

  $('hero-bg').style.backgroundImage = backdrop ? `url(${backdrop})` : '';
  $('hero-title').textContent = title;
  $('hero-desc').textContent = item.overview || '';
  $('hero-meta').innerHTML = `<span class="rating">★ ${rating}</span>${year?`<span>${year}</span>`:''}<span>${mediaType==='movie'?'🎬 Película':'📺 Serie'}</span>`;
  $('hero-play-btn').onclick = () => openDetail(mediaType, item.id);
  $('hero-info-btn').onclick = () => openDetail(mediaType, item.id);
}

function startHeroRotation() {
  if (heroInterval) clearInterval(heroInterval);
  heroInterval = setInterval(() => {
    heroIndex = (heroIndex + 1) % heroItems.length;
    renderHero(heroItems[heroIndex], 'movie');
  }, 7000);
}

// ===================== SECTIONS =====================
function goHome() { setSection('home'); window.scrollTo({top:0,behavior:'smooth'}); }

function setSection(section) {
  $('hero-section').style.display = section === 'home' ? '' : 'none';
  ['home-sections','movies-section','tv-section','toprated-section','search-section'].forEach(s => hide(s));
  ['btn-home','btn-movies','btn-tv','btn-toprated'].forEach(b => $(b)&&$(b).classList.remove('active'));

  switch(section) {
    case 'home':    show('home-sections'); $('btn-home').classList.add('active'); break;
    case 'movies':  show('movies-section'); $('btn-movies').classList.add('active'); loadMoviesGrid(); break;
    case 'tv':      show('tv-section'); $('btn-tv').classList.add('active'); loadTVGrid(); break;
    case 'toprated':show('toprated-section'); $('btn-toprated').classList.add('active'); loadTopRatedGrid(); break;
  }
  if (section !== 'home') window.scrollTo({top:0,behavior:'smooth'});
}

// ===================== SLIDERS =====================
function renderSlider(containerId, items, mixed=false, isTV=false) {
  const c = $(containerId);
  if (!c) return;
  c.innerHTML = (items||[]).map(item => createCard(item, mixed?(item.media_type||'movie'):(isTV?'tv':'movie'))).join('');
}

function slide(sliderId, direction) {
  const s = $(sliderId);
  if (s) s.scrollBy({left: direction * 184 * 3, behavior:'smooth'});
}

// ===================== GRIDS =====================
async function loadMoviesGrid() {
  try {
    const d = await tmdb('/movie/popular?language=es-ES&page=1');
    $('movies-grid').innerHTML = (d.results||[]).map(m=>createCard(m,'movie')).join('');
  } catch(e) { $('movies-grid').innerHTML = err(e); }
}
async function loadTVGrid() {
  try {
    const d = await tmdb('/tv/popular?language=es-ES&page=1');
    $('tv-grid').innerHTML = (d.results||[]).map(t=>createCard(t,'tv')).join('');
  } catch(e) { $('tv-grid').innerHTML = err(e); }
}
async function loadTopRatedGrid() {
  try {
    const d = await tmdb('/movie/top_rated?language=es-ES&page=1');
    $('toprated-grid').innerHTML = (d.results||[]).map(m=>createCard(m,'movie')).join('');
  } catch(e) { $('toprated-grid').innerHTML = err(e); }
}
const err = e => `<div style="color:var(--shock-red);padding:16px">${e.message}</div>`;

// ===================== CARD =====================
function createCard(item, type) {
  const title = item.title || item.name || 'Sin título';
  const poster = item.poster_path ? IMG_W500 + item.poster_path : '';
  const rating = item.vote_average ? item.vote_average.toFixed(1) : '?';
  const img = poster
    ? `<img class="card-img" src="${poster}" alt="${esc(title)}" loading="lazy" onerror="this.parentElement.style.background='var(--surface2)';this.remove()"/>`
    : `<div class="card-img" style="background:var(--surface2)"></div>`;
  return `<div class="card" onclick="openDetail('${type}',${item.id})">${img}<span class="card-type-tag">${type==='movie'?'Film':'TV'}</span><div class="card-overlay"><div class="card-title">${esc(title)}</div><div class="card-rating">★ ${rating}</div></div></div>`;
}

// ===================== SEARCH =====================
async function doSearch() {
  const q = $('search-input').value.trim();
  if (!q) return;
  $('hero-section').style.display = 'none';
  ['home-sections','movies-section','tv-section','toprated-section'].forEach(s=>hide(s));
  ['btn-home','btn-movies','btn-tv','btn-toprated'].forEach(b=>$(b)&&$(b).classList.remove('active'));
  show('search-section');
  $('search-results').innerHTML = '<div style="color:var(--text-muted);padding:20px">Buscando...</div>';
  try {
    const d = await tmdb('/search/multi?query='+encodeURIComponent(q)+'&language=es-ES');
    const results = (d.results||[]).filter(i=>i.media_type!=='person');
    $('search-results').innerHTML = results.length
      ? results.map(i=>createCard(i,i.media_type||'movie')).join('')
      : '<div style="color:var(--text-muted);padding:20px">Sin resultados.</div>';
  } catch(e) { $('search-results').innerHTML = err(e); }
}

// ===================== MODAL =====================
async function openDetail(type, id) {
  show('loading-overlay');
  try {
    const [detail, credits, videos] = await Promise.all([
      tmdb('/'+type+'/'+id+'?language=es-ES'),
      tmdb('/'+type+'/'+id+'/credits?language=es-ES'),
      tmdb('/'+type+'/'+id+'/videos?language=es-ES'),
    ]);
    renderModal({...detail, credits, videos: videos.results||[]}, type);
    show('modal-overlay');
    document.body.style.overflow = 'hidden';
  } catch(e) { console.error(e); }
  finally { hide('loading-overlay'); }
}

function renderModal(data, type) {
  const title = data.title || data.name || '';
  const rating = data.vote_average ? data.vote_average.toFixed(1) : 'N/A';
  const year = (data.release_date || data.first_air_date || '').slice(0,4);
  const runtime = data.runtime ? `${data.runtime} min` : (data.episode_run_time?.[0] ? `${data.episode_run_time[0]} min/ep` : '');
  const cast = data.credits?.cast?.slice(0,8) || [];

  if (data.backdrop_path) $('modal-backdrop').style.backgroundImage = `url(${IMG_W780+data.backdrop_path})`;
  $('modal-poster').src = data.poster_path ? IMG_W500+data.poster_path : '';
  $('modal-poster').alt = title;
  $('modal-badges').innerHTML = (data.genres||[]).map(g=>`<span class="badge badge-genre">${g.name}</span>`).join('');
  $('modal-title').textContent = title;
  $('modal-meta').innerHTML = `<span class="star">★ ${rating}</span>${year?`<span>📅 ${year}</span>`:''} ${runtime?`<span>⏱ ${runtime}</span>`:''}<span>${type==='movie'?'🎬 Película':'📺 Serie'}</span>`;
  $('modal-overview').textContent = data.overview || 'Sin descripción.';
  $('modal-cast').innerHTML = cast.length ? `<div class="cast-title">Reparto</div><div class="cast-list">${cast.map(a=>`<span class="cast-chip">${esc(a.name)}</span>`).join('')}</div>` : '';
  const trailer = (data.videos||[]).find(v=>v.type==='Trailer'&&v.site==='YouTube') || (data.videos||[]).find(v=>v.site==='YouTube');
  $('modal-trailer').innerHTML = trailer ? `<div class="trailer-title">Tráiler</div><iframe src="https://www.youtube.com/embed/${trailer.key}?rel=0" allowfullscreen loading="lazy"></iframe>` : '';
  $('modal').scrollTop = 0;
}

function closeModal(event) {
  if (event && event.target !== $('modal-overlay') && !event.target.classList.contains('modal-close')) return;
  hide('modal-overlay');
  document.body.style.overflow = '';
  $('modal-trailer').innerHTML = '';
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
