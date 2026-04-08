import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';

function ChipEstadoBot({ estado }) {
  if (estado === 'completado') return <span className="text-green-400 text-xs font-medium">✓ Completado</span>;
  if (estado === 'en_progreso') return <span className="text-yellow-400 text-xs font-medium animate-pulse">⏳ En progreso...</span>;
  if (estado === 'error') return <span className="text-red-400 text-xs font-medium">✕ Error</span>;
  return null;
}

export default function Facturacion() {
  const { exito, error: mostrarError } = useToast();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [ejecutando, setEjecutando] = useState(false);
  const [estadoARCA, setEstadoARCA] = useState(null);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setCargando(true);
    try {
      const data = await api.facturacion.estado();
      setDatos(data);
    } catch (err) {
      console.error('Error al cargar estado facturación:', err);
    } finally {
      setCargando(false);
    }
  };

  const verificarARCA = async () => {
    try {
      setEstadoARCA({ verificando: true });
      const estado = await api.facturacion.healthARCA();
      setEstadoARCA({ ...estado, verificando: false });
    } catch (err) {
      setEstadoARCA({ conectado: false, error: err.message, verificando: false });
    }
  };

  const ejecutarBot = async () => {
    setEjecutando(true);
    try {
      const resultado = await api.facturacion.ejecutar();
      exito(`Facturación completada: ${resultado.resultado?.exitosas || 0} comprobantes emitidos`);
      await cargarDatos(); // Recargar datos
    } catch (err) {
      mostrarError(err.message || 'Error al ejecutar el bot');
    } finally {
      setEjecutando(false);
    }
  };

  const bot = datos?.bot;
  const logReciente = datos?.logReciente || [];
  const ventasPendientes = datos?.ventasPendientes || [];

  return (
    <div className="flex flex-col min-h-dvh bg-[#1a1917] pb-20">
      {/* Header */}
      <header className="px-5 pt-12 pb-4 border-b border-[#363430]">
        <h1 className="text-xl font-bold text-[#F0EDE8]">Facturación</h1>
        <p className="text-xs text-[#9b9690] mt-0.5">Bot automático ARCA</p>
      </header>

      <div className="px-4 py-4 space-y-4 fade-in">
        {/* Estado del bot */}
        <div className="bg-[#242320] rounded-2xl p-4 border border-[#363430]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${bot?.enEjecucion ? 'bg-yellow-400 animate-pulse' : 'bg-[#3B6D11]'}`} />
              <span className="text-sm font-semibold text-[#F0EDE8]">Bot de facturación</span>
            </div>
            {bot?.ultimaEjecucion && <ChipEstadoBot estado={bot.ultimaEjecucion.estado} />}
          </div>

          <p className="text-xs text-[#9b9690] mb-1">Próxima ejecución automática</p>
          <p className="text-sm text-[#F0EDE8] font-medium mb-3">{bot?.proximaEjecucion || 'Cargando...'}</p>

          {bot?.ultimaEjecucion?.resultado && (
            <div className="grid grid-cols-3 gap-2 mb-3 bg-[#1a1917] rounded-xl p-3">
              <div className="text-center">
                <p className="text-lg font-bold text-[#F0EDE8]">{bot.ultimaEjecucion.resultado.ventasProcesadas}</p>
                <p className="text-[10px] text-[#9b9690]">Procesadas</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-green-400">{bot.ultimaEjecucion.resultado.exitosas}</p>
                <p className="text-[10px] text-[#9b9690]">Exitosas</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-red-400">{bot.ultimaEjecucion.resultado.fallidas}</p>
                <p className="text-[10px] text-[#9b9690]">Fallidas</p>
              </div>
            </div>
          )}

          <button
            onClick={ejecutarBot}
            disabled={ejecutando || bot?.enEjecucion}
            className="w-full h-12 rounded-xl bg-[#185FA5] text-white text-sm font-semibold disabled:opacity-40 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {ejecutando ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Facturando...
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Facturar ahora (manual)
              </>
            )}
          </button>
        </div>

        {/* Ventas pendientes */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[#9b9690] uppercase tracking-wider">
              Pendientes de facturar
            </h2>
            <span className="text-xs font-bold text-yellow-400 bg-yellow-900/30 px-2 py-0.5 rounded-full">
              {ventasPendientes.length}
            </span>
          </div>

          {cargando ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
            </div>
          ) : ventasPendientes.length === 0 ? (
            <div className="bg-[#242320] rounded-2xl p-5 text-center border border-[#363430]">
              <p className="text-[#3B6D11] text-sm font-medium">✓ Sin pendientes</p>
              <p className="text-[#9b9690] text-xs mt-1">Todas las ventas están al día</p>
            </div>
          ) : (
            <div className="space-y-2">
              {ventasPendientes.map(v => (
                <div key={v.id} className="bg-[#242320] rounded-2xl p-4 border border-yellow-900/40">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-[#F0EDE8]">{v.clienteNombre || 'Sin nombre'}</p>
                      <p className="text-xs text-[#9b9690]">{v.tipoServicio} · {v.fecha}</p>
                    </div>
                    <p className="font-bold text-[#F0EDE8]">${new Intl.NumberFormat('es-AR').format(v.montoCobrado)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Conexión ARCA */}
        <div className="bg-[#242320] rounded-2xl p-4 border border-[#363430]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[#F0EDE8]">Conexión ARCA</span>
            <span className="text-xs text-[#9b9690] uppercase bg-[#1a1917] px-2 py-0.5 rounded-full">
              {process.env.NODE_ENV === 'development' ? 'Homologación' : 'Producción'}
            </span>
          </div>

          {estadoARCA && !estadoARCA.verificando && (
            <div className={`text-xs p-3 rounded-xl mb-3 ${
              estadoARCA.conectado ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'
            }`}>
              {estadoARCA.conectado
                ? `✓ Conectado · AppServer: ${estadoARCA.appServer} · DB: ${estadoARCA.dbServer}`
                : `✕ Error: ${estadoARCA.error}`
              }
            </div>
          )}

          <button
            onClick={verificarARCA}
            disabled={estadoARCA?.verificando}
            className="w-full h-10 rounded-xl bg-[#1a1917] border border-[#363430] text-[#9b9690] text-xs font-medium active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {estadoARCA?.verificando ? 'Verificando...' : 'Verificar conexión con ARCA'}
          </button>
        </div>

        {/* Log de ejecuciones */}
        {logReciente.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-[#9b9690] uppercase tracking-wider mb-3">
              Historial de ejecuciones
            </h2>
            <div className="space-y-2">
              {logReciente.map((log, i) => (
                <div key={i} className="bg-[#242320] rounded-xl p-4 border border-[#363430]">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-[#9b9690]">{log.fechaEjecucion}</p>
                    <span className={`text-xs font-medium ${log.fallidas > 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {log.fallidas > 0 ? `${log.fallidas} error(es)` : '✓ OK'}
                    </span>
                  </div>
                  <p className="text-sm text-[#F0EDE8]">
                    {log.exitosas}/{log.ventasProcesadas} comprobantes emitidos
                  </p>
                  {log.detalleErrores && (
                    <p className="text-xs text-red-400 mt-1 truncate">{log.detalleErrores}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
