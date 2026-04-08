import { leerRango, agregarFila, actualizarRango } from './client.js';
import {
  obtenerClientesLocal,
  upsertClienteLocal,
} from '../local/adaptadorLocal.js';

const MODO_LOCAL = !process.env.SPREADSHEET_ID;
const HOJA = '👤 Clientes';

const COL = { ID: 0, NOMBRE: 1, TELEFONO: 2, DIRECCION: 3, ULTIMA_VISITA: 4, TOTAL_TRABAJOS: 5 };

function filaACliente(fila, numeroFila) {
  return {
    _fila: numeroFila,
    id: fila[COL.ID] || '',
    nombre: fila[COL.NOMBRE] || '',
    telefono: fila[COL.TELEFONO] || '',
    direccion: fila[COL.DIRECCION] || '',
    ultimaVisita: fila[COL.ULTIMA_VISITA] || '',
    totalTrabajos: parseInt(fila[COL.TOTAL_TRABAJOS]) || 0,
  };
}

export async function obtenerClientes() {
  if (MODO_LOCAL) return obtenerClientesLocal();

  const datos = await leerRango(`${HOJA}!A2:F`);
  if (!datos || datos.length === 0) return [];
  return datos
    .filter(f => f[COL.NOMBRE])
    .map((f, i) => filaACliente(f, i + 2));
}

export async function buscarClientesPorNombre(texto) {
  const clientes = await obtenerClientes();
  const busqueda = texto.toLowerCase();
  return clientes.filter(c =>
    c.nombre.toLowerCase().includes(busqueda) ||
    c.telefono.includes(texto)
  );
}

export async function upsertCliente({ nombre, telefono, direccion }) {
  if (!nombre) return;
  if (MODO_LOCAL) return upsertClienteLocal({ nombre, telefono, direccion });

  const fecha = new Date().toLocaleDateString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  const datos = await leerRango(`${HOJA}!A2:F`);
  const filas = datos || [];

  let indexFila = null;
  let filaExistente = null;

  if (telefono) {
    for (let i = 0; i < filas.length; i++) {
      if (filas[i][COL.TELEFONO] === String(telefono)) {
        filaExistente = filas[i];
        indexFila = i + 2;
        break;
      }
    }
  }

  if (filaExistente) {
    const total = parseInt(filaExistente[COL.TOTAL_TRABAJOS]) || 0;
    await actualizarRango(`${HOJA}!E${indexFila}:F${indexFila}`, [[fecha, total + 1]]);
    if (direccion && !filaExistente[COL.DIRECCION]) {
      await actualizarRango(`${HOJA}!D${indexFila}`, [[direccion]]);
    }
  } else {
    await agregarFila(HOJA, [`C${Date.now()}`, nombre, telefono || '', direccion || '', fecha, 1]);
  }
}
