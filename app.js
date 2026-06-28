// ════════════════════════════════════════════════
//  ShockTV — app.js
// ════════════════════════════════════════════════
const IMG_W500 = 'https://image.tmdb.org/t/p/w500';
const IMG_W780 = 'https://image.tmdb.org/t/p/w780';
const IMG_ORI  = 'https://image.tmdb.org/t/p/original';
const TMDB_URL = 'https://api.themoviedb.org/3';
const ANIFY    = 'https://api.anify.tv';
const ANIME_KW = 210024;

// ── Streaming sources ──
const SRC_MOVIE = id      => `https://unlimplay.com/play/embed/movie/${id}`;
const SRC_TV    = (id,s,e)=> `https://unlimplay.com/play/embed/tv/${id}/${s}/${e}`;
const SRC_ANIME = (id,ep,lang='sub') => `https://megaplay.buzz/stream/ani/${id}/${ep}/${lang}`;

// ── State ──
let TOKEN = '';
let heroItems=[], heroIdx=0, heroTimer=null;
let pl = { type:'', tmdbId:0, s:1, ep:1, seasons:[], title:'', isAnime:false, aniId:null, lang:'sub' };
let favs = {}; // { "movie-123": {id,type,title,poster,rating}, ... }

// ── Utils ──
const $ = id => document.getElementById(id);
const show = id => $(id)?.classList.remove('hidden');
const hide = id => $(id)?.classList.add('hidden');
const esc  = s  => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function tmdbH(){ return { accept:'application/json', Authorization:'Bearer '+TOKEN }; }
async function tmdb(path){
  const r = await fetch(TMDB_URL+path, { headers:tmdbH() });
  const d = await r.json();
  if(!r.ok || d.success===false) throw new Error(d.status_message||'TMDB error');
  return d;
}
async function anify(path){
  const r = await fetch(ANIFY+path, { headers:{ accept:'application/json' } });
  if(!r.ok) throw new Error('Anify error '+r.status);
  return r.json();
}

// ── Toast ──
let toastTimer;
function toast(msg, dur=2800){
  const t=$('toast'); if(!t) return;
  t.textContent=msg; show('toast');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>hide('toast'), dur);
}

// ════ INIT ════
document.addEventListener('DOMContentLoaded', async()=>{
  show('loader-ov');
  window.addEventListener('scroll', ()=> $('navbar').classList.toggle('scrolled', window.scrollY>60));
  $('search-input').addEventListener('keydown', e=> e.key==='Enter' && doSearch());

  loadFavs();
  detectNet();
  await loadToken();

  if(!TOKEN){
    $('main-content').innerHTML='<div style="color:var(--red);padding:32px;text-align:center;font-size:1rem">⚠️ Token TMDB no encontrado — configura <strong>config.js</strong></div>';
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

// ════ NETWORK DETECT ════
async function detectNet(){
  const dot=$('net-dot'), txt=$('net-txt');
  if(!dot||!txt) return;
  const nav=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  let label='Cargando...', color='#888';

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
      else{ label='⚠️ Lenta'; color='#ef4444'; }
    }
    if(nav&&(nav.type==='wifi'||nav.effectiveType==='4g')&&ms>1100){ label='🔒 VPN'; color='#a78bfa'; }
  }catch(e){}

  dot.style.background=color; txt.textContent=label;
  setTimeout(detectNet, 30000);
}

// ════ FAVORITES ════
const FAV_KEY='shocktv_favs';
function loadFavs(){ try{ favs=JSON.parse(localStorage.getItem(FAV_KEY)||'{}'); }catch(e){ favs={}; } updateFavCount(); }
function saveFavs(){ try{ localStorage.setItem(FAV_KEY, JSON.stringify(favs)); }catch(e){} updateFavCount(); }
function favKey(type,id){ return `${type}-${id}`; }
function isFav(type,id){ return !!favs[favKey(type,id)]; }
function toggleFav(type,id,title,poster,rating){
  const k=favKey(type,id);
  if(favs[k]){ delete favs[k]; toast('Eliminado de favoritos'); }
  else{ favs[k]={id,type,title,poster,rating}; toast('❤️ Añadido a favoritos'); }
  saveFavs();
  // Refresh fav button in modal if open
  const fb=$('fav-modal-btn');
  if(fb){ fb.classList.toggle('active', isFav(type,id)); fb.textContent=isFav(type,id)?'❤️ En favoritos':'🤍 Favoritos'; }
  // Refresh cards
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

// ════ SIDEBAR ════
function openSidebar(){ $('sidebar').classList.add('open'); $('sb-overlay').classList.add('open'); document.body.style.overflow='hidden'; }
function closeSidebar(){ $('sidebar').classList.remove('open'); $('sb-overlay').classList.remove('open'); document.body.style.overflow=''; }

// ════ NAV ACTIVE ════
const NAV_MAP={ home:'nb-home', fav:'nb-fav', movies:'nb-movies', tv:'nb-tv', anime:'nb-anime', toprated:'nb-toprated' };
const SBI_MAP={ home:'sbi-home', fav:'sbi-fav', movies:'sbi-movies', tv:'sbi-tv', anime:'sbi-anime', toprated:'sbi-toprated' };
function setNavActive(sec){
  Object.values(NAV_MAP).forEach(id=>$(id)?.classList.remove('active'));
  Object.values(SBI_MAP).forEach(id=>$(id)?.classList.remove('active'));
  if(NAV_MAP[sec]) $(NAV_MAP[sec])?.classList.add('active');
  if(SBI_MAP[sec]) $(SBI_MAP[sec])?.classList.add('active');
}

// ════ SECTIONS ════
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
    fav:      ()=>{ show('fav-section');    renderFavs(); },
    movies:   ()=>{ show('movies-section'); loadGrid('movies-grid','movie'); },
    tv:       ()=>{ show('tv-section');     loadGrid('tv-grid','tv'); },
    anime:    ()=>{ show('anime-section');  loadAnimeGrid(); },
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
  }catch(e){ $('genre-grid').innerHTML=err(e); }
}

async function setAnimeGenre(genreId,label){
  hideAll(); show('genre-section'); $('genre-title').textContent='⛩️ Anime · '+label;
  $('genre-grid').innerHTML=spin(); closeSidebar();
  window.scrollTo({top:0,behavior:'smooth'});
  try{
    const d=await tmdb(`/discover/tv?language=es-ES&with_keywords=${ANIME_KW}&with_genres=${genreId}&sort_by=popularity.desc`);
    $('genre-grid').innerHTML=(d.results||[]).map(i=>card(i,'tv',true)).join('')||nores();
  }catch(e){ $('genre-grid').innerHTML=err(e); }
}

// ════ HOME ════
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
  }catch(e){ console.error('loadHome',e); }

  // Anify — async, no bloquea
  loadAnifyHome();
}

async function loadAnifyHome(){
  try{
    const d=await anify('/seasonal/anime?fields=id,title,coverImage,bannerImage,rating,status,currentEpisode,year,description');
    const trending=(d.trending||[]).slice(0,20);
    const seasonal=(d.seasonal||[]).slice(0,20);
    if(trending.length) renderSlider('s-anime', trending, false, false, true, true);
    if(seasonal.length) renderSlider('s-anime2', seasonal, false, false, true, true);
  }catch(e){ console.warn('Anify no disponible:', e.message); }
}

// ════ HERO ════
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

// ════ SLIDERS ════
function renderSlider(id,items,mixed=false,isTV=false,isAnime=false,fromAnify=false){
  const c=$(id); if(!c) return;
  c.innerHTML=(items||[]).map(i=>{
    if(fromAnify) return cardAnify(i);
    const type=mixed?(i.media_type||'movie'):(isTV?'tv':'movie');
    return card(i,type,isAnime);
  }).join('');
}
function slide(id,dir){ const s=$(id); if(s) s.scrollBy({left:dir*154*3,behavior:'smooth'}); }

// ════ GRIDS ════
async function loadGrid(gridId,type){
  const el=$(gridId); if(!el||el.dataset.loaded) return; el.dataset.loaded=1;
  el.innerHTML=spin();
  try{
    const path=type==='movie'?'/movie/popular?language=es-ES':'/tv/popular?language=es-ES';
    const d=await tmdb(path);
    el.innerHTML=(d.results||[]).map(i=>card(i,type)).join('');
  }catch(e){ el.innerHTML=err(e); }
}
async function loadAnimeGrid(){
  const el=$('anime-grid'); if(!el||el.dataset.loaded) return; el.dataset.loaded=1;
  el.innerHTML=spin();
  try{
    const d=await anify('/seasonal/anime?fields=id,title,coverImage,rating,status,currentEpisode,year');
    const items=[...(d.trending||[]),...(d.seasonal||[])].slice(0,40);
    el.innerHTML=items.map(i=>cardAnify(i)).join('');
  }catch(e){
    // Fallback TMDB
    try{
      const d=await tmdb(`/discover/tv?language=es-ES&with_keywords=${ANIME_KW}&sort_by=popularity.desc`);
      el.innerHTML=(d.results||[]).map(i=>card(i,'tv',true)).join('');
    }catch(e2){ el.innerHTML=err(e2); }
  }
}
async function loadTopRated(){
  const el=$('toprated-grid'); if(!el||el.dataset.loaded) return; el.dataset.loaded=1;
  el.innerHTML=spin();
  try{
    const d=await tmdb('/movie/top_rated?language=es-ES');
    el.innerHTML=(d.results||[]).map(i=>card(i,'movie')).join('');
  }catch(e){ el.innerHTML=err(e); }
}

// ════ CARD (TMDB) ════
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
      onclick="event.stopPropagation();toggleFav('${type}',${item.id},'${title.replace(/'/g,"\\'")}','${item.poster_path||''}',${item.vote_average||0})"
    >${isFav(type,item.id)?'❤️':'🤍'}</button>
    <div class="card-ov"><div class="card-title">${title}</div><div class="card-rat">★ ${rating}</div></div>
  </div>`;
}

// ════ CARD (ANIFY) ════
function cardAnify(item){
  const title=esc(item.title?.english||item.title?.romaji||item.title?.native||'Sin título');
  const rating=(item.rating?.anilist||item.rating?.mal||0);
  const ratingStr=rating?((rating/10).toFixed(1)):'?';
  const poster=item.coverImage||'';
  const id=item.id||'';
  const img=poster
    ?`<img class="card-img" src="${poster}" alt="${title}" loading="lazy" onerror="this.className='card-ph'">`
    :`<div class="card-ph"></div>`;
  return `<div class="card" onclick="openAnifyDetail('${id}','${title.replace(/'/g,"\\'")}')">${img}
    <span class="card-tag anime-tag">Anime</span>
    <div class="card-ov"><div class="card-title">${title}</div><div class="card-rat">★ ${ratingStr}</div></div>
  </div>`;
}

// ════ SEARCH ════
async function doSearch(){
  const q=$('search-input').value.trim(); if(!q) return;
  hideAll(); show('search-section');
  $('search-title').textContent=`Resultados: "${q}"`;
  $('search-results').innerHTML=spin();
  try{
    const d=await tmdb('/search/multi?query='+encodeURIComponent(q)+'&language=es-ES');
    const res=(d.results||[]).filter(i=>i.media_type!=='person');
    $('search-results').innerHTML=res.length?res.map(i=>card(i,i.media_type||'movie')).join(''):nores();
  }catch(e){ $('search-results').innerHTML=err(e); }
}

// ════ DETAIL MODAL ════
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
  }catch(e){ console.error(e); }
  finally{ hide('loader-ov'); }
}

// ════ ANIFY DETAIL ════
async function openAnifyDetail(anifyId,title){
  show('loader-ov');
  try{
    const det=await anify(`/info/${anifyId}?fields=id,title,coverImage,bannerImage,rating,description,genres,year,currentEpisode,mappings`);
    const t=det.title?.english||det.title?.romaji||title;
    const rat=(det.rating?.anilist||det.rating?.mal||0);
    // Try to find AniList id from mappings for player
    const anilistMapping=(det.mappings||[]).find(m=>m.providerId==='anilist');
    const aniId=anilistMapping?.id||anifyId;

    if(det.bannerImage||det.coverImage) $('modal-back').style.backgroundImage=`url(${det.bannerImage||det.coverImage})`;
    $('modal-poster').src=det.coverImage||'';
    $('modal-poster').alt=t;
    $('modal-tags').innerHTML=(det.genres||[]).map(g=>`<span class="badge">${g}</span>`).join('');
    $('modal-title').textContent=t;
    $('modal-meta').innerHTML=`<span class="star">★ ${rat?(rat/10).toFixed(1):'N/A'}</span>${det.year?`<span>📅 ${det.year}</span>`:''}<span>⛩️ Anime</span>${det.currentEpisode?`<span>📺 ${det.currentEpisode} eps</span>`:''}`;
    $('modal-ov-txt').textContent=det.description||'Sin descripción.';
    $('modal-actions').innerHTML=`<button class="watch-btn" onclick="closeModal();openAnifyPlayer('${aniId}','${esc(t)}')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> Ver ahora
    </button>`;
    $('modal-cast').innerHTML='';
    $('modal').scrollTop=0;
    show('modal-ov'); document.body.style.overflow='hidden';
  }catch(e){ console.error(e); }
  finally{ hide('loader-ov'); }
}

function closeModal(event){
  if(event&&event.target!==$('modal-ov')&&!event.target.classList.contains('modal-x')) return;
  hide('modal-ov'); document.body.style.overflow='';
}

// ════ PLAYER — Películas/Series (Unlimplay) ════
async function openPlayer(type,id,title,isAnime=false){
  show('loader-ov');
  pl={ type,tmdbId:id,s:1,ep:1,seasons:[],title:title||'',isAnime,aniId:null,lang:'sub' };

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

// ════ PLAYER — Anime (MegaPlay via AniList ID) ════
function openAnifyPlayer(anilistId,title){
  pl={ type:'anime',tmdbId:0,s:1,ep:1,seasons:[],title:title||'',isAnime:true,aniId:anilistId,lang:'sub' };
  hide('ply-tv');
  show('ply-lang');
  $('ply-ttl').textContent=pl.title;
  $('ply-ep').textContent='Ep 1';
  // Build episode select manually
  buildAnimeEpSel();
  loadFrame();
  hide('modal-ov');
  show('ply-overlay'); document.body.style.overflow='hidden';
}

function buildAnimeEpSel(){
  show('ply-tv');
  const s=$('sel-season'), e=$('sel-ep');
  s.innerHTML='<option value="1">Temporada 1</option>';
  e.innerHTML=Array.from({length:100},(_,i)=>`<option value="${i+1}">Episodio ${i+1}</option>`).join('');
  e.value=pl.ep;
}

function loadFrame(){
  const f=$('ply-frame');
  if(pl.isAnime && pl.aniId){
    f.src=SRC_ANIME(pl.aniId, pl.ep, pl.lang);
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
  hide('ply-overlay'); $('ply-frame').src=''; document.body.style.overflow='';
}

// ── Keyboard ──
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){ closePlayer(); closeModal(); }
});

// ════ HELPERS ════
const spin=()=>`<div style="display:flex;align-items:center;justify-content:center;padding:44px;color:var(--muted)"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"/></svg></div>`;
const err =e=>`<div style="color:var(--red);padding:18px;font-size:.86rem;grid-column:1/-1">⚠️ ${esc(String(e.message||e))}</div>`;
const nores=()=>`<div style="color:var(--muted);padding:18px;grid-column:1/-1">Sin resultados.</div>`;
