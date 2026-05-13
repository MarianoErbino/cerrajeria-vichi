import { obtenerVentasPendientes, actualizarEstadoFacturacion } from '../sheets/ventas.js';
import { agregarFila } from '../sheets/client.js';
import { solicitarCAE } from '../arca/wsfe.js';
import { enviarResumenFacturacion } from '../email/sender.js';

const HOJA_LOG = 'Facturacion_Log';

/**
 * Ejecuta el proceso de facturación automática.
 * Lee todas las ventas pendientes de facturar y les solicita CAE a ARCA.
 *
 * Diseño clave: un error en una factura NO detiene el proceso de las demás.
 * Cada venta se procesa de forma independiente con su propio try/catch.
 *
 * @returns {Object} - Resumen de la ejecución
 */
export async function ejecutarFacturacion() {
  const inicio = new Date();
  console.log(`\n🤖 [Bot] Iniciando facturación - ${inicio.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`);

  let ventasProcesadas = 0;
  let exitosas = 0;
  let fallidas = 0;
  const errores = [];
  const caesEmitidos = [];
  const ventasFacturadas = []; // {clienteNombre, montoCobrado, nroComprobante, cae, vencimientoCAE} para el email

  try {
    // 1. Leer ventas pendientes
    const ventasPendientes = await obtenerVentasPendientes();
    ventasProcesadas = ventasPendientes.length;

    if (ventasProcesadas === 0) {
      console.log('[Bot] No hay ventas pendientes de facturar.');
      await registrarLog({
        ventasProcesadas: 0,
        exitosas: 0,
        fallidas: 0,
        detalleErrores: '',
        caesEmitidos: '',
      });
      return { ventasProcesadas: 0, exitosas: 0, fallidas: 0, errores: [], caesEmitidos: [] };
    }

    console.log(`[Bot] Procesando ${ventasProcesadas} venta(s) pendiente(s)...`);

    // 2. Procesar cada venta de forma independiente
    for (const venta of ventasPendientes) {
      try {
        console.log(`[Bot] Facturando venta ID=${venta.id}, Monto=$${venta.montoCobrado}, Cliente=${venta.clienteNombre}`);

        const resultado = await solicitarCAE(venta);

        // 3. Actualizar la fila en Sheets con el CAE obtenido
        await actualizarEstadoFacturacion(venta._fila, {
          estado: 'EMITIDA',
          nroComprobante: resultado.nroComprobante,
          cae: resultado.cae,
          vencimientoCAE: resultado.vencimientoCAE,
        });

        exitosas++;
        caesEmitidos.push(`${venta.id}:${resultado.cae}`);
        ventasFacturadas.push({
          clienteNombre: venta.clienteNombre,
          montoCobrado: venta.montoCobrado,
          nroComprobante: resultado.nroComprobante,
          cae: resultado.cae,
          vencimientoCAE: resultado.vencimientoCAE,
        });
        console.log(`  ✅ CAE obtenido: ${resultado.cae} | Comprobante: ${resultado.nroComprobante}`);

      } catch (err) {
        // El error no detiene el procesamiento de las demás ventas
        fallidas++;
        const mensajeError = `${venta.id}: ${err.message}`;
        errores.push(mensajeError);
        console.error(`  ❌ Error en venta ${venta.id}:`, err.message);

        // Marcar la venta como ERROR en Sheets
        try {
          await actualizarEstadoFacturacion(venta._fila, {
            estado: 'ERROR',
            nroComprobante: '',
            cae: '',
            vencimientoCAE: err.message.slice(0, 100), // Guardar el error en ese campo
          });
        } catch (updateErr) {
          console.error(`  ⚠️ No se pudo marcar el error en Sheets para venta ${venta.id}:`, updateErr.message);
        }
      }
    }

  } catch (err) {
    // Error general (ej: no pudo conectar con Sheets)
    console.error('[Bot] Error general en la facturación:', err.message);
    errores.push(`Error general: ${err.message}`);
    fallidas = ventasProcesadas - exitosas;
  }

  // 4. Registrar el log de la ejecución
  const resumen = {
    ventasProcesadas,
    exitosas,
    fallidas,
    detalleErrores: errores.join(' | '),
    caesEmitidos: caesEmitidos.join(' | '),
  };

  await registrarLog(resumen);

  // Mandar resumen por email (si hay algo que reportar). No bloquea si falla.
  if (ventasProcesadas > 0) {
    await enviarResumenFacturacion({ ...resumen, errores }, ventasFacturadas);
  }

  const fin = new Date();
  const duracion = Math.round((fin - inicio) / 1000);
  console.log(`\n🤖 [Bot] Facturación finalizada en ${duracion}s`);
  console.log(`   Procesadas: ${ventasProcesadas} | Exitosas: ${exitosas} | Fallidas: ${fallidas}`);

  return { ...resumen, errores, caesEmitidos, ventasFacturadas };
}

/**
 * Registra el resultado de la ejecución en la hoja "Facturacion_Log".
 */
async function registrarLog({ ventasProcesadas, exitosas, fallidas, detalleErrores, caesEmitidos }) {
  const fechaEjecucion = new Date().toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  try {
    await agregarFila(HOJA_LOG, [
      fechaEjecucion,
      ventasProcesadas,
      exitosas,
      fallidas,
      detalleErrores,
      caesEmitidos,
    ]);
  } catch (err) {
    // No fallar si no se puede escribir el log
    console.error('[Bot] Error al escribir log de facturación:', err.message);
  }
}
