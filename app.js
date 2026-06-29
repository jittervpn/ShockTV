// ═══════════════════════════════════════════════
//  ShockTV — app.js  (clean build)
// ═══════════════════════════════════════════════
const IMG_W500 = 'https://image.tmdb.org/t/p/w500';
const IMG_W780 = 'https://image.tmdb.org/t/p/w780';
const IMG_ORI  = 'https://image.tmdb.org/t/p/original';
const TMDB_URL = 'https://api.themoviedb.org/3';
const JIKAN    = 'https://api.jikan.moe/v4';
const ANIME_KW = 210024;

// Streaming
const SRC_MOVIE = id        => `https://unlimplay.com/play/embed/movie/${id}`;
const SRC_TV    = (id,s,e)  => `https://unlimplay.com/play/embed/tv/${id}/${s}/${e}`;
// MegaPlay: lang = sub | dub | es (sub español) | esla (latino)
const SRC_ANIME = (malId,ep,lang) => `https://megaplay.buzz/stream/mal/${malId}/${ep}/${lang}`;

// ── Estado global ──
let TOKEN = '';
let heroItems = [], heroIdx = 0, heroTimer = null;
let pl = { type:'', tmdbId:0, malId:null, s:1, ep:1, seasons:[], cachedEps:null,
           title:'', isAnime:false, lang:'es', totalEps:0 };
let favs     = {};
let progress = {};

// ── Utilidades ──
const $    = id => document.getElementById(id);
const show = id => $(id)?.classList.remove('hidden');
const hide = id => $(id)?.classList.add('hidden');
const esc  = s  => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const sleep= ms => new Promise(r => setTimeout(r, ms));

function tmdbH(){ return { accept:'application/json', Authorization:'Bearer '+TOKEN }; }

async function tmdb(path){
  const r = await fetch(TMDB_URL+path, { headers: tmdbH() });
  const d = await r.json();
  if(!r.ok || d.success===false) throw new Error(d.status_message || 'TMDB error');
  return d;
}

async function jikan(path, attempt=0){
  const r = await fetch(JIKAN+path, { headers:{ accept:'application/json' } });
  if(r.status===429 && attempt<2){ await sleep(1300); return jikan(path, attempt+1); }
  if(!r.ok) throw new Error('Jikan '+r.status);
  return r.json();
}

// ── Toast ──
let toastTimer;
function toast(msg, dur=2500){
  const t=$('toast'); if(!t) return;
  t.textContent=msg; show('toast');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>hide('toast'), dur);
}

// ══════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  show('loader-ov');
  window.addEventListener('scroll', () =>
    $('navbar').classList.toggle('scrolled', window.scrollY > 60));
  setupSearch();
  loadFavs();
  loadProgress();
  detectNet();
  await loadToken();
  if(!TOKEN){
    $('main-content').innerHTML =
      '<div style="color:var(--red);padding:32px;text-align:center">⚠️ Token TMDB no encontrado — configura <strong>config.js</strong></div>';
    hide('loader-ov'); return;
  }
  await loadHome();
  setTimeout(() => hide('loader-ov'), 500);
});

async function loadToken(){
  if(window.__TMDB_TOKEN__?.length > 10){ TOKEN = window.__TMDB_TOKEN__; return; }
  try {
    const r = await fetch('/api/token');
    if(r.ok){ const d = await r.json(); if(d.token){ TOKEN=d.token; return; } }
  } catch(e){}
  if(window.TMDB_TOKEN) TOKEN = window.TMDB_TOKEN;
}

// ══════════════════════════════════════════════
//  RED
// ══════════════════════════════════════════════
async function detectNet(){
  const dot=$('net-dot'), txt=$('net-txt');
  if(!dot||!txt) return;
  const nav = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  let label='...', color='#888';

  if(nav){
    const eff      = nav.effectiveType || '';
    const connType = nav.type || '';
    const dl       = nav.downlink || 0;
    if(connType==='wifi' || (dl>5 && (eff==='4g'||eff==='5g'))){  label='📶 WiFi';  color='#22c55e'; }
    else if(connType==='cellular' || eff==='4g'){                   label='📱 4G';    color='#f59e0b'; }
    else if(eff==='3g' || eff==='2g'){                              label='⚠️ Lenta'; color='#ef4444'; }
  }

  try{
    const t0 = performance.now();
    await fetch('https://image.tmdb.org/t/p/w92/wwemzKWzjKYJFfCeiB57q3r4Bcm.png',
                { cache:'no-store', mode:'no-cors' });
    const ms = performance.now() - t0;
    if(!nav){
      if(ms < 450)       { label='📶 Rápida'; color='#22c55e'; }
      else if(ms < 1300) { label='📡 Media';  color='#f59e0b'; }
      else               { label='⚠️ Lenta';  color='#ef4444'; }
    }
    if(nav && nav.type==='wifi' && ms > 1200){ label='🔒 VPN'; color='#a78bfa'; }
  }catch(e){}

  dot.style.background = color;
  txt.textContent = label;
  setTimeout(detectNet, 30000);
}

// ══════════════════════════════════════════════
//  FAVORITOS
// ══════════════════════════════════════════════
const FAV_KEY = 'shocktv_favs';
function loadFavs(){
  try{ favs = JSON.parse(localStorage.getItem(FAV_KEY)||'{}'); }catch(e){ favs={}; }
  updateFavCount();
}
function saveFavs(){
  try{ localStorage.setItem(FAV_KEY, JSON.stringify(favs)); }catch(e){}
  updateFavCount();
}
function favKey(type,id){ return `${type}-${id}`; }
function isFav(type,id){ return !!favs[favKey(type,id)]; }
function toggleFav(type,id,title,poster,rating){
  const k = favKey(type,id);
  if(favs[k]){ delete favs[k]; toast('Eliminado de favoritos'); }
  else { favs[k]={id,type,title,poster,rating}; toast('❤️ Añadido a favoritos'); }
  saveFavs();
  const fb=$('fav-modal-btn');
  if(fb){ fb.classList.toggle('active',isFav(type,id));
          fb.textContent = isFav(type,id)?'❤️ En favoritos':'🤍 Favoritos'; }
  document.querySelectorAll(`.fav-heart[data-key="${k}"]`).forEach(h=>{
    h.classList.toggle('active',!!favs[k]);
    h.textContent = favs[k]?'❤️':'🤍';
  });
}
function updateFavCount(){
  const n=Object.keys(favs).length;
  const el=$('fav-count'); if(el) el.textContent = n>0?n:'';
}
function renderFavs(){
  const el=$('fav-grid'); if(!el) return;
  const items=Object.values(favs);
  if(!items.length){
    el.innerHTML='<div style="color:var(--muted);padding:32px;grid-column:1/-1">No tenés favoritos aún. Tocá 🤍 en cualquier póster.</div>';
    return;
  }
  el.innerHTML = items.map(i=>card(i,i.type)).join('');
}

// ══════════════════════════════════════════════
//  PROGRESO (episodios vistos)
// ══════════════════════════════════════════════
const PROG_KEY='shocktv_progress';
function loadProgress(){
  try{ progress=JSON.parse(localStorage.getItem(PROG_KEY)||'{}'); }catch(e){ progress={}; }
}
function saveProgress(){
  try{ localStorage.setItem(PROG_KEY,JSON.stringify(progress)); }catch(e){}
}
function epKey(type,id,s,ep){ return `${type}-${id}-s${s}e${ep}`; }
function markWatched(type,id,s,ep,val=true){
  const k=epKey(type,id,s,ep);
  if(val) progress[k]={watched:true};
  else delete progress[k];
  saveProgress(); refreshEpGrid();
}
function isWatched(type,id,s,ep){ return !!(progress[epKey(type,id,s,ep)]?.watched); }

// ══════════════════════════════════════════════
//  SIDEBAR / NAV
// ══════════════════════════════════════════════
function openSidebar(){
  $('sidebar').classList.add('open');
  $('sb-overlay').classList.add('open');
  document.body.style.overflow='hidden';
}
function closeSidebar(){
  $('sidebar').classList.remove('open');
  $('sb-overlay').classList.remove('open');
  document.body.style.overflow='';
}
const NAV_MAP = {home:'nb-home',fav:'nb-fav',movies:'nb-movies',tv:'nb-tv',anime:'nb-anime'};
const SBI_MAP = {home:'sbi-home',fav:'sbi-fav',movies:'sbi-movies',tv:'sbi-tv',anime:'sbi-anime',toprated:'sbi-toprated'};
function setNavActive(sec){
  Object.values(NAV_MAP).forEach(id=>$(id)?.classList.remove('active'));
  Object.values(SBI_MAP).forEach(id=>$(id)?.classList.remove('active'));
  if(NAV_MAP[sec]) $(NAV_MAP[sec])?.classList.add('active');
  if(SBI_MAP[sec]) $(SBI_MAP[sec])?.classList.add('active');
}

// ══════════════════════════════════════════════
//  BÚSQUEDA — dropdown flotante
// ══════════════════════════════════════════════
let searchDebounce;
function setupSearch(){
  const inp=$('search-input');
  inp.addEventListener('input',()=>{
    clearTimeout(searchDebounce);
    const q=inp.value.trim();
    if(!q){ closeDropdown(); return; }
    searchDebounce=setTimeout(()=>liveSearch(q), 350);
  });
  inp.addEventListener('keydown',e=>{
    if(e.key==='Enter'){ clearTimeout(searchDebounce); doSearch(); closeDropdown(); }
    if(e.key==='Escape'){ inp.value=''; closeDropdown(); }
  });
  document.addEventListener('click',e=>{
    if(!e.target.closest('.nav-search') && !e.target.closest('.search-dropdown'))
      closeDropdown();
  });
}

async function liveSearch(q){
  const dd=$('search-dropdown');
  dd.innerHTML=`<div class="sd-no-results"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite;vertical-align:middle;margin-right:6px"><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"/></svg>Buscando...</div>`;
  show('search-dropdown');
  try{
    const [tr, jr] = await Promise.allSettled([
      tmdb('/search/multi?query='+encodeURIComponent(q)+'&language=es-ES&page=1'),
      jikan('/anime?q='+encodeURIComponent(q)+'&limit=4&sfw=true'),
    ]);
    const items=[];
    if(tr.status==='fulfilled')
      (tr.value.results||[]).filter(i=>i.media_type!=='person').slice(0,6).forEach(i=>items.push({
        title: i.title||i.name,
        year:  (i.release_date||i.first_air_date||'').slice(0,4),
        poster: i.poster_path?IMG_W500+i.poster_path:'',
        tag:    i.media_type==='movie'?'Película':'Serie',
        // Al tocar → mini-card modal (no abre player directo)
        onclick:`closeDropdown();openDetail('${i.media_type||"movie"}',${i.id})`
      }));
    if(jr.status==='fulfilled')
      (jr.value.data||[]).slice(0,4).forEach(i=>items.push({
        title:  i.title_spanish||i.title_english||i.title,
        year:   i.year||'',
        poster: i.images?.jpg?.image_url||'',
        tag:    'Anime',
        onclick:`closeDropdown();openJikanDetail(${i.mal_id},'${esc((i.title_spanish||i.title_english||i.title).replace(/'/g,"\\'"))}')`
      }));
    if(!items.length){ dd.innerHTML=`<div class="sd-no-results">Sin resultados para "<strong>${esc(q)}</strong>"</div>`; return; }
    dd.innerHTML = items.map(i=>`
      <div class="sd-item" onclick="${i.onclick}">
        ${i.poster
          ?`<img class="sd-img" src="${i.poster}" alt="" loading="lazy" onerror="this.style.display='none'">`
          :`<div class="sd-img"></div>`}
        <div class="sd-info">
          <div class="sd-title">${esc(i.title||'')}</div>
          <div class="sd-meta">${i.year}</div>
        </div>
        <span class="sd-tag">${i.tag}</span>
      </div>`).join('');
  }catch(e){ dd.innerHTML=`<div class="sd-no-results">Error al buscar</div>`; }
}

function closeDropdown(){ hide('search-dropdown'); }

function doSearch(){
  const q=$('search-input').value.trim(); if(!q) return;
  hideAll(); show('search-section');
  $('search-title').textContent=`Resultados: "${q}"`;
  $('search-results').innerHTML=spin();
  Promise.allSettled([
    tmdb('/search/multi?query='+encodeURIComponent(q)+'&language=es-ES'),
    jikan('/anime?q='+encodeURIComponent(q)+'&limit=10&sfw=true'),
  ]).then(([t,j])=>{
    const ti = t.status==='fulfilled'
      ? (t.value.results||[]).filter(i=>i.media_type!=='person').map(i=>card(i,i.media_type||'movie'))
      : [];
    const ji = j.status==='fulfilled'
      ? (j.value.data||[]).map(i=>cardJikan(i))
      : [];
    $('search-results').innerHTML=[...ti,...ji].join('')||nores();
  });
}

// ══════════════════════════════════════════════
//  SECCIONES
// ══════════════════════════════════════════════
const ALL_SEC=['home-sections','movies-section','tv-section','anime-section',
               'toprated-section','search-section','genre-section','fav-section'];
function hideAll(){
  ALL_SEC.forEach(hide);
  $('hero-section').style.display='none';
}

function goHome(){
  ALL_SEC.forEach(hide); show('home-sections');
  $('hero-section').style.display='';
  setNavActive('home'); closeSidebar();
  window.scrollTo({top:0,behavior:'smooth'});
}
function setSection(sec){
  hideAll(); setNavActive(sec); closeSidebar();
  window.scrollTo({top:0,behavior:'smooth'});
  const map={
    fav:      ()=>{ show('fav-section');     renderFavs(); },
    movies:   ()=>{ show('movies-section');  loadGrid('movies-grid','movie'); },
    tv:       ()=>{ show('tv-section');      loadGrid('tv-grid','tv'); },
    anime:    ()=>{ show('anime-section');   loadAnimeGrid(); },
    toprated: ()=>{ show('toprated-section');loadTopRated(); },
  };
  map[sec]?.();
}
async function setGenre(type,genreId,label){
  hideAll(); show('genre-section');
  $('genre-title').textContent=(type==='movie'?'🎬 ':'📺 ')+label;
  $('genre-grid').innerHTML=spin(); closeSidebar();
  window.scrollTo({top:0,behavior:'smooth'});
  try{
    const d=await tmdb(`/discover/${type}?language=es-ES&with_genres=${genreId}&sort_by=popularity.desc`);
    $('genre-grid').innerHTML=(d.results||[]).map(i=>card(i,type)).join('')||nores();
  }catch(e){ $('genre-grid').innerHTML=errBox(e); }
}
async function setAnimeGenre(malGenreId,label){
  hideAll(); show('genre-section');
  $('genre-title').textContent='⛩️ Anime · '+label;
  $('genre-grid').innerHTML=spin(); closeSidebar();
  window.scrollTo({top:0,behavior:'smooth'});
  try{
    const d=await jikan(`/anime?genres=${malGenreId}&order_by=popularity&sort=asc&limit=24&sfw=true`);
    $('genre-grid').innerHTML=(d.data||[]).map(i=>cardJikan(i)).join('')||nores();
  }catch(e){ $('genre-grid').innerHTML=errBox(e); }
}

// ══════════════════════════════════════════════
//  HOME
// ══════════════════════════════════════════════
async function loadHome(){
  try{
    const [tm,ttv,mp,tvp] = await Promise.all([
      tmdb('/trending/movie/week?language=es-ES'),
      tmdb('/trending/tv/week?language=es-ES'),
      tmdb('/movie/popular?language=es-ES'),
      tmdb('/tv/popular?language=es-ES'),
    ]);
    heroItems=(tm.results||[]).filter(m=>m.backdrop_path).slice(0,8);
    if(heroItems.length){ renderHero(heroItems[0],'movie'); startHero(); }
    renderSlider('s-trend',[...(tm.results||[]).slice(0,10),...(ttv.results||[]).slice(0,10)],true);
    renderSlider('s-mov',  mp.results||[]);
    renderSlider('s-tv',   ttv.results||[], false, true);
  }catch(e){ console.error('loadHome',e); }
  loadJikanHome();
}

async function loadJikanHome(){
  try{
    const trending = await jikan('/top/anime?filter=airing&limit=20');
    if(trending.data?.length) renderSlider('s-anime', trending.data, false,false,false,true);
    await sleep(400);
    const seasonal = await jikan('/seasons/now?limit=20');
    if(seasonal.data?.length) renderSlider('s-anime2', seasonal.data, false,false,false,true);
  }catch(e){
    const msg='<div style="color:var(--muted);padding:16px;font-size:.82rem">⚠️ Anime no disponible ahora, intenta más tarde</div>';
    const a=$('s-anime'),b=$('s-anime2');
    if(a) a.innerHTML=msg;
    if(b) b.innerHTML=msg;
  }
}

// ══════════════════════════════════════════════
//  HERO
// ══════════════════════════════════════════════
function renderHero(item,type){
  $('hero-bg').style.backgroundImage = item.backdrop_path?`url(${IMG_ORI+item.backdrop_path})`:'';
  $('hero-title').textContent = item.title||item.name||'';
  $('hero-desc').textContent  = item.overview||'';
  const mt = item.media_type||type;
  $('hero-meta').innerHTML=`<span class="rating">★ ${item.vote_average?.toFixed(1)||'N/A'}</span>
    <span>${(item.release_date||item.first_air_date||'').slice(0,4)}</span>
    <span>${mt==='movie'?'🎬 Película':'📺 Serie'}</span>`;
  $('hero-play').onclick = ()=>openPlayer(mt,item.id,item.title||item.name);
  $('hero-info').onclick = ()=>openDetail(mt,item.id);
}
function startHero(){
  if(heroTimer) clearInterval(heroTimer);
  heroTimer=setInterval(()=>{ heroIdx=(heroIdx+1)%heroItems.length; renderHero(heroItems[heroIdx],'movie'); },7000);
}

// ══════════════════════════════════════════════
//  SLIDERS / GRIDS
// ══════════════════════════════════════════════
function renderSlider(id,items,mixed=false,isTV=false,isAnime=false,fromJikan=false){
  const c=$(id); if(!c) return;
  c.innerHTML=(items||[]).map(i=>
    fromJikan ? cardJikan(i) : card(i, mixed?(i.media_type||'movie'):(isTV?'tv':'movie'), isAnime)
  ).join('');
}
function slide(id,dir){ const s=$(id); if(s) s.scrollBy({left:dir*154*3,behavior:'smooth'}); }

async function loadGrid(gridId,type){
  const el=$(gridId); if(!el||el.dataset.loaded) return; el.dataset.loaded=1; el.innerHTML=spin();
  try{
    const d=await tmdb(type==='movie'?'/movie/popular?language=es-ES':'/tv/popular?language=es-ES');
    el.innerHTML=(d.results||[]).map(i=>card(i,type)).join('');
  }catch(e){ el.innerHTML=errBox(e); }
}
async function loadAnimeGrid(){
  const el=$('anime-grid'); if(!el||el.dataset.loaded) return; el.dataset.loaded=1; el.innerHTML=spin();
  try{
    const [top,season]=await Promise.all([
      jikan('/top/anime?filter=airing&limit=20'),
      jikan('/seasons/now?limit=20'),
    ]);
    const seen=new Set();
    const unique=[...(top.data||[]),...(season.data||[])].filter(a=>{
      if(seen.has(a.mal_id)) return false; seen.add(a.mal_id); return true;
    });
    el.innerHTML=unique.slice(0,40).map(i=>cardJikan(i)).join('');
  }catch(e){ el.innerHTML=errBox(e); }
}
async function loadTopRated(){
  const el=$('toprated-grid'); if(!el||el.dataset.loaded) return; el.dataset.loaded=1; el.innerHTML=spin();
  try{
    const d=await tmdb('/movie/top_rated?language=es-ES');
    el.innerHTML=(d.results||[]).map(i=>card(i,'movie')).join('');
  }catch(e){ el.innerHTML=errBox(e); }
}

// ══════════════════════════════════════════════
//  MINI CARD MODAL — toca póster → elige acción
// ══════════════════════════════════════════════
function openMiniModal(type, id, title, poster, rating, overview, isAnime, malId){
  // Mostrar modal rápido con 2 opciones: Ver / Sinopsis
  const ov = document.createElement('div');
  ov.id='mini-ov';
  ov.style.cssText='position:fixed;inset:0;z-index:450;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.7);backdrop-filter:blur(4px)';
  ov.onclick=e=>{ if(e.target===ov) ov.remove(); };

  const watchFn = isAnime && malId
    ? `document.getElementById('mini-ov').remove();openAnimePlayer(${malId},'${esc(title).replace(/'/g,"\\'")}',100)`
    : `document.getElementById('mini-ov').remove();openPlayer('${type}',${id},'${esc(title).replace(/'/g,"\\'")}')`;
  const infoFn  = isAnime && malId
    ? `document.getElementById('mini-ov').remove();openJikanDetail(${malId},'${esc(title).replace(/'/g,"\\'")}')`
    : `document.getElementById('mini-ov').remove();openDetail('${type}',${id},${!!isAnime})`;

  ov.innerHTML=`
    <div style="background:var(--s1);border-radius:14px;max-width:380px;width:100%;overflow:hidden;border:1px solid rgba(255,255,255,.1);box-shadow:0 24px 60px rgba(0,0,0,.8);animation:fadein .2s">
      <div style="position:relative">
        ${poster?`<img src="${poster}" alt="${esc(title)}" style="width:100%;aspect-ratio:16/9;object-fit:cover;object-position:center top;display:block">`:'<div style="width:100%;aspect-ratio:16/9;background:var(--s2)"></div>'}
        <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(9,9,15,.95) 0%,transparent 55%)"></div>
        <button onclick="document.getElementById('mini-ov').remove()" style="position:absolute;top:10px;right:10px;background:rgba(9,9,15,.8);border:none;color:var(--text);width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:.9rem;display:flex;align-items:center;justify-content:center">✕</button>
        <div style="position:absolute;bottom:12px;left:14px;right:14px">
          <div style="font-family:'Bebas Neue',cursive;font-size:1.5rem;letter-spacing:1px;line-height:1.1;margin-bottom:4px">${esc(title)}</div>
          <div style="font-size:.78rem;color:var(--gold)">★ ${rating||'N/A'}</div>
        </div>
      </div>
      <div style="padding:16px">
        <div style="display:flex;gap:10px;margin-bottom:${overview?'14px':'0'}">
          <button onclick="${watchFn}" style="flex:1;display:flex;align-items:center;justify-content:center;gap:7px;background:var(--red);color:#fff;border:none;padding:11px;font-family:'Inter',sans-serif;font-size:.9rem;font-weight:700;border-radius:8px;cursor:pointer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> Ver ahora
          </button>
          <button onclick="${infoFn}" style="flex:1;display:flex;align-items:center;justify-content:center;gap:7px;background:rgba(255,255,255,.09);color:var(--text);border:1px solid rgba(255,255,255,.14);padding:11px;font-family:'Inter',sans-serif;font-size:.9rem;font-weight:600;border-radius:8px;cursor:pointer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Sinopsis
          </button>
        </div>
        ${overview?`<p style="font-size:.8rem;color:rgba(240,240,248,.7);line-height:1.55;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(overview)}</p>`:''}
      </div>
    </div>`;
  document.body.appendChild(ov);
}

// ══════════════════════════════════════════════
//  CARDS
// ══════════════════════════════════════════════
function card(item, type, isAnime=false){
  const title  = esc(item.title||item.name||'Sin título');
  const rating = item.vote_average?.toFixed(1)||'?';
  const tag    = isAnime?'Anime':(type==='movie'?'Film':'TV');
  const k      = favKey(type,item.id);
  const poster = item.poster_path?IMG_W500+item.poster_path:'';
  const overview = esc(item.overview||'');
  const img = poster
    ?`<img class="card-img" src="${poster}" alt="${title}" loading="lazy" onerror="this.className='card-ph'">`
    :`<div class="card-ph"></div>`;

  // Al tocar la card → mini modal (Ver / Sinopsis)
  const clickFn=`openMiniModal('${type}',${item.id},'${title.replace(/'/g,"\\'")}','${poster}','${rating}','${overview.replace(/'/g,"\\'").substring(0,300)}',${isAnime},null)`;

  return `<div class="card" onclick="${clickFn}">${img}
    <span class="card-tag${isAnime?' anime-tag':''}">${tag}</span>
    <button class="fav-heart${isFav(type,item.id)?' active':''}" data-key="${k}"
      onclick="event.stopPropagation();toggleFav('${type}',${item.id},'${title.replace(/'/g,"\\'")}','${item.poster_path||''}',${item.vote_average||0})">
      ${isFav(type,item.id)?'❤️':'🤍'}
    </button>
    <div class="card-ov"><div class="card-title">${title}</div><div class="card-rat">★ ${rating}</div></div>
  </div>`;
}

function cardJikan(item){
  // Título preferido: español → inglés → romanji
  const title  = esc(item.title_spanish||item.title_english||item.title||'Sin título');
  const rating = item.score?item.score.toFixed(1):'?';
  const malId  = item.mal_id;
  const poster = item.images?.jpg?.large_image_url||item.images?.jpg?.image_url||'';
  const overview = esc((item.synopsis||'').replace(/\[Written.*?\]/g,'').trim().substring(0,300));
  const img = poster
    ?`<img class="card-img" src="${poster}" alt="${title}" loading="lazy" onerror="this.className='card-ph'">`
    :`<div class="card-ph"></div>`;

  const clickFn=`openMiniModal('anime',${malId},'${title.replace(/'/g,"\\'")}','${poster}','${rating}','${overview.replace(/'/g,"\\'").substring(0,300)}',true,${malId})`;

  return `<div class="card" onclick="${clickFn}">${img}
    <span class="card-tag anime-tag">Anime</span>
    <div class="card-ov"><div class="card-title">${title}</div><div class="card-rat">★ ${rating}</div></div>
  </div>`;
}

// ══════════════════════════════════════════════
//  DETAIL MODAL COMPLETO — TMDB
// ══════════════════════════════════════════════
async function openDetail(type,id,isAnime=false){
  show('loader-ov');
  try{
    const [det,cred]=await Promise.all([
      tmdb(`/${type}/${id}?language=es-ES`),
      tmdb(`/${type}/${id}/credits?language=es-ES`),
    ]);
    const title  = det.title||det.name||'';
    const year   = (det.release_date||det.first_air_date||'').slice(0,4);
    const rt     = det.runtime?`${det.runtime} min`:(det.episode_run_time?.[0]?`${det.episode_run_time[0]} min/ep`:'');
    const cast   = (cred.cast||[]).slice(0,8);
    const faved  = isFav(type,id);

    if(det.backdrop_path) $('modal-back').style.backgroundImage=`url(${IMG_W780+det.backdrop_path})`;
    else $('modal-back').style.backgroundImage='';
    $('modal-poster').src=det.poster_path?IMG_W500+det.poster_path:'';
    $('modal-poster').alt=title;
    $('modal-tags').innerHTML=(det.genres||[]).map(g=>`<span class="badge">${g.name}</span>`).join('');
    $('modal-title').textContent=title;
    $('modal-meta').innerHTML=`<span class="star">★ ${det.vote_average?.toFixed(1)||'N/A'}</span>
      ${year?`<span>📅 ${year}</span>`:''}
      ${rt?`<span>⏱ ${rt}</span>`:''}
      <span>${type==='movie'?'🎬 Película':(isAnime?'⛩️ Anime':'📺 Serie')}</span>
      ${det.vote_count?`<span>${det.vote_count.toLocaleString()} votos</span>`:''}`;
    $('modal-ov-txt').textContent=det.overview||'Sin descripción disponible.';
    $('modal-actions').innerHTML=`
      <button class="watch-btn" onclick="closeModal();openPlayer('${type}',${id},'${esc(title)}',${!!isAnime})">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> Ver ahora
      </button>
      <button class="fav-btn${faved?' active':''}" id="fav-modal-btn"
        onclick="toggleFav('${type}',${id},'${esc(title)}','${det.poster_path||''}',${det.vote_average||0})">
        ${faved?'❤️ En favoritos':'🤍 Favoritos'}
      </button>`;
    $('modal-cast').innerHTML=cast.length
      ?`<div class="cast-t">Reparto</div><div class="cast-list">${cast.map(a=>`<span class="cast-chip">${esc(a.name)}</span>`).join('')}</div>`:'';
    $('modal').scrollTop=0; show('modal-ov'); document.body.style.overflow='hidden';
  }catch(e){ console.error(e); toast('Error al cargar detalles'); }
  finally{ hide('loader-ov'); }
}

// ══════════════════════════════════════════════
//  DETAIL MODAL — JIKAN (con textos en español)
// ══════════════════════════════════════════════
async function openJikanDetail(malId, fallbackTitle=''){
  show('loader-ov');
  try{
    const det=await jikan(`/anime/${malId}/full`);
    const d=det.data||{};
    // Título en español
    const title = d.title_spanish||d.title_english||d.title||fallbackTitle;
    const year   = d.year||'';
    const rating = d.score?d.score.toFixed(1):'N/A';
    const genres = (d.genres||[]).map(g=>g.name);
    const eps    = d.episodes?`${d.episodes} eps`:'? eps';
    const totalEps = d.episodes||100;
    const statusMap={
      'Currently Airing':'En emisión',
      'Finished Airing':'Finalizado',
      'Not yet aired':'Próximamente'
    };
    const status = statusMap[d.status]||d.status||'';
    // Sinopsis limpia en español si el título está disponible en español
    const synopsis = (d.synopsis||'Sin sinopsis disponible.')
      .replace(/\[Written.*?\]/g,'').replace(/\(Source:.*?\)/g,'').trim();

    $('modal-back').style.backgroundImage=d.images?.jpg?.large_image_url
      ?`url(${d.images.jpg.large_image_url})`:'';
    $('modal-poster').src=d.images?.jpg?.large_image_url||'';
    $('modal-poster').alt=title;
    $('modal-tags').innerHTML=genres.map(g=>`<span class="badge">${g}</span>`).join('');
    $('modal-title').textContent=title;
    $('modal-meta').innerHTML=`
      <span class="star">★ ${rating}</span>
      ${year?`<span>📅 ${year}</span>`:''}
      <span>📺 ${eps}</span>
      <span>⛩️ Anime</span>
      ${status?`<span>${status}</span>`:''}`;
    $('modal-ov-txt').textContent=synopsis;
    $('modal-actions').innerHTML=`
      <button class="watch-btn" onclick="closeModal();openAnimePlayer(${malId},'${esc(title)}',${totalEps})">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> Ver ahora
      </button>`;
    $('modal-cast').innerHTML='';
    $('modal').scrollTop=0; show('modal-ov'); document.body.style.overflow='hidden';
  }catch(e){ console.error(e); toast('Error al cargar anime'); }
  finally{ hide('loader-ov'); }
}

function closeModal(event){
  if(event&&event.target!==$('modal-ov')&&!event.target.classList.contains('modal-x')) return;
  hide('modal-ov'); document.body.style.overflow='';
}

// ══════════════════════════════════════════════
//  PLAYER — Películas / Series
// ══════════════════════════════════════════════
async function openPlayer(type,id,title,isAnime=false){
  show('loader-ov');
  pl={type,tmdbId:id,malId:null,s:1,ep:1,seasons:[],cachedEps:null,
      title:title||'',isAnime,lang:'es',totalEps:0};

  if(type==='tv'){
    try{
      const det=await tmdb(`/tv/${id}?language=es-ES`);
      pl.seasons=(det.seasons||[]).filter(s=>s.season_number>0);
      buildLangPills(['es','sub','dub']);
      await loadSeasonEps(1);
      show('ep-panel');
    }catch(e){ hide('ep-panel'); }
  }else{
    hide('ep-panel');
    buildLangPills([]);
  }

  $('ply-ttl').textContent=pl.title;
  updateEpBadge(); loadFrame();
  hide('loader-ov'); hide('modal-ov');
  show('ply-overlay'); document.body.style.overflow='hidden';
}

// ══════════════════════════════════════════════
//  PLAYER — Anime (MAL ID)
// ══════════════════════════════════════════════
function openAnimePlayer(malId, title, totalEps=100){
  pl={type:'anime',tmdbId:0,malId,s:1,ep:1,seasons:[],cachedEps:null,
      title:title||'',isAnime:true,lang:'es',totalEps};
  // Lang: Español sub | Latino | Sub EN | Dub EN
  buildLangPills(['es','esla','sub','dub']);
  loadAnimeEpGrid(totalEps);
  show('ep-panel');
  $('ply-ttl').textContent=pl.title;
  updateEpBadge(); loadFrame();
  hide('modal-ov');
  show('ply-overlay'); document.body.style.overflow='hidden';
}

// ══════════════════════════════════════════════
//  IDIOMA / FUENTE
// ══════════════════════════════════════════════
const LANG_LABEL={es:'🇪🇸 Español',esla:'🇦🇷 Latino',sub:'Sub EN',dub:'Dub EN'};
function buildLangPills(langs){
  const c=$('lang-pills'); if(!c) return;
  c.innerHTML=langs.map(l=>`
    <button class="lang-pill${pl.lang===l?' active':''}" onclick="setLang('${l}')">
      ${LANG_LABEL[l]||l}
    </button>`).join('');
}
function setLang(lang){
  pl.lang=lang;
  const langs=pl.isAnime?['es','esla','sub','dub']:['es','sub','dub'];
  buildLangPills(langs);
  loadFrame();
}

// ══════════════════════════════════════════════
//  FRAME
// ══════════════════════════════════════════════
function loadFrame(){
  const f=$('ply-frame');
  if(pl.isAnime)         f.src = SRC_ANIME(pl.malId, pl.ep, pl.lang);
  else if(pl.type==='movie') f.src = SRC_MOVIE(pl.tmdbId);
  else                   f.src = SRC_TV(pl.tmdbId, pl.s, pl.ep);
}
function updateEpBadge(){
  $('ply-ep').textContent=(pl.type==='tv'||pl.isAnime)
    ?`Temporada ${pl.s} · Episodio ${pl.ep}`:'';
}

// ══════════════════════════════════════════════
//  PANEL DE EPISODIOS
// ══════════════════════════════════════════════
async function loadSeasonEps(season){
  pl.s=season; pl.ep=1;
  // Tabs de temporadas
  const tabsEl=$('ep-season-tabs');
  if(tabsEl && pl.seasons.length>0){
    tabsEl.innerHTML=pl.seasons.map(s=>
      `<button class="ep-stab${s.season_number===season?' active':''}"
         onclick="loadSeasonEps(${s.season_number})">T${s.season_number}</button>`
    ).join('');
  }
  try{
    const d=await tmdb(`/tv/${pl.tmdbId}/season/${season}?language=es-ES`);
    const eps=d.episodes||[];
    pl.totalEps=eps.length;
    pl.cachedEps=eps;
    renderTVEpGrid(eps);
  }catch(e){
    const eps=Array.from({length:24},(_,i)=>({episode_number:i+1,name:''}));
    pl.cachedEps=eps;
    renderTVEpGrid(eps);
  }
}

function renderTVEpGrid(eps){
  const grid=$('ep-grid'); if(!grid) return;
  const watched=eps.filter(e=>isWatched('tv',pl.tmdbId,pl.s,e.episode_number)).length;
  const info=$('ep-progress-info');
  if(info) info.textContent=watched>0?`${watched}/${eps.length} vistos`:'';

  grid.innerHTML=eps.map(e=>{
    const w=isWatched('tv',pl.tmdbId,pl.s,e.episode_number);
    const playing=(pl.ep===e.episode_number);
    return `<button class="ep-btn${w?' watched':''}${playing?' playing':''}"
      onclick="playTVEp(${e.episode_number})"
      title="${e.name||`Episodio ${e.episode_number}`}"
    >${e.episode_number}</button>`;
  }).join('');
}

function loadAnimeEpGrid(total){
  const grid=$('ep-grid'); if(!grid) return;
  const tabsEl=$('ep-season-tabs'); if(tabsEl) tabsEl.innerHTML='';
  const realTotal=Math.max(total||1,1);
  const watched=Array.from({length:realTotal},(_,i)=>i+1)
    .filter(ep=>isWatched('anime',pl.malId,1,ep)).length;
  const info=$('ep-progress-info');
  if(info) info.textContent=watched>0?`${watched}/${realTotal} vistos`:'';

  grid.innerHTML=Array.from({length:realTotal},(_,i)=>{
    const ep=i+1;
    const w=isWatched('anime',pl.malId,1,ep);
    const playing=(pl.ep===ep);
    return `<button class="ep-btn${w?' watched':''}${playing?' playing':''}"
      onclick="playAnimeEp(${ep})"
      title="Episodio ${ep}"
    >${ep}</button>`;
  }).join('');
}

function playTVEp(ep){
  if(pl.ep!==ep) markWatched('tv',pl.tmdbId,pl.s,pl.ep,true);
  pl.ep=ep; updateEpBadge(); loadFrame(); refreshEpGrid(); scrollToActiveEp();
}
function playAnimeEp(ep){
  if(pl.ep!==ep) markWatched('anime',pl.malId,1,pl.ep,true);
  pl.ep=ep; updateEpBadge(); loadFrame(); refreshEpGrid(); scrollToActiveEp();
}
function refreshEpGrid(){
  if(pl.isAnime) loadAnimeEpGrid(pl.totalEps);
  else if(pl.cachedEps) renderTVEpGrid(pl.cachedEps);
}
function scrollToActiveEp(){
  setTimeout(()=>{
    const active=document.querySelector('.ep-btn.playing');
    if(active) active.scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'});
  },80);
}

function closePlayer(){
  // Guardar ep actual como visto
  if(pl.type==='tv')   markWatched('tv',pl.tmdbId,pl.s,pl.ep,true);
  if(pl.isAnime)       markWatched('anime',pl.malId,1,pl.ep,true);
  hide('ply-overlay');
  $('ply-frame').src='';
  document.body.style.overflow='';
}

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){ closePlayer(); closeModal();
    const m=$('mini-ov'); if(m) m.remove(); }
});

// ══════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════
const spin   = ()=>`<div style="display:flex;align-items:center;justify-content:center;padding:44px;color:var(--muted);grid-column:1/-1"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"/></svg></div>`;
const errBox = e=>`<div style="color:var(--red);padding:18px;font-size:.86rem;grid-column:1/-1">⚠️ ${esc(String(e?.message||e))}</div>`;
const nores  = ()=>`<div style="color:var(--muted);padding:18px;grid-column:1/-1">Sin resultados.</div>`;
