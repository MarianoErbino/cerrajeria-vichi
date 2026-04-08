// Cliente HTTP centralizado para comunicación con el backend
import { getTokenActual } from '../context/AuthContext';

// En producción usa VITE_API_URL; en local usa el proxy de Vite (/api → localhost:3001)
const BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

/**
 * Wrapper de fetch con manejo de auth y errores.
 */
async function request(path, options = {}) {
  const token = getTokenActual();

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const respuesta = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  // Si el servidor devuelve 401, redirigir al login
  if (respuesta.status === 401) {
    window.location.href = '/login';
    return;
  }

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || `Error ${respuesta.status}`);
  }

  return data;
}

// Auth
export const api = {
  auth: {
    login: (pin) => request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),
    verify: (token) => request('/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
  },

  dashboard: {
    obtener: () => request('/dashboard'),
  },

  ventas: {
    listar: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/ventas${qs ? '?' + qs : ''}`);
    },
    ultimas: (cantidad = 5) => request(`/ventas/ultimas?cantidad=${cantidad}`),
    registrar: (datos) => request('/ventas', {
      method: 'POST',
      body: JSON.stringify(datos),
    }),
  },

  clientes: {
    buscar: (texto) => request(`/clientes?buscar=${encodeURIComponent(texto)}`),
    listar: () => request('/clientes'),
  },

  catalogo: {
    productos: (buscar = '') => request(`/catalogo/productos${buscar ? '?buscar=' + encodeURIComponent(buscar) : ''}`),
    servicios: () => request('/catalogo/servicios'),
    configuracion: () => request('/catalogo/configuracion'),
  },

  facturacion: {
    estado: () => request('/facturacion/estado'),
    ejecutar: () => request('/facturacion/ejecutar', { method: 'POST' }),
    log: (limite = 20) => request(`/facturacion/log?limite=${limite}`),
    healthARCA: () => request('/facturacion/health'),
  },
};
