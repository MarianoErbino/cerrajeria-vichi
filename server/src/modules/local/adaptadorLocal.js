/**
 * Adaptador local — funciona sin Google Sheets.
 *
 * Lee y escribe ventas/clientes/stock directamente sobre el archivo Excel
 * configurado en EXCEL_PATH. El log de facturación se mantiene en JSON
 * (server/data/facturacion_log.json) porque no es parte del dataset original.
 */

import { createRequire } from 'module';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../../data');
const LOG_PATH = join(DATA_DIR, 'facturacion_log.json');

const EXCEL_PATH = process.env.EXCEL_PATH;
if (!EXCEL_PATH) {
  console.warn('[Local] EXCEL_PATH no configurado en .env — el modo local no podrá leer ni escribir');
}

// Nombres reales de las hojas en el dataset (sin emojis).
const HOJA = {
  VENTAS: 'Ventas',
  CLIENTES: 'Clientes',
  PRODUCTOS: 'Productos',
  SERVICIOS: 'Servicios',
  CONFIG: 'Configuración',
  STOCK: 'Stock',
};

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// ─── Helpers Excel ────────────────────────────────────────────────────────────

function abrirWorkbook() {
  if (!EXCEL_PATH || !existsSync(EXCEL_PATH)) {
    console.warn(`[Local] Excel no encontrado en: ${EXCEL_PATH}`);
    return null;
  }
  return XLSX.readFile(EXCEL_PATH);
}

function guardarWorkbook(wb) {
  // Si el archivo está abierto en Excel, Windows lo bloquea (EBUSY/EPERM).
  // Damos un error claro para que el usuario cierre el archivo.
  try {
    XLSX.writeFile(wb, EXCEL_PATH);
  } catch (e) {
    if (e.code === 'EBUSY' || e.code === 'EPERM') {
      throw new Error('El archivo Excel está abierto. Cerralo y volvé a intentar.');
    }
    throw e;
  }
}

/**
 * Lee una hoja como array de objetos usando la fila 1 como encabezados.
 * Devuelve también _filaExcel (número de fila 1-indexed) para futuros updates.
 */
function leerHojaComoObjetos(wb, nombreHoja) {
  const ws = wb.Sheets[nombreHoja];
  if (!ws) return [];
  const filas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (filas.length < 2) return [];
  const headers = filas[0];
  return filas.slice(1)
    .map((fila, i) => {
      const obj = { _filaExcel: i + 2 };
      headers.forEach((h, j) => { obj[h] = fila[j] ?? ''; });
      return obj;
    })
    .filter(obj => Object.entries(obj).some(([k, v]) => k !== '_filaExcel' && v !== ''));
}

/**
 * Agrega una fila a una hoja y guarda el archivo. Acepta la fila como objeto
 * (mapeado contra los encabezados de la hoja) o como array (en orden de columnas).
 */
function agregarFilaHoja(nombreHoja, fila) {
  const wb = abrirWorkbook();
  if (!wb) throw new Error('Excel no disponible');
  const ws = wb.Sheets[nombreHoja];
  if (!ws) throw new Error(`Hoja "${nombreHoja}" no existe en el Excel`);

  const filas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const headers = filas[0] || [];
  const arrayFila = Array.isArray(fila)
    ? fila
    : headers.map(h => fila[h] ?? '');

  // Buscar la última fila que realmente tiene datos (ignorando filas vacías
  // dentro del rango declarado, que es común en planillas precargadas).
  let ultimaConDatos = 0; // 0-indexed; 0 = header
  for (let i = filas.length - 1; i >= 1; i--) {
    if (filas[i].some(c => c !== '' && c != null)) {
      ultimaConDatos = i;
      break;
    }
  }
  const proximaFila = ultimaConDatos + 1; // 0-indexed
  XLSX.utils.sheet_add_aoa(ws, [arrayFila], { origin: { r: proximaFila, c: 0 } });

  guardarWorkbook(wb);
  return proximaFila + 1; // devuelve fila 1-indexed
}

function actualizarFilaHoja(nombreHoja, filaExcel, parche) {
  const wb = abrirWorkbook();
  if (!wb) throw new Error('Excel no disponible');
  const ws = wb.Sheets[nombreHoja];
  if (!ws) throw new Error(`Hoja "${nombreHoja}" no existe en el Excel`);

  const headers = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })[0] || [];
  const valores = headers.map((h, idx) => {
    if (parche[h] !== undefined) return parche[h];
    const ref = XLSX.utils.encode_cell({ r: filaExcel - 1, c: idx });
    return ws[ref]?.v ?? '';
  });
  XLSX.utils.sheet_add_aoa(ws, [valores], { origin: { r: filaExcel - 1, c: 0 } });
  guardarWorkbook(wb);
}

// ─── Helpers JSON ─────────────────────────────────────────────────────────────

function leerJSON(path) {
  if (!existsSync(path)) return [];
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return []; }
}

function guardarJSON(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
}

// ─── Fechas/IDs ───────────────────────────────────────────────────────────────

function fechaArg() {
  return new Date().toLocaleDateString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function horaArg() {
  return new Date().toLocaleTimeString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── PRODUCTOS ────────────────────────────────────────────────────────────────

export function obtenerProductosLocal() {
  const wb = abrirWorkbook();
  if (!wb) return [];
  return leerHojaComoObjetos(wb, HOJA.PRODUCTOS)
    .filter(p => p['Código'] && p['Uso'] !== 'Uso interno')
    .map(p => ({
      _filaExcel: p._filaExcel,
      codigo: String(p['Código'] || ''),
      categoria: String(p['Categoría'] || ''),
      marca: String(p['Marca'] || ''),
      descripcion: String(p['Descripción'] || ''),
      costoSinIVA: parseFloat(p['Costo s/IVA ($)']) || 0,
      costoConIVA: parseFloat(p['Costo c/IVA ($)']) || 0,
      margen: parseFloat(p['Margen % (auto)']) || 0,
      precioVenta: parseFloat(p['Precio venta ($)']) || 0,
      stockInicial: parseInt(p['Stock inicial']) || 0,
      stockActual: parseInt(p['Stock actual']) || 0,
      stockMinimo: parseInt(p['Stock mínimo']) || 0,
      alerta: String(p['Alerta'] || ''),
      uso: String(p['Uso'] || 'Venta'),
    }));
}

// ─── SERVICIOS ────────────────────────────────────────────────────────────────

export function obtenerServiciosLocal() {
  const wb = abrirWorkbook();
  if (!wb) return [];
  return leerHojaComoObjetos(wb, HOJA.SERVICIOS)
    .filter(s => s['ID_Servicio'] && s['Nombre'])
    .map(s => ({
      idServicio: String(s['ID_Servicio'] || ''),
      nombre: String(s['Nombre'] || ''),
      categoria: String(s['Categoria'] || ''),
      tipoCobro: String(s['Tipo_Cobro'] || ''),
      horasEstimadas: s['Horas_Estimadas'] || 0,
      costoMO: parseFloat(s['Costo_MO_Auto']) || 0,
      costoMateriales: parseFloat(s['Costo_Materiales']) || 0,
      precioBase: parseFloat(s['Precio_Base_Auto']) || 0,
      precioUrgencia: parseFloat(s['Precio_Urgencia_Auto']) || 0,
      incluyeProducto: s['Incluye_Producto'] === 'Sí',
      notas: String(s['Notas'] || ''),
    }));
}

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────

export function obtenerConfiguracionLocal() {
  const fallback = { porcentajeUrgencia: 0.30, valorHoraMO: 2500, margenes: {} };
  const wb = abrirWorkbook();
  if (!wb) return fallback;

  const filas = leerHojaComoObjetos(wb, HOJA.CONFIG);
  if (filas.length === 0) return fallback;

  // Estructura: Clave | Valor | Tipo | Nota. Las filas con Tipo="Margen" alimentan el mapa de márgenes.
  const margenes = {};
  let porcentajeUrgencia = fallback.porcentajeUrgencia;
  let valorHoraMO = fallback.valorHoraMO;

  for (const f of filas) {
    const clave = String(f['Clave'] || '').trim();
    const valor = parseFloat(f['Valor']) || 0;
    const tipo = String(f['Tipo'] || '').trim();
    if (!clave) continue;
    if (tipo === 'Margen') margenes[clave.toUpperCase()] = valor;
    else if (/urgencia/i.test(clave)) porcentajeUrgencia = valor;
    else if (/hora|mo/i.test(clave)) valorHoraMO = valor;
  }

  return { porcentajeUrgencia, valorHoraMO, margenes };
}

// ─── VENTAS ───────────────────────────────────────────────────────────────────

function filaAVenta(f) {
  return {
    _fila: f._filaExcel,
    id: String(f['ID'] || ''),
    fecha: String(f['Fecha'] || ''),
    hora: String(f['Hora'] || ''),
    tipoServicio: String(f['Tipo_Servicio'] || ''),
    clienteNombre: String(f['Cliente_Nombre'] || ''),
    clienteTel: String(f['Cliente_Tel'] || ''),
    materiales: String(f['Materiales'] || ''),
    montoCobrado: parseFloat(f['Monto_Cobrado']) || 0,
    modalidadPago: String(f['Modalidad_Pago'] || ''),
    esUrgencia: String(f['Es_Urgencia']) === 'SI',
    notas: String(f['Notas'] || ''),
    facturado: String(f['Facturado'] || 'NO_REQUIERE'),
    nroComprobante: String(f['Nro_Comprobante'] || ''),
    cae: String(f['CAE'] || ''),
    vencimientoCAE: String(f['Vencimiento_CAE'] || ''),
    requiereFactura: String(f['Requiere_Factura']) === 'SI',
    cuitCliente: String(f['CUIT_Cliente'] || ''),
    tipoComprobante: String(f['Tipo_Comprobante'] || ''),
    condicionIVA: String(f['Condicion_IVA'] || ''),
  };
}

export function obtenerVentasLocal() {
  const wb = abrirWorkbook();
  if (!wb) return [];
  return leerHojaComoObjetos(wb, HOJA.VENTAS)
    .filter(f => f['ID'])
    .map(filaAVenta);
}

export function registrarVentaLocal(datos) {
  const id = `V${Date.now()}`;
  const fecha = datos.fecha || fechaArg();
  const hora = datos.hora || horaArg();
  const estadoFacturado = datos.requiereFactura ? 'PENDIENTE' : 'NO_REQUIERE';
  const materialesStr = Array.isArray(datos.materiales)
    ? JSON.stringify(datos.materiales)
    : (datos.materiales || '');

  const filaPorHeader = {
    'ID': id,
    'Fecha': fecha,
    'Hora': hora,
    'Tipo_Servicio': datos.tipoServicio || '',
    'Cliente_Nombre': datos.clienteNombre || '',
    'Cliente_Tel': datos.clienteTel || '',
    'Materiales': materialesStr,
    'Monto_Cobrado': parseFloat(datos.montoCobrado) || 0,
    'Modalidad_Pago': datos.modalidadPago || 'Efectivo',
    'Es_Urgencia': datos.esUrgencia ? 'SI' : 'NO',
    'Notas': datos.notas || '',
    'Facturado': estadoFacturado,
    'Nro_Comprobante': '',
    'CAE': '',
    'Vencimiento_CAE': '',
    'Requiere_Factura': datos.requiereFactura ? 'SI' : 'NO',
    'CUIT_Cliente': datos.cuitCliente || '',
    'Tipo_Comprobante': datos.tipoComprobante || '',
    'Condicion_IVA': datos.condicionIVA || '',
  };

  agregarFilaHoja(HOJA.VENTAS, filaPorHeader);

  // Upsert del cliente en su propia hoja (errores no rompen el registro de la venta).
  try {
    upsertClienteLocal({
      nombre: datos.clienteNombre,
      telefono: datos.clienteTel,
      direccion: datos.direccionCliente || '',
    });
  } catch (e) {
    console.warn('[Local] upsert cliente falló:', e.message);
  }

  // Stock: por ahora solo log. La integración con la hoja Stock queda pendiente.
  if (Array.isArray(datos.materiales) && datos.materiales.length > 0) {
    datos.materiales.forEach(m => {
      console.log(`[Local Stock] ${m.codigo} - ${m.descripcion}: -${m.cantidad || 1}`);
    });
  }

  return { id, fecha, hora, estadoFacturado };
}

export function actualizarEstadoFacturacionLocal(ventaId, datosFactura) {
  const wb = abrirWorkbook();
  if (!wb) throw new Error('Excel no disponible');
  const ventas = leerHojaComoObjetos(wb, HOJA.VENTAS);
  const venta = ventas.find(v => String(v['ID']) === String(ventaId));
  if (!venta) throw new Error(`Venta ${ventaId} no encontrada`);

  actualizarFilaHoja(HOJA.VENTAS, venta._filaExcel, {
    'Facturado': datosFactura.estado,
    'Nro_Comprobante': datosFactura.nroComprobante || '',
    'CAE': datosFactura.cae || '',
    'Vencimiento_CAE': datosFactura.vencimientoCAE || '',
  });
}

// ─── CLIENTES ─────────────────────────────────────────────────────────────────

function filaACliente(f) {
  return {
    _filaExcel: f._filaExcel,
    id: String(f['ID'] || ''),
    nombre: String(f['Nombre'] || ''),
    telefono: String(f['Telefono'] || ''),
    direccion: String(f['Direccion'] || ''),
    ultimaVisita: String(f['Ultima_Visita'] || ''),
    totalTrabajos: parseInt(f['Total_Trabajos']) || 0,
  };
}

export function obtenerClientesLocal() {
  const wb = abrirWorkbook();
  if (!wb) return [];
  return leerHojaComoObjetos(wb, HOJA.CLIENTES)
    .filter(f => f['Nombre'])
    .map(filaACliente);
}

export function upsertClienteLocal({ nombre, telefono, direccion }) {
  if (!nombre) return;
  const fecha = fechaArg();
  const clientes = obtenerClientesLocal();
  const existente = telefono
    ? clientes.find(c => c.telefono === String(telefono))
    : null;

  if (existente) {
    actualizarFilaHoja(HOJA.CLIENTES, existente._filaExcel, {
      'Ultima_Visita': fecha,
      'Total_Trabajos': (existente.totalTrabajos || 0) + 1,
      'Direccion': existente.direccion || direccion || '',
    });
  } else {
    agregarFilaHoja(HOJA.CLIENTES, {
      'ID': `C${Date.now()}`,
      'Nombre': nombre,
      'Telefono': telefono || '',
      'Direccion': direccion || '',
      'Ultima_Visita': fecha,
      'Total_Trabajos': 1,
    });
  }
}

// ─── LOG FACTURACIÓN ──────────────────────────────────────────────────────────
// Se mantiene en JSON: no es parte del dataset original y rota frecuentemente.

export function obtenerLogLocal(limite = 20) {
  const log = leerJSON(LOG_PATH);
  return log.reverse().slice(0, limite);
}

export function agregarLogLocal(entrada) {
  const log = leerJSON(LOG_PATH);
  log.push(entrada);
  guardarJSON(LOG_PATH, log);
}
