'use strict';

/**
 * `npm run online`: pone La Puja en internet desde este PC, gratis.
 *
 * Arranca el servidor (que solo atiende a este PC) y un túnel rápido de Cloudflare
 * que le da una dirección pública https://….trycloudflare.com. No hace falta cuenta
 * ni tocar el router. Si se cae el servidor o el túnel, se apaga todo; Ctrl + C también.
 * Mientras está encendido, Windows no se suspende.
 *
 * Opciones:  --sin-navegador  no abre el navegador
 *            --detalle        enseña todo lo que dice cloudflared
 * Variables: PORT (3000 por defecto), CLOUDFLARED (ruta al programa si no lo encuentra)
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const https = require('node:https');
const dns = require('node:dns');

const PUERTO = Number(process.env.PORT) || 3000;
const RAIZ = path.join(__dirname, '..');
const ESPERA_SERVIDOR = 10_000;
const ESPERA_ENLACE = 40_000;
const ESPERA_PUBLICO = 60_000;

// Colores solo en una consola de verdad (no al redirigir a un archivo).
const conColor = Boolean(process.stdout.isTTY);
const NEGRITA = conColor ? '\x1b[1m' : '';
const ORO = conColor ? '\x1b[1;33m' : '';
const NORMAL = conColor ? '\x1b[0m' : '';

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────────────────────── piezas que se prueban ─────────────────────────

/** Primera dirección https://<algo>.trycloudflare.com del texto (nunca la de la API), o null. */
function extraerEnlace(texto) {
  const m = String(texto).match(/https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/i);
  return m ? m[0].toLowerCase() : null;
}

/**
 * Ruta de cloudflared: la variable CLOUDFLARED, el PATH y, en Windows, donde lo deja
 * winget (por si esta terminal se abrió antes de instalarlo y no tiene el PATH nuevo).
 */
function buscarCloudflared(entorno = process.env, existe = fs.existsSync) {
  if (entorno.CLOUDFLARED) return existe(entorno.CLOUDFLARED) ? entorno.CLOUDFLARED : null;
  const exe = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  const carpetas = String(entorno.PATH || entorno.Path || '')
    .split(path.delimiter)
    .map((c) => c.replace(/"/g, '').trim())
    .filter(Boolean);
  if (process.platform === 'win32') {
    carpetas.push(
      path.join(entorno['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'cloudflared'),
      path.join(entorno.ProgramFiles || 'C:\\Program Files', 'cloudflared'),
    );
    if (entorno.LOCALAPPDATA) carpetas.push(path.join(entorno.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links'));
  }
  for (const carpeta of carpetas) {
    const ruta = path.join(carpeta, exe);
    if (existe(ruta)) return ruta;
  }
  return null;
}

// ───────────────────────── procesos hijos y apagado ─────────────────────────

const hijos = new Set();
let apagando = false;

function apagar(codigo, mensaje) {
  if (apagando) return;
  apagando = true;
  if (mensaje) console.log(mensaje);
  for (const h of hijos) {
    try {
      h.kill();
    } catch {}
  }
  setTimeout(() => process.exit(codigo), 300);
}

function fallar(mensaje) {
  apagar(1, `\n❌ ${mensaje}\n`);
}

process.on('SIGINT', () => apagar(0, '\nApagando La Puja… Se acabó la partida.\n'));
process.on('SIGTERM', () => apagar(0));
process.on('SIGHUP', () => apagar(0)); // cerrar la ventana
process.on('exit', () => {
  for (const h of hijos) {
    try {
      h.kill();
    } catch {}
  }
});

/** Lanza un hijo, guarda sus últimas líneas y avisa si muere sin que lo hayamos apagado. */
function lanzar(nombre, programa, args, { env, alMorir, alLeer } = {}) {
  const hijo = spawn(programa, args, { cwd: RAIZ, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  hijo.ultimas = [];
  const leer = (trozo) => {
    for (const linea of String(trozo).split(/\r?\n/)) {
      if (!linea.trim()) continue;
      hijo.ultimas.push(linea);
      if (hijo.ultimas.length > 80) hijo.ultimas.shift();
      if (alLeer) alLeer(linea);
    }
  };
  hijo.stdout.on('data', leer);
  hijo.stderr.on('data', leer);
  hijo.on('error', (e) => {
    hijo.ultimas.push(`${nombre}: ${e.message}`);
  });
  hijo.on('exit', () => {
    hijos.delete(hijo);
    hijo.muerto = true;
    // Con Ctrl + C, Windows avisa a la vez a los hijos: espera un poco para no dar un falso "se ha caído".
    setTimeout(() => {
      if (!apagando && alMorir) alMorir(hijo);
    }, 500);
  });
  hijos.add(hijo);
  return hijo;
}

/** Últimas líneas de un hijo, sangradas; con `filtro`, solo las que lo cumplen. */
const ultimasLineas = (hijo, n = 12, filtro = null) =>
  (filtro ? hijo.ultimas.filter((l) => filtro.test(l)) : hijo.ultimas)
    .slice(-n)
    .map((l) => `     ${l}`)
    .join('\n');

// cloudflared escribe mucho "INF": al fallar, solo interesan sus errores y avisos.
const AVISOS_CLOUDFLARED = /\b(ERR|WRN|FTL)\b|error|failed/i;

// ───────────────────────── pasos ─────────────────────────

function puertoOcupado(puerto) {
  return new Promise((resolve) => {
    const s = net.connect({ port: puerto, host: '127.0.0.1' });
    s.once('connect', () => {
      s.destroy();
      resolve(true);
    });
    s.once('error', () => resolve(false));
    s.setTimeout(1000, () => {
      s.destroy();
      resolve(false);
    });
  });
}

async function arrancarServidor() {
  let listo = false;
  const servidor = lanzar('servidor', process.execPath, [path.join(RAIZ, 'server', 'index.js')], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(PUERTO) },
    alLeer: (linea) => {
      // Lo que el servidor escribe después de arrancar son errores: que se vean.
      if (listo && !linea.includes('La Puja está en marcha')) console.log(`  [servidor] ${linea}`);
    },
    alMorir: (h) => fallar(`El servidor se ha caído. Esto es lo último que dijo:\n${ultimasLineas(h)}`),
  });
  const limite = Date.now() + ESPERA_SERVIDOR;
  while (Date.now() < limite && !servidor.muerto) {
    try {
      if ((await fetch(`http://127.0.0.1:${PUERTO}/`)).ok) {
        listo = true;
        return servidor;
      }
    } catch {}
    await esperar(150);
  }
  throw new Error(`El servidor no arranca. Esto es lo último que dijo:\n${ultimasLineas(servidor)}`);
}

function abrirTunel(cloudflared, detalle) {
  return new Promise((resolve, reject) => {
    let enlace = null;
    let hecho = false;
    const terminar = (error) => {
      if (hecho) return;
      hecho = true;
      clearTimeout(reloj);
      if (error) reject(error);
      else resolve(enlace);
    };
    const tunel = lanzar('cloudflared', cloudflared, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${PUERTO}`], {
      alLeer: (linea) => {
        if (detalle) console.log(`  [cloudflared] ${linea}`);
        if (!enlace) enlace = extraerEnlace(linea);
        // La dirección sale antes de que la conexión esté lista: se espera a "Registered".
        if (enlace && /Registered tunnel connection/i.test(linea)) terminar();
      },
      alMorir: (h) => {
        if (!hecho) return terminar(new Error(`cloudflared se ha cerrado. Esto es lo último que dijo:\n${ultimasLineas(h)}`));
        fallar(
          `El túnel de Cloudflare se ha cerrado y tus amigos ya no pueden entrar.\n${ultimasLineas(h, 8, AVISOS_CLOUDFLARED)}`,
        );
      },
    });
    const reloj = setTimeout(() => {
      terminar(
        new Error(
          `Cloudflare no ha dado una dirección en ${ESPERA_ENLACE / 1000} s. ¿Tienes internet?\n` +
            ultimasLineas(tunel, 8, AVISOS_CLOUDFLARED),
        ),
      );
    }, ESPERA_ENLACE);
  });
}

// Se resuelve con 1.1.1.1 / 8.8.8.8 y no con el DNS de Windows: si Windows pregunta por la
// dirección antes de que exista, se guarda un "no existe" y tu navegador no la abre en un rato.
const resolutor = new dns.Resolver({ timeout: 3000, tries: 1 });
resolutor.setServers(['1.1.1.1', '8.8.8.8']);
function buscarIp(nombre, opciones, cb) {
  resolutor.resolve4(nombre, (err, ips) => {
    if (err) return cb(err);
    if (opciones && opciones.all) return cb(null, ips.map((address) => ({ address, family: 4 })));
    cb(null, ips[0], 4);
  });
}

function estadoPublico(enlace) {
  return new Promise((resolve) => {
    const peticion = https.get(`${enlace}/`, { lookup: buscarIp, timeout: 8000 }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    peticion.on('timeout', () => peticion.destroy());
    peticion.on('error', () => resolve(0));
  });
}

async function esperarPublico(enlace) {
  const limite = Date.now() + ESPERA_PUBLICO;
  while (Date.now() < limite && !apagando) {
    if ((await estadoPublico(enlace)) === 200) return true;
    await esperar(1500);
  }
  return false;
}

/** Windows: pide que el PC no se suspenda mientras viva este proceso (muere con el script). */
function impedirSuspension() {
  if (process.platform !== 'win32') return;
  const script = [
    "$k = Add-Type -Name Despierto -Namespace LaPuja -PassThru -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint esFlags);'",
    // ES_CONTINUOUS | ES_SYSTEM_REQUIRED
    'if ($k::SetThreadExecutionState([uint32]2147483649) -eq 0) { exit 1 }',
    'while ($true) { Start-Sleep -Seconds 3600 }',
  ].join('\n');
  lanzar(
    'powershell',
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    { alMorir: () => console.log('  ⚠️  No he podido impedir que el PC se suspenda: no dejes que se duerma.') },
  );
}

function copiar(texto) {
  const programa = { win32: 'clip', darwin: 'pbcopy' }[process.platform];
  if (!programa) return false;
  try {
    const p = spawn(programa, [], { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
    p.on('error', () => {});
    p.stdin.end(texto);
    return true;
  } catch {
    return false;
  }
}

function abrirNavegador(enlace) {
  const [programa, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', enlace]]
      : [process.platform === 'darwin' ? 'open' : 'xdg-open', [enlace]];
  try {
    const p = spawn(programa, args, { stdio: 'ignore', detached: true, windowsHide: true });
    p.on('error', () => {});
    p.unref();
  } catch {}
}

// ───────────────────────── todo junto ─────────────────────────

async function principal() {
  const args = process.argv.slice(2);
  const sinNavegador = args.includes('--sin-navegador');
  const detalle = args.includes('--detalle');

  console.log(`\n🔨 ${NEGRITA}La Puja online${NORMAL}: encendiendo…\n`);

  const cloudflared = buscarCloudflared();
  if (!cloudflared) {
    return fallar(
      'No encuentro cloudflared, el programa que hace el túnel. Instálalo una vez con:\n\n' +
        '     winget install --id Cloudflare.cloudflared\n\n' +
        '   y vuelve a lanzar esto.',
    );
  }
  if (await puertoOcupado(PUERTO)) {
    return fallar(
      `El puerto ${PUERTO} ya está en uso. ¿Tienes "npm start" u otra ventana de La Puja abierta?\n` +
        '   Ciérrala (Ctrl + C) y vuelve a lanzar esto, o usa otro puerto:\n\n' +
        `     $env:PORT=${PUERTO + 1}; npm run online`,
    );
  }

  try {
    console.log('  1/3  Arrancando el servidor en este PC…');
    await arrancarServidor();
    console.log('  2/3  Abriendo el túnel de Cloudflare…');
    const enlace = await abrirTunel(cloudflared, detalle);
    console.log('  3/3  Comprobando que se ve desde internet…');
    const visible = await esperarPublico(enlace);
    if (apagando) return;

    impedirSuspension();
    const copiado = copiar(enlace);
    if (!sinNavegador) abrirNavegador(enlace);

    console.log(`\n  ✅ ${NEGRITA}La Puja está en internet:${NORMAL}\n`);
    console.log(`       ${ORO}${enlace}${NORMAL}\n`);
    if (!visible) console.log('  ⚠️  Aún no responde desde fuera. Si no carga, espera un minuto y recarga.\n');
    if (copiado) console.log('  📋 Copiado al portapapeles.');
    if (!sinNavegador) console.log('  🌐 Abriéndolo en tu navegador.');
    console.log(
      '\n  Entra tú también por ese enlace (no por localhost), crea la sala y pasa\n' +
        '  el enlace de la sala a tus amigos por Discord o WhatsApp.\n\n' +
        '  No cierres esta ventana ni apagues el PC: si lo haces, se acaba la partida.\n' +
        `  El enlace cambia cada vez que lo enciendes. Para apagarlo: ${NEGRITA}Ctrl + C${NORMAL}.\n`,
    );
  } catch (e) {
    fallar(e.message);
  }
}

if (require.main === module) principal();

module.exports = { extraerEnlace, buscarCloudflared };
