import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { ejecutarBotConControl, obtenerEstadoBot } from '../modules/bot/scheduler.js';
import { obtenerVentasPendientes } from '../modules/sheets/ventas.js';
import { obtenerLogFacturacion } from '../modules/sheets/catalogo.js';
import { verificarConexionWSFE } from '../modules/arca/wsfe.js';

const router = Router();

/**
 * POST /api/facturacion/trigger?token=<BOT_TRIGGER_TOKEN>
 * Endpoint pensado para cron externos (cron-job.org). Autenticado por shared
 * secret en query param. NO requiere JWT — esta ruta se declara ANTES del
 * `router.use(requireAuth)` para que el middleware no se aplique.
 *
 * Si el token no coincide o no está configurado, devuelve 401.
 */
router.post('/trigger', async (req, res, next) => {
  const tokenEsperado = process.env.BOT_TRIGGER_TOKEN;
  const tokenRecibido = req.query.token || req.headers['x-trigger-token'];

  if (!tokenEsperado) {
    return res.status(503).json({ error: 'BOT_TRIGGER_TOKEN no configurado en el server' });
  }
  if (tokenRecibido !== tokenEsperado) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  try {
    console.log('[API] Trigger del bot vía shared secret');
    const resultado = await ejecutarBotConControl('cron-externo');
    if (resultado?.error) {
      return res.status(409).json({ error: resultado.error });
    }
    res.json({ mensaje: 'Facturación ejecutada', resultado });
  } catch (err) {
    next(err);
  }
});

router.use(requireAuth);

/**
 * GET /api/facturacion/estado
 * Devuelve el estado del bot y las ventas pendientes.
 */
router.get('/estado', async (req, res, next) => {
  try {
    const [estadoBot, ventasPendientes, logReciente] = await Promise.all([
      obtenerEstadoBot(),
      obtenerVentasPendientes(),
      obtenerLogFacturacion(5),
    ]);

    res.json({
      bot: estadoBot,
      ventasPendientes,
      logReciente,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/facturacion/ejecutar
 * Ejecuta el bot de facturación manualmente.
 * Solo para pruebas o emergencias.
 */
router.post('/ejecutar', async (req, res, next) => {
  try {
    console.log('[API] Ejecución manual del bot solicitada');
    const resultado = await ejecutarBotConControl('manual');

    if (resultado?.error) {
      return res.status(409).json({ error: resultado.error });
    }

    res.json({
      mensaje: 'Facturación ejecutada',
      resultado,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/facturacion/log
 * Devuelve el historial de ejecuciones del bot.
 */
router.get('/log', async (req, res, next) => {
  try {
    const { limite = 20 } = req.query;
    const log = await obtenerLogFacturacion(parseInt(limite));
    res.json(log);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/facturacion/health
 * Verifica la conectividad con el WSFE de ARCA.
 */
router.get('/health', async (req, res, next) => {
  try {
    const estado = await verificarConexionWSFE();
    res.json({
      conectado: true,
      ambiente: process.env.ARCA_ENVIRONMENT,
      ...estado,
    });
  } catch (err) {
    res.status(503).json({
      conectado: false,
      ambiente: process.env.ARCA_ENVIRONMENT,
      error: err.message,
    });
  }
});

export default router;
