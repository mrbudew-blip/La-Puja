# Jugar online desde tu PC (diseño corto)

Aprobado por el usuario el 2026-11-24.

## Por qué
El juego solo funcionaba en local. El usuario quiere jugar con amigos de otras zonas de la ciudad **sin pagar servidor**: su PC hace de servidor y la partida solo existe mientras su PC y el servidor estén encendidos.

## Objetivos
- Un solo comando (`npm run online`) o un doble clic (`Jugar online.cmd`) para tener el juego en internet.
- Enseñar el enlace público, copiarlo al portapapeles y abrirlo en el navegador.
- Si se cae el servidor o el túnel, se apaga lo otro. Ctrl + C o cerrar la ventana lo apaga todo.
- Mientras esté encendido, Windows no se suspende.

## No objetivos
- Dirección fija (pediría cuenta o dominio de pago).
- Partidas que sobrevivan a un reinicio del servidor (las salas siguen en memoria).

## Enfoques
| Enfoque | A favor | En contra | Decisión |
|---|---|---|---|
| **Túnel rápido de Cloudflare** (`cloudflared`, `*.trycloudflare.com`) | Gratis, sin cuenta, HTTPS y WebSocket | La dirección cambia en cada arranque; servicio sin garantías | **Elegido** |
| ngrok / Tailscale Funnel | Dirección fija | Piden cuenta; ngrok gratis enseña una página de aviso | Descartado: cada sala ya tiene su propio enlace |
| Abrir puertos en el router | Sin programas extra | Expone la IP; CG-NAT en muchas compañías españolas | Descartado |

## Diseño
- `scripts/online.js`: arranca `server/index.js` como proceso hijo con `HOST=127.0.0.1`, espera a que responda, lanza `cloudflared tunnel --url http://127.0.0.1:PUERTO`, lee de su salida la dirección `https://….trycloudflare.com`, espera a que responda por internet y entonces la enseña, la copia (`clip`) y la abre.
- Busca `cloudflared` en el PATH y en las rutas donde lo deja winget, porque una terminal abierta antes de instalarlo no tiene el PATH nuevo. Si no lo encuentra, explica cómo instalarlo.
- Evita la suspensión con un proceso PowerShell hijo que llama a `SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)` y muere con el script.
- `server/index.js`: acepta `HOST` para escuchar solo en este PC (sin `HOST`, todo sigue como antes) y limita las salas simultáneas a 20 (`MAX_SALAS`).
- `Jugar online.cmd`: hace `npm install` si falta `node_modules` y lanza `npm run online`.

## Lo que queda a criterio del que lo construye
Textos exactos de la consola, tiempos de espera y reintentos.
