// ==================== AUTH MODULE ====================

const Auth = {
  token: localStorage.getItem('screenwatch_token'),
  username: localStorage.getItem('screenwatch_user'),

  isLoggedIn() {
    return !!this.token;
  },

  setCredentials(token, username) {
    this.token = token;
    this.username = username;
    localStorage.setItem('screenwatch_token', token);
    localStorage.setItem('screenwatch_user', username);
  },

  logout() {
    this.token = null;
    this.username = null;
    localStorage.removeItem('screenwatch_token');
    localStorage.removeItem('screenwatch_user');
  },

  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.token}`
    };
  },

  async checkStatus() {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      return data.configured;
    } catch (err) {
      console.error('Erro ao verificar status:', err);
      return false;
    }
  },

  async setup(username, password) {
    const res = await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
  },

  async login(username, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    this.setCredentials(data.token, data.username);
    return data;
  },

  async validateToken() {
    if (!this.token) return false;
    try {
      const res = await fetch('/api/devices', {
        headers: this.getHeaders()
      });
      return res.ok;
    } catch {
      return false;
    }
  }
};

// ==================== AUTH UI ====================

(async function initAuth() {
  const authScreen = document.getElementById('auth-screen');
  const setupForm = document.getElementById('setup-form');
  const loginForm = document.getElementById('login-form');
  const dashboard = document.getElementById('dashboard');

  // Partículas de fundo
  createParticles();

  // Verifica se já está logado
  if (Auth.isLoggedIn()) {
    const valid = await Auth.validateToken();
    if (valid) {
      showDashboard();
      return;
    } else {
      Auth.logout();
    }
  }

  // Verifica se admin está configurado
  const configured = await Auth.checkStatus();
  if (configured) {
    loginForm.classList.remove('hidden');
  } else {
    setupForm.classList.remove('hidden');
  }

  // Setup form
  setupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('setup-error');
    const btn = document.getElementById('setup-btn');
    const username = document.getElementById('setup-username').value;
    const password = document.getElementById('setup-password').value;
    const confirm = document.getElementById('setup-password-confirm').value;

    errorEl.classList.add('hidden');

    if (password !== confirm) {
      errorEl.textContent = 'As senhas não coincidem';
      errorEl.classList.remove('hidden');
      return;
    }

    btn.disabled = true;
    btn.querySelector('span').textContent = 'Criando...';

    try {
      await Auth.setup(username, password);
      await Auth.login(username, password);
      showDashboard();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Criar Conta';
    }
  });

  // Login form
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    errorEl.classList.add('hidden');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Entrando...';

    try {
      await Auth.login(username, password);
      showDashboard();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Entrar';
    }
  });

  function showDashboard() {
    authScreen.classList.add('hidden');
    dashboard.classList.remove('hidden');
    if (typeof initApp === 'function') {
      initApp();
    }
  }
})();

// Partículas animadas
function createParticles() {
  const container = document.getElementById('particles');
  if (!container) return;

  for (let i = 0; i < 30; i++) {
    const particle = document.createElement('div');
    particle.classList.add('particle');
    particle.style.left = Math.random() * 100 + '%';
    particle.style.top = Math.random() * 100 + '%';
    particle.style.setProperty('--tx', (Math.random() - 0.5) * 300 + 'px');
    particle.style.setProperty('--ty', (Math.random() - 0.5) * 300 + 'px');
    particle.style.animationDuration = (Math.random() * 10 + 8) + 's';
    particle.style.animationDelay = Math.random() * 5 + 's';
    particle.style.width = (Math.random() * 3 + 2) + 'px';
    particle.style.height = particle.style.width;
    container.appendChild(particle);
  }
}
