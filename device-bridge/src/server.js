const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { PORT, WORKSTATION_ID, SCANNER_SIMULATE } = require('./config');
const httpRoutes = require('./httpRoutes');
const { handleWebSocket } = require('./wsHandler');

const app = express();
const server = http.createServer(app);

// ── Middleware ────────────────────────────────────────────
app.use(express.json());

// CORS — allow AegisCare frontend + local testing
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Request logger
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);
  next();
});

// ── HTTP Routes ───────────────────────────────────────────
app.use('/', httpRoutes);

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.url}` });
});

// ── WebSocket — ws://localhost:PORT/device ────────────────
const wss = new WebSocketServer({ server, path: '/device' });
wss.on('connection', handleWebSocket);

// ── Start server ──────────────────────────────────────────
server.listen(PORT, () => {
  console.log('');
  console.log('════════════════════════════════════════════');
  console.log('  AegisCare Biometric Bridge');
  console.log('════════════════════════════════════════════');
  console.log(`  Workstation : ${WORKSTATION_ID}`);
  console.log(`  HTTP health : http://localhost:${PORT}/health`);
  console.log(`  WebSocket   : ws://localhost:${PORT}/device`);
  console.log(`  Simulate    : ${SCANNER_SIMULATE ? 'YES (dev mode)' : 'NO (production)'}`);
  console.log('════════════════════════════════════════════');
  console.log('');
});
