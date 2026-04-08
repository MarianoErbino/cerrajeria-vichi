import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const mostrar = useCallback((mensaje, tipo = 'info', duracion = 3500) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, mensaje, tipo }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duracion);
  }, []);

  const exito = useCallback((msg) => mostrar(msg, 'exito'), [mostrar]);
  const error = useCallback((msg) => mostrar(msg, 'error', 5000), [mostrar]);
  const info = useCallback((msg) => mostrar(msg, 'info'), [mostrar]);

  return (
    <ToastContext.Provider value={{ mostrar, exito, error, info }}>
      {children}
      {/* Contenedor de toasts */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`toast-enter px-4 py-3 rounded-xl text-sm font-medium shadow-lg flex items-center gap-2 ${
              toast.tipo === 'exito' ? 'bg-[#3B6D11] text-white' :
              toast.tipo === 'error' ? 'bg-red-800 text-white' :
              'bg-[#2d2c29] text-[#F0EDE8] border border-[#363430]'
            }`}
          >
            <span>{
              toast.tipo === 'exito' ? '✓' :
              toast.tipo === 'error' ? '✕' : 'ℹ'
            }</span>
            <span>{toast.mensaje}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
