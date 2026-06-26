// ===================== CONFIG =====================
const IMG_W500 = 'https://image.tmdb.org/t/p/w500';
const IMG_W780 = 'https://image.tmdb.org/t/p/w780';
const IMG_ORI  = 'https://image.tmdb.org/t/p/original';
const TMDB     = 'https://api.themoviedb.org/3';
const ANIME_KW = 210024; // TMDB keyword ID for "anime"

// Fuentes de streaming — Unlimplay primero
const SOURCES = [
  {
    name: 'Unlimplay',
    movie: id => `https://unlimplay.com/play/embed/movie/${id}`,
    tv:    (id,s,e) => `https://unlimplay.com/play/embed/tv/${id}/${s}/${e}`,
  },
  {
    name: 'VidLink',
    movie: id => `https://vidlink.pro/movie/${id}?autoplay=true`,
    tv:    (id,s,e) => `https://vidlink.pro/tv/${id}/${s}/${e}?autoplay=true`,
  },
  {
    name: '2Embed',
    movie: id => `https://www.2embed.stream/embed/movie/${id}`,
    tv:    (id,s,e) => `https://www.2embed.stream/embed/tv/${id}/${s}/${e}`,
  },
  {
    name: 'VidSrc',
    movie: id => `https://vidsrc.me/embed/movie/${id}`,
    tv:    (id,s,e) => `https://vidsrc.me/embed/tv/${id}/${s}/${e}`,
  },
];

// ===================== STATE =====================
let TOKEN = '';
let heroItems = [], heroIdx = 0, heroTimer = null;
let playerData = { type:'', id:0, season:1, episode:1, seasons:[], title:'' };
let currentSrc = 0;

// ===================== UTILS =====================
const $ = id => document.getElementById(id);
const show = id => $(id) && $(id).classList.remove('hidden');
const hide = id => $(id) && $(id).classList.add('hidden');
const esc  = s  => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function tmdbH() { return { accept:'application/json', Authorization:'Bearer '+TOKEN }; }
async function tmdb(path) {
  const r = await fetch(TMDB+path, { headers: tmdbH() });
  const d = await r.json();
  if (!r.ok || d.success===false) throw new Error(d.status_message||'TMDB error');
  return d;
}

// ===================== INIT =====================
document.addEventListener('DOMContentLoaded', async () => {
  show('loading-overlay');
  setupNavScroll();
  $('search-input').addEventListener('keydown', e => e.key==='Enter' && doSearch());

  await loadToken();
  if (!TOKEN) { showErr('Token TMDB no encontrado. Configura <strong>TMDB_TOKEN</strong> en Railway Variables.'); hide('loading-overlay'); return; }

  await loadHome();
  setTimeout(() => hide('loading-overlay'), 500);
});

async function loadToken() {
  // 1) Inyectado por el servidor directo en el HTML (Railway)
  if (window.__TMDB_TOKEN__ && window.__TMDB_TOKEN__.length > 10) {
    TOKEN = window.__TMDB_TOKEN__; return;
  }
  // 2) Endpoint /api/token
  try {
    const r = await fetch('/api/token');
    if (r.ok) { const d = await r.json(); if (d.token) { TOKEN = d.token; return; } }
  } catch(e) {}
  // 3) config.js local (GitHub Pages / dev)
  if (window.TMDB_TOKEN) { TOKEN = window.TMDB_TOKEN; }
}

function setupNavScroll() {
  window.addEventListener('scroll', () => $('navbar').classList.toggle('scrolled', window.scrollY>60));
}

function showErr(msg) {
  const e=$('global-err')||Object.assign(document.createElement('div'),{id:'global-err'});
  e.style.cssText='background:#1a0a0a;border:1px solid var(--red);border-radius:10px;padding:22px;margin:22px auto;max-width:680px;font-size:.88rem;line-height:1.7;color:#ccc;';
  e.innerHTML=`<div style="color:var(--red);font-weight:700;font-size:1rem;margin-bottom:8px">⚠️ Error</div>${msg}`;
  $('main-content').prepend(e);
}

// ===================== SIDEBAR =====================
function openSidebar()  { $('sidebar').classList.add('open'); $('sidebar-overlay').classList.add('open'); }
function closeSidebar() { $('sidebar').classList.remove('open'); $('sidebar-overlay').classList.remove('open'); }

// ===================== NAV =====================
function setNavActive(section) {
  ['nb-home','nb-movies','nb-tv','nb-anime','nb-toprated'].forEach(b => $(b)&&$(b).classList.remove('active'));
  const map={home:'nb-home',movies:'nb-movies',tv:'nb-tv',anime:'nb-anime',toprated:'nb-toprated'};
  if (map[section]) $(map[section]).classList.add('active');

  ['sb-home','sb-movies','sb-tv','sb-anime','sb-toprated'].forEach(b => $(b)&&$(b).classList.remove('active'));
  const sbmap={home:'sb-home',movies:'sb-movies',tv:'sb-tv',anime:'sb-anime',toprated:'sb-toprated'};
  if (sbmap[section]) $(sbmap[section]).classList.add('active');
}

// ===================== SECTIONS =====================
const ALL_SECTIONS = ['home-sections','movies-section','tv-section','anime-section','toprated-section','search-section','genre-section'];

function goHome() {
  ALL_SECTIONS.forEach(hide);
  show('home-sections');
  $('hero-section').style.display='';
  setNavActive('home');
  closeSidebar();
  window.scrollTo({top:0,behavior:'smooth'});
}

function setSection(sec) {
  ALL_SECTIONS.forEach(hide);
  $('hero-section').style.display='none';
  setNavActive(sec);
  closeSidebar();
  window.scrollTo({top:0,behavior:'smooth'});
  switch(sec){
    case 'movies':   show('movies-section');   loadGrid('movies-grid','movie'); break;
    case 'tv':       show('tv-section');        loadGrid('tv-grid','tv'); break;
    case 'anime':    show('anime-section');     loadAnimeGrid('anime-grid'); break;
    case 'toprated': show('toprated-section');  loadTopRated(); break;
  }
}

async function setGenre(type, genreId, label) {
  ALL_SECTIONS.forEach(hide);
  $('hero-section').style.display='none';
  show('genre-section');
  $('genre-title').textContent = label;
  $('genre-grid').innerHTML = '<div style="color:var(--muted);padding:20px">Cargando...</div>';
  closeSidebar();
  window.scrollTo({top:0,behavior:'smooth'});
  try {
    const d = await tmdb(`/discover/${type}?language=es-ES&with_genres=${genreId}&sort_by=popularity.desc`);
    $('genre-grid').innerHTML = (d.results||[]).map(i=>card(i,type)).join('');
  } catch(e) { $('genre-grid').innerHTML=`<div style="color:var(--red);padding:20px">${e.message}</div>`; }
}

async function setAnimeGenre(genreId, label) {
  ALL_SECTIONS.forEach(hide);
  $('hero-section').style.display='none';
  show('genre-section');
  $('genre-title').textContent = label;
  $('genre-grid').innerHTML = '<div style="color:var(--muted);padding:20px">Cargando...</div>';
  closeSidebar();
  window.scrollTo({top:0,behavior:'smooth'});
  try {
    const d = await tmdb(`/discover/tv?language=es-ES&with_keywords=${ANIME_KW}&with_genres=${genreId}&sort_by=popularity.desc`);
    $('genre-grid').innerHTML = (d.results||[]).map(i=>card(i,'tv')).join('');
  } catch(e) { $('genre-grid').innerHTML=`<div style="color:var(--red);padding:20px">${e.message}</div>`; }
}

// ===================== HOME =====================
async function loadHome() {
  const [tm, ttv, mp, tvp, anime] = await Promise.all([
    tmdb('/trending/movie/week?language=es-ES'),
    tmdb('/trending/tv/week?language=es-ES'),
    tmdb('/movie/popular?language=es-ES'),
    tmdb('/tv/popular?language=es-ES'),
    tmdb(`/discover/tv?language=es-ES&with_keywords=${ANIME_KW}&sort_by=popularity.desc`),
  ]);

  heroItems = (tm.results||[]).filter(m=>m.backdrop_path).slice(0,8);
  if (heroItems.length) { renderHero(heroItems[0],'movie'); startHero(); }

  const trending = [...(tm.results||[]).slice(0,10), ...(ttv.results||[]).slice(0,10)];
  renderSlider('s-trending', trending, true);
  renderSlider('s-movies', mp.results||[]);
  renderSlider('s-tv', ttv.results||[], false, true);
  renderSlider('s-anime', anime.results||[], false, true);
}

// ===================== HERO =====================
function renderHero(item, type) {
  $('hero-bg').style.backgroundImage = item.backdrop_path ? `url(${IMG_ORI+item.backdrop_path})` : '';
  $('hero-title').textContent = item.title||item.name||'';
  $('hero-desc').textContent  = item.overview||'';
  const mt = item.media_type||type;
  $('hero-meta').innerHTML = `<span class="rating">★ ${item.vote_average?.toFixed(1)||'N/A'}</span><span>${(item.release_date||item.first_air_date||'').slice(0,4)}</span><span>${mt==='movie'?'🎬 Película':'📺 Serie'}</span>`;
  $('hero-play-btn').onclick = () => openPlayer(mt, item.id, item.title||item.name);
  $('hero-info-btn').onclick = () => openDetail(mt, item.id);
}
function startHero() {
  if(heroTimer) clearInterval(heroTimer);
  heroTimer = setInterval(() => { heroIdx=(heroIdx+1)%heroItems.length; renderHero(heroItems[heroIdx],'movie'); }, 7000);
}

// ===================== SLIDERS =====================
function renderSlider(id, items, mixed=false, isTV=false) {
  const c=$(id); if(!c) return;
  const type = mixed?null:(isTV?'tv':'movie');
  c.innerHTML = (items||[]).map(i=>card(i,mixed?(i.media_type||'movie'):type)).join('');
}
function slide(id, dir) { const s=$(id); if(s) s.scrollBy({left:dir*164*3,behavior:'smooth'}); }

// ===================== GRIDS =====================
async function loadGrid(gridId, type) {
  const el=$(gridId); if(!el||el.dataset.loaded) return; el.dataset.loaded=1;
  try {
    const path = type==='movie' ? '/movie/popular?language=es-ES' : '/tv/popular?language=es-ES';
    const d = await tmdb(path);
    el.innerHTML = (d.results||[]).map(i=>card(i,type)).join('');
  } catch(e) { el.innerHTML=`<div style="color:var(--red);padding:16px">${e.message}</div>`; }
}
async function loadAnimeGrid(gridId) {
  const el=$(gridId); if(!el||el.dataset.loaded) return; el.dataset.loaded=1;
  try {
    const d = await tmdb(`/discover/tv?language=es-ES&with_keywords=${ANIME_KW}&sort_by=popularity.desc`);
    el.innerHTML = (d.results||[]).map(i=>card(i,'tv')).join('');
  } catch(e) { el.innerHTML=`<div style="color:var(--red);padding:16px">${e.message}</div>`; }
}
async function loadTopRated() {
  const el=$('toprated-grid'); if(!el||el.dataset.loaded) return; el.dataset.loaded=1;
  try {
    const d = await tmdb('/movie/top_rated?language=es-ES');
    el.innerHTML = (d.results||[]).map(i=>card(i,'movie')).join('');
  } catch(e) { el.innerHTML=`<div style="color:var(--red);padding:16px">${e.message}</div>`; }
}

// ===================== CARD =====================
function card(item, type) {
  const title = esc(item.title||item.name||'Sin título');
  const rating = item.vote_average?.toFixed(1)||'?';
  const img = item.poster_path
    ? `<img class="card-img" src="${IMG_W500+item.poster_path}" alt="${title}" loading="lazy" onerror="this.className='card-img-placeholder';this.alt='Sin imagen'"/>`
    : `<div class="card-img-placeholder">Sin imagen</div>`;
  return `<div class="card" onclick="openDetail('${type}',${item.id})">${img}<span class="card-tag">${type==='movie'?'Film':'TV'}</span><div class="card-overlay"><div class="card-title">${title}</div><div class="card-rating">★ ${rating}</div></div></div>`;
}

// ===================== SEARCH =====================
async function doSearch() {
  const q=$('search-input').value.trim(); if(!q) return;
  ALL_SECTIONS.forEach(hide);
  $('hero-section').style.display='none';
  show('search-section');
  $('search-title').textContent=`Resultados: "${q}"`;
  $('search-results').innerHTML='<div style="color:var(--muted);padding:20px">Buscando...</div>';
  try {
    const d = await tmdb('/search/multi?query='+encodeURIComponent(q)+'&language=es-ES');
    const res = (d.results||[]).filter(i=>i.media_type!=='person');
    $('search-results').innerHTML = res.length ? res.map(i=>card(i,i.media_type||'movie')).join('') : '<div style="color:var(--muted);padding:20px">Sin resultados.</div>';
  } catch(e) { $('search-results').innerHTML=`<div style="color:var(--red);padding:20px">${e.message}</div>`; }
}

// ===================== DETAIL MODAL =====================
async function openDetail(type, id) {
  show('loading-overlay');
  try {
    const [det, cred] = await Promise.all([
      tmdb(`/${type}/${id}?language=es-ES`),
      tmdb(`/${type}/${id}/credits?language=es-ES`),
    ]);
    const title = det.title||det.name||'';
    const year  = (det.release_date||det.first_air_date||'').slice(0,4);
    const rt    = det.runtime?`${det.runtime} min`:(det.episode_run_time?.[0]?`${det.episode_run_time[0]} min/ep`:'');
    const cast  = (cred.cast||[]).slice(0,8);

    if(det.backdrop_path) $('modal-backdrop').style.backgroundImage=`url(${IMG_W780+det.backdrop_path})`;
    $('modal-poster').src = det.poster_path?IMG_W500+det.poster_path:'';
    $('modal-poster').alt = title;
    $('modal-badges').innerHTML = (det.genres||[]).map(g=>`<span class="badge badge-genre">${g.name}</span>`).join('');
    $('modal-title').textContent = title;
    $('modal-meta').innerHTML = `<span class="star">★ ${det.vote_average?.toFixed(1)||'N/A'}</span>${year?`<span>📅 ${year}</span>`:''}${rt?`<span>⏱ ${rt}</span>`:''}<span>${type==='movie'?'🎬 Película':'📺 Serie'}</span>${det.vote_count?`<span>${det.vote_count.toLocaleString()} votos</span>`:''}`;
    $('modal-overview').textContent = det.overview||'Sin descripción.';
    $('modal-watch-btn').innerHTML = `<button class="watch-now-btn" onclick="closeModal();openPlayer('${type}',${id},'${esc(title)}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> ▶ Ver ahora</button>`;
    $('modal-cast').innerHTML = cast.length?`<div class="cast-title">Reparto</div><div class="cast-list">${cast.map(a=>`<span class="cast-chip">${esc(a.name)}</span>`).join('')}</div>`:'';
    $('modal').scrollTop=0;
    show('modal-overlay');
    document.body.style.overflow='hidden';
  } catch(e){ console.error(e); }
  finally{ hide('loading-overlay'); }
}

function closeModal(event) {
  if(event&&event.target!==$('modal-overlay')&&!event.target.classList.contains('modal-close')) return;
  hide('modal-overlay'); document.body.style.overflow='';
}

// ===================== PLAYER =====================
async function openPlayer(type, id, title) {
  show('loading-overlay');
  currentSrc = 0;

  playerData = { type, id, title: title||'', season:1, episode:1, seasons:[] };

  // Para series/TV cargamos temporadas
  if (type === 'tv') {
    try {
      const det = await tmdb(`/tv/${id}?language=es-ES`);
      playerData.seasons = det.seasons?.filter(s=>s.season_number>0)||[];
      buildSeasonSelect();
      await buildEpisodeSelect(1);
      show('player-tv-controls');
    } catch(e){ hide('player-tv-controls'); }
  } else {
    hide('player-tv-controls');
  }

  hide('loading-overlay');
  hide('modal-overlay');
  buildSourceBtns();
  loadPlayerSrc();
  $('player-title').textContent = playerData.title;
  show('player-overlay');
  document.body.style.overflow='hidden';
}

function buildSourceBtns() {
  $('source-btns').innerHTML = SOURCES.map((s,i)=>
    `<button class="src-btn${i===currentSrc?' active':''}" onclick="switchSrc(${i})">${s.name}</button>`
  ).join('');
}

function switchSrc(idx) {
  currentSrc = idx;
  buildSourceBtns();
  loadPlayerSrc();
}

function loadPlayerSrc() {
  const s = SOURCES[currentSrc];
  const { type, id, season, episode } = playerData;
  const url = type==='movie' ? s.movie(id) : s.tv(id, season, episode);
  $('player-frame').src = url;
  updateEpInfo();
}

function updateEpInfo() {
  if (playerData.type==='tv') {
    $('player-ep-info').textContent = `T${playerData.season} · E${playerData.episode}`;
  } else {
    $('player-ep-info').textContent = '';
  }
}

// Temporadas
function buildSeasonSelect() {
  const sel = $('season-select');
  sel.innerHTML = playerData.seasons.map(s=>
    `<option value="${s.season_number}">Temporada ${s.season_number}</option>`
  ).join('');
  sel.value = playerData.season;
}

async function buildEpisodeSelect(season) {
  const sel = $('episode-select');
  sel.innerHTML = '<option>Cargando...</option>';
  try {
    const d = await tmdb(`/tv/${playerData.id}/season/${season}?language=es-ES`);
    const eps = d.episodes||[];
    sel.innerHTML = eps.map(e=>`<option value="${e.episode_number}">Ep ${e.episode_number}${e.name?` - ${e.name}`:''}</option>`).join('');
    sel.value = playerData.episode;
  } catch(e) {
    // fallback: 1-24
    sel.innerHTML = Array.from({length:24},(_,i)=>`<option value="${i+1}">Episodio ${i+1}</option>`).join('');
  }
}

async function onSeasonChange() {
  const s = parseInt($('season-select').value)||1;
  playerData.season = s;
  playerData.episode = 1;
  await buildEpisodeSelect(s);
  $('episode-select').value = 1;
  loadPlayerSrc();
}

function onEpisodeChange() {
  playerData.episode = parseInt($('episode-select').value)||1;
  loadPlayerSrc();
}

function closePlayer() {
  hide('player-overlay');
  $('player-frame').src='';
  document.body.style.overflow='';
}

document.addEventListener('keydown', e => {
  if(e.key==='Escape') { closePlayer(); closeModal(); }
});
