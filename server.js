const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const DB_FILE = path.join(__dirname, 'db.json');

function loadDB(){
  try{ return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch(e){ return { votes:{}, predictions:{}, comments:{}, visitors:{}, totalVisits:0 }; }
}

function saveDB(db){
  fs.writeFileSync(DB_FILE, JSON.stringify(db));
}

// ── PRESENCIA EN VIVO ── (en memoria, se resetea si el server reinicia)
const sessions = {}; // { sessionId: lastPing }
const TIMEOUT = 90000; // 90s sin ping = desconectado

function cleanSessions(){
  const cutoff = Date.now() - TIMEOUT;
  Object.keys(sessions).forEach(id => { if(sessions[id] < cutoff) delete sessions[id]; });
}

// Ping cada 25s desde el navegador
app.post('/api/presence/ping', (req, res) => {
  const { sessionId, isNewVisit } = req.body;
  if(!sessionId) return res.status(400).json({ error: 'Falta sessionId' });

  const isFirst = !sessions[sessionId];
  sessions[sessionId] = Date.now();
  cleanSessions();

  if(isNewVisit && isFirst){
    const db = loadDB();
    if(!db.visitors) db.visitors = {};
    if(!db.visitors[sessionId]){
      db.visitors[sessionId] = Date.now();
      db.totalVisits = (db.totalVisits || 0) + 1;
      saveDB(db);
    }
  }

  const db = loadDB();
  res.json({ online: Object.keys(sessions).length, totalVisits: db.totalVisits || 0 });
});

// ── ESTADO ──
app.get('/', (req, res) => {
  res.json({ status:'ok', mensaje:'🚀 ShockTV Backend funcionando!' });
});

// ── VOTOS ──
app.get('/api/votes/:key', (req, res) => {
  const db = loadDB();
  res.json(db.votes[req.params.key] || { home:0, draw:0, away:0 });
});

app.post('/api/votes/:key', (req, res) => {
  const { choice, voterId } = req.body;
  if(!['home','draw','away'].includes(choice)) return res.status(400).json({ error:'Inválido' });
  const db = loadDB();
  const k = req.params.key;
  if(!db.votes[k]) db.votes[k] = { home:0, draw:0, away:0, voters:{} };
  if(db.votes[k].voters && db.votes[k].voters[voterId]){
    return res.json({ ...db.votes[k], alreadyVoted:true, myVote: db.votes[k].voters[voterId] });
  }
  db.votes[k][choice] = (db.votes[k][choice]||0) + 1;
  if(!db.votes[k].voters) db.votes[k].voters = {};
  if(voterId) db.votes[k].voters[voterId] = choice;
  saveDB(db);
  res.json({ ...db.votes[k], myVote: choice });
});

// ── PREDICCIONES ──
app.get('/api/predictions/:key', (req, res) => {
  const db = loadDB();
  const p = db.predictions[req.params.key] || {};
  res.json({ count: p.count||0 });
});

app.post('/api/predictions/:key', (req, res) => {
  const { home, away, voterId } = req.body;
  const db = loadDB();
  const k = req.params.key;
  if(!db.predictions[k]) db.predictions[k] = { count:0, voters:{} };
  if(db.predictions[k].voters && db.predictions[k].voters[voterId]){
    return res.json({ count: db.predictions[k].count, alreadyPredicted:true, myPrediction: db.predictions[k].voters[voterId] });
  }
  db.predictions[k].count = (db.predictions[k].count||0) + 1;
  if(!db.predictions[k].voters) db.predictions[k].voters = {};
  if(voterId) db.predictions[k].voters[voterId] = { home, away };
  saveDB(db);
  res.json({ count: db.predictions[k].count, myPrediction:{ home, away } });
});

// ── COMENTARIOS (con respuestas anidadas, retrocompatible) ──
// Estructura de un comentario:
// { id, name, text, voterId, ts, replies: [{id,name,text,voterId,ts}] }

function generateId(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2,6);
}

// Obtener comentarios de un partido
app.get('/api/comments/:key', (req, res) => {
  const db = loadDB();
  let comments = db.comments[req.params.key] || [];
  // Migración: comentarios viejos sin id/replies obtienen id y replies vacío
  comments = comments.map(c => ({
    id: c.id || generateId(),
    name: c.name || 'Hincha anónimo',
    text: c.text || '',
    voterId: c.voterId || null,
    ts: c.ts || Date.now(),
    replies: c.replies || []
  }));
  res.json(comments.slice(-100));
});

// Nuevo comentario
app.post('/api/comments/:key', (req, res) => {
  const { name, text, voterId } = req.body;
  if(!text || !text.trim()) return res.status(400).json({ error:'Vacío' });
  const db = loadDB();
  const k = req.params.key;
  if(!db.comments[k]) db.comments[k] = [];

  const comment = {
    id: generateId(),
    name: (name||'Hincha anónimo').slice(0,20),
    text: text.slice(0,200),
    voterId: voterId||null,
    ts: Date.now(),
    replies: []
  };
  db.comments[k].push(comment);
  if(db.comments[k].length > 200) db.comments[k].shift();
  saveDB(db);
  res.json(comment);
});

// Responder a un comentario
app.post('/api/comments/:key/reply/:commentId', (req, res) => {
  const { name, text, voterId } = req.body;
  if(!text || !text.trim()) return res.status(400).json({ error:'Vacío' });
  const db = loadDB();
  const k = req.params.key;
  const cid = req.params.commentId;
  if(!db.comments[k]) return res.status(404).json({ error:'Partido no encontrado' });

  const comment = db.comments[k].find(c => c.id === cid);
  if(!comment) return res.status(404).json({ error:'Comentario no encontrado' });
  if(!comment.replies) comment.replies = [];

  const reply = {
    id: generateId(),
    name: (name||'Hincha anónimo').slice(0,20),
    text: text.slice(0,200),
    voterId: voterId||null,
    ts: Date.now()
  };
  comment.replies.push(reply);
  if(comment.replies.length > 50) comment.replies.shift();
  saveDB(db);
  res.json(reply);
});

// Obtener feed de comunidad: últimos comentarios de todos los partidos
app.get('/api/community/feed', (req, res) => {
  const db = loadDB();
  const allComments = [];
  Object.entries(db.comments || {}).forEach(([matchKey, comments]) => {
    (comments||[]).slice(-5).forEach(c => {
      allComments.push({ ...c, matchKey, replies: c.replies||[] });
    });
  });
  allComments.sort((a,b) => b.ts - a.ts);
  res.json(allComments.slice(0,30));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 ShockTV Backend en puerto ${PORT}`));
