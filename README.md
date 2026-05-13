# Cerrajería Vichi

App de gestión para la cerrajería de Vichi: registro de ventas, autocomplete de clientes, catálogo de productos/servicios, dashboard diario, integración con WhatsApp para avisar al cliente "ya estoy yendo", y facturación electrónica vía ARCA (ex-AFIP).

La base de datos vive en una hoja de **Google Sheets** — Vichi puede ver y editar las ventas desde el celular sin abrir la app.

---

## En producción

| Capa | URL | Plataforma |
|---|---|---|
| Frontend | https://cerrajeria-vichi.vercel.app | Vercel (free) |
| Backend  | https://cerrajeria-vichi-api.onrender.com | Render (free) |
| Datos    | Google Sheet "Dataset_Cerrajeria" | Google Sheets API |

> **Cold start**: el plan free de Render duerme el servicio tras 15 min sin uso. La primera request después puede tardar ~30 s.

---

## Stack

- **Frontend**: React 19 + Vite + TailwindCSS, deploy en Vercel
- **Backend**: Node.js + Express, deploy en Render (Blueprint con `render.yaml`)
- **Auth**: JWT en memoria del cliente (no persiste — pide PIN al recargar)
- **Datos**: Google Sheets API (Service Account)
- **Facturación**: ARCA WSFE (homologación) — opcional, ver §ARCA
- **Bot de facturación**: `node-cron` corre 22hs ARG y manda al CAE las ventas pendientes

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
│   │   ├── index.js              # Bootstrap + CORS + rutas
│   │   ├── routes/               # auth, ventas, clientes, catalogo, facturacion, dashboard
│   │   ├── middleware/auth.js    # JWT
│   │   └── modules/
│   │       ├── sheets/           # Cliente y operaciones sobre Google Sheets
│   │       ├── local/            # Adaptador para correr sin Sheets (lee/escribe el .xlsx)
│   │       ├── arca/             # Cliente WSAA + WSFE
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

- **Modo Google Sheets** (recomendado, lo que está en producción): se activa cuando `SPREADSHEET_ID` está seteado en `.env`. Lee y escribe ventas/clientes/productos/servicios directamente sobre la hoja.
- **Modo Local**: si `SPREADSHEET_ID` no está seteado, lee y escribe directamente sobre el archivo `.xlsx` configurado en `EXCEL_PATH`. Útil para desarrollo offline. **No funciona en Render** (filesystem efímero).

El cambio entre modos es automático según las env vars.

---

## Setup local

Detalle paso a paso (ARCA, Service Account, deploy) en [SETUP.md](./SETUP.md). Resumen:

```bash
# Instalar dependencias
npm run install:all

# Backend (en server/)
cp .env.example .env   # editar con tus valores (ver §Variables de entorno)
npm run dev             # corre en http://localhost:3010

# Frontend (en client/)
npm run dev             # corre en http://localhost:5173, hace proxy a :3010
```

Login: PIN `1234` (configurable con `OWNER_PIN`).

---

## Variables de entorno

### `server/.env`

| Variable | Requerida | Descripción |
|---|---|---|
| `PORT` | no | Puerto del backend (default 3001). En Render se setea automático. |
| `OWNER_PIN` | sí | PIN de acceso a la app (4 dígitos, simple). |
| `JWT_SECRET` | sí | Secret para firmar JWTs. Generar con `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`. |
| `CLIENT_URL` | no | URL del frontend para CORS estricto. En su ausencia, el regex acepta cualquier `*.vercel.app` y `localhost`. |
| `SPREADSHEET_ID` | sí (modo Sheets) | ID del Google Sheet (de la URL: `/d/<ID>/edit`). |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | sí (modo Sheets) | `client_email` del JSON de la Service Account. |
| `GOOGLE_PRIVATE_KEY` | sí (modo Sheets) | `private_key` del JSON (con `\n` literales). |
| `EXCEL_PATH` | no (modo Local) | Ruta absoluta al `.xlsx` de respaldo/desarrollo. |
| `ARCA_CUIT` | sí (si ARCA) | CUIT del contribuyente sin guiones. |
| `ARCA_PUNTO_VENTA` | sí (si ARCA) | Número de punto de venta habilitado en ARCA. |
| `ARCA_CERT_PATH` | sí (si ARCA) | Path al certificado `.pem`. |
| `ARCA_KEY_PATH` | sí (si ARCA) | Path a la clave privada `.pem`. |
| `ARCA_WSAA_URL` | sí (si ARCA) | URL del WSAA (homologación o producción). |
| `ARCA_WSFE_URL` | sí (si ARCA) | URL del WSFE. |
| `ARCA_ENVIRONMENT` | sí (si ARCA) | `homologacion` o `produccion`. |
| `BOT_TIMEZONE` | no | TZ del cron del bot. Default `America/Argentina/Buenos_Aires`. |

### `client` (Vercel)

| Variable | Descripción |
|---|---|
| `VITE_API_URL` | URL pública del backend (ej: `https://cerrajeria-vichi-api.onrender.com`). En local no hace falta — el proxy de Vite redirige `/api` al backend local. |

---

## Google Sheets

### Inicializar el Sheet por primera vez

1. Crear un Google Sheet **vacío** en https://sheets.google.com (no subir un .xlsx — la API no soporta archivos Office).
2. Crear una Service Account en Google Cloud Console, habilitar la **Google Sheets API**, generar key JSON.
3. Compartir el Sheet con el `client_email` de la SA como **Editor**.
4. Cargar las env vars `SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL` y `GOOGLE_PRIVATE_KEY`.
5. Correr el seed script (desde `server/`):

```bash
node scripts/seed-sheets.mjs
```

El script es **idempotente**: crea las 7 hojas (`Ventas`, `Clientes`, `Productos`, `Servicios`, `Configuración`, `Stock`, `Facturacion_Log`) con sus encabezados, y carga productos/servicios/configuración iniciales desde el `.xlsx` local si éste está disponible y la hoja destino está vacía.

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

## Deploy

### Backend en Render

El repo trae `render.yaml` con todo declarado. Para deployar:

1. **Render → Blueprints → New Blueprint Instance**
2. Conectar el repo `cerrajeria-vichi`
3. Cargar las env vars marcadas como `sync: false` desde la UI (`OWNER_PIN`, `JWT_SECRET`, `GOOGLE_*`, `SPREADSHEET_ID`, etc.)
4. Deploy

El servicio queda en `https://cerrajeria-vichi-api.onrender.com`.

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

Y los normaliza a `549 + 10 dígitos` que es lo que espera WhatsApp para números móviles argentinos.

Para automatización real (mandar mensajes sin intervención manual) habría que pasar a **WhatsApp Cloud API** de Meta. No implementado todavía.

---

## ARCA (facturación electrónica)

Configuración pendiente. Cuando se quiera activar:

1. Generar certificado y clave RSA en `server/certs/` (ver §2 de [SETUP.md](./SETUP.md))
2. Habilitar el WS WSFE en ARCA y obtener el certificado firmado
3. Cargar `ARCA_*` en `.env`
4. En producción (Render), guardar el contenido de los `.pem` como env vars y leerlos al boot — los archivos no persisten entre deploys

El bot a las 22hs ARG procesa las ventas con `Facturado=PENDIENTE` y les pide CAE. Si ARCA no está configurado, el bot se programa pero falla al ejecutar (no rompe el server).

---

## Limitaciones conocidas

- **Cold start de Render free**: ~30 s la primera request tras inactividad. El bot a las 22 hs no corre si el servicio está dormido (necesita ping de keepalive o pasar a plan pago).
- **Concurrencia en Sheets**: la API de Sheets no es transaccional. Si dos requests escriben a la vez, puede haber pisadas. Para el volumen de una cerrajería no es problema.
- **`agregarFila` hace 2 calls a Sheets API** (get + update) en vez de `append+INSERT_ROWS`. Esto es para compatibilidad con Sheets convertidos desde XLSX, donde `INSERT_ROWS` no está soportado.
- **PIN único**: no hay roles ni usuarios. Una sola persona se loguea con un PIN compartido.

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
