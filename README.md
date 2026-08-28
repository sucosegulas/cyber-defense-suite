# 🛡️ Cyber Defense Suite

**Suite completa de segurança de redes e educação em cibersegurança**

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110.0-009688.svg)

![Cyber Defense Suite](https://via.placeholder.com/800x400/0a0f1d/06b6d4?text=CYBER+DEFENSE+SUITE)

## 📋 Visão Geral

O **Cyber Defense Suite** é uma ferramenta open source que combina:

- 🔍 **Scanner de Rede** - Scan de portas TCP e descoberta de dispositivos
- 🔐 **Auditoria de Senhas** - Teste de força bruta e políticas de senha
- 📊 **Conformidade NIST CSF** - Framework de segurança corporativa
- 🐛 **Base de Vulnerabilidades** - Catálogo de CVEs e remediações
- 📚 **Guia para Leigos** - Educação sobre portas e ataques
- 📶 **Educação WiFi** - Teste de senhas, criptografia e prevenção

## 🎯 Funcionalidades

### 1. Scanner de Rede
```bash
# Scan de portas TCP real
POST /api/scan
{
  "target": "192.168.1.1"
}

# Resposta:
{
  "target": "192.168.1.1",
  "scan_time": "2026-08-28 15:30:00",
  "open_ports": [
    {"port": 22, "service": "ssh", "state": "open"},
    {"port": 80, "service": "http", "state": "open"}
  ],
  "risk_score": "Médio"
}
```

### 2. Auditoria de Senhas
- Teste de força bruta simulado
- Verificação de políticas de senha
- Relatório de credenciais fracas

### 3. Conformidade NIST CSF 2.0
- Govern, Identify, Protect, Detect, Respond, Recover
- Status: Conforme / Parcial / Não Conforme

### 4. Base de Vulnerabilidades
- Catálogo de vulnerabilidades conhecidas
- Severidade: Crítica, Alta, Média
- Remediações recomendadas

### 5. Guia para Leigos
- Explicações simples sobre portas
- Simulações de ataque (educacional)
- Dicas de proteção

### 6. Educação WiFi
- Testador de força de senha
- Tipos de criptografia (WEP, WPA, WPA2, WPA3)
- Gerador de senhas fortes
- Checklist de segurança

## 🚀 Instalação

### Pré-requisitos
- Python 3.10+
- pip

### Passo a passo

```bash
# 1. Clone o repositório
git clone https://github.com/sucosegulas/cyber-defense-suite.git
cd cyber-defense-suite

# 2. Crie um ambiente virtual
python -m venv .venv

# 3. Ative o ambiente virtual
# Windows:
.venv\Scripts\Activate.ps1
# Linux/Mac:
source .venv/bin/activate

# 4. Instale as dependências
pip install -r requirements.txt

# 5. Execute o servidor
python -m uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

### Acesse
- **Interface Web:** http://localhost:8000
- **Documentação API:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc

## 📖 Uso

### Via Interface Web
1. Acesse http://localhost:8000
2. Navegue pelas abas
3. Execute scans e auditorias

### Via API
```python
import requests

# Scan de rede
response = requests.post("http://localhost:8000/api/scan", json={"target": "127.0.0.1"})
print(response.json())

# Auditoria de senha
response = requests.post("http://localhost:8000/api/password-audit", 
  json={"service": "ssh", "target_ip": "192.168.1.1"})
print(response.json())

# Conformidade NIST
response = requests.get("http://localhost:8000/api/compliance")
print(response.json())
```

## 🏗️ Estrutura do Projeto

```
cyber-defense-suite/
├── app.py                  # Aplicação principal FastAPI
├── requirements.txt        # Dependências Python
├── templates/
│   └── index.html         # Interface web (Tailwind CSS)
├── README.md              # Esta documentação
├── LICENSE                # Licença MIT
└── .gitignore             # Arquivos ignorados
```

## 🔧 API Reference

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/` | Interface web |
| `POST` | `/api/scan` | Scan de portas TCP |
| `GET` | `/api/local-devices` | Descobrir dispositivos na rede |
| `POST` | `/api/password-audit` | Auditoria de senhas |
| `GET` | `/api/compliance` | Conformidade NIST CSF |
| `GET` | `/api/vulnerabilities` | Base de vulnerabilidades |

## 🛡️ Segurança

Este projeto é uma **ferramenta educacional** para:
- Aprender sobre segurança de redes
- Testar a própria infraestrutura (com autorização)
- Entender vulnerabilidades e como se proteger

**⚠️ IMPORTANTE:** Use apenas em redes e sistemas que você tem autorização para testar.

## 🤝 Contribuindo

Contribuições são bem-vindas! Por favor:

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

## 📝 Changelog

### [1.0.0] - 2026-08-28
#### Adicionado
- Scanner de rede com scan TCP real
- Auditoria de senhas simulada
- Framework NIST CSF 2.0
- Base de vulnerabilidades
- Guia para leigos
- Educação WiFi completa

## 📄 Licença

Este projeto está licenciado sob a Licença MIT - veja o arquivo [LICENSE](LICENSE) para detalhes.

## 🔗 Links

- **Repositório:** https://github.com/sucosegulas/cyber-defense-suite
- **Issues:** https://github.com/sucosegulas/cyber-defense-suite/issues
- **Documentação:** http://localhost:8000/docs

## 📞 Contato

- **GitHub:** [@sucosegulas](https://github.com/sucosegulas)

---

**Feito com ❤️ para a comunidade de segurança da informação**