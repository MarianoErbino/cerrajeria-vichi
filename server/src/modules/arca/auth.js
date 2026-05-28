import forge from 'node-forge';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Persistimos el TA en server/data/arca-ta.json para que sobreviva reinicios del
// proceso. AFIP no permite pedir un TA nuevo si ya hay uno vigente (12hs), así
// que si perdiéramos el cache cada vez que arranca Node, romperíamos hasta que
// expire el TA viejo. Esto es estándar en implementaciones serias de WSAA.
const TA_FILE = join(__dirname, '../../../data/arca-ta.json');

let tokenCache = cargarTokenDeDisco();

function cargarTokenDeDisco() {
  try {
    if (!existsSync(TA_FILE)) return { token: null, sign: null, expiracion: null };
    const data = JSON.parse(readFileSync(TA_FILE, 'utf8'));
    if (data?.token && data?.expiracion) {
      console.log('[ARCA Auth] TA persistido cargado de disco. Expira:', data.expiracion);
      return data;
    }
  } catch (err) {
    console.warn('[ARCA Auth] No se pudo leer TA persistido:', err.message);
  }
  return { token: null, sign: null, expiracion: null };
}

function guardarTokenEnDisco(data) {
  try {
    const dir = dirname(TA_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(TA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn('[ARCA Auth] No se pudo persistir TA:', err.message);
  }
}

/**
 * Genera el CMS (Cryptographic Message Syntax) firmado con el certificado del contribuyente.
 * Este es el "LoginTicketRequest" que ARCA requiere para autenticar.
 */
function generarCMS() {
  const certPEM = readFileSync(process.env.ARCA_CERT_PATH, 'utf8');
  const keyPEM = readFileSync(process.env.ARCA_KEY_PATH, 'utf8');

  const cert = forge.pki.certificateFromPem(certPEM);
  const privateKey = forge.pki.privateKeyFromPem(keyPEM);

  // Tiempo de generación y expiración (UTC)
  const ahora = new Date();
  const expiracion = new Date(ahora.getTime() + 12 * 60 * 60 * 1000); // +12 horas

  // ISO 8601 en UTC con sufijo Z. AFIP acepta este formato; pegar "-03:00" sobre
  // una hora UTC (como había antes) corre el reloj 3hs al futuro y lo rechaza.
  const generationTime = ahora.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const expirationTime = expiracion.toISOString().replace(/\.\d{3}Z$/, 'Z');

  // XML del LoginTicketRequest
  const loginTicketRequest = `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${Math.floor(Date.now() / 1000)}</uniqueId>
    <generationTime>${generationTime}</generationTime>
    <expirationTime>${expirationTime}</expirationTime>
  </header>
  <service>wsfe</service>
</loginTicketRequest>`;

  // Firmar con PKCS7
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(loginTicketRequest, 'utf8');
  p7.addCertificate(cert);
  p7.addSigner({
    key: privateKey,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign();

  // Convertir a DER y luego a Base64
  const derBytes = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return forge.util.encode64(derBytes);
}

/**
 * Llama al WSAA de ARCA para obtener un Token de Acceso (TA).
 * Si el token cacheado sigue vigente, lo reutiliza.
 */
export async function obtenerToken() {
  const ahora = new Date();

  // Reutilizar token si todavía es válido (con 5 minutos de margen)
  if (tokenCache.token && tokenCache.expiracion) {
    const margen = 5 * 60 * 1000;
    if (new Date(tokenCache.expiracion) - ahora > margen) {
      console.log('[ARCA Auth] Reutilizando token cacheado');
      return { token: tokenCache.token, sign: tokenCache.sign };
    }
  }

  console.log('[ARCA Auth] Solicitando nuevo token al WSAA...');

  const cms = generarCMS();

  // SOAP request al WSAA
  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${cms}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`;

  let respuesta;
  try {
    respuesta = await axios.post(process.env.ARCA_WSAA_URL, soapBody, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '',
      },
      timeout: 30000,
    });
  } catch (err) {
    const data = err.response?.data;
    if (typeof data === 'string') {
      try {
        const xmlErr = await parseStringPromise(data, {
          explicitArray: false,
          tagNameProcessors: [(name) => name.replace(/^.+:/, '')],
        });
        const fault = xmlErr?.Envelope?.Body?.Fault;
        if (fault) {
          const msg = fault.faultstring || fault.Reason?.Text || JSON.stringify(fault);
          console.error('[WSAA SOAP Fault]', msg);
          throw new Error(`WSAA Fault: ${msg}`);
        }
        console.error('[WSAA] Respuesta de error sin Fault parseable:\n', data.slice(0, 800));
      } catch (parseErr) {
        if (parseErr.message?.startsWith('WSAA Fault')) throw parseErr;
        console.error('[WSAA] No se pudo parsear respuesta de error:\n', data.slice(0, 800));
      }
    }
    throw err;
  }

  // Parsear el XML de respuesta (tolerante al prefijo de namespace: soap, soapenv, env, etc.)
  const xml = await parseStringPromise(respuesta.data, {
    explicitArray: false,
    tagNameProcessors: [(name) => name.replace(/^.+:/, '')],
  });
  const body = xml.Envelope.Body;
  const loginTicketResponse = body.loginCmsResponse?.loginCmsReturn ?? body.loginCmsReturn;

  const ticketXML = await parseStringPromise(loginTicketResponse, { explicitArray: false });
  const credentials = ticketXML.loginTicketResponse.credentials;

  tokenCache = {
    token: credentials.token,
    sign: credentials.sign,
    expiracion: ticketXML.loginTicketResponse.header.expirationTime,
  };
  guardarTokenEnDisco(tokenCache);

  console.log('[ARCA Auth] Nuevo token obtenido. Expira:', tokenCache.expiracion);
  return { token: tokenCache.token, sign: tokenCache.sign };
}

/**
 * Invalida el token cacheado (útil para forzar renovación).
 */
export function invalidarTokenCache() {
  tokenCache = { token: null, sign: null, expiracion: null };
}
