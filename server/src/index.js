import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import authRoutes from './routes/auth.js';
import ventasRoutes from './routes/ventas.js';
import clientesRoutes from './routes/clientes.js';
import catalogoRoutes from './routes/catalogo.js';
import facturacionRoutes from './routes/facturacion.js';
import dashboardRoutes from './routes/dashboard.js';
import { iniciarBotFacturacion } from './modules/bot/scheduler.js';

// Materializar certificados de ARCA si vienen como contenido en env vars
// (uso en Render, donde no se pueden subir archivos al filesystem). Los
// archivos quedan en /tmp/arca durante la vida del proceso.
if (process.env.ARCA_CERT_CONTENT && process.env.ARCA_KEY_CONTENT) {
  const dir = '/tmp/arca';
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const certPath = `${dir}/cert.pem`;
  const keyPath = `${dir}/key.pem`;
  writeFileSync(certPath, process.env.ARCA_CERT_CONTENT);
  writeFileSync(keyPath, process.env.ARCA_KEY_CONTENT);
  process.env.ARCA_CERT_PATH = certPath;
  process.env.ARCA_KEY_PATH = keyPath;
  console.log('🔐 ARCA: certificados materializados desde env vars');
}

const app = express();
const PORT = process.env.PORT || 3001;

// CORS: acepta el dominio de Vercel y localhost
const origenesPermitidos = [
  'http://localhost:5173',
  'http://localhost:4173',
];
if (process.env.CLIENT_URL) origenesPermitidos.push(process.env.CLIENT_URL);
// Aceptar cualquier subdominio de vercel.app automáticamente
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // requests sin origin (curl, Render health checks)
    const permitido =
      origenesPermitidos.includes(origin) ||
      /\.vercel\.app$/.test(origin) ||
      /^http:\/\/localhost/.test(origin);
    callback(null, permitido);
  },
  credentials: true,
}));
app.use(express.json());

// Rate limiting para auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos. Esperá 15 minutos.' },
});

// Rutas
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/catalogo', catalogoRoutes);
app.use('/api/facturacion', facturacionRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    modo: process.env.SPREADSHEET_ID ? 'google-sheets' : 'local',
    environment: process.env.ARCA_ENVIRONMENT || 'no configurado',
  });
});

// Manejo global de errores
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Error interno del servidor'
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en puerto ${PORT}`);
  console.log(`📊 Modo: ${process.env.SPREADSHEET_ID ? 'Google Sheets' : 'Local (Excel)'}`);
  console.log(`🌍 ARCA: ${process.env.ARCA_ENVIRONMENT || 'no configurado'}`);
  iniciarBotFacturacion();
});

export default app;
