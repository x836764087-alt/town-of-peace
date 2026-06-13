// server/config.js — 桃源镇 Living Town 配置
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// Load .env if present
try { const r = createRequire(import.meta.url); r('dotenv').config({ path: resolve(root, '.env') }); } catch {}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',

  // Time system
  tickMs: 2000,
  realSecondsPerGameYear: 7 * 24 * 60 * 60, // 1 real week = 1 game year
  startGameMinute: parseInt(process.env.START_GAME_MINUTE || '0', 10),
  maxCatchUpMinutes: 1440, // 1 game day max catch-up

  // LLM
  llm: {
    baseUrl: process.env.LLM_BASE_URL || 'https://api.siliconflow.cn/v1',
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || 'nex-agi/Nex-N2-Pro',
    maxConcurrent: 2,
    timeoutMs: 8000,
    maxRetries: 1,
  },

  // DB
  dbPath: process.env.DB_PATH || resolve(root, 'data', 'town.db'),
  savePath: process.env.SAVE_PATH || resolve(root, 'data', 'saves', 'last-save.json'),

  // Paths
  root,
  mapPath: resolve(root, 'server', 'web', 'assets', 'map.tmj'),
  publicDir: resolve(root, 'server', 'web'),
};

export default config;
