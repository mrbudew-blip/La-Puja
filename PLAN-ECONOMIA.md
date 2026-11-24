# Plan de economía de La Puja (versión cerrada)

Estado: **aplicado en el código** (fases 0 a 3). Falta la fase 4: una partida real con amigos.

### Resultado del simulador (`npm run simular`, 400 partidas por escenario, 10 rondas)

| | 4 jugadores, antes | 4 jugadores, ahora | 8 jugadores, antes | 8 jugadores, ahora |
|---|---|---|---|---|
| Gasto en cartas frente a lo que entra por votos (objetivo ≈ 50 %) | 28 % | 44 % | 39 % | 50 % |
| Precio medio de una carta | 8 | 13 | 12 | 15 |
| Pelas finales de media | 316 | 189 | 282 | 214 |
| El líder de la ronda 5 acaba ganando | 75 % | 57 % | 56 % | 41 % |
| Fantasmas por partida | 0 | 0,6 | 0,05 | 0,5 |

"Antes" es puja desde 1, sin Hacienda y 100 pelas; "ahora" es 5 %, Hacienda normal y 150 pelas. Las multas que aparecen ahora salen casi todas de jugadores que no quieren abrir la puja, no de jugadores que no llegan al precio. Con un 10 % de puja mínima, la partida se vuelve muy dura (con 4 jugadores, casi 2 fantasmas por partida): la sala lo avisa por encima del 10 %. Los bots son una aproximación: miden tendencias, no el humor.

### Añadido después: la multa se duplica con cada carta seguida sin pujas

- Multa por jugador = el mayor entre 15 y el precio de salida × **2^(cartas seguidas sin pujas)** × jugadores sin carta: ×1, ×2, ×4, ×8… sin tope.
- La racha vuelve a ×1 **en cuanto se vende una carta** y **al empezar cada ronda**.
- La primera sanción cuesta lo mismo que antes. Si el grupo sigue sin pujar, muere antes: con 150 pelas y 4 o más sin carta, la segunda sanción seguida ya deja a todos a 0.
- Simulador (400 partidas, 4 jugadores, 5 % y Hacienda normal): las multas por partida bajan de 349 a 178 y los fantasmas de 0,6 a 0, porque tras el primer silencio hasta los tacaños abren la puja. Con 8 jugadores, las multas bajan de 169 a 76.

---

Lo que sigue es el plan tal como se decidió.

---

## 1. Por qué se hace esto (medido en el juego actual)

- **Inflación:** cada jugador recibe de media +30 pelas por ronda por los votos y gasta unas 10 en cartas. Una respuesta perfecta paga 45–105 y una carta cuesta ~10, así que pujar fuerte siempre compensa.
- **La multa puede acabar la partida a la primera carta ignorada:** con 7 u 8 jugadores y 100 pelas, la multa (105 o 120) deja a todos a 0, todos pasan a fantasma y la partida acaba sin ganador. Decisión tuya: **no se limita**; si se acaba rápido, es cosa de los jugadores. Solo se avisa en la sala.

---

## 2. Reglas decididas

### Ajustes que elige el moderador antes de empezar (se bloquean al empezar)

| Ajuste | Valores | Por defecto |
|---|---|---|
| **Puja mínima** | de 0 % a 30 % | 5 % *(mi propuesta)* |
| **Hacienda** | apagada · suave 15 % · normal 25 % · salvaje 40 % | normal 25 % *(mi propuesta)* |
| **Votos anónimos** | sí / no | **no** (votos públicos) |
| **Tiempo máximo para escribir** | segundos, 0 = sin límite | 120 s *(el moderador puede cambiarlo: mi propuesta)* |

Siguen como hasta ahora: tipos de carta, nombres en cartas, rondas y pelas iniciales por jugador. **Pelas iniciales por defecto: 150** *(mi propuesta, antes eran 100)*.

La sala muestra avisos que **no bloquean** nada, por ejemplo: "Con 8 jugadores y 100 pelas, una carta que nadie puje deja a todos a 0" y "Con 150 pelas de media, el precio de salida sería 8".

### Puja mínima proporcional
- Al empezar cada ronda: `precio de salida = máximo(1, redondear(porcentaje × media de pelas de los jugadores vivos))`.
- Es **fijo durante toda la ronda** (no cambia de una carta a otra). Con 0 % es 1, como ahora.
- La carta muestra "Puja desde 8 ₧". Sin pujas puestas, los botones son **Salida (8) · +5 (13) · +10 (18)**. Con una puja puesta, **+1 / +5 / +10**, como hoy.
- Sigue valiendo: nadie puede pujar más de sus pelas menos 1. Quien tenga menos que el precio de salida más 1 no puede pujar y se le avisa.
- La comprobación de "nadie puede pagar" (cuenta atrás de 5 s) pasa a mirar el **precio de salida**, no "1 pela".

| Ejemplo (4 jugadores, 5 %) | Media | Precio de salida |
|---|---|---|
| Ronda 1 | 150 | 8 |
| Ronda 5 | ~250 | 13 |
| Ronda 10 | ~350 | 18 |

(Cifras estimadas; el simulador las confirma.)

### Multa
- **Multa por jugador = el mayor entre 15 y el precio de salida, multiplicado por el número de jugadores sin carta.** Sin tope.
- Así callarse nunca es más barato que pujar, y la multa no se usa para "pedir carta nueva" barato.

| Precio de salida | Multa con 1 sin carta | Multa con 3 sin carta |
|---|---|---|
| 1 a 15 | 15 | 45 (tu regla de siempre) |
| 28 | 28 | 84 |

- Con la puja mínima al 0 % la multa es exactamente 15 × jugadores sin carta.
- Quien se queda a 0 sigue pasando a **fantasma**.

### Hacienda (sistema A: IRPF)
- Después de repartir las pelas de los votos y **en todas las rondas menos la última**, se calcula la **media de pelas de los jugadores vivos**.
- Cada jugador vivo por encima de la media paga `tasa × (sus pelas − media)`, redondeado hacia abajo. Quien esté por debajo no paga. Lo recaudado **desaparece**.
- Quien va primero **sigue yendo primero**: el impuesto nunca adelanta a nadie. Solo acorta distancias.
- Ejemplo con tasa normal (25 %): Paco 400, Lola 320, Rafa 260 y Chus 220 (media 300). Paco paga 25, Lola 5, Rafa y Chus 0. Hacienda recauda 30.
- Los fantasmas no cuentan para la media ni pagan.
- La pantalla de resultados añade "🏛️ Hacienda ha cobrado 30 pelas: Paco −25, Lola −5".
- No frena mucho la inflación (en el ejemplo quita 30 de los 120 que entran por ronda); sirve para que la partida siga abierta. La inflación la frena la puja mínima.

### Votos anónimos
- **Públicos (por defecto):** tras cada ronda, los resultados muestran el voto de cada uno ("Paco: 1.º Lola, 2.º Rafa, 3.º Chus").
- **Anónimos:** solo se ven los totales. El servidor **no envía** quién votó qué (no se puede mirar con el navegador).
- La autoría de cada respuesta no se oculta en ningún caso: la lectura con flechita la muestra a propósito.

### Fantasmas
- Nunca puntúan: nadie puede votarles, **su voto tampoco cuenta** y no cobran.
- Siguen escribiendo su respuesta, que se lee al final y se marca como "carta fantasma".
- La votación **no espera** a los fantasmas: acaba cuando han votado todos los vivos.

### Tiempo para escribir
- 120 s por defecto. Al acabar el tiempo, se pasa a la lectura y quien no haya acabado queda en blanco ("(Se quedó en blanco. Cobarde.)").
- Si todos los jugadores **conectados** ya han pulsado Listo, se avanza sin esperar a los desconectados *(mi propuesta)*.

---

## 3. Trampas: qué se hace y qué queda fuera

**Se queda decidido:**
| Trampa | Solución |
|---|---|
| Cártel "todos a 1 pela" | Puja mínima proporcional |
| Esconderse en la última carta | Puja mínima proporcional |
| Pedir cartas nuevas pagando poca multa | La multa nunca baja del precio de salida |
| Fantasma "hacedor de reyes" | Los votos de fantasmas no cuentan |
| El líder se escapa | Hacienda (IRPF) |
| Comprar la carta y desaparecer | Tiempo máximo de escritura (120 s) |
| Macros de puja | Límite de 5 acciones por segundo por jugador *(mi propuesta)* |
| Trucar el cliente (consola del navegador) | Ya resuelto: el servidor valida todo y no envía respuestas ajenas antes de tiempo |

**Descartado por tu decisión:** el moderador se regala pelas, el moderador cierra la votación a su favor, la segunda pestaña, los votos recíprocos y el bonus de criterio. Se confía en el grupo.

**No se puede evitar desde el juego:** pasarse respuestas por Discord y votar mal a propósito para hundir al líder.

---

## 4. Plan de trabajo

### Fase 0: simulador
`scripts/simular.js`: juega cientos de partidas con bots de distinto carácter (tacaño, agresivo, de los que no pujan nunca) y saca la economía: pelas finales, fantasmas, relación gasto/ingreso. Primero imprime la tabla "antes", y después comprueba cada ajuste con los números de la sección 2.

### Fase 1: reglas (`server/juego.js`)
1. `ajustes` nuevos: `pujaMinPct`, `hacienda`, `votosAnonimos`, `tiempoEscribir`.
2. `precioSalida` calculado al empezar la ronda y usado en `pujar`, en `_sacarCarta` (detección de "nadie puede pagar") y en `vista`.
3. Multa = `max(15, precioSalida) × sinCarta`.
4. Hacienda aplicada tras el recuento de votos, salvo en la última ronda, con su resumen en `resultados`.
5. Votos de fantasmas: no se cuentan y no se esperan para cerrar la votación.
6. Temporizador de escritura de 120 s, con avance si todos los conectados están listos.
7. Votos públicos: `vista` incluye `votosDeCadaUno` solo si `votosAnonimos` es falso.
8. Pelas iniciales por defecto 150 y límite de 5 acciones por segundo (`server/index.js`).

### Fase 2: pantallas (`public/app.js`, `public/style.css`)
1. Sala de espera: controles de puja mínima (0–30), Hacienda, votos anónimos y tiempo, con los avisos sin bloqueo.
2. Subasta: "Puja desde X", botones de salida y texto de multa actualizado.
3. Escribir: cuenta atrás de 120 s visible.
4. Votación: los fantasmas ven "Los fantasmas miran".
5. Resultados: líneas de Hacienda y, si no son anónimos, el voto de cada jugador.

### Fase 3: pruebas (`test/juego.test.js`)
- Precio de salida con 0 %, 5 % y 30 %, y con media que cambia entre rondas.
- Multa igual a 15 × jugadores con precio ≤ 15, y a precio × jugadores con precio mayor.
- Hacienda: nunca adelanta a nadie, no cobra en la última ronda, no cobra a fantasmas ni a quien esté por debajo de la media.
- Voto de fantasma ignorado y votación que cierra sin ellos.
- Votos anónimos: la vista de ningún jugador contiene quién votó qué.
- Tiempo de escritura agotado: pasa a lectura con respuestas en blanco.
- Los bots (`scripts/bots.js`) se adaptan al precio de salida.

### Fase 4: prueba con amigos
Una partida real y se ajusta lo que haga falta en `CONFIG` de `server/juego.js` o en los ajustes de la sala. También se actualizan `PASOS.md` y `CLAUDE.md`.

---

## 5. Cosas que he decidido yo sin que me las pidieras (cámbialas si quieres)
- Pelas iniciales por defecto de 150, y los valores por defecto de puja mínima (5 %), Hacienda (normal 25 %) y tiempo de escritura (120 s).
- Que el moderador pueda cambiar los 120 s (o ponerlos a 0).
- Que Hacienda redondee hacia abajo y no cobre en la última ronda.
- Avance sin esperar a los desconectados al escribir.
- Límite de 5 acciones por segundo.
- Avisos informativos en la sala que no bloquean.
