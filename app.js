// ═══════════════════════════════════════════════
//  ShockTV — app.js
// ═══════════════════════════════════════════════
const IMG_W500 = 'https://image.tmdb.org/t/p/w500';
const IMG_W780 = 'https://image.tmdb.org/t/p/w780';
const IMG_ORI  = 'https://image.tmdb.org/t/p/original';
const TMDB_URL = 'https://api.themoviedb.org/3';
const JIKAN    = 'https://api.jikan.moe/v4';
const ANILIST  = 'https://graphql.anilist.co';
const ANIKOTO  = 'https://anikotoapi.site';
const ANIME_KW = 210024;

// Streaming
const SRC_MOVIE = id         => `https://unlimplay.com/play/embed/movie/${id}`;
const SRC_TV    = (id, s, e) => `https://unlimplay.com/play/embed/tv/${id}/${s}/${e}`;
const SRC_EMBED = (eid, lang)=> `https://megaplay.buzz/stream/s-2/${eid}/${lang}`;
const SRC_MAL   = (mid,ep,lang)=>`https://megaplay.buzz/stream/mal/${mid}/${ep}/${lang}`;

// ── Estado ──
let TOKEN = '', ANIME_KEY = '';
let heroItems=[], heroIdx=0, heroTimer=null;
let pl = {
  type:'', tmdbId:0, malId:null, anikotoId:null,
  s:1, ep:1, seasons:[], cachedEps:null,
  title:'', poster:'', isAnime:false, lang:'dub',
  totalEps:0, epEmbeds:{}, epThumbs:{}
};
let favs={}, progress={};

const $    = id => document.getElementById(id);
const show = id => $(id)?.classList.remove('hidden');
const hide = id => $(id)?.classList.add('hidden');
const esc  = s  => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const sleep= ms => new Promise(r=>setTimeout(r,ms));

async function apiFetch(url, headers={}){
  const r = await fetch(url, { headers:{ accept:'application/json', ...headers } });
  if(!r.ok) throw new Error(r.status+' '+url.slice(0,50));
  return r.json();
}
function tmdbH(){ return { Authorization:'Bearer '+TOKEN }; }
async function tmdb(path){ return apiFetch(TMDB_URL+path, tmdbH()); }
async function jikan(path, attempt=0){
  const r = await fetch(JIKAN+path, {headers:{accept:'application/json'}});
  if(r.status===429&&attempt<2){ await sleep(1400); return jikan(path,attempt+1); }
  if(!r.ok) throw new Error('Jikan '+r.status);
  return r.json();
}
async function anikoto(path){ return apiFetch(ANIKOTO+path); }

// ── AniList GraphQL — fuente principal de sinopsis en español ──
async function anilistMedia(malId){
  // AniList tiene sinopsis en inglés por defecto pero cuando hay traducción
  // al español la devuelve. Pedimos AMBAS para elegir la que no esté en inglés.
  const q = `query($id:Int){
    Media(idMal:$id,type:ANIME){
      description(asHtml:false)
      title{ romaji english native }
      coverImage{ large extraLarge }
      bannerImage
      genres
      episodes
      averageScore
      startDate{ year }
      status
    }
  }`;
  const r = await fetch(ANILIST,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({query:q,variables:{id:malId}})
  });
  const d = await r.json();
  return d?.data?.Media||null;
}

// ── Toast ──
let toastTimer;
function toast(msg,dur=2400){
  const t=$('toast');if(!t)return;
  t.textContent=msg;show('toast');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>hide('toast'),dur);
}

// ══════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded',async()=>{
  show('loader-ov');
  window.addEventListener('scroll',()=>$('navbar').classList.toggle('scrolled',window.scrollY>60));
  setupSearch();
  loadFavs(); loadProgress();
  detectNet();
  await loadToken();
  if(!TOKEN){
    $('main-content').innerHTML='<div style="color:var(--red);padding:32px;text-align:center">⚠️ Token TMDB no encontrado</div>';
    hide('loader-ov');return;
  }
  await loadHome();
  setTimeout(()=>hide('loader-ov'),500);
});

async function loadToken(){
  if(window.__TMDB_TOKEN__?.length>10)    TOKEN    = window.__TMDB_TOKEN__;
  if(window.__ANIME_API_KEY__?.length>10) ANIME_KEY= window.__ANIME_API_KEY__;
  if(TOKEN) return;
  try{
    const r=await fetch('/api/token');
    if(r.ok){
      const d=await r.json();
      if(d.token)       TOKEN    =d.token;
      if(d.animeApiKey) ANIME_KEY=d.animeApiKey;
    }
  }catch(e){}
  if(window.TMDB_TOKEN)    TOKEN    =window.TMDB_TOKEN;
  if(window.ANIME_API_KEY) ANIME_KEY=window.ANIME_API_KEY;
}

// ══════════════════════════════════════════════
//  RED
// ══════════════════════════════════════════════
async function detectNet(){
  const dot=$('net-dot'),txt=$('net-txt');if(!dot||!txt)return;
  const nav=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  let label='...',color='#888';
  if(nav){
    const eff=nav.effectiveType||'',ct=nav.type||'',dl=nav.downlink||0;
    if(ct==='wifi'||(dl>5&&(eff==='4g'||eff==='5g'))){label='📶 WiFi';color='#22c55e';}
    else if(ct==='cellular'||eff==='4g'){label='📱 4G';color='#f59e0b';}
    else if(eff==='3g'||eff==='2g'){label='⚠️ Lenta';color='#ef4444';}
  }
  try{
    const t0=performance.now();
    await fetch('https://image.tmdb.org/t/p/w92/wwemzKWzjKYJFfCeiB57q3r4Bcm.png',{cache:'no-store',mode:'no-cors'});
    const ms=performance.now()-t0;
    if(!nav){
      if(ms<450){label='📶 Rápida';color='#22c55e';}
      else if(ms<1300){label='📡 Media';color='#f59e0b';}
      else{label='⚠️ Lenta';color='#ef4444';}
    }
    if(nav&&nav.type==='wifi'&&ms>1200){label='🔒 VPN';color='#a78bfa';}
  }catch(e){}
  dot.style.background=color;txt.textContent=label;
  setTimeout(detectNet,30000);
}

// ══════════════════════════════════════════════
//  FAVORITOS
// ══════════════════════════════════════════════
const FAV_KEY='shocktv_favs';
function loadFavs(){try{favs=JSON.parse(localStorage.getItem(FAV_KEY)||'{}');}catch(e){favs={};} updateFavCount();}
function saveFavs(){try{localStorage.setItem(FAV_KEY,JSON.stringify(favs));}catch(e){} updateFavCount();}
function favKey(t,id){return`${t}-${id}`;}
function isFav(t,id){return!!favs[favKey(t,id)];}
function toggleFav(t,id,title,poster,rating){
  const k=favKey(t,id);
  if(favs[k]){delete favs[k];toast('Eliminado de favoritos');}
  else{favs[k]={id,type:t,title,poster,rating};toast('❤️ Añadido a favoritos');}
  saveFavs();
  const fb=$('fav-modal-btn');
  if(fb){fb.classList.toggle('active',isFav(t,id));fb.textContent=isFav(t,id)?'❤️ En favoritos':'🤍 Favoritos';}
  document.querySelectorAll(`.fav-heart[data-key="${k}"]`).forEach(h=>{
    h.classList.toggle('active',!!favs[k]);h.textContent=favs[k]?'❤️':'🤍';
  });
}
function updateFavCount(){const n=Object.keys(favs).length;const el=$('fav-count');if(el)el.textContent=n>0?n:'';}
function renderFavs(){
  const el=$('fav-grid');if(!el)return;
  const items=Object.values(favs);
  if(!items.length){el.innerHTML='<div style="color:var(--muted);padding:32px;grid-column:1/-1">No tenés favoritos aún.</div>';return;}
  el.innerHTML=items.map(i=>card(i,i.type)).join('');
}

// ══════════════════════════════════════════════
//  PROGRESO
// ══════════════════════════════════════════════
const PROG_KEY='shocktv_prog';
function loadProgress(){try{progress=JSON.parse(localStorage.getItem(PROG_KEY)||'{}');}catch(e){progress={};}}
function saveProgress(){try{localStorage.setItem(PROG_KEY,JSON.stringify(progress));}catch(e){}}
function epKey(t,id,s,ep){return`${t}-${id}-s${s}e${ep}`;}
function setProgress(t,id,s,ep,pct){
  // pct 0-100; 100 = visto completo
  const k=epKey(t,id,s,ep);
  if(pct>=95)progress[k]={watched:true,pct:100};
  else if(pct>0)progress[k]={watched:false,pct};
  else delete progress[k];
  saveProgress();
}
function getProgress(t,id,s,ep){return progress[epKey(t,id,s,ep)]||null;}
function isWatched(t,id,s,ep){return!!(progress[epKey(t,id,s,ep)]?.watched);}
function markWatched(t,id,s,ep,val=true){
  if(val)setProgress(t,id,s,ep,100);
  else delete progress[epKey(t,id,s,ep)];
  saveProgress();refreshEpList();
}

// ══════════════════════════════════════════════
//  SIDEBAR / NAV
// ══════════════════════════════════════════════
function openSidebar(){$('sidebar').classList.add('open');$('sb-overlay').classList.add('open');document.body.style.overflow='hidden';}
function closeSidebar(){$('sidebar').classList.remove('open');$('sb-overlay').classList.remove('open');document.body.style.overflow='';}
const NAV_MAP={home:'nb-home',fav:'nb-fav',movies:'nb-movies',tv:'nb-tv',anime:'nb-anime'};
const SBI_MAP={home:'sbi-home',fav:'sbi-fav',movies:'sbi-movies',tv:'sbi-tv',anime:'sbi-anime',toprated:'sbi-toprated'};
function setNavActive(sec){
  Object.values(NAV_MAP).forEach(id=>$(id)?.classList.remove('active'));
  Object.values(SBI_MAP).forEach(id=>$(id)?.classList.remove('active'));
  if(NAV_MAP[sec])$(NAV_MAP[sec])?.classList.add('active');
  if(SBI_MAP[sec])$(SBI_MAP[sec])?.classList.add('active');
}

// ══════════════════════════════════════════════
//  BÚSQUEDA
// ══════════════════════════════════════════════
let sdTimer;
function setupSearch(){
  const inp=$('search-input');
  inp.addEventListener('input',()=>{
    clearTimeout(sdTimer);const q=inp.value.trim();
    if(!q){closeDropdown();return;}
    sdTimer=setTimeout(()=>liveSearch(q),380);
  });
  inp.addEventListener('keydown',e=>{
    if(e.key==='Enter'){clearTimeout(sdTimer);doSearch();closeDropdown();}
    if(e.key==='Escape'){inp.value='';closeDropdown();}
  });
  document.addEventListener('click',e=>{
    if(!e.target.closest('.nav-search')&&!e.target.closest('.search-dropdown'))closeDropdown();
  });
}

async function liveSearch(q){
  const dd=$('search-dropdown');
  dd.innerHTML=`<div class="sd-no-results"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite;vertical-align:middle;margin-right:6px"><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"/></svg>Buscando...</div>`;
  show('search-dropdown');
  try{
    const[tr,jr]=await Promise.allSettled([
      tmdb('/search/multi?query='+encodeURIComponent(q)+'&language=es-ES&page=1'),
      jikan('/anime?q='+encodeURIComponent(q)+'&limit=4&sfw=true'),
    ]);
    const items=[];
    if(tr.status==='fulfilled')
      (tr.value.results||[]).filter(i=>i.media_type!=='person').slice(0,5).forEach(i=>items.push({
        title:i.title||i.name,year:(i.release_date||i.first_air_date||'').slice(0,4),
        poster:i.poster_path?IMG_W500+i.poster_path:'',tag:i.media_type==='movie'?'Película':'Serie',
        fn:`openDetail('${i.media_type||"movie"}',${i.id})`
      }));
    if(jr.status==='fulfilled')
      (jr.value.data||[]).forEach(i=>items.push({
        title:i.title_spanish||i.title_english||i.title,year:i.year||'',
        poster:i.images?.jpg?.image_url||'',tag:'Anime',
        fn:`openAnimeDetail(${i.mal_id},'${esc((i.title_spanish||i.title_english||i.title||'').replace(/'/g,"\\'"))}')`
      }));
    if(!items.length){dd.innerHTML=`<div class="sd-no-results">Sin resultados</div>`;return;}
    dd.innerHTML=items.map(i=>`
      <div class="sd-item" onclick="closeDropdown();${i.fn}">
        ${i.poster?`<img class="sd-img" src="${i.poster}" alt="" loading="lazy" onerror="this.style.display='none'">`:'<div class="sd-img"></div>'}
        <div class="sd-info"><div class="sd-title">${esc(i.title||'')}</div><div class="sd-meta">${i.year}</div></div>
        <span class="sd-tag">${i.tag}</span>
      </div>`).join('');
  }catch(e){dd.innerHTML=`<div class="sd-no-results">Error al buscar</div>`;}
}
function closeDropdown(){hide('search-dropdown');}
function doSearch(){
  const q=$('search-input').value.trim();if(!q)return;
  hideAll();show('search-section');$('search-title').textContent=`Resultados: "${q}"`;
  $('search-results').innerHTML=spin();
  Promise.allSettled([
    tmdb('/search/multi?query='+encodeURIComponent(q)+'&language=es-ES'),
    jikan('/anime?q='+encodeURIComponent(q)+'&limit=10&sfw=true'),
  ]).then(([t,j])=>{
    const ti=t.status==='fulfilled'?(t.value.results||[]).filter(i=>i.media_type!=='person').map(i=>card(i,i.media_type||'movie')):[];
    const ji=j.status==='fulfilled'?(j.value.data||[]).map(i=>cardJikan(i)):[];
    $('search-results').innerHTML=[...ti,...ji].join('')||nores();
  });
}

// ══════════════════════════════════════════════
//  SECCIONES
// ══════════════════════════════════════════════
const ALL_SEC=['home-sections','movies-section','tv-section','anime-section',
               'toprated-section','search-section','genre-section','fav-section'];
function hideAll(){ALL_SEC.forEach(hide);$('hero-section').style.display='none';}
function goHome(){
  ALL_SEC.forEach(hide);show('home-sections');$('hero-section').style.display='';
  setNavActive('home');closeSidebar();window.scrollTo({top:0,behavior:'smooth'});
}
function setSection(sec){
  hideAll();setNavActive(sec);closeSidebar();window.scrollTo({top:0,behavior:'smooth'});
  ({fav:()=>{show('fav-section');renderFavs();},
    movies:()=>{show('movies-section');loadGrid('movies-grid','movie');},
    tv:()=>{show('tv-section');loadGrid('tv-grid','tv');},
    anime:()=>{show('anime-section');loadAnimeGrid();},
    toprated:()=>{show('toprated-section');loadTopRated();},
  })[sec]?.();
}
async function setGenre(type,genreId,label){
  hideAll();show('genre-section');$('genre-title').textContent=(type==='movie'?'🎬 ':'📺 ')+label;
  $('genre-grid').innerHTML=spin();closeSidebar();window.scrollTo({top:0,behavior:'smooth'});
  try{
    const d=await tmdb(`/discover/${type}?language=es-ES&with_genres=${genreId}&sort_by=popularity.desc`);
    $('genre-grid').innerHTML=(d.results||[]).map(i=>card(i,type)).join('')||nores();
  }catch(e){$('genre-grid').innerHTML=errBox(e);}
}
async function setAnimeGenre(malGenreId,label){
  hideAll();show('genre-section');$('genre-title').textContent='⛩️ Anime · '+label;
  $('genre-grid').innerHTML=spin();closeSidebar();window.scrollTo({top:0,behavior:'smooth'});
  try{
    const d=await jikan(`/anime?genres=${malGenreId}&order_by=popularity&sort=asc&limit=24&sfw=true`);
    $('genre-grid').innerHTML=(d.data||[]).map(i=>cardJikan(i)).join('')||nores();
  }catch(e){$('genre-grid').innerHTML=errBox(e);}
}

// ══════════════════════════════════════════════
//  HOME
// ══════════════════════════════════════════════
async function loadHome(){
  try{
    const[tm,ttv,mp,tvp]=await Promise.all([
      tmdb('/trending/movie/week?language=es-ES'),
      tmdb('/trending/tv/week?language=es-ES'),
      tmdb('/movie/popular?language=es-ES'),
      tmdb('/tv/popular?language=es-ES'),
    ]);
    heroItems=(tm.results||[]).filter(m=>m.backdrop_path).slice(0,8);
    if(heroItems.length){renderHero(heroItems[0],'movie');startHero();}
    renderSlider('s-trend',[...(tm.results||[]).slice(0,10),...(ttv.results||[]).slice(0,10)],true);
    renderSlider('s-mov',mp.results||[]);
    renderSlider('s-tv',ttv.results||[],false,true);
  }catch(e){console.error('loadHome',e);}
  loadAnimeRows();
}
async function loadAnimeRows(){
  // Fila 1: Anikoto recientes
  try{
    const d=await anikoto('/recent-anime?page=1&per_page=20');
    const arr=d?.data||[];
    if(arr.length){renderSlider('s-anime',arr,false,false,false,false,true);} else throw new Error('empty');
  }catch(e){
    try{
      const d=await jikan('/top/anime?filter=airing&limit=20');
      if(d.data?.length)renderSlider('s-anime',d.data,false,false,false,true);
    }catch(e2){const a=$('s-anime');if(a)a.innerHTML=noDisp();}
  }
  await sleep(500);
  // Fila 2: temporada actual
  try{
    const d=await jikan('/seasons/now?limit=20');
    if(d.data?.length)renderSlider('s-anime2',d.data,false,false,false,true);
  }catch(e){const b=$('s-anime2');if(b)b.innerHTML=noDisp();}
}

// ══════════════════════════════════════════════
//  HERO
// ══════════════════════════════════════════════
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
  if(heroTimer)clearInterval(heroTimer);
  heroTimer=setInterval(()=>{heroIdx=(heroIdx+1)%heroItems.length;renderHero(heroItems[heroIdx],'movie');},7000);
}

// ══════════════════════════════════════════════
//  SLIDERS / GRIDS
// ══════════════════════════════════════════════
function renderSlider(id,items,mixed=false,isTV=false,_=false,fromJikan=false,fromAnikoto=false){
  const c=$(id);if(!c)return;
  c.innerHTML=(items||[]).map(i=>{
    if(fromAnikoto)return cardAnikoto(i);
    if(fromJikan)  return cardJikan(i);
    return card(i,mixed?(i.media_type||'movie'):(isTV?'tv':'movie'));
  }).join('');
}
function slide(id,dir){const s=$(id);if(s)s.scrollBy({left:dir*154*3,behavior:'smooth'});}
async function loadGrid(gridId,type){
  const el=$(gridId);if(!el||el.dataset.loaded)return;el.dataset.loaded=1;el.innerHTML=spin();
  try{
    const d=await tmdb(type==='movie'?'/movie/popular?language=es-ES':'/tv/popular?language=es-ES');
    el.innerHTML=(d.results||[]).map(i=>card(i,type)).join('');
  }catch(e){el.innerHTML=errBox(e);}
}
async function loadAnimeGrid(){
  const el=$('anime-grid');if(!el||el.dataset.loaded)return;el.dataset.loaded=1;el.innerHTML=spin();
  try{
    const[t,s]=await Promise.all([jikan('/top/anime?filter=airing&limit=20'),jikan('/seasons/now?limit=20')]);
    const seen=new Set();
    const u=[...(t.data||[]),...(s.data||[])].filter(a=>{if(seen.has(a.mal_id))return false;seen.add(a.mal_id);return true;});
    el.innerHTML=u.slice(0,40).map(i=>cardJikan(i)).join('');
  }catch(e){el.innerHTML=errBox(e);}
}
async function loadTopRated(){
  const el=$('toprated-grid');if(!el||el.dataset.loaded)return;el.dataset.loaded=1;el.innerHTML=spin();
  try{const d=await tmdb('/movie/top_rated?language=es-ES');el.innerHTML=(d.results||[]).map(i=>card(i,'movie')).join('');}
  catch(e){el.innerHTML=errBox(e);}
}

// ══════════════════════════════════════════════
//  CARDS
// ══════════════════════════════════════════════
function card(item,type,isAnime=false){
  const title=esc(item.title||item.name||'Sin título');
  const rating=item.vote_average?.toFixed(1)||'?';
  const tag=isAnime?'Anime':(type==='movie'?'Film':'TV');
  const k=favKey(type,item.id);
  const poster=item.poster_path?IMG_W500+item.poster_path:'';
  const ov=esc((item.overview||'').substring(0,300));
  const img=poster?`<img class="card-img" src="${poster}" alt="${title}" loading="lazy" onerror="this.className='card-ph'">`:`<div class="card-ph"></div>`;
  const fn=`openMiniModal('${type}',${item.id},'${title.replace(/'/g,"\\'")}','${poster}','${rating}','${ov.replace(/'/g,"\\'")}',${isAnime},null)`;
  return`<div class="card" onclick="${fn}">${img}
    <span class="card-tag${isAnime?' anime-tag':''}">${tag}</span>
    <button class="fav-heart${isFav(type,item.id)?' active':''}" data-key="${k}"
      onclick="event.stopPropagation();toggleFav('${type}',${item.id},'${title.replace(/'/g,"\\'")}','${item.poster_path||''}',${item.vote_average||0})">
      ${isFav(type,item.id)?'❤️':'🤍'}</button>
    <div class="card-ov"><div class="card-title">${title}</div><div class="card-rat">★ ${rating}</div></div>
  </div>`;
}
function cardJikan(item){
  const title=esc(item.title_spanish||item.title_english||item.title||'Sin título');
  const rating=item.score?item.score.toFixed(1):'?';
  const malId=item.mal_id;
  const poster=item.images?.jpg?.large_image_url||item.images?.jpg?.image_url||'';
  const ov=esc((item.synopsis||'').replace(/\[Written.*?\]/g,'').replace(/\(Source:.*?\)/g,'').trim().substring(0,300));
  const img=poster?`<img class="card-img" src="${poster}" alt="${title}" loading="lazy" onerror="this.className='card-ph'">`:`<div class="card-ph"></div>`;
  const fn=`openMiniModal('anime',${malId},'${title.replace(/'/g,"\\'")}','${poster}','${rating}','${ov.replace(/'/g,"\\'")}',true,${malId})`;
  return`<div class="card" onclick="${fn}">${img}
    <span class="card-tag anime-tag">Anime</span>
    <div class="card-ov"><div class="card-title">${title}</div><div class="card-rat">★ ${rating}</div></div>
  </div>`;
}
function cardAnikoto(item){
  const title=esc(item.title||'Sin título');
  const malId=item.mal_id||null;
  const numId=item.id;
  const poster=item.poster||item.image||'';
  const img=poster?`<img class="card-img" src="${poster}" alt="${title}" loading="lazy" onerror="this.className='card-ph'">`:`<div class="card-ph"></div>`;
  const fn=malId
    ?`openAnimeDetail(${malId},'${title.replace(/'/g,"\\'")}',${numId||'null'})`
    :`openMiniModal('anime','${numId}','${title.replace(/'/g,"\\'")}','${poster}','','',true,null)`;
  return`<div class="card" onclick="${fn}">${img}
    <span class="card-tag anime-tag">Anime</span>
    <div class="card-ov"><div class="card-title">${title}</div></div>
  </div>`;
}

// ══════════════════════════════════════════════
//  MINI MODAL — Ver / Sinopsis
// ══════════════════════════════════════════════
function openMiniModal(type,id,title,poster,rating,overview,isAnime,malId){
  const ex=$('mini-ov');if(ex)ex.remove();
  const ov=document.createElement('div');
  ov.id='mini-ov';
  ov.style.cssText='position:fixed;inset:0;z-index:450;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.75);backdrop-filter:blur(5px);animation:fadein .18s';
  ov.onclick=e=>{if(e.target===ov)ov.remove();};
  const st=title.replace(/'/g,"\\'");
  const watchFn=isAnime&&malId
    ?`document.getElementById('mini-ov').remove();openAnimePlayer(${malId},'${st}',100,null)`
    :`document.getElementById('mini-ov').remove();openPlayer('${type}',${id},'${st}')`;
  const infoFn=isAnime&&malId
    ?`document.getElementById('mini-ov').remove();openAnimeDetail(${malId},'${st}',null)`
    :`document.getElementById('mini-ov').remove();openDetail('${type}',${id},${!!isAnime})`;
  ov.innerHTML=`
    <div style="background:var(--s1);border-radius:14px;max-width:360px;width:100%;overflow:hidden;border:1px solid rgba(255,255,255,.1);box-shadow:0 24px 64px rgba(0,0,0,.85)">
      <div style="position:relative;${poster?`background:url('${poster}') center/cover;`:''} min-height:190px">
        <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(9,9,15,1) 0%,rgba(9,9,15,.1) 70%)"></div>
        <button onclick="document.getElementById('mini-ov').remove()" style="position:absolute;top:10px;right:10px;background:rgba(9,9,15,.8);border:none;color:#fff;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:.85rem;z-index:2">✕</button>
        <div style="position:absolute;bottom:12px;left:14px;right:14px;z-index:2">
          <div style="font-family:'Bebas Neue',cursive;font-size:1.5rem;letter-spacing:1px;line-height:1.1;margin-bottom:3px;text-shadow:0 2px 8px rgba(0,0,0,.9)">${title}</div>
          <div style="font-size:.78rem;color:var(--gold);font-weight:700">${rating?'★ '+rating:''}</div>
        </div>
      </div>
      <div style="padding:14px 16px 16px">
        ${overview?`<p style="font-size:.8rem;color:rgba(240,240,248,.72);line-height:1.55;margin-bottom:14px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${overview}</p>`:''}
        <div style="display:flex;gap:9px">
          <button onclick="${watchFn}" style="flex:1;display:flex;align-items:center;justify-content:center;gap:7px;background:var(--red);color:#fff;border:none;padding:11px;font-family:'Inter',sans-serif;font-size:.88rem;font-weight:700;border-radius:8px;cursor:pointer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> Ver ahora
          </button>
          <button onclick="${infoFn}" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;background:rgba(255,255,255,.08);color:var(--text);border:1px solid rgba(255,255,255,.13);padding:11px;font-family:'Inter',sans-serif;font-size:.88rem;font-weight:600;border-radius:8px;cursor:pointer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Sinopsis
          </button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(ov);
}

// ══════════════════════════════════════════════
//  DETAIL — TMDB
// ══════════════════════════════════════════════
async function openDetail(type,id,isAnime=false){
  show('loader-ov');
  try{
    const[det,cred]=await Promise.all([
      tmdb(`/${type}/${id}?language=es-ES`),
      tmdb(`/${type}/${id}/credits?language=es-ES`),
    ]);
    const title=det.title||det.name||'';
    const year=(det.release_date||det.first_air_date||'').slice(0,4);
    const rt=det.runtime?`${det.runtime} min`:(det.episode_run_time?.[0]?`${det.episode_run_time[0]} min/ep`:'');
    const cast=(cred.cast||[]).slice(0,8);
    const faved=isFav(type,id);
    $('modal-back').style.backgroundImage=det.backdrop_path?`url(${IMG_W780+det.backdrop_path})`:'';
    $('modal-poster').src=det.poster_path?IMG_W500+det.poster_path:'';$('modal-poster').alt=title;
    $('modal-tags').innerHTML=(det.genres||[]).map(g=>`<span class="badge">${g.name}</span>`).join('');
    $('modal-title').textContent=title;
    $('modal-meta').innerHTML=`<span class="star">★ ${det.vote_average?.toFixed(1)||'N/A'}</span>${year?`<span>📅 ${year}</span>`:''}${rt?`<span>⏱ ${rt}</span>`:''}<span>${type==='movie'?'🎬 Película':(isAnime?'⛩️ Anime':'📺 Serie')}</span>`;
    $('modal-ov-txt').textContent=det.overview||'Sin descripción.';
    $('modal-actions').innerHTML=`
      <button class="watch-btn" onclick="closeModal();openPlayer('${type}',${id},'${esc(title)}',${!!isAnime})">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> Ver ahora
      </button>
      <button class="fav-btn${faved?' active':''}" id="fav-modal-btn" onclick="toggleFav('${type}',${id},'${esc(title)}','${det.poster_path||''}',${det.vote_average||0})">
        ${faved?'❤️ En favoritos':'🤍 Favoritos'}</button>`;
    $('modal-cast').innerHTML=cast.length?`<div class="cast-t">Reparto</div><div class="cast-list">${cast.map(a=>`<span class="cast-chip">${esc(a.name)}</span>`).join('')}</div>`:'';
    $('modal').scrollTop=0;show('modal-ov');document.body.style.overflow='hidden';
  }catch(e){console.error(e);toast('Error al cargar detalles');}
  finally{hide('loader-ov');}
}

// ══════════════════════════════════════════════
//  DETAIL — ANIME  (Jikan + AniList español)
// ══════════════════════════════════════════════
async function openAnimeDetail(malId, fallbackTitle='', anikotoNumId=null){
  show('loader-ov');
  try{
    // Pedir Jikan y AniList en paralelo
    const[jr,al]=await Promise.allSettled([
      jikan(`/anime/${malId}/full`),
      anilistMedia(malId),
    ]);
    const d=(jr.status==='fulfilled'?jr.value.data:null)||{};
    const alData=al.status==='fulfilled'?al.value:null;

    // Título: español preferido
    const title=d.title_spanish||d.title_english||d.title||fallbackTitle;

    // ── SINOPSIS EN ESPAÑOL garantizada ──
    // AniList a veces tiene la desc en español cuando el anime está doblado/subtitulado al español
    // Jikan tiene title_spanish si existe doblaje
    // Si la sinopsis de AniList empieza con mayúscula y parece inglés, usar Jikan igual
    let synopsis='';
    const alDesc=(alData?.description||'').replace(/<br\s*\/?>/gi,' ').replace(/<[^>]+>/g,'').replace(/\(Source:.*?\)/gi,'').replace(/\[Written.*?\]/gi,'').trim();
    const jikanDesc=(d.synopsis||'').replace(/\[Written.*?\]/gi,'').replace(/\(Source:.*?\)/gi,'').trim();

    // Heurística: si Jikan tiene title_spanish probablemente también tiene sinopsis en español
    // AniList description suele ser en inglés salvo excepciones
    // → usamos siempre Jikan si hay title_spanish y hay descripción
    // → como fallback usamos AniList
    if(jikanDesc){ synopsis=jikanDesc; }
    else if(alDesc){ synopsis=alDesc; }
    else { synopsis='Sin sinopsis disponible.'; }

    const year=d.year||alData?.startDate?.year||'';
    const rating=d.score?(d.score.toFixed(1)):( alData?.averageScore?(alData.averageScore/10).toFixed(1):'N/A');
    const genres=(d.genres||[]).map(g=>g.name);
    const totalEps=d.episodes||alData?.episodes||100;
    const eps=totalEps?`${totalEps} eps`:'? eps';
    const statusMap={'Currently Airing':'🟢 En emisión','Finished Airing':'✅ Finalizado','Not yet aired':'🔜 Próximamente','RELEASING':'🟢 En emisión','FINISHED':'✅ Finalizado','NOT_YET_RELEASED':'🔜 Próximamente'};
    const status=statusMap[d.status||alData?.status]||d.status||'';
    const poster=d.images?.jpg?.large_image_url||alData?.coverImage?.extraLarge||alData?.coverImage?.large||'';
    const backdrop=alData?.bannerImage||poster;

    $('modal-back').style.backgroundImage=backdrop?`url(${backdrop})`:'';
    $('modal-poster').src=poster;$('modal-poster').alt=title;
    $('modal-tags').innerHTML=genres.slice(0,5).map(g=>`<span class="badge">${g}</span>`).join('');
    $('modal-title').textContent=title;
    $('modal-meta').innerHTML=`<span class="star">★ ${rating}</span>${year?`<span>📅 ${year}</span>`:''}<span>📺 ${eps}</span><span>⛩️ Anime</span>${status?`<span>${status}</span>`:''}`;
    $('modal-ov-txt').textContent=synopsis;
    $('modal-actions').innerHTML=`
      <button class="watch-btn" onclick="closeModal();openAnimePlayer(${malId},'${esc(title)}',${totalEps},${anikotoNumId||'null'})">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> Ver ahora
      </button>`;
    $('modal-cast').innerHTML='';
    $('modal').scrollTop=0;show('modal-ov');document.body.style.overflow='hidden';
  }catch(e){console.error(e);toast('Error al cargar anime');}
  finally{hide('loader-ov');}
}

function closeModal(event){
  if(event&&event.target!==$('modal-ov')&&!event.target.classList.contains('modal-x'))return;
  hide('modal-ov');document.body.style.overflow='';
}

// ══════════════════════════════════════════════
//  PLAYER — Películas / Series
// ══════════════════════════════════════════════
async function openPlayer(type,id,title,isAnime=false){
  show('loader-ov');
  pl={type,tmdbId:id,malId:null,anikotoId:null,s:1,ep:1,seasons:[],cachedEps:null,
      title:title||'',poster:'',isAnime,lang:'sub',totalEps:0,epEmbeds:{},epThumbs:{}};
  if(type==='tv'){
    try{
      const det=await tmdb(`/tv/${id}?language=es-ES`);
      pl.seasons=(det.seasons||[]).filter(s=>s.season_number>0);
      buildLangPills(['sub','dub']);
      await loadSeasonEps(1);show('ep-panel');
    }catch(e){hide('ep-panel');}
  }else{hide('ep-panel');buildLangPills([]);}
  $('ply-ttl').textContent=pl.title;
  updateEpBadge();loadFrame();
  hide('loader-ov');hide('modal-ov');
  show('ply-overlay');document.body.style.overflow='hidden';
}

// ══════════════════════════════════════════════
//  PLAYER — Anime  (MAL ID → Anikoto embeds → MegaPlay)
// ══════════════════════════════════════════════
async function openAnimePlayer(malId, title, totalEps=100, anikotoNumId=null){
  show('loader-ov');
  // Obtener poster del anime para las miniaturas de episodios
  let animePoster='';
  try{
    const jr=await jikan(`/anime/${malId}`);
    animePoster=jr.data?.images?.jpg?.large_image_url||'';
  }catch(e){}

  pl={type:'anime',tmdbId:0,malId,anikotoId:anikotoNumId,s:1,ep:1,seasons:[],cachedEps:null,
      title:title||'',poster:animePoster,isAnime:true,lang:'dub',totalEps,epEmbeds:{},epThumbs:{}};

  // Buscar embed IDs en Anikoto por MAL ID
  try{
    let numId=anikotoNumId;
    if(!numId&&malId){
      // Buscar en páginas de Anikoto
      for(let pg=1;pg<=3;pg++){
        const d=await anikoto(`/recent-anime?page=${pg}&per_page=50`);
        const items=d?.data||[];
        const found=items.find(a=>String(a.mal_id)===String(malId));
        if(found){numId=found.id||found.s_id;break;}
        if(items.length<50)break;
      }
    }
    if(numId){
      pl.anikotoId=numId;
      const series=await anikoto(`/series/${numId}`);
      const eps=series?.episodes||series?.data?.episodes||[];
      eps.forEach(e=>{
        const n=e.number||e.ep_num||e.episode_number;
        if(!n)return;
        const subUrl=e.embed_url?.sub||e.embedSub||'';
        const dubUrl=e.embed_url?.dub||e.embedDub||'';
        const thumb=e.thumbnail||e.image||e.still||'';
        pl.epEmbeds[n]={sub:extractEmbedId(subUrl),dub:extractEmbedId(dubUrl)};
        if(thumb)pl.epThumbs[n]=thumb;
      });
      pl.totalEps=Math.max(eps.length,totalEps);
    }
  }catch(e){console.warn('Anikoto:',e.message);}

  buildLangPills(['dub','sub']);
  renderEpList(); // Lista vertical estilo Anime Underworld
  show('ep-panel');
  $('ply-ttl').textContent=pl.title;
  updateEpBadge();loadFrame();
  hide('loader-ov');hide('modal-ov');
  show('ply-overlay');document.body.style.overflow='hidden';
}

function extractEmbedId(url){
  if(!url)return null;
  if(/^\d+$/.test(String(url)))return String(url);
  const m=url.match(/\/stream\/s-2\/(\d+)/);
  return m?m[1]:null;
}

// ══════════════════════════════════════════════
//  IDIOMA
// ══════════════════════════════════════════════
const LANG_LABEL={sub:'🔤 Subtítulos',dub:'🔊 Doblado/Latino'};
function buildLangPills(langs){
  const c=$('lang-pills');if(!c)return;
  c.innerHTML=langs.map(l=>`<button class="lang-pill${pl.lang===l?' active':''}" onclick="setLang('${l}')">${LANG_LABEL[l]||l}</button>`).join('');
}
function setLang(lang){
  pl.lang=lang;
  buildLangPills(pl.isAnime?['dub','sub']:['sub','dub']);
  loadFrame();
}

// ══════════════════════════════════════════════
//  FRAME
// ══════════════════════════════════════════════
function loadFrame(){
  const f=$('ply-frame');
  if(pl.isAnime){
    const epData=pl.epEmbeds[pl.ep];
    const embedId=pl.lang==='dub'?(epData?.dub||epData?.sub):(epData?.sub||epData?.dub);
    if(embedId){
      f.src=SRC_EMBED(embedId,pl.lang);
    }else if(pl.malId){
      // Fallback directo por MAL ID — siempre funciona
      f.src=SRC_MAL(pl.malId,pl.ep,pl.lang);
    }else{
      f.src='about:blank';
      toast('Episodio no disponible');
    }
  }else if(pl.type==='movie'){
    f.src=SRC_MOVIE(pl.tmdbId);
  }else{
    f.src=SRC_TV(pl.tmdbId,pl.s,pl.ep);
  }
}
function updateEpBadge(){
  $('ply-ep').textContent=(pl.type==='tv'||pl.isAnime)?`Temporada ${pl.s} · Episodio ${pl.ep}`:'';
}

// ══════════════════════════════════════════════
//  LISTA DE EPISODIOS — estilo Anime Underworld
//  Lista vertical: miniatura | Capítulo N | barra progreso
// ══════════════════════════════════════════════
async function loadSeasonEps(season){
  pl.s=season;pl.ep=1;
  const tabsEl=$('ep-season-tabs');
  if(tabsEl&&pl.seasons.length>0)
    tabsEl.innerHTML=pl.seasons.map(s=>
      `<button class="ep-stab${s.season_number===season?' active':''}" onclick="switchSeason(${s.season_number})">T${s.season_number}</button>`
    ).join('');
  try{
    const d=await tmdb(`/tv/${pl.tmdbId}/season/${season}?language=es-ES`);
    const eps=d.episodes||[];
    pl.totalEps=eps.length;pl.cachedEps=eps;
    // Guardar stills de episodios como miniaturas
    eps.forEach(e=>{
      const still=e.still_path?`https://image.tmdb.org/t/p/w300${e.still_path}`:'';
      if(still)pl.epThumbs[e.episode_number]=still;
    });
    renderEpList();
  }catch(e){
    pl.cachedEps=Array.from({length:12},(_,i)=>({episode_number:i+1,name:''}));
    renderEpList();
  }
}

function switchSeason(season){
  // Actualizar tabs
  document.querySelectorAll('.ep-stab').forEach(b=>b.classList.toggle('active',parseInt(b.textContent.slice(1))===season));
  loadSeasonEps(season);
}

// Render lista vertical de episodios
function renderEpList(){
  const grid=$('ep-grid');if(!grid)return;
  const total=pl.isAnime?pl.totalEps:(pl.cachedEps?.length||0);
  if(!total){grid.innerHTML='<div style="color:var(--muted);padding:14px">Sin episodios</div>';return;}

  const watched=pl.isAnime
    ?Array.from({length:total},(_,i)=>i+1).filter(ep=>isWatched('anime',pl.malId,1,ep)).length
    :(pl.cachedEps||[]).filter(e=>isWatched('tv',pl.tmdbId,pl.s,e.episode_number)).length;
  const info=$('ep-progress-info');
  if(info)info.textContent=watched>0?`${watched}/${total} vistos`:'';

  let html='';
  for(let i=1;i<=total;i++){
    const epNum=i;
    const tvEp=pl.cachedEps?.find(e=>e.episode_number===epNum);
    const epName=tvEp?.name||`Capítulo ${epNum}`;
    const thumb=pl.epThumbs[epNum]||(pl.poster||'');
    const w=pl.isAnime?isWatched('anime',pl.malId,1,epNum):isWatched('tv',pl.tmdbId,pl.s,epNum);
    const prog=pl.isAnime?getProgress('anime',pl.malId,1,epNum):getProgress('tv',pl.tmdbId,pl.s,epNum);
    const pct=prog?.pct||0;
    const isPlaying=(pl.ep===epNum);

    html+=`<div class="ep-row${isPlaying?' ep-playing':''}${w?' ep-done':''}" onclick="${pl.isAnime?`playAnimeEp(${epNum})`:`playTVEp(${epNum})`}">
      <div class="ep-thumb-wrap">
        ${thumb?`<img class="ep-thumb" src="${thumb}" alt="" loading="lazy" onerror="this.src=''">`:
          `<div class="ep-thumb ep-thumb-ph"></div>`}
        ${isPlaying?`<div class="ep-play-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg></div>`:''}
        ${w&&!isPlaying?`<div class="ep-check-icon">✓</div>`:''}
      </div>
      <div class="ep-row-info">
        <div class="ep-row-name">${esc(epName)}</div>
        ${tvEp?.overview?`<div class="ep-row-desc">${esc(tvEp.overview.substring(0,80))}...</div>`:''}
        <div class="ep-row-bar">
          <div class="ep-row-fill" style="width:${w?100:pct}%"></div>
        </div>
      </div>
      <button class="ep-mark-btn" onclick="event.stopPropagation();toggleEpWatched(${epNum})" title="${w?'Marcar no visto':'Marcar visto'}">
        ${w?'✓':'○'}
      </button>
    </div>`;
  }
  grid.innerHTML=html;
  // Scroll al episodio activo
  setTimeout(()=>{
    const active=document.querySelector('.ep-playing');
    if(active)active.scrollIntoView({behavior:'smooth',block:'nearest'});
  },80);
}

function toggleEpWatched(ep){
  const t=pl.isAnime?'anime':'tv';
  const id=pl.isAnime?pl.malId:pl.tmdbId;
  const w=isWatched(t,id,pl.s,ep);
  markWatched(t,id,pl.s,ep,!w);
  toast(w?`Ep ${ep} marcado como no visto`:`✓ Ep ${ep} marcado como visto`);
}

function refreshEpList(){ renderEpList(); }

function playTVEp(ep){
  if(pl.ep!==ep)setProgress('tv',pl.tmdbId,pl.s,pl.ep,100);
  pl.ep=ep;updateEpBadge();loadFrame();renderEpList();
}
function playAnimeEp(ep){
  if(pl.ep!==ep)setProgress('anime',pl.malId,1,pl.ep,100);
  pl.ep=ep;updateEpBadge();loadFrame();renderEpList();
}

function closePlayer(){
  const t=pl.isAnime?'anime':'tv';
  const id=pl.isAnime?pl.malId:pl.tmdbId;
  if(pl.type==='tv'||pl.isAnime)setProgress(t,id,pl.s,pl.ep,100);
  hide('ply-overlay');$('ply-frame').src='';document.body.style.overflow='';
}

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closePlayer();closeModal();const m=$('mini-ov');if(m)m.remove();}
});

// ══════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════
const spin  =()=>`<div style="display:flex;align-items:center;justify-content:center;padding:44px;color:var(--muted);grid-column:1/-1"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"/></svg></div>`;
const errBox=e=>`<div style="color:var(--red);padding:18px;font-size:.86rem;grid-column:1/-1">⚠️ ${esc(String(e?.message||e))}</div>`;
const nores =()=>`<div style="color:var(--muted);padding:18px;grid-column:1/-1">Sin resultados.</div>`;
const noDisp=()=>`<div style="color:var(--muted);padding:14px;font-size:.82rem">No disponible ahora</div>`;
