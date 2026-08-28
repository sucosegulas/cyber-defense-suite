const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const auth = require('./auth');
const devices = require('./devices');
const whatsapp = require('./whatsapp');

// Armazenamento de notificações em memória (últimas 500)
const notifications = [];
const MAX_NOTIFICATIONS = 500;

// Origens permitidas (CORS)
const ALLOWED_ORIGINS = [
  'https://whats.trailercarmotorhome.com',
  'https://screenwatch-server.fly.dev',
  'http://localhost:3000',
  'http://localhost:5173'
];

const corsOptions = {
  origin: (origin, callback) => {
    // Permite requisições sem origin (ex: Postman, agentes nativos)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origem não permitida: ${origin}`));
    }
  },
  credentials: true
};

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true
  },
  maxHttpBufferSize: 10 * 1024 * 1024, // 10MB para screenshots
  transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 3000;
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');

// Garante diretórios
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ==================== ROTAS API ====================

// Status do servidor
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    uptime: process.uptime(),
    adminConfigured: auth.isAdminConfigured(),
    stats: devices.getStats()
  });
});

// Verifica se admin está configurado
app.get('/api/auth/status', (req, res) => {
  res.json({ configured: auth.isAdminConfigured() });
});

// Setup inicial do admin
app.post('/api/auth/setup', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
    }
    const admin = await auth.createAdmin(username, password);
    res.json({ success: true, admin });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await auth.loginAdmin(username, password);
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// Listar dispositivos (protegido)
app.get('/api/devices', auth.authMiddleware, (req, res) => {
  const allDevices = devices.getAllDevices();
  res.json(allDevices);
});

// Detalhes de um dispositivo
app.get('/api/devices/:machineId', auth.authMiddleware, (req, res) => {
  const device = devices.getDevice(req.params.machineId);
  if (!device) {
    return res.status(404).json({ error: 'Dispositivo não encontrado' });
  }
  res.json(device);
});

// Renomear dispositivo
app.put('/api/devices/:machineId/rename', auth.authMiddleware, (req, res) => {
  const { name } = req.body;
  const device = devices.renameDevice(req.params.machineId, name);
  if (!device) {
    return res.status(404).json({ error: 'Dispositivo não encontrado' });
  }
  res.json(device);
});

// Mover dispositivo para grupo
app.put('/api/devices/:machineId/group', auth.authMiddleware, (req, res) => {
  const { groupId } = req.body;
  const device = devices.moveDeviceToGroup(req.params.machineId, groupId);
  if (!device) {
    return res.status(404).json({ error: 'Dispositivo ou grupo não encontrado' });
  }
  res.json(device);
});

// Bloquear/desbloquear dispositivo
app.put('/api/devices/:machineId/toggle-block', auth.authMiddleware, (req, res) => {
  const device = devices.toggleBlockDevice(req.params.machineId);
  if (!device) {
    return res.status(404).json({ error: 'Dispositivo não encontrado' });
  }
  res.json(device);
});

// Listar grupos
app.get('/api/groups', auth.authMiddleware, (req, res) => {
  res.json(devices.loadGroups());
});

// Criar grupo
app.post('/api/groups', auth.authMiddleware, (req, res) => {
  const { name, color } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Nome do grupo é obrigatório' });
  }
  const group = devices.createGroup(name, color || '#6366f1');
  res.json(group);
});

// Deletar grupo
app.delete('/api/groups/:groupId', auth.authMiddleware, (req, res) => {
  const success = devices.deleteGroup(req.params.groupId);
  if (!success) {
    return res.status(400).json({ error: 'Não é possível deletar o grupo padrão' });
  }
  res.json({ success: true });
});

// Estatísticas
app.get('/api/stats', auth.authMiddleware, (req, res) => {
  res.json(devices.getStats());
});

// Listar notificações capturadas
app.get('/api/notifications', auth.authMiddleware, (req, res) => {
  const { app: appFilter, machineId, limit } = req.query;
  let filtered = [...notifications];

  if (appFilter) {
    filtered = filtered.filter(n => n.appName.toLowerCase().includes(appFilter.toLowerCase()));
  }
  if (machineId) {
    filtered = filtered.filter(n => n.machineId === machineId);
  }

  const maxResults = Math.min(parseInt(limit) || 100, MAX_NOTIFICATIONS);
  res.json(filtered.slice(0, maxResults));
});

// Limpar notificações
app.delete('/api/notifications', auth.authMiddleware, (req, res) => {
  notifications.length = 0;
  res.json({ success: true });
});

// ==================== ROTAS WHATSAPP ====================

// Listar sessões WhatsApp
app.get('/api/whatsapp/sessions', auth.authMiddleware, (req, res) => {
  res.json(whatsapp.getAllSessions().map(s => ({
    ...s,
    qr: undefined // não retorna QR na listagem, só via Socket.IO
  })));
});

// Criar nova sessão WhatsApp
app.post('/api/whatsapp/sessions', auth.authMiddleware, async (req, res) => {
  try {
    const { label } = req.body;
    const { v4: uuidv4 } = require('uuid');
    const sessionId = uuidv4();
    await whatsapp.createSession(sessionId, label || 'Novo Número');
    res.json({ success: true, sessionId });
  } catch (err) {
    console.error('[API] Erro ao criar sessão WhatsApp:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Buscar sessão e QR atual
app.get('/api/whatsapp/sessions/:sessionId', auth.authMiddleware, (req, res) => {
  const session = whatsapp.getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });
  res.json(session);
});

// Remover sessão WhatsApp
app.delete('/api/whatsapp/sessions/:sessionId', auth.authMiddleware, (req, res) => {
  whatsapp.removeSession(req.params.sessionId);
  res.json({ success: true });
});

// Salvar configurações do Bot de Atendimento
app.put('/api/whatsapp/sessions/:sessionId/bot-config', auth.authMiddleware, (req, res) => {
  const success = whatsapp.updateBotConfig(req.params.sessionId, req.body);
  if (!success) return res.status(404).json({ error: 'Sessão não encontrada' });
  res.json({ success: true, botConfig: whatsapp.getSession(req.params.sessionId)?.botConfig });
});

// Buscar relatórios de analytics (Novos clientes, bot vs respostas humanas)
app.get('/api/reports/analytics', auth.authMiddleware, (req, res) => {
  res.json(whatsapp.getAnalyticsData());
});



// ==================== ROTAS DE DOWNLOAD ====================

const DOWNLOADS_DIR = path.join(__dirname, 'downloads');

if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

app.get('/api/downloads', (req, res) => {
  try {
    const files = fs.readdirSync(DOWNLOADS_DIR).map(file => {
      const stat = fs.statSync(path.join(DOWNLOADS_DIR, file));
      return {
        name: file,
        size: stat.size,
        modified: stat.mtime.toISOString(),
        url: `/downloads/${file}`
      };
    });
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/downloads', express.static(DOWNLOADS_DIR));

// ==================== SOCKET.IO ====================

// Namespace para agentes (dispositivos monitorados)
const agentNamespace = io.of('/agent');

agentNamespace.on('connection', (socket) => {
  console.log(`[AGENTE] Nova conexão: ${socket.id}`);

  let currentMachineId = null;

  // Registro do agente
  socket.on('register', (data) => {
    const { machineId, hostname, platform, arch, username } = data;

    if (!machineId) {
      socket.emit('error', { message: 'machineId é obrigatório' });
      return;
    }

    currentMachineId = machineId;

    // Registra e marca como online
    const device = devices.registerDevice(machineId, {
      hostname, platform, arch, username
    });

    // Verifica se está bloqueado
    if (device.blocked) {
      socket.emit('blocked', { message: 'Dispositivo bloqueado pelo administrador' });
      socket.disconnect();
      return;
    }

    devices.setDeviceOnline(machineId, socket.id);

    socket.emit('registered', {
      message: 'Registrado com sucesso',
      config: {
        captureInterval: 5000,
        quality: 60,
        maxWidth: 1280
      }
    });

    // Notifica o dashboard
    adminNamespace.emit('device:online', devices.getDevice(machineId));
    console.log(`[AGENTE] Registrado: ${hostname} (${machineId})`);
  });

  // Recebe screenshot
  socket.on('screenshot', async (data) => {
    if (!currentMachineId) return;

    const { image, timestamp } = data;

    try {
      // Comprime a imagem se necessário
      let processedImage = image;
      if (image && image.length > 200000) {
        // Se for base64, tenta comprimir
        try {
          const buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ''), 'base64');
          const compressed = await sharp(buffer)
            .resize(1280, null, { withoutEnlargement: true })
            .jpeg({ quality: 60 })
            .toBuffer();
          processedImage = 'data:image/jpeg;base64,' + compressed.toString('base64');
        } catch (e) {
          // Se falhar, usa a imagem original
          processedImage = image;
        }
      }

      // Atualiza em memória
      devices.updateScreenshot(currentMachineId, processedImage);

      // Envia para o dashboard em tempo real
      adminNamespace.emit('screenshot:update', {
        machineId: currentMachineId,
        image: processedImage,
        timestamp: timestamp || new Date().toISOString()
      });
    } catch (err) {
      console.error(`[AGENTE] Erro ao processar screenshot de ${currentMachineId}:`, err.message);
    }
  });

  // Recebe notificação de app de mensagens (Android)
  socket.on('notification', (data) => {
    if (!currentMachineId) return;

    const device = devices.getDevice(currentMachineId);
    const notifData = {
      ...data,
      machineId: currentMachineId,
      deviceName: device?.displayName || device?.hostname || 'Desconhecido',
      receivedAt: new Date().toISOString()
    };

    // Armazena (mantém últimas MAX_NOTIFICATIONS)
    notifications.unshift(notifData);
    if (notifications.length > MAX_NOTIFICATIONS) {
      notifications.pop();
    }

    // Envia ao dashboard em tempo real
    adminNamespace.emit('notification:new', notifData);
    console.log(`[NOTIF] ${notifData.deviceName} | ${data.appName} | ${data.sender}: ${data.message?.substring(0, 50)}`);
  });

  // Heartbeat
  socket.on('heartbeat', () => {
    if (currentMachineId) {
      adminNamespace.emit('device:heartbeat', {
        machineId: currentMachineId,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Desconexão
  socket.on('disconnect', () => {
    if (currentMachineId) {
      devices.setDeviceOffline(currentMachineId);
      adminNamespace.emit('device:offline', { machineId: currentMachineId });
      console.log(`[AGENTE] Desconectado: ${currentMachineId}`);
    }
  });
});

// Namespace para o dashboard admin
const adminNamespace = io.of('/admin');

adminNamespace.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('Autenticação necessária'));
  }
  const decoded = auth.verifySocketToken(token);
  if (!decoded) {
    return next(new Error('Token inválido'));
  }
  socket.user = decoded;
  next();
});

adminNamespace.on('connection', (socket) => {
  console.log(`[ADMIN] Dashboard conectado: ${socket.user.username}`);

  // Envia lista de dispositivos ao conectar
  socket.emit('devices:list', devices.getAllDevices());

  // Solicita screenshot de um dispositivo
  socket.on('request:screenshot', (machineId) => {
    const conn = devices.connectedDevices.get(machineId);
    if (conn) {
      const agentSocket = agentNamespace.sockets.get(conn.socketId);
      if (agentSocket) {
        agentSocket.emit('request:screenshot');
      }
    }
  });

  // Atualiza configuração de um agente
  socket.on('update:config', (data) => {
    const { machineId, config } = data;
    const conn = devices.connectedDevices.get(machineId);
    if (conn) {
      const agentSocket = agentNamespace.sockets.get(conn.socketId);
      if (agentSocket) {
        agentSocket.emit('update:config', config);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`[ADMIN] Dashboard desconectado: ${socket.user.username}`);
  });
});

// ==================== INICIAR SERVIDOR ====================

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ╔═══════════════════════════════════════════╗');
  console.log('  ║                                           ║');
  console.log('  ║   🖥️  ScreenWatch Server v1.0             ║');
  console.log('  ║                                           ║');
  console.log(`  ║   🌐 Dashboard: http://localhost:${PORT}      ║`);
  console.log('  ║   📡 Aguardando agentes...                ║');
  console.log('  ║   📱 WhatsApp Web: ATIVO                  ║');
  console.log('  ║                                           ║');
  console.log('  ╚═══════════════════════════════════════════╝');
  console.log('');

  if (!auth.isAdminConfigured()) {
    console.log('  ⚠️  Admin não configurado!');
    console.log(`  Acesse http://localhost:${PORT} para criar sua conta.`);
    console.log('');
  }

  // Inicializa módulo WhatsApp
  whatsapp.init(io, (notifData) => {
    notifications.unshift(notifData);
    if (notifications.length > MAX_NOTIFICATIONS) notifications.pop();
    adminNamespace.emit('notification:new', notifData);
  });
});

