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

### Setup inicial (una vez)

1. Generar localmente con OpenSSL:
   ```bash
   openssl genrsa -out key.pem 2048
   openssl req -new -key key.pem -out cert.csr
   ```
   En el CSR: Country `AR`, Common Name = CUIT sin guiones.
2. En el portal de AFIP con clave fiscal nivel 3:
   - **Administrador de Relaciones de Clave Fiscal**
   - Habilitar el servicio **WSFE - Facturación electrónica**
   - Sección "Certificados" → **Agregar Certificado Digital** → pegar el contenido de `cert.csr`
   - Bajar el `.crt` firmado y renombrarlo a `cert.pem`.
3. Habilitar un **Punto de Venta electrónico** y anotar su número.

### Configuración en local

En `server/.env`:
```
ARCA_CUIT=20XXXXXXXXX
ARCA_PUNTO_VENTA=3
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
- Cambiar los `ARCA_*_URL` a los endpoints de producción
- Generar un certificado de producción en AFIP (es distinto al de homologación)
- Reemplazar `ARCA_CERT_CONTENT` y `ARCA_KEY_CONTENT` con los de producción

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
