import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { registrarVenta, obtenerVentas, obtenerUltimasVentas } from '../modules/sheets/ventas.js';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/ventas
 * Devuelve todas las ventas con filtros opcionales.
 * Query params: fecha, tipoServicio, facturado, pagina, limite
 */
router.get('/', async (req, res, next) => {
  try {
    const { fecha, tipoServicio, facturado, pagina = 1, limite = 20 } = req.query;

    let ventas = await obtenerVentas();

    // Filtros opcionales
    if (fecha) ventas = ventas.filter(v => v.fecha === fecha);
    if (tipoServicio) ventas = ventas.filter(v => v.tipoServicio === tipoServicio);
    if (facturado) ventas = ventas.filter(v => v.facturado === facturado);

    // Ordenar por fecha/hora descendente
    ventas.sort((a, b) => {
      const fechaA = `${a.fecha} ${a.hora}`;
      const fechaB = `${b.fecha} ${b.hora}`;
      return fechaB.localeCompare(fechaA);
    });

    // Paginación
    const total = ventas.length;
    const inicio = (parseInt(pagina) - 1) * parseInt(limite);
    const fin = inicio + parseInt(limite);
    const ventasPaginadas = ventas.slice(inicio, fin);

    res.json({
      ventas: ventasPaginadas,
      total,
      pagina: parseInt(pagina),
      totalPaginas: Math.ceil(total / parseInt(limite)),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/ventas/ultimas
 * Devuelve las últimas N ventas (para el dashboard).
 */
router.get('/ultimas', async (req, res, next) => {
  try {
    const { cantidad = 5 } = req.query;
    const ventas = await obtenerUltimasVentas(parseInt(cantidad));
    res.json(ventas);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ventas
 * Registra una nueva venta.
 */
router.post('/', async (req, res, next) => {
  try {
    const datos = req.body;

    // Validaciones básicas
    if (!datos.tipoServicio) {
      return res.status(400).json({ error: 'El tipo de servicio es requerido' });
    }
    if (!datos.montoCobrado || isNaN(parseFloat(datos.montoCobrado))) {
      return res.status(400).json({ error: 'El monto cobrado es requerido y debe ser numérico' });
    }
    if (!datos.modalidadPago) {
      return res.status(400).json({ error: 'La modalidad de pago es requerida' });
    }

    const resultado = await registrarVenta(datos);

    res.status(201).json({
      mensaje: 'Venta registrada correctamente',
      ...resultado,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
