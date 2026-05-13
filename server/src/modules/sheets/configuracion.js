import { leerRango } from './client.js';
import { obtenerConfiguracionLocal } from '../local/adaptadorLocal.js';

const MODO_LOCAL = !process.env.SPREADSHEET_ID;

let configCache = null;
let cacheTimestamp = null;
const CACHE_TTL = 10 * 60 * 1000;

export async function obtenerConfiguracion() {
  const ahora = Date.now();
  if (configCache && cacheTimestamp && (ahora - cacheTimestamp) < CACHE_TTL) {
    return configCache;
  }

  if (MODO_LOCAL) {
    configCache = obtenerConfiguracionLocal();
    cacheTimestamp = ahora;
    return configCache;
  }

  // Hoja "Configuración" — estructura Clave|Valor|Tipo|Nota (header en fila 1).
  // Las filas con Tipo="Margen" alimentan el mapa de márgenes; el resto se busca
  // por nombre de clave (urgencia, valor hora MO).
  const filas = await leerRango('Configuración!A2:D');
  const margenes = {};
  let porcentajeUrgencia = 0.30;
  let valorHoraMO = 2500;

  for (const fila of filas || []) {
    const clave = String(fila[0] || '').trim();
    const valor = parseFloat(fila[1]) || 0;
    const tipo = String(fila[2] || '').trim();
    if (!clave) continue;
    if (tipo === 'Margen') margenes[clave.toUpperCase()] = valor;
    else if (/urgencia/i.test(clave)) porcentajeUrgencia = valor;
    else if (/hora|mo/i.test(clave)) valorHoraMO = valor;
  }

  configCache = { porcentajeUrgencia, valorHoraMO, margenes };
  cacheTimestamp = ahora;
  return configCache;
}

export function invalidarCacheConfiguracion() {
  configCache = null;
  cacheTimestamp = null;
}
