# ScreenWatch - Build dos Instaladores

## Windows (.exe) - Agente Desktop

```bash
cd agent
npm install
npm run build
```

O instalador será gerado em `agent/dist/ScreenWatch Agent Setup-x.x.x.exe`.

Se houver erro de symlink no winCodeSign, rode o PowerShell como **Administrador** e tente novamente.

**Alternativa portátil**: `agent/dist/ScreenWatch-Agent-Portable.zip` (já gerado, ~108 MB).

## Android (.apk) - Agente Mobile

```bash
cd android-agent
./gradlew assembleRelease
```

O APK será gerado em `android-agent/app/build/outputs/apk/release/app-release.apk`.

Pré-requisitos: Java 11+, Android SDK 34.

## Deploy do Servidor (Fly.io)

```bash
cd server
fly launch --no-deploy --name screenwatch-server
fly secrets set JWT_SECRET=sua-chave-aqui
fly deploy
```
