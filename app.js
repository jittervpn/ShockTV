// ═══════════════════════════════════════════
//  ShockTV — app.js
// ═══════════════════════════════════════════
const IMG_W500 = 'https://image.tmdb.org/t/p/w500';
const IMG_W780 = 'https://image.tmdb.org/t/p/w780';
const IMG_ORI  = 'https://image.tmdb.org/t/p/original';
const TMDB_URL = 'https://api.themoviedb.org/3';
const JIKAN    = 'https://api.jikan.moe/v4';
const ANIME_KW = 210024;

// ── Fuentes de streaming ──
// Películas / Series: Unlimplay
const SRC_MOVIE = id       => `https://unlimplay.com/play/embed/movie/${id}`;
const SRC_TV    = (id,s,e) => `https://unlimplay.com/play/embed/tv/${id}/${s}/${e}`;

// Anime por MAL ID:
// 1. MegaPlay (sub/dub inglés)
// 2. LATanime  (audio latino/castellano) — via embed de su propia página
const SRC_ANIME_MEGA  = (malId,ep,lang='sub') => `https://megaplay.buzz/stream/mal/${malId}/${ep}/${lang}`;
const SRC_ANIME_LAT   = (slug,ep)             => `https://latanime.org/embed/${slug}/${ep}`;
// Fallback genérico por MAL ID en 2embed
const SRC_ANIME_EMBED = (malId,ep)            => `https://www.2embed.stream/embed/anilist/${malId}/${ep}`;

// ── State ──
let TOKEN = '';
let heroItems=[], heroIdx=0, heroTimer=null;
let pl = { type:'', tmdbId:0, malId:null, latSlug:null, s:1, ep:1, seasons:[], title:'', isAnime:false, lang:'sub', srcMode:'mega' };
let favs = {};

// ── Utils ──
const $ = id => document.getElementById(id);
const show = id => $(id)?.classList.remove('hidden');
const hide = id => $(id)?.classList.add('hidden');
const esc  = s  => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function tmdbH(){ return { accept:'application/json', Authorization:'Bearer '+TOKEN }; }

async function tmdb(path){
  const r = await fetch(TMDB_URL+path, { headers:tmdbH() });
  const d = await r.json();
  if(!r.ok || d.success===false) throw new Error(d.status_message||'TMDB error');
  return d;
}

// Jikan con retry automático si hay rate limit (429)
async function jikan(path, attempt=0){
  try {
    const r = await fetch(JIKAN+path, { headers:{ accept:'application/json' } });
    if(r.status===429 && attempt<2){ await sleep(1200); return jikan(path, attempt+1); }
    if(!r.ok) throw new Error('Jikan '+r.status);
    return r.json();
  } catch(e) { throw e; }
}

// ── Toast ──
let toastTimer;
function toast(msg, dur=2800){
  const t=$('toast'); if(!t) return;
  t.textContent=msg; show('toast');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>hide('toast'), dur);
}

// ══════════════════════════════════
//  INIT
// ══════════════════════════════════
document.addEventListener('DOMContentLoaded', async()=>{
  show('loader-ov');
  window.addEventListener('scroll', ()=> $('navbar').classList.toggle('scrolled', window.scrollY>60));
  $('search-input').addEventListener('keydown', e=> e.key==='Enter' && doSearch());

  loadFavs();
  detectNet();
  await loadToken();

  if(!TOKEN){
    $('main-content').innerHTML='<div style="color:var(--red);padding:32px;text-align:center">⚠️ Token TMDB no encontrado — configura <strong>config.js</strong></div>';
    hide('loader-ov'); return;
  }

  await loadHome();
  setTimeout(()=>hide('loader-ov'), 500);
});

async function loadToken(){
  if(window.__TMDB_TOKEN__?.length>10){ TOKEN=window.__TMDB_TOKEN__; return; }
  try{ const r=await fetch('/api/token'); if(r.ok){ const d=await r.json(); if(d.token){ TOKEN=d.token; return; } } }catch(e){}
  if(window.TMDB_TOKEN) TOKEN=window.TMDB_TOKEN;
}

// ══════════════════════════════════
//  NETWORK DETECT
// ══════════════════════════════════
async function detectNet(){
  const dot=$('net-dot'), txt=$('net-txt');
  if(!dot||!txt) return;
  const nav=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  let label='Midiendo...', color='#888';

  if(nav){
    const eff=nav.effectiveType||'', type=nav.type||'', down=nav.downlink||0;
    if(type==='wifi'||(down>5&&(eff==='4g'||eff==='5g'))){ label='📶 WiFi'; color='#22c55e'; }
    else if(type==='cellular'||eff==='4g'){ label='📱 4G'; color='#f59e0b'; }
    else if(eff==='3g'||eff==='2g'){ label='⚠️ Lenta'; color='#ef4444'; }
    else { label='🌐 Red'; color='#888'; }
  }

  try{
    const t0=performance.now();
    await fetch('https://image.tmdb.org/t/p/w92/wwemzKWzjKYJFfCeiB57q3r4Bcm.png',{cache:'no-store',mode:'no-cors'});
    const ms=performance.now()-t0;
    if(!nav){
      if(ms<450){ label='📶 Rápida'; color='#22c55e'; }
      else if(ms<1300){ label='📡 Media'; color='#f59e0b'; }
      else { label='⚠️ Lenta'; color='#ef4444'; }
    }
    if(nav&&(nav.type==='wifi'||nav.effectiveType==='4g')&&ms>1200){ label='🔒 VPN'; color='#a78bfa'; }
  }catch(e){}

  dot.style.background=color; txt.textContent=label;
  setTimeout(detectNet, 30000);
}

// ══════════════════════════════════
//  FAVORITES
// ══════════════════════════════════
const FAV_KEY='shocktv_favs';
function loadFavs(){ try{ favs=JSON.parse(localStorage.getItem(FAV_KEY)||'{}'); }catch(e){ favs={}; } updateFavCount(); }
function saveFavs(){ try{ localStorage.setItem(FAV_KEY,JSON.stringify(favs)); }catch(e){} updateFavCount(); }
function favKey(type,id){ return `${type}-${id}`; }
function isFav(type,id){ return !!favs[favKey(type,id)]; }

function toggleFav(type,id,title,poster,rating){
  const k=favKey(type,id);
  if(favs[k]){ delete favs[k]; toast('Eliminado de favoritos'); }
  else{ favs[k]={id,type,title,poster,rating}; toast('❤️ Añadido a favoritos'); }
  saveFavs();
  const fb=$('fav-modal-btn');
  if(fb){ fb.classList.toggle('active',isFav(type,id)); fb.textContent=isFav(type,id)?'❤️ En favoritos':'🤍 Favoritos'; }
  document.querySelectorAll(`.fav-heart[data-key="${k}"]`).forEach(h=>{
    h.classList.toggle('active',!!favs[k]); h.textContent=favs[k]?'❤️':'🤍';
  });
}
function updateFavCount(){
  const n=Object.keys(favs).length;
  const el=$('fav-count'); if(el) el.textContent=n>0?n:'';
}
function renderFavs(){
  const el=$('fav-grid'); if(!el) return;
  const items=Object.values(favs);
  if(!items.length){ el.innerHTML='<div style="color:var(--muted);padding:32px;grid-column:1/-1">No tenés favoritos aún. Presioná 🤍 en cualquier película o serie.</div>'; return; }
  el.innerHTML=items.map(i=>card(i,i.type)).join('');
}

// ══════════════════════════════════
//  SIDEBAR
// ══════════════════════════════════
function openSidebar(){ $('sidebar').classList.add('open'); $('sb-overlay').classList.add('open'); document.body.style.overflow='hidden'; }
function closeSidebar(){ $('sidebar').classList.remove('open'); $('sb-overlay').classList.remove('open'); document.body.style.overflow=''; }

// ══════════════════════════════════
//  NAV ACTIVE
// ══════════════════════════════════
const NAV_IDS={ home:'nb-home',fav:'nb-fav',movies:'nb-movies',tv:'nb-tv',anime:'nb-anime' };
const SBI_IDS={ home:'sbi-home',fav:'sbi-fav',movies:'sbi-movies',tv:'sbi-tv',anime:'sbi-anime',toprated:'sbi-toprated' };
function setNavActive(sec){
  Object.values(NAV_IDS).forEach(id=>$(id)?.classList.remove('active'));
  Object.values(SBI_IDS).forEach(id=>$(id)?.classList.remove('active'));
  if(NAV_IDS[sec]) $(NAV_IDS[sec])?.classList.add('active');
  if(SBI_IDS[sec]) $(SBI_IDS[sec])?.classList.add('active');
}

// ══════════════════════════════════
//  SECTIONS
// ══════════════════════════════════
const ALL_SEC=['home-sections','movies-section','tv-section','anime-section','toprated-section','search-section','genre-section','fav-section'];
function hideAll(){ ALL_SEC.forEach(hide); $('hero-section').style.display='none'; }

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
    fav:      ()=>{ show('fav-section'); renderFavs(); },
    movies:   ()=>{ show('movies-section'); loadGrid('movies-grid','movie'); },
    tv:       ()=>{ show('tv-section'); loadGrid('tv-grid','tv'); },
    anime:    ()=>{ show('anime-section'); loadAnimeGrid(); },
    toprated: ()=>{ show('toprated-section'); loadTopRated(); },
  };
  map[sec]?.();
}

async function setGenre(type,genreId,label){
  hideAll(); show('genre-section'); $('genre-title').textContent='🎬 '+label;
  $('genre-grid').innerHTML=spin(); closeSidebar();
  window.scrollTo({top:0,behavior:'smooth'});
  try{
    const d=await tmdb(`/discover/${type}?language=es-ES&with_genres=${genreId}&sort_by=popularity.desc`);
    $('genre-grid').innerHTML=(d.results||[]).map(i=>card(i,type)).join('')||nores();
  }catch(e){ $('genre-grid').innerHTML=errBox(e); }
}

async function setAnimeGenre(genreId,label){
  hideAll(); show('genre-section'); $('genre-title').textContent='⛩️ Anime · '+label;
  $('genre-grid').innerHTML=spin(); closeSidebar();
  window.scrollTo({top:0,behavior:'smooth'});
  // Usar Jikan con genre_ids de MAL (map de géneros)
  const malGenreMap={28:1,12:2,14:10,878:24,35:4,10749:22,27:7,18:8,9648:7};
  const malId=malGenreMap[genreId]||1;
  try{
    const d=await jikan(`/anime?genres=${malId}&order_by=popularity&sort=asc&limit=24&sfw=true`);
    $('genre-grid').innerHTML=(d.data||[]).map(i=>cardJikan(i)).join('')||nores();
  }catch(e){
    // Fallback TMDB
    try{
      const d=await tmdb(`/discover/tv?language=es-ES&with_keywords=${ANIME_KW}&with_genres=${genreId}&sort_by=popularity.desc`);
      $('genre-grid').innerHTML=(d.results||[]).map(i=>card(i,'tv',true)).join('')||nores();
    }catch(e2){ $('genre-grid').innerHTML=errBox(e2); }
  }
}

// ══════════════════════════════════
//  HOME
// ══════════════════════════════════
async function loadHome(){
  try{
    const [tm,ttv,mp,tvp]=await Promise.all([
      tmdb('/trending/movie/week?language=es-ES'),
      tmdb('/trending/tv/week?language=es-ES'),
      tmdb('/movie/popular?language=es-ES'),
      tmdb('/tv/popular?language=es-ES'),
    ]);
    heroItems=(tm.results||[]).filter(m=>m.backdrop_path).slice(0,8);
    if(heroItems.length){ renderHero(heroItems[0],'movie'); startHero(); }
    const trending=[...(tm.results||[]).slice(0,10),...(ttv.results||[]).slice(0,10)];
    renderSlider('s-trend',trending,true);
    renderSlider('s-mov',mp.results||[]);
    renderSlider('s-tv',ttv.results||[],false,true);
  }catch(e){ console.error('loadHome TMDB:',e); }

  // Jikan (async, no bloquea hero)
  loadJikanHome();
}

async function loadJikanHome(){
  try{
    // Trending (top airing)
    const trending=await jikan('/top/anime?filter=airing&limit=20');
    if(trending.data?.length){
      renderSlider('s-anime', trending.data, false, false, false, true);
    }
    // Pequeña pausa para no superar rate limit de Jikan (3 req/s)
    await sleep(400);
    // Esta temporada
    const seasonal=await jikan('/seasons/now?limit=20');
    if(seasonal.data?.length){
      renderSlider('s-anime2', seasonal.data, false, false, false, true);
    }
  }catch(e){
    console.warn('Jikan error:', e.message);
    // Mostrar mensaje amigable en los sliders
    $('s-anime').innerHTML  = '<div style="color:var(--muted);padding:16px;font-size:.82rem">⚠️ Jikan no disponible momentáneamente</div>';
    $('s-anime2').innerHTML = '<div style="color:var(--muted);padding:16px;font-size:.82rem">⚠️ Jikan no disponible momentáneamente</div>';
  }
}

// ══════════════════════════════════
//  HERO
// ══════════════════════════════════
function renderHero(item,type){
  $('hero-bg').style.backgroundImage=item.backdrop_path?`url(${IMG_ORI+item.backdrop_path})`:'';
  $('hero-title').textContent=item.title||item.name||'';
  $('hero-desc').textContent=item.overview||'';
  const mt=item.media_type||type;
  $('hero-meta').innerHTML=`<span class="rating">★ ${item.vote_average?.toFixed(1)||'N/A'}</span><span>${(item.release_date||item.first_air_date||'').slice(0,4)}</span><span>${mt==='movie'?'🎬 Película':'📺 Serie'}</span>`;
  $('hero-play').onclick=()=>openPlayer(mt,item.id,item.title||item.name);
  $('hero-info').onclick=()=>openDetail(mt,item.id);
}
function startHero(){
  if(heroTimer) clearInterval(heroTimer);
  heroTimer=setInterval(()=>{ heroIdx=(heroIdx+1)%heroItems.length; renderHero(heroItems[heroIdx],'movie'); },7000);
}

// ══════════════════════════════════
//  SLIDERS / GRIDS
// ══════════════════════════════════
function renderSlider(id,items,mixed=false,isTV=false,isAnime=false,fromJikan=false){
  const c=$(id); if(!c) return;
  c.innerHTML=(items||[]).map(i=>{
    if(fromJikan) return cardJikan(i);
    const type=mixed?(i.media_type||'movie'):(isTV?'tv':'movie');
    return card(i,type,isAnime);
  }).join('');
}
function slide(id,dir){ const s=$(id); if(s) s.scrollBy({left:dir*154*3,behavior:'smooth'}); }

async function loadGrid(gridId,type){
  const el=$(gridId); if(!el||el.dataset.loaded) return; el.dataset.loaded=1;
  el.innerHTML=spin();
  try{
    const path=type==='movie'?'/movie/popular?language=es-ES':'/tv/popular?language=es-ES';
    const d=await tmdb(path);
    el.innerHTML=(d.results||[]).map(i=>card(i,type)).join('');
  }catch(e){ el.innerHTML=errBox(e); }
}

async function loadAnimeGrid(){
  const el=$('anime-grid'); if(!el||el.dataset.loaded) return; el.dataset.loaded=1;
  el.innerHTML=spin();
  try{
    const [top,season]=await Promise.all([
      jikan('/top/anime?filter=airing&limit=20'),
      jikan('/seasons/now?limit=20'),
    ]);
    const all=[...(top.data||[]),...(season.data||[])];
    // Deduplicar por mal_id
    const seen=new Set(); const unique=all.filter(a=>{ if(seen.has(a.mal_id)) return false; seen.add(a.mal_id); return true; });
    el.innerHTML=unique.slice(0,40).map(i=>cardJikan(i)).join('');
  }catch(e){
    console.warn('Jikan error en anime grid:', e.message);
    // Fallback TMDB
    try{
      const d=await tmdb(`/discover/tv?language=es-ES&with_keywords=${ANIME_KW}&sort_by=popularity.desc`);
      el.innerHTML=(d.results||[]).map(i=>card(i,'tv',true)).join('');
    }catch(e2){ el.innerHTML=errBox(e2); }
  }
}

async function loadTopRated(){
  const el=$('toprated-grid'); if(!el||el.dataset.loaded) return; el.dataset.loaded=1;
  el.innerHTML=spin();
  try{
    const d=await tmdb('/movie/top_rated?language=es-ES');
    el.innerHTML=(d.results||[]).map(i=>card(i,'movie')).join('');
  }catch(e){ el.innerHTML=errBox(e); }
}

// ══════════════════════════════════
//  CARDS
// ══════════════════════════════════
function card(item,type,isAnime=false){
  const title=esc(item.title||item.name||'Sin título');
  const rating=item.vote_average?.toFixed(1)||'?';
  const tag=isAnime?'Anime':(type==='movie'?'Film':'TV');
  const k=favKey(type,item.id);
  const img=item.poster_path
    ?`<img class="card-img" src="${IMG_W500+item.poster_path}" alt="${title}" loading="lazy" onerror="this.className='card-ph'">`
    :`<div class="card-ph"></div>`;
  return `<div class="card" onclick="openDetail('${type}',${item.id},${isAnime})">${img}
    <span class="card-tag${isAnime?' anime-tag':''}">${tag}</span>
    <button class="fav-heart${isFav(type,item.id)?' active':''}" data-key="${k}"
      onclick="event.stopPropagation();toggleFav('${type}',${item.id},'${title.replace(/'/g,"\\'")}','${item.poster_path||''}',${item.vote_average||0})">
      ${isFav(type,item.id)?'❤️':'🤍'}
    </button>
    <div class="card-ov"><div class="card-title">${title}</div><div class="card-rat">★ ${rating}</div></div>
  </div>`;
}

// Card desde Jikan (MAL)
function cardJikan(item){
  const title=esc(item.title_english||item.title||'Sin título');
  const rating=item.score?item.score.toFixed(1):'?';
  const malId=item.mal_id;
  const poster=item.images?.jpg?.large_image_url||item.images?.jpg?.image_url||'';
  const img=poster
    ?`<img class="card-img" src="${poster}" alt="${title}" loading="lazy" onerror="this.className='card-ph'">`
    :`<div class="card-ph"></div>`;
  return `<div class="card" onclick="openJikanDetail(${malId},'${title.replace(/'/g,"\\'")}')">${img}
    <span class="card-tag anime-tag">Anime</span>
    <div class="card-ov"><div class="card-title">${title}</div><div class="card-rat">★ ${rating}</div></div>
  </div>`;
}

// ══════════════════════════════════
//  SEARCH
// ══════════════════════════════════
async function doSearch(){
  const q=$('search-input').value.trim(); if(!q) return;
  hideAll(); show('search-section');
  $('search-title').textContent=`Resultados: "${q}"`;
  $('search-results').innerHTML=spin();

  try{
    // Buscar en TMDB y Jikan en paralelo
    const [tmdbRes, jikanRes] = await Promise.allSettled([
      tmdb('/search/multi?query='+encodeURIComponent(q)+'&language=es-ES'),
      jikan('/anime?q='+encodeURIComponent(q)+'&limit=8&sfw=true'),
    ]);
    const tmdbItems=(tmdbRes.status==='fulfilled'?(tmdbRes.value.results||[]).filter(i=>i.media_type!=='person'):[]);
    const jikanItems=(jikanRes.status==='fulfilled'?jikanRes.value.data||[]:[]);

    const html=[
      ...tmdbItems.map(i=>card(i,i.media_type||'movie')),
      ...jikanItems.map(i=>cardJikan(i)),
    ].join('');
    $('search-results').innerHTML=html||nores();
  }catch(e){ $('search-results').innerHTML=errBox(e); }
}

// ══════════════════════════════════
//  DETAIL MODAL — TMDB
// ══════════════════════════════════
async function openDetail(type,id,isAnime=false){
  show('loader-ov');
  try{
    const [det,cred]=await Promise.all([
      tmdb(`/${type}/${id}?language=es-ES`),
      tmdb(`/${type}/${id}/credits?language=es-ES`),
    ]);
    const title=det.title||det.name||'';
    const year=(det.release_date||det.first_air_date||'').slice(0,4);
    const rt=det.runtime?`${det.runtime} min`:(det.episode_run_time?.[0]?`${det.episode_run_time[0]} min/ep`:'');
    const cast=(cred.cast||[]).slice(0,8);
    const faved=isFav(type,id);

    if(det.backdrop_path) $('modal-back').style.backgroundImage=`url(${IMG_W780+det.backdrop_path})`;
    else $('modal-back').style.backgroundImage='';
    $('modal-poster').src=det.poster_path?IMG_W500+det.poster_path:'';
    $('modal-poster').alt=title;
    $('modal-tags').innerHTML=(det.genres||[]).map(g=>`<span class="badge">${g.name}</span>`).join('');
    $('modal-title').textContent=title;
    $('modal-meta').innerHTML=`<span class="star">★ ${det.vote_average?.toFixed(1)||'N/A'}</span>${year?`<span>📅 ${year}</span>`:''}${rt?`<span>⏱ ${rt}</span>`:''}<span>${type==='movie'?'🎬 Película':(isAnime?'⛩️ Anime':'📺 Serie')}</span>`;
    $('modal-ov-txt').textContent=det.overview||'Sin descripción.';
    $('modal-actions').innerHTML=`
      <button class="watch-btn" onclick="closeModal();openPlayer('${type}',${id},'${esc(title)}',${!!isAnime})">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> Ver ahora
      </button>
      <button class="fav-btn${faved?' active':''}" id="fav-modal-btn"
        onclick="toggleFav('${type}',${id},'${esc(title)}','${det.poster_path||''}',${det.vote_average||0})">
        ${faved?'❤️ En favoritos':'🤍 Favoritos'}
      </button>`;
    $('modal-cast').innerHTML=cast.length?`<div class="cast-t">Reparto</div><div class="cast-list">${cast.map(a=>`<span class="cast-chip">${esc(a.name)}</span>`).join('')}</div>`:'';
    $('modal').scrollTop=0;
    show('modal-ov'); document.body.style.overflow='hidden';
  }catch(e){ console.error(e); toast('Error al cargar detalles'); }
  finally{ hide('loader-ov'); }
}

// ══════════════════════════════════
//  DETAIL MODAL — JIKAN (Anime MAL)
// ══════════════════════════════════
async function openJikanDetail(malId, fallbackTitle=''){
  show('loader-ov');
  try{
    const det=await jikan(`/anime/${malId}/full`);
    const d=det.data||{};
    const title=d.title_english||d.title||fallbackTitle;
    const year=d.year||'';
    const rating=d.score?d.score.toFixed(1):'N/A';
    const genres=(d.genres||[]).map(g=>g.name);
    const studios=(d.studios||[]).map(s=>s.name).join(', ');
    const eps=d.episodes?`${d.episodes} eps`:'';

    $('modal-back').style.backgroundImage=d.trailer?.images?.large_image_url
      ?`url(${d.trailer.images.large_image_url})`
      :(d.images?.jpg?.large_image_url?`url(${d.images.jpg.large_image_url})`:'');
    $('modal-poster').src=d.images?.jpg?.large_image_url||d.images?.jpg?.image_url||'';
    $('modal-poster').alt=title;
    $('modal-tags').innerHTML=genres.map(g=>`<span class="badge">${g}</span>`).join('');
    $('modal-title').textContent=title;
    $('modal-meta').innerHTML=`<span class="star">★ ${rating}</span>${year?`<span>📅 ${year}</span>`:''}${eps?`<span>📺 ${eps}</span>`:''}<span>⛩️ Anime</span>${studios?`<span>🎬 ${studios}</span>`:''}`;
    $('modal-ov-txt').textContent=d.synopsis||'Sin sinopsis.';
    $('modal-actions').innerHTML=`
      <button class="watch-btn" onclick="closeModal();openAnimePlayer(${malId},'${esc(title)}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> Ver ahora
      </button>`;
    $('modal-cast').innerHTML='';
    $('modal').scrollTop=0;
    show('modal-ov'); document.body.style.overflow='hidden';
  }catch(e){ console.error(e); toast('Error al cargar anime'); }
  finally{ hide('loader-ov'); }
}

function closeModal(event){
  if(event&&event.target!==$('modal-ov')&&!event.target.classList.contains('modal-x')) return;
  hide('modal-ov'); document.body.style.overflow='';
}

// ══════════════════════════════════
//  PLAYER — Películas / Series
// ══════════════════════════════════
async function openPlayer(type,id,title,isAnime=false){
  show('loader-ov');
  pl={ type,tmdbId:id,malId:null,latSlug:null,s:1,ep:1,seasons:[],title:title||'',isAnime,lang:'sub',srcMode:'mega' };

  if(type==='tv'){
    try{
      const det=await tmdb(`/tv/${id}?language=es-ES`);
      pl.seasons=(det.seasons||[]).filter(s=>s.season_number>0);
      buildSeasonSel(); await buildEpSel(1); show('ply-tv');
    }catch(e){ hide('ply-tv'); }
  }else{ hide('ply-tv'); }

  hide('ply-lang');
  $('ply-ttl').textContent=pl.title;
  updateEpBadge(); loadFrame();
  hide('loader-ov'); hide('modal-ov');
  show('ply-overlay'); document.body.style.overflow='hidden';
}

// ══════════════════════════════════
//  PLAYER — Anime (MAL ID)
// ══════════════════════════════════
function openAnimePlayer(malId, title){
  pl={ type:'anime', tmdbId:0, malId, latSlug:null, s:1, ep:1, seasons:[], title:title||'', isAnime:true, lang:'sub', srcMode:'mega' };

  // Episode selector manual
  show('ply-tv');
  const ss=$('sel-season'), se=$('sel-ep');
  ss.innerHTML='<option value="1">Temporada 1</option>';
  se.innerHTML=Array.from({length:100},(_,i)=>`<option value="${i+1}">Episodio ${i+1}</option>`).join('');
  se.value=1;

  show('ply-lang');
  // Mostrar también botones de fuente (Latino incluido)
  renderAnimeSourceBtns();

  $('ply-ttl').textContent=pl.title;
  $('ply-ep').textContent='T1 · Ep1';
  loadFrame();
  hide('modal-ov');
  show('ply-overlay'); document.body.style.overflow='hidden';
}

function renderAnimeSourceBtns(){
  // Si existe el contenedor de fuentes lo usamos, si no lo creamos
  let bar=$('anime-src-bar');
  if(!bar){
    bar=document.createElement('div');
    bar.id='anime-src-bar';
    bar.style.cssText='display:flex;align-items:center;gap:8px;padding:9px 14px;background:var(--s2);border-top:1px solid rgba(255,255,255,.05);flex-shrink:0;flex-wrap:wrap;';
    bar.innerHTML='<span style="font-size:.68rem;font-weight:700;letter-spacing:1.5px;color:var(--muted);text-transform:uppercase">Fuente:</span>';
    $('ply-box').appendChild(bar);
  }
  const btns=[
    { id:'mega', label:'MegaPlay (Sub/Dub)' },
    { id:'lat',  label:'🇦🇷 LATanime (Latino)' },
  ];
  // Limpiar botones previos
  bar.querySelectorAll('.src-mode-btn').forEach(b=>b.remove());
  btns.forEach(b=>{
    const btn=document.createElement('button');
    btn.className='src-mode-btn lang-btn'+(pl.srcMode===b.id?' active':'');
    btn.textContent=b.label;
    btn.onclick=()=>{ pl.srcMode=b.id; renderAnimeSourceBtns(); loadFrame(); };
    bar.appendChild(btn);
  });
}

// ══════════════════════════════════
//  FRAME LOADER
// ══════════════════════════════════
function loadFrame(){
  const f=$('ply-frame');
  if(pl.isAnime){
    if(pl.srcMode==='lat'){
      // LATanime: usamos megaplay con dub como proxy dado que latanime no tiene embed público
      // Usamos un iframe apuntando a latanime buscando por título
      f.src=`https://latanime.org/`;
      // Mostrar mensaje orientativo
      $('ply-ep').textContent='Buscá "'+pl.title+'" en LATanime →';
      return;
    }
    // MegaPlay via MAL ID
    f.src=SRC_ANIME_MEGA(pl.malId, pl.ep, pl.lang);
  } else if(pl.type==='movie'){
    f.src=SRC_MOVIE(pl.tmdbId);
  } else {
    f.src=SRC_TV(pl.tmdbId, pl.s, pl.ep);
  }
}

function setLang(lang){
  pl.lang=lang;
  $('btn-sub').classList.toggle('active',lang==='sub');
  $('btn-dub').classList.toggle('active',lang==='dub');
  loadFrame();
}

function buildSeasonSel(){
  $('sel-season').innerHTML=pl.seasons.map(s=>`<option value="${s.season_number}">Temporada ${s.season_number}</option>`).join('');
  $('sel-season').value=pl.s;
}
async function buildEpSel(season){
  const sel=$('sel-ep');
  sel.innerHTML='<option>Cargando...</option>';
  try{
    const d=await tmdb(`/tv/${pl.tmdbId}/season/${season}?language=es-ES`);
    sel.innerHTML=(d.episodes||[]).map(e=>`<option value="${e.episode_number}">Ep ${e.episode_number}${e.name?` · ${e.name}`:''}</option>`).join('');
  }catch(e){
    sel.innerHTML=Array.from({length:24},(_,i)=>`<option value="${i+1}">Episodio ${i+1}</option>`).join('');
  }
  sel.value=pl.ep;
}
async function onSeasonChange(){
  const s=parseInt($('sel-season').value)||1;
  pl.s=s; pl.ep=1;
  await buildEpSel(s); $('sel-ep').value=1;
  loadFrame(); updateEpBadge();
}
function onEpChange(){
  pl.ep=parseInt($('sel-ep').value)||1;
  loadFrame(); updateEpBadge();
}
function updateEpBadge(){
  $('ply-ep').textContent=(pl.type==='tv'||pl.isAnime)?`T${pl.s} · Ep${pl.ep}`:'';
}
function closePlayer(){
  hide('ply-overlay');
  $('ply-frame').src='';
  // Limpiar barra de fuentes anime
  const bar=$('anime-src-bar'); if(bar) bar.remove();
  document.body.style.overflow='';
}

document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ closePlayer(); closeModal(); } });

// ══════════════════════════════════
//  HELPERS
// ══════════════════════════════════
const spin  = () => `<div style="display:flex;align-items:center;justify-content:center;padding:44px;color:var(--muted);grid-column:1/-1"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"/></svg></div>`;
const errBox = e => `<div style="color:var(--red);padding:18px;font-size:.86rem;grid-column:1/-1">⚠️ ${esc(String(e?.message||e))}</div>`;
const nores  = () => `<div style="color:var(--muted);padding:18px;grid-column:1/-1">Sin resultados.</div>`;
