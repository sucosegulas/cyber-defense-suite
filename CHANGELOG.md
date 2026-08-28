# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [1.0.0] - 2026-08-28

### ✨ Adicionado

#### Scanner de Rede
- Scan de portas TCP com socket real
- Descoberta de dispositivos na rede local
- Detecção de sistema operacional
- Cálculo de risco baseado em portas abertas

#### Auditoria de Senhas
- Simulação de força bruta (Hydra-style)
- Verificação de credenciais fracas
- Relatório de tentativas e tempo

#### Conformidade NIST CSF 2.0
- Framework completo: Govern, Identify, Protect, Detect, Respond, Recover
- Status visual: Conforme / Parcial / Não Conforme
- Interface interativa

#### Base de Vulnerabilidades
- Catálogo de vulnerabilidades conhecidas
- Classificação por severidade (Crítica, Alta, Média)
- Remediações recomendadas

#### Guia para Leigos
- Explicações simples sobre portas (21, 22, 80, 443, 445, 3306, 8080, 8443)
- Simulações de ataque (educacional)
- Dicas de proteção

#### Educação WiFi
- Testador de força de senha
- Análise de comprimento e complexidade
- Estimativa de tempo para quebrar
- Tipos de criptografia (WEP, WPA, WPA2, WPA3)
- Gerador de senhas fortes
- Checklist de segurança WiFi

#### Interface Web
- Design responsivo com Tailwind CSS
- Abas navegáveis
- Interface moderna e intuitiva
- Suporte a modo escuro

### 🔧 Técnico
- Backend: FastAPI (Python 3.10+)
- Frontend: HTML + Tailwind CSS + JavaScript
- API RESTful completa
- Documentação Swagger/ReDoc automática

---

## [0.1.0] - 2026-08-27

### ✨ Adicionado
- Estrutura inicial do projeto
- Scanner básico de portas
- Interface web simples

---

## [Unreleased]

### 🔮 Planejado
- [ ] Scanner de vulnerabilities real (Nmap integration)
- [ ] Sistema de alertas por email
- [ ] Dashboard com gráficos
- [ ] Exportação de relatórios (PDF)
- [ ] Suporte a múltiplos idiomas
- [ ] Modo escuro/claro
- [ ] Autenticação de usuários
- [ ] Banco de dados para histórico
- [ ] Integração com VirusTotal API
- [ ] Scanner de WiFi networks
- [ ] Detecção de intrusão (IDS)
- [ ] Firewall rules manager