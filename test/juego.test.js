'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Sala, CONFIG } = require('../server/juego');
const { Mazo, cargarCartas } = require('../server/cartas');
const { crearLimitador } = require('../server/limite');

/** Reloj falso: los temporizadores solo saltan cuando llamamos a avanzar(). */
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
    avanzar(ms) {
      const fin = t + ms;
      for (;;) {
        const proxima = tareas.filter((x) => x.viva && x.cuando <= fin).sort((a, b) => a.cuando - b.cuando)[0];
        if (!proxima) break;
        t = proxima.cuando;
        proxima.viva = false;
        proxima.fn();
      }
      t = fin;
      tareas = tareas.filter((x) => x.viva);
    },
  };
}

const CARTAS = {
  pregunta: ['¿Qué hay en el congelador de {nombre}?', '¿Qué gritó el cura?'],
  respuesta: ['Tres litros de lejía y mucha fe.'],
  inicio: ['En el funeral de {nombre2} y {nombre}...'],
  fin: ['...y por eso ya no nos dejan entrar en el Mercadona.'],
};

/**
 * Sala de prueba. Por defecto sin puja mínima, sin Hacienda y sin límite de escritura,
 * para probar cada regla por separado. `ajustes` activa lo que haga falta.
 */
function montar(nJugadores = 3, pelas = 100, ajustes = {}) {
  const reloj = relojFalso();
  const sala = new Sala('TEST', { cartas: CARTAS, programar: reloj.programar, ahora: reloj.ahora, aleatorio: () => 0 });
  const js = [];
  for (let i = 0; i < nJugadores; i++) {
    const j = sala.unirse({ apodo: `J${i}`, nombre: `Nombre${i}` });
    sala.conectar(j.id);
    js.push(j);
  }
  const lista = Array.isArray(pelas) ? pelas : js.map(() => pelas);
  js.forEach((j, i) => sala.ponerPelas(js[0].id, j.id, lista[i]));
  sala.ajustar(js[0].id, { pujaMinPct: 0, hacienda: 'apagada', tiempoEscribir: 0, ...ajustes });
  return { sala, reloj, js };
}

const pelasDe = (sala, js) => js.map((j) => sala.jugadores.get(j.id).pelas);

/** Cada jugador vivo gana una carta pujando la salida, en orden. */
function repartirCartas(sala, reloj, js) {
  for (const j of js) {
    if (j.fantasma) continue;
    sala.pujar(j.id, 1);
    reloj.avanzar(CONFIG.T_PUJA);
  }
}

/** Juega una ronda entera: subasta, escribir, lectura y votación (todos votan a los siguientes). */
function jugarRonda(sala, reloj, js) {
  repartirCartas(sala, reloj, js);
  for (const j of js) sala.responder(j.id, `respuesta de ${j.apodo}`);
  while (sala.fase === 'lectura') sala.avanzar(sala.modId, 1);
  const vivos = js.filter((j) => !j.fantasma);
  for (const j of vivos) {
    const otros = vivos.filter((o) => o.id !== j.id).map((o) => o.id);
    sala.votar(j.id, otros.slice(0, sala.requeridos(j.id)));
  }
}

// ───────────────────────── sala de espera ─────────────────────────

test('el primero en entrar es moderador y puede ceder el rol', () => {
  const { sala, js } = montar();
  assert.equal(sala.modId, js[0].id);
  sala.ceder(js[0].id, js[1].id);
  assert.equal(sala.modId, js[1].id);
  assert.throws(() => sala.empezar(js[0].id), /moderador/);
});

test('no se puede empezar con menos de 3 jugadores ni con alguien a 0 pelas', () => {
  const { sala, js } = montar(2);
  assert.throws(() => sala.empezar(js[0].id), /al menos 3/);
  const j3 = sala.unirse({ apodo: 'Pobre', nombre: 'Pobre' });
  assert.throws(() => sala.empezar(js[0].id), /Dale pelas a Pobre/);
  sala.ponerPelas(js[0].id, j3.id, 10);
  sala.empezar(js[0].id);
  assert.equal(sala.fase, 'subasta');
});

test('apodos repetidos no valen', () => {
  const { sala } = montar();
  assert.throws(() => sala.unirse({ apodo: 'j0', nombre: 'x' }), /pillado/);
});

test('ajustes nuevos: valores por defecto y límites', () => {
  const reloj = relojFalso();
  const sala = new Sala('X', { cartas: CARTAS, programar: reloj.programar, ahora: reloj.ahora });
  assert.equal(sala.ajustes.pujaMinPct, 5);
  assert.equal(sala.ajustes.hacienda, 'normal');
  assert.equal(sala.ajustes.votosAnonimos, false);
  assert.equal(sala.ajustes.tiempoEscribir, 120);

  const { sala: s, js } = montar();
  s.ajustar(js[0].id, { pujaMinPct: 30, hacienda: 'salvaje', votosAnonimos: true, tiempoEscribir: 600 });
  assert.equal(s.ajustes.pujaMinPct, 30);
  assert.throws(() => s.ajustar(js[0].id, { pujaMinPct: 31 }), /0 a 30/);
  assert.throws(() => s.ajustar(js[0].id, { pujaMinPct: -1 }), /0 a 30/);
  assert.throws(() => s.ajustar(js[0].id, { pujaMinPct: 2.5 }), /0 a 30/);
  assert.throws(() => s.ajustar(js[0].id, { hacienda: 'paraiso-fiscal' }), /no existe/);
  assert.throws(() => s.ajustar(js[0].id, { tiempoEscribir: 601 }), /600/);
  assert.throws(() => s.ajustar(js[1].id, { pujaMinPct: 10 }), /moderador/);
});

test('dar pelas a todos de una vez', () => {
  const { sala, js } = montar(4, [1, 2, 3, 4]);
  sala.ponerPelasTodos(js[0].id, 150);
  assert.deepEqual(pelasDe(sala, js), [150, 150, 150, 150]);
});

// ───────────────────────── subasta ─────────────────────────

test('puja: gana el más alto al acabar los 8 s y paga', () => {
  const { sala, reloj, js } = montar();
  sala.empezar(js[0].id);
  sala.pujar(js[0].id, 5); // salida 1 + 5 = 6
  sala.pujar(js[1].id, 10); // 16
  assert.throws(() => sala.pujar(js[1].id, 1), /ansias/);
  reloj.avanzar(CONFIG.T_PUJA - 1);
  sala.pujar(js[0].id, 1); // 17, reinicia el temporizador
  reloj.avanzar(CONFIG.T_PUJA - 1);
  assert.equal(sala.entradas.size, 0);
  reloj.avanzar(1);
  assert.equal(sala.entradas.get(js[0].id).precio, 17);
  assert.equal(sala.jugadores.get(js[0].id).pelas, 83);
  assert.throws(() => sala.pujar(js[0].id, 1), /Ya tienes carta/);
});

test('no puedes pujar todo tu dinero: siempre te queda 1 pela', () => {
  const { sala, js } = montar(3, 10);
  sala.empezar(js[0].id);
  sala.pujar(js[0].id, 5); // 6
  assert.throws(() => sala.pujar(js[1].id, 5), /Como mucho puedes pujar 9/);
  sala.pujar(js[1].id, 1); // 7
});

test('precio de salida: % de la media de pelas de los vivos, mínimo 1', () => {
  const casos = [
    { pct: 0, pelas: 150, esperado: 1 },
    { pct: 5, pelas: 150, esperado: 8 }, // 7,5 → 8
    { pct: 30, pelas: 150, esperado: 45 },
    { pct: 10, pelas: [100, 200, 300, 400], esperado: 25 },
    { pct: 1, pelas: 20, esperado: 1 }, // 0,2 → nunca menos de 1
  ];
  for (const { pct, pelas, esperado } of casos) {
    const { sala, js } = montar(4, pelas, { pujaMinPct: pct });
    sala.empezar(js[0].id);
    assert.equal(sala.precioSalida, esperado, `pct ${pct}`);
    assert.equal(sala.vista(js[1].id).subasta.precioSalida, esperado);
  }
  // la vista dice con qué media se calculó (la de los vivos al empezar la ronda)
  const { sala, js } = montar(4, [100, 200, 300, 400], { pujaMinPct: 10 });
  sala.empezar(js[0].id);
  assert.equal(sala.vista(js[0].id).subasta.mediaSalida, 250);
});

test('botones sin pujas: salida, salida + 5 y salida + 10; con puja: +1/+5/+10', () => {
  for (const [inc, esperado] of [[1, 8], [5, 13], [10, 18]]) {
    const { sala, js } = montar(4, 150, { pujaMinPct: 5 });
    sala.empezar(js[0].id);
    sala.pujar(js[0].id, inc);
    assert.equal(sala.subasta.puja.cantidad, esperado);
  }
  const { sala, js } = montar(4, 150, { pujaMinPct: 5 });
  sala.empezar(js[0].id);
  sala.pujar(js[0].id, 1); // 8
  sala.pujar(js[1].id, 1); // 9
  assert.equal(sala.subasta.puja.cantidad, 9);
});

test('quien no llega al precio de salida no puede pujar', () => {
  const { sala, js } = montar(4, [8, 200, 200, 200], { pujaMinPct: 5 }); // media 152 → salida 8
  sala.empezar(js[0].id);
  assert.equal(sala.precioSalida, 8);
  assert.throws(() => sala.pujar(js[0].id, 1), /No llegas: la carta sale desde 8/);
});

test('el precio de salida se recalcula al empezar cada ronda', () => {
  const { sala, reloj, js } = montar(3, 200, { pujaMinPct: 10, rondas: 3 });
  sala.empezar(js[0].id);
  assert.equal(sala.precioSalida, 20);
  jugarRonda(sala, reloj, js);
  sala.siguiente(js[0].id);
  const media = pelasDe(sala, js).reduce((a, b) => a + b, 0) / 3;
  assert.equal(sala.precioSalida, Math.max(1, Math.round(media * 0.1)));
  assert.notEqual(sala.precioSalida, 20);
});

// ───────────────────────── multas ─────────────────────────

test('multa con salida ≤ 15: 15 × jugadores sin carta a cada uno', () => {
  const { sala, reloj, js } = montar(4, 200);
  sala.empezar(js[0].id);
  reloj.avanzar(CONFIG.T_SIN_PUJAS);
  for (const j of js) assert.equal(sala.jugadores.get(j.id).pelas, 200 - 15 * 4);
  // uno consigue carta: ahora quedan 3 sin carta → 45 cada uno
  sala.pujar(js[0].id, 1);
  reloj.avanzar(CONFIG.T_PUJA);
  reloj.avanzar(CONFIG.T_SIN_PUJAS);
  assert.equal(sala.jugadores.get(js[0].id).pelas, 140 - 1);
  assert.equal(sala.jugadores.get(js[1].id).pelas, 140 - 45);
});

test('multa con salida > 15: salida × jugadores sin carta (callarse nunca sale más barato)', () => {
  const { sala, reloj, js } = montar(4, 150, { pujaMinPct: 20 }); // salida 30
  sala.empezar(js[0].id);
  assert.equal(sala.multaBase(), 30);
  assert.equal(sala.vista(js[0].id).subasta.multa, 120);
  reloj.avanzar(CONFIG.T_SIN_PUJAS);
  assert.deepEqual(pelasDe(sala, js), [30, 30, 30, 30]);
});

test('cartas seguidas sin pujas: la sanción se duplica (×1, ×2, ×4, ×8)', () => {
  const { sala, reloj, js } = montar(4, 2000);
  sala.empezar(js[0].id);
  const esperado = [60, 120, 240, 480]; // 15 × 4, y luego el doble cada vez
  let pelas = 2000;
  esperado.forEach((multa, i) => {
    assert.equal(sala.multiplicadorMulta(), 2 ** i);
    assert.equal(sala.vista(js[0].id).subasta.multa, multa);
    reloj.avanzar(CONFIG.T_SIN_PUJAS);
    pelas -= multa;
    assert.deepEqual(pelasDe(sala, js), [pelas, pelas, pelas, pelas], `sanción ${i + 1}`);
  });
  assert.equal(sala.vista(js[0].id).subasta.multiplicador, 16); // sin tope
});

test('la racha vuelve a ×1 en cuanto se vende una carta', () => {
  const { sala, reloj, js } = montar(4, 1000);
  sala.empezar(js[0].id);
  reloj.avanzar(CONFIG.T_SIN_PUJAS); // ×1: 60
  reloj.avanzar(CONFIG.T_SIN_PUJAS); // ×2: 120
  assert.equal(sala.multiplicadorMulta(), 4);
  sala.pujar(js[0].id, 1);
  reloj.avanzar(CONFIG.T_PUJA); // se vende: vuelve a ×1
  assert.equal(sala.multiplicadorMulta(), 1);
  reloj.avanzar(CONFIG.T_SIN_PUJAS); // ×1 con 3 sin carta: 45
  assert.equal(sala.jugadores.get(js[1].id).pelas, 1000 - 60 - 120 - 45);
  assert.equal(sala.jugadores.get(js[0].id).pelas, 1000 - 60 - 120 - 1);
});

test('la racha vuelve a ×1 al empezar una ronda, aunque la anterior acabara en silencio', () => {
  // J2 y J3 mueren en un silencio: la subasta termina justo con una sanción
  const { sala, reloj, js } = montar(4, [1000, 1000, 30, 30], { rondas: 3 });
  sala.empezar(js[0].id);
  sala.pujar(js[0].id, 1);
  reloj.avanzar(CONFIG.T_PUJA);
  sala.pujar(js[1].id, 1);
  reloj.avanzar(CONFIG.T_PUJA);
  reloj.avanzar(CONFIG.T_SIN_PUJAS); // 15 × 2 = 30: J2 y J3 a 0
  assert.equal(sala.fase, 'escribir');
  assert.equal(sala.subasta.silencios, 1);
  for (const j of js) sala.responder(j.id, 'x');
  while (sala.fase === 'lectura') sala.avanzar(js[0].id, 1);
  sala.votar(js[0].id, [js[1].id]);
  sala.votar(js[1].id, [js[0].id]);
  sala.siguiente(js[0].id);
  assert.equal(sala.fase, 'subasta');
  assert.equal(sala.multiplicadorMulta(), 1);
  const antes = sala.jugadores.get(js[0].id).pelas;
  reloj.avanzar(CONFIG.T_SIN_PUJAS);
  assert.equal(sala.jugadores.get(js[0].id).pelas, antes - 30); // ×1: 15 × 2
});

test('la racha se multiplica sobre la base del precio de salida', () => {
  const { sala, reloj, js } = montar(4, 1000, { pujaMinPct: 2 }); // salida 20 > 15
  sala.empezar(js[0].id);
  assert.equal(sala.multaBase(), 20);
  reloj.avanzar(CONFIG.T_SIN_PUJAS); // 20 × 4 = 80
  reloj.avanzar(CONFIG.T_SIN_PUJAS); // 2 × 20 × 4 = 160
  assert.deepEqual(pelasDe(sala, js), [760, 760, 760, 760]);
});

test('si alguien muere a mitad de racha, la siguiente se calcula con los que quedan', () => {
  const { sala, reloj, js } = montar(4, [1000, 1000, 1000, 50]);
  sala.empezar(js[0].id);
  reloj.avanzar(CONFIG.T_SIN_PUJAS); // 15 × 4 = 60: J3 muere
  assert.equal(sala.jugadores.get(js[3].id).fantasma, true);
  reloj.avanzar(CONFIG.T_SIN_PUJAS); // 2 × 15 × 3 = 90
  assert.equal(sala.jugadores.get(js[0].id).pelas, 1000 - 60 - 90);
});

test('si nadie sin carta llega al precio de salida, la cuenta atrás es corta', () => {
  const { sala, reloj, js } = montar(3, [10, 10, 1000], { pujaMinPct: 30 }); // salida 102
  sala.empezar(js[0].id);
  sala.pujar(js[2].id, 1);
  reloj.avanzar(CONFIG.T_PUJA);
  assert.equal(sala.subasta.nadiePuede, true);
  reloj.avanzar(CONFIG.T_NADIE_PUEDE); // multa 102 × 2 → ambos a 0
  assert.equal(sala.fase, 'fin');
  assert.deepEqual(sala.ganadores, [js[2].id]);
});

test('si nadie sin carta puede pagar ni 1 pela, la cuenta atrás es corta', () => {
  const { sala, reloj, js } = montar(3, [100, 1, 1]);
  sala.empezar(js[0].id);
  sala.pujar(js[0].id, 1);
  reloj.avanzar(CONFIG.T_PUJA);
  assert.equal(sala.subasta.nadiePuede, true);
  reloj.avanzar(CONFIG.T_NADIE_PUEDE);
  assert.equal(sala.fase, 'fin');
});

// ───────────────────────── fantasmas ─────────────────────────

test('quedarse a 0 te convierte en fantasma: carta aleatoria, nadie le vota y él no vota', () => {
  const { sala, reloj, js } = montar(4, [100, 100, 100, 30]);
  sala.empezar(js[0].id);
  sala.pujar(js[0].id, 1);
  reloj.avanzar(CONFIG.T_PUJA);
  // quedan 3 sin carta → multa 45: J3 (30) muere
  reloj.avanzar(CONFIG.T_SIN_PUJAS);
  const fantasma = sala.jugadores.get(js[3].id);
  assert.equal(fantasma.pelas, 0);
  assert.equal(fantasma.fantasma, true);
  assert.throws(() => sala.pujar(js[3].id, 1), /fantasmas/);
  sala.pujar(js[1].id, 1);
  reloj.avanzar(CONFIG.T_PUJA);
  sala.pujar(js[2].id, 1);
  reloj.avanzar(CONFIG.T_PUJA);

  assert.equal(sala.fase, 'escribir');
  const entradaFantasma = sala.entradas.get(js[3].id);
  assert.equal(entradaFantasma.fantasma, true);
  const cartasGanadas = sala.subasta.ganadas.map((g) => g.carta);
  assert.ok(cartasGanadas.includes(entradaFantasma.carta));
  assert.deepEqual(sala.ordenLectura, [js[0].id, js[1].id, js[2].id, js[3].id]);

  for (const j of js) sala.responder(j.id, `respuesta de ${j.apodo}`);
  assert.equal(sala.fase, 'lectura');
  for (let i = 0; i < 8; i++) sala.avanzar(js[0].id, 1);
  assert.equal(sala.fase, 'votacion');
  assert.throws(() => sala.votar(js[0].id, [js[1].id, js[3].id]), /no se puede votar/);
  assert.throws(() => sala.votar(js[3].id, [js[0].id, js[1].id, js[2].id]), /fantasmas no votan/);

  // la votación se cierra sin esperar al fantasma
  sala.votar(js[0].id, [js[1].id, js[2].id]);
  sala.votar(js[1].id, [js[0].id, js[2].id]);
  sala.votar(js[2].id, [js[0].id, js[1].id]);
  assert.equal(sala.fase, 'resultados');
  assert.ok(!sala.resultados.some((r) => r.id === js[3].id));
  assert.equal(fantasma.pelas, 0);
});

test('si solo queda un jugador vivo, la partida acaba', () => {
  const { sala, reloj, js } = montar(3, [500, 20, 20]);
  sala.empezar(js[0].id);
  sala.pujar(js[0].id, 1);
  reloj.avanzar(CONFIG.T_PUJA);
  reloj.avanzar(CONFIG.T_SIN_PUJAS); // 2 sin carta → 30 cada uno, ambos a 0
  assert.equal(sala.fase, 'fin');
  assert.deepEqual(sala.ganadores, [js[0].id]);
});

// ───────────────────────── escribir ─────────────────────────

test('tiempo para escribir: al acabar, cuenta el borrador y quien no escribió se queda en blanco', () => {
  const { sala, reloj, js } = montar(3, 100, { tiempoEscribir: 120 });
  sala.empezar(js[0].id);
  repartirCartas(sala, reloj, js);
  assert.equal(sala.fase, 'escribir');
  assert.ok(sala.vista(js[0].id).escribir.limite > 0);
  sala.responder(js[0].id, 'enviada');
  sala.guardarBorrador(js[1].id, 'a medias');
  reloj.avanzar(119 * 1000);
  assert.equal(sala.fase, 'escribir');
  reloj.avanzar(1000);
  assert.equal(sala.fase, 'lectura');
  assert.equal(sala.entradas.get(js[0].id).texto, 'enviada');
  assert.equal(sala.entradas.get(js[1].id).texto, 'a medias');
  assert.equal(sala.entradas.get(js[2].id).texto, null);
});

test('si todos los conectados están listos, no se espera a los desconectados', () => {
  const { sala, reloj, js } = montar(3);
  sala.empezar(js[0].id);
  repartirCartas(sala, reloj, js);
  sala.responder(js[0].id, 'a');
  sala.responder(js[1].id, 'b');
  assert.equal(sala.fase, 'escribir'); // J2 está conectado y no ha acabado
  sala.guardarBorrador(js[2].id, 'lo que llevaba');
  sala.desconectar(js[2].id);
  assert.equal(sala.fase, 'lectura');
  assert.equal(sala.entradas.get(js[2].id).texto, 'lo que llevaba');
});

test('el moderador puede forzar la lectura y la votación', () => {
  const { sala, reloj, js } = montar(3);
  sala.empezar(js[0].id);
  repartirCartas(sala, reloj, js);
  sala.responder(js[0].id, 'algo');
  sala.forzar(js[0].id);
  assert.equal(sala.fase, 'lectura');
  assert.equal(sala.entradas.get(js[1].id).texto, null);
  for (let i = 0; i < 6; i++) sala.avanzar(js[0].id, 1);
  sala.votar(js[0].id, [js[1].id, js[2].id]);
  sala.forzar(js[0].id);
  assert.equal(sala.fase, 'resultados');
});

// ───────────────────────── votación y resultados ─────────────────────────

test('ronda completa: orden de lectura, top 3 y 5 pelas por punto', () => {
  const { sala, reloj, js } = montar(4, 100);
  sala.empezar(js[0].id);
  // ganan en orden J2, J0, J3, J1
  for (const i of [2, 0, 3, 1]) {
    sala.pujar(js[i].id, 1);
    reloj.avanzar(CONFIG.T_PUJA);
  }
  assert.deepEqual(sala.ordenLectura, [js[2].id, js[0].id, js[3].id, js[1].id]);
  sala.responder(js[0].id, 'a');
  sala.responder(js[1].id, 'b');
  sala.editar(js[1].id);
  sala.responder(js[1].id, 'b2');
  sala.responder(js[2].id, 'c');
  assert.equal(sala.fase, 'escribir');
  sala.responder(js[3].id, 'd');
  assert.equal(sala.fase, 'lectura');

  // la respuesta no se ve hasta que el moderador avanza
  assert.equal(sala.vista(js[1].id).lectura.items[0].texto, undefined);
  assert.throws(() => sala.avanzar(js[1].id, 1), /moderador/);
  sala.avanzar(js[0].id, 1);
  assert.equal(sala.vista(js[1].id).lectura.items[0].texto, 'c');
  for (let i = 0; i < 7; i++) sala.avanzar(js[0].id, 1);
  assert.equal(sala.fase, 'votacion');

  assert.throws(() => sala.votar(js[0].id, [js[0].id, js[1].id, js[2].id]), /egocéntrico/);
  assert.throws(() => sala.votar(js[0].id, [js[1].id]), /elegir 3/);
  sala.votar(js[0].id, [js[2].id, js[1].id, js[3].id]);
  sala.votar(js[1].id, [js[2].id, js[0].id, js[3].id]);
  sala.votar(js[2].id, [js[0].id, js[1].id, js[3].id]);
  sala.votar(js[3].id, [js[2].id, js[1].id, js[0].id]);
  assert.equal(sala.fase, 'resultados');

  const puntos = Object.fromEntries(sala.resultados.map((r) => [r.id, r.puntos]));
  assert.equal(puntos[js[2].id], 9);
  assert.equal(puntos[js[0].id], 6);
  assert.equal(puntos[js[1].id], 6);
  assert.equal(puntos[js[3].id], 3);
  assert.equal(sala.resultados[0].id, js[2].id);
  assert.equal(sala.jugadores.get(js[2].id).pelas, 100 - 1 + 45);
});

test('votos públicos: los resultados dicen quién votó qué', () => {
  const { sala, reloj, js } = montar(3);
  sala.empezar(js[0].id);
  jugarRonda(sala, reloj, js);
  const v = sala.vista(js[1].id);
  assert.equal(v.votos.length, 3);
  assert.deepEqual(v.votos.find((x) => x.id === js[0].id).ranking, [js[1].id, js[2].id]);
});

test('votos anónimos: el servidor no envía quién votó qué a nadie', () => {
  const { sala, reloj, js } = montar(3, 100, { votosAnonimos: true });
  sala.empezar(js[0].id);
  jugarRonda(sala, reloj, js);
  assert.equal(sala.fase, 'resultados');
  for (const j of js) {
    const v = sala.vista(j.id);
    assert.equal(v.votos, null);
    assert.ok(!JSON.stringify(v).includes('ranking'));
  }
});

// ───────────────────────── Hacienda ─────────────────────────

test('Hacienda: quien pasa de la media paga el % de lo que se pasa', () => {
  const { sala, js } = montar(4, 100, { hacienda: 'normal' });
  sala.empezar(js[0].id); // ronda 1 de 10
  [400, 320, 260, 220].forEach((p, i) => (sala.jugadores.get(js[i].id).pelas = p));
  sala._cobrarHacienda();
  assert.deepEqual(pelasDe(sala, js), [375, 315, 260, 220]);
  assert.equal(sala.hacienda.estado, 'cobrada');
  assert.equal(sala.hacienda.media, 300);
  assert.equal(sala.hacienda.total, 30);
  assert.deepEqual(
    sala.hacienda.cobros.map((c) => c.paga),
    [25, 5]
  );
});

test('Hacienda nunca adelanta a nadie, no deja a nadie a 0 y no cobra a quien está por debajo', () => {
  let semilla = 7;
  const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (const nivel of ['suave', 'normal', 'salvaje']) {
    for (let caso = 0; caso < 200; caso++) {
      const n = 3 + Math.floor(azar() * 6);
      const iniciales = Array.from({ length: n }, () => 1 + Math.floor(azar() * 800));
      const { sala, js } = montar(n, 100, { hacienda: nivel });
      sala.empezar(js[0].id);
      iniciales.forEach((p, i) => (sala.jugadores.get(js[i].id).pelas = p));
      const m = iniciales.reduce((a, b) => a + b, 0) / n;
      sala._cobrarHacienda();
      const despues = pelasDe(sala, js);
      for (let a = 0; a < n; a++) {
        assert.ok(despues[a] > 0);
        if (iniciales[a] <= m) assert.equal(despues[a], iniciales[a]);
        for (let b = 0; b < n; b++) {
          if (iniciales[a] >= iniciales[b]) assert.ok(despues[a] >= despues[b], `${nivel}: ${iniciales} → ${despues}`);
        }
      }
    }
  }
});

test('Hacienda no cobra en la última ronda ni si está apagada', () => {
  const { sala, js } = montar(3, 100, { hacienda: 'salvaje', rondas: 3 });
  sala.empezar(js[0].id);
  [500, 100, 100].forEach((p, i) => (sala.jugadores.get(js[i].id).pelas = p));
  sala.ronda = 3;
  sala._cobrarHacienda();
  assert.equal(sala.hacienda.estado, 'ultima');
  assert.deepEqual(pelasDe(sala, js), [500, 100, 100]);

  sala.ronda = 1;
  sala.ajustes.hacienda = 'apagada';
  sala._cobrarHacienda();
  assert.equal(sala.hacienda.estado, 'apagada');
  assert.deepEqual(pelasDe(sala, js), [500, 100, 100]);
});

test('Hacienda: los fantasmas no cuentan para la media ni pagan', () => {
  const { sala, js } = montar(4, 100, { hacienda: 'normal' });
  sala.empezar(js[0].id);
  [300, 100, 100, 0].forEach((p, i) => (sala.jugadores.get(js[i].id).pelas = p));
  sala.jugadores.get(js[3].id).fantasma = true;
  sala._cobrarHacienda(); // media de los vivos 166,67 → J0 paga floor(0,25 × 133,33) = 33
  assert.deepEqual(pelasDe(sala, js), [267, 100, 100, 0]);
});

test('Hacienda se cobra sola al acabar una ronda que no es la última', () => {
  const { sala, reloj, js } = montar(3, [300, 100, 100], { hacienda: 'salvaje', rondas: 2 });
  sala.empezar(js[0].id);
  jugarRonda(sala, reloj, js);
  assert.equal(sala.fase, 'resultados');
  assert.equal(sala.hacienda.estado, 'cobrada');
  assert.ok(sala.hacienda.total > 0);
  assert.equal(sala.vista(js[1].id).hacienda.total, sala.hacienda.total);
  sala.siguiente(js[0].id);
  jugarRonda(sala, reloj, js);
  assert.equal(sala.hacienda.estado, 'ultima');
});

// ───────────────────────── final y varios ─────────────────────────

test('tras la última ronda se termina y gana quien más pelas tiene', () => {
  const { sala, reloj, js } = montar(3);
  sala.ajustar(js[0].id, { rondas: 1 });
  sala.empezar(js[0].id);
  repartirCartas(sala, reloj, js);
  for (const j of js) sala.responder(j.id, 'x');
  for (let i = 0; i < 6; i++) sala.avanzar(js[0].id, 1);
  sala.votar(js[0].id, [js[1].id, js[2].id]);
  sala.votar(js[1].id, [js[2].id, js[0].id]);
  sala.votar(js[2].id, [js[1].id, js[0].id]);
  sala.siguiente(js[0].id);
  assert.equal(sala.fase, 'fin');
  assert.deepEqual(sala.ganadores, [js[1].id]);
  sala.reiniciar(js[0].id);
  assert.equal(sala.fase, 'sala');
});

test('el moderador desconectado pasa el rol tras la espera', () => {
  const { sala, reloj, js } = montar(3);
  sala.desconectar(js[0].id);
  reloj.avanzar(CONFIG.GRACIA_MOD);
  assert.equal(sala.modId, js[1].id);
});

test('límite de acciones: 5 por segundo', () => {
  let t = 0;
  const lim = crearLimitador(5, 1000, () => t);
  for (let i = 0; i < 5; i++) assert.equal(lim.permitir(), true);
  assert.equal(lim.permitir(), false);
  t = 999;
  assert.equal(lim.permitir(), false);
  t = 1000;
  assert.equal(lim.permitir(), true);
});

test('mazo: sin nombres quita las cartas con {nombre}; con nombres las rellena', () => {
  const sin = new Mazo(CARTAS, { tipos: ['pregunta', 'inicio'], nombres: [] });
  for (let i = 0; i < 10; i++) assert.doesNotMatch(sin.sacar().texto, /\{|Paco/);
  const con = new Mazo(CARTAS, { tipos: ['inicio'], nombres: ['Paco', 'Lola'] });
  const texto = con.sacar().texto;
  assert.match(texto, /Paco/);
  assert.match(texto, /Lola/);
});

test('los mazos reales cargan y tienen chicha', () => {
  const reales = cargarCartas();
  for (const [tipo, lista] of Object.entries(reales)) {
    assert.ok(lista.length >= 80, `${tipo} tiene solo ${lista.length} cartas`);
    assert.equal(new Set(lista).size, lista.length, `${tipo} tiene cartas repetidas`);
    const sinNombre = lista.filter((c) => !c.includes('{nombre'));
    assert.ok(sinNombre.length >= 50, `${tipo} necesita más cartas sin nombres`);
  }
  for (const c of reales.inicio) assert.match(c, /\.\.\.$|…$/, `inicio sin "...": ${c}`);
  for (const c of reales.fin) assert.match(c, /^\.\.\.|^…/, `fin sin "...": ${c}`);
  for (const c of reales.pregunta) assert.match(c, /\?$/, `pregunta sin "?": ${c}`);
});
