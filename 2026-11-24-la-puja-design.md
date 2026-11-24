# La Puja — Diseño

Juego de fiesta online (móvil y PC) para grupos de amigos de España que juegan cada uno desde su casa, normalmente con Discord de fondo. Se entra con un enlace y un apodo, sin cuentas.

## Intención
- Mucha barbaridad y humor gamberro, en español de España.
- El grupo tiene poca imaginación: el juego pone la mitad de cada frase (la carta) y el jugador solo completa la otra mitad.
- Novedad frente a los juegos de cartas de fiesta: no hay mano de cartas. Las cartas se **subastan** con pelas, que son a la vez dinero y puntuación.
- Éxito: que el grupo se pique pujando, se ría con las respuestas y quiera repetir.

## Objetivos / No objetivos
- Objetivos: 3–8 jugadores, partida de 10 rondas, funcionar bien en móvil, sin registro ni guardado.
- No objetivos: cuentas de usuario, guardado de partidas, chat de voz/texto propio, salas públicas, partidas en las que se pueda entrar una vez empezadas.
- Anti-objetivo: que haya jugadores esperando sin hacer nada o que una recarga del móvil te deje fuera.

## Approaches (cómo construirlo)
1. **Servidor propio Node.js + Socket.IO** (elegido). El servidor es la única autoridad: decide quién gana cada puja, lleva los temporizadores y guarda el estado de la sala en memoria. Es lo que necesita una subasta en tiempo real y es lo más didáctico.
2. Base de datos en tiempo real (Firebase/Supabase) sin servidor propio. Más rápido de alojar, pero los temporizadores y los empates de puja quedan en manos de los clientes y es fácil que se desincronicen.
3. Conexión directa entre jugadores (WebRTC, sin servidor). Frágil con redes domésticas y móviles.

Front: HTML + CSS + JavaScript sin framework, diseñado primero para móvil. Estado en memoria (sin base de datos): si el servidor se reinicia, las salas se pierden. Decisiones de cómo construirlo tomadas por mí (Claude), no discutidas contigo.

## Flujo
**Crear sala.** Quien abre la web pulsa "Crear sala" y recibe un enlace `/sala/XXXX`. Esa persona es el moderador (y también juega). Quien abre el enlace entra a la sala de espera y pone **apodo** (se ve en partida) y **nombre real** (solo sale en cartas). Aviso +18 al entrar *(mi decisión)*.

**Sala de espera (solo el moderador cambia estos ajustes).**
- Tipos de carta: pregunta, respuesta, inicio de frase, fin de frase. Mínimo uno, se pueden marcar varios.
- Nombres en cartas: sí/no. Solo aparecen los nombres reales de quienes están al empezar.
- Pelas iniciales por jugador, una a una. Todos entran con 0; el moderador debe dar más de 0 a cada uno para poder empezar.
- El moderador puede **ceder el rol** a otro jugador. Si el moderador se desconecta, pasa al siguiente jugador *(mi decisión)*.
- Una vez empezada la partida, nadie nuevo puede entrar.

**Partida: 10 rondas.** El dinero de todos se ve siempre en pantalla. Gana quien tenga más pelas al final; los empates comparten la victoria.

### Fase 1 — Subasta
- Se saca una carta del mazo y **solo pujan quienes aún no tienen carta**.
- Botones +1 / +5 / +10. Puja mínima 1. **Nadie puede pujar todo su dinero**: la puja máxima es lo que tienes menos 1 *(mi decisión, para que pagar una puja nunca te deje en 0)*.
- Si **nadie puja**, hay una cuenta atrás de **30 s** con el aviso "Si nadie puja se perderán 15 × personas restantes". Si acaba sin pujas: cada jugador sin carta pierde **15 × (número de jugadores sin carta)**. Después la carta se descarta y sale otra.
- En cuanto alguien puja, empieza una cuenta corta de **8 s** que se reinicia con cada puja; al llegar a 0 gana la puja más alta, paga y se queda la carta *(mi decisión)*. El dinero de las pujas **se pierde** (va a la banca).
- La fase acaba cuando todos los jugadores activos tienen carta. El orden en que se ganaron las cartas fija el **orden de lectura**.

### Eliminación y jugadores fantasma
- Un jugador que **se queda en 0 pelas** (solo puede pasar por la penalización) queda eliminado para el resto de la partida. La penalización se calcula con el número de jugadores sin carta *antes* de aplicarla, y nunca baja de 0.
- Al acabar la fase de subasta, cada fantasma recibe una **carta aleatoria de las que han salido esa ronda**.
- El fantasma **escribe su respuesta** y aparece en la lectura **al final**, marcado siempre como **👻 carta fantasma, no se puede votar**, en su carta y en su respuesta. No puede ser votado ni cobra puntos.
- Los fantasmas **sí pueden votar** *(mi decisión, para que sigan jugando)*. No cuentan como jugadores sin carta ni se les penaliza.
- Si queda un solo jugador activo, la partida termina y gana él *(mi decisión)*.

### Fase 2 — Escribir
- Cada jugador ve su carta y escribe lo que le falta:

| Carta | Escribes |
|---|---|
| Pregunta | la respuesta |
| Respuesta | la pregunta más original y bizarra |
| Inicio de frase | el final |
| Fin de frase | el inicio |

- Al terminar pulsa **Listo**. Todos ven quién ha pulsado Listo y quién no. Sin límite de tiempo; el moderador puede forzar el paso a la lectura *(mi decisión)*.

### Fase 3 — Lectura
El moderador avanza con una flecha. Para cada carta, en orden de subasta: se muestra la carta → flecha → se muestra la respuesta, con **su autor y lo que pagó por la carta**. Los fantasmas van al final con su marca.

### Fase 4 — Votación
- Cada jugador (activos y fantasmas) coloca obligatoriamente su **top 3**: 1.º = 3 puntos, 2.º = 2, 3.º = 1.
- Nadie puede votarse a sí mismo ni a los fantasmas *(mi decisión)*. Si hay menos de 3 respuestas votables, se rellenan las que haya.
- Se suman los votos, se muestra el top 3 de la ronda y los puntos de todos.

### Fase 5 — Reparto
Cada punto = **5 pelas** para el autor de la respuesta. Los empates no hacen falta romperlos, porque todos cobran sus puntos.

## Restricciones
- Una recarga o corte de red no te expulsa: el navegador guarda un identificador y el servidor te devuelve tu sitio y tus pelas *(mi decisión)*.
- Las salas viven en memoria y se borran cuando se vacían o tras un tiempo de inactividad.
- Móvil primero: botones grandes, pantallas de una sola columna.

## Contenido
Las cartas las escribe Claude como mazos editables en archivos JSON (uno por tipo), con humor español y huecos `{nombre}` para los nombres reales. Se empieza con unas 150 cartas por tipo y se amplía después.

## A resolver por el constructor
- Hosting y enlace público (probar en local o con túnel, desplegar después).
- Diseño visual (paleta, tipografía, animaciones de la puja).
- Número exacto de cartas por mazo y ajuste de los tiempos (8 s, 30 s) tras probar con amigos.
