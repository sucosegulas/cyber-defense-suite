const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const AUTH_FILE = path.join(__dirname, 'data', 'admin.json');
const JWT_SECRET = process.env.JWT_SECRET || 'screenwatch_secret_key_change_in_production_' + Date.now();
const TOKEN_EXPIRY = '24h';

// Garante que o diretório data existe
function ensureDataDir() {
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// Carrega dados do admin
function loadAdmin() {
  ensureDataDir();
  if (fs.existsSync(AUTH_FILE)) {
    const data = fs.readFileSync(AUTH_FILE, 'utf-8');
    return JSON.parse(data);
  }
  return null;
}

// Salva dados do admin
function saveAdmin(adminData) {
  ensureDataDir();
  fs.writeFileSync(AUTH_FILE, JSON.stringify(adminData, null, 2));
}

// Verifica se o admin já foi configurado
function isAdminConfigured() {
  return loadAdmin() !== null;
}

// Cria o admin (primeiro acesso)
async function createAdmin(username, password) {
  if (isAdminConfigured()) {
    throw new Error('Admin já configurado');
  }
  const salt = await bcrypt.genSalt(12);
  const hash = await bcrypt.hash(password, salt);
  const adminData = {
    username,
    passwordHash: hash,
    createdAt: new Date().toISOString()
  };
  saveAdmin(adminData);
  return { username: adminData.username, createdAt: adminData.createdAt };
}

// Faz login do admin
async function loginAdmin(username, password) {
  const admin = loadAdmin();
  if (!admin) {
    throw new Error('Admin não configurado. Faça o setup inicial.');
  }
  if (admin.username !== username) {
    throw new Error('Credenciais inválidas');
  }
  const isValid = await bcrypt.compare(password, admin.passwordHash);
  if (!isValid) {
    throw new Error('Credenciais inválidas');
  }
  const token = jwt.sign(
    { username: admin.username, role: 'admin' },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
  return { token, username: admin.username };
}

// Middleware para verificar token JWT
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

// Verifica token do Socket.IO
function verifySocketToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

module.exports = {
  isAdminConfigured,
  createAdmin,
  loginAdmin,
  authMiddleware,
  verifySocketToken
};
