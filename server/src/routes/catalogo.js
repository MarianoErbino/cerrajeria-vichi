import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { obtenerProductos, obtenerServicios } from '../modules/sheets/catalogo.js';
import { obtenerConfiguracion, invalidarCacheConfiguracion } from '../modules/sheets/configuracion.js';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/catalogo/productos
 * Devuelve productos de venta (excluye Uso interno).
 * Query param: buscar (filtra por código, marca o descripción)
 */
router.get('/productos', async (req, res, next) => {
  try {
    const { buscar } = req.query;
    let productos = await obtenerProductos();

    if (buscar) {
      const texto = buscar.toLowerCase();
      productos = productos.filter(p =>
        p.codigo.toLowerCase().includes(texto) ||
        p.descripcion.toLowerCase().includes(texto) ||
        p.marca.toLowerCase().includes(texto) ||
        p.categoria.toLowerCase().includes(texto)
      );
    }

    // No exponer _filaExcel al cliente
    res.json(productos.map(({ _filaExcel, ...p }) => p));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/catalogo/servicios
 * Devuelve todos los servicios disponibles con sus precios calculados.
 */
router.get('/servicios', async (req, res, next) => {
  try {
    const servicios = await obtenerServicios();
    res.json(servicios);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/catalogo/configuracion
 * Devuelve los parámetros de configuración (urgencia %, valor hora, márgenes).
 */
router.get('/configuracion', async (req, res, next) => {
  try {
    const config = await obtenerConfiguracion();
    res.json(config);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/catalogo/configuracion/refrescar
 * Invalida el caché de configuración (por si el cerrajero editó el Sheet).
 */
router.post('/configuracion/refrescar', async (req, res) => {
  invalidarCacheConfiguracion();
  res.json({ mensaje: 'Caché de configuración invalidado' });
});

export default router;
