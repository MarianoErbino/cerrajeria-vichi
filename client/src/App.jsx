import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import BottomNav from './components/layout/BottomNav';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import RegistrarVenta from './pages/RegistrarVenta';
import YendoDomicilio from './pages/YendoDomicilio';
import Historial from './pages/Historial';
import Facturacion from './pages/Facturacion';

// Rutas protegidas: redirige a /login si no está autenticado
function RutaProtegida({ children, conNav = true }) {
  const { autenticado, cargando } = useAuth();

  if (cargando) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-[#1a1917]">
        <div className="w-8 h-8 border-2 border-[#185FA5] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!autenticado) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      {children}
      {conNav && <BottomNav />}
    </>
  );
}

function AppRoutes() {
  const { autenticado } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={autenticado ? <Navigate to="/dashboard" replace /> : <Login />}
      />

      <Route
        path="/dashboard"
        element={
          <RutaProtegida>
            <Dashboard />
          </RutaProtegida>
        }
      />

      <Route
        path="/registrar"
        element={
          <RutaProtegida conNav={false}>
            <RegistrarVenta />
          </RutaProtegida>
        }
      />

      <Route
        path="/yendo"
        element={
          <RutaProtegida conNav={false}>
            <YendoDomicilio />
          </RutaProtegida>
        }
      />

      <Route
        path="/historial"
        element={
          <RutaProtegida>
            <Historial />
          </RutaProtegida>
        }
      />

      <Route
        path="/facturacion"
        element={
          <RutaProtegida>
            <Facturacion />
          </RutaProtegida>
        }
      />

      {/* Redirigir raíz */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
