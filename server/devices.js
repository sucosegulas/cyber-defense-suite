const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DEVICES_FILE = path.join(__dirname, 'data', 'devices.json');
const GROUPS_FILE = path.join(__dirname, 'data', 'groups.json');

// Estado em memória dos dispositivos conectados
const connectedDevices = new Map();

// Garante que o diretório data existe
function ensureDataDir() {
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// Carrega dispositivos registrados
function loadDevices() {
  ensureDataDir();
  if (fs.existsSync(DEVICES_FILE)) {
    const data = fs.readFileSync(DEVICES_FILE, 'utf-8');
    return JSON.parse(data);
  }
  return {};
}

// Salva dispositivos
function saveDevices(devices) {
  ensureDataDir();
  fs.writeFileSync(DEVICES_FILE, JSON.stringify(devices, null, 2));
}

// Carrega grupos
function loadGroups() {
  ensureDataDir();
  if (fs.existsSync(GROUPS_FILE)) {
    const data = fs.readFileSync(GROUPS_FILE, 'utf-8');
    return JSON.parse(data);
  }
  return {
    'default': { name: 'Geral', color: '#6366f1', devices: [] }
  };
}

// Salva grupos
function saveGroups(groups) {
  ensureDataDir();
  fs.writeFileSync(GROUPS_FILE, JSON.stringify(groups, null, 2));
}

// Registra ou atualiza um dispositivo
function registerDevice(machineId, info) {
  const devices = loadDevices();
  const existing = devices[machineId];

  devices[machineId] = {
    machineId,
    name: info.hostname || existing?.name || 'Dispositivo Desconhecido',
    platform: info.platform || existing?.platform || 'unknown',
    arch: info.arch || existing?.arch || 'unknown',
    hostname: info.hostname || existing?.hostname || 'unknown',
    username: info.username || existing?.username || 'unknown',
    group: existing?.group || 'default',
    registeredAt: existing?.registeredAt || new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    customName: existing?.customName || null,
    blocked: existing?.blocked || false
  };

  saveDevices(devices);
  return devices[machineId];
}

// Marca dispositivo como conectado
function setDeviceOnline(machineId, socketId) {
  connectedDevices.set(machineId, {
    socketId,
    connectedAt: new Date().toISOString(),
    lastScreenshot: null,
    lastScreenshotTime: null
  });
}

// Marca dispositivo como desconectado
function setDeviceOffline(machineId) {
  connectedDevices.delete(machineId);
  // Atualiza lastSeen
  const devices = loadDevices();
  if (devices[machineId]) {
    devices[machineId].lastSeen = new Date().toISOString();
    saveDevices(devices);
  }
}

// Atualiza o último screenshot
function updateScreenshot(machineId, screenshotData) {
  const conn = connectedDevices.get(machineId);
  if (conn) {
    conn.lastScreenshot = screenshotData;
    conn.lastScreenshotTime = new Date().toISOString();
  }
}

// Retorna todos os dispositivos com status
function getAllDevices() {
  const devices = loadDevices();
  const groups = loadGroups();
  const result = [];

  for (const [machineId, device] of Object.entries(devices)) {
    const conn = connectedDevices.get(machineId);
    const group = groups[device.group] || groups['default'];
    result.push({
      ...device,
      displayName: device.customName || device.hostname,
      online: !!conn,
      connectedAt: conn?.connectedAt || null,
      lastScreenshot: conn?.lastScreenshot || null,
      lastScreenshotTime: conn?.lastScreenshotTime || null,
      groupName: group?.name || 'Geral',
      groupColor: group?.color || '#6366f1'
    });
  }

  return result;
}

// Retorna um dispositivo específico
function getDevice(machineId) {
  const devices = loadDevices();
  const device = devices[machineId];
  if (!device) return null;

  const conn = connectedDevices.get(machineId);
  const groups = loadGroups();
  const group = groups[device.group] || groups['default'];

  return {
    ...device,
    displayName: device.customName || device.hostname,
    online: !!conn,
    connectedAt: conn?.connectedAt || null,
    lastScreenshot: conn?.lastScreenshot || null,
    lastScreenshotTime: conn?.lastScreenshotTime || null,
    groupName: group?.name || 'Geral',
    groupColor: group?.color || '#6366f1'
  };
}

// Renomeia um dispositivo
function renameDevice(machineId, newName) {
  const devices = loadDevices();
  if (devices[machineId]) {
    devices[machineId].customName = newName;
    saveDevices(devices);
    return devices[machineId];
  }
  return null;
}

// Move dispositivo para grupo
function moveDeviceToGroup(machineId, groupId) {
  const devices = loadDevices();
  const groups = loadGroups();
  if (devices[machineId] && groups[groupId]) {
    devices[machineId].group = groupId;
    saveDevices(devices);
    return devices[machineId];
  }
  return null;
}

// Bloqueia/desbloqueia dispositivo
function toggleBlockDevice(machineId) {
  const devices = loadDevices();
  if (devices[machineId]) {
    devices[machineId].blocked = !devices[machineId].blocked;
    saveDevices(devices);
    return devices[machineId];
  }
  return null;
}

// Cria um grupo
function createGroup(name, color) {
  const groups = loadGroups();
  const id = uuidv4().split('-')[0];
  groups[id] = { name, color, devices: [] };
  saveGroups(groups);
  return { id, ...groups[id] };
}

// Remove um grupo
function deleteGroup(groupId) {
  if (groupId === 'default') return false;
  const groups = loadGroups();
  const devices = loadDevices();

  // Move dispositivos do grupo deletado para 'default'
  for (const [machineId, device] of Object.entries(devices)) {
    if (device.group === groupId) {
      device.group = 'default';
    }
  }
  saveDevices(devices);

  delete groups[groupId];
  saveGroups(groups);
  return true;
}

// Retorna contagem de dispositivos
function getStats() {
  const devices = loadDevices();
  const total = Object.keys(devices).length;
  const online = connectedDevices.size;
  return { total, online, offline: total - online };
}

module.exports = {
  registerDevice,
  setDeviceOnline,
  setDeviceOffline,
  updateScreenshot,
  getAllDevices,
  getDevice,
  renameDevice,
  moveDeviceToGroup,
  toggleBlockDevice,
  createGroup,
  deleteGroup,
  loadGroups,
  getStats,
  connectedDevices
};
