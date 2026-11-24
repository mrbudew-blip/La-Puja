# La Puja: lo que tienes que hacer tú

El juego está **terminado y probado** (partidas completas con bots, en móvil y en PC) y **se puede jugar online desde tu PC** con un solo comando (sección 2), gratis y sin cuentas. Lo único que no puedo hacer por ti es dejarlo en internet sin depender de tu PC (sección 3): para eso hace falta una cuenta tuya en un servicio de alojamiento.

---

## 1. Jugarlo en tu PC (2 minutos)

Abre una terminal en la carpeta del juego y ejecuta:

```powershell
npm install
```

```powershell
npm start
```

Verás algo así:

```
🔨 La Puja está en marcha
   En este PC:            http://localhost:3000
   Desde tu móvil (wifi): http://192.168.1.50:3000
```

- Abre `http://localhost:3000`, pulsa **Crear sala** y entra con tu apodo.
- Desde el móvil, **conectado al mismo wifi**, abre la segunda dirección. Si no carga, Windows te habrá preguntado por el cortafuegos: dale a **Permitir** en redes privadas.

Para cerrar el servidor: `Ctrl + C` en la terminal.

### Probar solo, con bots

Con el servidor encendido, abre **otra** terminal:

```powershell
npm run bots -- ABCDE 3
```

(cambia `ABCDE` por el código de tu sala, que sale en el enlace `/sala/ABCDE`). Entran 3 bots que pujan, escriben y votan. Tú eres el moderador.

O mira una partida entera de bots sin tocar nada:

```powershell
npm run bots -- --sola 4
```

---

## 2. Jugar online con tus amigos desde sus casas (gratis, desde tu PC)

Tu PC hace de servidor y un **túnel de Cloudflare** le da una dirección pública. Sin cuentas, sin pagar y sin tocar el router. La partida existe **mientras tu PC y la ventana del juego estén encendidos**.

### Una sola vez: instalar `cloudflared`

Es el programa que hace el túnel. **En tu PC ya está instalado.** En otro PC:

```powershell
winget install --id Cloudflare.cloudflared
```

### Cada vez que queráis jugar

1. Haz **doble clic en `Jugar online.cmd`**, en la carpeta del juego. O, en una terminal:

   ```powershell
   npm run online
   ```

2. En unos 10 segundos sale el enlace, tipo `https://palabras-raras.trycloudflare.com`. Se copia solo al portapapeles y se abre en tu navegador.
3. Crea la sala **desde ese enlace**, no desde `localhost`, y pasa el enlace de la sala por Discord o WhatsApp.
4. Deja la ventana abierta y el PC encendido. Mientras está en marcha, Windows no se suspende solo, pero si cierras la tapa del portátil, sí.
5. Para acabar: `Ctrl + C` o cierra la ventana.

### Lo que tienes que saber

- **El enlace cambia cada vez que lo enciendes.** Si lo reinicias a mitad de partida, todos pierden su sitio: cread una sala nueva.
- Si se cae el servidor o el túnel, se apaga todo y la ventana dice por qué.
- Desde fuera **solo se entra por el túnel**: el servidor no atiende directamente a nadie de tu red ni de internet.
- Como mucho hay **20 salas a la vez**, para que nadie con el enlace te llene la memoria del PC.
- Si dice que **el puerto 3000 está en uso**, tienes `npm start` u otra ventana del juego abierta: ciérrala.
- Los túneles sin cuenta de Cloudflare no tienen garantía, pero para 3–8 amigos van sobrados.
- Si algo falla, `npm run online -- --detalle` enseña todo lo que dice `cloudflared`.

---

## 3. Dejarlo en internet para siempre (20 minutos, gratis)

Así tus amigos pueden crear salas cuando quieran, sin que tu PC esté encendido.

### 3.1 Sube el código a GitHub

1. Crea una cuenta en <https://github.com> si no tienes.
2. Crea un repositorio nuevo **privado** llamado `la-puja` (sin README).
3. En la carpeta `La puja`:

   ```powershell
   git init
   ```

   ```powershell
   git add .
   ```

   ```powershell
   git commit -m "La Puja"
   ```

   ```powershell
   git branch -M main
   ```

   ```powershell
   git remote add origin https://github.com/TU_USUARIO/la-puja.git
   ```

   ```powershell
   git push -u origin main
   ```

   (La carpeta `node_modules` no se sube: ya está en `.gitignore`.)

   💡 También puedes pedirle a Claude Code: *"sube este proyecto a un repo privado de GitHub"* y lo hace contigo.

### 3.2 Publícalo en Render

1. Entra en <https://render.com> con tu cuenta de GitHub.
2. **New → Web Service** → elige el repositorio `la-puja`.
3. Rellena:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. Pulsa **Create Web Service**. En un par de minutos tendrás una dirección tipo `https://la-puja.onrender.com`.

> **Ojo con el plan gratis de Render:** si nadie entra en 15 minutos, el servidor se duerme y tarda ~1 minuto en despertar la primera vez. Y **si se duerme o se reinicia a mitad de partida, la partida se pierde** (las salas viven en memoria). Abre la web un minuto antes de jugar para despertarla. Si os engancháis, el plan de pago más barato evita esto.

Alternativas parecidas: Railway (<https://railway.app>) o Fly.io (<https://fly.io>). Los pasos son casi iguales.

---

## 4. Cambiar o añadir cartas

Las cartas están en la carpeta `cartas/`, una lista por tipo:

| Archivo | Tipo | Cómo tiene que ser |
|---|---|---|
| `preguntas.json` | Pregunta | Acaba en `?` |
| `respuestas.json` | Respuesta | Una frase suelta |
| `inicios.json` | Inicio de frase | Acaba en `...` |
| `finales.json` | Final de frase | Empieza por `...` |

- `{nombre}` se cambia por el nombre real de alguien de la sala; `{nombre2}` por otro distinto.
- Cada carta va entre comillas dobles y separada por comas. **No uses comillas dobles dentro** de la carta: usa comillas simples (`'así'`).
- Después de tocar las cartas, ejecuta `npm test`: te avisa si se te ha colado un error.
- Reinicia el servidor (`Ctrl + C` y `npm start`) para que cargue las nuevas.

Truco con Claude Code: *"añade 50 cartas de inicio de frase sobre bodas y comuniones, con el mismo tono"*.

---

## 5. Ajustar el juego

### Lo que elige el moderador en la sala, antes de empezar

| Ajuste | Qué hace | Por defecto |
|---|---|---|
| Puja mínima (0–30 %) | Las cartas salen desde ese % de la media de pelas de los vivos. Con 0 %, desde 1 | 5 % |
| Hacienda | Tras cada ronda (menos la última), quien pase de la media paga ese % de lo que se pasa | Normal (25 %) |
| Votos anónimos | Si no se marcan, tras cada ronda se ve quién votó a quién | No |
| Tiempo para escribir | Al acabarse, cuenta lo que cada uno tenga escrito. 0 = sin límite | 120 s |
| Rondas, tipos de carta y nombres | Lo de siempre | 10 rondas, todo marcado |

La **multa** por no pujar es el mayor entre 15 y el precio de salida, multiplicado por los jugadores sin carta. Así callarse nunca sale más barato que pujar.

**Cada carta seguida que nadie puja duplica la multa:** ×1, ×2, ×4, ×8… sin tope. Con 4 sin carta y base 15: 60, 120, 240, 480 por jugador. La racha **vuelve a ×1** en cuanto se vende una carta y al empezar cada ronda. La subasta lo avisa ("🔥 La carta anterior se quedó sin pujas: esta sanción va ×2").

En la **barra de arriba** siempre se ve la **media de pelas de los vivos** (los fantasmas no cuentan), en directo. Es la misma que usan la puja mínima y Hacienda. El precio de salida de cada ronda se calcula con la media al **empezar** la ronda, y la subasta lo indica ("Salida de esta ronda: 5 % de 175 ₧").

### Lo que está en el código

El resto de números están arriba del todo en `server/juego.js`, en `CONFIG`:

| Qué | Valor | Dónde |
|---|---|---|
| Multa base | 15 | `PENALIZACION` |
| Cuenta atrás sin pujas | 30 s | `T_SIN_PUJAS` |
| Cuenta atrás tras cada puja | 8 s | `T_PUJA` |
| Pelas por punto | 5 | `PELAS_POR_PUNTO` |
| Pelas que propone "Dar a todos" | 150 | `PELAS_INICIALES` |
| Niveles de Hacienda | 15 / 25 / 40 % | `HACIENDA` |
| Jugadores | 3 a 8 | `MIN_JUGADORES`, `MAX_JUGADORES` |

### Probar cambios de economía sin jugar

```powershell
npm run simular
```

Juega 300 partidas por escenario con bots tacaños, normales y agresivos y saca una tabla: pelas finales, cuánto se gasta frente a lo que entra, multas, fantasmas y si el líder se escapa. Si tocas números en `CONFIG`, ejecútalo antes y después para ver el efecto.

---

## Decisiones que tomé yo (cámbialas si no te gustan)

- **Nunca puedes pujar todo tu dinero:** siempre te queda 1 pela. Así solo te arruina la multa, no una puja impulsiva.
- **Tras cada puja hay 8 segundos** para que alguien suba; si nadie sube, se adjudica.
- Si **nadie sin carta llega al precio de salida**, la cuenta atrás baja a 5 segundos (no tiene sentido esperar 30).
- **Los fantasmas ni votan ni puntúan** (decisión tuya). Escriben y se leen al final.
- **Hacienda redondea hacia abajo** y nunca adelanta a nadie: como mucho deja a dos jugadores empatados.
- Mientras escribes, lo que llevas se va guardando: si se acaba el tiempo o el moderador corta, **cuenta tu borrador**.
- Si todos los jugadores **conectados** han pulsado Listo, se pasa a la lectura sin esperar a los desconectados.
- Cada jugador puede hacer **como mucho 5 acciones por segundo** (frena macros de puja).
- **Si solo queda un jugador vivo**, la partida termina y gana él.
- **No puedes votarte a ti mismo.** Con pocos jugadores, el top tiene menos de 3 puestos.
- Si alguien **recarga la página** o se le va la conexión, vuelve a su sitio con sus pelas (en el mismo navegador).
- Si el **moderador se desconecta** 15 segundos, el rol pasa al siguiente.
- El moderador puede **saltarse la espera** si alguien no acaba de escribir o de votar (por si se ha dormido).
- El número de **rondas** se puede cambiar en la sala (por defecto 10).

## Para aprender con Claude Code

Este proyecto es buen material para practicar. Prueba a pedirle:

- *"Explícame cómo funciona `server/juego.js` paso a paso"*
- *"Añade un sonido de martillo cuando se adjudica una carta"*
- *"Añade un chat de texto en la sala de espera"*
- *"Haz que el moderador pueda elegir el tiempo de la subasta"*
- *"Revisa el código y dime qué mejorarías"* (`/code-review`)

Las reglas del proyecto están en `CLAUDE.md`, que Claude Code lee solo cada vez que abres la carpeta.
