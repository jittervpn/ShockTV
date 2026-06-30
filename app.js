// ═══════════════════════════════════════════════
//  ShockTV — app.js FINAL v6
//  Datos: TMDB (español) | Streaming: Unlimplay + Anify
// ═══════════════════════════════════════════════
const IMG5 = 'https://image.tmdb.org/t/p/w500';
const IMG7 = 'https://image.tmdb.org/t/p/w780';
const IMGO = 'https://image.tmdb.org/t/p/original';
const TMDB = 'https://api.themoviedb.org/3';

// ── STREAMING ──
// Películas: Unlimplay por TMDB ID
const SRC_MOV  = id       => `https://unlimplay.com/play/embed/movie/${id}`;
// Series normales: Unlimplay por TMDB ID
const SRC_TV   = (id,s,e) => `https://unlimplay.com/play/embed/tv/${id}/${s}/${e}`;
// Anime: Unlimplay intenta primero, luego fallbacks
const SRC_ANIME_UNLIM = (id,s,e) => `https://unlimplay.com/play/embed/tv/${id}/${s}/${e}`;
const SRC_ANIME_FB    = [
  (id,ep) => `https://vidsrc.me/embed/tv/${id}/1/${ep}`,
  (id,ep) => `https://vidsrc.to/embed/tv/${id}/1/${ep}`,
  (id,ep) => `https://www.2embed.stream/embed/tv/${id}/1/${ep}`,
];

// Cache
const C = new Map();
async function cached(k, fn, ttl=300000){
  const h=C.get(k);
  if(h&&Date.now()-h.t<ttl)return h.v;
  const v=await fn();C.set(k,{v,t:Date.now()});return v;
}

let TOKEN='';
function tmdbH(){ return { accept:'application/json', Authorization:'Bearer '+TOKEN }; }
async function tmdb(p){ return cached('t:'+p, async()=>{
  const r=await fetch(TMDB+p,{headers:tmdbH()});
  const d=await r.json();
  if(!r.ok||d.success===false) throw new Error(d.status_message||'TMDB '+r.status);
  return d;
});}

// Anify via proxy Railway
async function anifyEpisodes(anifyId){
  return cached('ae:'+anifyId, async()=>{
    const r=await fetch(`/api/anify/episodes/${anifyId}`);
    if(!r.ok) throw new Error('Anify episodes '+r.status);
    return r.json();
  });
}

function toast(m,d=2400){const t=$('toast');if(!t)return;t.textContent=m;show('toast');clearTimeout(toastT);toastT=setTimeout(()=>hide('toast'),d);}

// ═══════════════════════════════
//  INIT
// ═══════════════════════════════
document.addEventListener('DOMContentLoaded',async()=>{
  show('loader-ov');
  window.addEventListener('scroll',()=>$('navbar').classList.toggle('scrolled',window.scrollY>55));
  setupSearch();
  loadStore();
  detectNet();
  await loadToken();
  if(!TOKEN){
    $('main-content').innerHTML='<div style="color:var(--red);padding:32px;text-align:center">⚠️ Falta el token TMDB en config.js</div>';
    hide('loader-ov');return;
  }
  await loadHome();
  setTimeout(()=>hide('loader-ov'),400);
});

async function loadToken(){
  if(window.__TMDB_TOKEN__?.length>10){TOKEN=window.__TMDB_TOKEN__;return;}
  try{const r=await fetch('/api/token');if(r.ok){const d=await r.json();if(d.token){TOKEN=d.token;return;}}}catch(e){}
  if(window.TMDB_TOKEN)TOKEN=window.TMDB_TOKEN;
}

// ═══════════════════════════════
//  RED
// ═══════════════════════════════
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

// ═══════════════════════════════
//  STORE
// ═══════════════════════════════
function loadStore(){
  try{favs=JSON.parse(localStorage.getItem('stv_favs')||'{}');}catch(e){favs={};}
  try{prog=JSON.parse(localStorage.getItem('stv_prog')||'{}');}catch(e){prog={};}
  updFavBadge();
}
function saveStore(){
  try{localStorage.setItem('stv_favs',JSON.stringify(favs));localStorage.setItem('stv_prog',JSON.stringify(prog));}catch(e){}
  updFavBadge();
}
function updFavBadge(){const n=Object.keys(favs).length;const el=$('fav-count');if(el)el.textContent=n>0?n:'';}
const fk=(t,id)=>`${t}-${id}`;
const isFav=(t,id)=>!!favs[fk(t,id)];
function toggleFav(t,id,title,poster,rating){
  const k=fk(t,id);
  if(favs[k]){delete favs[k];toast('Eliminado de favoritos');}
  else{favs[k]={id,type:t,title,poster,rating};toast('❤️ Añadido a favoritos');}
  saveStore();
  const fb=$('fav-btn-mod');
  if(fb){fb.classList.toggle('on',isFav(t,id));fb.textContent=isFav(t,id)?'❤️ En favoritos':'🤍 Favoritos';}
  document.querySelectorAll(`.fav-heart[data-k="${k}"]`).forEach(h=>{h.classList.toggle('on',!!favs[k]);h.textContent=favs[k]?'❤️':'🤍';});
}
function renderFavs(){
  const el=$('fav-grid');if(!el)return;
  const items=Object.values(favs);
  if(!items.length){el.innerHTML='<p style="color:var(--muted);padding:24px;grid-column:1/-1">No tenés favoritos aún. Tocá 🤍 en cualquier póster.</p>';return;}
  el.innerHTML=items.map(i=>mkCard(i,i.type)).join('');
}
const epk=(t,id,s,ep)=>`${t}-${id}-s${s}e${ep}`;
function setEpProg(t,id,s,ep,pct){
  const k=epk(t,id,s,ep);
  if(pct>=95)prog[k]={w:true,p:100};else if(pct>0)prog[k]={w:false,p:pct};else delete prog[k];
  saveStore();
}
function getEpProg(t,id,s,ep){return prog[epk(t,id,s,ep)]||null;}
function isWatched(t,id,s,ep){return!!(prog[epk(t,id,s,ep)]?.w);}
function markWatched(t,id,s,ep,v=true){
  if(v)setEpProg(t,id,s,ep,100);else delete prog[epk(t,id,s,ep)];
  saveStore();renderEpList();
}

// ═══════════════════════════════
//  SIDEBAR / NAV
// ═══════════════════════════════
function openSB(){$('sidebar').classList.add('open');$('sb-ov').classList.add('open');document.body.style.overflow='hidden';}
function closeSB(){$('sidebar').classList.remove('open');$('sb-ov').classList.remove('open');document.body.style.overflow='';}
const NM={home:'nb-home',fav:'nb-fav',movies:'nb-movies',tv:'nb-tv',anime:'nb-anime'};
const SM={home:'sbi-home',fav:'sbi-fav',movies:'sbi-movies',tv:'sbi-tv',anime:'sbi-anime',toprated:'sbi-toprated'};
function setNav(sec){
  Object.values(NM).forEach(id=>$(id)?.classList.remove('active'));
  Object.values(SM).forEach(id=>$(id)?.classList.remove('active'));
  if(NM[sec])$(NM[sec])?.classList.add('active');
  if(SM[sec])$(SM[sec])?.classList.add('active');
}

// ═══════════════════════════════
//  BÚSQUEDA
// ═══════════════════════════════
let sdT;
function setupSearch(){
  const inp=$('search-input');
  inp.addEventListener('input',()=>{
    clearTimeout(sdT);const q=inp.value.trim();
    if(!q){hide('search-dropdown');return;}
    sdT=setTimeout(()=>liveSearch(q),400);
  });
  inp.addEventListener('keydown',e=>{
    if(e.key==='Enter'){clearTimeout(sdT);doSearch();hide('search-dropdown');}
    if(e.key==='Escape'){inp.value='';hide('search-dropdown');}
  });
  document.addEventListener('click',e=>{
    if(!e.target.closest('.nav-search')&&!e.target.closest('.search-dropdown'))hide('search-dropdown');
  });
}
async function liveSearch(q){
  const dd=$('search-dropdown');
  dd.innerHTML=`<div class="sd-no-results">${spinI()}Buscando...</div>`;
  show('search-dropdown');
  try{
    const r=await tmdb('/search/multi?query='+encodeURIComponent(q)+'&language=es-ES&page=1');
    const items=(r.results||[]).filter(i=>i.media_type!=='person').slice(0,9);
    if(!items.length){dd.innerHTML=`<div class="sd-no-results">Sin resultados</div>`;return;}
    dd.innerHTML=items.map(i=>{
      const title=i.title||i.name||'';
      const year=(i.release_date||i.first_air_date||'').slice(0,4);
      const poster=i.poster_path?IMG5+i.poster_path:'';
      const tag=i.media_type==='movie'?'Película':'Serie';
      return`<div class="sd-item" onclick="hide('search-dropdown');openDetail('${i.media_type||"tv"}',${i.id})">
        ${poster?`<img class="sd-img" src="${poster}" alt="" loading="lazy" onerror="this.style.display='none'">`:'<div class="sd-img"></div>'}
        <div class="sd-info"><div class="sd-title">${esc(title)}</div><div class="sd-meta">${year}</div></div>
        <span class="sd-tag">${tag}</span>
      </div>`;
    }).join('');
  }catch(e){dd.innerHTML=`<div class="sd-no-results">Error al buscar</div>`;}
}
function doSearch(){
  const q=$('search-input').value.trim();if(!q)return;
  hideAll();show('search-section');$('search-title').textContent=`Resultados: "${q}"`;
  $('search-results').innerHTML=spinB();
  tmdb('/search/multi?query='+encodeURIComponent(q)+'&language=es-ES').then(d=>{
    const items=(d.results||[]).filter(i=>i.media_type!=='person');
    $('search-results').innerHTML=items.map(i=>mkCard(i,i.media_type||'tv')).join('')||nores();
  }).catch(e=>$('search-results').innerHTML=errB(e));
}

// ═══════════════════════════════
//  SECCIONES
// ═══════════════════════════════
const SECS=['home-sections','movies-section','tv-section','anime-section','toprated-section','search-section','genre-section','fav-section'];
function hideAll(){SECS.forEach(hide);$('hero-section').style.display='none';}
function goHome(){SECS.forEach(hide);show('home-sections');$('hero-section').style.display='';setNav('home');closeSB();window.scrollTo({top:0,behavior:'smooth'});}
function setSection(sec){
  hideAll();setNav(sec);closeSB();window.scrollTo({top:0,behavior:'smooth'});
  ({fav:()=>{show('fav-section');renderFavs();},
    movies:()=>{show('movies-section');loadGrid('movies-grid','movie');},
    tv:()=>{show('tv-section');loadGrid('tv-grid','tv');},
    anime:()=>{show('anime-section');loadAnimeGrid();},
    toprated:()=>{show('toprated-section');loadTopRated();},
  })[sec]?.();
}
async function setGenre(type,gid,label){
  hideAll();show('genre-section');$('genre-title').textContent=(type==='movie'?'🎬 ':'📺 ')+label;
  $('genre-grid').innerHTML=spinB();closeSB();window.scrollTo({top:0,behavior:'smooth'});
  try{const d=await tmdb(`/discover/${type}?language=es-ES&with_genres=${gid}&sort_by=popularity.desc`);
    $('genre-grid').innerHTML=(d.results||[]).map(i=>mkCard(i,type)).join('')||nores();}
  catch(e){$('genre-grid').innerHTML=errB(e);}
}
async function setAnimeGenre(gid,label){
  hideAll();show('genre-section');$('genre-title').textContent='⛩️ Anime · '+label;
  $('genre-grid').innerHTML=spinB();closeSB();window.scrollTo({top:0,behavior:'smooth'});
  try{const d=await tmdb(`/discover/tv?language=es-ES&with_keywords=210024&with_genres=${gid}&sort_by=popularity.desc`);
    $('genre-grid').innerHTML=(d.results||[]).map(i=>mkCard(i,'tv',true)).join('')||nores();}
  catch(e){$('genre-grid').innerHTML=errB(e);}
}

// ═══════════════════════════════
//  HOME — TMDB (español) + Anify seasonal
// ═══════════════════════════════
async function loadHome(){
  try{
    const[tm,ttv,mp,tvp,anime]=await Promise.all([
      tmdb('/trending/movie/week?language=es-ES'),
      tmdb('/trending/tv/week?language=es-ES'),
      tmdb('/movie/popular?language=es-ES'),
      tmdb('/tv/popular?language=es-ES'),
      tmdb('/discover/tv?language=es-ES&with_keywords=210024&sort_by=popularity.desc'),
    ]);
    heroItems=(tm.results||[]).filter(m=>m.backdrop_path).slice(0,8);
    if(heroItems.length){renderHero(heroItems[0],'movie');startHero();}
    renderSl('s0',[...(tm.results||[]).slice(0,10),...(ttv.results||[]).slice(0,10)],true);
    renderSl('s1',mp.results||[]);
    renderSl('s2',ttv.results||[],false,true);
    renderSl('s3',anime.results||[],false,false,true);
  }catch(e){console.error('loadHome',e);}
  // Anime esta temporada (TMDB)
  try{
    const y=new Date().getFullYear();
    const d=await tmdb(`/discover/tv?language=es-ES&with_keywords=210024&first_air_date_year=${y}&sort_by=popularity.desc`);
    if(d.results?.length)renderSl('s4',d.results,false,false,true);
  }catch(e){}
  // Anify seasonal en paralelo (sin bloquear) — solo si Railway disponible
  anifySeasonal().then(d=>{
    // Anify devuelve trending/popular — solo usamos las portadas de Anify si TMDB falla
    // No reemplaza TMDB porque Anify no tiene datos en español
  }).catch(()=>{});
}

function renderHero(item,type){
  $('hero-bg').style.backgroundImage=item.backdrop_path?`url(${IMGO+item.backdrop_path})`:'';
  $('hero-title').textContent=item.title||item.name||'';
  $('hero-desc').textContent=item.overview||'';
  const mt=item.media_type||type;
  $('hero-meta').innerHTML=`<span class="rating">★ ${item.vote_average?.toFixed(1)||'N/A'}</span><span>${(item.release_date||item.first_air_date||'').slice(0,4)}</span><span>${mt==='movie'?'🎬 Película':'📺 Serie'}</span>`;
  $('hero-play').onclick=()=>openPlayer(mt,item.id,item.title||item.name);
  $('hero-info').onclick=()=>openDetail(mt,item.id);
}
function startHero(){
  if(heroTimer)clearInterval(heroTimer);
  heroTimer=setInterval(()=>{heroIdx=(heroIdx+1)%heroItems.length;renderHero(heroItems[heroIdx],'movie');},7500);
}

// ═══════════════════════════════
//  SLIDERS / GRIDS
// ═══════════════════════════════
function renderSl(id,items,mixed=false,isTV=false,isAnime=false){
  const c=$(id);if(!c)return;
  c.innerHTML=(items||[]).map(i=>mkCard(i,mixed?(i.media_type||'movie'):(isTV?'tv':'movie'),isAnime)).join('');
}
function slide(id,dir){const s=$(id);if(s)s.scrollBy({left:dir*150*3,behavior:'smooth'});}
async function loadGrid(gid,type){
  const el=$(gid);if(!el||el.dataset.loaded)return;el.dataset.loaded=1;el.innerHTML=spinB();
  try{const d=await tmdb(type==='movie'?'/movie/popular?language=es-ES':'/tv/popular?language=es-ES');
    el.innerHTML=(d.results||[]).map(i=>mkCard(i,type)).join('');}
  catch(e){el.innerHTML=errB(e);}
}
async function loadAnimeGrid(){
  const el=$('anime-grid');if(!el||el.dataset.loaded)return;el.dataset.loaded=1;el.innerHTML=spinB();
  try{
    const[p1,p2]=await Promise.all([
      tmdb('/discover/tv?language=es-ES&with_keywords=210024&sort_by=popularity.desc&page=1'),
      tmdb('/discover/tv?language=es-ES&with_keywords=210024&sort_by=popularity.desc&page=2'),
    ]);
    el.innerHTML=[...(p1.results||[]),...(p2.results||[])].map(i=>mkCard(i,'tv',true)).join('');
  }catch(e){el.innerHTML=errB(e);}
}
async function loadTopRated(){
  const el=$('toprated-grid');if(!el||el.dataset.loaded)return;el.dataset.loaded=1;el.innerHTML=spinB();
  try{const d=await tmdb('/movie/top_rated?language=es-ES');
    el.innerHTML=(d.results||[]).map(i=>mkCard(i,'movie')).join('');}
  catch(e){el.innerHTML=errB(e);}
}

// ═══════════════════════════════
//  CARDS — todo de TMDB en español
// ═══════════════════════════════
function mkCard(item,type,isAnime=false){
  const title=esc(item.title||item.name||'Sin título');
  const rat=(item.vote_average||0).toFixed(1);
  const tag=isAnime?'Anime':(type==='movie'?'Film':'TV');
  const k=fk(type,item.id);
  const poster=item.poster_path?IMG5+item.poster_path:'';
  const ov=esc((item.overview||'').substring(0,280));
  const img=poster?`<img src="${poster}" alt="${title}" loading="lazy" onerror="this.className='card-ph'">`:`<div class="card-ph"></div>`;
  const fn=`openMini('${type}',${item.id},'${title.replace(/'/g,"\\'")}','${poster}','${rat}','${ov.replace(/'/g,"\\'")}',${isAnime})`;
  return`<div class="card" onclick="${fn}">${img}
    <span class="card-tag${isAnime?' anime-tag':''}">${tag}</span>
    <button class="fav-heart${isFav(type,item.id)?' on':''}" data-k="${k}"
      onclick="event.stopPropagation();toggleFav('${type}',${item.id},'${title.replace(/'/g,"\\'")}','${item.poster_path||''}',${item.vote_average||0})">
      ${isFav(type,item.id)?'❤️':'🤍'}</button>
    <div class="card-ov"><div class="card-name">${title}</div><div class="card-rat">★ ${rat}</div></div>
  </div>`;
}

// ═══════════════════════════════
//  MINI MODAL
// ═══════════════════════════════
function openMini(type,id,title,poster,rating,overview,isAnime){
  const ex=$('mini-ov');if(ex)ex.remove();
  const ov=document.createElement('div');ov.id='mini-ov';
  ov.style.cssText='position:fixed;inset:0;z-index:450;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.76);backdrop-filter:blur(4px);animation:fadein .17s';
  ov.onclick=e=>{if(e.target===ov)ov.remove();};
  const st=title.replace(/'/g,"\\'");
  const wFn=`document.getElementById('mini-ov').remove();openPlayer('${type}',${id},'${st}',${isAnime})`;
  const iFn=`document.getElementById('mini-ov').remove();openDetail('${type}',${id},${isAnime})`;
  ov.innerHTML=`
    <div style="background:var(--s1);border-radius:13px;max-width:350px;width:100%;overflow:hidden;border:1px solid rgba(255,255,255,.09);box-shadow:0 22px 60px rgba(0,0,0,.88)">
      <div style="position:relative;${poster?`background:url('${poster}') center/cover;`:''} min-height:185px">
        <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(9,9,15,1) 0%,rgba(9,9,15,.08) 70%)"></div>
        <button onclick="document.getElementById('mini-ov').remove()" style="position:absolute;top:10px;right:10px;background:rgba(9,9,15,.8);border:none;color:#fff;width:28px;height:28px;border-radius:50%;cursor:pointer;z-index:2;font-size:.82rem">✕</button>
        <div style="position:absolute;bottom:11px;left:13px;right:13px;z-index:2">
          <div style="font-family:'Bebas Neue',cursive;font-size:1.45rem;letter-spacing:1px;line-height:1.1;margin-bottom:2px;text-shadow:0 2px 8px rgba(0,0,0,.9)">${title}</div>
          <div style="font-size:.75rem;color:var(--gold);font-weight:700">${rating?'★ '+rating:''}</div>
        </div>
      </div>
      <div style="padding:13px 15px 15px">
        ${overview?`<p style="font-size:.78rem;color:rgba(240,240,248,.7);line-height:1.55;margin-bottom:13px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${overview}</p>`:''}
        <div style="display:flex;gap:8px">
          <button onclick="${wFn}" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;background:var(--red);color:#fff;border:none;padding:10px;font-family:'Inter',sans-serif;font-size:.85rem;font-weight:700;border-radius:7px;cursor:pointer">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> Ver ahora
          </button>
          <button onclick="${iFn}" style="flex:1;display:flex;align-items:center;justify-content:center;gap:5px;background:rgba(255,255,255,.08);color:var(--text);border:1px solid rgba(255,255,255,.12);padding:10px;font-family:'Inter',sans-serif;font-size:.85rem;font-weight:600;border-radius:7px;cursor:pointer">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Sinopsis
          </button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(ov);
}

// ═══════════════════════════════
//  DETAIL MODAL — TMDB en español
// ═══════════════════════════════
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
    $('mod-back').style.backgroundImage=det.backdrop_path?`url(${IMG7+det.backdrop_path})`:'';
    $('mod-poster').src=det.poster_path?IMG5+det.poster_path:'';
    $('mod-poster').alt=title;
    $('mod-tags').innerHTML=(det.genres||[]).map(g=>`<span class="badge">${g.name}</span>`).join('');
    $('mod-title').textContent=title;
    $('mod-meta').innerHTML=`<span class="star">★ ${det.vote_average?.toFixed(1)||'N/A'}</span>${year?`<span>📅 ${year}</span>`:''}${rt?`<span>⏱ ${rt}</span>`:''}<span>${isAnime?'⛩️ Anime':type==='movie'?'🎬 Película':'📺 Serie'}</span>`;
    // TMDB devuelve overview en español con language=es-ES
    $('mod-syn').textContent=det.overview||'Sin descripción disponible.';
    $('mod-acts').innerHTML=`
      <button class="watch-btn" onclick="closeMod();openPlayer('${type}',${id},'${esc(title)}',${isAnime})">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> Ver ahora
      </button>
      <button class="fav-btn${faved?' on':''}" id="fav-btn-mod" onclick="toggleFav('${type}',${id},'${esc(title)}','${det.poster_path||''}',${det.vote_average||0})">
        ${faved?'❤️ En favoritos':'🤍 Favoritos'}
      </button>`;
    $('mod-cast').innerHTML=cast.length?`<div class="cast-t">Reparto</div><div class="cast-list">${cast.map(a=>`<span class="cast-chip">${esc(a.name)}</span>`).join('')}</div>`:'';
    $('mod').scrollTop=0;show('mod-ov');document.body.style.overflow='hidden';
  }catch(e){console.error(e);toast('Error al cargar detalles');}
  finally{hide('loader-ov');}
}
function closeMod(event){
  if(event&&event.target!==$('mod-ov')&&!event.target.classList.contains('mod-x'))return;
  hide('mod-ov');document.body.style.overflow='';
}

// ═══════════════════════════════
//  PLAYER
// ═══════════════════════════════
async function openPlayer(type,id,title,isAnime=false){
  show('loader-ov');
  pl={type,tmdbId:id,anifyId:null,s:1,ep:1,seasons:[],eps:[],thumbs:{},
      title:title||'',poster:'',isAnime,lang:'dub',total:0,srcIdx:0,
      anifyProviders:[],currentEpId:null};

  if(type==='tv'){
    try{
      const det=await tmdb(`/tv/${id}?language=es-ES`);
      pl.seasons=(det.seasons||[]).filter(s=>s.season_number>0);
      // Para anime: buscar en Anify por nombre para obtener episodeIds reales
      if(isAnime){
        findAnifyId(id,title).then(aid=>{
          if(aid){pl.anifyId=aid;loadAnifyEpisodes(aid);}
        });
      }
      buildPills(isAnime?['dub','sub']:['dub','sub']);
      await loadSeasonEps(1);show('ep-panel');
    }catch(e){hide('ep-panel');}
  }else{
    hide('ep-panel');buildPills([]);
  }
  $('ply-title').textContent=pl.title;
  updBadge();loadFrame();
  hide('loader-ov');hide('mod-ov');
  show('ply-ov');document.body.style.overflow='hidden';
}

// Buscar Anify ID via TMDB ID en los mappings
async function findAnifyId(tmdbId,title){
  try{
    // Anify usa MAL IDs internamente pero también puede buscar por nombre
    const r=await fetch(`/api/anify/search?q=${encodeURIComponent(title)}&type=anime`);
    if(!r.ok)return null;
    const results=await r.json();
    // El primer resultado suele ser el correcto
    return results[0]?.id||null;
  }catch(e){return null;}
}

// Cargar episodios de Anify para obtener IDs reales

function buildPills(langs){
  const c=$('lang-pills');if(!c)return;
  c.innerHTML=langs.map(l=>`<button class="lpill${pl.lang===l?' on':''}" onclick="setLang('${l}')">${PLAB[l]||l}</button>`).join('');
  if(pl.isAnime)c.innerHTML+=`<button class="lpill" onclick="nextSrc()" title="Cambiar fuente (Unlimplay → VidSrc → 2Embed)">⚡ Cambiar fuente</button>`;
}
function setLang(lang){pl.lang=lang;buildPills(['dub','sub']);loadFrame();}
function nextSrc(){const total=1+SRC_ANIME_FB.length;pl.srcIdx=(pl.srcIdx+1)%total;const names=['Unlimplay','VidSrc','VidSrc 2','2Embed'];loadFrame();toast(`🔄 ${names[pl.srcIdx%names.length]}`);}

// ═══════════════════════════════
//  FRAME — Unlimplay primero, luego VidSrc/2embed como fallback
// ═══════════════════════════════
function loadFrame(){
  const f=$('ply-frame');if(!f)return;

  if(!pl.isAnime){
    // Películas → Unlimplay
    if(pl.type==='movie'){ f.src=SRC_MOV(pl.tmdbId); return; }
    // Series → Unlimplay
    f.src=SRC_TV(pl.tmdbId,pl.s,pl.ep);
    return;
  }

  // ANIME — fuentes en orden por srcIdx:
  // 0: Unlimplay  (usa TMDB ID, temporada 1 para anime)
  // 1: VidSrc.me
  // 2: VidSrc.to
  // 3: 2embed
  const all=[
    ()=> SRC_ANIME_UNLIM(pl.tmdbId,1,pl.ep),
    ...SRC_ANIME_FB.map(fn=>()=>fn(pl.tmdbId,pl.ep)),
  ];
  const idx=pl.srcIdx%all.length;
  f.src=all[idx]();
}


function updBadge(){
  $('ply-epbadge').textContent=(pl.type==='tv'||pl.isAnime)?`Temporada ${pl.s} · Episodio ${pl.ep}`:'';
}

// ═══════════════════════════════
//  PANEL DE EPISODIOS
// ═══════════════════════════════
async function loadSeasonEps(season){
  pl.s=season;pl.ep=1;
  const stabs=$('ep-stabs');
  if(stabs&&pl.seasons.length>0)
    stabs.innerHTML=pl.seasons.map(s=>
      `<button class="ep-stab${s.season_number===season?' on':''}" onclick="switchSeason(${s.season_number})">T${s.season_number}</button>`
    ).join('');
  try{
    // Episodios en español via TMDB
    const d=await tmdb(`/tv/${pl.tmdbId}/season/${season}?language=es-ES`);
    pl.eps=d.episodes||[];pl.total=pl.eps.length;
    pl.eps.forEach(e=>{if(e.still_path)pl.thumbs[e.episode_number]=`https://image.tmdb.org/t/p/w300${e.still_path}`;});
    renderEpList();
  }catch(e){pl.eps=[];pl.total=24;renderEpList();}
}
function switchSeason(s){
  document.querySelectorAll('.ep-stab').forEach(b=>b.classList.toggle('on',parseInt(b.textContent.slice(1))===s));
  loadSeasonEps(s);
}

function renderEpList(){
  const list=$('ep-list');if(!list)return;
  const total=pl.isAnime?pl.total:(pl.eps?.length||0);
  if(!total){list.innerHTML='<div style="color:var(--muted);padding:12px">Sin episodios</div>';return;}
  const t=pl.isAnime?'anime':'tv';
  const id=pl.tmdbId;
  const wCt=Array.from({length:total},(_,i)=>i+1).filter(ep=>isWatched(t,id,pl.s,ep)).length;
  const epPr=$('ep-prog');if(epPr)epPr.textContent=wCt>0?`${wCt}/${total} vistos`:'';
  let html='';
  for(let i=1;i<=total;i++){
    const ep=i;
    const tvEp=pl.eps?.find(e=>e.episode_number===ep);
    // Nombre en español (TMDB con es-ES)
    const name=tvEp?.name||`Capítulo ${ep}`;
    const desc=tvEp?.overview||'';
    const thumb=pl.thumbs[ep]||(pl.isAnime?pl.poster:'');
    const w=isWatched(t,id,pl.s,ep);
    const epProg=getEpProg(t,id,pl.s,ep);
    const pct=epProg?.p||0;
    const playing=(pl.ep===ep);
    const anifyEp=pl.isAnime?getAnifyEpData(ep):null;
    const hasDub=anifyEp?.hasDub;

    html+=`<div class="ep-row${playing?' playing':''}${w?' done':''}" onclick="${pl.isAnime?`playAnimeEp(${ep})`:`playTVEp(${ep})`}">
      <div class="ep-thumb-w">
        ${thumb?`<img src="${thumb}" alt="" loading="lazy" onerror="this.style.display='none'">`:''}
        ${playing?`<div class="ep-icon play-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg></div>`:w?`<div class="ep-icon done-icon">✓</div>`:''}
      </div>
      <div class="ep-ri">
        <div class="ep-epname">${esc(name)}${hasDub?' <span style="font-size:.6rem;background:rgba(34,197,94,.2);color:var(--green);padding:1px 5px;border-radius:3px;margin-left:5px">DUB</span>':''}</div>
        ${desc?`<div class="ep-desc">${esc(desc.substring(0,80))}...</div>`:''}
        <div class="ep-bar"><div class="ep-fill ${w?'grn':'red'}" style="width:${w?100:pct}%"></div></div>
      </div>
      <button class="ep-mrkbtn" onclick="event.stopPropagation();toggleMark(${ep})" title="${w?'No visto':'Visto'}">${w?'✓':'○'}</button>
    </div>`;
  }
  list.innerHTML=html;
  setTimeout(()=>{const a=list.querySelector('.playing');if(a)a.scrollIntoView({behavior:'smooth',block:'nearest'});},60);
}

function toggleMark(ep){
  const t=pl.isAnime?'anime':'tv';
  const w=isWatched(t,pl.tmdbId,pl.s,ep);
  markWatched(t,pl.tmdbId,pl.s,ep,!w);
  toast(w?`Ep ${ep}: no visto`:`✓ Ep ${ep}: visto`);
}
function playTVEp(ep){
  if(pl.ep!==ep)setEpProg('tv',pl.tmdbId,pl.s,pl.ep,100);
  pl.ep=ep;updBadge();loadFrame();renderEpList();
}
function playAnimeEp(ep){
  if(pl.ep!==ep)setEpProg('anime',pl.tmdbId,pl.s,pl.ep,100);
  pl.ep=ep;pl.srcIdx=0;updBadge();loadFrame();renderEpList();
}
function closePly(){
  const t=pl.isAnime?'anime':'tv';
  if(pl.type==='tv'||pl.isAnime)setEpProg(t,pl.tmdbId,pl.s,pl.ep,100);
  hide('ply-ov');$('ply-frame').src='';document.body.style.overflow='';
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closePly();closeMod();const m=$('mini-ov');if(m)m.remove();}});

const spinI =()=>`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite;vertical-align:middle;margin-right:6px"><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"/></svg>`;
const spinB =()=>`<div style="display:flex;align-items:center;justify-content:center;padding:44px;color:var(--muted);grid-column:1/-1"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"/></svg></div>`;
const errB  =e=>`<div style="color:var(--red);padding:16px;font-size:.83rem;grid-column:1/-1">⚠️ ${esc(String(e?.message||e))}</div>`;
const nores =()=>`<div style="color:var(--muted);padding:16px;grid-column:1/-1">Sin resultados.</div>`;
