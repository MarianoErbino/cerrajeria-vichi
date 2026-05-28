# Cerrajería Vichi

App de gestión para la cerrajería de Vichi: registro de ventas, autocomplete de clientes, catálogo de productos/servicios, dashboard diario, integración con WhatsApp para avisar al cliente "ya estoy yendo", y **facturación electrónica automática** vía ARCA (ex-AFIP) con resumen diario por email.

La base de datos vive en una hoja de **Google Sheets** — Vichi puede ver y editar las ventas desde el celular sin abrir la app.

---

## En producción

| Capa | URL | Plataforma |
|---|---|---|
| Frontend | https://cerrajeria-vichi.vercel.app | Vercel (free) |
| Backend  | https://cerrajeria-vichi-api.onrender.com | Render (free) |
| Datos    | Google Sheet `Dataset_Cerrajeria` | Google Sheets API |
| Cron diario de facturación | https://console.cron-job.org/ | cron-job.org (free) |
| Email resumen | Resend | Resend (free) |

> **Cold start**: el plan free de Render duerme el servicio tras 15 min sin uso. La primera request después puede tardar ~30 s.

---

## Stack

- **Frontend**: React 19 + Vite + TailwindCSS
- **Backend**: Node.js + Express
- **Auth**: JWT en memoria del cliente (no persiste — pide PIN al recargar)
- **Datos**: Google Sheets API (Service Account)
- **Facturación**: ARCA WSFE (homologación o producción)
- **Email**: Resend (resumen diario con tabla de CAEs emitidos)
- **Scheduler**: cron-job.org externo (despierta Render y dispara el bot vía endpoint con shared secret)

---

## Cómo funciona la facturación automática

1. Cada vez que se registra una venta con `Requiere_Factura = SI`, queda en la hoja `Ventas` con `Facturado = PENDIENTE`.
2. **cron-job.org** dispara una vez al día (19:00 ARG = 22:00 UTC) un `POST https://cerrajeria-vichi-api.onrender.com/api/facturacion/trigger?token=<BOT_TRIGGER_TOKEN>`.
3. El endpoint valida el shared secret y arranca el bot:
   - Lee del Sheet todas las ventas pendientes
   - Por cada una, autentica con WSAA, pide CAE al WSFE, y actualiza la fila con el CAE/nro de comprobante/vencimiento
   - Si una factura falla, las demás siguen procesándose
   - Loguea el resumen en la hoja `Facturacion_Log`
4. Al final, manda un email a `EMAIL_DESTINATARIO` con tabla de comprobantes emitidos + link a Consulta de Comprobantes de AFIP para descargar los PDF oficiales.

Si Render está dormido cuando dispara cron-job.org, la request despierta el server (con ~30 s de cold start). Hay también un cronjob de keepalive opcional (`/api/health` un poco antes) para amortiguar.

---

## Estructura del repo

```
cerrajeria-vichi/
├── client/                       # Frontend Vite + React
│   ├── src/
│   │   ├── pages/                # Pantallas (Login, Dashboard, RegistrarVenta, YendoDomicilio, ...)
│   │   ├── components/
│   │   ├── context/              # AuthContext, ToastContext
│   │   └── services/api.js       # Cliente HTTP centralizado
│   ├── vite.config.js            # Proxy /api → backend local
│   └── vercel.json               # Rewrite SPA
│
├── server/                       # Backend Express
│   ├── src/
│   │   ├── index.js              # Bootstrap + CORS + materializa certs ARCA desde env
│   │   ├── routes/               # auth, ventas, clientes, catalogo, facturacion, dashboard
│   │   ├── middleware/auth.js    # JWT
│   │   └── modules/
│   │       ├── sheets/           # Cliente y operaciones sobre Google Sheets
│   │       ├── local/            # Adaptador para correr sin Sheets (lee/escribe el .xlsx)
│   │       ├── arca/             # Cliente WSAA + WSFE
│   │       ├── email/            # Envío de resumen vía Resend
│   │       └── bot/              # Scheduler + ejecutor de facturación
│   └── scripts/seed-sheets.mjs   # Inicializa el Sheet con hojas, headers y datos
│
├── render.yaml                   # Blueprint de Render (plan: free)
├── SETUP.md                      # Guía paso a paso de setup desde cero
└── README.md
```

---

## Modos de operación

El backend tiene dos modos:

- **Modo Google Sheets** (recomendado, lo que está en producción): se activa cuando `SPREADSHEET_ID` está seteado. Lee y escribe ventas/clientes/productos/servicios directamente sobre la hoja.
- **Modo Local**: si `SPREADSHEET_ID` no está seteado, lee y escribe sobre el archivo `.xlsx` configurado en `EXCEL_PATH`. Útil para desarrollo offline. **No funciona en Render** (filesystem efímero).

El cambio entre modos es automático según las env vars.

---

## Setup local

Detalle paso a paso (ARCA, Service Account, deploy) en [SETUP.md](./SETUP.md). Resumen:

```bash
# Instalar dependencias
npm run install:all

# Backend (en server/)
cp .env.example .env   # editar con tus valores (ver §Variables de entorno)
npm run dev            # corre en http://localhost:3010

# Frontend (en client/)
npm run dev            # corre en http://localhost:5173, hace proxy a :3010
```

Login: PIN `1234` (configurable con `OWNER_PIN`).

---

## Variables de entorno

### `server/.env`

#### Core
| Variable | Requerida | Descripción |
|---|---|---|
| `PORT` | no | Puerto del backend (default 3001). En Render se setea automático. |
| `OWNER_PIN` | sí | PIN de acceso a la app. |
| `JWT_SECRET` | sí | Secret para firmar JWTs. Generar con `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`. |
| `CLIENT_URL` | no | URL del frontend para CORS estricto. En su ausencia, el regex acepta cualquier `*.vercel.app` y `localhost`. |
| `BOT_TIMEZONE` | no | TZ del cron interno (no usado si se dispara el bot por trigger externo). Default `America/Argentina/Buenos_Aires`. |

#### Google Sheets
| Variable | Requerida | Descripción |
|---|---|---|
| `SPREADSHEET_ID` | sí (modo Sheets) | ID del Google Sheet (de la URL: `/d/<ID>/edit`). |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | sí | `client_email` del JSON de la Service Account. |
| `GOOGLE_PRIVATE_KEY` | sí | `private_key` del JSON (con `\n` literales). |
| `EXCEL_PATH` | no (modo Local) | Ruta absoluta al `.xlsx` de respaldo/desarrollo. |

#### Bot trigger (cron externo)
| Variable | Requerida | Descripción |
|---|---|---|
| `BOT_TRIGGER_TOKEN` | sí | Shared secret. cron-job.org lo pasa por query param `?token=`. Generar con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |

#### Email (Resend)
| Variable | Requerida | Descripción |
|---|---|---|
| `RESEND_API_KEY` | sí (si email) | API key de Resend. Sin esto, el bot no manda mails (loguea warning). |
| `EMAIL_DESTINATARIO` | sí (si email) | A quién mandar el resumen. Con el remitente `onboarding@resend.dev`, Resend solo permite mandar al email de signup de la cuenta. |
| `EMAIL_FROM` | no | Remitente. Default: `Cerrajería Vichi <onboarding@resend.dev>`. Para mandar a cualquier destinatario hay que verificar un dominio propio en Resend. |

#### ARCA (facturación electrónica)
| Variable | Requerida | Descripción |
|---|---|---|
| `ARCA_CUIT` | sí (si ARCA) | CUIT del contribuyente sin guiones. |
| `ARCA_PUNTO_VENTA` | sí | Número de punto de venta electrónico habilitado en ARCA. |
| `ARCA_ENVIRONMENT` | sí | `homologacion` o `produccion`. |
| `ARCA_WSAA_URL` | sí | URL del WSAA (homologación o producción). |
| `ARCA_WSFE_URL` | sí | URL del WSFE. |
| `ARCA_CERT_PATH` | en local | Ruta al `.pem` del certificado. En cloud se setea automáticamente desde `ARCA_CERT_CONTENT`. |
| `ARCA_KEY_PATH` | en local | Ruta al `.pem` de la clave privada. En cloud se setea automáticamente desde `ARCA_KEY_CONTENT`. |
| `ARCA_CERT_CONTENT` | en cloud | Contenido completo del `cert.pem`. Al arrancar, `index.js` lo escribe a `/tmp/arca/cert.pem` y setea `ARCA_CERT_PATH`. |
| `ARCA_KEY_CONTENT` | en cloud | Idem para `key.pem`. |

### `client` (Vercel)

| Variable | Descripción |
|---|---|
| `VITE_API_URL` | URL pública del backend (ej: `https://cerrajeria-vichi-api.onrender.com`). En local no hace falta — el proxy de Vite redirige `/api` al backend local. |

---

## Google Sheets

### Inicializar el Sheet por primera vez

1. Crear un Google Sheet **vacío** en https://sheets.google.com (no subir un `.xlsx` — la API rechaza archivos Office).
2. Crear una Service Account en Google Cloud Console, **habilitar la Google Sheets API** en el proyecto, generar key JSON.
3. Compartir el Sheet con el `client_email` de la SA como **Editor**.
4. Cargar las env vars `SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL` y `GOOGLE_PRIVATE_KEY`.
5. Correr el seed script (desde `server/`):

```bash
node scripts/seed-sheets.mjs
```

El script es **idempotente**: crea las 7 hojas (`Ventas`, `Clientes`, `Productos`, `Servicios`, `Configuración`, `Stock`, `Facturacion_Log`) con sus encabezados, y carga productos/servicios/configuración desde el `.xlsx` local si la hoja destino está vacía.

### Estructura de las hojas

| Hoja | Columnas |
|---|---|
| `Ventas` | ID, Fecha, Hora, Tipo_Servicio, Cliente_Nombre, Cliente_Tel, Materiales, Monto_Cobrado, Modalidad_Pago, Es_Urgencia, Notas, Facturado, Nro_Comprobante, CAE, Vencimiento_CAE, Requiere_Factura, CUIT_Cliente, Tipo_Comprobante, Condicion_IVA |
| `Clientes` | ID, Nombre, Telefono, Direccion, Ultima_Visita, Total_Trabajos |
| `Productos` | Código, Categoría, Marca, Descripción, Costo s/IVA, Costo c/IVA, Margen, Precio venta, Stock inicial, Stock actual, Stock mínimo, Alerta, Uso |
| `Servicios` | ID_Servicio, Nombre, Categoria, Tipo_Cobro, Horas_Estimadas, Costo_MO_Auto, Costo_Materiales, Precio_Base_Auto, Precio_Urgencia_Auto, Incluye_Producto, Notas |
| `Configuración` | Clave, Valor, Tipo, Nota |
| `Stock` | Fecha, Codigo_Producto, Descripcion, Tipo_Movimiento, Cantidad, Stock_Anterior, Stock_Nuevo, ID_Venta, Notas |
| `Facturacion_Log` | Fecha_Ejecucion, Ventas_Procesadas, Exitosas, Fallidas, Detalle_Errores, CAEs_Emitidos |

---

## Endpoints relevantes

| Método | Path | Auth | Para qué |
|---|---|---|---|
| POST | `/api/auth/login` | público | Login con PIN, devuelve JWT |
| GET | `/api/health` | público | Status del server (modo, ambiente) |
| GET/POST | `/api/ventas` | JWT | Listar y registrar ventas |
| GET | `/api/clientes` | JWT | Autocomplete de clientes |
| GET | `/api/catalogo/{productos,servicios,configuracion}` | JWT | Catálogo |
| GET | `/api/dashboard` | JWT | Resumen del día |
| POST | `/api/facturacion/trigger?token=<...>` | **shared secret** | Disparar el bot. Lo usa cron-job.org. |
| POST | `/api/facturacion/ejecutar` | JWT | Dispara el bot manualmente desde la UI. |
| GET | `/api/facturacion/{estado,log,health}` | JWT | Inspección del bot y conexión ARCA |

---

## Cron externo

Render free duerme el servicio tras 15 min sin actividad → el `node-cron` interno del backend no es confiable para correr a una hora fija. Por eso el bot se dispara con un **cron externo**.

### Setup en cron-job.org

1. Cuenta gratis en https://cron-job.org (no pide tarjeta).
2. **Create cronjob** principal:
   - **Title**: `cerrajeria-vichi`
   - **URL**: `https://cerrajeria-vichi-api.onrender.com/api/facturacion/trigger?token=<BOT_TRIGGER_TOKEN>`
   - **Method**: POST
   - **Schedule**: `0 22 * * *` (= 19:00 ARG si la zona del job está en UTC; o `0 22 * * *` con timezone `America/Argentina/Buenos_Aires` si querés 22:00 ARG exactas)
3. (Opcional) **Keepalive** para evitar cold start:
   - URL: `https://cerrajeria-vichi-api.onrender.com/api/health`, método GET
   - Crontab `*/10 21-22 * * *` (cada 10 min durante la hora previa al disparo) — un solo ping aislado **no** alcanza, Render se vuelve a dormir tras 15 min.

---

## Deploy

### Backend en Render

El repo trae `render.yaml` con todo declarado. Para deployar:

1. **Render → Blueprints → New Blueprint Instance**
2. Conectar el repo `cerrajeria-vichi`
3. Cargar las env vars marcadas como `sync: false` (todas las del backend listadas arriba). Las opcionales (ARCA, email) se pueden agregar después sin re-deploy.
4. **Plan**: `free` (declarado en el yaml).
5. Deploy → queda en `https://cerrajeria-vichi-api.onrender.com`.

Cuando se cambien env vars en Render, el servicio se redeploya solo. **El `render.yaml` no se relee automáticamente** — un cambio ahí requiere disparar un nuevo deploy desde la UI o pushear a `main`.

### Frontend en Vercel

1. **Vercel → Add New Project**
2. Importar el repo
3. **Root Directory**: `client` (no la raíz)
4. Framework preset: **Vite** (auto-detect)
5. Env var: `VITE_API_URL` = URL pública del backend
6. Deploy

---

## WhatsApp

El botón "Estoy yendo" abre `wa.me/<numero>` con un mensaje precargado. El normalizador acepta números argentinos en cualquier formato común:

- `11 1234 5678`
- `011 15 1234 5678`
- `+54 9 11 1234-5678`
- `5491112345678`

Y los normaliza a `549 + 10 dígitos` (formato que espera WhatsApp para móviles argentinos).

Para automatización real (mandar mensajes sin intervención manual) habría que pasar a **WhatsApp Cloud API** de Meta. No implementado todavía.

---

## ARCA (facturación electrónica)

> ⚠️ **Producción y Homologación usan portales y AC distintos.** El certificado emitido en uno NO sirve en el otro. Si los mezclás, WSAA tira `Certificado no emitido por AC de confianza`.

### Setup inicial (una vez)

#### 1. Generar par RSA + CSR (localmente con OpenSSL)

```bash
cd server/certs
openssl genrsa -out key.pem 2048
openssl req -new -key key.pem -out cert.csr
```
En el CSR: Country `AR`, Common Name = CUIT sin guiones. El **mismo CSR sirve para producción y homologación** — sólo cambia dónde lo firmás.

#### 2A. Si vas a usar HOMOLOGACIÓN (recomendado para desarrollo / TIF)

El portal es **WSASS - Auto-Servicio de Acceso a WSAA del Ambiente de Homologación**:

1. Ir a **https://wsass-homo.afip.gob.ar/wsass/portal/main.aspx** y loguearse con clave fiscal.
2. Crear nuevo certificado:
   - **Alias**: sólo **letras y números** (sin guiones ni puntos), p. ej. `vichihomo2`.
   - **CSR**: pegar el contenido entero de `cert.csr` (incluyendo `-----BEGIN/END CERTIFICATE REQUEST-----`).
3. WSASS te devuelve el `.crt` firmado. Guardalo como `server/certs/cert.pem` reemplazando lo que hubiera.
4. En el mismo portal, **Crear / Adherir Web Service**:
   - **Tipo de Web Service**: `wsfe`
   - **Computador Fiscal**: el alias del paso 2.
5. Esperá ~5-15 min a que AFIP propague la autorización antes de probar.

> 🕒 **Cert recién generado no es vigente al instante.** WSASS suele setear `validFrom` ~21:00 hs ARG del día de generación. Si lo creás de mañana y querés probar antes de esa hora, WSAA puede rechazarlo con `Computador no autorizado` (mensaje engañoso de AFIP). Verificá `validFrom` con: `node -e "const f=require('node-forge');const fs=require('fs');const c=f.pki.certificateFromPem(fs.readFileSync('./server/certs/cert.pem','utf8'));console.log(c.validity.notBefore.toISOString())"`.

#### 2B. Si vas a usar PRODUCCIÓN

1. Ir a **https://auth.afip.gob.ar/** con clave fiscal **nivel 3**.
2. **Administrador de Relaciones de Clave Fiscal** → adherir servicio **"Administración de Certificados Digitales"**. Cerrar sesión y volver a entrar (los servicios recién adheridos sólo aparecen tras nuevo login).
3. Entrar a **"Administración de Certificados Digitales"** → **Agregar alias** → subir el `cert.csr` → descargar el `.crt` → guardarlo como `cert.pem`.
4. Volver al **Administrador de Relaciones de Clave Fiscal** → **Nueva Relación**:
   - **Servicio** (Web Services): `Facturación Electrónica` (= wsfe).
   - **Representante**: el alias del certificado creado en el paso 3.
5. Habilitar un **Punto de Venta electrónico** en *Comprobantes en línea* o equivalente y anotar su número.

#### 3. Verificar par cert + key

```bash
cd server
node -e "const f=require('node-forge');const fs=require('fs');const c=f.pki.certificateFromPem(fs.readFileSync('./certs/cert.pem','utf8'));const k=f.pki.privateKeyFromPem(fs.readFileSync('./certs/key.pem','utf8'));console.log('CN:',c.subject.getField('CN').value);console.log('Issuer:',c.issuer.getField('CN').value);console.log('Valido desde:',c.validity.notBefore.toISOString());console.log('Match:',c.publicKey.n.toString(16)===f.pki.setRsaPublicKey(k.n,k.e).n.toString(16)?'OK':'FAIL')"
```

El `Issuer` te dice en qué ambiente está firmado:
- `Computadores Test` (o similar) → **homologación**.
- `AC FNMT...` o `Subordinada de AFIP` → **producción**.

### Configuración en local

En `server/.env`:
```
ARCA_CUIT=20XXXXXXXXX
ARCA_PUNTO_VENTA=1
ARCA_ENVIRONMENT=homologacion
ARCA_WSAA_URL=https://wsaahomo.afip.gov.ar/ws/services/LoginCms
ARCA_WSFE_URL=https://wswhomo.afip.gov.ar/wsfev1/service.asmx
ARCA_CERT_PATH=./certs/cert.pem
ARCA_KEY_PATH=./certs/key.pem
```

### Configuración en Render

Los `.pem` no se suben al filesystem de Render. En vez de `ARCA_CERT_PATH` y `ARCA_KEY_PATH`, se cargan **el contenido completo** de cada archivo como env vars `ARCA_CERT_CONTENT` y `ARCA_KEY_CONTENT`. Al arrancar, `server/src/index.js` los escribe a `/tmp/arca/cert.pem` y `/tmp/arca/key.pem`, y setea los `*_PATH` correspondientes en `process.env`. El resto del código (`arca/auth.js`) los lee como archivos normales.

### Producción

Para pasar de homologación a producción:
- Cambiar `ARCA_ENVIRONMENT=produccion`
- Cambiar los `ARCA_*_URL` a los endpoints de producción:
  - `ARCA_WSAA_URL=https://wsaa.afip.gov.ar/ws/services/LoginCms`
  - `ARCA_WSFE_URL=https://servicios1.afip.gov.ar/wsfev1/service.asmx`
- Generar un certificado **de producción** en el portal de producción (paso 2B). El de homologación NO sirve.
- Reemplazar `ARCA_CERT_CONTENT` y `ARCA_KEY_CONTENT` con los de producción.

### Errores típicos de WSAA y cómo se ven

| Mensaje del SOAP Fault | Causa real | Cómo arreglar |
|---|---|---|
| `Certificado no emitido por AC de confianza` | El cert es de un ambiente y los URLs son del otro (lo más típico: cert de producción + URLs de homologación o viceversa) | Regenerar el cert en el portal correcto (WSASS para homo, AFIP normal para prod) |
| `generationTime posee formato o dato inválido (ej: en el futuro o más de 24 horas de antigüedad)` | El reloj del proceso está desfasado, o el código construye mal el `generationTime` (ej: usaba hora UTC con sufijo `-03:00`, que corre 3hs al futuro). Hoy se manda como `...Z` (UTC explícito). | Verificar reloj del sistema. Si el código vuelve a romper esto, ver `server/src/modules/arca/auth.js`. |
| `Computador no autorizado a acceder al servicio` | La relación entre el alias del cert y el servicio `wsfe` no está creada, o está propagándose (5-15 min), o el cert todavía no llegó a su `validFrom` | Verificar autorización en el portal; esperar; chequear `validFrom` |
| `El CEE ya posee un TA valido` | El token cacheado anterior sigue válido (no es un error real, igual no debería romper porque el código reusa el cache) | Reiniciar el server para invalidar el cache en memoria |

### Detalles de implementación

- **Parseo SOAP tolerante a namespaces.** `wsfe.js` y `auth.js` usan `tagNameProcessors: [(name) => name.replace(/^.+:/, '')]` para parsear respuestas que vienen con cualquier prefijo (`soap:`, `soapenv:`, `env:`, etc.). AFIP a veces cambia esto entre versiones.
- **Manejo de SOAP Fault.** Cuando AFIP devuelve 500 con un SOAP Fault, `postSOAP` (en `wsfe.js`) y el try/catch de `auth.js` extraen el `faultstring` y lo lanzan como `Error` legible en vez de `Request failed with status code 500`. Los faults se loguean como `[ARCA SOAP Fault] ...` o `[WSAA SOAP Fault] ...`.
- **Token cacheado en memoria.** `auth.js` mantiene un cache del TA con margen de 5 min antes de la expiración. Reiniciar el server invalida el cache.

---

## Limitaciones conocidas

- **Cold start de Render free**: ~30 s la primera request tras inactividad. El cron externo lo despierta al disparar, pero hay un retraso. Mitigable con keepalives o pasando a plan pago.
- **Resend free + sender genérico**: con `onboarding@resend.dev` solo se puede mandar al email de signup de la cuenta. Para mandar a cualquier destinatario hay que verificar un dominio propio en Resend.
- **Concurrencia en Sheets**: la API no es transaccional. Dos requests escribiendo a la vez pueden pisarse. Para el volumen de una cerrajería no es problema.
- **`agregarFila` hace 2 calls a Sheets API** (get + update) en vez de `append+INSERT_ROWS`. Compatibilidad con Sheets convertidos desde XLSX.
- **PIN único**: no hay roles ni usuarios. Una sola persona se loguea con un PIN compartido.
- **Reintentos de facturación**: si una venta queda en `Facturado=ERROR`, el bot no la reintenta en el siguiente run. Hay que reactivarla manualmente cambiando la celda a `PENDIENTE`.

---

## Scripts útiles

```bash
# server/
node scripts/seed-sheets.mjs   # Inicializa el Sheet desde el Excel local
npm run dev                    # nodemon + dotenv
```

```bash
# client/
npm run dev      # Vite dev server
npm run build    # Build de producción
npm run lint     # ESLint
```

---

## Estado actual de la facturación — actualizado 2026-05-24

> Esta sección documenta el estado final tras dos sesiones de trabajo (23/5 y 24/5 de 2026). **La facturación electrónica está funcionando de punta a punta en homologación.**

### Hito principal

🎯 **Primer CAE emitido y guardado correctamente** el 24/5/2026 a las 11:45 ARG:

```
🤖 [Bot] Iniciando facturación - 24/5/2026, 11:45:17
[Bot] Procesando 1 venta(s) pendiente(s)...
[Bot] Facturando venta ID=V1779633901694, Monto=$1800, Cliente=MARIANO ERBINO
[ARCA Auth] Reutilizando token cacheado
[ARCA Auth] Reutilizando token cacheado
  ✅ CAE obtenido: 86210207056562 | Comprobante: 00001-00000002
[Email] Resumen enviado a merbino@uade.edu.ar — id=913f3c3d-b273-4e50-9107-5332d587be9d
🤖 [Bot] Facturación finalizada en 3s
   Procesadas: 1 | Exitosas: 1 | Fallidas: 0
```

El comprobante quedó registrado en la hoja `Ventas` con su CAE, número, vencimiento; en `Facturacion_Log` quedó el run; y llegó el email a `merbino@uade.edu.ar`.

### Lo que ya funciona ✅

| Capa | Estado | Evidencia |
|---|---|---|
| WSAA homologación (autenticación) | OK | TA persistido en `server/data/arca-ta.json`, reusado entre reinicios. Logs muestran `Reutilizando token cacheado`. |
| Certificado de homologación | Cargado y vigente | `server/certs/cert.pem` firmado por `Computadores Test` (AC de homologación). Vigente desde 23/05/2026 21:02 ARG hasta 23/05/2028. Par cert+key verificado. |
| Alias en WSASS | `cerrajeriavichihomo2` | Adherido al servicio `wsfe` (matchea el CN del cert). Hay una autorización vieja huérfana a `cerrajeriavichihomov2` que conviene borrar cuando haya tiempo, pero no molesta. |
| Variables `.env` ARCA | Cargadas | `ARCA_CUIT=20215627935`, `ARCA_PUNTO_VENTA=4`, URLs de homologación, paths a `./certs/cert.pem` y `./certs/key.pem`. |
| Email Resend | Funcionando | Los resúmenes llegan a `merbino@uade.edu.ar`. |
| UI Facturación | OK | Botones "Verificar conexión", "Facturar ahora (manual)", pendientes y historial — todos pintando datos reales. |
| Schema FECAESolicitar | Completo y actualizado RG 5616 (2024) | `CondicionIVAReceptorId` + fechas de servicio cuando Concepto=2/3 + orden de tags correcto. |
| Persistencia del TA | OK | `server/data/arca-ta.json` guarda y carga el token. Reinicios del server ya no rompen nada. |
| Ciclo del TA automático | OK | Cuando el TA actual venza (cada ~12 hs), el server va a pedir uno nuevo solo y lo persiste. No hay intervención manual recurrente. |

### Lo que queda pendiente

#### 1. Validar el cambio de punto de venta a `00004` (sesión 24/5 en curso)

El PV original fue `00001` (con el que se emitió el primer CAE), pero el usuario ya usa ese PV para otra cosa. **Se cambió `ARCA_PUNTO_VENTA=4` en el `.env`** y queda probar que AFIP lo acepte.

Hay dos escenarios:
- **A**: PV 4 ya está habilitado en homologación → emite CAE sin problema en el siguiente intento.
- **B**: PV 4 no está dado de alta → AFIP rebota con `Punto de venta no autorizado` (o similar). Hay que crearlo en el portal **"Administración de Puntos de Venta y Domicilios"** de homologación.

Plan: registrar una venta de prueba nueva, tocar "Facturar ahora", ver qué pasa. Si rebota, dar de alta el PV 4 en el portal.

#### 2. Deploy a Render + Vercel + cron-job.org

Para que la facturación corra todos los días a las 22:00 sin depender de tener la PowerShell local prendida:

1. **Render**: usar el `render.yaml` del repo (Blueprint). Cargar las env vars marcadas `sync: false`. Para `ARCA_CERT_CONTENT` y `ARCA_KEY_CONTENT`, copiar el contenido literal de los `.pem`. Tener en cuenta que en Render el filesystem es efímero — el `arca-ta.json` se va a perder en cada cold start o redeploy, lo que reproduce el problema de "TA huérfano". Mitigación: persistir el TA en Google Sheets en lugar de disco (pendiente), o aceptar que cada redeploy obliga a esperar ~12 hs.
2. **Vercel**: importar el repo con root `client`, env var `VITE_API_URL` apuntando al backend de Render.
3. **cron-job.org**: cuenta gratis → cronjob diario a `POST https://cerrajeria-vichi-api.onrender.com/api/facturacion/trigger?token=<BOT_TRIGGER_TOKEN>` a las 22:00 ARG.

#### 3. Optimizaciones futuras (no bloqueantes)

- Migrar la persistencia del TA a Google Sheets para que sobreviva los redeploys de Render.
- Borrar la autorización huérfana `cerrajeriavichihomov2` en WSASS.
- Implementar reintento automático de ventas en estado `ERROR` en el siguiente run del bot.

### Cambios al código hechos en sesiones 2026-05-23 y 2026-05-24

Todos los cambios en `server/src/modules/arca/`:

1. **`wsfe.js` — parsing tolerante a namespaces y manejo de SOAP Faults.** Constante `PARSE_OPTS` con `tagNameProcessors` que strippea el prefijo (`soap:`, `soapenv:`, `env:`, etc.) de cada tag. Helper `postSOAP` que parsea SOAP Faults cuando AFIP devuelve HTTP 500. Las 3 llamadas directas a `axios.post` (`obtenerUltimoComprobante`, `solicitarCAE`, `verificarConexionWSFE`) usan `postSOAP`.

2. **`auth.js` — mismo parsing tolerante a namespaces** y try/catch alrededor del `axios.post` al WSAA para extraer faults legibles. Sin esto, los errores reales (`Certificado no emitido por AC de confianza`, `Computador no autorizado`, etc.) quedaban ocultos detrás de un genérico `Request failed with status code 500`.

3. **`auth.js` — bug del `generationTime`.** El código construía `ahora.toISOString().replace(/\.\d{3}Z$/, '-03:00')`, lo que corre la hora 3hs al futuro (porque `toISOString()` devuelve UTC y luego pega offset `-03:00` como si fuera hora local). Cambiado a sufijo `Z` (UTC explícito), que AFIP acepta.

4. **`auth.js` — persistencia del TA en disco.** Antes el TA estaba sólo en memoria. Cualquier reinicio del proceso lo perdía y forzaba a pedir uno nuevo a AFIP — que rechaza con `El CEE ya posee un TA valido` si el anterior sigue vigente. Ahora se guarda en `server/data/arca-ta.json` y se levanta de ahí al arrancar el proceso.

5. **`wsfe.js` — schema FECAESolicitar actualizado a RG 5616 (2024).** Agregado tag obligatorio `<CondicionIVAReceptorId>` (toma el ID mapeado de la venta: CF=5, RI=1, MT=6, etc.). Agregadas fechas de servicio `<FchServDesde>/<FchServHasta>/<FchVtoPago>` cuando `Concepto != 1` (Servicios o mixto) — todas con la fecha del comprobante (pago contado). Orden de tags corregido: `ImpTrib` ahora va **antes** de `ImpIVA` (orden del WSDL oficial).

Sin estos fixes la app no podía facturar en ningún ambiente.

### Operación local en uso normal

Para uso local (sin deploy), el proceso es:

- **Server**: tiene que estar corriendo (`npm run dev` en `server/`). Si la PowerShell se cierra, no factura. El cron interno corre a las 22:00 ARG todos los días automáticamente mientras el proceso esté vivo.
- **Client**: sólo necesario para usar la UI (registrar ventas, ver estado). El bot no lo necesita para funcionar.
- **Token**: se renueva solo cada ~12 hs gracias a la persistencia en disco. No requiere intervención.

| Acción | Necesita server | Necesita client |
|---|---|---|
| Cron diario a las 22:00 facturando solo | ✅ | ❌ |
| Cron-job.org disparando el trigger | ✅ | ❌ |
| Tocar "Facturar ahora" en la app | ✅ | ✅ |
| Registrar una venta nueva desde la UI | ✅ | ✅ |
| Ver el log o pendientes en la UI | ✅ | ✅ |

Para uso "siempre encendido" sin depender de tener la PowerShell abierta, hay tres opciones: PM2, servicio de Windows con `nssm`/`node-windows`, o deploy a Render (la opción más limpia).
