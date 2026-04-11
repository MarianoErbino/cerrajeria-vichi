import { leerRango } from './client.js';
import {
  obtenerProductosLocal,
  obtenerServiciosLocal,
  obtenerConfiguracionLocal,
  obtenerLogLocal,
} from '../local/adaptadorLocal.js';

// Modo local: se activa cuando no hay Spreadsheet configurado
const MODO_LOCAL = !process.env.SPREADSHEET_ID;

if (MODO_LOCAL) {
  console.log('[Catálogo] Modo local activado — leyendo desde Excel local');
}

// ─── PRODUCTOS ────────────────────────────────────────────────────────────────

/**
 * Obtiene el catálogo de productos.
 * Columnas reales en "📦 Productos" (datos desde fila 6):
 * A:Código B:Categoría C:Marca D:Descripción E:Costo s/IVA F:Costo c/IVA
 * G:Margen H:Precio venta I:Stock inicial J:Stock actual K:Stock mínimo
 * L:Alerta M:Uso
 * Solo devuelve productos con Uso = "Venta".
 */
export async function obtenerProductos() {
  if (MODO_LOCAL) return obtenerProductosLocal();

  const datos = await leerRango('📦 Productos!A6:M');
  if (!datos || datos.length === 0) return [];

  return datos
    .filter(f => f[0] && f[12] !== 'Uso interno')
    .map((f, i) => ({
      _filaExcel: 6 + i,
      codigo: String(f[0] || ''),
      categoria: String(f[1] || ''),
      marca: String(f[2] || ''),
      descripcion: String(f[3] || ''),
      costoSinIVA: parseFloat(f[4]) || 0,
      costoConIVA: parseFloat(f[5]) || 0,
      margen: parseFloat(f[6]) || 0,
      precioVenta: parseFloat(f[7]) || 0,
      stockInicial: parseInt(f[8]) || 0,
      stockActual: parseInt(f[9]) || 0,
      stockMinimo: parseInt(f[10]) || 0,
      alerta: String(f[11] || ''),
      uso: String(f[12] || 'Venta'),
    }));
}

/**
 * Busca un producto por código (para actualizar stock).
 */
export async function buscarProductoPorCodigo(codigo) {
  const productos = await obtenerProductos();
  return productos.find(p => p.codigo === codigo) || null;
}

// ─── SERVICIOS ────────────────────────────────────────────────────────────────

/**
 * Obtiene los servicios desde "🔧 Servicios1" (datos desde fila 6, col A vacía).
 * B:ID C:Nombre D:Categoría E:TipoCobro F:Horas G:CostoMO H:CostoMat
 * I:PrecioBase J:PrecioUrgencia K:IncluyeProducto L:Notas
 */
export async function obtenerServicios() {
  if (MODO_LOCAL) return obtenerServiciosLocal();

  const datos = await leerRango('🔧 Servicios1!A6:L');
  if (!datos || datos.length === 0) return [];

  return datos
    .filter(f => f[1] && f[2]) // ID + nombre requeridos (excluye filas de instrucciones)
    .map(f => ({
      idServicio: String(f[1] || ''),
      nombre: String(f[2] || ''),
      categoria: String(f[3] || ''),
      tipoCobro: String(f[4] || ''),
      horasEstimadas: f[5] || 0,
      costoMO: parseFloat(f[6]) || 0,
      costoMateriales: parseFloat(f[7]) || 0,
      precioBase: parseFloat(f[8]) || 0,
      precioUrgencia: parseFloat(f[9]) || 0,
      incluyeProducto: f[10] === 'Sí',
      notas: String(f[11] || ''),
    }));
}

// ─── LOG FACTURACIÓN ──────────────────────────────────────────────────────────

export async function obtenerLogFacturacion(limite = 20) {
  if (MODO_LOCAL) return obtenerLogLocal(limite);

  const datos = await leerRango('📋 Facturacion_Log!A2:F');
  if (!datos || datos.length === 0) return [];

  return datos
    .filter(f => f[0])
    .map(f => ({
      fechaEjecucion: f[0] || '',
      ventasProcesadas: parseInt(f[1]) || 0,
      exitosas: parseInt(f[2]) || 0,
      fallidas: parseInt(f[3]) || 0,
      detalleErrores: f[4] || '',
      caesEmitidos: f[5] || '',
    }))
    .reverse()
    .slice(0, limite);
}
