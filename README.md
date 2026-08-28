# 🖥️ ScreenWatch - Sistema de Monitoramento Corporativo

Sistema completo e centralizado para monitorar em tempo real as telas de computadores (desktops/laptops) e ler notificações de mensagens em celulares Android pertencentes à empresa.

---

## 📁 Estrutura do Projeto

```
screenwatch/
├── server/              # Servidor + Dashboard Admin
│   ├── public/          # Dashboard web (HTML/CSS/JS)
│   │   ├── css/         # Estilos dark mode premium e feed
│   │   └── js/          # Lógica frontend e conexão WebSocket
│   ├── index.js         # Servidor principal (Express + Socket.IO)
│   ├── auth.js          # Autenticação JWT e bcrypt (Hash de senhas)
│   └── devices.js       # Gerenciamento de dispositivos e grupos
│
├── agent/               # Agente Desktop (Electron para Windows/Mac/Linux)
│   ├── main.js          # Captura e envio de screenshots
│   ├── config.json      # Configurações de rede do agente
│   └── package.json
│
└── android-agent/       # Agente Mobile (Android Nativo Java)
    ├── app/src/main/
    │   ├── AndroidManifest.xml  # Registro de permissões e serviços
    │   └── java/com/screenwatch/agent/
    │       ├── service/         # Serviços de interceptação de notificações e rede background
    │       ├── network/         # Conexão Socket.IO v4 via OkHttp
    │       ├── receiver/        # Receptor de inicialização pós-boot
    │       └── ui/              # Activity de configurações e permissões
    └── build.gradle
```

---

## 🚀 Como Configurar e Executar

### 1. Iniciar o Servidor Central
O servidor central gerencia as conexões e serve o painel web.
```bash
cd server
npm install
npm start
```
* **Endereço**: `http://localhost:3000` (ou o IP local do servidor na rede da empresa, ex: `http://192.168.1.100:3000`).
* **Primeiro Acesso**: Acesse o endereço no navegador para configurar a senha de administrador.

### 2. Instalar o Agente nos Computadores (Windows / macOS / Linux)
1. Copie a pasta `agent/` para a máquina monitorada.
2. Edite `agent/config.json` e aponte para o IP do seu servidor:
   ```json
   {
     "serverUrl": "http://IP_DO_SERVIDOR:3000",
     "showTray": false,
     "autoStart": true
   }
   ```
3. Instale as dependências e inicie o agente em modo invisível:
   ```bash
   cd agent
   npm install
   npm start
   ```
4. **Instalador executável (.exe)**: Se quiser gerar um instalador para facilitar a distribuição:
   ```bash
   npm run build
   ```

### 3. Instalar o Agente nos Celulares Android (WhatsApp, Telegram, etc.)
O agente Android escuta e retransmite notificações recebidas.
1. Abra a pasta `android-agent` no **Android Studio**.
2. Faça o build do aplicativo e instale o APK gerado no dispositivo.
3. Ao abrir o app:
   * Insira a URL do servidor (Ex: `http://192.168.1.100:3000`) e clique em **Conectar**.
   * Toque em **Ativar Acesso a Notificações** e conceda acesso ao ScreenWatch nas configurações do sistema.
   * Toque em **Desativar Otimização de Bateria** para permitir que o app envie dados mesmo em modo repouso.

---

## ⚙️ Funcionalidades em Detalhes

### 📊 Painel de Controle (Dashboard)
- **Aba Telas**: Exibe um grid dinâmico com screenshots atualizados dos PCs a cada 5 segundos. Permite clicar em qualquer tela para visualizar em tamanho ampliado.
- **Aba Mensagens**: Um feed com rolagem infinita contendo mensagens recebidas de:
  - **WhatsApp** e **WhatsApp Business**
  - **Telegram**
  - **Instagram Direct**
  - **SMS** (Google Messages)
  - **Teams, Slack e Discord**
- **Filtros e Grupos**: Organize computadores por setores (TI, Financeiro, Vendas, etc.) e filtre o feed de mensagens por aplicativo.

### 🔒 Segurança e Resiliência
- **Proteção contra Remoção**: O agente PC roda oculto e inicia com o sistema operacional. O agente Android utiliza um *Foreground Service* permanente com notificação persistente, impedindo o encerramento do processo pelo Android.
- **Auto-Start**: Se o computador ou celular for reiniciado, o monitoramento é retomado de forma automática.
- **Criptografia**: Credenciais admin protegidas por bcrypt e requisições autenticadas por JWT.
