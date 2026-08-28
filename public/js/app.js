// ==================== MAIN APP ====================

let socket = null;
let devicesData = [];
let messagesData = [];
let currentFilter = 'all';
let currentGroup = null;
let searchQuery = '';
let viewMode = 'grid';
let currentMsgAppFilter = 'all';
let currentTab = 'screens';
let unreadMessagesCount = 0;
let serverStartTime = Date.now();

// WhatsApp
let waSessions = [];
let waCurrentSessionId = null;
let waQrExpireTimer = null;

function initApp() {
  connectSocket();
  setupEventListeners();
  updateServerUrl();
  startUptimeTimer();
  loadNotifications();
  loadAnalyticsReports();
}

// ==================== SOCKET CONNECTION ====================

function connectSocket() {
  socket = io('/admin', {
    auth: { token: Auth.token }
  });

  socket.on('connect', () => {
    console.log('✅ Conectado ao servidor');
    showToast('Conectado', 'Conexão estabelecida com o servidor', 'success');
  });

  socket.on('connect_error', (err) => {
    console.error('❌ Erro de conexão:', err.message);
    if (err.message.includes('Autenticação') || err.message.includes('Token')) {
      Auth.logout();
      location.reload();
    }
  });

  socket.on('disconnect', () => {
    showToast('Desconectado', 'Conexão perdida. Reconectando...', 'warning');
  });

  // Recebe lista de dispositivos
  socket.on('devices:list', (devices) => {
    devicesData = devices;
    renderDevices();
    updateStats();
    loadGroups();
  });

  // Novo screenshot
  socket.on('screenshot:update', (data) => {
    const { machineId, image, timestamp } = data;
    const device = devicesData.find(d => d.machineId === machineId);
    if (device) {
      device.lastScreenshot = image;
      device.lastScreenshotTime = timestamp;
      updateDeviceCard(machineId, image, timestamp);
      updateFullscreenModal(machineId, image, timestamp);
    }
  });

  // Dispositivo ficou online
  socket.on('device:online', (device) => {
    const idx = devicesData.findIndex(d => d.machineId === device.machineId);
    if (idx >= 0) {
      devicesData[idx] = { ...devicesData[idx], ...device, online: true };
    } else {
      devicesData.push({ ...device, online: true });
    }
    renderDevices();
    updateStats();
    showToast('Dispositivo Online', `${device.displayName || device.hostname} conectou`, 'success');
  });

  // Dispositivo ficou offline
  socket.on('device:offline', (data) => {
    const device = devicesData.find(d => d.machineId === data.machineId);
    if (device) {
      device.online = false;
      device.lastScreenshot = null;
      renderDevices();
      updateStats();
      showToast('Dispositivo Offline', `${device.displayName || device.hostname} desconectou`, 'error');
    }
  });

  // Heartbeat
  socket.on('device:heartbeat', (data) => {
    const device = devicesData.find(d => d.machineId === data.machineId);
    if (device) {
      device.lastHeartbeat = data.timestamp;
    }
  });

  // Nova notificação recebida (do celular Android ou WhatsApp Web)
  socket.on('notification:new', (notification) => {
    handleIncomingNotification(notification);
    if (currentTab === 'reports') {
      loadAnalyticsReports();
    }
  });

  // Atualização em tempo real de relatórios (Analytics)
  socket.on('analytics:update', (data) => {
    if (currentTab === 'reports') {
      renderAnalytics(data);
    }
  });

  // Eventos WhatsApp
  socket.on('whatsapp:qr', ({ sessionId, qr, label }) => {
    updateSessionQR(sessionId, qr, label);
  });


  socket.on('whatsapp:connected', ({ sessionId, label, info }) => {
    updateSessionConnected(sessionId, label, info);
  });

  socket.on('whatsapp:disconnected', ({ sessionId, label }) => {
    updateSessionDisconnected(sessionId, label);
  });

  socket.on('whatsapp:removed', ({ sessionId }) => {
    waSessions = waSessions.filter(s => s.id !== sessionId);
    renderWaSessions();
  });
}

// ==================== EVENT LISTENERS ====================

function setupEventListeners() {
  // Busca
  document.getElementById('search-input').addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
    renderDevices();
  });

  // Filtros
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      currentGroup = null;
      document.querySelectorAll('.group-item').forEach(g => g.classList.remove('active'));
      renderDevices();
    });
  });

  // Visualização
  document.getElementById('grid-view-btn').addEventListener('click', () => {
    viewMode = 'grid';
    document.getElementById('grid-view-btn').classList.add('active');
    document.getElementById('list-view-btn').classList.remove('active');
    const grid = document.getElementById('devices-grid');
    grid.classList.remove('list-view');
  });

  document.getElementById('list-view-btn').addEventListener('click', () => {
    viewMode = 'list';
    document.getElementById('list-view-btn').classList.add('active');
    document.getElementById('grid-view-btn').classList.remove('active');
    const grid = document.getElementById('devices-grid');
    grid.classList.add('list-view');
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', () => {
    Auth.logout();
    if (socket) socket.disconnect();
    location.reload();
  });

  // Settings
  document.getElementById('settings-btn').addEventListener('click', () => {
    document.getElementById('settings-modal').classList.remove('hidden');
  });

  document.getElementById('settings-close-btn').addEventListener('click', () => {
    document.getElementById('settings-modal').classList.add('hidden');
  });

  document.getElementById('settings-save-btn').addEventListener('click', saveSettings);

  // Fullscreen modal
  document.getElementById('modal-close-btn').addEventListener('click', closeFullscreen);
  document.getElementById('fullscreen-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeFullscreen();
  });

  document.getElementById('modal-refresh-btn').addEventListener('click', () => {
    const machineId = document.getElementById('fullscreen-modal').dataset.machineId;
    if (machineId && socket) {
      socket.emit('request:screenshot', machineId);
    }
  });

  // Settings modal click outside
  document.getElementById('settings-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      document.getElementById('settings-modal').classList.add('hidden');
    }
  });

  // Group modal
  document.getElementById('add-group-btn').addEventListener('click', () => {
    document.getElementById('group-modal').classList.remove('hidden');
  });

  document.getElementById('group-close-btn').addEventListener('click', () => {
    document.getElementById('group-modal').classList.add('hidden');
  });

  document.getElementById('group-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      document.getElementById('group-modal').classList.add('hidden');
    }
  });

  // Color picker
  document.querySelectorAll('.color-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.color-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
    });
  });

  document.getElementById('group-save-btn').addEventListener('click', createGroup);

  // Navegação por abas
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      switchTab(btn.dataset.tab);
    });
  });

  // Filtros de mensagens
  document.querySelectorAll('.msg-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.msg-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMsgAppFilter = btn.dataset.app;
      renderMessages();
    });
  });

  // Limpar mensagens
  document.getElementById('clear-messages-btn').addEventListener('click', clearMessages);

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeFullscreen();
      document.getElementById('settings-modal').classList.add('hidden');
      document.getElementById('group-modal').classList.add('hidden');
      document.getElementById('wa-qr-modal').classList.add('hidden');
      document.getElementById('wa-label-modal').classList.add('hidden');
      document.getElementById('wa-bot-modal').classList.add('hidden');
    }
  });

  document.getElementById('wa-bot-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) document.getElementById('wa-bot-modal').classList.add('hidden');
  });


  // ==================== WHATSAPP EVENT LISTENERS ====================

  // Botão "Conectar Número"
  document.getElementById('wa-connect-btn').addEventListener('click', () => {
    const labelInput = document.getElementById('wa-label-input');
    if (labelInput) labelInput.value = '';
    document.getElementById('wa-label-modal').classList.remove('hidden');
  });

  // Fechar modal label
  document.getElementById('wa-label-close-btn').addEventListener('click', () => {
    document.getElementById('wa-label-modal').classList.add('hidden');
  });
  document.getElementById('wa-label-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) document.getElementById('wa-label-modal').classList.add('hidden');
  });

  // Confirmar label e gerar QR
  document.getElementById('wa-label-confirm-btn').addEventListener('click', startWaSession);
  document.getElementById('wa-label-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startWaSession();
  });

  // Fechar modal QR
  document.getElementById('wa-qr-close-btn').addEventListener('click', () => {
    document.getElementById('wa-qr-modal').classList.add('hidden');
  });
  document.getElementById('wa-qr-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) document.getElementById('wa-qr-modal').classList.add('hidden');
  });

  // Retry QR
  document.getElementById('wa-qr-retry-btn').addEventListener('click', () => {
    if (waCurrentSessionId) startWaSessionById(waCurrentSessionId);
  });
}

// ==================== RENDER DEVICES ====================

function renderDevices() {
  const grid = document.getElementById('devices-grid');
  const emptyState = document.getElementById('empty-state');

  let filtered = devicesData.filter(device => {
    // Filtro por status
    if (currentFilter === 'online' && !device.online) return false;
    if (currentFilter === 'offline' && device.online) return false;

    // Filtro por grupo
    if (currentGroup && device.group !== currentGroup) return false;

    // Busca
    if (searchQuery) {
      const search = searchQuery.toLowerCase();
      const name = (device.displayName || device.hostname || '').toLowerCase();
      const user = (device.username || '').toLowerCase();
      const platform = (device.platform || '').toLowerCase();
      return name.includes(search) || user.includes(search) || platform.includes(search);
    }

    return true;
  });

  // Ordena: online primeiro
  filtered.sort((a, b) => {
    if (a.online && !b.online) return -1;
    if (!a.online && b.online) return 1;
    return (a.displayName || a.hostname || '').localeCompare(b.displayName || b.hostname || '');
  });

  if (devicesData.length === 0) {
    emptyState.classList.remove('hidden');
    grid.classList.add('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  grid.classList.remove('hidden');

  grid.innerHTML = filtered.map((device, i) => createDeviceCard(device, i)).join('');

  // Adiciona event listeners aos cards
  grid.querySelectorAll('.device-card').forEach(card => {
    card.addEventListener('click', () => {
      const machineId = card.dataset.machineId;
      openFullscreen(machineId);
    });
  });
}

function createDeviceCard(device, index) {
  const platformIcon = getPlatformIcon(device.platform);
  const statusClass = device.online ? 'online' : 'offline';
  const statusText = device.online ? 'Online' : 'Offline';
  const timeText = device.lastScreenshotTime
    ? formatTime(device.lastScreenshotTime)
    : (device.lastSeen ? `Visto: ${formatTime(device.lastSeen)}` : '');

  const screenshotHtml = device.lastScreenshot
    ? `<img src="${device.lastScreenshot}" alt="Screenshot de ${device.displayName}" loading="lazy">`
    : `<div class="no-screenshot">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
        <span>${device.online ? 'Aguardando screenshot...' : 'Dispositivo offline'}</span>
      </div>`;

  return `
    <div class="device-card ${device.online ? '' : 'offline'}" data-machine-id="${device.machineId}" style="animation-delay: ${index * 50}ms">
      <div class="device-screenshot">
        ${screenshotHtml}
        <div class="screenshot-overlay">
          <div class="expand-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
          </div>
        </div>
        <div class="device-status-badge ${statusClass}">
          <span class="stat-dot ${statusClass}"></span>
          ${statusText}
        </div>
        ${device.groupName ? `<div class="device-group-badge"><span class="group-dot" style="background:${device.groupColor}"></span>${device.groupName}</div>` : ''}
      </div>
      <div class="device-info">
        <div class="device-name">${escapeHtml(device.displayName || device.hostname)}</div>
        <div class="device-meta">
          <span class="device-platform">${platformIcon} ${device.platform || 'Desconhecido'} · ${escapeHtml(device.username || '')}</span>
          <span class="device-time">${timeText}</span>
        </div>
      </div>
    </div>
  `;
}

function updateDeviceCard(machineId, image, timestamp) {
  const card = document.querySelector(`.device-card[data-machine-id="${machineId}"]`);
  if (!card) return;

  const screenshotContainer = card.querySelector('.device-screenshot');
  let img = screenshotContainer.querySelector('img');

  if (!img) {
    // Remove o "no-screenshot" placeholder
    const placeholder = screenshotContainer.querySelector('.no-screenshot');
    if (placeholder) placeholder.remove();

    img = document.createElement('img');
    img.alt = 'Screenshot';
    img.loading = 'lazy';
    screenshotContainer.insertBefore(img, screenshotContainer.firstChild);
  }

  img.src = image;

  // Atualiza timestamp
  const timeEl = card.querySelector('.device-time');
  if (timeEl) {
    timeEl.textContent = formatTime(timestamp);
  }
}

// ==================== FULLSCREEN MODAL ====================

function openFullscreen(machineId) {
  const device = devicesData.find(d => d.machineId === machineId);
  if (!device) return;

  const modal = document.getElementById('fullscreen-modal');
  modal.dataset.machineId = machineId;
  modal.classList.remove('hidden');

  document.getElementById('modal-device-name').textContent = device.displayName || device.hostname;
  document.getElementById('modal-device-meta').textContent = `${device.platform} · ${device.username || ''}`;

  const statusDot = document.getElementById('modal-status-dot');
  statusDot.className = `stat-dot ${device.online ? 'online' : 'offline'}`;

  const img = document.getElementById('modal-screenshot');
  if (device.lastScreenshot) {
    img.src = device.lastScreenshot;
    img.style.display = 'block';
  } else {
    img.style.display = 'none';
  }

  const timestamp = document.getElementById('modal-timestamp');
  timestamp.textContent = device.lastScreenshotTime ? formatTime(device.lastScreenshotTime) : '';

  // Solicita screenshot atualizado
  if (socket && device.online) {
    socket.emit('request:screenshot', machineId);
  }
}

function updateFullscreenModal(machineId, image, timestamp) {
  const modal = document.getElementById('fullscreen-modal');
  if (modal.classList.contains('hidden') || modal.dataset.machineId !== machineId) return;

  const img = document.getElementById('modal-screenshot');
  img.src = image;
  img.style.display = 'block';

  document.getElementById('modal-timestamp').textContent = formatTime(timestamp);
}

function closeFullscreen() {
  document.getElementById('fullscreen-modal').classList.add('hidden');
}

// ==================== GROUPS ====================

async function loadGroups() {
  try {
    const res = await fetch('/api/groups', { headers: Auth.getHeaders() });
    if (!res.ok) return;
    const groups = await res.json();
    renderGroups(groups);
  } catch (err) {
    console.error('Erro ao carregar grupos:', err);
  }
}

function renderGroups(groups) {
  const container = document.getElementById('groups-list');
  container.innerHTML = Object.entries(groups).map(([id, group]) => {
    const count = devicesData.filter(d => d.group === id).length;
    return `
      <div class="group-item ${currentGroup === id ? 'active' : ''}" data-group-id="${id}">
        <span class="group-dot" style="background: ${group.color}"></span>
        <span class="group-name">${escapeHtml(group.name)}</span>
        <span class="group-count">${count}</span>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.group-item').forEach(item => {
    item.addEventListener('click', () => {
      const groupId = item.dataset.groupId;

      if (currentGroup === groupId) {
        // Deselecionar
        currentGroup = null;
        item.classList.remove('active');
      } else {
        document.querySelectorAll('.group-item').forEach(g => g.classList.remove('active'));
        item.classList.add('active');
        currentGroup = groupId;
      }

      // Reset filter buttons
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      if (!currentGroup) {
        document.querySelector('.filter-btn[data-filter="all"]').classList.add('active');
        currentFilter = 'all';
      }

      renderDevices();
    });
  });
}

async function createGroup() {
  const name = document.getElementById('group-name').value.trim();
  const color = document.querySelector('.color-option.active')?.dataset.color || '#6366f1';

  if (!name) {
    showToast('Erro', 'Nome do grupo é obrigatório', 'error');
    return;
  }

  try {
    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: Auth.getHeaders(),
      body: JSON.stringify({ name, color })
    });

    if (!res.ok) throw new Error('Erro ao criar grupo');

    document.getElementById('group-modal').classList.add('hidden');
    document.getElementById('group-name').value = '';
    loadGroups();
    showToast('Grupo Criado', `"${name}" foi criado com sucesso`, 'success');
  } catch (err) {
    showToast('Erro', err.message, 'error');
  }
}

// ==================== SETTINGS ====================

function updateServerUrl() {
  const url = `${window.location.protocol}//${window.location.host}`;
  const el = document.getElementById('setting-server-url');
  if (el) el.textContent = url;
}

function saveSettings() {
  const interval = parseInt(document.getElementById('setting-interval').value) || 5;
  const quality = parseInt(document.getElementById('setting-quality').value) || 60;
  const maxWidth = parseInt(document.getElementById('setting-maxwidth').value) || 1280;

  // Envia para todos os agentes conectados
  devicesData.forEach(device => {
    if (device.online && socket) {
      socket.emit('update:config', {
        machineId: device.machineId,
        config: {
          captureInterval: interval * 1000,
          quality,
          maxWidth
        }
      });
    }
  });

  document.getElementById('settings-modal').classList.add('hidden');
  showToast('Configurações Salvas', 'As configurações foram atualizadas para todos os agentes', 'success');
}

// ==================== STATS ====================

function updateStats() {
  const online = devicesData.filter(d => d.online).length;
  const total = devicesData.length;
  const offline = total - online;

  document.getElementById('stat-online-count').textContent = online;
  document.getElementById('stat-total-count').textContent = total;
  document.getElementById('filter-all-count').textContent = total;
  document.getElementById('filter-online-count').textContent = online;
  document.getElementById('filter-offline-count').textContent = offline;
}

function startUptimeTimer() {
  setInterval(() => {
    const elapsed = Math.floor((Date.now() - serverStartTime) / 1000);
    const hours = Math.floor(elapsed / 3600).toString().padStart(2, '0');
    const mins = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0');
    const secs = (elapsed % 60).toString().padStart(2, '0');
    const el = document.getElementById('server-uptime');
    if (el) el.textContent = `${hours}:${mins}:${secs}`;
  }, 1000);
}

// ==================== TOAST NOTIFICATIONS ====================

function showToast(title, message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = {
    success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || icons.info}</div>
    <div class="toast-content">
      <div class="toast-title">${escapeHtml(title)}</div>
      <div class="toast-message">${escapeHtml(message)}</div>
    </div>
  `;

  container.appendChild(toast);

  // Auto remove
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 300ms ease-in';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ==================== TAB NAVIGATION & MESSAGES ====================

function switchTab(tab) {
  currentTab = tab;
  const screensView = document.getElementById('devices-grid');
  const messagesView = document.getElementById('messages-panel');
  const downloadsView = document.getElementById('downloads-panel');
  const whatsappView = document.getElementById('whatsapp-panel');
  const reportsView = document.getElementById('reports-panel');
  const sidebar = document.getElementById('sidebar');
  const emptyState = document.getElementById('empty-state');
  const searchBar = document.querySelector('.search-bar');
  const viewToggle = document.querySelector('.view-toggle');

  // Esconde tudo
  [screensView, messagesView, downloadsView, whatsappView, reportsView, emptyState].forEach(el => el && el.classList.add('hidden'));

  if (tab === 'screens') {
    sidebar.classList.remove('hidden');
    searchBar.classList.remove('hidden');
    if (viewToggle) viewToggle.classList.remove('hidden');
    document.querySelector('.main-content').style.marginLeft = 'var(--sidebar-width)';
    renderDevices();
  } else if (tab === 'downloads') {
    sidebar.classList.add('hidden');
    searchBar.classList.add('hidden');
    if (viewToggle) viewToggle.classList.add('hidden');
    if (downloadsView) downloadsView.classList.remove('hidden');
    document.querySelector('.main-content').style.marginLeft = '0';
    loadDownloads();
  } else if (tab === 'whatsapp') {
    sidebar.classList.add('hidden');
    searchBar.classList.add('hidden');
    if (viewToggle) viewToggle.classList.add('hidden');
    if (whatsappView) whatsappView.classList.remove('hidden');
    document.querySelector('.main-content').style.marginLeft = '0';
    loadWaSessions();
  } else if (tab === 'reports') {
    sidebar.classList.add('hidden');
    searchBar.classList.add('hidden');
    if (viewToggle) viewToggle.classList.add('hidden');
    if (reportsView) reportsView.classList.remove('hidden');
    document.querySelector('.main-content').style.marginLeft = '0';
    loadAnalyticsReports();
  } else {
    // messages
    sidebar.classList.add('hidden');
    searchBar.classList.add('hidden');
    if (viewToggle) viewToggle.classList.add('hidden');
    if (messagesView) messagesView.classList.remove('hidden');
    document.querySelector('.main-content').style.marginLeft = '0';
    unreadMessagesCount = 0;
    updateMessageBadge();
    renderMessages();
  }
}


async function loadDownloads() {
  try {
    const res = await fetch('/api/downloads');
    if (!res.ok) return;
    const files = await res.json();
    
    files.forEach(file => {
      if (file.name.toLowerCase().includes('windows') || file.name.toLowerCase().includes('win')) {
        const link = document.getElementById('download-win');
        if (link) {
          link.href = file.url;
          link.download = file.name;
          const sizeEl = document.getElementById('win-size');
          if (sizeEl) sizeEl.textContent = formatFileSize(file.size);
        }
      }
      if (file.name.toLowerCase().includes('android') || file.name.toLowerCase().includes('apk')) {
        const link = document.getElementById('download-android');
        if (link) {
          link.href = file.url;
          link.download = file.name;
          const sizeEl = document.getElementById('android-size');
          if (sizeEl) sizeEl.textContent = formatFileSize(file.size);
        }
      }
    });
  } catch (err) {
    console.error('Erro ao carregar downloads:', err);
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function loadNotifications() {
  try {
    const res = await fetch('/api/notifications', { headers: Auth.getHeaders() });
    if (!res.ok) return;
    messagesData = await res.json();
    if (currentTab === 'messages') {
      renderMessages();
    }
  } catch (err) {
    console.error('Erro ao carregar notificações:', err);
  }
}

function handleIncomingNotification(notification) {
  messagesData.unshift(notification);
  
  // Limita a 500 em memória no cliente
  if (messagesData.length > 500) {
    messagesData.pop();
  }

  // Notificação toast
  showToast(
    `${notification.appName} - ${notification.sender}`,
    notification.message,
    'info'
  );

  // Se não estiver na aba de mensagens, incrementa badge
  if (currentTab !== 'messages') {
    unreadMessagesCount++;
    updateMessageBadge();
  } else {
    renderMessages();
  }
}

function updateMessageBadge() {
  const badge = document.getElementById('msg-badge');
  if (!badge) return;

  if (unreadMessagesCount > 0) {
    badge.textContent = unreadMessagesCount;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function renderMessages() {
  const list = document.getElementById('messages-list');
  const empty = document.getElementById('messages-empty');
  
  if (!list) return;

  let filtered = messagesData.filter(msg => {
    if (currentMsgAppFilter === 'all') return true;
    return msg.appName.toLowerCase() === currentMsgAppFilter.toLowerCase();
  });

  if (filtered.length === 0) {
    // Mantém o empty state visível, mas remove cards antigos
    list.innerHTML = '';
    list.appendChild(empty);
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  
  // Garante que o empty state não seja deletado, mas também limpa os outros filhos
  list.innerHTML = '';
  list.appendChild(empty);
  
  filtered.forEach(msg => {
    const appClass = (msg.appName || '').toLowerCase().replace(/\s+/g, '-');
    const appEmoji = getAppEmoji(msg.appName);
    const dateText = formatTime(msg.timestamp || msg.receivedAt);
    
    const card = document.createElement('div');
    card.className = 'message-card';
    card.innerHTML = `
      <div class="message-app-icon ${appClass}">
        ${appEmoji}
      </div>
      <div class="message-content">
        <div class="message-top">
          <span class="message-sender">${escapeHtml(msg.sender)}</span>
          ${msg.group ? `<span class="message-group">${escapeHtml(msg.group)}</span>` : ''}
          <span class="message-app-name">${escapeHtml(msg.appName)}</span>
        </div>
        <div class="message-text">${escapeHtml(msg.message)}</div>
        <div class="message-bottom">
          <span class="message-device">📱 ${escapeHtml(msg.deviceName || 'Celular')}</span>
          <span class="message-time">${dateText}</span>
        </div>
      </div>
    `;
    list.appendChild(card);
  });
}

async function clearMessages() {
  if (!confirm('Deseja realmente apagar todas as mensagens monitoradas?')) return;

  try {
    const res = await fetch('/api/notifications', {
      method: 'DELETE',
      headers: Auth.getHeaders()
    });

    if (res.ok) {
      messagesData = [];
      renderMessages();
      showToast('Mensagens Apagadas', 'Histórico de mensagens limpo com sucesso', 'success');
    }
  } catch (err) {
    showToast('Erro', 'Não foi possível limpar as mensagens', 'error');
  }
}

function getAppEmoji(appName) {
  if (!appName) return '💬';
  const name = appName.toLowerCase();
  if (name.includes('whatsapp')) return '💬';
  if (name.includes('telegram')) return '✈️';
  if (name.includes('instagram')) return '📷';
  if (name.includes('sms')) return '📧';
  if (name.includes('messenger')) return '💬';
  if (name.includes('teams')) return '💼';
  if (name.includes('slack')) return '💬';
  if (name.includes('discord')) return '🎮';
  return '💬';
}

// ==================== HELPERS ====================

function getPlatformIcon(platform) {
  if (!platform) return '💻';
  platform = platform.toLowerCase();
  if (platform.includes('win')) return '🪟';
  if (platform.includes('darwin') || platform.includes('mac')) return '🍎';
  if (platform.includes('linux')) return '🐧';
  if (platform.includes('android')) return '📱';
  return '💻';
}

function formatTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);

  if (diff < 5) return 'Agora';
  if (diff < 60) return `${diff}s atrás`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;

  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ==================== WHATSAPP WEB ====================

async function loadWaSessions() {
  try {
    const res = await fetch('/api/whatsapp/sessions', { headers: Auth.getHeaders() });
    if (!res.ok) return;
    waSessions = await res.json();
    renderWaSessions();
    updateWaBadge();
  } catch (err) {
    console.error('Erro ao carregar sessões WhatsApp:', err);
  }
}

function renderWaSessions() {
  const grid = document.getElementById('wa-sessions-grid');
  const empty = document.getElementById('wa-empty');
  if (!grid) return;

  if (waSessions.length === 0) {
    grid.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }

  if (empty) empty.classList.add('hidden');

  grid.innerHTML = waSessions.map(session => createWaSessionCard(session)).join('');

  // Listeners dos cards
  grid.querySelectorAll('[data-wa-qr]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const sessionId = btn.dataset.waQr;
      openWaQrModal(sessionId);
    });
  });

  grid.querySelectorAll('[data-wa-bot]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const sessionId = btn.dataset.waBot;
      openWaBotModal(sessionId);
    });
  });

  grid.querySelectorAll('[data-wa-remove]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const sessionId = btn.dataset.waRemove;
      const session = waSessions.find(s => s.id === sessionId);
      if (!confirm(`Desconectar "${session?.label || 'este número'}"?`)) return;
      await removeWaSession(sessionId);
    });
  });
}

function createWaSessionCard(session) {
  const statusLabels = {
    connected: 'Conectado',
    qr_waiting: 'Aguardando Scan',
    connecting: 'Conectando...',
    disconnected: 'Desconectado'
  };
  const statusLabel = statusLabels[session.status] || session.status;
  const initial = (session.label || 'W').charAt(0).toUpperCase();
  const phone = session.info?.phone ? `+${session.info.phone}` : '';
  const botActive = session.botConfig?.enabled;

  const qrBtn = (session.status === 'qr_waiting')
    ? `<button class="wa-card-btn show-qr" data-wa-qr="${session.id}">
         <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M14 17h.01M17 14h.01"/></svg>
         Ver QR
       </button>`
    : '';

  const botBtn = `<button class="wa-card-btn ${botActive ? 'bot-active' : ''}" data-wa-bot="${session.id}" title="Configurar Bot de Atendimento">
         🤖 Bot ${botActive ? '(Ativo)' : ''}
       </button>`;

  return `
    <div class="wa-session-card ${session.status}">
      <div class="wa-card-top">
        <div class="wa-card-avatar">${initial}</div>
        <div class="wa-card-info">
          <div class="wa-card-label">${escapeHtml(session.label)}</div>
          <div class="wa-card-phone">${phone || 'Número não identificado'}</div>
        </div>
        <div class="wa-card-status ${session.status}">
          <div class="wa-status-dot"></div>
          ${statusLabel}
        </div>
      </div>
      <div class="wa-card-actions">
        ${botBtn}
        ${qrBtn}

        <button class="wa-card-btn danger" data-wa-remove="${session.id}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          Desconectar
        </button>
      </div>
    </div>
  `;
}

function updateWaBadge() {
  const badge = document.getElementById('wa-badge');
  if (!badge) return;
  const count = waSessions.filter(s => s.status === 'connected').length;
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

async function startWaSession() {
  const label = document.getElementById('wa-label-input').value.trim() || 'Novo Número';
  document.getElementById('wa-label-modal').classList.add('hidden');
  try {
    const res = await fetch('/api/whatsapp/sessions', {
      method: 'POST',
      headers: { ...Auth.getHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ label })
    });
    if (!res.ok) throw new Error('Erro ao criar sessão');
    const data = await res.json();
    waCurrentSessionId = data.sessionId;
    waSessions.push({ id: data.sessionId, label, status: 'connecting', info: null, qr: null });
    renderWaSessions();
    openWaQrModal(data.sessionId);
    showToast('WhatsApp', `Gerando QR Code para "${label}"...`, 'info');
  } catch (err) {
    showToast('Erro', 'Não foi possível criar a sessão WhatsApp', 'error');
  }
}

async function startWaSessionById(sessionId) {
  // Apenas reabre o modal do QR já existente
  openWaQrModal(sessionId);
}

function openWaQrModal(sessionId) {
  waCurrentSessionId = sessionId;
  const session = waSessions.find(s => s.id === sessionId);

  // Reseta modal
  document.getElementById('wa-qr-spinner').classList.remove('hidden');
  document.getElementById('wa-qr-image-wrap').classList.add('hidden');
  document.getElementById('wa-qr-success').classList.add('hidden');
  document.getElementById('wa-qr-refresh-overlay').classList.remove('visible');
  document.getElementById('wa-qr-modal-title').textContent = `Conectar: ${session?.label || 'WhatsApp'}`;

  // Se já tem QR, mostra imediatamente
  if (session?.qr) {
    showWaQr(session.qr);
  } else if (session?.status === 'connected') {
    showWaConnected(session.info?.phone);
  }

  document.getElementById('wa-qr-modal').classList.remove('hidden');

  // Timer de expiração do QR (60s)
  if (waQrExpireTimer) clearTimeout(waQrExpireTimer);
  waQrExpireTimer = setTimeout(() => {
    const overlay = document.getElementById('wa-qr-refresh-overlay');
    if (overlay && !document.getElementById('wa-qr-success').classList.contains('hidden') === false) {
      overlay.classList.add('visible');
    }
  }, 60000);
}

function showWaQr(qrBase64) {
  document.getElementById('wa-qr-spinner').classList.add('hidden');
  document.getElementById('wa-qr-success').classList.add('hidden');
  document.getElementById('wa-qr-refresh-overlay').classList.remove('visible');
  const wrap = document.getElementById('wa-qr-image-wrap');
  wrap.classList.remove('hidden');
  document.getElementById('wa-qr-img').src = qrBase64;
  if (waQrExpireTimer) clearTimeout(waQrExpireTimer);
  waQrExpireTimer = setTimeout(() => {
    document.getElementById('wa-qr-refresh-overlay').classList.add('visible');
  }, 55000);
}

function showWaConnected(phone) {
  if (waQrExpireTimer) clearTimeout(waQrExpireTimer);
  document.getElementById('wa-qr-spinner').classList.add('hidden');
  document.getElementById('wa-qr-image-wrap').classList.add('hidden');
  document.getElementById('wa-qr-refresh-overlay').classList.remove('visible');
  const success = document.getElementById('wa-qr-success');
  success.classList.remove('hidden');
  document.getElementById('wa-success-phone').textContent = phone ? `+${phone} conectado com sucesso!` : 'Conectado com sucesso!';
  setTimeout(() => {
    const modal = document.getElementById('wa-qr-modal');
    if (modal && !modal.classList.contains('hidden')) {
      modal.classList.add('hidden');
    }
  }, 3000);
}

function updateSessionQR(sessionId, qr, label) {
  const idx = waSessions.findIndex(s => s.id === sessionId);
  if (idx >= 0) {
    waSessions[idx].qr = qr;
    waSessions[idx].status = 'qr_waiting';
    waSessions[idx].label = label || waSessions[idx].label;
  }
  renderWaSessions();

  // Se o modal estiver aberto para essa sessão, atualiza o QR
  if (waCurrentSessionId === sessionId) {
    showWaQr(qr);
  }
}

function updateSessionConnected(sessionId, label, info) {
  const idx = waSessions.findIndex(s => s.id === sessionId);
  if (idx >= 0) {
    waSessions[idx].status = 'connected';
    waSessions[idx].qr = null;
    waSessions[idx].info = info;
    waSessions[idx].label = label || waSessions[idx].label;
  }
  renderWaSessions();
  updateWaBadge();
  showToast('📱 WhatsApp Conectado', `${label || 'Número'} conectado com sucesso!`, 'success');

  if (waCurrentSessionId === sessionId) {
    showWaConnected(info?.phone);
  }
}

function updateSessionDisconnected(sessionId, label) {
  const idx = waSessions.findIndex(s => s.id === sessionId);
  if (idx >= 0) {
    waSessions[idx].status = 'disconnected';
    waSessions[idx].qr = null;
  }
  renderWaSessions();
  updateWaBadge();
  showToast('WhatsApp Desconectado', `${label || 'Número'} foi desconectado`, 'warning');
}

// ==================== BOT DE ATENDIMENTO (FRONTEND) ====================

let waCurrentBotSessionId = null;

const BOT_PRESETS_FRONTEND = {
  vendas: {
    presetName: 'Vendas & Comercial',
    welcomeMsg: 'Olá! Seja bem-vindo(a) à Trailercar Motorhomes! 🚐\nQual é o seu nome?',
    menuMsg: 'Olá {nome}, como posso lhe ajudar no Setor Comercial?\n\n1. Locação\n2. Setor de Vendas\n\nPor favor, digite o número da opção desejada (1 ou 2).',
    option1Title: 'Locação',
    option1Msg: 'Para informações sobre Locação, acesse nosso site:\nhttps://trailercarmotorhome.com/locacao.html',
    option2Title: 'Setor de Vendas',
    option2Msg: 'Aguarde um momento que já iremos lhe atender! 😊\n\nEnquanto isso, visite nosso site https://trailercarmotorhome.com e conheça mais sobre a Trailercar!'
  },
  contabilidade: {
    presetName: 'Contabilidade & Financeiro',
    welcomeMsg: 'Olá! Seja bem-vindo(a) ao setor de Contabilidade e Financeiro da Trailercar! 📊\nQual é o seu nome?',
    menuMsg: 'Olá {nome}, como podemos lhe ajudar no Financeiro?\n\n1. 2ª Via de Boleto / Comprovante / NF\n2. Falar com Atendente Financeiro\n\nPor favor, digite o número da opção (1 ou 2).',
    option1Title: '2ª Via de Boleto / Comprovante',
    option1Msg: 'Para solicitações de 2ª via de boleto ou nota fiscal, por favor informe o seu CPF ou CNPJ por aqui.',
    option2Title: 'Falar com Financeiro',
    option2Msg: 'Aguarde um momento que a nossa equipe Financeira/Contábil já irá lhe atender! 😊'
  },
  tecnico: {
    presetName: 'Suporte Técnico & Manutenção',
    welcomeMsg: 'Olá! Seja bem-vindo(a) ao Suporte Técnico e Manutenção da Trailercar Motorhomes! 🔧\nQual é o seu nome?',
    menuMsg: 'Olá {nome}, como podemos ajudar com seu veículo/motorhome?\n\n1. Agendamento de Revisão / Manutenção\n2. Dúvidas Técnicas / Assistência\n\nPor favor, digite o número da opção (1 ou 2).',
    option1Title: 'Agendamento de Revisão / Manutenção',
    option1Msg: 'Para agendar revisões, manutenção ou reformas, acesse nosso site ou aguarde um especialista:\nhttps://trailercarmotorhome.com',
    option2Title: 'Dúvidas Técnicas',
    option2Msg: 'Por favor, descreva a sua dúvida técnica ou problema no veículo que a nossa equipe responderá em breve!'
  }
};

function openWaBotModal(sessionId) {
  waCurrentBotSessionId = sessionId;
  const session = waSessions.find(s => s.id === sessionId);
  if (!session) return;

  const botConfig = session.botConfig || {
    enabled: false,
    preset: 'vendas',
    ...BOT_PRESETS_FRONTEND.vendas
  };

  document.getElementById('wa-bot-modal-title').textContent = `Bot de Atendimento: ${session.label}`;
  document.getElementById('wa-bot-enabled').checked = !!botConfig.enabled;
  document.getElementById('wa-bot-preset').value = botConfig.preset || 'vendas';
  document.getElementById('wa-bot-welcome').value = botConfig.welcomeMsg || '';
  document.getElementById('wa-bot-menu').value = botConfig.menuMsg || '';
  document.getElementById('wa-bot-op1-title').value = botConfig.option1Title || 'Locação';
  document.getElementById('wa-bot-op1').value = botConfig.option1Msg || '';
  document.getElementById('wa-bot-op2-title').value = botConfig.option2Title || 'Vendas';
  document.getElementById('wa-bot-op2').value = botConfig.option2Msg || '';

  document.getElementById('wa-bot-modal').classList.remove('hidden');
}

function applyBotPreset(presetKey) {
  if (presetKey === 'custom') return;
  const preset = BOT_PRESETS_FRONTEND[presetKey];
  if (!preset) return;

  document.getElementById('wa-bot-welcome').value = preset.welcomeMsg;
  document.getElementById('wa-bot-menu').value = preset.menuMsg || '';
  document.getElementById('wa-bot-op1-title').value = preset.option1Title;
  document.getElementById('wa-bot-op1').value = preset.option1Msg;
  document.getElementById('wa-bot-op2-title').value = preset.option2Title;
  document.getElementById('wa-bot-op2').value = preset.option2Msg;
}

async function saveWaBotConfig() {
  if (!waCurrentBotSessionId) return;

  const enabled = document.getElementById('wa-bot-enabled').checked;
  const preset = document.getElementById('wa-bot-preset').value;
  const welcomeMsg = document.getElementById('wa-bot-welcome').value.trim();
  const menuMsg = document.getElementById('wa-bot-menu').value.trim();
  const option1Title = document.getElementById('wa-bot-op1-title').value.trim();
  const option1Msg = document.getElementById('wa-bot-op1').value.trim();
  const option2Title = document.getElementById('wa-bot-op2-title').value.trim();
  const option2Msg = document.getElementById('wa-bot-op2').value.trim();

  try {
    const res = await fetch(`/api/whatsapp/sessions/${waCurrentBotSessionId}/bot-config`, {
      method: 'PUT',
      headers: { ...Auth.getHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled, preset, welcomeMsg, menuMsg, option1Title, option1Msg, option2Title, option2Msg })
    });

    if (!res.ok) throw new Error('Erro ao salvar bot');

    const data = await res.json();
    const session = waSessions.find(s => s.id === waCurrentBotSessionId);
    if (session) {
      session.botConfig = data.botConfig;
    }

    renderWaSessions();
    document.getElementById('wa-bot-modal').classList.add('hidden');
    showToast('🤖 Bot de Atendimento', `Configurações ${enabled ? 'ativadas' : 'salvas'} com sucesso!`, 'success');
  } catch (err) {
    showToast('Erro', 'Não foi possível salvar as configurações do Bot', 'error');
  }
}

// Setup de event listeners do modal do Bot
document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('wa-bot-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      document.getElementById('wa-bot-modal').classList.add('hidden');
    });
  }
  const saveBtn = document.getElementById('wa-bot-save-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveWaBotConfig);
  }
  const presetSelect = document.getElementById('wa-bot-preset');
  if (presetSelect) {
    presetSelect.addEventListener('change', (e) => applyBotPreset(e.target.value));
  }
});



async function removeWaSession(sessionId) {
  try {
    await fetch(`/api/whatsapp/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: Auth.getHeaders()
    });
    waSessions = waSessions.filter(s => s.id !== sessionId);
    renderWaSessions();
    updateWaBadge();
    showToast('WhatsApp', 'Número desconectado', 'info');
  } catch (err) {
    showToast('Erro', 'Não foi possível desconectar', 'error');
  }
}


// ==================== RELATÓRIOS & ANALYTICS ====================

let chartPieInstance = null;
let chartLineInstance = null;

async function loadAnalyticsReports() {
  try {
    const res = await fetch('/api/reports/analytics', { headers: Auth.getHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    renderAnalytics(data);
  } catch (err) {
    console.error('Erro ao carregar relatórios:', err);
    showToast('Erro', 'Não foi possível carregar os dados de relatórios', 'error');
  }
}

function renderAnalytics(data) {
  if (!data) return;
  const totals = data.totals || { incoming: 0, newContacts: 0, botReplies: 0, humanReplies: 0 };
  const daily = data.daily || {};
  const sessions = data.sessions || [];

  // KPIs
  const elNew = document.getElementById('kpi-new-contacts');
  const elBot = document.getElementById('kpi-bot-replies');
  const elHuman = document.getElementById('kpi-human-replies');
  const elRate = document.getElementById('kpi-human-rate');

  if (elNew) elNew.textContent = totals.newContacts || 0;
  if (elBot) elBot.textContent = totals.botReplies || 0;
  if (elHuman) elHuman.textContent = totals.humanReplies || 0;

  const totalReplies = (totals.botReplies || 0) + (totals.humanReplies || 0);
  const humanRate = totalReplies > 0 ? Math.round(((totals.humanReplies || 0) / totalReplies) * 100) : 0;
  if (elRate) elRate.textContent = `${humanRate}%`;

  // Renderiza Tabela por Funcionário
  renderReportsTable(sessions);

  // Renderiza Gráficos (com delay para garantir que o DOM/canvas esteja visível)
  setTimeout(() => {
    try {
      renderPieChart(totals.botReplies || 0, totals.humanReplies || 0);
      renderLineChart(daily);
    } catch (e) {
      console.error('Erro ao renderizar gráficos Chart.js:', e);
    }
  }, 100);
}

function renderPieChart(botReplies, humanReplies) {
  const canvas = document.getElementById('chart-pie');
  if (!canvas || typeof Chart === 'undefined') return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (chartPieInstance) {
    try { chartPieInstance.destroy(); } catch (e) { }
  }

  chartPieInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Respostas Robô (Bot)', 'Atendimento Humano'],
      datasets: [{
        data: [botReplies, humanReplies],
        backgroundColor: ['#818cf8', '#22c55e'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#94a3b8', font: { family: 'Inter', size: 12 } }
        }
      }
    }
  });
}

function renderLineChart(dailyData) {
  const canvas = document.getElementById('chart-line');
  if (!canvas || typeof Chart === 'undefined') return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dates = Object.keys(dailyData || {}).sort();
  const botSeries = dates.map(d => dailyData[d].botReplies || 0);
  const humanSeries = dates.map(d => dailyData[d].humanReplies || 0);
  const newContactsSeries = dates.map(d => dailyData[d].newContacts || 0);

  if (chartLineInstance) {
    try { chartLineInstance.destroy(); } catch (e) { }
  }

  chartLineInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates.length > 0 ? dates : ['Hoje'],
      datasets: [
        {
          label: 'Novos Clientes',
          data: newContactsSeries.length > 0 ? newContactsSeries : [0],
          borderColor: '#60a5fa',
          backgroundColor: 'rgba(96, 165, 250, 0.1)',
          tension: 0.3
        },
        {
          label: 'Respostas Robô',
          data: botSeries.length > 0 ? botSeries : [0],
          borderColor: '#818cf8',
          backgroundColor: 'rgba(129, 140, 248, 0.1)',
          tension: 0.3
        },
        {
          label: 'Atendimento Humano',
          data: humanSeries.length > 0 ? humanSeries : [0],
          borderColor: '#4ade80',
          backgroundColor: 'rgba(74, 222, 128, 0.1)',
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#94a3b8', font: { family: 'Inter', size: 12 } }
        }
      },
      scales: {
        x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}


function renderReportsTable(sessions) {
  const tbody = document.getElementById('reports-table-body');
  if (!tbody) return;

  if (sessions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:20px">Nenhum número ou funcionário cadastrado</td></tr>`;
    return;
  }

  tbody.innerHTML = sessions.map(s => {
    const totalReplies = s.botReplies + s.humanReplies;
    const humanRate = totalReplies > 0 ? Math.round((s.humanReplies / totalReplies) * 100) : 0;
    const statusBadge = s.humanReplies > 0 
      ? `<span style="color:#4ade80; background:rgba(34,197,94,0.1); padding:2px 8px; border-radius:12px; font-size:0.75rem">👨‍💼 Ativo</span>`
      : `<span style="color:#f59e0b; background:rgba(245,158,11,0.1); padding:2px 8px; border-radius:12px; font-size:0.75rem">🤖 Apenas Bot</span>`;

    return `
      <tr>
        <td style="font-weight:600">📱 ${escapeHtml(s.label)} <span style="font-weight:400; color:var(--text-muted); font-size:0.8rem">(+${escapeHtml(s.phone)})</span></td>
        <td>${statusBadge}</td>
        <td>${s.newContacts || 0}</td>
        <td>${s.botReplies || 0}</td>
        <td style="font-weight:700; color:#4ade80">${s.humanReplies || 0}</td>
        <td>${humanRate}% das conversas</td>
      </tr>
    `;
  }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  const refreshBtn = document.getElementById('reports-refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadAnalyticsReports);
  }
});

