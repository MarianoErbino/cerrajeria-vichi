/**
 * Inicializa el Google Spreadsheet con las hojas, headers y datos del Excel local.
 *
 * Requiere en `.env`:
 *   SPREADSHEET_ID
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL
 *   GOOGLE_PRIVATE_KEY
 *   EXCEL_PATH (para tomar el catálogo inicial)
 *
 * Uso (desde server/):
 *   node scripts/seed-sheets.mjs
 *
 * Idempotente: hojas que ya existan no se recrean, headers se sobreescriben,
 * y los datos se cargan solo si la hoja está vacía (más allá del header).
 */
import 'dotenv/config';
import { google } from 'googleapis';
import { createRequire } from 'module';
import { existsSync } from 'fs';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

// ─── Configuración ────────────────────────────────────────────────────────────

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const EXCEL_PATH = process.env.EXCEL_PATH;

if (!SPREADSHEET_ID) throw new Error('Falta SPREADSHEET_ID en .env');
if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_EMAIL en .env');
if (!process.env.GOOGLE_PRIVATE_KEY) throw new Error('Falta GOOGLE_PRIVATE_KEY en .env');

const HEADERS = {
  Ventas: ['ID', 'Fecha', 'Hora', 'Tipo_Servicio', 'Cliente_Nombre', 'Cliente_Tel',
    'Materiales', 'Monto_Cobrado', 'Modalidad_Pago', 'Es_Urgencia', 'Notas',
    'Facturado', 'Nro_Comprobante', 'CAE', 'Vencimiento_CAE', 'Requiere_Factura',
    'CUIT_Cliente', 'Tipo_Comprobante', 'Condicion_IVA'],
  Clientes: ['ID', 'Nombre', 'Telefono', 'Direccion', 'Ultima_Visita', 'Total_Trabajos'],
  Productos: ['Código', 'Categoría', 'Marca', 'Descripción', 'Costo s/IVA ($)',
    'Costo c/IVA ($)', 'Margen % (auto)', 'Precio venta ($)', 'Stock inicial',
    'Stock actual', 'Stock mínimo', 'Alerta', 'Uso'],
  Servicios: ['ID_Servicio', 'Nombre', 'Categoria', 'Tipo_Cobro', 'Horas_Estimadas',
    'Costo_MO_Auto', 'Costo_Materiales', 'Precio_Base_Auto', 'Precio_Urgencia_Auto',
    'Incluye_Producto', 'Notas'],
  Configuración: ['Clave', 'Valor', 'Tipo', 'Nota'],
  Stock: ['Fecha', 'Codigo_Producto', 'Descripcion', 'Tipo_Movimiento', 'Cantidad',
    'Stock_Anterior', 'Stock_Nuevo', 'ID_Venta', 'Notas'],
  Facturacion_Log: ['Fecha_Ejecucion', 'Ventas_Procesadas', 'Exitosas', 'Fallidas',
    'Detalle_Errores', 'CAEs_Emitidos'],
};

// ─── Cliente de Sheets ────────────────────────────────────────────────────────

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function obtenerEstadoHojas() {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existentes = new Map();
  for (const s of meta.data.sheets) {
    existentes.set(s.properties.title, s.properties.sheetId);
  }
  return existentes;
}

async function crearHojasFaltantes(existentes) {
  const requests = [];
  for (const nombre of Object.keys(HEADERS)) {
    if (!existentes.has(nombre)) {
      requests.push({ addSheet: { properties: { title: nombre } } });
    }
  }
  if (requests.length === 0) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests },
  });
  console.log(`  Creadas ${requests.length} hoja(s)`);
}

async function eliminarHoja1SiSobra(existentes) {
  // Cuando se crea un Sheet nuevo, Google agrega una "Hoja 1" / "Sheet1" que no usamos.
  // La borramos si todavía está y ya creamos las hojas reales.
  const sobrante = ['Hoja 1', 'Sheet1', 'Hoja1'].find(n => existentes.has(n));
  if (!sobrante) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: [{ deleteSheet: { sheetId: existentes.get(sobrante) } }] },
  });
  console.log(`  Eliminada hoja por defecto: "${sobrante}"`);
}

async function escribirHeaders(nombre, headers) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${nombre}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [headers] },
  });
}

async function tieneDatos(nombre) {
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${nombre}!A2:A2`,
  });
  return !!(r.data.values && r.data.values.length > 0 && r.data.values[0][0]);
}

async function appendBulk(nombre, filas) {
  if (filas.length === 0) return;
  // En lotes de 500 para evitar payloads grandes
  const tamanio = 500;
  for (let i = 0; i < filas.length; i += tamanio) {
    const lote = filas.slice(i, i + tamanio);
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${nombre}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: lote },
    });
    console.log(`  ${nombre}: subidas ${Math.min(i + tamanio, filas.length)}/${filas.length}`);
  }
}

// ─── Lectura del Excel local ──────────────────────────────────────────────────

function leerExcelLocal() {
  if (!EXCEL_PATH || !existsSync(EXCEL_PATH)) {
    console.warn(`[seed] EXCEL_PATH no apunta a un archivo válido (${EXCEL_PATH}). El Sheet quedará con headers pero sin datos iniciales.`);
    return null;
  }
  return XLSX.readFile(EXCEL_PATH);
}

function filasDeHoja(wb, hoja) {
  const ws = wb?.Sheets?.[hoja];
  if (!ws) return [];
  const filas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (filas.length < 2) return [];
  // Saltea header y descarta filas totalmente vacías
  return filas.slice(1).filter(f => f.some(c => c !== '' && c != null));
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[seed] Spreadsheet: ${SPREADSHEET_ID}`);

  let existentes = await obtenerEstadoHojas();
  console.log(`[seed] Hojas existentes: ${[...existentes.keys()].join(', ') || '(ninguna)'}`);

  console.log('[seed] Creando hojas faltantes...');
  await crearHojasFaltantes(existentes);

  existentes = await obtenerEstadoHojas();
  await eliminarHoja1SiSobra(existentes);

  console.log('[seed] Escribiendo headers...');
  for (const [nombre, headers] of Object.entries(HEADERS)) {
    await escribirHeaders(nombre, headers);
  }

  const wb = leerExcelLocal();
  if (!wb) {
    console.log('[seed] Listo (sin datos iniciales).');
    return;
  }

  // Solo cargar datos si la hoja destino está vacía, para que el script sea reejecutable.
  const cargarSi = async (nombre, hojaExcel) => {
    if (await tieneDatos(nombre)) {
      console.log(`  ${nombre}: ya tiene datos, salteo.`);
      return;
    }
    const filas = filasDeHoja(wb, hojaExcel);
    console.log(`  ${nombre}: subiendo ${filas.length} filas desde Excel...`);
    await appendBulk(nombre, filas);
  };

  await cargarSi('Productos', 'Productos');
  await cargarSi('Servicios', 'Servicios');
  await cargarSi('Configuración', 'Configuración');

  console.log('[seed] Listo.');
}

main().catch(err => {
  console.error('[seed] Falló:', err.message);
  if (err.response?.data) console.error(JSON.stringify(err.response.data, null, 2));
  process.exit(1);
});
