import { leerRango, agregarFila, actualizarRango } from './client.js';
import { upsertCliente } from './clientes.js';
import { buscarProductoPorCodigo } from './catalogo.js';
import {
  obtenerVentasLocal,
  registrarVentaLocal,
  actualizarEstadoFacturacionLocal,
} from '../local/adaptadorLocal.js';

const MODO_LOCAL = !process.env.SPREADSHEET_ID;
const HOJA = 'Ventas';
const HOJA_STOCK = 'Stock';
const HOJA_PRODUCTOS = 'Productos';

const COL = {
  ID: 0, FECHA: 1, HORA: 2, TIPO_SERVICIO: 3, CLIENTE_NOMBRE: 4,
  CLIENTE_TEL: 5, MATERIALES: 6, MONTO_COBRADO: 7, MODALIDAD_PAGO: 8,
  ES_URGENCIA: 9, NOTAS: 10, FACTURADO: 11, NRO_COMPROBANTE: 12,
  CAE: 13, VENCIMIENTO_CAE: 14, REQUIERE_FACTURA: 15,
  CUIT_CLIENTE: 16, TIPO_COMPROBANTE: 17, CONDICION_IVA: 18,
};

function filaAVenta(fila, numeroFila) {
  return {
    _fila: numeroFila,
    id: fila[COL.ID] || '',
    fecha: fila[COL.FECHA] || '',
    hora: fila[COL.HORA] || '',
    tipoServicio: fila[COL.TIPO_SERVICIO] || '',
    clienteNombre: fila[COL.CLIENTE_NOMBRE] || '',
    clienteTel: fila[COL.CLIENTE_TEL] || '',
    materiales: fila[COL.MATERIALES] || '',
    montoCobrado: parseFloat(fila[COL.MONTO_COBRADO]) || 0,
    modalidadPago: fila[COL.MODALIDAD_PAGO] || '',
    esUrgencia: fila[COL.ES_URGENCIA] === 'SI',
    notas: fila[COL.NOTAS] || '',
    facturado: fila[COL.FACTURADO] || 'NO_REQUIERE',
    nroComprobante: fila[COL.NRO_COMPROBANTE] || '',
    cae: fila[COL.CAE] || '',
    vencimientoCAE: fila[COL.VENCIMIENTO_CAE] || '',
    requiereFactura: fila[COL.REQUIERE_FACTURA] === 'SI',
    cuitCliente: fila[COL.CUIT_CLIENTE] || '',
    tipoComprobante: fila[COL.TIPO_COMPROBANTE] || '',
    condicionIVA: fila[COL.CONDICION_IVA] || '',
  };
}

// ─── LECTURA ──────────────────────────────────────────────────────────────────

export async function obtenerVentas() {
  if (MODO_LOCAL) return obtenerVentasLocal();

  const datos = await leerRango(`${HOJA}!A2:S`);
  if (!datos || datos.length === 0) return [];
  return datos
    .filter(f => f[COL.ID])
    .map((f, i) => filaAVenta(f, i + 2));
}

export async function obtenerVentasHoy() {
  const hoy = new Date().toLocaleDateString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
  const ventas = await obtenerVentas();
  return ventas.filter(v => v.fecha === hoy);
}

export async function obtenerVentasPendientes() {
  const ventas = await obtenerVentas();
  return ventas.filter(v => v.facturado === 'PENDIENTE');
}

export async function obtenerUltimasVentas(cantidad = 5) {
  const ventas = await obtenerVentas();
  return ventas.slice(-cantidad).reverse();
}

// ─── ESCRITURA ────────────────────────────────────────────────────────────────

export async function registrarVenta(datos) {
  if (MODO_LOCAL) return registrarVentaLocal(datos);

  const ahora = new Date();
  const opciones = { timeZone: 'America/Argentina/Buenos_Aires' };
  const fecha = ahora.toLocaleDateString('es-AR', { ...opciones, day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora = ahora.toLocaleTimeString('es-AR', { ...opciones, hour: '2-digit', minute: '2-digit' });

  const id = `V${Date.now()}`;
  const estadoFacturado = datos.requiereFactura ? 'PENDIENTE' : 'NO_REQUIERE';
  const materialesStr = Array.isArray(datos.materiales)
    ? JSON.stringify(datos.materiales) : (datos.materiales || '');

  const fila = [
    id, datos.fecha || fecha, datos.hora || hora, datos.tipoServicio || '',
    datos.clienteNombre || '', datos.clienteTel || '', materialesStr,
    datos.montoCobrado || 0, datos.modalidadPago || 'Efectivo',
    datos.esUrgencia ? 'SI' : 'NO', datos.notas || '', estadoFacturado,
    '', '', '', datos.requiereFactura ? 'SI' : 'NO',
    datos.cuitCliente || '', datos.tipoComprobante || '', datos.condicionIVA || '',
  ];

  await agregarFila(HOJA, fila);

  const promesas = [];
  if (datos.clienteNombre) {
    promesas.push(upsertCliente({ nombre: datos.clienteNombre, telefono: datos.clienteTel, direccion: datos.direccionCliente || '' }));
  }
  if (Array.isArray(datos.materiales) && datos.materiales.length > 0) {
    for (const material of datos.materiales) {
      promesas.push(descontarStock(material, id, datos.fecha || fecha));
    }
  }

  const resultados = await Promise.allSettled(promesas);
  resultados.forEach((r, i) => {
    if (r.status === 'rejected') console.warn(`[Ventas] Promesa ${i}:`, r.reason?.message);
  });

  return { id, fecha, hora, estadoFacturado };
}

async function descontarStock(material, idVenta, fecha) {
  if (!material.codigo) return;
  const producto = await buscarProductoPorCodigo(material.codigo);
  if (!producto) return;

  const cantidadUsada = parseInt(material.cantidad) || 1;
  const stockNuevo = Math.max(0, producto.stockActual - cantidadUsada);
  await actualizarRango(`${HOJA_PRODUCTOS}!J${producto._filaExcel}`, [[stockNuevo]]);

  const hora = new Date().toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit' });
  await agregarFila(HOJA_STOCK, [`${fecha} ${hora}`, material.codigo, material.descripcion || producto.descripcion, 'SALIDA_VENTA', cantidadUsada, producto.stockActual, stockNuevo, idVenta, '']);
}

export async function actualizarEstadoFacturacion(numeroFilaOId, datosFactura) {
  if (MODO_LOCAL) {
    // En modo local se busca por ID (guardado en _fila simulado)
    return actualizarEstadoFacturacionLocal(numeroFilaOId, datosFactura);
  }

  await actualizarRango(`${HOJA}!L${numeroFilaOId}:O${numeroFilaOId}`, [[
    datosFactura.estado,
    datosFactura.nroComprobante || '',
    datosFactura.cae || '',
    datosFactura.vencimientoCAE || '',
  ]]);
}
