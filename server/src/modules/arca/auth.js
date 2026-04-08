import forge from 'node-forge';
import { readFileSync } from 'fs';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';

// Token cacheado para no pedir uno nuevo en cada factura
let tokenCache = {
  token: null,
  sign: null,
  expiracion: null,
};

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

  const generationTime = ahora.toISOString().replace(/\.\d{3}Z$/, '-03:00');
  const expirationTime = expiracion.toISOString().replace(/\.\d{3}Z$/, '-03:00');

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

  const respuesta = await axios.post(process.env.ARCA_WSAA_URL, soapBody, {
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': '',
    },
    timeout: 30000,
  });

  // Parsear el XML de respuesta
  const xml = await parseStringPromise(respuesta.data, { explicitArray: false });
  const loginTicketResponse = xml['soapenv:Envelope']['soapenv:Body']['loginCmsReturn'];

  const ticketXML = await parseStringPromise(loginTicketResponse, { explicitArray: false });
  const credentials = ticketXML.loginTicketResponse.credentials;

  tokenCache = {
    token: credentials.token,
    sign: credentials.sign,
    expiracion: ticketXML.loginTicketResponse.header.expirationTime,
  };

  console.log('[ARCA Auth] Nuevo token obtenido. Expira:', tokenCache.expiracion);
  return { token: tokenCache.token, sign: tokenCache.sign };
}

/**
 * Invalida el token cacheado (útil para forzar renovación).
 */
export function invalidarTokenCache() {
  tokenCache = { token: null, sign: null, expiracion: null };
}
