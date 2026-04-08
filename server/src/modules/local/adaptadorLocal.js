/**
 * Adaptador local — funciona sin Google Sheets.
 *
 * Lee productos y servicios directamente del archivo Excel.
 * Guarda ventas y clientes en archivos JSON locales (server/data/).
 *
 * Se activa automáticamente cuando SPREADSHEET_ID no está configurado en .env
 */

import { createRequire } from 'module';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../../data');
const VENTAS_PATH = join(DATA_DIR, 'ventas.json');
const CLIENTES_PATH = join(DATA_DIR, 'clientes.json');
const LOG_PATH = join(DATA_DIR, 'facturacion_log.json');

// Ruta al Excel — configurable con EXCEL_PATH en .env
const EXCEL_PATH = process.env.EXCEL_PATH ||
  'C:/Users/Mariano/Desktop/Dataset_Cerrajeria.xlsx';

// Asegurar que la carpeta data existe
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// ─── Helpers JSON ─────────────────────────────────────────────────────────────

function leerJSON(path) {
  if (!existsSync(path)) return [];
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return []; }
}

function guardarJSON(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
}

// ─── Leer del Excel ───────────────────────────────────────────────────────────

function leerExcel() {
  if (!existsSync(EXCEL_PATH)) {
    console.warn(`[Local] Excel no encontrado en: ${EXCEL_PATH}`);
    return null;
  }
  return XLSX.readFile(EXCEL_PATH);
}

// ─── PRODUCTOS ────────────────────────────────────────────────────────────────

export function obtenerProductosLocal() {
  const wb = leerExcel();
  if (!wb) return [];

  const ws = wb.Sheets['📦 Productos'];
  if (!ws) return [];

  // Datos desde fila 6 (índices 0-base desde A6)
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, range: 5 }); // range:5 = desde fila 6

  return data
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

// ─── SERVICIOS ────────────────────────────────────────────────────────────────

export function obtenerServiciosLocal() {
  const wb = leerExcel();
  if (!wb) return [];

  const ws = wb.Sheets['🔧 Servicios1'];
  if (!ws) return [];

  // Datos desde fila 6, columna A vacía
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, range: 5 });

  return data
    .filter(f => f[1]) // columna B = ID servicio
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

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────

export function obtenerConfiguracionLocal() {
  const wb = leerExcel();
  if (!wb) return { porcentajeUrgencia: 0.30, valorHoraMO: 2500, margenes: {} };

  const ws = wb.Sheets['⚙ Configuración'];
  if (!ws) return { porcentajeUrgencia: 0.30, valorHoraMO: 2500, margenes: {} };

  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // Fila 16 (índice 16) = urgencia, fila 17 (índice 17) = valor hora
  const porcentajeUrgencia = parseFloat(data[16]?.[2]) || 0.30;
  const valorHoraMO = parseFloat(data[17]?.[2]) || 2500;

  // Márgenes (filas 4-10, columnas B y C)
  const margenes = {};
  for (let i = 4; i <= 10; i++) {
    if (data[i]?.[1]) {
      margenes[String(data[i][1]).toUpperCase()] = parseFloat(data[i][2]) || 0;
    }
  }

  return { porcentajeUrgencia, valorHoraMO, margenes };
}

// ─── VENTAS ───────────────────────────────────────────────────────────────────

export function obtenerVentasLocal() {
  return leerJSON(VENTAS_PATH);
}

export function registrarVentaLocal(datos) {
  const ventas = leerJSON(VENTAS_PATH);

  const ahora = new Date();
  const fecha = ahora.toLocaleDateString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
  const hora = ahora.toLocaleTimeString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit', minute: '2-digit',
  });

  const id = `V${Date.now()}`;
  const estadoFacturado = datos.requiereFactura ? 'PENDIENTE' : 'NO_REQUIERE';

  const venta = {
    _fila: ventas.length + 2, // simula número de fila en Sheets
    id,
    fecha: datos.fecha || fecha,
    hora: datos.hora || hora,
    tipoServicio: datos.tipoServicio || '',
    clienteNombre: datos.clienteNombre || '',
    clienteTel: datos.clienteTel || '',
    materiales: Array.isArray(datos.materiales)
      ? JSON.stringify(datos.materiales)
      : (datos.materiales || ''),
    montoCobrado: parseFloat(datos.montoCobrado) || 0,
    modalidadPago: datos.modalidadPago || 'Efectivo',
    esUrgencia: !!datos.esUrgencia,
    notas: datos.notas || '',
    facturado: estadoFacturado,
    nroComprobante: '',
    cae: '',
    vencimientoCAE: '',
    requiereFactura: !!datos.requiereFactura,
    cuitCliente: datos.cuitCliente || '',
    tipoComprobante: datos.tipoComprobante || '',
    condicionIVA: datos.condicionIVA || '',
  };

  ventas.push(venta);
  guardarJSON(VENTAS_PATH, ventas);

  // Actualizar cliente
  upsertClienteLocal({
    nombre: datos.clienteNombre,
    telefono: datos.clienteTel,
    direccion: datos.direccionCliente || '',
  });

  // Descontar stock (solo log en consola en modo local)
  if (Array.isArray(datos.materiales) && datos.materiales.length > 0) {
    datos.materiales.forEach(m => {
      console.log(`[Local Stock] ${m.codigo} - ${m.descripcion}: -${m.cantidad || 1}`);
    });
  }

  return { id, fecha: venta.fecha, hora: venta.hora, estadoFacturado };
}

export function actualizarEstadoFacturacionLocal(ventaId, datosFactura) {
  const ventas = leerJSON(VENTAS_PATH);
  const idx = ventas.findIndex(v => v.id === ventaId);
  if (idx === -1) throw new Error(`Venta ${ventaId} no encontrada`);

  ventas[idx] = {
    ...ventas[idx],
    facturado: datosFactura.estado,
    nroComprobante: datosFactura.nroComprobante || '',
    cae: datosFactura.cae || '',
    vencimientoCAE: datosFactura.vencimientoCAE || '',
  };

  guardarJSON(VENTAS_PATH, ventas);
}

// ─── CLIENTES ─────────────────────────────────────────────────────────────────

export function obtenerClientesLocal() {
  return leerJSON(CLIENTES_PATH);
}

export function upsertClienteLocal({ nombre, telefono, direccion }) {
  if (!nombre) return;

  const clientes = leerJSON(CLIENTES_PATH);
  const fecha = new Date().toLocaleDateString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  const idx = telefono
    ? clientes.findIndex(c => c.telefono === String(telefono))
    : -1;

  if (idx !== -1) {
    clientes[idx].ultimaVisita = fecha;
    clientes[idx].totalTrabajos = (clientes[idx].totalTrabajos || 0) + 1;
    if (direccion && !clientes[idx].direccion) clientes[idx].direccion = direccion;
  } else {
    clientes.push({
      id: `C${Date.now()}`,
      nombre,
      telefono: telefono || '',
      direccion: direccion || '',
      ultimaVisita: fecha,
      totalTrabajos: 1,
    });
  }

  guardarJSON(CLIENTES_PATH, clientes);
}

// ─── LOG FACTURACIÓN ──────────────────────────────────────────────────────────

export function obtenerLogLocal(limite = 20) {
  const log = leerJSON(LOG_PATH);
  return log.reverse().slice(0, limite);
}

export function agregarLogLocal(entrada) {
  const log = leerJSON(LOG_PATH);
  log.push(entrada);
  guardarJSON(LOG_PATH, log);
}
