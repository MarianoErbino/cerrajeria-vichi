import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { obtenerToken } from './auth.js';

const PARSE_OPTS = {
  explicitArray: false,
  tagNameProcessors: [(name) => name.replace(/^.+:/, '')],
};

/**
 * Hace POST SOAP a ARCA. Si ARCA devuelve un HTTP 500 con SOAP Fault, extrae el
 * faultstring y lo lanza como Error legible en lugar de un genérico "500".
 */
async function postSOAP(url, soapBody, soapAction) {
  try {
    return await axios.post(url, soapBody, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': soapAction,
      },
      timeout: 30000,
    });
  } catch (err) {
    const data = err.response?.data;
    if (typeof data === 'string') {
      try {
        const xml = await parseStringPromise(data, PARSE_OPTS);
        const fault = xml?.Envelope?.Body?.Fault;
        if (fault) {
          const msg = fault.faultstring || fault.Reason?.Text || JSON.stringify(fault);
          console.error('[ARCA SOAP Fault]', msg);
          throw new Error(`ARCA SOAP Fault: ${msg}`);
        }
        console.error('[ARCA] Respuesta de error sin Fault parseable:', data.slice(0, 500));
      } catch (parseErr) {
        if (parseErr.message?.startsWith('ARCA SOAP Fault')) throw parseErr;
        console.error('[ARCA] No se pudo parsear respuesta de error:', data.slice(0, 500));
      }
    }
    throw err;
  }
}

// Tipos de comprobante ARCA
export const TIPOS_COMPROBANTE = {
  FACTURA_A: 1,
  FACTURA_B: 6,
  FACTURA_C: 11,
};

// Condiciones de IVA del receptor
export const CONDICIONES_IVA = {
  IVA_RESPONSABLE_INSCRIPTO: 1,
  IVA_RESPONSABLE_NO_INSCRIPTO: 2,
  IVA_EXENTO: 4,
  CONSUMIDOR_FINAL: 5,
  RESPONSABLE_MONOTRIBUTO: 6,
  SUJETO_NO_CATEGORIZADO: 7,
};

/**
 * Obtiene el último número de comprobante emitido para un punto de venta y tipo.
 * Necesario para calcular el número del próximo comprobante.
 */
export async function obtenerUltimoComprobante(tipoComprobante) {
  const { token, sign } = await obtenerToken();
  const cuit = process.env.ARCA_CUIT;
  const puntoVenta = parseInt(process.env.ARCA_PUNTO_VENTA);

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Header/>
  <soapenv:Body>
    <ar:FECompUltimoAutorizado>
      <ar:Auth>
        <ar:Token>${token}</ar:Token>
        <ar:Sign>${sign}</ar:Sign>
        <ar:Cuit>${cuit}</ar:Cuit>
      </ar:Auth>
      <ar:PtoVta>${puntoVenta}</ar:PtoVta>
      <ar:CbteTipo>${tipoComprobante}</ar:CbteTipo>
    </ar:FECompUltimoAutorizado>
  </soapenv:Body>
</soapenv:Envelope>`;

  const respuesta = await postSOAP(
    process.env.ARCA_WSFE_URL,
    soapBody,
    'http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado',
  );

  const xml = await parseStringPromise(respuesta.data, PARSE_OPTS);
  const resultado = xml.Envelope.Body.FECompUltimoAutorizadoResponse.FECompUltimoAutorizadoResult;

  if (resultado.Errors) {
    const error = resultado.Errors.Err;
    throw new Error(`Error WSFE: [${error.Code}] ${error.Msg}`);
  }

  return parseInt(resultado.CbteNro);
}

/**
 * Solicita un CAE para una venta (FECAESolicitar).
 *
 * @param {Object} venta - Datos de la venta
 * @param {number} venta._fila - Número de fila en Sheets
 * @param {number} venta.montoCobrado - Importe total en pesos
 * @param {string} venta.tipoComprobante - 'A', 'B' o 'C'
 * @param {string} venta.cuitCliente - CUIT del receptor (requerido para tipo A)
 * @param {string} venta.condicionIVA - Condición IVA del receptor
 * @param {string} venta.fecha - Fecha de la venta (dd/mm/yyyy)
 * @param {string} venta.materiales - JSON de materiales usados
 * @returns {Object} - { cae, vencimientoCAE, nroComprobante }
 */
export async function solicitarCAE(venta) {
  const { token, sign } = await obtenerToken();
  const cuit = process.env.ARCA_CUIT;
  const puntoVenta = parseInt(process.env.ARCA_PUNTO_VENTA);

  // Determinar tipo numérico de comprobante
  let tipoCbteNum;
  switch (venta.tipoComprobante) {
    case 'A': tipoCbteNum = TIPOS_COMPROBANTE.FACTURA_A; break;
    case 'B': tipoCbteNum = TIPOS_COMPROBANTE.FACTURA_B; break;
    case 'C':
    default:  tipoCbteNum = TIPOS_COMPROBANTE.FACTURA_C; break;
  }

  // Número del próximo comprobante
  const ultimoNro = await obtenerUltimoComprobante(tipoCbteNum);
  const nroComprobante = ultimoNro + 1;

  // Fecha del comprobante en formato YYYYMMDD
  const fechaArray = venta.fecha.split('/');
  const fechaCbte = `${fechaArray[2]}${fechaArray[1]}${fechaArray[0]}`;

  // Concepto: 1=Productos, 2=Servicios, 3=Productos y Servicios
  const tieneMateriales = venta.materiales && venta.materiales !== '[]' && venta.materiales !== '';
  const concepto = tieneMateriales ? 3 : 2;

  // Condición IVA del receptor
  let condIVANum = CONDICIONES_IVA.CONSUMIDOR_FINAL;
  if (venta.condicionIVA) {
    const mapCondicion = {
      'RI': CONDICIONES_IVA.IVA_RESPONSABLE_INSCRIPTO,
      'RNI': CONDICIONES_IVA.IVA_RESPONSABLE_NO_INSCRIPTO,
      'EX': CONDICIONES_IVA.IVA_EXENTO,
      'CF': CONDICIONES_IVA.CONSUMIDOR_FINAL,
      'MT': CONDICIONES_IVA.RESPONSABLE_MONOTRIBUTO,
    };
    condIVANum = mapCondicion[venta.condicionIVA] || CONDICIONES_IVA.CONSUMIDOR_FINAL;
  }

  // CUIT del receptor: si es Factura C a Consumidor Final, se usa 0
  const cuitReceptor = (tipoCbteNum === TIPOS_COMPROBANTE.FACTURA_C)
    ? (venta.cuitCliente || '0')
    : venta.cuitCliente;

  // Tipo de documento del receptor
  // 99 = sin identificar (Consumidor Final), 80 = CUIT
  const tipoDocReceptor = (tipoCbteNum === TIPOS_COMPROBANTE.FACTURA_C && !venta.cuitCliente) ? 99 : 80;

  // Importes (Factura C: IVA incluido, sin discriminar)
  const importe = parseFloat(venta.montoCobrado).toFixed(2);

  // Para Factura C no se discrimina IVA
  const importeNeto = importe;
  const importeIVA = '0.00';

  // RG AFIP: si concepto = Servicios (2) o Productos+Servicios (3), las fechas son obligatorias.
  // Usamos la misma fecha del comprobante (servicio prestado ese día, pago contado).
  const fechasServicio = concepto === 1 ? '' : `
            <ar:FchServDesde>${fechaCbte}</ar:FchServDesde>
            <ar:FchServHasta>${fechaCbte}</ar:FchServHasta>
            <ar:FchVtoPago>${fechaCbte}</ar:FchVtoPago>`;
  const alicuotaIVA = tipoCbteNum === TIPOS_COMPROBANTE.FACTURA_C ? '' : `
      <ar:Alicuotas>
        <ar:AlicIva>
          <ar:Id>5</ar:Id>
          <ar:BaseImp>${(parseFloat(importe) / 1.21).toFixed(2)}</ar:BaseImp>
          <ar:Importe>${(parseFloat(importe) - parseFloat(importe) / 1.21).toFixed(2)}</ar:Importe>
        </ar:AlicIva>
      </ar:Alicuotas>`;

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Header/>
  <soapenv:Body>
    <ar:FECAESolicitar>
      <ar:Auth>
        <ar:Token>${token}</ar:Token>
        <ar:Sign>${sign}</ar:Sign>
        <ar:Cuit>${cuit}</ar:Cuit>
      </ar:Auth>
      <ar:FeCAEReq>
        <ar:FeCabReq>
          <ar:CantReg>1</ar:CantReg>
          <ar:PtoVta>${puntoVenta}</ar:PtoVta>
          <ar:CbteTipo>${tipoCbteNum}</ar:CbteTipo>
        </ar:FeCabReq>
        <ar:FeDetReq>
          <ar:FECAEDetRequest>
            <ar:Concepto>${concepto}</ar:Concepto>
            <ar:DocTipo>${tipoDocReceptor}</ar:DocTipo>
            <ar:DocNro>${cuitReceptor}</ar:DocNro>
            <ar:CbteDesde>${nroComprobante}</ar:CbteDesde>
            <ar:CbteHasta>${nroComprobante}</ar:CbteHasta>
            <ar:CbteFch>${fechaCbte}</ar:CbteFch>
            <ar:ImpTotal>${importe}</ar:ImpTotal>
            <ar:ImpTotConc>0.00</ar:ImpTotConc>
            <ar:ImpNeto>${importeNeto}</ar:ImpNeto>
            <ar:ImpOpEx>0.00</ar:ImpOpEx>
            <ar:ImpTrib>0.00</ar:ImpTrib>
            <ar:ImpIVA>${importeIVA}</ar:ImpIVA>${fechasServicio}
            <ar:MonId>PES</ar:MonId>
            <ar:MonCotiz>1</ar:MonCotiz>
            <ar:CondicionIVAReceptorId>${condIVANum}</ar:CondicionIVAReceptorId>
            ${alicuotaIVA}
          </ar:FECAEDetRequest>
        </ar:FeDetReq>
      </ar:FeCAEReq>
    </ar:FECAESolicitar>
  </soapenv:Body>
</soapenv:Envelope>`;

  const respuesta = await postSOAP(
    process.env.ARCA_WSFE_URL,
    soapBody,
    'http://ar.gov.afip.dif.FEV1/FECAESolicitar',
  );

  const xml = await parseStringPromise(respuesta.data, PARSE_OPTS);
  const resultado = xml.Envelope.Body.FECAESolicitarResponse.FECAESolicitarResult;

  // Verificar errores globales
  if (resultado.Errors) {
    const err = resultado.Errors.Err;
    const msg = Array.isArray(err) ? err.map(e => `[${e.Code}] ${e.Msg}`).join(', ') : `[${err.Code}] ${err.Msg}`;
    throw new Error(`Error WSFE: ${msg}`);
  }

  const detalle = resultado.FeDetResp.FECAEDetResponse;

  // Verificar resultado del comprobante individual
  if (detalle.Resultado !== 'A') {
    const obs = detalle.Observaciones?.Obs;
    const msg = Array.isArray(obs)
      ? obs.map(o => `[${o.Code}] ${o.Msg}`).join(', ')
      : obs ? `[${obs.Code}] ${obs.Msg}` : 'Rechazado sin observaciones';
    throw new Error(`Comprobante rechazado: ${msg}`);
  }

  // Formatear fecha de vencimiento del CAE: YYYYMMDD → DD/MM/YYYY
  const venc = detalle.CAEFchVto;
  const vencimientoFormateado = `${venc.slice(6,8)}/${venc.slice(4,6)}/${venc.slice(0,4)}`;

  const nroFormatado = `${String(puntoVenta).padStart(5, '0')}-${String(nroComprobante).padStart(8, '0')}`;

  return {
    cae: detalle.CAE,
    vencimientoCAE: vencimientoFormateado,
    nroComprobante: nroFormatado,
    tipoComprobante: tipoCbteNum,
  };
}

/**
 * Verifica la conexión con el WSFE (FEDummy).
 * Útil para health check.
 */
export async function verificarConexionWSFE() {
  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Header/>
  <soapenv:Body>
    <ar:FEDummy/>
  </soapenv:Body>
</soapenv:Envelope>`;

  const respuesta = await postSOAP(
    process.env.ARCA_WSFE_URL,
    soapBody,
    'http://ar.gov.afip.dif.FEV1/FEDummy',
  );

  const xml = await parseStringPromise(respuesta.data, PARSE_OPTS);
  const resultado = xml.Envelope.Body.FEDummyResponse.FEDummyResult;

  return {
    appServer: resultado.AppServer,
    dbServer: resultado.DbServer,
    authServer: resultado.AuthServer,
  };
}
