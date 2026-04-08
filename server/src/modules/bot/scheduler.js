import cron from 'node-cron';
import { ejecutarFacturacion } from './facturador.js';

let ultimaEjecucion = null;
let estadoUltimaEjecucion = null;
let botEnEjecucion = false;

/**
 * Inicia el bot de facturación con node-cron.
 * Corre todos los días a las 22:00hs (hora Argentina, UTC-3).
 */
export function iniciarBotFacturacion() {
  // Cron expression: "0 22 * * *" = todos los días a las 22:00
  // node-cron usa la zona horaria del sistema por defecto,
  // pero pasamos timezone explícito para asegurar hora argentina
  const expresionCron = '0 22 * * *';
  const timezone = process.env.BOT_TIMEZONE || 'America/Argentina/Buenos_Aires';

  cron.schedule(expresionCron, async () => {
    await ejecutarBotConControl('automatica');
  }, {
    scheduled: true,
    timezone,
  });

  console.log(`⏰ Bot de facturación programado para las 22:00hs (${timezone})`);
}

/**
 * Envuelve la ejecución del bot con control de estado (evita ejecuciones simultáneas).
 * @param {string} modo - 'automatica' o 'manual'
 */
export async function ejecutarBotConControl(modo = 'manual') {
  if (botEnEjecucion) {
    console.log('[Bot] Ya hay una ejecución en curso. Ignorando nueva solicitud.');
    return { error: 'El bot ya está ejecutándose. Esperá que termine.' };
  }

  botEnEjecucion = true;
  ultimaEjecucion = {
    inicio: new Date().toISOString(),
    modo,
    estado: 'en_progreso',
  };

  try {
    const resultado = await ejecutarFacturacion();
    estadoUltimaEjecucion = {
      ...ultimaEjecucion,
      fin: new Date().toISOString(),
      estado: 'completado',
      resultado,
    };
    return resultado;
  } catch (err) {
    estadoUltimaEjecucion = {
      ...ultimaEjecucion,
      fin: new Date().toISOString(),
      estado: 'error',
      error: err.message,
    };
    throw err;
  } finally {
    botEnEjecucion = false;
  }
}

/**
 * Devuelve el estado actual del bot.
 */
export function obtenerEstadoBot() {
  // Calcular próxima ejecución (hoy o mañana a las 22:00)
  const ahora = new Date();
  const hoy22 = new Date(ahora);
  hoy22.setHours(22, 0, 0, 0);

  const proxima = ahora < hoy22
    ? hoy22.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) + ' hoy'
    : '22:00 mañana';

  return {
    enEjecucion: botEnEjecucion,
    ultimaEjecucion: estadoUltimaEjecucion,
    proximaEjecucion: `${proxima} (hora Argentina)`,
  };
}
