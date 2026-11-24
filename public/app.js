(() => {
  'use strict';

  // ───────────────────────── utilidades ─────────────────────────

  const $app = document.getElementById('app');
  const $toasts = document.getElementById('toasts');

  const TIPOS = {
    pregunta: { nombre: 'Pregunta', tuParte: 'la respuesta', ayuda: 'La carta pregunta, tú respondes.' },
    respuesta: { nombre: 'Respuesta', tuParte: 'la pregunta', ayuda: 'La carta es la respuesta, tú te inventas la pregunta.' },
    inicio: { nombre: 'Inicio de frase', tuParte: 'el final', ayuda: 'La carta empieza la frase, tú la acabas.' },
    fin: { nombre: 'Final de frase', tuParte: 'el principio', ayuda: 'La carta acaba la frase, tú la empiezas.' },
  };

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const pelas = (n) => `${n} ₧`;

  const ruta = location.pathname.match(/^\/sala\/([A-Za-z]{4,6})\/?$/);
  const codigo = ruta ? ruta[1].toUpperCase() : null;
  const enlaceSala = codigo ? `${location.origin}/sala/${codigo}` : '';

  const ui = {
    pantalla: codigo ? 'conectando' : 'inicio',
    vista: null,
    offset: 0,
    error: '',
    desconectado: false,
    borrador: '',
    claveBorrador: null,
    seleccion: [],
    claveSeleccion: null,
    ultimaCarta: null,
  };

  // ───────────────────────── identidad guardada ─────────────────────────

  const CLAVE = codigo ? `lapuja:${codigo}` : '';
  function leerToken() {
    try {
      return sessionStorage.getItem(CLAVE) || localStorage.getItem(CLAVE);
    } catch {
      return null;
    }
  }
  function guardarToken(t) {
    try {
      sessionStorage.setItem(CLAVE, t);
      localStorage.setItem(CLAVE, t);
    } catch {}
  }
  function borrarToken() {
    try {
      sessionStorage.removeItem(CLAVE);
      localStorage.removeItem(CLAVE);
    } catch {}
  }
  function guardarBorrador() {
    try {
      sessionStorage.setItem(`${CLAVE}:borrador:${ui.claveBorrador}`, ui.borrador);
    } catch {}
  }
  function leerBorrador(clave) {
    try {
      return sessionStorage.getItem(`${CLAVE}:borrador:${clave}`) || '';
    } catch {
      return '';
    }
  }

  // ───────────────────────── conexión ─────────────────────────

  const socket = codigo ? io({ autoConnect: true }) : null;

  function entrar(datos = {}) {
    socket.emit('entrar', { codigo, token: leerToken(), ...datos }, (r = {}) => {
      if (r.error) {
        if (ui.pantalla === 'unirse') toast(r.error, 'error');
        else {
          ui.pantalla = 'error';
          ui.error = r.error;
          render();
        }
        return;
      }
      if (r.necesitaDatos) {
        ui.pantalla = r.fase === 'sala' ? 'unirse' : 'enCurso';
        render();
        return;
      }
      guardarToken(r.token);
      ui.pantalla = 'sala';
      render();
    });
  }

  function accion(nombre, datos = {}) {
    socket.emit(nombre, datos, (r) => {
      if (r && r.error) {
        toast(r.error, 'error');
        render(); // devuelve los controles al estado real
      }
    });
  }

  if (socket) {
    socket.on('connect', () => {
      ui.desconectado = false;
      if (!['expulsado', 'sustituido'].includes(ui.pantalla)) entrar();
      render();
    });
    socket.on('disconnect', () => {
      ui.desconectado = true;
      render();
    });
    socket.on('estado', (v) => {
      ui.vista = v;
      ui.offset = v.ahora - Date.now();
      ui.pantalla = 'sala';
      render();
    });
    socket.on('evento', ({ texto, tipo }) => toast(texto, tipo));
    socket.on('expulsado', () => {
      borrarToken();
      ui.pantalla = 'expulsado';
      render();
    });
    socket.on('sustituido', () => {
      ui.pantalla = 'sustituido';
      render();
    });
  }

  // ───────────────────────── avisos ─────────────────────────

  function toast(texto, tipo = 'info') {
    const el = document.createElement('div');
    el.className = `toast toast-${tipo}`;
    el.textContent = texto;
    $toasts.appendChild(el);
    while ($toasts.children.length > 4) $toasts.firstChild.remove();
    setTimeout(() => el.classList.add('fuera'), tipo === 'grande' ? 5000 : 4000);
    setTimeout(() => el.remove(), tipo === 'grande' ? 5600 : 4600);
  }

  // ───────────────────────── render ─────────────────────────

  function render() {
    const activo = document.activeElement;
    let foco = null;
    if (activo && activo.id && $app.contains(activo)) {
      foco = { id: activo.id, valor: activo.value, ini: activo.selectionStart, fin: activo.selectionEnd };
    }
    $app.innerHTML = pantallaHTML();
    if (foco) {
      const el = document.getElementById(foco.id);
      if (el) {
        if (['INPUT', 'TEXTAREA'].includes(el.tagName) && el.type !== 'checkbox' && foco.valor !== undefined) el.value = foco.valor;
        el.focus({ preventScroll: true });
        try {
          el.setSelectionRange(foco.ini, foco.fin);
        } catch {}
      }
    }
    actualizarTemporizadores();
  }

  function pantallaHTML() {
    switch (ui.pantalla) {
      case 'inicio':
        return inicioHTML();
      case 'conectando':
        return mensajeHTML('Entrando en la sala…', 'Un momento, que estamos contando las pelas.');
      case 'unirse':
        return unirseHTML();
      case 'enCurso':
        return mensajeHTML(
          'Esta partida ya ha empezado',
          'Espera a que acabe y vuelve a abrir el enlace. Mientras, ve pensando barbaridades.',
          '<button class="btn" data-accion="reintentar">Probar otra vez</button>'
        );
      case 'expulsado':
        return mensajeHTML('Te han echado de la sala', 'El moderador ha hablado. Puedes crear tu propia sala y vengarte.', '<a class="btn" href="/">Crear una sala</a>');
      case 'sustituido':
        return mensajeHTML('Has abierto la partida en otra pestaña', 'Sigue jugando desde la otra. Esta ya no vale.', '');
      case 'error':
        return mensajeHTML('No se puede entrar', ui.error, '<a class="btn" href="/">Crear una sala nueva</a>');
      case 'sala':
        return salaHTML();
      default:
        return '';
    }
  }

  function mensajeHTML(titulo, texto, extra = '') {
    return `
      <main class="mensaje">
        <a href="/" class="logo">La Puja</a>
        <h1>${esc(titulo)}</h1>
        <p>${esc(texto)}</p>
        ${extra}
      </main>`;
  }

  // ───────────────────────── portada ─────────────────────────

  function inicioHTML() {
    return `
      <main class="portada">
        <h1 class="titulo">La Puja</h1>
        <p class="lema">Subastáis cartas con pelas, cada uno completa su barbaridad y votáis la mejor. Gana quien acabe con más dinero.</p>
        <div class="portada-carta">
          ${cartaHTML(
            { tipo: 'pregunta', texto: '¿Qué hizo la familia con las cenizas del abuelo cuando se acabó el Cola Cao?' },
            { texto: 'Lo mismo que con la abuela, pero con galletas.', revelada: true, autor: 'Chusqui', precio: 23 }
          )}
        </div>
        <ol class="pasos">
          <li><b>Pujad por la carta.</b> Solo pujan los que aún no tienen. Si nadie puja, todos los que no tienen carta pierden pelas.</li>
          <li><b>Rellenad la otra mitad.</b> Si la carta es una pregunta, tú respondes; si es un final de frase, tú la empiezas.</li>
          <li><b>Votad vuestro top 3.</b> Cada punto son 5&nbsp;₧. Quien se queda a 0 pelas pasa a ser fantasma.</li>
        </ol>
        <button class="btn btn-grande" data-accion="crear">Crear sala</button>
        <p class="aviso18">Para mayores de 18. Humor negro sin filtro: si te ofendes, cierra la pestaña. Se juega de 3 a 8 personas, cada uno desde su móvil o su PC.</p>
      </main>`;
  }

  // ───────────────────────── unirse ─────────────────────────

  function unirseHTML() {
    return `
      <main class="mensaje">
        <a href="/" class="logo">La Puja</a>
        <h1>Entra en la sala ${esc(codigo)}</h1>
        <form id="form-unirse" class="form">
          <label for="apodo">Tu apodo
            <small>Es lo que verán los demás durante la partida.</small>
          </label>
          <input id="apodo" name="apodo" maxlength="20" autocomplete="nickname" required placeholder="El Chusqui">
          <label for="nombre">Tu nombre real
            <small>Si el moderador activa los nombres, es el que sale en las cartas.</small>
          </label>
          <input id="nombre" name="nombre" maxlength="20" autocomplete="given-name" required placeholder="Jesús">
          <button class="btn btn-grande" type="submit">Entrar en la sala</button>
        </form>
        <p class="aviso18">Para mayores de 18. Aquí se viene a decir barbaridades.</p>
      </main>`;
  }

  // ───────────────────────── sala ─────────────────────────

  const jugador = (v, id) => v.jugadores.find((j) => j.id === id);

  /** Media de pelas de los vivos (los fantasmas no cuentan), redondeada. La misma que usan las reglas. */
  function mediaVivos(v) {
    const vivos = v.jugadores.filter((j) => !j.fantasma);
    return vivos.length ? Math.round(vivos.reduce((a, j) => a + j.pelas, 0) / vivos.length) : 0;
  }
  const apodo = (v, id) => (jugador(v, id) || { apodo: '¿?' }).apodo;

  function salaHTML() {
    const v = ui.vista;
    if (!v) return mensajeHTML('Entrando en la sala…', 'Un momento, que estamos contando las pelas.');
    const enPartida = v.fase !== 'sala';
    const yo = jugador(v, v.yo);
    return `
      <div class="sala fase-${v.fase}">
        ${ui.desconectado ? '<div class="sin-conexion">Sin conexión. Reconectando…</div>' : ''}
        <header class="barra">
          <a href="/" class="logo logo-peq" title="Ir a la portada">La Puja</a>
          <span class="barra-ronda">${
            enPartida && v.fase !== 'fin'
              ? `Ronda ${v.ronda}<span class="solo-ancho"> de </span><span class="solo-estrecho">/</span>${v.ajustes.rondas}`
              : v.fase === 'fin'
                ? 'Partida terminada'
                : 'Sala de espera'
          }</span>
          <span class="barra-media" title="Media de pelas de los jugadores vivos: es la que usan la puja mínima y Hacienda">Media <b>${pelas(mediaVivos(v))}</b></span>
          ${yo ? `<span class="barra-yo"><span class="solo-ancho">${esc(yo.apodo)}</span><span class="solo-estrecho">Tú</span> <b>${pelas(yo.pelas)}</b></span>` : ''}
        </header>
        <div class="cuerpo ${enPartida ? 'con-marcador' : ''}">
          ${enPartida ? marcadorHTML(v) : ''}
          <main class="escenario">${faseHTML(v)}</main>
        </div>
      </div>`;
  }

  function faseHTML(v) {
    switch (v.fase) {
      case 'sala':
        return lobbyHTML(v);
      case 'subasta':
        return subastaHTML(v);
      case 'escribir':
        return escribirHTML(v);
      case 'lectura':
        return lecturaHTML(v);
      case 'votacion':
        return votacionHTML(v);
      case 'resultados':
        return resultadosHTML(v);
      case 'fin':
        return finHTML(v);
      default:
        return '';
    }
  }

  function marcadorHTML(v) {
    const iconoFase = (j) => {
      if (v.fase === 'subasta') return j.tieneCarta ? '<span title="Ya tiene carta">🃏</span>' : '';
      if (v.fase === 'escribir') return j.listo ? '<span title="Listo">✅</span>' : '<span title="Escribiendo">✍️</span>';
      if (v.fase === 'votacion') {
        if (j.fantasma) return '';
        return j.votado ? '<span title="Ha votado">✅</span>' : '<span title="Votando">🤔</span>';
      }
      return '';
    };
    const filas = v.jugadores
      .map(
        (j) => `
        <li class="jug ${j.id === v.yo ? 'jug-yo' : ''} ${j.fantasma ? 'jug-fantasma' : ''} ${j.conectado ? '' : 'jug-off'}">
          <span class="jug-nombre">${j.id === v.modId ? '<span title="Moderador">👑</span> ' : ''}${j.fantasma ? '<span title="Fantasma">👻</span> ' : ''}${esc(j.apodo)}${j.conectado ? '' : ' <span title="Desconectado">📵</span>'}</span>
          <span class="jug-pelas">${pelas(j.pelas)}</span>
          <span class="jug-estado">${iconoFase(j)}</span>
        </li>`
      )
      .join('');
    return `<aside class="marcador" aria-label="Pelas de cada jugador"><ul>${filas}</ul></aside>`;
  }

  // ───────────────────────── cartas ─────────────────────────

  /** Une la carta y lo que escribió el jugador en el orden correcto según el tipo. */
  function cartaHTML(carta, opts = {}) {
    const { texto, revelada = false, fantasma = false, entra = false, autor, precio, editable = false, pie = '' } = opts;
    const info = TIPOS[carta.tipo];
    const parteCarta = `<span class="c-imprenta">${esc(carta.texto)}</span>`;
    let parteJugador;
    if (editable) {
      parteJugador = `<textarea id="respuesta" class="c-boli c-campo" maxlength="${ui.vista ? ui.vista.config.MAX_TEXTO : 200}" rows="3" placeholder="Escribe aquí ${info.tuParte}…" aria-label="Escribe ${info.tuParte}">${esc(ui.borrador)}</textarea>`;
    } else if (revelada) {
      parteJugador = texto ? `<span class="c-boli">${esc(texto)}</span>` : '<span class="c-boli c-blanco">(Se quedó en blanco. Cobarde.)</span>';
    } else {
      parteJugador = '<span class="c-hueco" aria-label="Respuesta oculta"></span>';
    }
    const jugadorPrimero = carta.tipo === 'respuesta' || carta.tipo === 'fin';
    const enLinea = carta.tipo === 'inicio' || carta.tipo === 'fin';
    const cuerpo = enLinea
      ? `<p class="c-frase">${jugadorPrimero ? `${parteJugador} ${parteCarta}` : `${parteCarta} ${parteJugador}`}</p>`
      : jugadorPrimero
        ? `<p class="c-linea">${parteJugador}</p><p class="c-linea">${parteCarta}</p>`
        : `<p class="c-linea">${parteCarta}</p><p class="c-linea">${parteJugador}</p>`;
    const firma =
      autor !== undefined && (revelada || editable)
        ? `<p class="c-firma">${esc(autor)}${precio !== undefined && !fantasma ? `, que pagó ${pelas(precio)}` : ''}</p>`
        : '';
    return `
      <article class="carta ${fantasma ? 'carta-fantasma' : ''} ${entra ? 'carta-entra' : ''} ${editable ? 'carta-editable' : ''}">
        <header class="c-cabecera"><span class="c-cruz" aria-hidden="true">✝</span><span class="c-tipo">${info.nombre}</span></header>
        ${cuerpo}
        ${firma}
        ${fantasma ? '<p class="c-sello">👻 Carta fantasma. No se puede votar.</p>' : ''}
        ${pie}
      </article>`;
  }

  /** Versión en una línea para listas. */
  function fraseHTML(carta, texto) {
    const c = `<span class="f-imprenta">${esc(carta.texto)}</span>`;
    const t = texto ? `<span class="f-boli">${esc(texto)}</span>` : '<span class="f-boli c-blanco">(en blanco)</span>';
    switch (carta.tipo) {
      case 'pregunta':
        return `${c} ${t}`;
      case 'respuesta':
        return `${t} ${c}`;
      case 'inicio':
        return `${c} ${t}`;
      case 'fin':
        return `${t} ${c}`;
      default:
        return c;
    }
  }

  // ───────────────────────── sala de espera ─────────────────────────

  function lobbyHTML(v) {
    const soyMod = v.yo === v.modId;
    const dis = soyMod ? '' : 'disabled';
    const pobres = v.jugadores.filter((j) => j.pelas <= 0);
    const faltan = Math.max(0, v.config.MIN_JUGADORES - v.jugadores.length);
    let motivo = '';
    if (faltan) motivo = `Faltan ${faltan} jugador${faltan > 1 ? 'es' : ''} como mínimo.`;
    else if (pobres.length) motivo = `Dale pelas a ${pobres.map((j) => j.apodo).join(', ')}.`;

    const jugadores = v.jugadores
      .map((j) => {
        const esYo = j.id === v.yo;
        const controlPelas = soyMod
          ? `<input id="pelas-${j.id}" class="campo-pelas" type="number" inputmode="numeric" min="0" max="100000" value="${j.pelas}" data-cambio="pelas" data-id="${j.id}" aria-label="Pelas de ${esc(j.apodo)}"><span class="peseta">₧</span>`
          : `<span class="jug-pelas">${pelas(j.pelas)}</span>`;
        const acciones =
          soyMod && !esYo
            ? `<button class="btn-mini" data-accion="ceder" data-id="${j.id}">Hacer moderador</button>
               <button class="btn-mini btn-peligro" data-accion="expulsar" data-id="${j.id}">Echar</button>`
            : '';
        return `
          <li class="lobby-jug ${j.conectado ? '' : 'jug-off'}">
            <span class="lobby-nombre">
              ${j.id === v.modId ? '<span title="Moderador">👑</span>' : ''}
              <b>${esc(j.apodo)}</b>${esYo ? ` <small>(tú; en las cartas sales como «${esc(v.miNombre)}»)</small>` : ''}${j.conectado ? '' : ' <small>desconectado</small>'}
            </span>
            <span class="lobby-pelas">${controlPelas}</span>
            ${acciones ? `<span class="lobby-acciones">${acciones}</span>` : ''}
          </li>`;
      })
      .join('');

    const tipos = Object.entries(TIPOS)
      .map(
        ([t, info]) => `
        <label class="check">
          <input type="checkbox" data-cambio="tipo" value="${t}" ${v.ajustes.tipos[t] ? 'checked' : ''} ${dis}>
          <span><b>${info.nombre}.</b> ${info.ayuda}</span>
        </label>`
      )
      .join('');

    // Cálculos para los avisos de economía (informativos: no bloquean nada)
    const n = v.jugadores.length;
    const mediaPelas = n ? v.jugadores.reduce((a, j) => a + j.pelas, 0) / n : 0;
    const precio = Math.max(1, Math.round((mediaPelas * v.ajustes.pujaMinPct) / 100));
    const multaBase = Math.max(v.config.PENALIZACION, precio);
    const multaPrimera = multaBase * n;
    const caen = v.jugadores.filter((j) => j.pelas > 0 && j.pelas <= multaPrimera);
    const textoPrecio =
      mediaPelas > 0
        ? `Con la media actual (${Math.round(mediaPelas)} ₧), las cartas saldrían desde <b>${pelas(precio)}</b>.${
            v.ajustes.pujaMinPct > 10 ? ' Ojo: por encima del 10 % las partidas se vuelven muy duras y salen muchos fantasmas.' : ''
          }`
        : 'Reparte pelas para ver a cuánto saldrían las cartas.';
    const avisoMulta =
      mediaPelas > 0
        ? `<p class="nota ${caen.length ? 'nota-aviso' : ''}">Si nadie puja la primera carta, cada uno pierde <b>${pelas(multaPrimera)}</b> (${multaBase} × ${n}).${
            caen.length
              ? ` ${caen.map((j) => esc(j.apodo)).join(', ')} se quedaría${caen.length > 1 ? 'n' : ''} a 0 y pasaría${caen.length > 1 ? 'n' : ''} a fantasma.`
              : ''
          }</p>`
        : '';
    const avisoRacha = `<p class="nota">Cada carta seguida que nadie puja <b>duplica la sanción</b> (×2, ×4, ×8…). Vuelve a ×1 en cuanto se vende una carta o empieza otra ronda.</p>`;
    const opcionesHacienda = Object.entries(v.config.HACIENDA)
      .map(([nivel, tasa]) => {
        const nombre = { apagada: 'Apagada', suave: 'Suave', normal: 'Normal', salvaje: 'Salvaje' }[nivel] || nivel;
        return `<option value="${nivel}" ${v.ajustes.hacienda === nivel ? 'selected' : ''}>${nombre}${tasa ? ` (${Math.round(tasa * 100)} %)` : ''}</option>`;
      })
      .join('');

    return `
      <section class="bloque compartir">
        <h2>Pasa este enlace al grupo</h2>
        <p class="enlace"><code>${esc(enlaceSala)}</code></p>
        <div class="fila">
          <button class="btn" data-accion="copiar">Copiar enlace</button>
          ${navigator.share ? '<button class="btn btn-sec" data-accion="compartir">Compartir</button>' : ''}
        </div>
      </section>

      <section class="bloque">
        <h2>Jugadores <small>${v.jugadores.length} de ${v.config.MAX_JUGADORES}</small></h2>
        <ul class="lobby-lista">${jugadores}</ul>
        ${
          soyMod
            ? `<form id="form-dar" class="fila dar-todos">
                <label for="dar-todos">Dar a todos</label>
                <input id="dar-todos" type="number" inputmode="numeric" min="1" max="100000" value="${v.config.PELAS_INICIALES}"><span class="peseta">₧</span>
                <button class="btn btn-sec" type="submit">Aplicar</button>
              </form>
              <p class="nota">Cada uno puede empezar con distinto dinero, por ejemplo para seguir una partida anterior. Al salir de la sala se pierden las pelas.</p>`
            : ''
        }
      </section>

      <section class="bloque">
        <h2>Ajustes ${soyMod ? '' : '<small>los elige el moderador</small>'}</h2>
        <fieldset class="tipos" ${dis}><legend>Tipos de carta</legend>${tipos}</fieldset>
        <label class="check">
          <input type="checkbox" data-cambio="nombres" ${v.ajustes.nombres ? 'checked' : ''} ${dis}>
          <span><b>Usar vuestros nombres reales en las cartas.</b> Solo salen los de quienes estén en la sala al empezar.</span>
        </label>
        <label class="fila ajuste" for="rondas">Rondas
          <input id="rondas" type="number" inputmode="numeric" min="1" max="30" value="${v.ajustes.rondas}" data-cambio="rondas" ${dis}>
        </label>
        <label class="fila ajuste" for="tiempoEscribir">Tiempo para escribir
          <input id="tiempoEscribir" type="number" inputmode="numeric" min="0" max="${v.config.TIEMPO_ESCRIBIR_MAX}" step="10" value="${v.ajustes.tiempoEscribir}" data-cambio="tiempoEscribir" ${dis}>
          <span>segundos</span>
        </label>
        <p class="nota">0 = sin límite. Al acabarse el tiempo, cuenta lo que cada uno tenga escrito.</p>
        <label class="check">
          <input type="checkbox" data-cambio="votosAnonimos" ${v.ajustes.votosAnonimos ? 'checked' : ''} ${dis}>
          <span><b>Votos anónimos.</b> Si no los marcas, después de cada ronda se ve quién votó a quién.</span>
        </label>
      </section>

      <section class="bloque">
        <h2>Economía</h2>
        <label class="fila ajuste" for="pujaMinPct">Puja mínima
          <input id="pujaMinPct" type="number" inputmode="numeric" min="0" max="${v.config.PUJA_MIN_PCT_MAX}" value="${v.ajustes.pujaMinPct}" data-cambio="pujaMinPct" ${dis}>
          <span>% de la media de pelas</span>
        </label>
        <p class="nota">${textoPrecio} Con 0 % se puede pujar desde 1.</p>
        <label class="fila ajuste" for="hacienda">Hacienda
          <select id="hacienda" data-cambio="hacienda" ${dis}>${opcionesHacienda}</select>
        </label>
        <p class="nota">Después de cada ronda (menos la última), quien tenga más pelas que la media paga ese porcentaje de lo que se pasa. Lo que cobra desaparece.</p>
        ${avisoMulta}
        ${avisoRacha}
      </section>

      <section class="bloque arranque">
        ${
          soyMod
            ? `<button class="btn btn-grande" data-accion="empezar" ${motivo ? 'disabled' : ''}>Empezar partida</button>
               ${motivo ? `<p class="nota">${esc(motivo)}</p>` : ''}`
            : `<p class="espera">Esperando a que <b>${esc(apodo(v, v.modId))}</b> empiece la partida.</p>`
        }
        <button class="btn-texto" data-accion="salir">Salir de la sala</button>
      </section>`;
  }

  // ───────────────────────── subasta ─────────────────────────

  function subastaHTML(v) {
    const s = v.subasta;
    const yo = jugador(v, v.yo);
    const sinCarta = s.sinCarta.includes(v.yo);
    const puedoPujar = yo && !yo.fantasma && sinCarta;
    const base = s.puja ? s.puja.cantidad : 0;
    const voyGanando = s.puja && s.puja.id === v.yo;

    const claveCarta = `${v.ronda}:${s.ganadas.length}:${s.carta.texto}`;
    const entra = ui.ultimaCarta !== claveCarta;
    ui.ultimaCarta = claveCarta;

    const estadoPuja = s.puja
      ? `<p class="puja-estado">Va ganando <b>${voyGanando ? 'tú' : esc(apodo(v, s.puja.id))}</b> con <b class="oro">${pelas(s.puja.cantidad)}</b></p>`
      : `<p class="puja-estado">Nadie ha pujado todavía. Sale desde <b class="oro">${pelas(s.precioSalida)}</b></p>`;

    // La cuenta de la multa, con el multiplicador de la racha si lo hay: "2 × 15 × 3"
    const cuenta = `${s.multiplicador > 1 ? `${s.multiplicador} × ` : ''}${s.multaBase} × ${s.sinCarta.length}`;
    const racha =
      s.multiplicador > 1 && s.modo !== 'pujando'
        ? `<p class="aviso aviso-racha">🔥 ${
            s.silencios === 1 ? 'La carta anterior se quedó' : `Las ${s.silencios} cartas anteriores se quedaron`
          } sin pujas: esta sanción va ×${s.multiplicador}. Si tampoco se puja esta, la siguiente irá ×${s.multiplicador * 2}.</p>`
        : '';
    let aviso;
    if (s.modo === 'pujando') {
      aviso = `<p class="aviso">Si nadie sube en <b class="js-seg">8</b> s, se la lleva ${voyGanando ? 'tú' : esc(apodo(v, s.puja.id))}.</p>`;
    } else if (s.nadiePuede) {
      aviso = `<p class="aviso aviso-peligro">Nadie sin carta llega al precio de salida (${pelas(s.precioSalida)}). Cada uno pierde <b>${pelas(s.multa)}</b> (${cuenta}) en <b class="js-seg"></b> s.</p>${racha}`;
    } else {
      aviso = `<p class="aviso aviso-peligro">Si nadie puja en <b class="js-seg">30</b> s, cada uno de los ${s.sinCarta.length} sin carta pierde <b>${pelas(s.multa)}</b> (${cuenta}).</p>${racha}`;
    }

    let mando = '';
    if (puedoPujar) {
      // Sin pujas: "Salida" paga el precio de salida y +5/+10 se suman a él. Con puja: +1/+5/+10 sobre la actual.
      const botones = v.config.INCREMENTOS.map((inc) => {
        const total = s.puja ? base + inc : s.precioSalida + (inc === 1 ? 0 : inc);
        const etiqueta = !s.puja && inc === 1 ? 'Salida' : `+${inc}`;
        const no = voyGanando || total > s.miMax;
        return `<button class="btn-puja" data-accion="pujar" data-inc="${inc}" ${no ? 'disabled' : ''}>
            <span class="puja-inc">${etiqueta}</span><span class="puja-total">pujar ${total}</span>
          </button>`;
      }).join('');
      const minimo = s.puja ? base + 1 : s.precioSalida;
      mando = `
        <div class="pujas">${botones}</div>
        <p class="nota">${
          s.miMax >= minimo
            ? `Puedes pujar hasta ${pelas(s.miMax)}: siempre te tiene que quedar 1 pela.`
            : `No te llega: haría falta pujar ${pelas(minimo)} y como mucho puedes ${pelas(Math.max(0, s.miMax))}. Reza para que alguien se la lleve.`
        }</p>`;
    } else if (yo && yo.fantasma) {
      mando = '<p class="nota nota-fantasma">👻 Eres un fantasma. Al acabar la subasta te tocará una de las cartas de esta ronda, al azar.</p>';
    } else {
      const mia = s.ganadas.find((g) => g.id === v.yo);
      mando = `<p class="nota">Ya tienes tu carta${mia ? `, te costó ${pelas(mia.precio)}` : ''}. Ahora mira cómo se arruinan los demás.</p>`;
    }

    const ganadas = s.ganadas.length
      ? `<section class="bloque">
          <h2>Cartas vendidas esta ronda</h2>
          <ol class="vendidas">${s.ganadas
            .map((g) => `<li><b>${esc(apodo(v, g.id))}</b> pagó <b class="oro">${pelas(g.precio)}</b><br><span class="f-imprenta">${esc(g.carta.texto)}</span></li>`)
            .join('')}</ol>
        </section>`
      : '';

    return `
      <section class="subasta">
        <p class="subasta-num">Carta ${s.ganadas.length + 1} de la ronda. Quedan ${s.sinCarta.length} sin carta.</p>
        ${cartaHTML(s.carta, { entra })}
        <p class="subasta-ayuda">Quien gane esta carta tendrá que escribir ${TIPOS[s.carta.tipo].tuParte}.</p>
        ${
          v.ajustes.pujaMinPct > 0
            ? `<p class="subasta-ayuda">Salida de esta ronda: ${v.ajustes.pujaMinPct} % de ${pelas(s.mediaSalida)}, la media al empezar la ronda.</p>`
            : ''
        }
        ${estadoPuja}
        <div class="timer ${s.modo === 'espera' ? 'timer-peligro' : ''}" data-limite="${s.limite}" data-duracion="${s.duracion}">
          <div class="timer-barra"></div>
        </div>
        ${aviso}
        ${mando}
      </section>
      ${ganadas}`;
  }

  // ───────────────────────── escribir ─────────────────────────

  function escribirHTML(v) {
    const e = v.miEntrada;
    const faltan = v.jugadores.filter((j) => j.tieneCarta && !j.listo);
    const soyMod = v.yo === v.modId;
    const claveB = `${v.ronda}`;
    if (ui.claveBorrador !== claveB) {
      ui.claveBorrador = claveB;
      ui.borrador = leerBorrador(claveB);
    }

    const pendientes = faltan.length
      ? `<p class="nota">Faltan por acabar: ${faltan.map((j) => `<b>${esc(j.apodo)}</b>`).join(', ')}.</p>`
      : '';
    const forzar = soyMod && faltan.length ? '<button class="btn-texto" data-accion="forzar">Pasar a la lectura sin esperar</button>' : '';

    if (!e) return `<section class="bloque"><p>No tienes carta esta ronda.</p>${pendientes}${forzar}</section>`;
    const info = TIPOS[e.carta.tipo];
    const fantasma = e.fantasma ? '<p class="nota nota-fantasma">👻 Eres un fantasma: escribe igual, que se leerá al final. Nadie te puede votar.</p>' : '';
    const reloj = v.escribir
      ? `<div class="timer" data-limite="${v.escribir.limite}" data-duracion="${v.escribir.duracion}"><div class="timer-barra"></div></div>
         <p class="nota nota-reloj">Quedan <b class="js-seg"></b> s.${e.listo ? '' : ' Si se acaba el tiempo, se envía lo que tengas escrito.'}</p>`
      : '';

    if (e.listo) {
      return `
        <section class="escribir">
          ${fantasma}
          ${reloj}
          ${cartaHTML(e.carta, { texto: e.texto, revelada: true, fantasma: e.fantasma })}
          <p class="espera">Listo. Esperando a los demás.</p>
          <button class="btn btn-sec" data-accion="editar">Cambiar mi respuesta</button>
          ${pendientes}
          ${forzar}
        </section>`;
    }

    return `
      <section class="escribir">
        ${fantasma}
        <h2 class="escribir-titulo">Te toca escribir ${info.tuParte}</h2>
        ${reloj}
        ${cartaHTML(e.carta, { editable: true, fantasma: e.fantasma })}
        <div class="fila fila-listo">
          <span class="contador"><span id="contador">${ui.borrador.length}</span>/${v.config.MAX_TEXTO}</span>
          <button class="btn btn-grande" data-accion="listo">Listo</button>
        </div>
        ${pendientes}
        ${forzar}
      </section>`;
  }

  // ───────────────────────── lectura ─────────────────────────

  function lecturaHTML(v) {
    const l = v.lectura;
    const item = l.items[l.indice];
    const soyMod = v.yo === v.modId;
    const ultimoPaso = l.paso >= l.total - 1;
    const etiqueta = !item.revelada ? 'Destapar respuesta' : ultimoPaso ? 'Ir a votar' : 'Siguiente carta';
    const autor = apodo(v, item.id);

    const pie = item.revelada ? '' : `<p class="c-firma c-firma-oculta">¿Qué habrá puesto ${esc(autor)}?</p>`;
    const anteriores = l.items
      .slice(0, l.indice)
      .reverse()
      .map((it) => `<li class="${it.fantasma ? 'li-fantasma' : ''}">${fraseHTML(it.carta, it.texto)} <small>${esc(apodo(v, it.id))}${it.fantasma ? ' 👻' : ''}</small></li>`)
      .join('');

    return `
      <section class="lectura">
        <p class="subasta-num">Carta ${l.indice + 1} de ${l.total / 2}, en el orden en que se ganaron</p>
        ${cartaHTML(item.carta, { texto: item.texto, revelada: item.revelada, fantasma: item.fantasma, autor, precio: item.precio, pie })}
        ${
          soyMod
            ? `<div class="fila mandos-lectura">
                <button class="btn btn-sec btn-flecha" data-accion="avanzar" data-dir="-1" ${l.paso === 0 ? 'disabled' : ''} aria-label="Atrás">◀</button>
                <button class="btn btn-grande" data-accion="avanzar" data-dir="1">${etiqueta} ▶</button>
              </div>
              <p class="nota">Lee la carta en voz alta y destapa la respuesta cuando haya tensión.</p>`
            : `<p class="espera"><b>${esc(apodo(v, v.modId))}</b> va destapando las cartas. Leedlas en voz alta.</p>`
        }
      </section>
      ${anteriores ? `<section class="bloque"><h2>Ya leídas</h2><ul class="lista-frases">${anteriores}</ul></section>` : ''}`;
  }

  // ───────────────────────── votación ─────────────────────────

  function votacionHTML(v) {
    const vo = v.votacion;
    const soyMod = v.yo === v.modId;
    const faltan = v.jugadores.filter((j) => !j.votado && !j.fantasma);
    if (ui.claveSeleccion !== `${v.ronda}`) {
      ui.claveSeleccion = `${v.ronda}`;
      ui.seleccion = [];
    }
    const pendientes = faltan.length ? `<p class="nota">Faltan por votar: ${faltan.map((j) => `<b>${esc(j.apodo)}</b>`).join(', ')}.</p>` : '';
    const forzar = soyMod && faltan.length ? '<button class="btn-texto" data-accion="forzar">Cerrar la votación ya</button>' : '';
    const opcion = (o) => vo.opciones.find((x) => x.id === o);
    const yo = jugador(v, v.yo);

    if (yo && yo.fantasma) {
      const lista = vo.opciones
        .map((o) => `<li class="${o.fantasma ? 'li-fantasma' : ''}">${fraseHTML(o.carta, o.texto)} <small>${esc(apodo(v, o.id))}${o.fantasma ? ' 👻' : ''}</small></li>`)
        .join('');
      return `
        <section class="bloque">
          <h2>Los fantasmas no votan</h2>
          <p class="nota nota-fantasma">👻 Mira cómo se pelean los vivos. Tu voto no contaría.</p>
          <ul class="lista-frases">${lista}</ul>
          ${pendientes}
          ${forzar}
        </section>`;
    }

    if (vo.miVoto) {
      return `
        <section class="bloque">
          <h2>Voto enviado</h2>
          <ol class="lista-frases">${vo.miVoto.map((id) => `<li>${fraseHTML(opcion(id).carta, opcion(id).texto)} <small>${esc(apodo(v, id))}</small></li>`).join('')}</ol>
          ${pendientes}
          ${forzar}
        </section>`;
    }

    const n = vo.requeridos;
    const opciones = vo.opciones
      .map((o) => {
        const mia = o.id === v.yo;
        const no = mia || o.fantasma;
        const pos = ui.seleccion.indexOf(o.id);
        const meta = mia ? 'La tuya' : o.fantasma ? `👻 ${esc(apodo(v, o.id))}, fantasma: no se puede votar` : esc(apodo(v, o.id));
        return `
          <li>
            <button class="opcion ${pos >= 0 ? 'opcion-elegida' : ''} ${o.fantasma ? 'opcion-fantasma' : ''}" data-accion="elegir" data-id="${o.id}" ${no ? 'disabled' : ''} aria-pressed="${pos >= 0}">
              <span class="opcion-pos" aria-hidden="true">${pos >= 0 ? `${pos + 1}.º` : ''}</span>
              <span class="opcion-texto">${fraseHTML(o.carta, o.texto)}</span>
              <span class="opcion-meta">${meta}</span>
            </button>
          </li>`;
      })
      .join('');

    return `
      <section class="votacion">
        <h2>Elige tu top ${n}</h2>
        <p class="nota">Toca las respuestas por orden: la primera que toques es tu 1.º (3 puntos), luego el 2.º (2) y el 3.º (1). Toca otra vez para quitarla. Cada punto son ${v.config.PELAS_POR_PUNTO}&nbsp;₧ para quien la escribió. Sé honesto, que nos conocemos.</p>
        <ul class="opciones">${opciones}</ul>
        <button class="btn btn-grande" data-accion="votar" ${ui.seleccion.length === n ? '' : 'disabled'}>Enviar mi top ${n}</button>
        ${pendientes}
        ${forzar}
      </section>`;
  }

  // ───────────────────────── resultados ─────────────────────────

  function resultadosHTML(v) {
    const soyMod = v.yo === v.modId;
    const medallas = ['🥇', '🥈', '🥉'];
    const top = v.resultados.filter((r) => r.puntos > 0).slice(0, 3);
    const podio = top.length
      ? top
          .map(
            (r, i) => `
          <li class="podio-${i + 1}">
            <span class="medalla" aria-hidden="true">${medallas[i]}</span>
            <p class="podio-frase">${fraseHTML(r.carta, r.texto)}</p>
            <p class="podio-autor"><b>${esc(apodo(v, r.id))}</b>: ${r.puntos} puntos, <b class="oro">+${pelas(r.pelas)}</b></p>
          </li>`
          )
          .join('')
      : '<li><p>Nadie ha sacado ni un punto. Qué nivel.</p></li>';

    const h = v.hacienda;
    const cobrado = Boolean(h && h.estado === 'cobrada' && h.total > 0);
    const pagoDe = (id) => (cobrado ? (h.cobros.find((c) => c.id === id) || { paga: 0 }).paga : 0);
    const tabla = v.resultados
      .map((r) => {
        const paga = pagoDe(r.id);
        return `<tr><td>${esc(apodo(v, r.id))}</td><td>${r.puntos}</td><td class="oro">+${pelas(r.pelas)}</td>${
          cobrado ? `<td class="rojo">${paga ? `−${pelas(paga)}` : ''}</td>` : ''
        }<td>${pelas(jugador(v, r.id).pelas)}</td></tr>`;
      })
      .join('');
    const hayFantasmas = v.jugadores.some((j) => j.fantasma);

    let textoHacienda = '';
    if (h && h.estado === 'cobrada') {
      textoHacienda = h.total
        ? `🏛️ Hacienda (${Math.round(h.tasa * 100)} %) se lleva <b>${pelas(h.total)}</b> de quien pasa de la media (${pelas(h.media)}): ${h.cobros
            .map((c) => `${esc(apodo(v, c.id))} −${c.paga}`)
            .join(', ')}.`
        : '🏛️ Hacienda ha venido y no ha encontrado nada que cobrar.';
    } else if (h && h.estado === 'ultima') {
      textoHacienda = '🏛️ Última ronda: Hacienda perdona.';
    }

    const votos = v.votos
      ? `<section class="bloque">
          <h2>Quién votó a quién</h2>
          <ul class="lista-votos">${v.votos
            .map((x) => `<li><b>${esc(apodo(v, x.id))}</b>: ${x.ranking.map((id, i) => `${i + 1}.º ${esc(apodo(v, id))}`).join(', ')}</li>`)
            .join('')}</ul>
        </section>`
      : '';

    return `
      <section class="resultados">
        <h2>Lo mejor de la ronda ${v.ronda}</h2>
        <ol class="podio">${podio}</ol>
      </section>
      <section class="bloque">
        <h2>Puntos de la ronda</h2>
        <table class="tabla">
          <thead><tr><th>Jugador</th><th>Puntos</th><th>Gana</th>${cobrado ? '<th>Hacienda</th>' : ''}<th>Total</th></tr></thead>
          <tbody>${tabla}</tbody>
        </table>
        ${textoHacienda ? `<p class="hacienda">${textoHacienda}</p>` : ''}
        ${hayFantasmas ? '<p class="nota">Los fantasmas no puntúan.</p>' : ''}
        ${v.ajustes.votosAnonimos ? '<p class="nota">Votos anónimos: solo se ven los totales.</p>' : ''}
      </section>
      ${votos}
      <section class="bloque arranque">
        ${
          soyMod
            ? `<button class="btn btn-grande" data-accion="siguiente">${v.esUltima ? 'Ver el resultado final' : `Empezar la ronda ${v.ronda + 1}`}</button>`
            : `<p class="espera">Esperando a que <b>${esc(apodo(v, v.modId))}</b> pase a ${v.esUltima ? 'los resultados finales' : 'la siguiente ronda'}.</p>`
        }
      </section>`;
  }

  // ───────────────────────── final ─────────────────────────

  function finHTML(v) {
    const soyMod = v.yo === v.modId;
    const ganadores = v.ganadores.map((id) => jugador(v, id)).filter(Boolean);
    const ranking = v.jugadores
      .slice()
      .sort((a, b) => b.pelas - a.pelas)
      .map((j) => `<tr class="${v.ganadores.includes(j.id) ? 'fila-ganador' : ''}"><td>${j.fantasma ? '👻 ' : ''}${esc(j.apodo)}</td><td class="oro">${pelas(j.pelas)}</td></tr>`)
      .join('');
    const titular = ganadores.length
      ? ganadores.length === 1
        ? `Gana ${esc(ganadores[0].apodo)}`
        : `Empate entre ${ganadores.map((g) => esc(g.apodo)).join(' y ')}`
      : 'No gana nadie';
    const sub = ganadores.length
      ? `con ${pelas(ganadores[0].pelas)}. Que lo pague con una ronda.`
      : 'Estáis todos en la ruina. Como el país.';

    return `
      <section class="final">
        ${cartaHTML({ tipo: 'fin', texto: sub }, { texto: titular, revelada: true })}
      </section>
      <section class="bloque">
        <h2>Clasificación final</h2>
        <table class="tabla"><tbody>${ranking}</tbody></table>
      </section>
      <section class="bloque arranque">
        ${
          soyMod
            ? '<button class="btn btn-grande" data-accion="reiniciar">Volver a la sala para otra partida</button><p class="nota">Las pelas se conservan; puedes cambiarlas en la sala.</p>'
            : `<p class="espera">Esperando a que <b>${esc(apodo(v, v.modId))}</b> prepare otra partida.</p>`
        }
      </section>`;
  }

  // ───────────────────────── temporizadores ─────────────────────────

  function actualizarTemporizadores() {
    const ahora = Date.now() + ui.offset;
    for (const t of document.querySelectorAll('[data-limite]')) {
      const limite = Number(t.dataset.limite);
      const duracion = Number(t.dataset.duracion) || 30000;
      const restante = Math.max(0, limite - ahora);
      const barra = t.querySelector('.timer-barra');
      if (barra) barra.style.transform = `scaleX(${Math.min(1, restante / duracion)})`;
      t.classList.toggle('timer-urgente', restante < 3000);
    }
    const seg = document.querySelector('[data-limite]');
    if (seg) {
      const restante = Math.max(0, Number(seg.dataset.limite) - ahora);
      for (const el of document.querySelectorAll('.js-seg')) el.textContent = Math.ceil(restante / 1000);
    }
  }
  setInterval(actualizarTemporizadores, 200);

  // ───────────────────────── interacción ─────────────────────────

  async function crearSala(boton) {
    boton.disabled = true;
    try {
      const r = await fetch('/api/salas', { method: 'POST' });
      if (!r.ok) throw new Error();
      const { codigo: nuevo } = await r.json();
      location.href = `/sala/${nuevo}`;
    } catch {
      boton.disabled = false;
      toast('No se ha podido crear la sala. ¿Está el servidor encendido?', 'error');
    }
  }

  async function copiarEnlace() {
    try {
      await navigator.clipboard.writeText(enlaceSala);
      toast('Enlace copiado. Pégalo en el grupo.');
    } catch {
      prompt('Copia este enlace:', enlaceSala);
    }
  }

  function enviarRespuesta() {
    const texto = ui.borrador.trim();
    if (!texto) return toast('Escribe algo, aunque sea una burrada.', 'error');
    accion('responder', { texto });
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-accion]');
    if (!b || b.disabled) return;
    const d = b.dataset;
    const v = ui.vista;
    switch (d.accion) {
      case 'crear':
        return crearSala(b);
      case 'reintentar':
        return entrar();
      case 'copiar':
        return copiarEnlace();
      case 'compartir':
        return navigator.share({ title: 'La Puja', text: 'Entra a mi partida de La Puja:', url: enlaceSala }).catch(() => {});
      case 'empezar':
      case 'siguiente':
      case 'reiniciar':
      case 'editar':
        return accion(d.accion);
      case 'forzar':
        if (confirm('¿Seguro? Quien no haya terminado se queda fuera.')) accion('forzar');
        return;
      case 'salir':
        if (!confirm('¿Salir de la sala? Perderás tus pelas.')) return;
        borrarToken();
        socket.emit('salir', {}, () => (location.href = '/'));
        return;
      case 'ceder':
        if (confirm(`¿Hacer moderador a ${apodo(v, d.id)}? Dejarás de serlo tú.`)) accion('ceder', { id: d.id });
        return;
      case 'expulsar':
        if (confirm(`¿Echar a ${apodo(v, d.id)} de la sala?`)) accion('expulsar', { id: d.id });
        return;
      case 'pujar':
        return accion('pujar', { incremento: Number(d.inc) });
      case 'listo':
        return enviarRespuesta();
      case 'avanzar':
        return accion('avanzar', { direccion: Number(d.dir) });
      case 'elegir': {
        const i = ui.seleccion.indexOf(d.id);
        if (i >= 0) ui.seleccion.splice(i, 1);
        else if (ui.seleccion.length < v.votacion.requeridos) ui.seleccion.push(d.id);
        else toast(`Ya tienes tu top ${v.votacion.requeridos}. Quita una para cambiarla.`);
        return render();
      }
      case 'votar':
        return accion('votar', { ranking: ui.seleccion.slice() });
    }
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!el.dataset || !el.dataset.cambio) return;
    switch (el.dataset.cambio) {
      case 'pelas':
        return accion('pelas', { id: el.dataset.id, pelas: Number(el.value) });
      case 'tipo': {
        const tipos = {};
        for (const c of document.querySelectorAll('[data-cambio="tipo"]')) tipos[c.value] = c.checked;
        return accion('ajustar', { tipos });
      }
      case 'nombres':
        return accion('ajustar', { nombres: el.checked });
      case 'rondas':
        return accion('ajustar', { rondas: Number(el.value) });
      case 'pujaMinPct':
        return accion('ajustar', { pujaMinPct: Number(el.value) });
      case 'tiempoEscribir':
        return accion('ajustar', { tiempoEscribir: Number(el.value) });
      case 'hacienda':
        return accion('ajustar', { hacienda: el.value });
      case 'votosAnonimos':
        return accion('ajustar', { votosAnonimos: el.checked });
    }
  });

  // Lo que vas escribiendo se manda al servidor cada poco: si se acaba el tiempo, cuenta eso.
  let esperaBorrador = null;
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'respuesta') return;
    ui.borrador = e.target.value;
    guardarBorrador();
    const c = document.getElementById('contador');
    if (c) c.textContent = ui.borrador.length;
    clearTimeout(esperaBorrador);
    esperaBorrador = setTimeout(() => socket.emit('borrador', { texto: ui.borrador }), 600);
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.id === 'respuesta' && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviarRespuesta();
    }
  });

  document.addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.id === 'form-unirse') {
      const f = new FormData(e.target);
      entrar({ apodo: f.get('apodo'), nombre: f.get('nombre') });
    } else if (e.target.id === 'form-dar') {
      accion('pelasTodos', { pelas: Number(document.getElementById('dar-todos').value) });
    }
  });

  render();
})();
