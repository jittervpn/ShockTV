// ═══════════════════════════════════════
//  ShockTV — app.js
//  Datos: TMDB en español
//  Anime streaming: Anime1v API (AnimeAV1.com) → fallback Unlimplay
// ═══════════════════════════════════════
const IMG5 = 'https://image.tmdb.org/t/p/w500';
const IMG7 = 'https://image.tmdb.org/t/p/w780';
const IMGO = 'https://image.tmdb.org/t/p/original';
const TMDB = 'https://api.themoviedb.org/3';

// Streaming fallback con Unlimplay
const UNL_MOV = id        => `https://unlimplay.com/play/embed/movie/${id}`;
const UNL_TV  = (id,s,e)  => `https://unlimplay.com/play/embed/tv/${id}/${s}/${e}`;

// Cache
const C=new Map();
async function cached(k,fn,ttl=300000){
  const h=C.get(k);if(h&&Date.now()-h.t<ttl)return h.v;
  const v=await fn();C.set(k,{v,t:Date.now()});return v;
}

let TOKEN='', ANIME_KEY='';
function H(){return{accept:'application/json',Authorization:'Bearer '+TOKEN};}
async function api(p){return cached(p,async()=>{
  const r=await fetch(TMDB+p,{headers:H()});
  if(!r.ok)throw new Error('TMDB '+r.status);
  return r.json();
});}

// ── Anime1v API (Railway) ──
const API_BASE = (window.__API_BASE__ || '').replace(/\/$/, '');
async function animeAPI(endpoint, params={}){
  if(!API_BASE){
    console.error('[AnimeAV1] window.__API_BASE__ no está configurado en config.js — no se puede llamar al backend de Railway');
    throw new Error('API_BASE no configurado');
  }
  const qs=new URLSearchParams(params).toString();
  const r=await fetch(`${API_BASE}/api/anime/${endpoint}?${qs}`,{
    headers:{'x-api-key':ANIME_KEY,accept:'application/json'}
  });
  if(!r.ok){
    let msg=`AnimeAPI ${r.status}`;
    try{const j=await r.json();if(j?.message)msg+=` — ${j.message}`;}catch(e){}
    throw new Error(msg);
  }
  return r.json();
}

// Estado
let hero=[],heroI=0,heroT=null;
let pl={type:'',id:0,s:1,ep:1,seasons:[],eps:[],thumbs:{},
        title:'',poster:'',anime:false,total:0,
        animeSlug:'', // slug del anime en AnimeAV1
        servers:[],   // servidores del episodio actual
        srcIdx:0};
let favs={},prog={};

const $=id=>document.getElementById(id);
const show=id=>$(id)?.classList.remove('hidden');
const hide=id=>$(id)?.classList.add('hidden');
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

let tt;
function toast(m,d=2400){const t=$('toast');if(!t)return;t.textContent=m;show('toast');clearTimeout(tt);tt=setTimeout(()=>hide('toast'),d);}

// ═══════════════════════════════
//  INIT
// ═══════════════════════════════
document.addEventListener('DOMContentLoaded',async()=>{
  show('loader-ov');
  window.addEventListener('scroll',()=>$('navbar').classList.toggle('scrolled',window.scrollY>55));
  setupSearch();
  loadStore();
  detectNet();
  // Obtener tokens
  TOKEN     = window.__TMDB_TOKEN__||'';
  ANIME_KEY = window.__ANIME_KEY__||'';
  if(!TOKEN){
    try{const r=await fetch(`${API_BASE}/api/token`);if(r.ok){const d=await r.json();TOKEN=d.token||'';ANIME_KEY=d.animeKey||ANIME_KEY;}}catch(e){}
  }
  if(!TOKEN&&window.TMDB_TOKEN)TOKEN=window.TMDB_TOKEN;
  if(!TOKEN){
    $('main-content').innerHTML='<div style="color:var(--red);padding:40px;text-align:center">⚠️ Token TMDB no encontrado en config.js</div>';
    hide('loader-ov');return;
  }
  await loadHome();
  setTimeout(()=>hide('loader-ov'),400);
});

// ═══════════════════════════════
//  RED
// ═══════════════════════════════
async function detectNet(){
  const dot=$('net-dot'),txt=$('net-txt');if(!dot||!txt)return;
  const nav=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  let label='...',color='#888';
  if(nav){
    const e=nav.effectiveType||'',ct=nav.type||'',dl=nav.downlink||0;
    if(ct==='wifi'||(dl>5&&(e==='4g'||e==='5g'))){label='📶 WiFi';color='#22c55e';}
    else if(ct==='cellular'||e==='4g'){label='📱 4G';color='#f59e0b';}
    else{label='🌐 Red';color='#888';}
  }
  try{
    const t0=performance.now();
    await fetch('https://image.tmdb.org/t/p/w92/wwemzKWzjKYJFfCeiB57q3r4Bcm.png',{cache:'no-store',mode:'no-cors'});
    const ms=performance.now()-t0;
    if(!nav){if(ms<500){label='📶 Rápida';color='#22c55e';}else if(ms<1300){label='📡 Media';color='#f59e0b';}else{label='⚠️ Lenta';color='#ef4444';}}
    if(nav&&nav.type==='wifi'&&ms>1200){label='🔒 VPN';color='#a78bfa';}
  }catch(e){}
  dot.style.background=color;txt.textContent=label;
  setTimeout(detectNet,30000);
}

// ═══════════════════════════════
//  STORE
// ═══════════════════════════════
function loadStore(){
  try{favs=JSON.parse(localStorage.getItem('stv_f')||'{}');}catch(e){favs={};}
  try{prog=JSON.parse(localStorage.getItem('stv_p')||'{}');}catch(e){prog={};}
  updBadge();
}
function saveStore(){
  try{localStorage.setItem('stv_f',JSON.stringify(favs));localStorage.setItem('stv_p',JSON.stringify(prog));}catch(e){}
  updBadge();
}
function updBadge(){const n=Object.keys(favs).length;const el=$('fav-count');if(el)el.textContent=n>0?n:'';}
const fk=(t,id)=>`${t}${id}`;
const isFav=(t,id)=>!!favs[fk(t,id)];
function toggleFav(t,id,title,poster,rat){
  const k=fk(t,id);
  if(favs[k]){delete favs[k];toast('Eliminado de favoritos');}
  else{favs[k]={id,type:t,title,poster,rat};toast('❤️ Añadido a favoritos');}
  saveStore();
  const fb=$('fav-btn-mod');if(fb){fb.classList.toggle('on',isFav(t,id));fb.textContent=isFav(t,id)?'❤️ En favoritos':'🤍 Favoritos';}
  document.querySelectorAll(`.fav-heart[data-k="${k}"]`).forEach(h=>{h.classList.toggle('on',!!favs[k]);h.textContent=favs[k]?'❤️':'🤍';});
}
function renderFavs(){
  const el=$('fav-grid');if(!el)return;
  const items=Object.values(favs);
  if(!items.length){el.innerHTML='<p style="color:var(--muted);padding:24px;grid-column:1/-1">No tenés favoritos aún.</p>';return;}
  el.innerHTML=items.map(i=>card(i,i.type)).join('');
}
const ek=(t,id,s,ep)=>`${t}${id}s${s}e${ep}`;
function setProg(t,id,s,ep,pct){
  const k=ek(t,id,s,ep);
  if(pct>=95)prog[k]={w:1,p:100};else if(pct>0)prog[k]={w:0,p:pct};else delete prog[k];
  saveStore();
}
function getProg(t,id,s,ep){return prog[ek(t,id,s,ep)]||null;}
const isW=(t,id,s,ep)=>!!(prog[ek(t,id,s,ep)]?.w);
function markW(t,id,s,ep,v=true){
  if(v)setProg(t,id,s,ep,100);else delete prog[ek(t,id,s,ep)];
  saveStore();renderEps();
}

// ═══════════════════════════════
//  SIDEBAR
// ═══════════════════════════════
function openSB(){$('sidebar').classList.add('open');$('sb-ov').classList.add('open');document.body.style.overflow='hidden';}
function closeSB(){$('sidebar').classList.remove('open');$('sb-ov').classList.remove('open');document.body.style.overflow='';}
const NM={home:'nb-home',fav:'nb-fav',movies:'nb-movies',tv:'nb-tv',anime:'nb-anime'};
const SM={home:'sbi-home',fav:'sbi-fav',movies:'sbi-movies',tv:'sbi-tv',anime:'sbi-anime',toprated:'sbi-toprated'};
function setNav(s){
  Object.values(NM).forEach(id=>$(id)?.classList.remove('active'));
  Object.values(SM).forEach(id=>$(id)?.classList.remove('active'));
  NM[s]&&$(NM[s])?.classList.add('active');
  SM[s]&&$(SM[s])?.classList.add('active');
}

// ═══════════════════════════════
//  BÚSQUEDA
// ═══════════════════════════════
let sdT;
function setupSearch(){
  const inp=$('search-input');
  inp.addEventListener('input',()=>{clearTimeout(sdT);const q=inp.value.trim();if(!q){hide('search-dropdown');return;}sdT=setTimeout(()=>liveSearch(q),400);});
  inp.addEventListener('keydown',e=>{if(e.key==='Enter'){clearTimeout(sdT);doSearch();hide('search-dropdown');}if(e.key==='Escape'){inp.value='';hide('search-dropdown');}});
  document.addEventListener('click',e=>{if(!e.target.closest('.nav-search')&&!e.target.closest('.search-dropdown'))hide('search-dropdown');});
}
async function liveSearch(q){
  const dd=$('search-dropdown');
  dd.innerHTML=`<div class="sd-no-results">${spI()}Buscando...</div>`;show('search-dropdown');
  try{
    const r=await api('/search/multi?query='+encodeURIComponent(q)+'&language=es-ES&page=1');
    const items=(r.results||[]).filter(i=>i.media_type!=='person').slice(0,8);
    if(!items.length){dd.innerHTML='<div class="sd-no-results">Sin resultados</div>';return;}
    dd.innerHTML=items.map(i=>`
      <div class="sd-item" onclick="hide('search-dropdown');openDetail('${i.media_type||'tv'}',${i.id})">
        ${i.poster_path?`<img class="sd-img" src="${IMG5+i.poster_path}" alt="" loading="lazy" onerror="this.style.display='none'">`:'<div class="sd-img"></div>'}
        <div class="sd-info"><div class="sd-title">${esc(i.title||i.name||'')}</div><div class="sd-meta">${(i.release_date||i.first_air_date||'').slice(0,4)}</div></div>
        <span class="sd-tag">${i.media_type==='movie'?'Película':'Serie'}</span>
      </div>`).join('');
  }catch(e){dd.innerHTML='<div class="sd-no-results">Error al buscar</div>';}
}
function doSearch(){
  const q=$('search-input').value.trim();if(!q)return;
  hideAll();show('search-section');$('search-title').textContent=`Resultados: "${q}"`;
  $('search-results').innerHTML=spB();
  api('/search/multi?query='+encodeURIComponent(q)+'&language=es-ES').then(d=>{
    $('search-results').innerHTML=(d.results||[]).filter(i=>i.media_type!=='person').map(i=>card(i,i.media_type||'tv')).join('')||nores();
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
  $('genre-grid').innerHTML=spB();closeSB();window.scrollTo({top:0,behavior:'smooth'});
  try{const d=await api(`/discover/${type}?language=es-ES&with_genres=${gid}&sort_by=popularity.desc`);
    $('genre-grid').innerHTML=(d.results||[]).map(i=>card(i,type)).join('')||nores();}
  catch(e){$('genre-grid').innerHTML=errB(e);}
}
async function setAnimeGenre(gid,label){
  hideAll();show('genre-section');$('genre-title').textContent='⛩️ Anime · '+label;
  $('genre-grid').innerHTML=spB();closeSB();window.scrollTo({top:0,behavior:'smooth'});
  try{const d=await api(`/discover/tv?language=es-ES&with_keywords=210024&with_genres=${gid}&sort_by=popularity.desc`);
    $('genre-grid').innerHTML=(d.results||[]).map(i=>card(i,'tv',true)).join('')||nores();}
  catch(e){$('genre-grid').innerHTML=errB(e);}
}

// ═══════════════════════════════
//  HOME
// ═══════════════════════════════
async function loadHome(){
  const[tm,ttv,mp,tvp,an]=await Promise.all([
    api('/trending/movie/week?language=es-ES'),
    api('/trending/tv/week?language=es-ES'),
    api('/movie/popular?language=es-ES'),
    api('/tv/popular?language=es-ES'),
    api('/discover/tv?language=es-ES&with_keywords=210024&sort_by=popularity.desc'),
  ]);
  hero=(tm.results||[]).filter(m=>m.backdrop_path).slice(0,8);
  if(hero.length){renderHero(hero[0],'movie');startHero();}
  renderSl('s0',[...(tm.results||[]).slice(0,10),...(ttv.results||[]).slice(0,10)],true);
  renderSl('s1',mp.results||[]);
  renderSl('s2',ttv.results||[],false,true);
  renderSl('s3',an.results||[],false,false,true);
  // Temporada actual de anime
  try{
    const y=new Date().getFullYear();
    const d=await api(`/discover/tv?language=es-ES&with_keywords=210024&first_air_date_year=${y}&sort_by=popularity.desc`);
    if(d.results?.length)renderSl('s4',d.results,false,false,true);
  }catch(e){const b=$('s4');if(b)b.innerHTML=noDisp();}
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
  if(heroT)clearInterval(heroT);
  heroT=setInterval(()=>{heroI=(heroI+1)%hero.length;renderHero(hero[heroI],'movie');},7000);
}

// ═══════════════════════════════
//  SLIDERS / GRIDS
// ═══════════════════════════════
function renderSl(id,items,mixed=false,isTV=false,isAnime=false){
  const c=$(id);if(!c)return;
  c.innerHTML=(items||[]).map(i=>card(i,mixed?(i.media_type||'movie'):(isTV?'tv':'movie'),isAnime)).join('');
}
function slide(id,dir){const s=$(id);if(s)s.scrollBy({left:dir*150*3,behavior:'smooth'});}
async function loadGrid(gid,type){
  const el=$(gid);if(!el||el.dataset.l)return;el.dataset.l=1;el.innerHTML=spB();
  try{const d=await api(type==='movie'?'/movie/popular?language=es-ES':'/tv/popular?language=es-ES');
    el.innerHTML=(d.results||[]).map(i=>card(i,type)).join('');}
  catch(e){el.innerHTML=errB(e);}
}
async function loadAnimeGrid(){
  const el=$('anime-grid');if(!el||el.dataset.l)return;el.dataset.l=1;el.innerHTML=spB();
  try{
    const[p1,p2]=await Promise.all([
      api('/discover/tv?language=es-ES&with_keywords=210024&sort_by=popularity.desc&page=1'),
      api('/discover/tv?language=es-ES&with_keywords=210024&sort_by=popularity.desc&page=2'),
    ]);
    el.innerHTML=[...(p1.results||[]),...(p2.results||[])].map(i=>card(i,'tv',true)).join('');
  }catch(e){el.innerHTML=errB(e);}
}
async function loadTopRated(){
  const el=$('toprated-grid');if(!el||el.dataset.l)return;el.dataset.l=1;el.innerHTML=spB();
  try{const d=await api('/movie/top_rated?language=es-ES');
    el.innerHTML=(d.results||[]).map(i=>card(i,'movie')).join('');}
  catch(e){el.innerHTML=errB(e);}
}

// ═══════════════════════════════
//  CARDS
// ═══════════════════════════════
function card(item,type,isAnime=false){
  const title=esc(item.title||item.name||'Sin título');
  const rat=(item.vote_average||0).toFixed(1);
  const tag=isAnime?'Anime':(type==='movie'?'Film':'TV');
  const k=fk(type,item.id);
  const poster=item.poster_path?IMG5+item.poster_path:'';
  const ov=esc((item.overview||'').substring(0,280));
  const fn=`openMini('${type}',${item.id},'${title.replace(/'/g,"\\'")}','${poster}','${rat}','${ov.replace(/'/g,"\\'")}',${isAnime})`;
  const img=poster?`<img src="${poster}" alt="${title}" loading="lazy" onerror="this.className='card-ph'">`:`<div class="card-ph"></div>`;
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
          <button onclick="document.getElementById('mini-ov').remove();openPlayer('${type}',${id},'${st}',${isAnime})"
            style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;background:var(--red);color:#fff;border:none;padding:10px;font-family:'Inter',sans-serif;font-size:.85rem;font-weight:700;border-radius:7px;cursor:pointer">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> Ver ahora
          </button>
          <button onclick="document.getElementById('mini-ov').remove();openDetail('${type}',${id},${isAnime})"
            style="flex:1;display:flex;align-items:center;justify-content:center;gap:5px;background:rgba(255,255,255,.08);color:var(--text);border:1px solid rgba(255,255,255,.12);padding:10px;font-family:'Inter',sans-serif;font-size:.85rem;font-weight:600;border-radius:7px;cursor:pointer">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Sinopsis
          </button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(ov);
}

// ═══════════════════════════════
//  DETAIL — TMDB 100% español
// ═══════════════════════════════
async function openDetail(type,id,isAnime=false){
  show('loader-ov');
  try{
    const[det,cred]=await Promise.all([api(`/${type}/${id}?language=es-ES`),api(`/${type}/${id}/credits?language=es-ES`)]);
    const title=det.title||det.name||'';
    const year=(det.release_date||det.first_air_date||'').slice(0,4);
    const rt=det.runtime?`${det.runtime} min`:(det.episode_run_time?.[0]?`${det.episode_run_time[0]} min/ep`:'');
    const cast=(cred.cast||[]).slice(0,8);
    const faved=isFav(type,id);
    $('mod-back').style.backgroundImage=det.backdrop_path?`url(${IMG7+det.backdrop_path})`:'';
    $('mod-poster').src=det.poster_path?IMG5+det.poster_path:'';$('mod-poster').alt=title;
    $('mod-tags').innerHTML=(det.genres||[]).map(g=>`<span class="badge">${g.name}</span>`).join('');
    $('mod-title').textContent=title;
    $('mod-meta').innerHTML=`<span class="star">★ ${det.vote_average?.toFixed(1)||'N/A'}</span>${year?`<span>📅 ${year}</span>`:''}${rt?`<span>⏱ ${rt}</span>`:''}<span>${isAnime?'⛩️ Anime':type==='movie'?'🎬 Película':'📺 Serie'}</span>`;
    $('mod-syn').textContent=det.overview||'Sin descripción.';
    $('mod-acts').innerHTML=`
      <button class="watch-btn" onclick="closeMod();openPlayer('${type}',${id},'${esc(title)}',${isAnime})">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> Ver ahora
      </button>
      <button class="fav-btn${faved?' on':''}" id="fav-btn-mod" onclick="toggleFav('${type}',${id},'${esc(title)}','${det.poster_path||''}',${det.vote_average||0})">
        ${faved?'❤️ En favoritos':'🤍 Favoritos'}
      </button>`;
    $('mod-cast').innerHTML=cast.length?`<div class="cast-t">Reparto</div><div class="cast-list">${cast.map(a=>`<span class="cast-chip">${esc(a.name)}</span>`).join('')}</div>`:'';
    $('mod').scrollTop=0;show('mod-ov');document.body.style.overflow='hidden';
  }catch(e){console.error(e);toast('Error al cargar');}
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
  pl={type,id,s:1,ep:1,seasons:[],eps:[],thumbs:{},title:title||'',poster:'',
      anime:isAnime,total:0,animeSlug:'',servers:[],srcIdx:0};

  let titleEs=title, titleEn=title;

  if(type==='tv'){
    try{
      const det=await api(`/tv/${id}?language=es-ES`);
      pl.seasons=(det.seasons||[]).filter(s=>s.season_number>0);
      titleEs=det.name||title;
      titleEn=det.original_name||titleEs;
      show('ep-panel');
      await loadSeasonEps(1);
    }catch(e){
      console.error('[TMDB] Error cargando detalles de la serie:', e.message);
      hide('ep-panel');
    }
  }else{
    hide('ep-panel');
  }

  // Buscar en AnimeAV1 SIEMPRE que sea anime, sin depender de si TMDB falló arriba
  if(isAnime){
    findAnimeAV1(titleEs, titleEn);
  }

  $('ply-title').textContent=pl.title;
  updPlyBadge();loadFrame();
  hide('loader-ov');hide('mod-ov');
  show('ply-ov');document.body.style.overflow='hidden';
}

// Buscar anime en AnimeAV1 (async, no bloquea)
async function findAnimeAV1(titleEs, titleEn){
  console.log('[AnimeAV1] Buscando:', titleEs, '/', titleEn);
  try{
    // Buscar en español primero
    let res=await animeAPI('search',{q:titleEs});
    if(!res?.data?.results?.length && titleEn!==titleEs){
      res=await animeAPI('search',{q:titleEn});
    }
    const results=res?.data?.results||[];
    if(!results.length){
      console.log('[AnimeAV1] No encontrado:', titleEs);
      // Seguir con Unlimplay (ya está cargado)
      return;
    }
    const animeSlug=results[0].slug;
    pl.animeSlug=animeSlug;
    console.log('[AnimeAV1] Encontrado, slug:', animeSlug);
    // Obtener info para saber el total de episodios
    const info=await animeAPI('info',{slug:animeSlug});
    const episodes=info?.data?.episodes||[];
    pl.total=Math.max(pl.total,episodes.length||info?.data?.episodesCount||0);
    // Cargar ep 1 con AnimeAV1
    if(pl.total>0){
      await loadAnimeEp(1);
    }
    toast('✅ AnimeAV1 — Audio latino disponible');
    renderEps();
  }catch(e){
    console.error('[AnimeAV1] Error buscando:', e.message);
  }
}

// Cargar episodio desde AnimeAV1 y reproducir
async function loadAnimeEp(epNum){
  if(!pl.animeSlug) return false;
  try{
    const data=await animeAPI('episode',{slug:pl.animeSlug, number:epNum});
    const servers=data?.data?.servers||{};
    // Preferir sub (latino generalmente está en sub en AnimeAV1)
    const allServers=[...(servers.sub||[]),...(servers.dub||[])];
    if(!allServers.length) return false;
    pl.servers=allServers;
    pl.srcIdx=0;
    const firstServer=allServers[0];
    const serverUrl=firstServer.url||firstServer.link||'';
    if(serverUrl){
      $('ply-frame').src=serverUrl;
      return true;
    }
  }catch(e){console.warn('[AnimeAV1 ep] Error:', e.message);}
  return false;
}

function loadFrame(){
  const f=$('ply-frame');if(!f)return;
  if(pl.anime){
    // Unlimplay como fuente inicial (inmediata) mientras buscamos AnimeAV1
    f.src=UNL_TV(pl.id,pl.s,pl.ep);
  }else if(pl.type==='movie'){
    f.src=UNL_MOV(pl.id);
  }else{
    f.src=UNL_TV(pl.id,pl.s,pl.ep);
  }
}

// Cambiar entre servidor de AnimeAV1 y Unlimplay
async function nextSrc(){
  if(pl.anime&&pl.animeSlug){
    if(pl.servers.length>1){
      pl.srcIdx=(pl.srcIdx+1)%pl.servers.length;
      const s=pl.servers[pl.srcIdx];
      const url=s.url||s.link||'';
      if(url){$('ply-frame').src=url;toast(`Fuente ${pl.srcIdx+1}/${pl.servers.length}`);return;}
    }
  }
  // Fallback Unlimplay
  $('ply-frame').src=pl.type==='movie'?UNL_MOV(pl.id):UNL_TV(pl.id,pl.s,pl.ep);
  toast('Cambiado a Unlimplay');
}

function updPlyBadge(){
  $('ply-epbadge').textContent=pl.type==='tv'?`Temporada ${pl.s} · Episodio ${pl.ep}`:'';
}

// ═══════════════════════════════
//  EPISODIOS
// ═══════════════════════════════
async function loadSeasonEps(season){
  pl.s=season;pl.ep=1;
  const stabs=$('ep-stabs');
  if(stabs&&pl.seasons.length>0)
    stabs.innerHTML=pl.seasons.map(s=>
      `<button class="ep-stab${s.season_number===season?' on':''}" onclick="switchSeason(${s.season_number})">T${s.season_number}</button>`
    ).join('');
  try{
    const d=await api(`/tv/${pl.id}/season/${season}?language=es-ES`);
    pl.eps=d.episodes||[];pl.total=pl.eps.length;
    pl.eps.forEach(e=>{if(e.still_path)pl.thumbs[e.episode_number]=`https://image.tmdb.org/t/p/w300${e.still_path}`;});
    renderEps();
  }catch(e){pl.eps=[];pl.total=12;renderEps();}
}
function switchSeason(s){
  document.querySelectorAll('.ep-stab').forEach(b=>b.classList.toggle('on',parseInt(b.textContent.slice(1))===s));
  loadSeasonEps(s);
}

function renderEps(){
  const list=$('ep-list');if(!list)return;
  const total=pl.total||pl.eps?.length||0;
  if(!total){list.innerHTML='<div style="color:var(--muted);padding:12px">Sin episodios</div>';return;}
  const t='tv',id=pl.id;
  const wCt=Array.from({length:total},(_,i)=>i+1).filter(ep=>isW(t,id,pl.s,ep)).length;
  const epEl=$('ep-prog');if(epEl)epEl.textContent=wCt>0?`${wCt}/${total} vistos`:'';
  let html='';
  for(let i=1;i<=total;i++){
    const tvEp=pl.eps?.find(e=>e.episode_number===i);
    const name=tvEp?.name||`Capítulo ${i}`;
    const desc=tvEp?.overview||'';
    const thumb=pl.thumbs[i]||'';
    const hasAV1=!!(pl.animeSlug&&pl.total&&i<=pl.total);
    const w=isW(t,id,pl.s,i);
    const p=getProg(t,id,pl.s,i);
    const pct=p?.p||0;
    const playing=pl.ep===i;
    html+=`<div class="ep-row${playing?' playing':''}${w?' done':''}" onclick="playEp(${i})">
      <div class="ep-thumb-w">
        ${thumb?`<img src="${thumb}" alt="" loading="lazy" onerror="this.style.display='none'">`:''}
        ${playing?`<div class="ep-icon play-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg></div>`:w?`<div class="ep-icon done-icon">✓</div>`:''}
      </div>
      <div class="ep-ri">
        <div class="ep-epname">${esc(name)}${hasAV1?' <span style="color:#22c55e;font-size:.65rem;background:rgba(34,197,94,.12);padding:1px 5px;border-radius:3px;margin-left:4px">LATINO</span>':''}</div>
        ${desc?`<div class="ep-desc">${esc(desc.substring(0,80))}...</div>`:''}
        <div class="ep-bar"><div class="ep-fill ${w?'grn':'red'}" style="width:${w?100:pct}%"></div></div>
      </div>
      <button class="ep-mrkbtn" onclick="event.stopPropagation();toggleMark(${i})">${w?'✓':'○'}</button>
    </div>`;
  }
  list.innerHTML=html;
  setTimeout(()=>{const a=list.querySelector('.playing');if(a)a.scrollIntoView({behavior:'smooth',block:'nearest'});},60);
}

async function playEp(ep){
  if(pl.ep!==ep)setProg('tv',pl.id,pl.s,pl.ep,100);
  pl.ep=ep;pl.srcIdx=0;pl.servers=[];
  updPlyBadge();
  // Si tenemos el anime resuelto en AnimeAV1 → intentar cargar ese episodio (latino)
  if(pl.anime&&pl.animeSlug&&ep<=pl.total){
    show('loader-ov');
    const ok=await loadAnimeEp(ep);
    hide('loader-ov');
    if(ok){renderEps();return;}
  }
  // Fallback Unlimplay
  loadFrame();
  renderEps();
}
function toggleMark(ep){
  const w=isW('tv',pl.id,pl.s,ep);markW('tv',pl.id,pl.s,ep,!w);
  toast(w?`Ep ${ep}: no visto`:`✓ Ep ${ep}: visto`);
}
function closePly(){
  setProg('tv',pl.id,pl.s,pl.ep,100);
  hide('ply-ov');$('ply-frame').src='';document.body.style.overflow='';
}

document.addEventListener('keydown',e=>{if(e.key==='Escape'){closePly();closeMod();const m=$('mini-ov');if(m)m.remove();}});

// Helpers
const spI=()=>`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite;vertical-align:middle;margin-right:5px"><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"/></svg>`;
const spB=()=>`<div style="display:flex;align-items:center;justify-content:center;padding:44px;color:var(--muted);grid-column:1/-1"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"/></svg></div>`;
const errB=e=>`<div style="color:var(--red);padding:16px;grid-column:1/-1">⚠️ ${esc(String(e?.message||e))}</div>`;
const nores=()=>`<div style="color:var(--muted);padding:16px;grid-column:1/-1">Sin resultados.</div>`;
const noDisp=()=>`<div style="color:var(--muted);padding:12px;font-size:.8rem">No disponible</div>`;
