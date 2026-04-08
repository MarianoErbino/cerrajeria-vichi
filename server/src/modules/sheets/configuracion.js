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

  const datos = await leerRango('⚙ Configuración!B17:C18');
  const porcentajeUrgencia = parseFloat(datos?.[0]?.[1]) || 0.30;
  const valorHoraMO = parseFloat(datos?.[1]?.[1]) || 2500;

  const datosMargenes = await leerRango('⚙ Configuración!B5:C11');
  const margenes = {};
  for (const fila of datosMargenes) {
    if (fila[0] && fila[1] !== undefined) {
      margenes[String(fila[0]).toUpperCase()] = parseFloat(fila[1]) || 0;
    }
  }

  configCache = { porcentajeUrgencia, valorHoraMO, margenes };
  cacheTimestamp = ahora;
  return configCache;
}

export function invalidarCacheConfiguracion() {
  configCache = null;
  cacheTimestamp = null;
}
