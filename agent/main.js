const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const { io } = require('socket.io-client');
const screenshot = require('screenshot-desktop');
const { machineIdSync } = require('node-machine-id');
const os = require('os');
const path = require('path');
const fs = require('fs');

// ==================== CONFIGURAÇÃO ====================

const CONFIG_PATH = path.join(__dirname, 'config.json');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (e) {
    console.error('Erro ao carregar config:', e.message);
  }
  return {
    serverUrl: 'http://localhost:3000',
    captureInterval: 5000,
    quality: 60,
    maxWidth: 1280,
    showTray: false,
    autoStart: true
  };
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('Erro ao salvar config:', e.message);
  }
}

let config = loadConfig();

// ==================== INFORMAÇÕES DA MÁQUINA ====================

const MACHINE_ID = machineIdSync({ original: true });
const MACHINE_INFO = {
  machineId: MACHINE_ID,
  hostname: os.hostname(),
  platform: os.platform(),
  arch: os.arch(),
  username: os.userInfo().username
};

console.log('');
console.log('  ╔═══════════════════════════════════════════╗');
console.log('  ║   🖥️  ScreenWatch Agent v1.0              ║');
console.log('  ╠═══════════════════════════════════════════╣');
console.log(`  ║   ID:     ${MACHINE_ID.substring(0, 32).padEnd(30)}║`);
console.log(`  ║   Host:   ${MACHINE_INFO.hostname.substring(0, 30).padEnd(30)}║`);
console.log(`  ║   User:   ${MACHINE_INFO.username.substring(0, 30).padEnd(30)}║`);
console.log(`  ║   OS:     ${MACHINE_INFO.platform.padEnd(30)}║`);
console.log(`  ║   Server: ${config.serverUrl.substring(0, 30).padEnd(30)}║`);
console.log('  ╚═══════════════════════════════════════════╝');
console.log('');

// ==================== ELECTRON APP ====================

let tray = null;
let socket = null;
let captureTimer = null;
let isCapturing = false;

// Impede múltiplas instâncias
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('Outra instância já está em execução. Fechando...');
  app.quit();
}

// Esconde do dock (macOS)
if (process.platform === 'darwin') {
  app.dock.hide();
}

app.whenReady().then(() => {
  // Configurar auto-start
  if (config.autoStart) {
    setupAutoStart();
  }

  // Criar tray (se configurado)
  if (config.showTray) {
    createTray();
  }

  // Conectar ao servidor
  connectToServer();
});

// Impede que o app feche ao fechar todas as janelas
app.on('window-all-closed', (e) => {
  e.preventDefault();
});

// ==================== AUTO START ====================

function setupAutoStart() {
  try {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
      path: app.getPath('exe')
    });
    console.log('✅ Auto-start configurado');
  } catch (e) {
    console.error('⚠️  Não foi possível configurar auto-start:', e.message);
  }
}

// ==================== TRAY ====================

function createTray() {
  try {
    // Cria um ícone simples de 16x16
    const icon = nativeImage.createFromBuffer(
      Buffer.alloc(16 * 16 * 4, 0x80)
    ).resize({ width: 16, height: 16 });

    tray = new Tray(icon);
    tray.setToolTip('ScreenWatch Agent');

    const contextMenu = Menu.buildFromTemplate([
      { label: 'ScreenWatch Agent', enabled: false },
      { type: 'separator' },
      {
        label: 'Status: Conectando...',
        id: 'status',
        enabled: false
      },
      { type: 'separator' },
      {
        label: 'Pausar Captura',
        id: 'toggle',
        click: toggleCapture
      },
      { type: 'separator' },
      {
        label: 'Sair (requer senha)',
        click: () => {
          // Em produção, pediria senha do admin
          console.log('Tentativa de sair bloqueada');
        }
      }
    ]);

    tray.setContextMenu(contextMenu);
  } catch (e) {
    console.error('Erro ao criar tray:', e.message);
  }
}

function updateTrayStatus(status) {
  if (tray) {
    try {
      const menu = tray.getContextMenu && tray.getContextMenu();
      // O tray será atualizado na próxima criação do menu
      tray.setToolTip(`ScreenWatch Agent - ${status}`);
    } catch (e) {
      // Ignora erros de atualização do tray
    }
  }
}

// ==================== SOCKET CONNECTION ====================

function connectToServer() {
  console.log(`📡 Conectando a ${config.serverUrl}...`);

  socket = io(config.serverUrl + '/agent', {
    reconnection: true,
    reconnectionDelay: 3000,
    reconnectionDelayMax: 30000,
    reconnectionAttempts: Infinity,
    timeout: 10000
  });

  socket.on('connect', () => {
    console.log('✅ Conectado ao servidor!');
    updateTrayStatus('Conectado');

    // Registra o agente
    socket.emit('register', MACHINE_INFO);
  });

  socket.on('registered', (data) => {
    console.log('✅ Registrado:', data.message);

    // Atualiza config do servidor
    if (data.config) {
      config.captureInterval = data.config.captureInterval || config.captureInterval;
      config.quality = data.config.quality || config.quality;
      config.maxWidth = data.config.maxWidth || config.maxWidth;
    }

    // Inicia captura
    startCapture();
  });

  socket.on('blocked', (data) => {
    console.log('🚫 Dispositivo bloqueado:', data.message);
    updateTrayStatus('Bloqueado');
    stopCapture();
  });

  socket.on('request:screenshot', () => {
    // Servidor solicitou screenshot imediato
    captureAndSend();
  });

  socket.on('update:config', (newConfig) => {
    console.log('⚙️  Config atualizada:', newConfig);
    if (newConfig.captureInterval) config.captureInterval = newConfig.captureInterval;
    if (newConfig.quality) config.quality = newConfig.quality;
    if (newConfig.maxWidth) config.maxWidth = newConfig.maxWidth;
    saveConfig(config);

    // Reinicia captura com novo intervalo
    stopCapture();
    startCapture();
  });

  socket.on('disconnect', () => {
    console.log('⚠️  Desconectado do servidor');
    updateTrayStatus('Desconectado');
    stopCapture();
  });

  socket.on('connect_error', (err) => {
    console.log(`❌ Erro de conexão: ${err.message}`);
    updateTrayStatus('Erro de conexão');
  });

  // Heartbeat
  setInterval(() => {
    if (socket && socket.connected) {
      socket.emit('heartbeat');
    }
  }, 30000);
}

// ==================== CAPTURA DE TELA ====================

function startCapture() {
  if (captureTimer) return;

  console.log(`📸 Iniciando captura a cada ${config.captureInterval / 1000}s`);

  // Captura imediata
  captureAndSend();

  // Timer periódico
  captureTimer = setInterval(() => {
    captureAndSend();
  }, config.captureInterval);
}

function stopCapture() {
  if (captureTimer) {
    clearInterval(captureTimer);
    captureTimer = null;
  }
}

function toggleCapture() {
  if (captureTimer) {
    stopCapture();
    console.log('⏸️  Captura pausada');
  } else {
    startCapture();
    console.log('▶️  Captura retomada');
  }
}

async function captureAndSend() {
  if (isCapturing) return;
  isCapturing = true;

  try {
    // Captura screenshot como buffer
    const imgBuffer = await screenshot({ format: 'jpg' });

    // Converte para base64
    const base64 = 'data:image/jpeg;base64,' + imgBuffer.toString('base64');

    // Envia ao servidor
    if (socket && socket.connected) {
      socket.emit('screenshot', {
        image: base64,
        timestamp: new Date().toISOString()
      });
    }
  } catch (err) {
    console.error('❌ Erro na captura:', err.message);
  } finally {
    isCapturing = false;
  }
}

// ==================== GRACEFUL SHUTDOWN ====================

process.on('SIGINT', () => {
  console.log('Encerrando agente...');
  stopCapture();
  if (socket) socket.disconnect();
  app.quit();
});

process.on('uncaughtException', (err) => {
  console.error('Erro não tratado:', err);
  // Não encerra - mantém o agente rodando
});

process.on('unhandledRejection', (err) => {
  console.error('Promise rejeitada:', err);
  // Não encerra - mantém o agente rodando
});
