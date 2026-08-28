const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const SESSIONS_DIR = path.join(__dirname, 'data', 'whatsapp-sessions');

if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

// Mapa de sessões ativas: { sessionId -> { socket, status, info, qr } }
const sessions = new Map();

let ioInstance = null;
let onMessageCallback = null;

function init(io, onMessage) {
  ioInstance = io;
  onMessageCallback = onMessage;
  restorePersistedSessions();
}

function emitToAdmin(event, data) {
  if (ioInstance) {
    ioInstance.of('/admin').emit(event, data);
  }
}

function persistSessionMeta(sessionId, meta) {
  const metaFile = path.join(SESSIONS_DIR, sessionId, 'meta.json');
  try { fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2)); } catch (e) { }
}

function loadSessionMeta(sessionId) {
  const metaFile = path.join(SESSIONS_DIR, sessionId, 'meta.json');
  try {
    if (fs.existsSync(metaFile)) return JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
  } catch (e) { }
  return null;
}

async function restorePersistedSessions() {
  try {
    if (!fs.existsSync(SESSIONS_DIR)) return;
    const dirs = fs.readdirSync(SESSIONS_DIR).filter(f =>
      fs.statSync(path.join(SESSIONS_DIR, f)).isDirectory()
    );
    for (const sessionId of dirs) {
      const meta = loadSessionMeta(sessionId);
      if (meta) {
        console.log(`[WHATSAPP] Restaurando sessão: ${sessionId} (${meta.label || 'sem nome'})`);
        await createSession(sessionId, meta.label || 'Número Desconhecido');
      }
    }
  } catch (e) {
    console.error('[WHATSAPP] Erro ao restaurar sessões:', e.message);
  }
}

async function createSession(sessionId, label) {
  if (!sessionId) sessionId = uuidv4();

  const sessionDir = path.join(SESSIONS_DIR, sessionId);
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const meta = loadSessionMeta(sessionId);
  const sessionData = {
    id: sessionId,
    label: label || meta?.label || 'Número Desconhecido',
    status: 'connecting',
    qr: null,
    info: meta?.info || null,
    botConfig: meta?.botConfig || DEFAULT_BOT_CONFIG,
    socket: null,
    createdAt: meta?.createdAt || new Date().toISOString()
  };

  sessions.set(sessionId, sessionData);


  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: ['ScreenWatch', 'Chrome', '120.0.0'],
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
  });

  sessionData.socket = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        const qrBase64 = await QRCode.toDataURL(qr, {
          errorCorrectionLevel: 'M',
          type: 'image/png',
          quality: 0.92,
          margin: 2,
          color: { dark: '#000000', light: '#FFFFFF' },
          width: 280
        });
        sessionData.qr = qrBase64;
        sessionData.status = 'qr_waiting';
        emitToAdmin('whatsapp:qr', { sessionId, qr: qrBase64, label: sessionData.label });
        console.log(`[WHATSAPP] QR gerado para sessão: ${sessionId}`);
      } catch (e) {
        console.error('[WHATSAPP] Erro ao gerar QR:', e.message);
      }
    }

    if (connection === 'open') {
      sessionData.status = 'connected';
      sessionData.qr = null;
      const phoneInfo = sock.user;
      sessionData.info = {
        jid: phoneInfo?.id || '',
        name: phoneInfo?.name || label,
        phone: phoneInfo?.id?.split('@')[0]?.split(':')[0] || ''
      };
      persistSessionMeta(sessionId, {
        label: sessionData.label,
        info: sessionData.info,
        botConfig: sessionData.botConfig,
        createdAt: sessionData.createdAt
      });
      emitToAdmin('whatsapp:connected', { sessionId, label: sessionData.label, info: sessionData.info });
      console.log(`[WHATSAPP] Conectado: ${sessionData.info.phone} (${sessionData.label})`);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      
      console.log(`[WHATSAPP] Conexão encerrada para ${sessionData.label}: status ${statusCode}, tentando reconectar = ${!isLoggedOut}`);

      if (!isLoggedOut) {
        sessionData.status = 'connecting';
        emitToAdmin('whatsapp:connecting', { sessionId, label: sessionData.label });
        setTimeout(() => {
          if (sessions.has(sessionId)) {
            const meta = loadSessionMeta(sessionId);
            createSession(sessionId, meta?.label || sessionData.label);
          }
        }, 3000);
      } else {
        sessionData.status = 'disconnected';
        emitToAdmin('whatsapp:disconnected', { sessionId, label: sessionData.label });
      }
    }
  });


  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        const session = sessions.get(sessionId);
        if (!session || session.status !== 'connected') continue;

        const isGroup = msg.key.remoteJid?.endsWith('@g.us');
        const remoteJid = msg.key.remoteJid;

        // Se for mensagem enviada (fromMe = true)
        if (msg.key.fromMe) {
          // Se não foi marcada como mensagem de bot, conta como resposta humana
          if (!msg.isBotMessage && !isGroup) {
            recordAnalytics(sessionId, remoteJid, 'human');
            console.log(`[ANALYTICS] ${session.label}: Mensagem humana registrada para ${remoteJid}`);
          }
          continue;
        }

        // Mensagem recebida de cliente
        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          msg.message?.videoMessage?.caption ||
          msg.message?.documentMessage?.caption ||
          msg.message?.buttonsResponseMessage?.selectedDisplayText ||
          '[Mídia]';

        let sender = '';
        let group = null;

        if (isGroup) {
          sender = msg.pushName || msg.key.participant?.split('@')[0] || 'Desconhecido';
          group = msg.key.remoteJid?.split('@')[0] || 'Grupo';
        } else {
          sender = msg.pushName || msg.key.remoteJid?.split('@')[0]?.split(':')[0] || 'Desconhecido';
          // Registra entrada de cliente e checa se é novo contato
          recordAnalytics(sessionId, remoteJid, 'incoming');
        }

        const notifData = {
          appName: 'WhatsApp',
          packageName: 'com.whatsapp',
          sender,
          group: isGroup ? group : null,
          message: text,
          timestamp: new Date(msg.messageTimestamp * 1000).toISOString(),
          notificationId: Math.floor(Math.random() * 99999),
          machineId: `wa-${sessionId}`,
          deviceName: session.label || session.info?.phone || 'WhatsApp',
          source: 'whatsapp_web',
          sessionId,
          phone: session.info?.phone || ''
        };

        if (onMessageCallback) onMessageCallback(notifData);
        console.log(`[WHATSAPP] ${notifData.deviceName} | ${sender}: ${text.substring(0, 60)}`);

        // ==================== BOT DE ATENDIMENTO AUTOMÁTICO ====================
        const isNewsletter = remoteJid && remoteJid.endsWith('@newsletter');
        const isStatus = remoteJid === 'status@broadcast';
        const isIndividualClient = remoteJid && !isGroup && !isNewsletter && !isStatus;

        if (isIndividualClient && session.botConfig?.enabled) {
          await processBotFlow(sessionId, sock, remoteJid, text, sender, session);
        }


      } catch (e) {
        console.error('[WHATSAPP] Erro ao processar mensagem:', e.message);
      }
    }
  });

  return sessionId;
}

// ==================== METRICAS E ANALYTICS ====================

const ANALYTICS_FILE = path.join(__dirname, 'data', 'analytics.json');

function loadAnalytics() {
  try {
    if (fs.existsSync(ANALYTICS_FILE)) {
      return JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf-8'));
    }
  } catch (e) { }
  return {
    totals: { incoming: 0, newContacts: 0, botReplies: 0, humanReplies: 0 },
    contacts: {},
    daily: {},
    sessionStats: {}
  };
}

function saveAnalytics(data) {
  try {
    fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(data, null, 2));
  } catch (e) { }
}

function recordAnalytics(sessionId, remoteJid, type) {
  const analytics = loadAnalytics();
  const dateKey = new Date().toISOString().split('T')[0];

  if (!analytics.daily[dateKey]) {
    analytics.daily[dateKey] = { incoming: 0, newContacts: 0, botReplies: 0, humanReplies: 0 };
  }
  if (!analytics.sessionStats[sessionId]) {
    analytics.sessionStats[sessionId] = { incoming: 0, newContacts: 0, botReplies: 0, humanReplies: 0 };
  }

  if (type === 'incoming') {
    analytics.totals.incoming++;
    analytics.daily[dateKey].incoming++;
    analytics.sessionStats[sessionId].incoming++;

    if (!analytics.contacts[remoteJid]) {
      analytics.contacts[remoteJid] = { firstSeen: new Date().toISOString(), sessionId };
      analytics.totals.newContacts++;
      analytics.daily[dateKey].newContacts++;
      analytics.sessionStats[sessionId].newContacts++;
    }
  } else if (type === 'bot') {
    analytics.totals.botReplies++;
    analytics.daily[dateKey].botReplies++;
    analytics.sessionStats[sessionId].botReplies++;
  } else if (type === 'human') {
    analytics.totals.humanReplies++;
    analytics.daily[dateKey].humanReplies++;
    analytics.sessionStats[sessionId].humanReplies++;
  }

  saveAnalytics(analytics);
  emitToAdmin('analytics:update', getAnalyticsData());
}



// Presets de Bot por Setor
const BOT_PRESETS = {
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

const DEFAULT_BOT_CONFIG = {
  enabled: false,
  preset: 'vendas',
  ...BOT_PRESETS.vendas
};

function loadBotStates(sessionId) {
  const file = path.join(SESSIONS_DIR, sessionId, 'bot-states.json');
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) { }
  return {};
}

function saveBotStates(sessionId, states) {
  const file = path.join(SESSIONS_DIR, sessionId, 'bot-states.json');
  try { fs.writeFileSync(file, JSON.stringify(states, null, 2)); } catch (e) { }
}

async function sendBotMessage(sock, remoteJid, options, sessionId) {
  recordAnalytics(sessionId, remoteJid, 'bot');
  return await sock.sendMessage(remoteJid, options);
}


async function processBotFlow(sessionId, sock, remoteJid, text, pushName, session) {
  try {
    const states = loadBotStates(sessionId);
    let userState = states[remoteJid] || { state: 'IDLE', name: '', updatedAt: new Date().toISOString() };
    const botConfig = session.botConfig || DEFAULT_BOT_CONFIG;
    const cleanText = text.trim();

    // Se o cliente digitar #menu ou #inicio, reseta o estado
    if (cleanText.toLowerCase() === '#menu' || cleanText.toLowerCase() === '#inicio') {
      userState.state = 'IDLE';
    }

    if (userState.state === 'IDLE') {
      // ETAPA 1: Envia boas-vindas e pede o nome
      const welcomeText = botConfig.welcomeMsg || DEFAULT_BOT_CONFIG.welcomeMsg;
      await sendBotMessage(sock, remoteJid, { text: welcomeText }, sessionId);
      
      userState.state = 'WAITING_NAME';
      userState.updatedAt = new Date().toISOString();
      states[remoteJid] = userState;
      saveBotStates(sessionId, states);
      console.log(`[BOT] ${session.label} (${botConfig.preset}) -> ${remoteJid}: Boas-vindas enviada (Etapa 1)`);
    } 
    else if (userState.state === 'WAITING_NAME') {
      // ETAPA 2: Recebe o nome e envia o menu de opções do setor
      let name = cleanText.replace(/^(oi|olá|ola|sou|meu nome é|eu sou|me chamo)\s+/i, '').trim();
      if (!name || name.length > 40) name = pushName || 'Cliente';
      
      userState.name = name;
      userState.state = 'WAITING_OPTION';
      userState.updatedAt = new Date().toISOString();
      states[remoteJid] = userState;
      saveBotStates(sessionId, states);

      let menuTemplate = botConfig.menuMsg;
      if (!menuTemplate) {
        menuTemplate = `Olá {nome}, como posso lhe ajudar?\n\n1. ${botConfig.option1Title || 'Opção 1'}\n2. ${botConfig.option2Title || 'Opção 2'}\n\nPor favor, digite o número da opção desejada (1 ou 2).`;
      }
      const menuText = menuTemplate.replace('{nome}', name);

      await sendBotMessage(sock, remoteJid, { text: menuText }, sessionId);
      console.log(`[BOT] ${session.label} (${botConfig.preset}) -> ${remoteJid}: Menu enviado para ${name} (Etapa 2)`);
    } 
    else if (userState.state === 'WAITING_OPTION') {
      // ETAPA 3: Processa a escolha do cliente
      const isOption1 = cleanText.includes('1') || (botConfig.option1Title && cleanText.toLowerCase().includes(botConfig.option1Title.toLowerCase().split(' ')[0]));
      const isOption2 = cleanText.includes('2') || (botConfig.option2Title && cleanText.toLowerCase().includes(botConfig.option2Title.toLowerCase().split(' ')[0]));

      if (isOption1) {
        const reply1 = botConfig.option1Msg || DEFAULT_BOT_CONFIG.option1Msg;
        await sendBotMessage(sock, remoteJid, { text: reply1 }, sessionId);
        userState.state = 'COMPLETED';
        userState.updatedAt = new Date().toISOString();
        states[remoteJid] = userState;
        saveBotStates(sessionId, states);
        console.log(`[BOT] ${session.label} -> ${remoteJid}: Opção 1 enviada`);
      } 
      else if (isOption2) {
        const reply2 = botConfig.option2Msg || DEFAULT_BOT_CONFIG.option2Msg;
        await sendBotMessage(sock, remoteJid, { text: reply2 }, sessionId);
        userState.state = 'COMPLETED';
        userState.updatedAt = new Date().toISOString();
        states[remoteJid] = userState;
        saveBotStates(sessionId, states);
        console.log(`[BOT] ${session.label} -> ${remoteJid}: Opção 2 enviada`);
      } 
      else {
        // Opção inválida
        const retryMsg = `Por favor, digite 1 para ${botConfig.option1Title || 'Opção 1'} ou 2 para ${botConfig.option2Title || 'Opção 2'}.`;
        await sendBotMessage(sock, remoteJid, { text: retryMsg }, sessionId);
      }
    }
  } catch (e) {
    console.error(`[BOT] Erro no fluxo do bot para ${remoteJid}:`, e.message);
  }
}

function updateBotConfig(sessionId, newConfig) {
  const session = sessions.get(sessionId);
  if (!session) return false;

  const currentMeta = loadSessionMeta(sessionId) || {};
  session.botConfig = {
    ...DEFAULT_BOT_CONFIG,
    ...session.botConfig,
    ...newConfig
  };

  persistSessionMeta(sessionId, {
    ...currentMeta,
    botConfig: session.botConfig
  });

  return true;
}

function removeSession(sessionId) {
  const session = sessions.get(sessionId);
  if (session?.socket) {
    try { session.socket.end(); } catch (e) { }
  }
  sessions.delete(sessionId);
  const sessionDir = path.join(SESSIONS_DIR, sessionId);
  try {
    if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });
  } catch (e) { console.error('[WHATSAPP] Erro ao remover sessão:', e.message); }
  emitToAdmin('whatsapp:removed', { sessionId });
  console.log(`[WHATSAPP] Sessão removida: ${sessionId}`);
}

function getAllSessions() {
  const result = [];
  for (const [id, s] of sessions.entries()) {
    const meta = loadSessionMeta(id);
    const botConfig = s.botConfig || meta?.botConfig || DEFAULT_BOT_CONFIG;
    result.push({ id, label: s.label, status: s.status, info: s.info, qr: s.qr, createdAt: s.createdAt, botConfig });
  }
  return result;
}

function getSession(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return null;
  const meta = loadSessionMeta(sessionId);
  const botConfig = s.botConfig || meta?.botConfig || DEFAULT_BOT_CONFIG;
  return { id: sessionId, label: s.label, status: s.status, info: s.info, qr: s.qr, createdAt: s.createdAt, botConfig };
}

function getAnalyticsData() {
  const data = loadAnalytics();
  const sessionList = getAllSessions();

  const sessionIds = new Set([
    ...sessionList.map(s => s.id),
    ...Object.keys(data.sessionStats || {})
  ]);

  const sessionSummary = Array.from(sessionIds).map(id => {
    const s = sessionList.find(x => x.id === id);
    const meta = loadSessionMeta(id);
    const stats = (data.sessionStats && data.sessionStats[id]) || { incoming: 0, newContacts: 0, botReplies: 0, humanReplies: 0 };
    return {
      sessionId: id,
      label: s?.label || meta?.label || 'Número Cadastrado',
      phone: s?.info?.phone || meta?.info?.phone || 'N/A',
      status: s?.status || 'disconnected',
      ...stats
    };
  });

  return {
    totals: data.totals || { incoming: 0, newContacts: 0, botReplies: 0, humanReplies: 0 },
    daily: data.daily || {},
    sessions: sessionSummary
  };
}


module.exports = { init, createSession, removeSession, getAllSessions, getSession, updateBotConfig, getAnalyticsData, DEFAULT_BOT_CONFIG, BOT_PRESETS };



