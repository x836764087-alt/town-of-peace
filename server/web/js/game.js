// server/web/js/game.js — 主渲染引擎
// Canvas 像素渲染、Camera 系统、角色绘制

class GameApp {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.minimapCtx = this.minimapCanvas.getContext('2d');

    // Game state
    this.world = null;
    this.agents = [];
    this.buildings = [];
    this.events = [];
    this.chronicles = [];

    // Camera
    this.camera = { x: 0, y: 0, zoom: 1.0 };
    this._dragging = false;
    this._dragStart = { x: 0, y: 0 };
    this._followAgent = null;
    this._hoverAgent = null;

    // Animation
    this._frameId = null;
    this._lastFrame = 0;

    // Network
    this.network = new NetworkClient();
    this._setupNetwork();
    this._setupInput();
    this._setupUI();

    // Start loop
    this._lastFrame = performance.now();
    this._loop(this._lastFrame);
  }

  _setupNetwork() {
    this.network
      .on('snapshot', (data) => {
        this.world = data.world;
        this.agents = (data.agents || []).sort((a, b) => a.position.y - b.position.y);
        this.buildings = data.buildings || [];
        this.events = data.recentEvents || [];
        this.chronicles = data.recentChronicles || [];
        this._updateUI();
        this._hideLoading();
      })
      .on('tick', (data) => {
        if (this.world) {
          this.world.gameMinute = data.gameMinute;
          this.world.year = data.year;
          this.world.season = data.season;
          this.world.dayOfYear = data.dayOfYear;
          this.world.hour = data.hour;
          this.world.minute = data.minute;
          this.world.weather = data.weather;
        }
        this._updateUI();
      })
      .on('agentDelta', (data) => {
        if (data.agents) {
          for (const delta of data.agents) {
            const idx = this.agents.findIndex(a => a.id === delta.id);
            if (idx >= 0) {
              this.agents[idx].position = delta.position;
              this.agents[idx].needs = delta.needs;
              this.agents[idx].presence = delta.presence;
              this.agents[idx].emotion = delta.emotion;
            }
          }
          // Re-sort by Y position for depth
          this.agents.sort((a, b) => a.position.y - b.position.y);
        }
      });
  }

  _setupInput() {
    // Camera dragging
    this.canvas.addEventListener('mousedown', (e) => {
      this._dragging = true;
      this._dragStart.x = e.clientX - this.camera.x;
      this._dragStart.y = e.clientY - this.camera.y;
    });

    window.addEventListener('mousemove', (e) => {
      if (this._dragging) {
        this.camera.x = e.clientX - this._dragStart.x;
        this.camera.y = e.clientY - this._dragStart.y;
      }
      this._updateHover(e);
    });

    window.addEventListener('mouseup', () => {
      this._dragging = false;
    });

    // Zoom
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      this.camera.zoom = Math.max(0.3, Math.min(3, this.camera.zoom + delta));
    });

    // Follow button
    document.getElementById('btn-follow').addEventListener('click', () => {
      if (this._followAgent) {
        this._followAgent = null;
        document.getElementById('btn-follow').textContent = '👁️ 围观';
      } else if (this.agents.length > 0) {
        this._followAgent = this.agents[Math.floor(Math.random() * this.agents.length)].id;
        document.getElementById('btn-follow').textContent = '👁️ 跟随中';
      }
    });

    // Canvas click to select agent
    this.canvas.addEventListener('click', (e) => {
      const agent = this._getAgentAtScreen(e.offsetX, e.offsetY);
      if (agent) {
        this._showAgentModal(agent);
      }
    });
  }

  _setupUI() {
    // Modal close
    document.querySelector('.modal-close').addEventListener('click', () => {
      document.getElementById('agent-modal').style.display = 'none';
    });
    window.addEventListener('click', (e) => {
      if (e.target === document.getElementById('agent-modal')) {
        document.getElementById('agent-modal').style.display = 'none';
      }
    });
  }

  _hideLoading() {
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('game-container').style.display = 'flex';
  }

  _loop(timestamp) {
    const dt = Math.min(timestamp - this._lastFrame, 50);
    this._lastFrame = timestamp;
    this._render();
    this._renderMinimap();
    this._frameId = requestAnimationFrame((t) => this._loop(t));
  }

  _render() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    ctx.fillStyle = '#1a3a1a';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(W / 2 + this.camera.x, H / 2 + this.camera.y);
    ctx.scale(this.camera.zoom, this.camera.zoom);

    // Draw tile grid (simple ground)
    const TILE = 32;
    const viewTilesX = Math.ceil(W / this.camera.zoom / TILE) + 2;
    const viewTilesY = Math.ceil(H / this.camera.zoom / TILE) + 2;
    const offsetX = -(W / 2 + this.camera.x) / this.camera.zoom;
    const offsetY = -(H / 2 + this.camera.y) / this.camera.zoom;
    const startCol = Math.floor(offsetX / TILE);
    const startRow = Math.floor(offsetY / TILE);

    for (let row = startRow; row < startRow + viewTilesY; row++) {
      for (let col = startCol; col < startCol + viewTilesX; col++) {
        const x = col * TILE;
        const y = row * TILE;
        // Simple terrain coloring
        const terrain = this._getTerrain(col, row);
        ctx.fillStyle = terrain;
        ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.strokeRect(x, y, TILE, TILE);
      }
    }

    // Draw buildings (simple placeholders)
    ctx.globalAlpha = 0.8;
    for (const b of this.buildings || []) {
      const bx = (b.position?.x || 0) * TILE;
      const by = (b.position?.y || 0) * TILE;
      ctx.fillStyle = '#8B7355';
      ctx.fillRect(bx, by, TILE, TILE);
      ctx.strokeStyle = '#6B5335';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, TILE, TILE);
      // Roof
      ctx.fillStyle = '#A0522D';
      ctx.beginPath();
      ctx.moveTo(bx - 4, by);
      ctx.lineTo(bx + TILE / 2, by - 12);
      ctx.lineTo(bx + TILE + 4, by);
      ctx.fill();

      // Name label
      ctx.fillStyle = '#fff';
      ctx.font = '8px Pixelify Sans';
      ctx.textAlign = 'center';
      ctx.fillText(b.name || '?', bx + TILE / 2, by - 16);
    }
    ctx.globalAlpha = 1;

    // Draw agents
    for (const agent of this.agents || []) {
      this._drawAgent(ctx, agent, TILE);
    }

    // Hover card
    if (this._hoverAgent) {
      this._drawHoverCard(ctx, this._hoverAgent, TILE);
    }

    ctx.restore();
  }

  _drawAgent(ctx, agent, TILE) {
    const x = (agent.position?.x || 0) * TILE;
    const y = (agent.position?.y || 0) * TILE;

    // Body (pixel character)
    const isFollowed = this._followAgent === agent.id;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(x + TILE / 2, y + TILE, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = '#FFB6C1'; // skin
    ctx.fillRect(x + 8, y + 6, 16, 12);

    // Hair
    ctx.fillStyle = '#4A3728';
    ctx.fillRect(x + 6, y + 2, 20, 8);

    // Eyes
    ctx.fillStyle = '#333';
    ctx.fillRect(x + 10, y + 8, 4, 3);
    ctx.fillRect(x + 18, y + 8, 4, 3);

    // Clothes
    ctx.fillStyle = agent.gender === 'f' ? '#FF69B4' : '#4169E1';
    ctx.fillRect(x + 8, y + 16, 16, 12);

    // Name tag
    ctx.fillStyle = isFollowed ? '#FFD700' : '#fff';
    ctx.font = '9px Pixelify Sans';
    ctx.textAlign = 'center';
    ctx.fillText(agent.name || '?', x + TILE / 2, y - 6);

    // Follow indicator
    if (isFollowed) {
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(x - 2, y - 10, TILE + 4, TILE + 20);
      ctx.setLineDash([]);
    }

    // Emotion indicator
    if (agent.emotion === 'distressed') {
      ctx.fillStyle = '#FF4444';
      ctx.font = '10px Pixelify Sans';
      ctx.fillText('😰', x + TILE / 2, y - 20);
    } else if (agent.emotion === 'content') {
      ctx.fillStyle = '#44FF44';
      ctx.font = '10px Pixelify Sans';
      ctx.fillText('😊', x + TILE / 2, y - 20);
    }
  }

  _drawHoverCard(ctx, agent, TILE) {
    const x = (agent.position?.x || 0) * TILE;
    const y = (agent.position?.y || 0) * TILE;

    const cardW = 150;
    const cardH = 70;
    const cardX = Math.min(x - cardW / 2 + TILE / 2, 400 - cardW);
    const cardY = y - 50;

    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#16213e';
    ctx.strokeStyle = '#c8a165';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 6);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Name
    ctx.fillStyle = '#c8a165';
    ctx.font = 'bold 12px Pixelify Sans';
    ctx.textAlign = 'left';
    ctx.fillText(agent.name || '?', cardX + 8, cardY + 18);

    // Title
    ctx.fillStyle = '#8899aa';
    ctx.font = '10px Pixelify Sans';
    ctx.fillText(agent.title || '', cardX + 8, cardY + 32);

    // Status
    const statusColors = { active: '#53e87a', thinking: '#c8a165', idle: '#8899aa', sleeping: '#53b8e8' };
    ctx.fillStyle = statusColors[agent.presence] || '#8899aa';
    ctx.fillRect(cardX + 8, cardY + 40, 6, 6);
    ctx.fillStyle = '#e0e0e0';
    ctx.font = '10px Pixelify Sans';
    ctx.fillText(agent.presence || 'idle', cardX + 18, cardY + 48);

    ctx.restore();
  }

  _renderMinimap() {
    const ctx = this.minimapCtx;
    const W = 150;
    const H = 120;
    ctx.fillStyle = '#1a3a1a';
    ctx.fillRect(0, 0, W, H);

    if (!this.agents || this.agents.length === 0) return;

    // Scale: map is 50x40
    const scaleX = W / 50;
    const scaleY = H / 40;

    // Draw agents
    for (const agent of this.agents) {
      const sx = (agent.position?.x || 0) * scaleX;
      const sy = (agent.position?.y || 0) * scaleY;
      ctx.fillStyle = this._followAgent === agent.id ? '#FFD700' : '#53b8e8';
      ctx.fillRect(sx - 1, sy - 1, 3, 3);
    }

    // Viewport rectangle
    if (this.world) {
      ctx.strokeStyle = 'rgba(200,161,101,0.5)';
      ctx.lineWidth = 1;
      const vx = (-this.camera.x / this.camera.zoom + 400) * scaleX / 800;
      const vy = (-this.camera.y / this.camera.zoom + 300) * scaleY / 600;
      const vw = (800 / this.camera.zoom) * scaleX / 800;
      const vh = (600 / this.camera.zoom) * scaleY / 600;
      ctx.strokeRect(vx, vy, vw, vh);
    }
  }

  _getTerrain(col, row) {
    // Simple terrain based on position
    if (col < 5 && row < 5) return '#3a6b3a'; // forest
    if (col < 8 || col > 40) return '#4a7a4a'; // grass
    if (row > 33) return '#3a6b3a'; // south forest
    if (col > 15 && col < 20 && row > 10 && row < 15) return '#8B7355'; // buildings
    if (col % 5 === 0 || row % 5 === 0) return '#7a6a5a'; // paths
    return '#4a7a4a'; // default grass
  }

  _getAgentAtScreen(screenX, screenY) {
    const TILE = 32;
    const W = this.canvas.width;
    const H = this.canvas.height;

    for (const agent of this.agents) {
      const worldX = (agent.position?.x || 0) * TILE;
      const worldY = (agent.position?.y || 0) * TILE;
      const sx = (worldX + TILE / 2 - W / 2 - this.camera.x) * this.camera.zoom + W / 2;
      const sy = (worldY + TILE / 2 - H / 2 - this.camera.y) * this.camera.zoom + H / 2;

      if (Math.abs(sx - screenX) < 32 * this.camera.zoom && Math.abs(sy - screenY) < 32 * this.camera.zoom) {
        return agent;
      }
    }
    return null;
  }

  _updateHover(e) {
    const rect = this.canvas.getBoundingClientRect();
    const agent = this._getAgentAtScreen(e.clientX - rect.left, e.clientY - rect.top);
    this._hoverAgent = agent;
    this.canvas.style.cursor = agent ? 'pointer' : (this._dragging ? 'grabbing' : 'grab');
  }

  _showAgentModal(agent) {
    const modal = document.getElementById('agent-modal');
    const body = document.getElementById('modal-body');

    const needs = agent.needs || {};
    const stats = agent.stats || {};

    body.innerHTML = `
      <h2 style="color: #c8a165; margin-bottom: 12px;">${agent.name}</h2>
      <p style="color: #8899aa; margin-bottom: 8px;">${agent.title || ''}</p>
      <hr style="border-color: #2a3a5e; margin: 8px 0;">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 12px;">
        <div>年龄: <span style="color:#e0e0e0">${agent.age || '?'}</span></div>
        <div>性别: <span style="color:#e0e0e0">${agent.gender || '?'}</span></div>
        <div>位置: <span style="color:#e0e0e0">(${agent.position?.x || '?'}, ${agent.position?.y || '?'})</span></div>
        <div>状态: <span style="color:#e0e0e0">${agent.presence || 'idle'}</span></div>
      </div>
      <hr style="border-color: #2a3a5e; margin: 8px 0;">
      <p style="color: #c8a165; font-size: 12px; margin-bottom: 4px;">需求</p>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px;">
        <div>饥饿: ${this._bar(needs.hunger || 0, 100)}</div>
        <div>疲劳: ${this._bar(needs.fatigue || 0, 100)}</div>
        <div>社交: ${this._bar(needs.social || 0, 100)}</div>
      </div>
      <hr style="border-color: #2a3a5e; margin: 8px 0;">
      <p style="color: #c8a165; font-size: 12px; margin-bottom: 4px;">属性</p>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px;">
        <div>体力: ${this._bar(stats.strength || 50, 100)}</div>
        <div>智力: ${this._bar(stats.intelligence || 50, 100)}</div>
        <div>魅力: ${this._bar(stats.charisma || 50, 100)}</div>
        <div>财富: <span style="color:#e8c882">${agent.wealth || 0} 🪙</span></div>
      </div>
    `;

    modal.style.display = 'flex';
  }

  _bar(v, max) {
    const pct = Math.round((v / max) * 100);
    return `<span style="color:${pct > 70 ? '#e85353' : pct > 40 ? '#e8c882' : '#53e87a'}">${v}/${max}</span>`;
  }

  _updateUI() {
    if (!this.world) return;

    const w = this.world;
    const hour = String(w.hour || 0).padStart(2, '0');
    const min = String(w.minute || 0).padStart(2, '0');

    document.getElementById('time-display').textContent =
      `📅 Year ${w.year} ${w.season} day ${w.dayOfYear}  ${hour}:${min}`;

    const weatherIcons = { sunny: '☀️', cloudy: '☁️', rainy: '🌧️', snowy: '❄️', stormy: '⛈️' };
    document.getElementById('weather-display').textContent = weatherIcons[w.weather] || '☀️';

    document.getElementById('population-display').textContent =
      `👥 ${w.populationAlive || 0}/${w.populationTotal || 0}`;

    // Stats panel
    document.getElementById('stat-year').textContent = w.year;
    document.getElementById('stat-season').textContent = w.season;
    document.getElementById('stat-day').textContent = w.dayOfYear;
    document.getElementById('stat-pop').textContent = `${w.populationAlive || 0}`;

    // Agent list
    const listEl = document.getElementById('agent-list-items');
    const countEl = document.getElementById('agent-count');
    countEl.textContent = this.agents.length;

    listEl.innerHTML = this.agents.map(a => `
      <div class="agent-list-item" onclick="window.app._showAgentModal(window.app.agents.find(x => x.id === '${a.id}'))">
        <span class="status-dot status-${a.presence || 'idle'}"></span>
        <span class="agent-name">${a.name}</span>
        <span class="agent-needs">${a.needs ? Math.round(a.needs.hunger || 0) + '%' : ''}</span>
      </div>
    `).join('');

    // Update chronicle
    if (this.chronicles.length > 0) {
      const latest = this.chronicles[this.chronicles.length - 1];
      document.getElementById('chronicle-text').textContent = latest.content || '';
    }

    // Update activity (latest event)
    if (this.events.length > 0) {
      const latest = this.events[this.events.length - 1];
      const payload = latest.payload_json ? JSON.parse(latest.payload_json) : {};
      const action = payload.reason || latest.type || '';
      document.getElementById('activity-text').textContent = action;
    }

    // Follow agent
    if (this._followAgent) {
      const agent = this.agents.find(a => a.id === this._followAgent);
      if (agent) {
        const TILE = 32;
        this.camera.x = -(agent.position.x * TILE) + 400;
        this.camera.y = -(agent.position.y * TILE) + 300;
      }
    }
  }
}

window.GameApp = GameApp;
