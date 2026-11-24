'use strict';

// Arranca el servidor de verdad en un puerto libre y lo prueba por HTTP.
const { test } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

function puertoLibre() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

async function arrancarServidor() {
  const puerto = await puertoLibre();
  const hijo = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
    env: { ...process.env, PORT: String(puerto), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let salida = '';
  hijo.stdout.on('data', (d) => (salida += d));
  hijo.stderr.on('data', (d) => (salida += d));
  const base = `http://127.0.0.1:${puerto}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) return { base, hijo, salida: () => salida };
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  hijo.kill();
  throw new Error(`El servidor no arranca:\n${salida}`);
}

test('con HOST=127.0.0.1 no anuncia direcciones de la red local', async (t) => {
  const { hijo, salida } = await arrancarServidor();
  t.after(() => hijo.kill());
  assert.match(salida(), /localhost/);
  assert.doesNotMatch(salida(), /Desde tu móvil/);
});

test('limita las salas abiertas a la vez a 20', async (t) => {
  const { base, hijo } = await arrancarServidor();
  t.after(() => hijo.kill());
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${base}/api/salas`, { method: 'POST' });
    assert.strictEqual(r.status, 200);
    assert.match((await r.json()).codigo, /^[A-Z]{5}$/);
  }
  const r = await fetch(`${base}/api/salas`, { method: 'POST' });
  assert.strictEqual(r.status, 503);
  assert.match((await r.json()).error, /salas/);
});
