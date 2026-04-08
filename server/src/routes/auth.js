import { Router } from 'express';
import jwt from 'jsonwebtoken';

const router = Router();

/**
 * POST /api/auth/login
 * Recibe { pin } y devuelve un JWT si el PIN es correcto.
 */
router.post('/login', (req, res) => {
  const { pin } = req.body;

  if (!pin) {
    return res.status(400).json({ error: 'PIN requerido' });
  }

  // Comparar contra el PIN en .env (como string, sin timing attack relevante aquí)
  if (String(pin) !== String(process.env.OWNER_PIN)) {
    return res.status(401).json({ error: 'PIN incorrecto' });
  }

  const token = jwt.sign(
    { rol: 'owner', negocio: 'cerrajeria_vichi' },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({
    token,
    expiresIn: 8 * 60 * 60, // segundos
    mensaje: 'Bienvenido, Vichi!'
  });
});

/**
 * POST /api/auth/verify
 * Verifica si un token es válido. Útil para el frontend al recargar.
 */
router.post('/verify', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ valido: false });

  try {
    jwt.verify(token, process.env.JWT_SECRET);
    res.json({ valido: true });
  } catch {
    res.json({ valido: false });
  }
});

export default router;
