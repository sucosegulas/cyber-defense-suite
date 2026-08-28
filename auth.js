const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const AUTH_FILE = path.join(__dirname, 'data', 'admin.json');
const JWT_SECRET = process.env.JWT_SECRET || 'screenwatch_secret_key_change_in_production_' + Date.now();
const TOKEN_EXPIRY = '24h';

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

// Garante que o diretório data existe
function ensureDataDir() {
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
    } catch (e) {}
  }
}

// Carrega dados do admin
function loadAdmin() {
  ensureDataDir();
  if (fs.existsSync(AUTH_FILE)) {
    try {
      const data = fs.readFileSync(AUTH_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      return null;
    }
  }
  return null;
}

// Salva dados do admin
function saveAdmin(adminData) {
  ensureDataDir();
  try {
    fs.writeFileSync(AUTH_FILE, JSON.stringify(adminData, null, 2));
  } catch (e) {}
}

// Verifica se o admin já foi configurado (Sempre true com fallback env)
function isAdminConfigured() {
  return true;
}

// Cria o admin
async function createAdmin(username, password) {
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
  // Verifica se bate com as credenciais padrão/env
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = jwt.sign(
      { username: ADMIN_USER, role: 'admin' },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );
    return { token, username: ADMIN_USER };
  }

  // Verifica se bate com o arquivo salvo
  const admin = loadAdmin();
  if (admin && admin.username === username) {
    const isValid = await bcrypt.compare(password, admin.passwordHash);
    if (isValid) {
      const token = jwt.sign(
        { username: admin.username, role: 'admin' },
        JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY }
      );
      return { token, username: admin.username };
    }
  }

  throw new Error('Credenciais inválidas. Usuário padrão: admin / admin123');
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
