import { google } from 'googleapis';

let sheetsClient = null;

/**
 * Devuelve una instancia autenticada del cliente de Google Sheets.
 * Reutiliza la instancia si ya fue creada (singleton).
 */
export async function getSheetsClient() {
  if (sheetsClient) return sheetsClient;

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

/**
 * Lee un rango de una hoja del Spreadsheet.
 * @param {string} rango - Ej: "Ventas!A:O" o "Clientes!A2:F"
 * @returns {Array} - Array de arrays con los valores
 */
export async function leerRango(rango) {
  const sheets = await getSheetsClient();
  const respuesta = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: rango,
  });
  return respuesta.data.values || [];
}

/**
 * Agrega una fila al final de una hoja.
 * @param {string} hoja - Nombre de la hoja (ej: "Ventas")
 * @param {Array} fila - Array con los valores de la fila
 */
export async function agregarFila(hoja, fila) {
  const sheets = await getSheetsClient();
  const respuesta = await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `${hoja}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [fila],
    },
  });
  return respuesta.data;
}

/**
 * Actualiza una celda o rango específico.
 * @param {string} rango - Ej: "Ventas!L5:N5"
 * @param {Array} valores - Array de arrays con los nuevos valores
 */
export async function actualizarRango(rango, valores) {
  const sheets = await getSheetsClient();
  const respuesta = await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: rango,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: valores,
    },
  });
  return respuesta.data;
}

/**
 * Busca en una hoja y devuelve el número de fila (1-indexed) de la primera coincidencia.
 * @param {string} hoja - Nombre de la hoja
 * @param {number} columnaIndex - Índice de la columna a buscar (0-indexed)
 * @param {string} valor - Valor a buscar
 * @returns {number|null} - Número de fila o null si no encuentra
 */
export async function buscarFila(hoja, columnaIndex, valor) {
  const datos = await leerRango(`${hoja}!A:Z`);
  for (let i = 1; i < datos.length; i++) { // empieza en 1 para saltar header
    if (datos[i][columnaIndex] === String(valor)) {
      return i + 1; // +1 porque Sheets es 1-indexed
    }
  }
  return null;
}
