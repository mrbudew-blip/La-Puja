'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { extraerEnlace, buscarCloudflared } = require('../scripts/online.js');

test('extraerEnlace saca la dirección del recuadro de cloudflared', () => {
  const linea = '2026-11-24T16:42:12Z INF |  https://applies-memorial-craig-low.trycloudflare.com                                      |';
  assert.strictEqual(extraerEnlace(linea), 'https://applies-memorial-craig-low.trycloudflare.com');
});

test('extraerEnlace ignora la API de Cloudflare y el texto sin dirección', () => {
  assert.strictEqual(extraerEnlace('failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel": EOF'), null);
  assert.strictEqual(extraerEnlace('INF Requesting new quick Tunnel on trycloudflare.com...'), null);
});

test('buscarCloudflared usa CLOUDFLARED, luego el PATH', () => {
  const exe = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  const enPath = path.join(path.sep, 'y', exe);
  const entorno = { PATH: [path.join(path.sep, 'x'), path.join(path.sep, 'y')].join(path.delimiter) };
  assert.strictEqual(buscarCloudflared(entorno, (r) => r === enPath), enPath);
  assert.strictEqual(buscarCloudflared({ ...entorno, CLOUDFLARED: '/a/mano' }, (r) => r === '/a/mano'), '/a/mano');
  assert.strictEqual(buscarCloudflared(entorno, () => false), null);
});
