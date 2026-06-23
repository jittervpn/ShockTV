// ===================== CONFIG =====================
const IMG_BASE = 'https://image.tmdb.org/t/p/';
const IMG_W500 = IMG_BASE + 'w500';
const IMG_W780 = IMG_BASE + 'w780';
const IMG_ORIGINAL = IMG_BASE + 'original';

// ===================== STATE =====================
let heroItems = [];
let heroIndex = 0;
let heroInterval = null;
let currentSection = 'home';

// ===================== DOM HELPERS =====================
const $ = id => document.getElementById(id);
const show = id => $(id).classList.remove('hidden');
const hide = id => $(id).classList.add('hidden');

// ===================== INIT =====================
document.addEventListener('DOMContentLoaded', async () => {
  show('loading-overlay');
  setupNavScroll();
  setupSearchEnter();
  await loadHome();
  setTimeout(() => hide('loading-overlay'), 600);
});

function setupNavScroll() {
  window.addEventListener('scroll', () => {
    const nav = document.getElementById('navbar');
    nav.classList.toggle('scrolled', window.scrollY > 60);
  });
}

function setupSearchEnter() {
  $('search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch();
  });
}

// ===================== SECTIONS =====================
function goHome() {
  setSection('home');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setSection(section) {
  currentSection = section;

  // Hero visibility
  const heroEl = $('hero-section');
  heroEl.style.display = (section === 'home') ? '' : 'none';

  // Sections
  const sections = ['home-sections', 'movies-section', 'tv-section', 'toprated-section', 'search-section'];
  sections.forEach(s => hide(s));

  // Nav active
  ['btn-home', 'btn-movies', 'btn-tv', 'btn-toprated'].forEach(b => {
    $(b).classList.remove('active');
  });

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

  if (section !== 'home') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// ===================== API CALLS =====================
async function api(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error('API error: ' + r.status);
  return r.json();
}

// ===================== HOME =====================
async function loadHome() {
  try {
    const [trending, movies, tv] = await Promise.all([
      api('/api/trending'),
      api('/api/movies/popular'),
      api('/api/tv/popular')
    ]);

    // Hero from trending movies
    heroItems = trending.movies.filter(m => m.backdrop_path).slice(0, 8);
    renderHero(heroItems[0], 'movie');
    startHeroRotation();

    // Sliders
    renderSlider('trending-slider', [...trending.movies.slice(0, 10), ...trending.tv.slice(0, 10)], true);
    renderSlider('movies-slider', movies);
    renderSlider('tv-slider', tv, false, true);
  } catch (e) {
    console.error('Error loading home:', e);
  }
}

// ===================== HERO =====================
function renderHero(item, type) {
  if (!item) return;
  const title = item.title || item.name || 'Sin título';
  const backdrop = item.backdrop_path ? IMG_ORIGINAL + item.backdrop_path : '';
  const overview = item.overview || '';
  const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
  const year = (item.release_date || item.first_air_date || '').slice(0, 4);
  const mediaType = item.media_type || type || 'movie';

  $('hero-bg').style.backgroundImage = backdrop ? `url(${backdrop})` : '';
  $('hero-title').textContent = title;
  $('hero-desc').textContent = overview;
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
    const item = heroItems[heroIndex];
    const type = item.media_type || 'movie';
    renderHero(item, type);
  }, 7000);
}

// ===================== SLIDERS =====================
function renderSlider(containerId, items, mixed = false, isTV = false) {
  const container = $(containerId);
  if (!container) return;
  container.innerHTML = items.map(item => {
    const type = mixed ? (item.media_type || 'movie') : (isTV ? 'tv' : 'movie');
    return createCard(item, type);
  }).join('');
}

function slide(sliderId, direction) {
  const slider = $(sliderId);
  const cardWidth = 184;
  slider.scrollBy({ left: direction * cardWidth * 3, behavior: 'smooth' });
}

// ===================== GRIDS =====================
async function loadMoviesGrid() {
  try {
    const movies = await api('/api/movies/popular');
    $('movies-grid').innerHTML = movies.map(m => createCard(m, 'movie')).join('');
  } catch (e) { console.error(e); }
}

async function loadTVGrid() {
  try {
    const tv = await api('/api/tv/popular');
    $('tv-grid').innerHTML = tv.map(t => createCard(t, 'tv')).join('');
  } catch (e) { console.error(e); }
}

async function loadTopRatedGrid() {
  try {
    const movies = await api('/api/movies/toprated');
    $('toprated-grid').innerHTML = movies.map(m => createCard(m, 'movie')).join('');
  } catch (e) { console.error(e); }
}

// ===================== CARD =====================
function createCard(item, type) {
  const title = item.title || item.name || 'Sin título';
  const poster = item.poster_path ? IMG_W500 + item.poster_path : '';
  const rating = item.vote_average ? item.vote_average.toFixed(1) : '?';
  const imgTag = poster
    ? `<img class="card-img" src="${poster}" alt="${escapeHtml(title)}" loading="lazy"/>`
    : `<div class="card-img" style="background:var(--surface2);display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:0.75rem;">Sin imagen</div>`;

  return `
    <div class="card" onclick="openDetail('${type}', ${item.id})">
      ${imgTag}
      <span class="card-type-tag">${type === 'movie' ? 'Film' : 'TV'}</span>
      <div class="card-overlay">
        <div class="card-title">${escapeHtml(title)}</div>
        <div class="card-rating">★ ${rating}</div>
      </div>
    </div>
  `;
}

// ===================== SEARCH =====================
async function doSearch() {
  const q = $('search-input').value.trim();
  if (!q) return;

  // Hide other sections, show search
  const heroEl = $('hero-section');
  heroEl.style.display = 'none';
  ['home-sections', 'movies-section', 'tv-section', 'toprated-section'].forEach(s => hide(s));
  ['btn-home', 'btn-movies', 'btn-tv', 'btn-toprated'].forEach(b => $(b).classList.remove('active'));
  show('search-section');

  $('search-results').innerHTML = '<div style="color:var(--text-muted);padding:20px;">Buscando...</div>';

  try {
    const results = await api(`/api/search?q=${encodeURIComponent(q)}`);
    if (results.length === 0) {
      $('search-results').innerHTML = '<div style="color:var(--text-muted);padding:20px;">No se encontraron resultados.</div>';
      return;
    }
    $('search-results').innerHTML = results.map(item => {
      const type = item.media_type || 'movie';
      return createCard(item, type);
    }).join('');
  } catch (e) {
    $('search-results').innerHTML = '<div style="color:var(--shock-red);padding:20px;">Error al buscar.</div>';
  }
}

// ===================== MODAL DETAIL =====================
async function openDetail(type, id) {
  show('loading-overlay');
  try {
    const data = await api(`/api/detail/${type}/${id}`);
    renderModal(data, type);
    show('modal-overlay');
    document.body.style.overflow = 'hidden';
  } catch (e) {
    console.error('Error loading detail:', e);
  } finally {
    hide('loading-overlay');
  }
}

function renderModal(data, type) {
  const title = data.title || data.name || 'Sin título';
  const overview = data.overview || 'Sin descripción disponible.';
  const rating = data.vote_average ? data.vote_average.toFixed(1) : 'N/A';
  const year = (data.release_date || data.first_air_date || '').slice(0, 4);
  const runtime = data.runtime ? `${data.runtime} min` : (data.episode_run_time?.[0] ? `${data.episode_run_time[0]} min/ep` : '');
  const genres = data.genres || [];
  const cast = data.credits?.cast?.slice(0, 8) || [];

  // Backdrop
  if (data.backdrop_path) {
    $('modal-backdrop').style.backgroundImage = `url(${IMG_W780 + data.backdrop_path})`;
  }

  // Poster
  $('modal-poster').src = data.poster_path ? IMG_W500 + data.poster_path : '';
  $('modal-poster').alt = title;

  // Badges (genres)
  $('modal-badges').innerHTML = genres.map(g => `<span class="badge badge-genre">${g.name}</span>`).join('');

  $('modal-title').textContent = title;

  $('modal-meta').innerHTML = `
    <span class="star">★ ${rating}</span>
    ${year ? `<span>📅 ${year}</span>` : ''}
    ${runtime ? `<span>⏱ ${runtime}</span>` : ''}
    <span>${type === 'movie' ? '🎬 Película' : '📺 Serie'}</span>
    ${data.vote_count ? `<span>${data.vote_count.toLocaleString()} votos</span>` : ''}
  `;

  $('modal-overview').textContent = overview;

  // Cast
  if (cast.length > 0) {
    $('modal-cast').innerHTML = `
      <div class="cast-title">Reparto principal</div>
      <div class="cast-list">
        ${cast.map(a => `<span class="cast-chip">${escapeHtml(a.name)}</span>`).join('')}
      </div>
    `;
  } else {
    $('modal-cast').innerHTML = '';
  }

  // Trailer
  const trailer = data.videos?.find(v => v.type === 'Trailer' && v.site === 'YouTube') ||
                  data.videos?.find(v => v.site === 'YouTube');
  if (trailer) {
    $('modal-trailer').innerHTML = `
      <div class="trailer-title">Tráiler</div>
      <iframe src="https://www.youtube.com/embed/${trailer.key}?rel=0" allowfullscreen loading="lazy"></iframe>
    `;
  } else {
    $('modal-trailer').innerHTML = '';
  }

  $('modal').scrollTop = 0;
}

function closeModal(event) {
  if (event && event.target !== $('modal-overlay') && !event.target.classList.contains('modal-close')) return;
  if (!event) {
    hide('modal-overlay');
    document.body.style.overflow = '';
    $('modal-trailer').innerHTML = '';
    return;
  }
  hide('modal-overlay');
  document.body.style.overflow = '';
  $('modal-trailer').innerHTML = '';
}

// Close modal on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

// ===================== UTILS =====================
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
