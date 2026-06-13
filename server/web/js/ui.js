// server/web/js/ui.js — UI 辅助功能
// 侧边栏交互、模态框、HUD 更新（主逻辑在 game.js）

// Camera controls are in game.js; this file provides supplementary UI logic

class UIHelper {
  constructor(app) {
    this.app = app;
  }

  // Format game time for display
  static formatTime(world) {
    if (!world) return '—';
    const h = String(world.hour || 0).padStart(2, '0');
    const m = String(world.minute || 0).padStart(2, '0');
    return `📅 Year ${world.year} ${world.season} day ${world.dayOfYear}  ${h}:${m}`;
  }

  // Get weather emoji
  static weatherIcon(weather) {
    const icons = { sunny: '☀️', cloudy: '☁️', rainy: '🌧️', snowy: '❄️', stormy: '⛈️' };
    return icons[weather] || '☀️';
  }

  // Status dot color class
  static statusClass(presence) {
    const map = { active: 'status-active', thinking: 'status-thinking', idle: 'status-idle', sleeping: 'status-sleeping' };
    return map[presence] || 'status-idle';
  }
}

window.UIHelper = UIHelper;
