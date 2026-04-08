import { createContext, useContext, useState } from 'react';
import { api } from '../services/api';

const AuthContext = createContext(null);

// El token vive solo en memoria (no se persiste).
// Cada vez que se abre o recarga la app, se requiere PIN.
let tokenEnMemoria = null;

export function AuthProvider({ children }) {
  const [autenticado, setAutenticado] = useState(false);

  const login = async (pin) => {
    const respuesta = await api.auth.login(pin);
    tokenEnMemoria = respuesta.token;
    setAutenticado(true);
    return respuesta;
  };

  const logout = () => {
    tokenEnMemoria = null;
    setAutenticado(false);
  };

  // Exponer función para que api.js pueda leer el token
  const getToken = () => tokenEnMemoria;

  return (
    <AuthContext.Provider value={{ autenticado, cargando: false, login, logout, getToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// Exportar getter para usarlo en api.js sin depender del contexto
export function getTokenActual() {
  return tokenEnMemoria;
}
