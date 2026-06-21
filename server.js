const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// ── BASE DE DATOS SIMPLE EN ARCHIVO JSON ──
// Railway borra el filesystem en cada redeploy, así que esto es para
// pruebas. Para producción seria, lo ideal es migrar a una DB real
// (Railway ofrece PostgreSQL gratis con poco esfuerzo de migración).
const DB_FILE = path.join(__dirname, 'db.json');

function loadDB(){
  try{
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  }catch(e){
    return { votes: {}, predictions: {}, comments: {} };
  }
}

function saveDB(db){
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ── PRESENCIA EN VIVO (en memoria, no necesita persistir en disco) ──
// Cada visitante manda un "heartbeat" cada 25s. Si no se recibe nada
// de un visitorId en los últimos 60s, se considera desconectado.
const activeViewers = new Map(); // visitorId -> timestamp último heartbeat
const PRESENCE_TIMEOUT = 60000;

function cleanupPresence(){
  const now = Date.now();
  for(const [id, ts] of activeViewers.entries()){
    if(now - ts > PRESENCE_TIMEOUT) activeViewers.delete(id);
  }
}

app.post('/api/presence/heartbeat', (req, res) => {
  const { visitorId } = req.body;
  if(!visitorId) return res.status(400).json({ error: 'Falta visitorId' });
  activeViewers.set(visitorId, Date.now());
  cleanupPresence();
  res.json({ online: activeViewers.size });
});

app.get('/api/presence/count', (req, res) => {
  cleanupPresence();
  res.json({ online: activeViewers.size });
});

// ── VISITAS TOTALES (persistente, cuenta visitantes únicos reales) ──
app.post('/api/visits/register', (req, res) => {
  const { visitorId } = req.body;
  if(!visitorId) return res.status(400).json({ error: 'Falta visitorId' });
  const db = loadDB();
  if(!db.uniqueVisitors) db.uniqueVisitors = {};
  const isNew = !db.uniqueVisitors[visitorId];
  if(isNew){
    db.uniqueVisitors[visitorId] = Date.now();
    saveDB(db);
  }
  const total = Object.keys(db.uniqueVisitors).length;
  res.json({ total, isNew });
});

app.get('/api/visits/count', (req, res) => {
  const db = loadDB();
  const total = db.uniqueVisitors ? Object.keys(db.uniqueVisitors).length : 0;
  res.json({ total });
});

app.get('/', (req, res) => {
  res.json({ status: 'ok', mensaje: '🚀 ShockTV Backend funcionando!' });
});

// ── VOTOS (¿quién gana?) ──
app.get('/api/votes/:matchKey', (req, res) => {
  const db = loadDB();
  const v = db.votes[req.params.matchKey] || { home: 0, draw: 0, away: 0 };
  res.json(v);
});

app.post('/api/votes/:matchKey', (req, res) => {
  const { choice, voterId } = req.body;
  if(!['home','draw','away'].includes(choice)){
    return res.status(400).json({ error: 'Voto inválido' });
  }
  const db = loadDB();
  const key = req.params.matchKey;
  if(!db.votes[key]) db.votes[key] = { home: 0, draw: 0, away: 0, voters: {} };
  if(!db.votes[key].voters) db.votes[key].voters = {};

  // Evitar doble voto del mismo visitante
  if(voterId && db.votes[key].voters[voterId]){
    return res.json({ ...db.votes[key], alreadyVoted: true, myVote: db.votes[key].voters[voterId] });
  }

  db.votes[key][choice] = (db.votes[key][choice] || 0) + 1;
  if(voterId) db.votes[key].voters[voterId] = choice;
  saveDB(db);
  res.json({ ...db.votes[key], myVote: choice });
});

// ── PREDICCIONES DE MARCADOR ──
app.get('/api/predictions/:matchKey', (req, res) => {
  const db = loadDB();
  const p = db.predictions[req.params.matchKey] || { count: 0, voters: {} };
  res.json({ count: p.count || 0 });
});

app.post('/api/predictions/:matchKey', (req, res) => {
  const { home, away, voterId } = req.body;
  const db = loadDB();
  const key = req.params.matchKey;
  if(!db.predictions[key]) db.predictions[key] = { count: 0, voters: {} };
  if(!db.predictions[key].voters) db.predictions[key].voters = {};

  if(voterId && db.predictions[key].voters[voterId]){
    return res.json({ count: db.predictions[key].count, alreadyPredicted: true, myPrediction: db.predictions[key].voters[voterId] });
  }

  db.predictions[key].count = (db.predictions[key].count || 0) + 1;
  if(voterId) db.predictions[key].voters[voterId] = { home, away };
  saveDB(db);
  res.json({ count: db.predictions[key].count, myPrediction: { home, away } });
});

// ── COMENTARIOS ──
app.get('/api/comments/:matchKey', (req, res) => {
  const db = loadDB();
  const c = db.comments[req.params.matchKey] || [];
  res.json(c.slice(-100));
});

app.post('/api/comments/:matchKey', (req, res) => {
  const { name, text, voterId } = req.body;
  if(!text || !text.trim()){
    return res.status(400).json({ error: 'Comentario vacío' });
  }
  const db = loadDB();
  const key = req.params.matchKey;
  if(!db.comments[key]) db.comments[key] = [];

  const comment = {
    name: (name || 'Hincha anónimo').slice(0, 20),
    text: text.slice(0, 200),
    voterId: voterId || null,
    ts: Date.now()
  };
  db.comments[key].push(comment);
  if(db.comments[key].length > 200) db.comments[key].shift();
  saveDB(db);
  res.json(comment);
});

// ── PRESENCIA EN VIVO (visitantes reales conectados ahora) ──
// Se considera "en línea" a cualquier sesión que hizo ping en los últimos 90s
let onlineSessions = {}; // { sessionId: lastPingTimestamp }
let totalVisitsCount = null;

function loadVisitCount(){
  const db = loadDB();
  if(typeof db.totalVisits !== 'number') db.totalVisits = 0;
  return db.totalVisits;
}

function saveVisitCount(n){
  const db = loadDB();
  db.totalVisits = n;
  saveDB(db);
}

if(totalVisitsCount === null) totalVisitsCount = loadVisitCount();

app.post('/api/presence/ping', (req, res) => {
  const { sessionId, isNewVisit } = req.body;
  if(!sessionId) return res.status(400).json({ error: 'sessionId requerido' });

  const isFirstPing = !onlineSessions[sessionId];
  onlineSessions[sessionId] = Date.now();

  if(isNewVisit && isFirstPing){
    totalVisitsCount++;
    saveVisitCount(totalVisitsCount);
  }

  // Limpiar sesiones inactivas (sin ping hace más de 90s)
  const cutoff = Date.now() - 90000;
  Object.keys(onlineSessions).forEach(sid => {
    if(onlineSessions[sid] < cutoff) delete onlineSessions[sid];
  });

  res.json({
    online: Object.keys(onlineSessions).length,
    totalVisits: totalVisitsCount
  });
});

app.get('/api/presence/stats', (req, res) => {
  const cutoff = Date.now() - 90000;
  Object.keys(onlineSessions).forEach(sid => {
    if(onlineSessions[sid] < cutoff) delete onlineSessions[sid];
  });
  res.json({
    online: Object.keys(onlineSessions).length,
    totalVisits: totalVisitsCount
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 ShockTV Backend corriendo en puerto ${PORT}`));
