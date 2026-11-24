'use strict';

const fs = require('fs');
const path = require('path');

const TIPOS = ['pregunta', 'respuesta', 'inicio', 'fin'];

const FICHEROS = {
  pregunta: 'preguntas.json',
  respuesta: 'respuestas.json',
  inicio: 'inicios.json',
  fin: 'finales.json',
};

const DIR_CARTAS = path.join(__dirname, '..', 'cartas');

/** Lee los cuatro mazos de la carpeta /cartas. */
function cargarCartas(dir = DIR_CARTAS) {
  const cartas = {};
  for (const tipo of TIPOS) {
    const fichero = path.join(dir, FICHEROS[tipo]);
    const lista = JSON.parse(fs.readFileSync(fichero, 'utf8'));
    if (!Array.isArray(lista) || lista.some((c) => typeof c !== 'string' || !c.trim())) {
      throw new Error(`${fichero} debe ser una lista de textos`);
    }
    cartas[tipo] = lista.map((c) => c.trim());
  }
  return cartas;
}

function barajar(lista, aleatorio = Math.random) {
  const copia = lista.slice();
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

const RE_NOMBRE = /\{nombre\}/g;
const RE_NOMBRE2 = /\{nombre2\}/g;

function nombresNecesarios(plantilla) {
  if (plantilla.includes('{nombre2}')) return 2;
  if (plantilla.includes('{nombre}')) return 1;
  return 0;
}

/**
 * Mazo de una partida: mezcla los tipos elegidos, quita las cartas con
 * nombres si no se usan, y rellena {nombre}/{nombre2} al sacar cada carta.
 */
class Mazo {
  constructor(cartas, { tipos, nombres = [] }, aleatorio = Math.random) {
    this.aleatorio = aleatorio;
    this.nombres = nombres.slice();
    this.base = [];
    for (const tipo of tipos) {
      for (const plantilla of cartas[tipo] || []) {
        if (nombresNecesarios(plantilla) > this.nombres.length) continue;
        this.base.push({ tipo, plantilla });
      }
    }
    if (!this.base.length) throw new Error('No hay cartas para esta combinación de tipos');
    this.pila = barajar(this.base, aleatorio);
  }

  sacar() {
    if (!this.pila.length) this.pila = barajar(this.base, this.aleatorio);
    const { tipo, plantilla } = this.pila.pop();
    return { tipo, texto: this.rellenar(plantilla) };
  }

  rellenar(plantilla) {
    if (!this.nombres.length) return plantilla;
    const nombres = barajar(this.nombres, this.aleatorio);
    return plantilla.replace(RE_NOMBRE2, nombres[1] || nombres[0]).replace(RE_NOMBRE, nombres[0]);
  }
}

module.exports = { TIPOS, cargarCartas, barajar, Mazo, nombresNecesarios };
