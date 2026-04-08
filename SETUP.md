# Setup - Cerrajería Vichi

Guía paso a paso para configurar y correr el proyecto.

---

## 1. Crear la Service Account de Google y configurar Sheets

### 1.1 Crear el proyecto en Google Cloud Console

1. Ir a [console.cloud.google.com](https://console.cloud.google.com)
2. Crear un nuevo proyecto (ej: "cerrajeria-vichi")
3. En el menú izquierdo → **APIs & Services** → **Library**
4. Buscar y habilitar: **Google Sheets API**

### 1.2 Crear la Service Account

1. **APIs & Services** → **Credentials** → **Create Credentials** → **Service Account**
2. Nombre: `cerrajeria-vichi-sa` → **Create and Continue** → **Done**
3. Click en la service account creada → pestaña **Keys**
4. **Add Key** → **Create new key** → **JSON** → Descargar el archivo

### 1.3 Extraer las credenciales del JSON descargado

Abrí el archivo JSON descargado. Vas a encontrar:
- `client_email` → copialo en `GOOGLE_SERVICE_ACCOUNT_EMAIL` en el `.env`
- `private_key` → copialo en `GOOGLE_PRIVATE_KEY` en el `.env` (incluyendo los `\n`)

### 1.4 Crear el Google Spreadsheet

1. Ir a [sheets.google.com](https://sheets.google.com) → crear una hoja nueva
2. Nombrarla: "Cerrajería Vichi - Base de datos"
3. Copiar el ID del Spreadsheet desde la URL:
   `https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit`
4. Pegarlo en `SPREADSHEET_ID` en el `.env`

### 1.5 Compartir el Sheet con la Service Account

1. En el Spreadsheet → botón **Compartir**
2. Pegar el `client_email` de la Service Account
3. Darle permiso de **Editor**

### 1.6 Crear las hojas (tabs) del Spreadsheet

Crear estas 5 hojas con sus respectivos encabezados (fila 1):

**Ventas:**
```
ID | Fecha | Hora | Tipo_Servicio | Cliente_Nombre | Cliente_Tel | Materiales | Monto_Cobrado | Modalidad_Pago | Es_Urgencia | Notas | Facturado | Nro_Comprobante | CAE | Vencimiento_CAE | Requiere_Factura | CUIT_Cliente | Tipo_Comprobante | Condicion_IVA
```

**Clientes:**
```
ID | Nombre | Telefono | Direccion | Ultima_Visita | Total_Trabajos
```

**Productos:**
```
Codigo | Categoria | Marca | Descripcion | Costo_sin_IVA | Costo_con_IVA | Margen | Precio_Venta | Stock_Actual | Stock_Minimo
```

**Servicios:**
```
ID_Servicio | Nombre | Categoria | Tipo_Cobro | Precio_Base | Precio_Urgencia
```

**Facturacion_Log:**
```
Fecha_Ejecucion | Ventas_Procesadas | Exitosas | Fallidas | Detalle_Errores | CAEs_Emitidos
```

### 1.7 Cargar servicios de ejemplo

En la hoja **Servicios**, agregar algunas filas de ejemplo:
```
S001 | Apertura de puerta | Apertura | Fijo | 5000 | 6500
S002 | Cambio de cerradura | Cerraduras | Fijo | 8000 | 10400
S003 | Duplicado de llave | Llaves | Fijo | 1500 | 1950
S004 | Instalación de cerrojo | Cerrojos | Fijo | 6000 | 7800
S005 | Reparación de cerradura | Cerraduras | Variable | 4000 | 5200
```

---

## 2. Generar el certificado digital para ARCA

**Importante:** Esto requiere tener acceso al portal de ARCA (ex-AFIP) con clave fiscal.

### 2.1 Generar el par de claves RSA

En la carpeta `server/certs/`, ejecutar:

```bash
# Generar clave privada
openssl genrsa -out key.pem 2048

# Generar solicitud de certificado (CSR)
openssl req -new -key key.pem -out cert.csr
# Completar: Country=AR, Organization=nombre del negocio, Common Name=CUIT sin guiones
```

### 2.2 Obtener el certificado en ARCA

1. Ingresar a [afip.gob.ar](https://www.afip.gob.ar) con clave fiscal (nivel 3)
2. Ir a: **Administrador de Relaciones de Clave Fiscal**
3. Buscar el servicio: **WSFE - Facturación electrónica**
4. En la sección de certificados → **Agregar Certificado Digital**
5. Pegar el contenido del archivo `cert.csr`
6. Descargar el certificado `.crt` → renombrarlo a `cert.pem`
7. Colocar `cert.pem` y `key.pem` en la carpeta `server/certs/`

### 2.3 Habilitar el punto de venta en ARCA

1. En ARCA → **Comprobantes en línea** (o web service)
2. Crear/verificar el punto de venta para facturación electrónica
3. Anotar el número de punto de venta → `ARCA_PUNTO_VENTA` en el `.env`

### 2.4 Configurar ambiente de homologación (pruebas)

Para pruebas, usar los endpoints de homologación (ya configurados en `.env.example`):
```
ARCA_WSAA_URL=https://wsaahomo.afip.gov.ar/ws/services/LoginCms
ARCA_WSFE_URL=https://wswhomo.afip.gov.ar/wsfev1/service.asmx
ARCA_ENVIRONMENT=homologacion
```

En homologación el CUIT puede ser cualquier CUIT válido de prueba.

---

## 3. Correr el proyecto localmente

### 3.1 Configurar las variables de entorno

```bash
cd server
cp .env.example .env
# Editar .env con tus valores reales
```

### 3.2 Instalar dependencias

```bash
# Desde la raíz del proyecto
npm run install:all
```

### 3.3 Correr el servidor (backend)

```bash
cd server
npm run dev
# Corre en http://localhost:3001
```

### 3.4 Correr el cliente (frontend)

```bash
cd client
npm run dev
# Abre http://localhost:5173
```

### 3.5 Verificar que todo funciona

1. Abrir `http://localhost:5173` → debería aparecer la pantalla de login
2. Ingresar PIN: `1234` (o el que configuraste en `.env`)
3. Verificar que el dashboard carga sin errores
4. Ir a **Facturación** → **Verificar conexión con ARCA**

---

## 4. Deploy en Vercel (Frontend) + Render (Backend)

### 4.1 Deploy del Backend en Render

1. Crear cuenta en [render.com](https://render.com)
2. **New** → **Web Service** → conectar el repositorio de GitHub
3. Configuración:
   - **Root Directory:** `server`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node src/index.js`
4. En **Environment Variables**, agregar todas las variables del `.env`
5. Para el certificado ARCA: usar `ARCA_CERT_CONTENT` y `ARCA_KEY_CONTENT` con el contenido del archivo, y adaptar `auth.js` para leer desde variable de entorno en lugar de archivo

### 4.2 Deploy del Frontend en Vercel

1. Crear cuenta en [vercel.com](https://vercel.com)
2. **New Project** → importar repositorio → seleccionar carpeta `client`
3. Configuración:
   - **Framework Preset:** Vite
   - **Root Directory:** `client`
4. Agregar variable de entorno:
   - `VITE_API_URL`: URL del backend en Render (ej: `https://cerrajeria-vichi.onrender.com`)
5. Actualizar `client/src/services/api.js`: cambiar `BASE_URL` a usar `import.meta.env.VITE_API_URL`
6. En Render, actualizar `CLIENT_URL` con la URL de Vercel

### 4.3 Configurar CORS en producción

En `server/src/index.js`, asegurarse que `CLIENT_URL` apunta a la URL de Vercel.

### 4.4 Certificados ARCA en producción

Los archivos `.pem` no pueden subirse a Render como archivos. Opciones:
1. Guardar el contenido de los `.pem` como variables de entorno y crear los archivos al inicio del servidor
2. Usar Render Disks (almacenamiento persistente)

Modificar `server/src/modules/arca/auth.js` para soportar esto:
```js
// Si existe la variable de entorno con el contenido, escribir el archivo
if (process.env.ARCA_CERT_CONTENT && !existsSync('./certs/cert.pem')) {
  writeFileSync('./certs/cert.pem', process.env.ARCA_CERT_CONTENT);
  writeFileSync('./certs/key.pem', process.env.ARCA_KEY_CONTENT);
}
```

---

## Estructura del proyecto

```
App Cerrajeria/
├── client/              # React + Vite + TailwindCSS
│   ├── src/
│   │   ├── pages/       # Pantallas de la app
│   │   ├── components/  # Componentes reutilizables
│   │   ├── context/     # AuthContext, ToastContext
│   │   └── services/    # Cliente API (api.js)
│   └── package.json
│
├── server/              # Node.js + Express
│   ├── src/
│   │   ├── routes/      # Endpoints de la API
│   │   ├── middleware/  # Auth JWT
│   │   └── modules/
│   │       ├── sheets/  # Conexión con Google Sheets
│   │       ├── arca/    # Conexión con ARCA WSFE
│   │       └── bot/     # Bot de facturación automática
│   ├── certs/           # Certificados ARCA (no subir a git)
│   └── .env             # Variables de entorno (no subir a git)
│
└── SETUP.md             # Esta guía
```

---

## Notas importantes

- **Seguridad:** Nunca subir `.env` ni los archivos `.pem` al repositorio
- **Homologación:** Siempre probar en ambiente de homologación antes de pasar a producción
- **Backup:** El Google Sheet es la base de datos; hacer backup periódico descargando el Sheet
- **Timezone:** El bot corre a las 22:00hs Argentina (America/Argentina/Buenos_Aires = UTC-3)
- **Token ARCA:** El token de autenticación dura 12 horas y se renueva automáticamente
