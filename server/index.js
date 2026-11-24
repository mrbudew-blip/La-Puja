'use strict';

const path = require('path');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const { Sala, ErrorJuego } = require('./juego');
const { cargarCartas } = require('./cartas');
const { crearLimitador } = require('./limite');

const PUERTO = Number(process.env.PORT) || 3000;
// HOST=127.0.0.1 hace que solo se pueda entrar desde este PC (o por el túnel de `npm run online`).
const HOST = process.env.HOST || undefined;
const INACTIVIDAD_MAX = 30 * 60 * 1000; // salas vacías se borran a los 30 min
const MAX_SALAS = 20; // salas abiertas a la vez: que nadie con el enlace llene la memoria del PC
const INACTIVIDAD_SI_LLENO = 5 * 60 * 1000; // si se llega al máximo, se borran antes las vacías
const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sin I ni O para no confundir

const cartas = cargarCartas();
const salas = new Map(); // codigo -> { sala, sockets: Map<jugadorId, socket> }

const app = express();
const servidor = http.createServer(app);
const io = new Server(servidor);

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

function programar(ms, fn) {
  const t = setTimeout(fn, ms);
  return () => clearTimeout(t);
}

function nuevoCodigo() {
  for (;;) {
    let codigo = '';
    for (let i = 0; i < 5; i++) codigo += LETRAS[crypto.randomInt(LETRAS.length)];
    if (!salas.has(codigo)) return codigo;
  }
}

function crearSala() {
  const codigo = nuevoCodigo();
  const sala = new Sala(codigo, { cartas, programar });
  const info = { sala, sockets: new Map(), pendiente: false };

  sala.onCambio = () => {
    if (info.pendiente) return;
    info.pendiente = true;
    setImmediate(() => {
      info.pendiente = false;
      for (const [id, socket] of info.sockets) socket.emit('estado', sala.vista(id));
    });
  };
  sala.onEvento = (texto, tipo) => io.to(codigo).emit('evento', { texto, tipo });

  salas.set(codigo, info);
  return info;
}

// Borra las salas sin nadie conectado que llevan más de `inactividadMs` sin moverse.
function limpiarSalas(inactividadMs) {
  const ahora = Date.now();
  for (const [codigo, info] of salas) {
    if (info.sockets.size === 0 && ahora - info.sala.ultimaActividad > inactividadMs) {
      info.sala.destruir();
      salas.delete(codigo);
    }
  }
}

app.post('/api/salas', (_req, res) => {
  if (salas.size >= MAX_SALAS) limpiarSalas(INACTIVIDAD_SI_LLENO);
  if (salas.size >= MAX_SALAS) {
    return res.status(503).json({ error: `Ya hay ${MAX_SALAS} salas abiertas, que es el máximo. Prueba en unos minutos.` });
  }
  const { sala } = crearSala();
  res.json({ codigo: sala.codigo });
});

app.get('/sala/:codigo', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

io.on('connection', (socket) => {
  let info = null;
  let jugadorId = null;
  const limitador = crearLimitador(5, 1000);

  function vincular(nuevaInfo, jugador) {
    const anterior = nuevaInfo.sockets.get(jugador.id);
    info = nuevaInfo;
    jugadorId = jugador.id;
    socket.join(info.sala.codigo);
    info.sockets.set(jugador.id, socket); // antes de echar al anterior, para que su desconexión no cuente
    if (anterior && anterior !== socket) {
      anterior.emit('sustituido');
      anterior.disconnect(true);
    }
    info.sala.conectar(jugador.id);
  }

  socket.on('entrar', (datos, responder) => {
    const cb = typeof responder === 'function' ? responder : () => {};
    try {
      if (info) return cb({ error: 'Ya estás dentro de una sala.' });
      datos = datos || {};
      const codigo = String(datos.codigo || '').toUpperCase();
      const nuevaInfo = salas.get(codigo);
      if (!nuevaInfo) return cb({ error: 'Esta sala no existe o ya la han cerrado.' });
      const { sala } = nuevaInfo;

      const conocido = sala.porToken(datos.token);
      // En la sala de espera, si ese jugador ya está conectado en otra pestaña,
      // esta pestaña entra como jugador nuevo (sirve para probar en un solo PC).
      const otraPestana = conocido && sala.fase === 'sala' && conocido.conectado && nuevaInfo.sockets.has(conocido.id);
      if (conocido && !otraPestana) {
        vincular(nuevaInfo, conocido);
        return cb({ ok: true, token: conocido.token, id: conocido.id });
      }

      if (!datos.apodo) return cb({ necesitaDatos: true, fase: sala.fase });
      const jugador = sala.unirse({ apodo: datos.apodo, nombre: datos.nombre });
      vincular(nuevaInfo, jugador);
      cb({ ok: true, token: jugador.token, id: jugador.id });
    } catch (e) {
      cb({ error: e instanceof ErrorJuego ? e.message : 'Algo ha petado en el servidor.' });
      if (!(e instanceof ErrorJuego)) console.error(e);
    }
  });

  const acciones = {
    ajustar: (d) => info.sala.ajustar(jugadorId, d),
    pelas: (d) => info.sala.ponerPelas(jugadorId, d.id, d.pelas),
    pelasTodos: (d) => info.sala.ponerPelasTodos(jugadorId, d.pelas),
    ceder: (d) => info.sala.ceder(jugadorId, d.id),
    empezar: () => info.sala.empezar(jugadorId),
    pujar: (d) => info.sala.pujar(jugadorId, d.incremento),
    responder: (d) => info.sala.responder(jugadorId, d.texto),
    editar: () => info.sala.editar(jugadorId),
    forzar: () => info.sala.forzar(jugadorId),
    avanzar: (d) => info.sala.avanzar(jugadorId, d.direccion),
    votar: (d) => info.sala.votar(jugadorId, d.ranking),
    siguiente: () => info.sala.siguiente(jugadorId),
    reiniciar: () => info.sala.reiniciar(jugadorId),
    salir: () => {
      info.sala.salir(jugadorId);
      info.sockets.delete(jugadorId);
      socket.leave(info.sala.codigo);
      info = null;
      jugadorId = null;
    },
    expulsar: (d) => {
      const objetivo = info.sockets.get(d.id);
      info.sala.expulsar(jugadorId, d.id);
      info.sockets.delete(d.id);
      if (objetivo) {
        objetivo.emit('expulsado');
        objetivo.disconnect(true);
      }
    },
  };

  // El borrador se manda mientras escribes: no cuenta para el límite y no avisa a nadie.
  socket.on('borrador', (datos) => {
    if (!info || !jugadorId || !datos) return;
    info.sala.guardarBorrador(jugadorId, datos.texto);
  });

  for (const [nombre, accion] of Object.entries(acciones)) {
    socket.on(nombre, (datos, responder) => {
      const cb = typeof responder === 'function' ? responder : () => {};
      if (!info || !jugadorId) return cb({ error: 'No estás en ninguna sala.' });
      if (!limitador.permitir()) return cb({ error: 'Más despacio, ansias.' });
      try {
        accion(datos || {});
        cb({ ok: true });
      } catch (e) {
        cb({ error: e instanceof ErrorJuego ? e.message : 'Algo ha petado en el servidor.' });
        if (!(e instanceof ErrorJuego)) console.error(e);
      }
    });
  }

  socket.on('disconnect', () => {
    if (!info || !jugadorId) return;
    if (info.sockets.get(jugadorId) === socket) {
      info.sockets.delete(jugadorId);
      info.sala.desconectar(jugadorId);
    }
  });
});

// Limpieza de salas abandonadas
setInterval(() => limpiarSalas(INACTIVIDAD_MAX), 5 * 60 * 1000).unref();

function ipsLocales() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

servidor.listen(PUERTO, HOST, () => {
  console.log(`\n🔨 La Puja está en marcha`);
  console.log(`   En este PC:          http://localhost:${PUERTO}`);
  if (!HOST) for (const ip of ipsLocales()) console.log(`   Desde tu móvil (wifi): http://${ip}:${PUERTO}`);
  console.log('');
});
