import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.js';
import ventasRoutes from './routes/ventas.js';
import clientesRoutes from './routes/clientes.js';
import catalogoRoutes from './routes/catalogo.js';
import facturacionRoutes from './routes/facturacion.js';
import dashboardRoutes from './routes/dashboard.js';
import { iniciarBotFacturacion } from './modules/bot/scheduler.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Rate limiting para endpoints de auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
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
    environment: process.env.ARCA_ENVIRONMENT || 'no configurado'
  });
});

// Manejo global de errores
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message, err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Error interno del servidor'
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
  console.log(`🌍 Ambiente ARCA: ${process.env.ARCA_ENVIRONMENT || 'no configurado'}`);

  // Iniciar el bot de facturación automática
  iniciarBotFacturacion();
});

export default app;
