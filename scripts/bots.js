'use strict';

/**
 * Bots para probar La Puja sin tener que reunir a nadie.
 *
 *   npm run bots -- ABCDE 3     → mete 3 bots en la sala ABCDE (tú eres el moderador)
 *   npm run bots -- --sola 4    → crea una sala y 4 bots juegan una partida entera solos
 *
 * Variable URL para apuntar a otro servidor (por defecto http://localhost:3000).
 */

const { io } = require('socket.io-client');

const URL = process.env.URL || 'http://localhost:3000';
const NOMBRES = ['Botijo', 'Robotín', 'Chatarra', 'Tostadora', 'Calculín', 'Roomba', 'Alexa', 'Clippy'];
const RESPUESTAS = [
  'Lo que encontró el forense en el Cola Cao.',
  'Tres litros de anís y la dentadura del abuelo.',
  'El cura, en tanga, en el Mercadona.',
  'Una herencia en pipas Facundo.',
  'Mi suegra, pero con más bigote.',
  'Porque Hacienda no mira dentro de los ataúdes.',
  'Un chorizo de Cantimpalos con nombre y apellidos.',
  'La Roomba, que ya sabe demasiado.',
];

const azar = (lista) => lista[Math.floor(Math.random() * lista.length)];
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function crearBot(codigo, indice, { esModerador = false, alAcabar } = {}) {
  const socket = io(URL, { forceNew: true });
  const apodo = `${NOMBRES[indice % NOMBRES.length]}${indice >= NOMBRES.length ? indice : ''}`;
  let yo = null;
  let ocupado = false;
  let ultimaFase = null;

  const emitir = (evento, datos = {}) =>
    new Promise((resolver) => socket.emit(evento, datos, (r) => resolver(r || {})));

  socket.on('connect', async () => {
    const r = await emitir('entrar', { codigo, apodo, nombre: apodo });
    if (r.error) {
      console.error(`[${apodo}] no puede entrar: ${r.error}`);
      socket.close();
      return;
    }
    yo = r.id;
    console.log(`[${apodo}] dentro`);
  });

  socket.on('evento', ({ texto }) => {
    if (indice === 0) console.log(`  · ${texto}`);
  });

  let ultimoEstado = null;
  // Si nada cambia (por ejemplo, el bot es el último sin carta), lo vuelve a intentar
  const reintento = setInterval(() => ultimoEstado && manejar(ultimoEstado), 2500);
  socket.on('disconnect', () => clearInterval(reintento));

  socket.on('estado', (v) => {
    ultimoEstado = v;
    manejar(v);
  });

  async function manejar(v) {
    if (!yo || ocupado) return;
    const soyMod = v.modId === yo;
    const me = v.jugadores.find((j) => j.id === yo);
    if (v.fase !== ultimaFase && indice === 0) console.log(`\n== ${v.fase.toUpperCase()} (ronda ${v.ronda}) ==`);
    ultimaFase = v.fase;
    ocupado = true;
    try {
      if (v.fase === 'sala' && esModerador && soyMod && v.jugadores.length >= 3) {
        const totalBots = Number(process.env.BOTS_TOTAL || 0);
        if (v.jugadores.length < totalBots) return;
        await emitir('ajustar', { rondas: Number(process.env.RONDAS || 2) });
        // De uno en uno y con pausa: el servidor solo acepta 5 acciones por segundo
        for (const j of v.jugadores) {
          if (j.pelas === 0) {
            await emitir('pelas', { id: j.id, pelas: 100 + Math.floor(Math.random() * 100) });
            await esperar(250);
          }
        }
        await esperar(300);
        const r = await emitir('empezar');
        if (r.error && !/al menos|Dale pelas/.test(r.error)) console.error(r.error);
      } else if (v.fase === 'subasta') {
        const s = v.subasta;
        const puedo = me && !me.fantasma && s.sinCarta.includes(yo) && !(s.puja && s.puja.id === yo);
        const actual = s.puja ? s.puja.cantidad : 0;
        const siguiente = s.puja ? actual + 1 : s.precioSalida; // sin pujas, "+1" es la salida
        // A veces no pujan, para que salte la multa; y no suben más de 12 por encima de la salida
        if (puedo && siguiente <= s.miMax && actual < s.precioSalida + 12 && Math.random() < 0.55) {
          const inc = s.puja && actual + 5 <= s.miMax ? azar([1, 1, 5]) : 1;
          await esperar(200 + Math.random() * 600);
          await emitir('pujar', { incremento: inc });
        }
      } else if (v.fase === 'escribir' && v.miEntrada && !v.miEntrada.listo) {
        await esperar(300 + Math.random() * 700);
        await emitir('responder', { texto: azar(RESPUESTAS) });
      } else if (v.fase === 'lectura' && soyMod) {
        await esperar(250);
        await emitir('avanzar', { direccion: 1 });
      } else if (v.fase === 'votacion' && !v.votacion.miVoto && me && !me.fantasma) {
        const opciones = v.votacion.opciones.filter((o) => !o.fantasma && o.id !== yo).map((o) => o.id);
        opciones.sort(() => Math.random() - 0.5);
        await esperar(200 + Math.random() * 500);
        await emitir('votar', { ranking: opciones.slice(0, v.votacion.requeridos) });
      } else if (v.fase === 'resultados' && soyMod) {
        await esperar(400);
        await emitir('siguiente');
      } else if (v.fase === 'fin' && esModerador && alAcabar) {
        alAcabar(v);
      }
    } finally {
      ocupado = false;
    }
  }

  return socket;
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--sola') {
    const n = Number(args[1] || 4);
    const res = await fetch(`${URL}/api/salas`, { method: 'POST' });
    const { codigo } = await res.json();
    console.log(`Sala ${codigo} creada. Míralo en ${URL}/sala/${codigo}\n`);
    process.env.BOTS_TOTAL = String(n);
    const bots = [];
    let acabado = false;
    const alAcabar = (v) => {
      if (acabado) return;
      acabado = true;
      console.log('\n== CLASIFICACIÓN FINAL ==');
      for (const j of v.jugadores.slice().sort((a, b) => b.pelas - a.pelas)) {
        console.log(`  ${v.ganadores.includes(j.id) ? '🏆' : '  '} ${j.apodo.padEnd(12)} ${String(j.pelas).padStart(5)} ₧${j.fantasma ? '  👻' : ''}`);
      }
      setTimeout(() => {
        bots.forEach((b) => b.close());
        process.exit(0);
      }, 300);
    };
    bots.push(crearBot(codigo, 0, { esModerador: true, alAcabar }));
    await esperar(400);
    for (let i = 1; i < n; i++) bots.push(crearBot(codigo, i));
    return;
  }

  const codigo = (args[0] || '').toUpperCase();
  const n = Number(args[1] || 3);
  if (!codigo) {
    console.log('Uso: npm run bots -- CODIGO [número]   o   npm run bots -- --sola [número]');
    process.exit(1);
  }
  for (let i = 0; i < n; i++) crearBot(codigo, i);
}

main();
