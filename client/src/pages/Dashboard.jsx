import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

function SkeletonCard({ className = '' }) {
  return <div className={`skeleton h-24 ${className}`} />;
}

function FormatoPeso({ monto }) {
  return (
    <span>${new Intl.NumberFormat('es-AR').format(monto)}</span>
  );
}

function ChipFacturado({ estado }) {
  const config = {
    PENDIENTE: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
    EMITIDA: 'bg-green-900/50 text-green-300 border-green-700',
    NO_REQUIERE: 'bg-[#2d2c29] text-[#9b9690] border-[#363430]',
    ERROR: 'bg-red-900/50 text-red-300 border-red-700',
  };
  const labels = {
    PENDIENTE: 'Pendiente',
    EMITIDA: 'Emitida',
    NO_REQUIERE: 'Sin factura',
    ERROR: 'Error',
  };
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${config[estado] || config.NO_REQUIERE}`}>
      {labels[estado] || estado}
    </span>
  );
}

export default function Dashboard() {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      const data = await api.dashboard.obtener();
      setDatos(data);
    } catch (err) {
      console.error('Error al cargar dashboard:', err);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="flex flex-col min-h-dvh bg-[#1a1917] pb-20">
      {/* Header */}
      <header className="flex items-center justify-between px-5 pt-12 pb-4">
        <div>
          <p className="text-[#9b9690] text-xs">Buenos días</p>
          <h1 className="text-xl font-bold text-[#F0EDE8]">Cerrajería Vichi</h1>
        </div>
        <button
          onClick={logout}
          className="w-9 h-9 rounded-xl bg-[#242320] flex items-center justify-center text-[#9b9690] active:scale-95 transition-transform"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </header>

      <div className="px-4 space-y-4 fade-in">
        {/* Métricas del día */}
        {cargando ? (
          <div className="grid grid-cols-2 gap-3">
            <SkeletonCard className="rounded-2xl" />
            <SkeletonCard className="rounded-2xl" />
            <SkeletonCard className="rounded-2xl col-span-2" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {/* Total del día */}
            <div className="bg-[#185FA5] rounded-2xl p-4 col-span-2">
              <p className="text-blue-200 text-xs font-medium mb-1">Total cobrado hoy</p>
              <p className="text-3xl font-bold text-white">
                <FormatoPeso monto={datos?.totalHoy || 0} />
              </p>
              <p className="text-blue-200 text-xs mt-1">
                {datos?.cantidadTrabajos || 0} trabajo{datos?.cantidadTrabajos !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Pendiente de facturar */}
            <div className="bg-[#242320] rounded-2xl p-4 border border-[#363430]">
              <p className="text-[#9b9690] text-xs mb-1">A facturar</p>
              <p className="text-xl font-bold text-yellow-300">
                <FormatoPeso monto={datos?.montoPendienteFacturar || 0} />
              </p>
            </div>

            {/* Desglose pagos */}
            <div className="bg-[#242320] rounded-2xl p-4 border border-[#363430]">
              <p className="text-[#9b9690] text-xs mb-2">Pagos</p>
              <div className="space-y-1">
                {Object.entries(datos?.desglosePago || {}).map(([metodo, monto]) => (
                  <div key={metodo} className="flex justify-between text-xs">
                    <span className="text-[#9b9690]">{metodo}</span>
                    <span className="text-[#F0EDE8] font-medium">
                      ${new Intl.NumberFormat('es-AR').format(monto)}
                    </span>
                  </div>
                ))}
                {Object.keys(datos?.desglosePago || {}).length === 0 && (
                  <p className="text-[#9b9690] text-xs">Sin ventas hoy</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Botón principal: Registrar trabajo */}
        <button
          onClick={() => navigate('/registrar')}
          className="w-full h-14 rounded-2xl bg-[#185FA5] text-white font-semibold text-base flex items-center justify-center gap-3 active:scale-[0.98] transition-transform shadow-lg"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Registrar trabajo
        </button>

        {/* Botón: Estoy yendo al domicilio */}
        <button
          onClick={() => navigate('/yendo')}
          className="w-full h-13 rounded-2xl bg-[#242320] text-[#F0EDE8] font-medium text-sm flex items-center justify-center gap-2 border border-[#363430] active:scale-[0.98] transition-transform"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          Estoy yendo al domicilio
        </button>

        {/* Últimos trabajos */}
        <div>
          <h2 className="text-sm font-semibold text-[#9b9690] uppercase tracking-wider mb-3">
            Últimos trabajos
          </h2>

          {cargando ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="skeleton h-16 rounded-xl" />
              ))}
            </div>
          ) : datos?.ultimasVentas?.length === 0 ? (
            <div className="bg-[#242320] rounded-2xl p-6 text-center border border-[#363430]">
              <p className="text-[#9b9690] text-sm">No hay trabajos registrados todavía.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {datos?.ultimasVentas?.map((venta) => (
                <button
                  key={venta.id}
                  onClick={() => navigate(`/historial?id=${venta.id}`)}
                  className="w-full bg-[#242320] rounded-2xl p-4 border border-[#363430] flex items-center gap-3 active:bg-[#2d2c29] transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <p className="font-medium text-[#F0EDE8] text-sm truncate">
                        {venta.clienteNombre || 'Cliente sin nombre'}
                      </p>
                      <span className="font-bold text-[#F0EDE8] text-sm whitespace-nowrap">
                        ${new Intl.NumberFormat('es-AR').format(venta.montoCobrado)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[#9b9690] text-xs truncate">{venta.tipoServicio}</p>
                      <ChipFacturado estado={venta.facturado} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Estado del bot */}
        {datos?.bot && (
          <div className="bg-[#242320] rounded-2xl p-4 border border-[#363430]">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2 h-2 rounded-full ${datos.bot.enEjecucion ? 'bg-yellow-400 animate-pulse' : 'bg-[#3B6D11]'}`} />
              <p className="text-xs font-medium text-[#9b9690]">Bot de facturación</p>
            </div>
            <p className="text-sm text-[#F0EDE8]">
              Próxima ejecución: <span className="font-medium">{datos.bot.proximaEjecucion}</span>
            </p>
            {datos.bot.ultimaEjecucion?.resultado && (
              <p className="text-xs text-[#9b9690] mt-1">
                Última: {datos.bot.ultimaEjecucion.resultado.exitosas} facturas emitidas
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
