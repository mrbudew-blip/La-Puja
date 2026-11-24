'use strict';

const crypto = require('crypto');
const { Mazo, TIPOS } = require('./cartas');

// LAPUJA_RAPIDO=1 acorta los tiempos de la subasta (solo para probar con bots).
const RAPIDO = process.env.LAPUJA_RAPIDO === '1';

/** Todos los números del juego en un sitio, para ajustarlos tras probar con amigos. */
const CONFIG = Object.freeze({
  PENALIZACION: 15, // multa base por jugador sin carta; sube si el precio de salida es mayor
  T_SIN_PUJAS: RAPIDO ? 4000 : 30000, // cuenta atrás cuando nadie ha pujado aún
  T_NADIE_PUEDE: RAPIDO ? 1500 : 5000, // cuenta atrás si ningún jugador sin carta llega al precio de salida
  T_PUJA: RAPIDO ? 1500 : 8000, // se reinicia con cada puja
  PELAS_POR_PUNTO: 5,
  PUNTOS_TOP: [3, 2, 1],
  MIN_JUGADORES: 3,
  MAX_JUGADORES: 8,
  RONDAS: 10,
  MAX_RONDAS: 30,
  MAX_PELAS: 100000,
  PELAS_INICIALES: 150, // valor que propone "Dar a todos" en la sala
  PUJA_MIN_PCT: 5, // % de la media de pelas de los vivos (por defecto)
  PUJA_MIN_PCT_MAX: 30,
  HACIENDA: Object.freeze({ apagada: 0, suave: 0.15, normal: 0.25, salvaje: 0.4 }),
  HACIENDA_DEF: 'normal',
  TIEMPO_ESCRIBIR: 120, // segundos; 0 = sin límite
  TIEMPO_ESCRIBIR_MAX: 600,
  GRACIA_MOD: 15000, // si el moderador se desconecta, pasa el rol tras este tiempo
  GRACIA_SALA: 60000, // en la sala de espera, se quita a quien no vuelve tras este tiempo
  MAX_APODO: 20,
  MAX_NOMBRE: 20,
  MAX_TEXTO: 200,
  INCREMENTOS: [1, 5, 10],
});

class ErrorJuego extends Error {}

function fallo(mensaje) {
  throw new ErrorJuego(mensaje);
}

function limpiarTexto(valor, max) {
  if (typeof valor !== 'string') return '';
  return valor
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

const nPelas = (n) => (n === 1 ? '1 pela' : `${n} pelas`);

function idAleatorio(bytes) {
  return crypto.randomBytes(bytes).toString('hex');
}

function enteroEntre(valor, min, max) {
  const n = Number(valor);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

function media(jugadores) {
  return jugadores.length ? jugadores.reduce((a, j) => a + j.pelas, 0) / jugadores.length : 0;
}

/**
 * Una sala = una partida. Guarda todo el estado en memoria y aplica las reglas.
 * No sabe nada de sockets: el servidor llama a sus métodos y escucha onCambio/onEvento.
 */
class Sala {
  constructor(codigo, { cartas, programar, ahora = Date.now, aleatorio = Math.random }) {
    this.codigo = codigo;
    this.cartas = cartas;
    this.programar = programar; // (ms, fn) => cancelar()
    this.ahora = ahora;
    this.aleatorio = aleatorio;

    this.jugadores = new Map();
    this.orden = [];
    this.modId = null;

    this.fase = 'sala';
    this.ronda = 0;
    this.ajustes = {
      tipos: { pregunta: true, respuesta: true, inicio: true, fin: true },
      nombres: true,
      rondas: CONFIG.RONDAS,
      pujaMinPct: CONFIG.PUJA_MIN_PCT,
      hacienda: CONFIG.HACIENDA_DEF,
      votosAnonimos: false,
      tiempoEscribir: CONFIG.TIEMPO_ESCRIBIR,
    };

    this.mazo = null;
    this.subasta = null;
    this.precioSalida = 1;
    this.mediaSalida = 0; // media de los vivos al empezar la ronda: de ahí sale el precio de salida
    this.entradas = new Map();
    this.limiteEscribir = 0;
    this.duracionEscribir = 0;
    this.ordenLectura = [];
    this.paso = 0;
    this.votos = new Map();
    this.resultados = null;
    this.hacienda = null;
    this.ganadores = [];

    this._cancelarTemporizador = null;
    this._temporizadoresJugador = new Map();

    this.onCambio = () => {};
    this.onEvento = () => {};
    this.ultimaActividad = this.ahora();
  }

  // ───────────────────────── utilidades ─────────────────────────

  _cambio() {
    this.ultimaActividad = this.ahora();
    this.onCambio();
  }

  _evento(texto, tipo = 'info') {
    this.onEvento(texto, tipo);
  }

  _jugador(id) {
    const j = this.jugadores.get(id);
    if (!j) fallo('No estás en esta sala.');
    return j;
  }

  _exigirMod(id) {
    this._jugador(id);
    if (id !== this.modId) fallo('Eso solo lo puede hacer el moderador.');
  }

  _exigirFase(...fases) {
    if (!fases.includes(this.fase)) fallo('Ahora no toca eso.');
  }

  _lista() {
    return this.orden.map((id) => this.jugadores.get(id));
  }

  activos() {
    return this._lista().filter((j) => !j.fantasma);
  }

  _sinCarta() {
    return this.activos().filter((j) => !this.entradas.has(j.id));
  }

  maxPuja(j) {
    return j.pelas - 1; // nunca puedes quedarte a 0 por pujar
  }

  /** Precio de salida: % de la media de pelas de los vivos, como mínimo 1. */
  calcularPrecioSalida() {
    const m = media(this.activos());
    return Math.max(1, Math.round((m * this.ajustes.pujaMinPct) / 100));
  }

  /** Base de la multa: 15, o el precio de salida si es mayor (callarse nunca sale más barato que pujar). */
  multaBase() {
    return Math.max(CONFIG.PENALIZACION, this.precioSalida);
  }

  /**
   * Cada carta seguida sin pujas duplica la sanción: ×1, ×2, ×4, ×8… sin tope.
   * Vuelve a ×1 en cuanto se vende una carta y al empezar cada ronda.
   */
  multiplicadorMulta() {
    return 2 ** ((this.subasta && this.subasta.silencios) || 0);
  }

  /** Lo que pierde CADA jugador sin carta si nadie puja esta carta: base × multiplicador × jugadores sin carta. */
  multaPorJugador() {
    return this.multaBase() * this.multiplicadorMulta() * this._sinCarta().length;
  }

  _temporizador(ms, fn) {
    this._pararTemporizador();
    this._cancelarTemporizador = this.programar(ms, () => {
      this._cancelarTemporizador = null;
      fn();
      this._cambio();
    });
    return this.ahora() + ms;
  }

  _pararTemporizador() {
    if (this._cancelarTemporizador) this._cancelarTemporizador();
    this._cancelarTemporizador = null;
  }

  _temporizadorJugador(id, ms, fn) {
    this._pararTemporizadorJugador(id);
    const cancelar = this.programar(ms, () => {
      this._temporizadoresJugador.delete(id);
      fn();
      this._cambio();
    });
    this._temporizadoresJugador.set(id, cancelar);
  }

  _pararTemporizadorJugador(id) {
    const cancelar = this._temporizadoresJugador.get(id);
    if (cancelar) cancelar();
    this._temporizadoresJugador.delete(id);
  }

  destruir() {
    this._pararTemporizador();
    for (const id of [...this._temporizadoresJugador.keys()]) this._pararTemporizadorJugador(id);
  }

  porToken(token) {
    if (typeof token !== 'string') return null;
    return this._lista().find((j) => j.token === token) || null;
  }

  // ───────────────────────── sala de espera ─────────────────────────

  unirse({ apodo, nombre }) {
    if (this.fase !== 'sala') fallo('La partida ya ha empezado. Espera a que acabe.');
    if (this.orden.length >= CONFIG.MAX_JUGADORES) fallo(`La sala está llena (máximo ${CONFIG.MAX_JUGADORES}).`);
    apodo = limpiarTexto(apodo, CONFIG.MAX_APODO);
    nombre = limpiarTexto(nombre, CONFIG.MAX_NOMBRE);
    if (!apodo) fallo('Ponte un apodo.');
    if (!nombre) fallo('Pon tu nombre real: es el que sale en las cartas.');
    const repetido = this._lista().some((j) => j.apodo.toLowerCase() === apodo.toLowerCase());
    if (repetido) fallo('Ese apodo ya está pillado. Sé original por una vez.');

    const j = {
      id: idAleatorio(6),
      token: idAleatorio(16),
      apodo,
      nombre,
      pelas: 0,
      conectado: false,
      fantasma: false,
    };
    this.jugadores.set(j.id, j);
    this.orden.push(j.id);
    if (!this.modId) this.modId = j.id;
    this._cambio();
    return j;
  }

  conectar(id) {
    const j = this._jugador(id);
    j.conectado = true;
    this._pararTemporizadorJugador(id);
    this._cambio();
  }

  desconectar(id) {
    const j = this.jugadores.get(id);
    if (!j) return;
    j.conectado = false;
    if (this.fase === 'sala') {
      this._temporizadorJugador(id, CONFIG.GRACIA_SALA, () => {
        if (!j.conectado && this.fase === 'sala' && this.jugadores.has(id)) this._quitarJugador(id);
      });
    }
    if (id === this.modId) {
      this.programar(CONFIG.GRACIA_MOD, () => {
        if (this.modId === id && this.jugadores.has(id) && !j.conectado) {
          this._pasarMod();
          this._cambio();
        }
      });
    }
    // Si los que siguen conectados ya han terminado de escribir, no se espera al que se ha ido
    if (this.fase === 'escribir') this._comprobarEscritura();
    this._cambio();
  }

  _pasarMod() {
    const desde = this.orden.indexOf(this.modId);
    for (let i = 1; i <= this.orden.length; i++) {
      const candidato = this.jugadores.get(this.orden[(desde + i) % this.orden.length]);
      if (candidato && candidato.conectado && candidato.id !== this.modId) {
        this.modId = candidato.id;
        this._evento(`👑 ${candidato.apodo} es el nuevo moderador.`);
        return;
      }
    }
  }

  _quitarJugador(id) {
    this._pararTemporizadorJugador(id);
    if (this.modId === id) this._pasarMod();
    this.jugadores.delete(id);
    this.orden = this.orden.filter((x) => x !== id);
    if (this.modId === id) this.modId = this.orden[0] || null;
  }

  salir(id) {
    this._exigirFase('sala');
    this._jugador(id);
    this._quitarJugador(id);
    this._cambio();
  }

  expulsar(id, objetivoId) {
    this._exigirMod(id);
    this._exigirFase('sala');
    if (objetivoId === id) fallo('No te puedes echar a ti mismo.');
    const objetivo = this._jugador(objetivoId);
    this._quitarJugador(objetivoId);
    this._evento(`🥾 ${objetivo.apodo} ha sido expulsado de la sala.`);
    this._cambio();
  }

  ceder(id, objetivoId) {
    this._exigirMod(id);
    const objetivo = this._jugador(objetivoId);
    if (objetivoId === id) fallo('Ya eres el moderador.');
    this.modId = objetivo.id;
    this._evento(`👑 ${objetivo.apodo} es el nuevo moderador.`);
    this._cambio();
  }

  ajustar(id, { tipos, nombres, rondas, pujaMinPct, hacienda, votosAnonimos, tiempoEscribir } = {}) {
    this._exigirMod(id);
    this._exigirFase('sala');
    if (tipos !== undefined) {
      const nuevos = {};
      for (const t of TIPOS) nuevos[t] = Boolean(tipos && tipos[t]);
      if (!TIPOS.some((t) => nuevos[t])) fallo('Tiene que haber al menos un tipo de carta.');
      this.ajustes.tipos = nuevos;
    }
    if (nombres !== undefined) this.ajustes.nombres = Boolean(nombres);
    if (rondas !== undefined) {
      const n = enteroEntre(rondas, 1, CONFIG.MAX_RONDAS);
      if (n === null) fallo(`Las rondas van de 1 a ${CONFIG.MAX_RONDAS}.`);
      this.ajustes.rondas = n;
    }
    if (pujaMinPct !== undefined) {
      const n = enteroEntre(pujaMinPct, 0, CONFIG.PUJA_MIN_PCT_MAX);
      if (n === null) fallo(`La puja mínima va de 0 a ${CONFIG.PUJA_MIN_PCT_MAX} %.`);
      this.ajustes.pujaMinPct = n;
    }
    if (hacienda !== undefined) {
      if (!Object.prototype.hasOwnProperty.call(CONFIG.HACIENDA, hacienda)) fallo('Ese nivel de Hacienda no existe.');
      this.ajustes.hacienda = hacienda;
    }
    if (votosAnonimos !== undefined) this.ajustes.votosAnonimos = Boolean(votosAnonimos);
    if (tiempoEscribir !== undefined) {
      const n = enteroEntre(tiempoEscribir, 0, CONFIG.TIEMPO_ESCRIBIR_MAX);
      if (n === null) fallo(`El tiempo para escribir va de 0 (sin límite) a ${CONFIG.TIEMPO_ESCRIBIR_MAX} segundos.`);
      this.ajustes.tiempoEscribir = n;
    }
    this._cambio();
  }

  ponerPelas(id, objetivoId, pelas) {
    this._exigirMod(id);
    this._exigirFase('sala');
    const objetivo = this._jugador(objetivoId);
    const n = enteroEntre(pelas, 0, CONFIG.MAX_PELAS);
    if (n === null) fallo(`Las pelas van de 0 a ${CONFIG.MAX_PELAS}.`);
    objetivo.pelas = n;
    this._cambio();
  }

  ponerPelasTodos(id, pelas) {
    this._exigirMod(id);
    this._exigirFase('sala');
    const n = enteroEntre(pelas, 0, CONFIG.MAX_PELAS);
    if (n === null) fallo(`Las pelas van de 0 a ${CONFIG.MAX_PELAS}.`);
    for (const j of this._lista()) j.pelas = n;
    this._cambio();
  }

  empezar(id) {
    this._exigirMod(id);
    this._exigirFase('sala');
    const lista = this._lista();
    if (lista.length < CONFIG.MIN_JUGADORES) fallo(`Hacen falta al menos ${CONFIG.MIN_JUGADORES} jugadores.`);
    const pobres = lista.filter((j) => j.pelas <= 0);
    if (pobres.length) fallo(`Dale pelas a ${pobres.map((j) => j.apodo).join(', ')} antes de empezar.`);

    const tipos = TIPOS.filter((t) => this.ajustes.tipos[t]);
    const nombres = this.ajustes.nombres ? lista.map((j) => j.nombre) : [];
    this.mazo = new Mazo(this.cartas, { tipos, nombres }, this.aleatorio);
    for (const j of lista) j.fantasma = false;
    this.ronda = 0;
    this.ganadores = [];
    this._evento('🔨 ¡Empieza la subasta! Que Dios reparta suerte.', 'grande');
    this._empezarRonda();
    this._cambio();
  }

  // ───────────────────────── subasta ─────────────────────────

  _empezarRonda() {
    this.ronda += 1;
    this.fase = 'subasta';
    this.entradas = new Map();
    this.votos = new Map();
    this.ordenLectura = [];
    this.paso = 0;
    this.resultados = null;
    this.hacienda = null;
    this.limiteEscribir = 0;
    this.mediaSalida = media(this.activos());
    this.precioSalida = this.calcularPrecioSalida();
    this.subasta = { carta: null, puja: null, modo: 'espera', limite: 0, ganadas: [], silencios: 0 };
    this._sacarCarta();
  }

  _sacarCarta() {
    const s = this.subasta;
    s.carta = this.mazo.sacar();
    s.puja = null;
    s.modo = 'espera';
    const alguienPuede = this._sinCarta().some((j) => this.maxPuja(j) >= this.precioSalida);
    s.nadiePuede = !alguienPuede;
    const ms = alguienPuede ? CONFIG.T_SIN_PUJAS : CONFIG.T_NADIE_PUEDE;
    s.duracion = ms;
    s.limite = this._temporizador(ms, () => this._finTemporizador());
  }

  /** Cuánto pagarías con este botón: sin pujas, +1 es "salida" y +5/+10 se suman a la salida. */
  cantidadPuja(incremento) {
    const s = this.subasta;
    if (s.puja) return s.puja.cantidad + incremento;
    return this.precioSalida + (incremento === 1 ? 0 : incremento);
  }

  pujar(id, incremento) {
    this._exigirFase('subasta');
    const j = this._jugador(id);
    if (j.fantasma) fallo('Los fantasmas no pujan. Estás muerto, asúmelo.');
    if (this.entradas.has(id)) fallo('Ya tienes carta esta ronda.');
    const inc = Number(incremento);
    if (!CONFIG.INCREMENTOS.includes(inc)) fallo('Puja no válida.');
    const s = this.subasta;
    if (s.puja && s.puja.id === id) fallo('Ya vas ganando tú. No te pujes a ti mismo, ansias.');
    const cantidad = this.cantidadPuja(inc);
    const max = this.maxPuja(j);
    if (cantidad > max) {
      if (!s.puja && max < this.precioSalida) {
        fallo(`No llegas: la carta sale desde ${this.precioSalida} y como mucho puedes pujar ${Math.max(0, max)} (siempre te tiene que quedar 1 pela).`);
      }
      fallo(max >= 1 ? `No te llega. Como mucho puedes pujar ${max} (siempre te tiene que quedar 1 pela).` : 'Estás tieso. No puedes pujar.');
    }
    s.puja = { id, cantidad };
    s.modo = 'pujando';
    s.duracion = CONFIG.T_PUJA;
    s.limite = this._temporizador(CONFIG.T_PUJA, () => this._finTemporizador());
    this._cambio();
  }

  _finTemporizador() {
    if (this.fase !== 'subasta') return;
    if (this.subasta.modo === 'pujando') this._adjudicar();
    else this._penalizar();
  }

  _adjudicar() {
    const s = this.subasta;
    const j = this.jugadores.get(s.puja.id);
    j.pelas -= s.puja.cantidad;
    const entrada = { id: j.id, carta: s.carta, precio: s.puja.cantidad, texto: null, borrador: '', listo: false, fantasma: false };
    this.entradas.set(j.id, entrada);
    s.ganadas.push({ id: j.id, carta: s.carta, precio: s.puja.cantidad });
    s.silencios = 0; // se ha vendido una carta: la sanción vuelve a ×1
    this._evento(`🔨 ¡Adjudicada! ${j.apodo} se la lleva por ${nPelas(s.puja.cantidad)}.`);
    this._siguienteCartaOFin();
  }

  _penalizar() {
    const sinCarta = this._sinCarta();
    const multiplicador = this.multiplicadorMulta();
    const multa = this.multaPorJugador();
    const muertos = [];
    for (const j of sinCarta) {
      j.pelas = Math.max(0, j.pelas - multa);
      if (j.pelas === 0) {
        j.fantasma = true;
        muertos.push(j);
      }
    }
    this.subasta.silencios += 1; // la siguiente carta sin pujas cuesta el doble
    const quien = `${sinCarta.map((j) => j.apodo).join(', ')} pierde${sinCarta.length > 1 ? 'n' : ''} ${nPelas(multa)}`;
    this._evento(
      multiplicador > 1
        ? `💸 ¡Otra vez nadie! Sanción ×${multiplicador}: ${quien}. La siguiente irá ×${multiplicador * 2}.`
        : `💸 Nadie ha pujado. ${quien} por rácano${sinCarta.length > 1 ? 's' : ''}. Si la siguiente tampoco se puja, el doble.`,
      'malo'
    );
    for (const j of muertos) {
      this._evento(`👻 ${j.apodo} se ha quedado sin una pela. Ahora es un fantasma: escribe, pero nadie le puede votar.`, 'malo');
    }
    if (this.activos().length <= 1) {
      this._evento('☠️ Solo queda uno en pie. Se acabó la partida.', 'grande');
      this._terminar();
      return;
    }
    this._siguienteCartaOFin();
  }

  _siguienteCartaOFin() {
    if (this._sinCarta().length) this._sacarCarta();
    else this._finSubasta();
  }

  _finSubasta() {
    this._pararTemporizador();
    const ganadas = this.subasta.ganadas;
    const fantasmas = this._lista().filter((j) => j.fantasma);
    for (const f of fantasmas) {
      const elegida = ganadas[Math.floor(this.aleatorio() * ganadas.length)];
      this.entradas.set(f.id, { id: f.id, carta: elegida.carta, precio: 0, texto: null, borrador: '', listo: false, fantasma: true });
    }
    this.ordenLectura = [...ganadas.map((g) => g.id), ...fantasmas.map((f) => f.id)];
    this.fase = 'escribir';
    this.limiteEscribir = 0;
    const segundos = this.ajustes.tiempoEscribir;
    if (segundos > 0) {
      this.duracionEscribir = segundos * 1000;
      this.limiteEscribir = this._temporizador(this.duracionEscribir, () => this._finTiempoEscribir());
    }
  }

  // ───────────────────────── escribir ─────────────────────────

  /** Guarda lo que va escribiendo el jugador, por si se acaba el tiempo antes de pulsar Listo. */
  guardarBorrador(id, texto) {
    if (this.fase !== 'escribir') return;
    const entrada = this.entradas.get(id);
    if (!entrada || entrada.listo) return;
    entrada.borrador = limpiarTexto(texto, CONFIG.MAX_TEXTO);
  }

  responder(id, texto) {
    this._exigirFase('escribir');
    const entrada = this.entradas.get(id);
    if (!entrada) fallo('No tienes carta.');
    const limpio = limpiarTexto(texto, CONFIG.MAX_TEXTO);
    if (!limpio) fallo('Escribe algo, aunque sea una burrada.');
    entrada.texto = limpio;
    entrada.borrador = limpio;
    entrada.listo = true;
    this._comprobarEscritura();
    this._cambio();
  }

  editar(id) {
    this._exigirFase('escribir');
    const entrada = this.entradas.get(id);
    if (!entrada) fallo('No tienes carta.');
    entrada.listo = false;
    this._cambio();
  }

  /** Se pasa a la lectura cuando todos los que siguen conectados han pulsado Listo. */
  _comprobarEscritura() {
    if (this.fase !== 'escribir') return;
    const conectadas = [...this.entradas.values()].filter((e) => {
      const j = this.jugadores.get(e.id);
      return j && j.conectado;
    });
    if (conectadas.length && conectadas.every((e) => e.listo)) this._cerrarEscritura();
  }

  _finTiempoEscribir() {
    if (this.fase !== 'escribir') return;
    this._evento('⏰ Se acabó el tiempo. Lo que estuviera escrito, se queda así.');
    this._cerrarEscritura();
  }

  /** Cierra la escritura: quien no pulsó Listo se queda con su borrador, o en blanco. */
  _cerrarEscritura() {
    for (const e of this.entradas.values()) {
      if (!e.listo) {
        e.texto = e.borrador || e.texto || null;
        e.listo = true;
      }
    }
    this._empezarLectura();
  }

  forzar(id) {
    this._exigirMod(id);
    if (this.fase === 'escribir') {
      this._evento('⏩ El moderador ha cortado por lo sano. Lo que estuviera escrito, se queda así.');
      this._cerrarEscritura();
    } else if (this.fase === 'votacion') {
      this._evento('⏩ El moderador ha cerrado la votación.');
      this._recuento();
    } else {
      fallo('Ahora no hay nada que forzar.');
    }
    this._cambio();
  }

  // ───────────────────────── lectura ─────────────────────────

  _empezarLectura() {
    this._pararTemporizador();
    this.limiteEscribir = 0;
    this.fase = 'lectura';
    this.paso = 0;
  }

  avanzar(id, direccion) {
    this._exigirMod(id);
    this._exigirFase('lectura');
    const total = this.ordenLectura.length * 2;
    if (direccion === -1) {
      this.paso = Math.max(0, this.paso - 1);
    } else if (this.paso < total - 1) {
      this.paso += 1;
    } else {
      this.fase = 'votacion';
      this.votos = new Map();
    }
    this._cambio();
  }

  // ───────────────────────── votación ─────────────────────────

  _votables() {
    return this.ordenLectura.filter((id) => !this.entradas.get(id).fantasma);
  }

  /** Solo votan los vivos: los fantasmas miran. */
  _votantes() {
    return this.activos();
  }

  requeridos(id) {
    return Math.min(CONFIG.PUNTOS_TOP.length, this._votables().filter((x) => x !== id).length);
  }

  votar(id, ranking) {
    this._exigirFase('votacion');
    const j = this._jugador(id);
    if (j.fantasma) fallo('Los fantasmas no votan. Mira y calla.');
    if (!Array.isArray(ranking)) fallo('Voto no válido.');
    const votables = new Set(this._votables());
    const n = this.requeridos(id);
    if (ranking.length !== n) fallo(`Tienes que elegir ${n} respuesta${n === 1 ? '' : 's'}.`);
    if (new Set(ranking).size !== ranking.length) fallo('No repitas respuestas.');
    for (const r of ranking) {
      if (r === id) fallo('No te puedes votar a ti mismo, egocéntrico.');
      if (!votables.has(r)) fallo('Esa respuesta no se puede votar.');
    }
    this.votos.set(id, ranking.slice());
    if (this._votantes().every((x) => this.votos.has(x.id))) this._recuento();
    this._cambio();
  }

  _recuento() {
    const puntos = new Map(this._votables().map((id) => [id, 0]));
    for (const [votante, ranking] of this.votos) {
      if (this.jugadores.get(votante)?.fantasma) continue; // por si acaso: un fantasma nunca puntúa a nadie
      ranking.forEach((id, i) => {
        if (puntos.has(id)) puntos.set(id, puntos.get(id) + CONFIG.PUNTOS_TOP[i]);
      });
    }
    this.resultados = [...puntos.entries()]
      .map(([id, p]) => {
        const e = this.entradas.get(id);
        return { id, puntos: p, pelas: p * CONFIG.PELAS_POR_PUNTO, carta: e.carta, texto: e.texto };
      })
      .sort((a, b) => b.puntos - a.puntos);
    for (const r of this.resultados) this.jugadores.get(r.id).pelas += r.pelas;
    this._cobrarHacienda();
    this.fase = 'resultados';
  }

  // ───────────────────────── Hacienda ─────────────────────────

  /**
   * IRPF de La Puja: tras cada ronda (menos la última), quien tenga más pelas que la media
   * de los vivos paga un % de lo que se pasa. Lo recaudado desaparece.
   * Nunca adelanta a nadie: como mucho deja a dos jugadores empatados.
   */
  _cobrarHacienda() {
    const nivel = this.ajustes.hacienda;
    const tasa = CONFIG.HACIENDA[nivel] || 0;
    if (!tasa) {
      this.hacienda = { nivel, tasa, estado: 'apagada', media: 0, cobros: [], total: 0 };
      return;
    }
    if (this.ronda >= this.ajustes.rondas) {
      this.hacienda = { nivel, tasa, estado: 'ultima', media: 0, cobros: [], total: 0 };
      return;
    }
    const vivos = this.activos();
    const m = media(vivos);
    const cobros = [];
    for (const j of vivos) {
      const paga = Math.floor(tasa * (j.pelas - m) + 1e-9);
      if (paga > 0) {
        j.pelas -= paga;
        cobros.push({ id: j.id, paga });
      }
    }
    cobros.sort((a, b) => b.paga - a.paga);
    const total = cobros.reduce((a, c) => a + c.paga, 0);
    this.hacienda = { nivel, tasa, estado: 'cobrada', media: Math.round(m), cobros, total };
  }

  siguiente(id) {
    this._exigirMod(id);
    this._exigirFase('resultados');
    if (this.ronda >= this.ajustes.rondas) this._terminar();
    else this._empezarRonda();
    this._cambio();
  }

  // ───────────────────────── final ─────────────────────────

  _terminar() {
    this._pararTemporizador();
    this.fase = 'fin';
    const max = Math.max(...this._lista().map((j) => j.pelas));
    this.ganadores = max > 0 ? this._lista().filter((j) => j.pelas === max).map((j) => j.id) : [];
  }

  reiniciar(id) {
    this._exigirMod(id);
    this._exigirFase('fin');
    this.fase = 'sala';
    this.ronda = 0;
    this.subasta = null;
    this.precioSalida = 1;
    this.mediaSalida = 0;
    this.entradas = new Map();
    this.limiteEscribir = 0;
    this.ordenLectura = [];
    this.votos = new Map();
    this.resultados = null;
    this.hacienda = null;
    this.ganadores = [];
    for (const j of this._lista()) {
      j.fantasma = false;
      if (!j.conectado) this.desconectar(j.id); // arranca la cuenta para quitar a los que se fueron
    }
    this._cambio();
  }

  // ───────────────────────── lo que ve cada jugador ─────────────────────────

  vista(id) {
    const s = this.subasta;
    const yo = this.jugadores.get(id);
    const v = {
      codigo: this.codigo,
      fase: this.fase,
      ronda: this.ronda,
      ajustes: this.ajustes,
      yo: id,
      miNombre: yo ? yo.nombre : null,
      modId: this.modId,
      ahora: this.ahora(),
      config: {
        PENALIZACION: CONFIG.PENALIZACION,
        MIN_JUGADORES: CONFIG.MIN_JUGADORES,
        MAX_JUGADORES: CONFIG.MAX_JUGADORES,
        INCREMENTOS: CONFIG.INCREMENTOS,
        MAX_TEXTO: CONFIG.MAX_TEXTO,
        PELAS_POR_PUNTO: CONFIG.PELAS_POR_PUNTO,
        PELAS_INICIALES: CONFIG.PELAS_INICIALES,
        PUJA_MIN_PCT_MAX: CONFIG.PUJA_MIN_PCT_MAX,
        HACIENDA: CONFIG.HACIENDA,
        TIEMPO_ESCRIBIR_MAX: CONFIG.TIEMPO_ESCRIBIR_MAX,
      },
      jugadores: this._lista().map((j) => {
        const e = this.entradas.get(j.id);
        return {
          id: j.id,
          apodo: j.apodo,
          pelas: j.pelas,
          conectado: j.conectado,
          fantasma: j.fantasma,
          tieneCarta: Boolean(e),
          listo: Boolean(e && e.listo),
          votado: this.votos.has(j.id),
        };
      }),
    };

    if (this.fase === 'subasta' && s) {
      const sinCarta = this._sinCarta();
      v.subasta = {
        carta: s.carta,
        puja: s.puja,
        modo: s.modo,
        limite: s.limite,
        duracion: s.duracion,
        nadiePuede: Boolean(s.nadiePuede),
        sinCarta: sinCarta.map((j) => j.id),
        precioSalida: this.precioSalida,
        mediaSalida: Math.round(this.mediaSalida),
        multaBase: this.multaBase(),
        multiplicador: this.multiplicadorMulta(),
        silencios: s.silencios || 0,
        multa: this.multaPorJugador(),
        ganadas: s.ganadas,
        miMax: yo ? this.maxPuja(yo) : 0,
      };
    }

    const mia = this.entradas.get(id);
    if (mia && ['escribir', 'lectura', 'votacion'].includes(this.fase)) v.miEntrada = { ...mia };

    if (this.fase === 'escribir' && this.limiteEscribir) {
      v.escribir = { limite: this.limiteEscribir, duracion: this.duracionEscribir };
    }

    if (this.fase === 'lectura') {
      const indice = Math.floor(this.paso / 2);
      const revelada = this.paso % 2 === 1;
      v.lectura = {
        paso: this.paso,
        total: this.ordenLectura.length * 2,
        indice,
        items: this.ordenLectura.slice(0, indice + 1).map((pid, i) => {
          const e = this.entradas.get(pid);
          return {
            id: pid,
            carta: e.carta,
            precio: e.precio,
            fantasma: e.fantasma,
            texto: i < indice || revelada ? e.texto : undefined,
            revelada: i < indice || revelada,
          };
        }),
      };
    }

    if (this.fase === 'votacion') {
      v.votacion = {
        opciones: this.ordenLectura.map((pid) => {
          const e = this.entradas.get(pid);
          return { id: pid, carta: e.carta, texto: e.texto, precio: e.precio, fantasma: e.fantasma };
        }),
        requeridos: this.requeridos(id),
        miVoto: this.votos.get(id) || null,
      };
    }

    if (this.fase === 'resultados' && this.resultados) {
      v.resultados = this.resultados;
      v.esUltima = this.ronda >= this.ajustes.rondas;
      v.hacienda = this.hacienda;
      // Con votos anónimos, el servidor ni siquiera envía quién votó qué
      v.votos = this.ajustes.votosAnonimos ? null : [...this.votos.entries()].map(([votante, ranking]) => ({ id: votante, ranking }));
    }

    if (this.fase === 'fin') v.ganadores = this.ganadores;
    return v;
  }
}

module.exports = { Sala, CONFIG, ErrorJuego, limpiarTexto };
