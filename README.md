# 🔨 La Puja

Juego de fiesta online para grupos de amigos (de 3 a 8 jugadores). Se **subastan cartas** con "pelas" (₧), quien gana la carta **completa la otra mitad** y entre todos **votáis el top 3**. Gana quien acabe con más pelas.

Humor negro sin filtro, pensado para un grupo de amigos españoles. Se juega desde el móvil o el PC, sin cuentas: basta un enlace y un apodo.

## Cómo arrancarlo

Necesitas [Node.js](https://nodejs.org) 18 o superior.

```bash
npm install
npm start
```

Abre <http://localhost:3000>, pulsa **Crear sala** y entra con tu apodo. Desde el móvil, con el mismo wifi, usa la dirección que enseña la terminal (`http://192.168.x.x:3000`).

### Jugar con amigos desde sus casas

Tu PC hace de servidor y un túnel gratuito de Cloudflare le da una dirección pública. No hace falta cuenta ni tocar el router.

1. Instala `cloudflared` una vez: `winget install --id Cloudflare.cloudflared`
2. Ejecuta `npm run online` (o doble clic en `Jugar online.cmd` en Windows).
3. Sale un enlace tipo `https://palabras-raras.trycloudflare.com`. Crea la sala **desde ese enlace** y pasa el de la sala a tus amigos.
4. Para acabar, `Ctrl + C`.

La partida solo existe mientras tu PC y la ventana estén encendidos. El enlace cambia cada vez que lo enciendes.

### Otros comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Arranca el servidor y lo reinicia al guardar |
| `npm test` | Tests de las reglas y de los mazos |
| `npm run simular` | Simula cientos de partidas para ver si la economía está equilibrada |

## Cómo añadir bots

Los bots sirven para probar el juego sin reunir gente: pujan, escriben y votan solos. Con el servidor encendido, abre **otra** terminal.

**Meter bots en una sala tuya** (tú eres el moderador). El código es el de la dirección `/sala/ABCDE`:

```bash
npm run bots -- ABCDE 3
```

**Ver una partida entera de bots sin tocar nada** (crea la sala y juegan 4 bots):

```bash
npm run bots -- --sola 4
```

Variables opcionales:

| Variable | Para qué |
|---|---|
| `URL` | Apuntar a otro servidor, por ejemplo el del túnel (por defecto `http://localhost:3000`) |
| `RONDAS` | Número de rondas de la partida (por defecto 2) |
| `LAPUJA_RAPIDO=1` | En el servidor: acorta los tiempos de subasta |

En PowerShell: `$env:LAPUJA_RAPIDO = '1'; npm start`.

## Cómo se juega

El primero en entrar es el **moderador**: ajusta la partida en la sala de espera y la empieza. También es un jugador más y puede ceder el rol.

Cada jugador entra con un **apodo** y, si el moderador lo activa, con su **nombre real**, que se usa para meterlo en las cartas.

### Una ronda

1. **Subasta.** Sale una carta. Solo pujan los que **aún no tienen carta esta ronda**; pujas con los botones +1, +5 y +10. Si nadie puja sube más durante 8 s, se la lleva el que va ganando y paga su puja. Sin pujas, la carta sale desde un precio de salida (por defecto el 5 % de la media de pelas).
2. **Multa por no pujar.** Si nadie puja una carta, **todos los que siguen sin carta pierden pelas** (como mínimo 15 por cada jugador sin carta). Si la siguiente también se queda sin pujas, la multa se **duplica**, y así sucesivamente. Al venderse una carta o empezar otra ronda, vuelve a la normalidad.
3. **Escribir.** Cada jugador completa **la otra mitad** de su carta (120 s por defecto):

   | Te toca | Escribes |
   |---|---|
   | Pregunta | La respuesta |
   | Respuesta | La pregunta |
   | Inicio de frase | El final |
   | Final de frase | El inicio |

4. **Lectura.** Se destapan las cartas una a una, en el orden en que se ganaron, con su autor y lo que pagó. Se leen en voz alta.
5. **Votación.** Cada uno elige su **top 3** (no puedes votarte a ti mismo). Dan **3, 2 y 1 puntos**, y **cada punto vale 5 pelas**. Los votos pueden ser públicos o anónimos, según elija el moderador.
6. **Resultados.** Se enseña el podio, cuánto ha gastado y ganado cada uno y cómo queda la clasificación.

### Otras reglas

- **Hacienda.** Tras cada ronda (menos la última), quien tiene más pelas que la media paga un porcentaje de lo que se pasa. Nunca le hace perder el primer puesto: solo acorta distancias. Se puede apagar.
- **Fantasmas.** Si te quedas a 0 pelas, estás muerto: sigues escribiendo tu carta, pero **no puedes pujar, votar ni puntuar**.
- **Final.** Tras 10 rondas (se puede cambiar) gana quien tenga más pelas. Si solo queda uno vivo, la partida acaba y gana él.
- **Reconexión.** Si recargas la página o se te va la conexión, vuelves a tu sitio con tus pelas.

### Lo que decide el moderador

Pelas iniciales de cada jugador (150 por defecto), tipos de carta, si salen nombres reales, rondas, puja mínima (0 a 30 %), Hacienda (apagada, suave, normal o salvaje), votos anónimos y tiempo para escribir.

## Cómo está hecho

HTML, CSS y JavaScript sin framework en `public/`, y un servidor Node con Express y Socket.IO en `server/`. Las reglas están en `server/juego.js` y se prueban con `npm test`. Las cartas están en `cartas/*.json` y se editan a mano. Más detalles en [PASOS.md](PASOS.md) y [CLAUDE.md](CLAUDE.md).
