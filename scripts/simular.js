'use strict';

/**
 * Simulador de la economía de La Puja.
 * Juega muchas partidas con el motor real del juego (server/juego.js) y bots de distinto carácter,
 * y saca una tabla para comparar configuraciones.
 *
 *   npm run simular          → 300 partidas por escenario
 *   npm run simular -- 1000  → las que quieras
 *
 * Los bots son una aproximación: no saben de humor, solo de números. Sirve para ver tendencias
 * (inflación, multas, fantasmas, si el líder se escapa), no para predecir una partida concreta.
 */

const { Sala, CONFIG } = require('../server/juego');
const { cargarCartas } = require('../server/cartas');

const PARTIDAS = Number(process.argv[2]) || 300;
const CARTAS = cargarCartas();

// codicia: cuánto valora una buena carta · miedo: cuánto pagaría por librarse de la multa
const CARACTERES = [
  { nombre: 'tacaño', codicia: 0.25, miedo: 0.35 },
  { nombre: 'normal', codicia: 0.5, miedo: 0.7 },
  { nombre: 'agresivo', codicia: 0.9, miedo: 1.0 },
];

function relojFalso() {
  let t = 0;
  let tareas = [];
  return {
    ahora: () => t,
    programar(ms, fn) {
      const tarea = { cuando: t + ms, fn, viva: true };
      tareas.push(tarea);
      return () => (tarea.viva = false);
    },
    hasta(limite) {
      for (;;) {
        const proxima = tareas.filter((x) => x.viva && x.cuando <= limite).sort((a, b) => a.cuando - b.cuando)[0];
        if (!proxima) break;
        t = proxima.cuando;
        proxima.viva = false;
        proxima.fn();
      }
      t = Math.max(t, limite);
      tareas = tareas.filter((x) => x.viva);
    },
  };
}

const azar = (min, max) => min + Math.random() * (max - min);
const ruido = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.4; // ~normal, ±0,6

function jugarPartida({ jugadores: n, pelas, pujaMinPct, hacienda, rondas = 10 }) {
  const reloj = relojFalso();
  const sala = new Sala('SIM', { cartas: CARTAS, programar: reloj.programar, ahora: reloj.ahora });
  const bots = [];
  for (let i = 0; i < n; i++) {
    const j = sala.unirse({ apodo: `B${i}`, nombre: `Bot${i}` });
    sala.conectar(j.id);
    bots.push({ id: j.id, caracter: CARACTERES[i % CARACTERES.length], gracia: azar(0.6, 1.4) });
  }
  const mod = bots[0].id;
  sala.ponerPelasTodos(mod, pelas);
  sala.ajustar(mod, { rondas, pujaMinPct, hacienda, tiempoEscribir: 0 });
  sala.empezar(mod);

  const st = { gasto: 0, ingreso: 0, hacienda: 0, cartas: 0, multas: 0, multasPobreza: 0, liderR5: null };
  const calidadCarta = new Map(); // texto de carta → potencial compartido

  while (sala.fase !== 'fin') {
    if (sala.fase === 'subasta') {
      const s = sala.subasta;
      const clave = s.carta.texto;
      if (!calidadCarta.has(clave)) calidadCarta.set(clave, azar(0.3, 1.7));
      const q = calidadCarta.get(clave);
      const sinCarta = sala._sinCarta();
      const multa = sala.multaPorJugador(); // ya incluye la racha (×2, ×4…)
      // Valor de la carta para cada bot: lo que espera ganar con ella (de media 30 pelas por ronda)
      // por su codicia. El miedo a la multa solo empuja a ABRIR la puja: en cuanto alguien puja,
      // ya no hay multa en esta carta. Si es el último sin carta, la multa es segura: miedo total.
      const dispuestos = sinCarta.map((j) => {
        const b = bots.find((x) => x.id === j.id);
        const valor = b.caracter.codicia * 30 * q * b.gracia;
        const miedo = sinCarta.length === 1 ? 1 : b.caracter.miedo;
        return { j, valor, abrir: Math.max(valor, miedo * multa) };
      });
      const tope = (d) => Math.min(sala.maxPuja(d.j), s.puja ? d.valor : d.abrir);
      let pujado = false;
      for (;;) {
        const lider = s.puja && s.puja.id;
        const candidatos = dispuestos.filter((d) => d.j.id !== lider && sala.cantidadPuja(1) <= tope(d)).map((d) => ({ ...d, tope: tope(d) }));
        if (!candidatos.length) break;
        const c = candidatos[Math.floor(Math.random() * candidatos.length)];
        const inc = c.tope - sala.cantidadPuja(5) >= 5 && Math.random() < 0.3 ? 5 : 1;
        sala.pujar(c.j.id, inc);
        pujado = true;
      }
      const ganadasAntes = s.ganadas.length;
      const nadiePodia = s.nadiePuede;
      const pelasAntes = new Map(sala._lista().map((j) => [j.id, j.pelas]));
      reloj.hasta(s.limite); // adjudica o multa
      if (pujado && sala.subasta && sala.subasta.ganadas.length > ganadasAntes) {
        const g = sala.subasta.ganadas[sala.subasta.ganadas.length - 1];
        st.gasto += g.precio;
        st.cartas += 1;
      } else if (!pujado) {
        let perdido = 0;
        for (const j of sala._lista()) perdido += Math.max(0, pelasAntes.get(j.id) - j.pelas);
        st.multas += perdido;
        if (nadiePodia) st.multasPobreza += perdido;
      }
      continue;
    }

    if (sala.fase === 'escribir') {
      for (const e of [...sala.entradas.values()]) {
        if (sala.fase !== 'escribir') break;
        const b = bots.find((x) => x.id === e.id);
        const q = calidadCarta.get(e.carta.texto) || 1;
        e.calidad = q * b.gracia * azar(0.6, 1.4);
        if (!e.listo) sala.responder(e.id, 'respuesta');
      }
      continue;
    }

    if (sala.fase === 'lectura') {
      while (sala.fase === 'lectura') sala.avanzar(sala.modId, 1);
      continue;
    }

    if (sala.fase === 'votacion') {
      const votables = sala._votables();
      for (const j of sala._votantes()) {
        const opciones = votables
          .filter((id) => id !== j.id)
          .map((id) => ({ id, nota: sala.entradas.get(id).calidad + ruido() }))
          .sort((a, b) => b.nota - a.nota)
          .slice(0, sala.requeridos(j.id))
          .map((o) => o.id);
        if (sala.fase === 'votacion') sala.votar(j.id, opciones);
      }
      continue;
    }

    if (sala.fase === 'resultados') {
      st.ingreso += sala.resultados.reduce((a, r) => a + r.pelas, 0);
      st.hacienda += sala.hacienda ? sala.hacienda.total : 0;
      if (sala.ronda === 5) {
        const max = Math.max(...sala._lista().map((j) => j.pelas));
        st.liderR5 = sala._lista().filter((j) => j.pelas === max).map((j) => j.id);
      }
      sala.siguiente(sala.modId);
      continue;
    }

    throw new Error(`Fase inesperada: ${sala.fase}`);
  }

  const finales = sala._lista().map((j) => j.pelas);
  return {
    ...st,
    acabaAntes: sala.resultados === null, // terminó en una subasta por eliminación, no tras la última ronda
    sinGanador: sala.ganadores.length === 0,
    fantasmas: sala._lista().filter((j) => j.fantasma).length,
    media: finales.reduce((a, b) => a + b, 0) / n,
    liderR5Gana: st.liderR5 ? st.liderR5.some((id) => sala.ganadores.includes(id)) : null,
    distancia: (() => {
      const ord = finales.slice().sort((a, b) => b - a);
      return ord[0] - ord[1];
    })(),
  };
}

function escenario(nombre, opciones) {
  const rs = [];
  for (let i = 0; i < PARTIDAS; i++) rs.push(jugarPartida(opciones));
  const prom = (f) => rs.reduce((a, r) => a + f(r), 0) / rs.length;
  const pct = (f) => `${Math.round((100 * rs.filter(f).length) / rs.length)} %`;
  const conR5 = rs.filter((r) => r.liderR5Gana !== null);
  return {
    Escenario: nombre,
    Jug: opciones.jugadores,
    'Pelas finales': Math.round(prom((r) => r.media)),
    'Gasto/ingreso': `${Math.round((100 * prom((r) => r.gasto)) / Math.max(1, prom((r) => r.ingreso)))} %`,
    'Precio carta': Math.round(prom((r) => r.gasto) / Math.max(1, prom((r) => r.cartas))),
    'Multas/partida': Math.round(prom((r) => r.multas)),
    '…por no llegar': Math.round(prom((r) => r.multasPobreza)),
    'Hacienda/partida': Math.round(prom((r) => r.hacienda)),
    Fantasmas: prom((r) => r.fantasmas).toFixed(2),
    'Acaba antes': pct((r) => r.acabaAntes),
    'Sin ganador': pct((r) => r.sinGanador),
    'Líder R5 gana': conR5.length ? `${Math.round((100 * conR5.filter((r) => r.liderR5Gana).length) / conR5.length)} %` : '—',
    '1.º − 2.º': Math.round(prom((r) => r.distancia)),
  };
}

const ESCENARIOS = [
  ['Antes: 1 pela, sin Hacienda, 100', { pujaMinPct: 0, hacienda: 'apagada', pelas: 100 }],
  ['Plan: 5 %, Hacienda normal, 150', { pujaMinPct: 5, hacienda: 'normal', pelas: 150 }],
  ['Plan sin Hacienda', { pujaMinPct: 5, hacienda: 'apagada', pelas: 150 }],
  ['10 %, Hacienda normal, 150', { pujaMinPct: 10, hacienda: 'normal', pelas: 150 }],
  ['5 %, Hacienda salvaje, 150', { pujaMinPct: 5, hacienda: 'salvaje', pelas: 150 }],
];

console.log(`\nSimulando ${PARTIDAS} partidas de 10 rondas por escenario…\n`);
for (const n of [4, 8]) {
  const filas = ESCENARIOS.map(([nombre, op]) => escenario(nombre, { ...op, jugadores: n }));
  console.table(filas);
}
console.log('Gasto/ingreso: lo que se gasta en cartas frente a lo que entra por votos (objetivo ≈ 50 %).');
console.log('Líder R5 gana: si quien iba primero en la ronda 5 acaba ganando (cuanto más bajo, más abierta la partida).\n');
