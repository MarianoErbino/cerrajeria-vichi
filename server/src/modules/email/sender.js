/**
 * Envío de emails con Resend.
 *
 * Configuración en .env:
 *   RESEND_API_KEY           - API key generado en https://resend.com
 *   EMAIL_DESTINATARIO       - A quién mandar los resúmenes (típicamente Vichi)
 *   EMAIL_FROM               - Remitente. Default: 'onboarding@resend.dev'
 *                              (con ese remitente solo podés mandar al email de signup
 *                               de Resend; para mandar a cualquiera hay que verificar
 *                               un dominio propio en Resend → Domains)
 *
 * Si RESEND_API_KEY no está configurada, las funciones de envío no fallan
 * — solo loguean un warning. Esto permite que el bot corra aunque el email
 * todavía no esté configurado.
 */
import { Resend } from 'resend';

const FROM_DEFAULT = 'Cerrajería Vichi <onboarding@resend.dev>';

let cliente = null;

function obtenerCliente() {
  if (cliente) return cliente;
  if (!process.env.RESEND_API_KEY) return null;
  cliente = new Resend(process.env.RESEND_API_KEY);
  return cliente;
}

/**
 * Construye el HTML del resumen de facturación.
 * @param {Object} resumen - { ventasProcesadas, exitosas, fallidas, errores, caesEmitidos }
 * @param {Array}  ventasFacturadas - ventas con CAE asignado para mostrar en tabla
 */
function construirHTML(resumen, ventasFacturadas) {
  const fecha = new Date().toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const filasTabla = ventasFacturadas.map(v => `
    <tr>
      <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(v.clienteNombre)}</td>
      <td style="padding:8px;border:1px solid #ddd;">$${Number(v.montoCobrado).toLocaleString('es-AR')}</td>
      <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(v.nroComprobante || '')}</td>
      <td style="padding:8px;border:1px solid #ddd;font-family:monospace;">${escapeHtml(v.cae || '')}</td>
      <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(v.vencimientoCAE || '')}</td>
    </tr>
  `).join('');

  const erroresHTML = resumen.errores?.length > 0
    ? `<h3 style="color:#b00020;">Errores</h3><ul>${resumen.errores.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`
    : '';

  return `
    <div style="font-family:Arial,sans-serif;color:#222;max-width:680px;margin:0 auto;padding:24px;">
      <h2 style="margin:0 0 8px 0;">Resumen de facturación — ${fecha}</h2>
      <p style="color:#555;margin:0 0 16px 0;">Ambiente ARCA: <b>${process.env.ARCA_ENVIRONMENT || 'no configurado'}</b></p>

      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr style="background:#f5f5f5;">
          <td style="padding:8px;border:1px solid #ddd;"><b>Procesadas</b></td>
          <td style="padding:8px;border:1px solid #ddd;">${resumen.ventasProcesadas}</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #ddd;"><b>Exitosas</b></td>
          <td style="padding:8px;border:1px solid #ddd;color:#1b7a1b;">${resumen.exitosas}</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #ddd;"><b>Fallidas</b></td>
          <td style="padding:8px;border:1px solid #ddd;color:#b00020;">${resumen.fallidas}</td>
        </tr>
      </table>

      ${ventasFacturadas.length > 0 ? `
      <h3>Comprobantes emitidos</h3>
      <table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:14px;">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="padding:8px;border:1px solid #ddd;text-align:left;">Cliente</th>
            <th style="padding:8px;border:1px solid #ddd;text-align:left;">Monto</th>
            <th style="padding:8px;border:1px solid #ddd;text-align:left;">Nº comprobante</th>
            <th style="padding:8px;border:1px solid #ddd;text-align:left;">CAE</th>
            <th style="padding:8px;border:1px solid #ddd;text-align:left;">Vto CAE</th>
          </tr>
        </thead>
        <tbody>${filasTabla}</tbody>
      </table>
      <p style="color:#555;font-size:13px;margin-top:16px;">
        Para descargar el PDF oficial de cada factura, ingresá a
        <a href="https://serviciosweb.afip.gob.ar/genericos/comprobantes/cae.aspx">Consulta de Comprobantes (ARCA/AFIP)</a>
        con tu clave fiscal.
      </p>
      ` : '<p>No se emitieron comprobantes en esta ejecución.</p>'}

      ${erroresHTML}

      <p style="color:#888;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:12px;">
        Bot de facturación de Cerrajería Vichi. Este mail es automático.
      </p>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

/**
 * Envía el resumen por email. Si Resend no está configurado o el envío falla,
 * loguea y devuelve sin propagar el error (el bot no debe romperse por esto).
 */
export async function enviarResumenFacturacion(resumen, ventasFacturadas = []) {
  const destinatario = process.env.EMAIL_DESTINATARIO;
  if (!destinatario) {
    console.warn('[Email] EMAIL_DESTINATARIO no configurado, salteando envío.');
    return;
  }

  const c = obtenerCliente();
  if (!c) {
    console.warn('[Email] RESEND_API_KEY no configurada, salteando envío.');
    return;
  }

  const fecha = new Date().toLocaleDateString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  const subject = resumen.fallidas > 0
    ? `Facturación ${fecha} — ${resumen.exitosas} OK, ${resumen.fallidas} con error`
    : `Facturación ${fecha} — ${resumen.exitosas} comprobante(s) emitido(s)`;

  try {
    const { data, error } = await c.emails.send({
      from: process.env.EMAIL_FROM || FROM_DEFAULT,
      to: destinatario,
      subject,
      html: construirHTML(resumen, ventasFacturadas),
    });
    if (error) {
      console.error('[Email] Resend devolvió error:', error);
    } else {
      console.log(`[Email] Resumen enviado a ${destinatario} — id=${data?.id}`);
    }
  } catch (err) {
    console.error('[Email] Fallo al enviar:', err.message);
  }
}
