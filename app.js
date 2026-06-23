const IMG_BASE = 'https://image.tmdb.org/t/p/';
const IMG_W500 = IMG_BASE + 'w500';
const IMG_W780 = IMG_BASE + 'w780';
const IMG_ORIGINAL = IMG_BASE + 'original';

let heroItems = [];
let heroIndex = 0;
let heroInterval = null;

const $ = id => document.getElementById(id);
const show = id => $(id) && $(id).classList.remove('hidden');
const hide = id => $(id) && $(id).classList.add('hidden');

document.addEventListener('DOMContentLoaded', async () => {
  show('loading-overlay');
  setupNavScroll();
  setupSearchEnter();
  await loadHome();
  setTimeout(() => hide('loading-overlay'), 500);
});

function setupNavScroll() {
  window.addEventListener('scroll', () => {
    document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 60);
  });
}

function setupSearchEnter() {
  $('search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch();
  });
}

function showError(message) {
  hide('loading-overlay');
  const main = $('main-content');
  const existing = document.getElementById('global-error');
  if (existing) existing.remove();
  const div = document.createElement('div');
  div.id = 'global-error';
  div.style.cssText = 'background:#1a0a0a;border:1px solid #e5001a;border-radius:10px;padding:24px;margin:24px auto;max-width:700px;font-family:monospace;font-size:0.85rem;line-height:1.6;';
  div.innerHTML = `<div style="color:#e5001a;font-weight:bold;font-size:1rem;margin-bottom:12px;">⚠️ Error al cargar datos</div>
<div style="color:#ccc;">${escapeHtml(message)}</div>
<div style="color:#666;margin-top:12px;font-size:0.75rem;">
Verifica en Railway: <strong style="color:#fff">Variables → TMDB_TOKEN</strong><br>
Diagnóstico: <a href="/api/health" target="_blank" style="color:#e5001a;">/api/health</a> | 
<a href="/api/trending" target="_blank" style="color:#e5001a;">/api/trending</a>
</div>`;
  main.prepend(div);
}

async function api(path) {
  const r = await fetch(path);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

function goHome() {
  setSection('home');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setSection(section) {
  const heroEl = $('hero-section');
  heroEl.style.display = section === 'home' ? '' : 'none';

  ['home-sections','movies-section','tv-section','toprated-section','search-section'].forEach(s => hide(s));
  ['btn-home','btn-movies','btn-tv','btn-toprated'].forEach(b => $(b) && $(b).classList.remove('active'));

  switch (section) {
    case 'home':
      show('home-sections');
      $('btn-home').classList.add('active');
      break;
    case 'movies':
      show('movies-section');
      $('btn-movies').classList.add('active');
      loadMoviesGrid();
      break;
    case 'tv':
      show('tv-section');
      $('btn-tv').classList.add('active');
      loadTVGrid();
      break;
    case 'toprated':
      show('toprated-section');
      $('btn-toprated').classList.add('active');
      loadTopRatedGrid();
      break;
  }

  if (section !== 'home') window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadHome() {
  try {
    const [trending, movies, tv] = await Promise.all([
      api('/api/trending'),
      api('/api/movies/popular'),
      api('/api/tv/popular')
    ]);

    heroItems = (trending.movies || []).filter(m => m.backdrop_path).slice(0, 8);
    if (heroItems.length > 0) {
      renderHero(heroItems[0], 'movie');
      startHeroRotation();
    }

    const allTrending = [...(trending.movies || []).slice(0,10), ...(trending.tv || []).slice(0,10)];
    renderSlider('trending-slider', allTrending, true);
    renderSlider('movies-slider', movies || []);
    renderSlider('tv-slider', tv || [], false, true);

  } catch (e) {
    console.error('loadHome error:', e);
    showError(e.message + '\n\nVisita /api/health para ver el estado del servidor.');
  }
}

function renderHero(item, type) {
  if (!item) return;
  const title = item.title || item.name || 'Sin título';
  const backdrop = item.backdrop_path ? IMG_ORIGINAL + item.backdrop_path : '';
  const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
  const year = (item.release_date || item.first_air_date || '').slice(0, 4);
  const mediaType = item.media_type || type || 'movie';

  $('hero-bg').style.backgroundImage = backdrop ? `url(${backdrop})` : '';
  $('hero-title').textContent = title;
  $('hero-desc').textContent = item.overview || '';
  $('hero-meta').innerHTML = `
    <span class="rating">★ ${rating}</span>
    ${year ? `<span>${year}</span>` : ''}
    <span>${mediaType === 'movie' ? '🎬 Película' : '📺 Serie'}</span>
  `;
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

function renderSlider(containerId, items, mixed = false, isTV = false) {
  const container = $(containerId);
  if (!container) return;
  if (!items || items.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted);padding:20px;">Sin datos</div>';
    return;
  }
  container.innerHTML = items.map(item => {
    const type = mixed ? (item.media_type || 'movie') : (isTV ? 'tv' : 'movie');
    return createCard(item, type);
  }).join('');
}

function slide(sliderId, direction) {
  const slider = $(sliderId);
  if (!slider) return;
  slider.scrollBy({ left: direction * 184 * 3, behavior: 'smooth' });
}

async function loadMoviesGrid() {
  try {
    const movies = await api('/api/movies/popular');
    $('movies-grid').innerHTML = (movies || []).map(m => createCard(m, 'movie')).join('');
  } catch (e) { $('movies-grid').innerHTML = `<div style="color:var(--shock-red)">${e.message}</div>`; }
}

async function loadTVGrid() {
  try {
    const tv = await api('/api/tv/popular');
    $('tv-grid').innerHTML = (tv || []).map(t => createCard(t, 'tv')).join('');
  } catch (e) { $('tv-grid').innerHTML = `<div style="color:var(--shock-red)">${e.message}</div>`; }
}

async function loadTopRatedGrid() {
  try {
    const movies = await api('/api/movies/toprated');
    $('toprated-grid').innerHTML = (movies || []).map(m => createCard(m, 'movie')).join('');
  } catch (e) { $('toprated-grid').innerHTML = `<div style="color:var(--shock-red)">${e.message}</div>`; }
}

function createCard(item, type) {
  const title = item.title || item.name || 'Sin título';
  const poster = item.poster_path ? IMG_W500 + item.poster_path : '';
  const rating = item.vote_average ? item.vote_average.toFixed(1) : '?';
  const imgTag = poster
    ? `<img class="card-img" src="${poster}" alt="${escapeHtml(title)}" loading="lazy" onerror="this.style.background='var(--surface2)'"/>`
    : `<div class="card-img" style="display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:0.7rem;background:var(--surface2);">Sin imagen</div>`;

  return `
    <div class="card" onclick="openDetail('${type}', ${item.id})">
      ${imgTag}
      <span class="card-type-tag">${type === 'movie' ? 'Film' : 'TV'}</span>
      <div class="card-overlay">
        <div class="card-title">${escapeHtml(title)}</div>
        <div class="card-rating">★ ${rating}</div>
      </div>
    </div>`;
}

async function doSearch() {
  const q = $('search-input').value.trim();
  if (!q) return;

  $('hero-section').style.display = 'none';
  ['home-sections','movies-section','tv-section','toprated-section'].forEach(s => hide(s));
  ['btn-home','btn-movies','btn-tv','btn-toprated'].forEach(b => $(b).classList.remove('active'));
  show('search-section');

  $('search-results').innerHTML = '<div style="color:var(--text-muted);padding:20px;">Buscando...</div>';

  try {
    const results = await api(`/api/search?q=${encodeURIComponent(q)}`);
    if (!results || results.length === 0) {
      $('search-results').innerHTML = '<div style="color:var(--text-muted);padding:20px;">Sin resultados.</div>';
      return;
    }
    $('search-results').innerHTML = results.map(item => createCard(item, item.media_type || 'movie')).join('');
  } catch (e) {
    $('search-results').innerHTML = `<div style="color:var(--shock-red);padding:20px;">${e.message}</div>`;
  }
}

async function openDetail(type, id) {
  show('loading-overlay');
  try {
    const data = await api(`/api/detail/${type}/${id}`);
    renderModal(data, type);
    show('modal-overlay');
    document.body.style.overflow = 'hidden';
  } catch (e) {
    console.error('openDetail error:', e);
  } finally {
    hide('loading-overlay');
  }
}

function renderModal(data, type) {
  const title = data.title || data.name || 'Sin título';
  const rating = data.vote_average ? data.vote_average.toFixed(1) : 'N/A';
  const year = (data.release_date || data.first_air_date || '').slice(0, 4);
  const runtime = data.runtime ? `${data.runtime} min` : (data.episode_run_time?.[0] ? `${data.episode_run_time[0]} min/ep` : '');
  const genres = data.genres || [];
  const cast = data.credits?.cast?.slice(0, 8) || [];

  if (data.backdrop_path) $('modal-backdrop').style.backgroundImage = `url(${IMG_W780 + data.backdrop_path})`;
  $('modal-poster').src = data.poster_path ? IMG_W500 + data.poster_path : '';
  $('modal-poster').alt = title;
  $('modal-badges').innerHTML = genres.map(g => `<span class="badge badge-genre">${g.name}</span>`).join('');
  $('modal-title').textContent = title;
  $('modal-meta').innerHTML = `
    <span class="star">★ ${rating}</span>
    ${year ? `<span>📅 ${year}</span>` : ''}
    ${runtime ? `<span>⏱ ${runtime}</span>` : ''}
    <span>${type === 'movie' ? '🎬 Película' : '📺 Serie'}</span>
    ${data.vote_count ? `<span>${data.vote_count.toLocaleString()} votos</span>` : ''}
  `;
  $('modal-overview').textContent = data.overview || 'Sin descripción.';

  $('modal-cast').innerHTML = cast.length > 0 ? `
    <div class="cast-title">Reparto</div>
    <div class="cast-list">${cast.map(a => `<span class="cast-chip">${escapeHtml(a.name)}</span>`).join('')}</div>
  ` : '';

  const trailer = (data.videos || []).find(v => v.type === 'Trailer' && v.site === 'YouTube')
               || (data.videos || []).find(v => v.site === 'YouTube');
  $('modal-trailer').innerHTML = trailer ? `
    <div class="trailer-title">Tráiler</div>
    <iframe src="https://www.youtube.com/embed/${trailer.key}?rel=0" allowfullscreen loading="lazy"></iframe>
  ` : '';

  $('modal').scrollTop = 0;
}

function closeModal(event) {
  if (event && event.target !== $('modal-overlay') && !event.target.classList.contains('modal-close')) return;
  hide('modal-overlay');
  document.body.style.overflow = '';
  $('modal-trailer').innerHTML = '';
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
