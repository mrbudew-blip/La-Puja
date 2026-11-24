# La Puja

Juego de fiesta online para grupos de amigos españoles: se subastan cartas con "pelas", cada jugador completa su carta y se vota el top 3. Humor negro sin filtro: es lo que quiere el grupo.

## Cómo está hecho
- `server/juego.js`: todas las reglas (clase `Sala`). Sin sockets ni temporizadores reales: recibe `programar(ms, fn)` y `ahora()` para poder testear. `CONFIG` arriba del todo tiene los números del juego.
- `server/cartas.js`: carga los mazos y rellena `{nombre}` / `{nombre2}`.
- `server/index.js`: Express + Socket.IO. Una sala por código, estado en memoria. Cada cambio envía a cada jugador su `vista` personalizada.
- `public/`: HTML + CSS + JS sin framework. `app.js` repinta todo con `innerHTML` en cada estado; **todo texto de usuario pasa por `esc()`**.
- `cartas/*.json`: mazos editables. Preguntas acaban en `?`, inicios en `...`, finales empiezan por `...`.
- `server/limite.js`: límite de 5 acciones por segundo por jugador.
- `scripts/bots.js`: bots para probar (`npm run bots -- CODIGO 3` o `npm run bots -- --sola 4`).
- `scripts/simular.js`: simulador de economía con el motor real (`npm run simular`). Úsalo antes y después de tocar números.

## Economía (decidida con el usuario, ver PLAN-ECONOMIA.md)
- Ajustes de sala: puja mínima 0–30 % de la media de pelas de los vivos (5 %), Hacienda apagada/suave/normal/salvaje (normal), votos anónimos (no), tiempo para escribir (120 s).
- Multa por jugador = max(15, precio de salida) × 2^(cartas seguidas sin pujas) × jugadores sin carta. Sin tope: decisión del usuario. La racha (`subasta.silencios`) vuelve a 0 al venderse una carta y al empezar cada ronda.
- Hacienda (IRPF): tras cada ronda menos la última, quien pasa de la media de los vivos paga tasa × exceso. Nunca adelanta a nadie.
- Los fantasmas nunca votan ni puntúan.
- Descartado por el usuario: tope de multa, votos recíprocos, bonus de criterio, controles anti-trampas del moderador y de pestañas dobles.

## Comandos
- `npm start`: servidor en http://localhost:3000 (`PORT` para cambiarlo).
- `npm run dev`: igual, reiniciando al guardar.
- `npm test`: tests de reglas y de mazos (node:test).
- `LAPUJA_RAPIDO=1`: acorta los tiempos de subasta para probar con bots.

## Convenciones
- Todo en español: código, mensajes y textos de la interfaz.
- Las reglas van en `juego.js` y se prueban en `test/juego.test.js`, nunca en el cliente.
- El diseño es "esquela": cartas como esquelas de periódico, lo escrito por jugadores a boli Bic (fuente Caveat), fondo morado nazareno, oro para pelas (₧).
- El diseño del juego está en `docs/superpowers/specs/2026-11-24-la-puja-design.md`.
