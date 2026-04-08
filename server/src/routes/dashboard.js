import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { obtenerVentasHoy, obtenerUltimasVentas } from '../modules/sheets/ventas.js';
import { obtenerEstadoBot } from '../modules/bot/scheduler.js';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/dashboard
 * Devuelve todos los datos necesarios para el dashboard en una sola llamada.
 */
router.get('/', async (req, res, next) => {
  try {
    const [ventasHoy, ultimasVentas, estadoBot] = await Promise.all([
      obtenerVentasHoy(),
      obtenerUltimasVentas(5),
      obtenerEstadoBot(),
    ]);

    // Calcular métricas del día
    const totalHoy = ventasHoy.reduce((sum, v) => sum + v.montoCobrado, 0);
    const cantidadTrabajos = ventasHoy.length;
    const montoPendienteFacturar = ventasHoy
      .filter(v => v.facturado === 'PENDIENTE')
      .reduce((sum, v) => sum + v.montoCobrado, 0);

    // Desglose por modalidad de pago (solo hoy)
    const desglosePago = ventasHoy.reduce((acc, v) => {
      acc[v.modalidadPago] = (acc[v.modalidadPago] || 0) + v.montoCobrado;
      return acc;
    }, {});

    res.json({
      totalHoy,
      cantidadTrabajos,
      montoPendienteFacturar,
      desglosePago,
      ultimasVentas,
      bot: estadoBot,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
