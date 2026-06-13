// server/web/js/network.js — Socket.IO 客户端
// 处理与服务器的实时通信

class NetworkClient {
  constructor() {
    this.socket = io({
      transports: ['websocket', 'polling'],
      reconnectionDelay: 2000,
      reconnectionAttempts: Infinity,
    });
    this._handlers = {};
    this._connected = false;
    this._lastSnapshot = null;

    this.socket.on('connect', () => {
      console.log('[Network] Connected');
      this._connected = true;
      this._emit('connected', true);

      // Request initial snapshot
      this.socket.emit('world:snapshot:request');
    });

    this.socket.on('disconnect', () => {
      console.log('[Network] Disconnected');
      this._connected = false;
      this._emit('connected', false);
    });

    this.socket.on('server:hello', (data) => {
      console.log('[Network] Server hello:', data);
    });

    this.socket.on('world:snapshot', (data) => {
      console.log('[Network] Snapshot received:', data.world?.year || 'unknown');
      this._lastSnapshot = data;
      this._emit('snapshot', data);
    });

    this.socket.on('world:tick', (data) => {
      this._emit('tick', data);
    });

    this.socket.on('agent:delta', (data) => {
      this._emit('agentDelta', data);
    });
  }

  on(event, handler) {
    if (!this._handlers[event]) this._handlers[event] = [];
    this._handlers[event].push(handler);
    return this;
  }

  _emit(event, data) {
    const handlers = this._handlers[event] || [];
    for (const h of handlers) h(data);
  }

  requestSnapshot() {
    this.socket.emit('world:snapshot:request');
  }

  get connected() { return this._connected; }
  get lastSnapshot() { return this._lastSnapshot; }
}

window.NetworkClient = NetworkClient;
