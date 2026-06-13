// server/main.js — 入口：Express 5 + Socket.IO + WorldEngine
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import Store from './persistence/store.js';
import WorldEngine from './engine/world-engine.js';
import createRoutes from './routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);

// Socket.IO
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingInterval: 5000,
  pingTimeout: 10000,
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(resolve(__dirname, 'web')));

// Init store + world engine
const store = new Store();
const worldEngine = new WorldEngine(store, io);
worldEngine._mapPath = config.mapPath;

// Routes
app.use('/', createRoutes(store, worldEngine));

// Socket.IO connection
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  socket.on('client:hello', (payload) => {
    socket.emit('server:hello', {
      schemaVersion: 1,
      serverTime: Date.now(),
    });
  });

  socket.on('world:snapshot:request', () => {
    socket.emit('world:snapshot', worldEngine.buildSnapshot());
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// Start
async function start() {
  try {
    await worldEngine.init();
    worldEngine.start();

    httpServer.listen(config.port, config.host, () => {
      console.log(`\n🏘️  桃源镇 Living Town v2.0`);
      console.log(`   Server: http://${config.host}:${config.port}`);
      console.log(`   DB: ${config.dbPath}`);
      console.log(`   Tick: ${config.tickMs}ms | Speed: 1x`);
      const t = worldEngine.timeSystem.computeTime(worldEngine.timeSystem.gameMinute);
      console.log(`   Time: Year ${t.year} ${t.season} day ${t.dayOfYear} ${String(t.hour).padStart(2,'0')}:${String(t.minute).padStart(2,'0')}`);
      console.log(`   LLM: ${config.llm.model} @ ${config.llm.baseUrl}\n`);
    });
  } catch (err) {
    console.error('[FATAL] Server startup failed:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Shutdown] Gracefully stopping...');
  worldEngine.stop();
  store.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  worldEngine.stop();
  store.close();
  process.exit(0);
});

start();
