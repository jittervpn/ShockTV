// ─────────────────────────────────────────────
//  ShockTV — app.js
// ─────────────────────────────────────────────
const IMG_W500 = 'https://image.tmdb.org/t/p/w500';
const IMG_W780 = 'https://image.tmdb.org/t/p/w780';
const IMG_ORI  = 'https://image.tmdb.org/t/p/original';
const TMDB_URL = 'https://api.themoviedb.org/3';
const ANIME_KW = 210024;

// ── Fuentes de streaming ──
// Películas/Series: solo Unlimplay
// Anime: MegaPlay (via MAL ID) — el player HiAnime más confiable
const MOVIE_SRC = (id)       => `https://unlimplay.com/play/embed/movie/${id}`;
const TV_SRC    = (id, s, e) => `https://unlimplay.com/play/embed/tv/${id}/${s}/${e}`;
// Anime por MAL ID (TMDB provee external_ids.tvdb_id y también mal_id vía /external_ids)
// Usamos megaplay.buzz con MAL id; fallback: AniList id
const ANIME_SRC_MAL  = (malId, ep, lang='sub')    => `https://megaplay.buzz/stream/mal/${malId}/${ep}/${lang}`;
const ANIME_SRC_ANI  = (aniId, ep, lang='sub')    => `https://megaplay.buzz/stream/ani/${aniId}/${ep}/${lang}`;

// ─────────────────── STATE ───────────────────
let TOKEN = '';
let heroItems = [], heroIdx = 0, heroTimer = null;
let player = { type:'', tmdbId:0, season:1, episode:1, seasons:[], title:'', isAnime:false, malId:null, anilistId:null, lang:'sub' };

// ─────────────────── UTILS ───────────────────
const $  = id => document.getElementById(id);
const show = id => $(id) && $(id).classList.remove('hidden');
const hide = id => $(id) && $(id).classList.add('hidden');
const esc  = s  => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function tmdbH(){ return { accept:'application/json', Authorization:'Bearer '+TOKEN }; }
async function tmdb(path){
  const r = await fetch(TMDB_URL+path, { headers: tmdbH() });
  const d = await r.json();
  if (!r.ok || d.success===false) throw new Error(d.status_message||'TMDB error');
  return d;
}

// ─────────────────── NETWORK DETECT ───────────────────
let netQuality = 'unknown'; // 'fast' | 'slow' | 'vpn' | 'unknown'

async function detectNetwork(){
  const info = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const bar  = $('net-bar');
  const dot  = $('net-dot');
  const txt  = $('net-txt');

  let label = '', color = '', icon = '';

  // 1) Navigator Connection API (Chrome/Android)
  if (info){
    const type   = info.type || '';
    const eff    = info.effectiveType || '';
    const down   = info.downlink || 0;

    if (type === 'wifi' || (down > 5 && (eff === '4g' || eff === '5g'))){
      label = 'WiFi — Óptimo'; color = '#22c55e'; icon = '📶'; netQuality = 'fast';
    } else if (type === 'cellular' || eff === '4g'){
      label = 'Datos 4G'; color = '#f59e0b'; icon = '📱'; netQuality = 'fast';
    } else if (eff === '3g' || eff === '2g'){
      label = 'Señal lenta'; color = '#ef4444'; icon = '⚠️'; netQuality = 'slow';
    } else {
      label = 'Red desconocida'; color = '#888'; icon = '🌐'; netQuality = 'unknown';
    }
  }

  // 2) Speed test rápido (ping a imagen pequeña de TMDB)
  try {
    const t0 = performance.now();
    await fetch('https://image.tmdb.org/t/p/w92/wwemzKWzjKYJFfCeiB57q3r4Bcm.png', { cache:'no-store', mode:'no-cors' });
    const ms = performance.now() - t0;
    if (!info){
      if (ms < 400)      { label = 'Conexión rápida'; color = '#22c55e'; icon = '📶'; netQuality = 'fast'; }
      else if (ms < 1200){ label = 'Conexión media';  color = '#f59e0b'; icon = '📡'; netQuality = 'slow'; }
      else               { label = 'Conexión lenta';  color = '#ef4444'; icon = '⚠️'; netQuality = 'slow'; }
    }
    // VPN hint: si la latencia es alta pero el tipo dice wifi
    if (info && (info.type==='wifi'||info.effectiveType==='4g') && ms > 1000){
      label = 'VPN detectada'; color = '#a78bfa'; icon = '🔒'; netQuality = 'fast';
    }
  } catch(e){}

  if (bar && dot && txt){
    dot.style.background = color;
    txt.textContent = icon + ' ' + label;
    bar.title = label;
  }

  // Recheck cada 30s
  setTimeout(detectNetwork, 30000);
}

// ─────────────────── INIT ───────────────────
document.addEventListener('DOMContentLoaded', async () => {
  show('loading-overlay');
  window.addEventListener('scroll', () => $('navbar').classList.toggle('scrolled', window.scrollY > 60));
  $('search-input').addEventListener('keydown', e => e.key === 'Enter' && doSearch());

  detectNetwork();
  await loadToken();

  if (!TOKEN){
    showErr('Token TMDB no encontrado. Revisa <strong>config.js</strong> o las variables de Railway.');
    hide('loading-overlay'); return;
  }

  await loadHome();
  setTimeout(() => hide('loading-overlay'), 500);
});

async function loadToken(){
  if (window.__TMDB_TOKEN__?.length > 10){ TOKEN = window.__TMDB_TOKEN__; return; }
  try { const r=await fetch('/api/token'); if(r.ok){ const d=await r.json(); if(d.token){ TOKEN=d.token; return; } } } catch(e){}
  if (window.TMDB_TOKEN) TOKEN = window.TMDB_TOKEN;
}

function showErr(msg){
  let e = $('global-err') || document.createElement('div');
  e.id='global-err';
  e.style.cssText='background:#1a0a0a;border:1px solid var(--red);border-radius:10px;padding:22px;margin:22px auto;max-width:680px;font-size:.88rem;line-height:1.7;color:#ccc;';
  e.innerHTML=`<div style="color:var(--red);font-weight:700;font-size:1rem;margin-bottom:8px">⚠️ Error</div>${msg}`;
  $('main-content').prepend(e);
}

// ─────────────────── SIDEBAR ───────────────────
function openSidebar()  { $('sidebar').classList.add('open'); $('sidebar-overlay').classList.add('open'); document.body.style.overflow='hidden'; }
function closeSidebar() { $('sidebar').classList.remove('open'); $('sidebar-overlay').classList.remove('open'); document.body.style.overflow=''; }

// ─────────────────── NAV ───────────────────
const NAV_IDS = { home:'nb-home', movies:'nb-movies', tv:'nb-tv', anime:'nb-anime', toprated:'nb-toprated' };
const SB_IDS  = { home:'sb-home', movies:'sb-movies', tv:'sb-tv', anime:'sb-anime', toprated:'sb-toprated' };

function setNavActive(sec){
  Object.values(NAV_IDS).forEach(id => $(id)?.classList.remove('active'));
  Object.values(SB_IDS).forEach(id  => $(id)?.classList.remove('active'));
  if (NAV_IDS[sec]) $(NAV_IDS[sec])?.classList.add('active');
  if (SB_IDS[sec])  $(SB_IDS[sec])?.classList.add('active');
}

// ─────────────────── SECTIONS ───────────────────
const ALL_SEC = ['home-sections','movies-section','tv-section','anime-section','toprated-section','search-section','genre-section'];

function goHome(){
  ALL_SEC.forEach(hide); show('home-sections');
  $('hero-section').style.display = '';
  setNavActive('home'); closeSidebar();
  window.scrollTo({ top:0, behavior:'smooth' });
}

function setSection(sec){
  ALL_SEC.forEach(hide);
  $('hero-section').style.display = 'none';
  setNavActive(sec); closeSidebar();
  window.scrollTo({ top:0, behavior:'smooth' });
  const map = {
    movies:   () => { show('movies-section');   loadGrid('movies-grid','movie'); },
    tv:       () => { show('tv-section');        loadGrid('tv-grid','tv'); },
    anime:    () => { show('anime-section');     loadAnimeGrid(); },
    toprated: () => { show('toprated-section');  loadTopRated(); },
  };
  map[sec]?.();
}

async function setGenre(type, genreId, label){
  ALL_SEC.forEach(hide); $('hero-section').style.display='none';
  show('genre-section'); $('genre-title').textContent = label;
  $('genre-grid').innerHTML = spinner();
  closeSidebar(); window.scrollTo({ top:0, behavior:'smooth' });
  try {
    const d = await tmdb(`/discover/${type}?language=es-ES&with_genres=${genreId}&sort_by=popularity.desc`);
    $('genre-grid').innerHTML = (d.results||[]).map(i=>card(i,type)).join('') || '<div style="color:var(--muted);padding:20px">Sin resultados.</div>';
  } catch(e){ $('genre-grid').innerHTML = errBox(e.message); }
}

async function setAnimeGenre(genreId, label){
  ALL_SEC.forEach(hide); $('hero-section').style.display='none';
  show('genre-section'); $('genre-title').textContent = label;
  $('genre-grid').innerHTML = spinner();
  closeSidebar(); window.scrollTo({ top:0, behavior:'smooth' });
  try {
    const d = await tmdb(`/discover/tv?language=es-ES&with_keywords=${ANIME_KW}&with_genres=${genreId}&sort_by=popularity.desc`);
    $('genre-grid').innerHTML = (d.results||[]).map(i=>card(i,'tv',true)).join('') || '<div style="color:var(--muted);padding:20px">Sin resultados.</div>';
  } catch(e){ $('genre-grid').innerHTML = errBox(e.message); }
}

// ─────────────────── HOME ───────────────────
async function loadHome(){
  try {
    const [tm, ttv, mp, tvp, anime] = await Promise.all([
      tmdb('/trending/movie/week?language=es-ES'),
      tmdb('/trending/tv/week?language=es-ES'),
      tmdb('/movie/popular?language=es-ES'),
      tmdb('/tv/popular?language=es-ES'),
      tmdb(`/discover/tv?language=es-ES&with_keywords=${ANIME_KW}&sort_by=popularity.desc`),
    ]);
    heroItems = (tm.results||[]).filter(m=>m.backdrop_path).slice(0,8);
    if (heroItems.length){ renderHero(heroItems[0],'movie'); startHero(); }
    const trending = [...(tm.results||[]).slice(0,10),...(ttv.results||[]).slice(0,10)];
    renderSlider('s-trending', trending, true);
    renderSlider('s-movies',   mp.results||[]);
    renderSlider('s-tv',       ttv.results||[], false, true);
    renderSlider('s-anime',    anime.results||[], false, true, true);
  } catch(e){ showErr('Error cargando datos: '+e.message); }
}

// ─────────────────── HERO ───────────────────
function renderHero(item, type){
  $('hero-bg').style.backgroundImage = item.backdrop_path ? `url(${IMG_ORI+item.backdrop_path})` : '';
  $('hero-title').textContent  = item.title||item.name||'';
  $('hero-desc').textContent   = item.overview||'';
  const mt = item.media_type||type;
  $('hero-meta').innerHTML = `<span class="rating">★ ${item.vote_average?.toFixed(1)||'N/A'}</span><span>${(item.release_date||item.first_air_date||'').slice(0,4)}</span><span>${mt==='movie'?'🎬 Película':'📺 Serie'}</span>`;
  $('hero-play-btn').onclick = () => openPlayer(mt, item.id, item.title||item.name);
  $('hero-info-btn').onclick = () => openDetail(mt, item.id);
}
function startHero(){
  if(heroTimer) clearInterval(heroTimer);
  heroTimer = setInterval(()=>{ heroIdx=(heroIdx+1)%heroItems.length; renderHero(heroItems[heroIdx],'movie'); }, 7000);
}

// ─────────────────── SLIDERS / GRIDS ───────────────────
function renderSlider(id, items, mixed=false, isTV=false, isAnime=false){
  const c=$(id); if(!c) return;
  c.innerHTML = (items||[]).map(i=>card(i, mixed?(i.media_type||'movie'):(isTV?'tv':'movie'), isAnime)).join('');
}
function slide(id, dir){ const s=$(id); if(s) s.scrollBy({ left:dir*164*3, behavior:'smooth' }); }

async function loadGrid(gridId, type){
  const el=$(gridId); if(!el||el.dataset.loaded) return; el.dataset.loaded=1;
  el.innerHTML=spinner();
  try {
    const path = type==='movie' ? '/movie/popular?language=es-ES' : '/tv/popular?language=es-ES';
    const d = await tmdb(path);
    el.innerHTML = (d.results||[]).map(i=>card(i,type)).join('');
  } catch(e){ el.innerHTML=errBox(e.message); }
}
async function loadAnimeGrid(){
  const el=$('anime-grid'); if(!el||el.dataset.loaded) return; el.dataset.loaded=1;
  el.innerHTML=spinner();
  try {
    const d = await tmdb(`/discover/tv?language=es-ES&with_keywords=${ANIME_KW}&sort_by=popularity.desc`);
    el.innerHTML = (d.results||[]).map(i=>card(i,'tv',true)).join('');
  } catch(e){ el.innerHTML=errBox(e.message); }
}
async function loadTopRated(){
  const el=$('toprated-grid'); if(!el||el.dataset.loaded) return; el.dataset.loaded=1;
  el.innerHTML=spinner();
  try {
    const d = await tmdb('/movie/top_rated?language=es-ES');
    el.innerHTML = (d.results||[]).map(i=>card(i,'movie')).join('');
  } catch(e){ el.innerHTML=errBox(e.message); }
}

// ─────────────────── CARD ───────────────────
function card(item, type, isAnime=false){
  const title  = esc(item.title||item.name||'Sin título');
  const rating = item.vote_average?.toFixed(1)||'?';
  const tag    = isAnime ? 'Anime' : (type==='movie'?'Film':'TV');
  const img    = item.poster_path
    ? `<img class="card-img" src="${IMG_W500+item.poster_path}" alt="${title}" loading="lazy" onerror="this.className='card-img-ph'">`
    : `<div class="card-img-ph"></div>`;
  return `<div class="card" onclick="openDetail('${type}',${item.id},${isAnime})">${img}<span class="card-tag${isAnime?' anime-tag':''}">${tag}</span><div class="card-overlay"><div class="card-title">${title}</div><div class="card-rating">★ ${rating}</div></div></div>`;
}

// ─────────────────── SEARCH ───────────────────
async function doSearch(){
  const q=$('search-input').value.trim(); if(!q) return;
  ALL_SEC.forEach(hide); $('hero-section').style.display='none';
  show('search-section'); $('search-title').textContent=`Resultados: "${q}"`;
  $('search-results').innerHTML=spinner();
  try {
    const d = await tmdb('/search/multi?query='+encodeURIComponent(q)+'&language=es-ES');
    const res = (d.results||[]).filter(i=>i.media_type!=='person');
    $('search-results').innerHTML = res.length
      ? res.map(i=>card(i,i.media_type||'movie')).join('')
      : '<div style="color:var(--muted);padding:20px">Sin resultados.</div>';
  } catch(e){ $('search-results').innerHTML=errBox(e.message); }
}

// ─────────────────── DETAIL MODAL ───────────────────
async function openDetail(type, id, isAnime=false){
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
    $('modal-meta').innerHTML = `<span class="star">★ ${det.vote_average?.toFixed(1)||'N/A'}</span>${year?`<span>📅 ${year}</span>`:''}${rt?`<span>⏱ ${rt}</span>`:''}<span>${type==='movie'?'🎬 Película':(isAnime?'⛩️ Anime':'📺 Serie')}</span>${det.vote_count?`<span>${det.vote_count.toLocaleString()} votos</span>`:''}`;
    $('modal-overview').textContent = det.overview||'Sin descripción.';
    $('modal-watch-btn').innerHTML = `<button class="watch-now-btn" onclick="closeModal();openPlayer('${type}',${id},'${esc(title)}',${!!isAnime})">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> Ver ahora
    </button>`;
    $('modal-cast').innerHTML = cast.length?`<div class="cast-title">Reparto</div><div class="cast-list">${cast.map(a=>`<span class="cast-chip">${esc(a.name)}</span>`).join('')}</div>`:'';
    $('modal').scrollTop=0;
    show('modal-overlay'); document.body.style.overflow='hidden';
  } catch(e){ console.error(e); }
  finally { hide('loading-overlay'); }
}

function closeModal(event){
  if(event&&event.target!==$('modal-overlay')&&!event.target.classList.contains('modal-close')) return;
  hide('modal-overlay'); document.body.style.overflow='';
}

// ─────────────────── PLAYER ───────────────────
async function openPlayer(type, id, title, isAnime=false){
  show('loading-overlay');
  player = { type, tmdbId:id, title:title||'', season:1, episode:1, seasons:[], isAnime, malId:null, anilistId:null, lang:'sub' };

  // Para anime: buscar MAL/AniList ID via TMDB external_ids
  if (isAnime || type==='tv'){
    try {
      const ext = await tmdb(`/${type}/${id}/external_ids`);
      player.malId     = ext.tvdb_id || null;   // TMDB no provee MAL directamente
      player.anilistId = null;
      // Para anime usamos el id de TMDB como fallback en Unlimplay si megaplay falla
    } catch(e){}
  }

  // Series/Anime: cargar temporadas
  if (type === 'tv'){
    try {
      const det = await tmdb(`/tv/${id}?language=es-ES`);
      player.seasons = (det.seasons||[]).filter(s=>s.season_number>0);
      buildSeasonSel();
      await buildEpSel(1);
      show('player-tv-controls');
    } catch(e){ hide('player-tv-controls'); }
  } else {
    hide('player-tv-controls');
    hide('player-lang-bar');
  }

  // Anime: mostrar botones SUB/DUB
  if (isAnime){
    show('player-lang-bar');
  } else {
    hide('player-lang-bar');
  }

  $('player-title').textContent = player.title;
  updateEpInfo();
  loadFrame();
  hide('loading-overlay');
  hide('modal-overlay');
  show('player-overlay');
  document.body.style.overflow='hidden';
}

function buildPlayerUrl(){
  const { type, tmdbId, season, episode, isAnime, malId, anilistId, lang } = player;
  if (isAnime){
    // MegaPlay via AniList ID si disponible, si no por Unlimplay
    if (anilistId) return ANIME_SRC_ANI(anilistId, episode, lang);
    // Fallback: Unlimplay (soporta tv también)
    return TV_SRC(tmdbId, season, episode);
  }
  if (type==='movie') return MOVIE_SRC(tmdbId);
  return TV_SRC(tmdbId, season, episode);
}

function loadFrame(){
  $('player-frame').src = buildPlayerUrl();
}

function setLang(lang){
  player.lang = lang;
  $('btn-sub').classList.toggle('active', lang==='sub');
  $('btn-dub').classList.toggle('active', lang==='dub');
  loadFrame();
}

function buildSeasonSel(){
  $('season-select').innerHTML = player.seasons.map(s=>`<option value="${s.season_number}">Temporada ${s.season_number}</option>`).join('');
  $('season-select').value = player.season;
}
async function buildEpSel(season){
  const sel=$('episode-select');
  sel.innerHTML='<option>Cargando...</option>';
  try {
    const d = await tmdb(`/tv/${player.tmdbId}/season/${season}?language=es-ES`);
    sel.innerHTML = (d.episodes||[]).map(e=>`<option value="${e.episode_number}">Ep ${e.episode_number}${e.name?` · ${e.name}`:''}</option>`).join('');
  } catch(e){
    sel.innerHTML = Array.from({length:24},(_,i)=>`<option value="${i+1}">Episodio ${i+1}</option>`).join('');
  }
  sel.value = player.episode;
}
async function onSeasonChange(){
  const s=parseInt($('season-select').value)||1;
  player.season=s; player.episode=1;
  await buildEpSel(s);
  $('episode-select').value=1;
  loadFrame(); updateEpInfo();
}
function onEpisodeChange(){
  player.episode=parseInt($('episode-select').value)||1;
  loadFrame(); updateEpInfo();
}
function updateEpInfo(){
  $('player-ep-info').textContent = player.type==='tv' ? `T${player.season} · Ep${player.episode}` : '';
}
function closePlayer(){
  hide('player-overlay');
  $('player-frame').src='';
  document.body.style.overflow='';
}

document.addEventListener('keydown', e => {
  if(e.key==='Escape'){ closePlayer(); closeModal(); }
});

// ─────────────────── HELPERS ───────────────────
const spinner = () => `<div style="display:flex;align-items:center;justify-content:center;padding:48px;color:var(--muted)"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"/></svg></div>`;
const errBox  = msg => `<div style="color:var(--red);padding:20px;font-size:.88rem">⚠️ ${esc(msg)}</div>`;
