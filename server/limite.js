'use strict';

/**
 * Límite de acciones por jugador: como mucho `max` acciones en `ventanaMs`.
 * Frena macros de puja y clientes trucados que mandan cosas a lo bestia.
 */
function crearLimitador(max = 5, ventanaMs = 1000, ahora = Date.now) {
  const marcas = [];
  return {
    permitir() {
      const t = ahora();
      while (marcas.length && t - marcas[0] >= ventanaMs) marcas.shift();
      if (marcas.length >= max) return false;
      marcas.push(t);
      return true;
    },
  };
}

module.exports = { crearLimitador };
