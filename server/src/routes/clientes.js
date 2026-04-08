import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { obtenerClientes, buscarClientesPorNombre } from '../modules/sheets/clientes.js';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/clientes
 * Devuelve todos los clientes o filtra por nombre/teléfono.
 * Query param: buscar
 */
router.get('/', async (req, res, next) => {
  try {
    const { buscar } = req.query;

    if (buscar && buscar.length >= 2) {
      const clientes = await buscarClientesPorNombre(buscar);
      return res.json(clientes);
    }

    const clientes = await obtenerClientes();
    res.json(clientes);
  } catch (err) {
    next(err);
  }
});

export default router;
