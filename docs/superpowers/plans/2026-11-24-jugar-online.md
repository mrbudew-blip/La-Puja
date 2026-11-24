# Jugar online desde tu PC: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `npm run online` (o doble clic en `Jugar online.cmd`) ponga La Puja en internet desde el PC del usuario, gratis, con un túnel rápido de Cloudflare.

**Architecture:** `scripts/online.js` orquesta tres procesos hijos: el servidor (`server/index.js` con `HOST=127.0.0.1`), `cloudflared tunnel --url` y, en Windows, un PowerShell que impide la suspensión. Si cae uno, se apagan todos. El servidor gana `HOST` y un límite de salas.

**Tech Stack:** Node 24 (sin dependencias nuevas), `cloudflared` 2026.11, node:test.

**Spec:** `docs/superpowers/specs/2026-11-24-jugar-online-design.md`

## Global Constraints
- Todo en español: código, mensajes y textos.
- Sin dependencias nuevas en `package.json`.
- Sin `HOST`, el servidor se comporta exactamente como antes (`npm start` intacto).
- Límite de salas simultáneas: 20.

## Review Focus
- El puerto 3000 ya está ocupado (por ejemplo, `npm start` abierto en otra ventana): mensaje claro y salida, sin túnel huérfano.
- `cloudflared` instalado pero la terminal se abrió antes (PATH viejo): se encuentra igual en `C:\Program Files (x86)\cloudflared\`.
- Sin internet o Cloudflare rechaza el túnel: se enseñan las últimas líneas de `cloudflared` y se apaga el servidor.
- La comprobación previa no debe dejar en la caché DNS de Windows un "no existe" para la dirección nueva: se resuelve con 1.1.1.1 / 8.8.8.8, no con el DNS del sistema.
- Sala llena (20): el botón "Crear sala" enseña el motivo que da el servidor, no "¿Está el servidor encendido?".

---

### Task 1: `HOST` y límite de salas en el servidor

**Files:**
- Modify: `server/index.js` (arranque y `POST /api/salas`), `public/app.js` (`crearSala`)
- Test: `test/servidor.test.js`

**Interfaces:**
- Produces: variable de entorno `HOST` (si vale `127.0.0.1`, solo se imprime la dirección local); `POST /api/salas` responde `503 { error }` con 20 salas abiertas, tras intentar borrar las vacías desde hace más de 5 minutos.

- [ ] Test `limita las salas a 20`: arranca el servidor en un puerto libre con `HOST=127.0.0.1`, hace 20 POST (todos 200 con `codigo`) y el 21.º devuelve 503 con `error` que contiene "salas".
- [ ] Ejecutar `node --test test/servidor.test.js`: falla.
- [ ] Implementar `MAX_SALAS = 20`, `limpiarSalas(inactividadMs)` (la usa también el intervalo existente) y `servidor.listen(PUERTO, HOST)`.
- [ ] `crearSala` en el cliente enseña `error` del JSON si viene.
- [ ] `npm test`: todo pasa.

### Task 2: `scripts/online.js` y `Jugar online.cmd`

**Files:**
- Create: `scripts/online.js`, `Jugar online.cmd`
- Modify: `package.json` (script `online`)
- Test: `test/online.test.js`

**Interfaces:**
- Produces (exportado para tests): `extraerEnlace(texto: string): string | null` (primera `https://<sub>.trycloudflare.com`, nunca `api.trycloudflare.com`); `buscarCloudflared(): string | null` (`CLOUDFLARED` del entorno, PATH, `Program Files (x86)`, `Program Files`, `WinGet\Links`).

- [ ] Tests de `extraerEnlace`: línea real del recuadro de cloudflared → enlace; texto con `https://api.trycloudflare.com/tunnel` → `null`; texto sin enlace → `null`.
- [ ] Ejecutar: falla.
- [ ] Implementar el flujo: comprobar puerto libre → servidor hijo → esperar `GET /` 200 (10 s) → `cloudflared tunnel --no-autoupdate --url http://127.0.0.1:PUERTO` → enlace (40 s) → esperar `GET enlace` 200 resolviendo con 1.1.1.1/8.8.8.8 (60 s; si no, avisa y sigue) → copiar con `clip`, abrir navegador (salvo `--sin-navegador`), impedir suspensión. Señales `SIGINT`/`SIGTERM`/`SIGHUP` y la caída de cualquier hijo apagan todo.
- [ ] `Jugar online.cmd`: `chcp 65001`, `cd /d "%~dp0"`, `npm install` si falta `node_modules`, `node scripts\online.js`, `pause`.
- [ ] `npm test`: todo pasa.

### Task 3: prueba real y documentación

- [ ] `npm run online -- --sin-navegador`: sale el enlace; la página carga por el enlace público en el navegador integrado; `npm run bots -- CODIGO 3` contra el enlace público juega una partida (WebSocket por el túnel).
- [ ] Con el puerto 3000 ocupado: mensaje claro y salida sin procesos colgados.
- [ ] `PASOS.md` (sección 2 reescrita), `CLAUDE.md` (comando `npm run online`).
- [ ] Commit.
