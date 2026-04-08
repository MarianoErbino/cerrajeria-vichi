import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

function ChipFacturado({ estado }) {
  const config = {
    PENDIENTE: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
    EMITIDA: 'bg-green-900/50 text-green-300 border-green-700',
    NO_REQUIERE: 'bg-[#2d2c29] text-[#9b9690] border-[#363430]',
    ERROR: 'bg-red-900/50 text-red-300 border-red-700',
  };
  const labels = {
    PENDIENTE: 'Pendiente',
    EMITIDA: 'Facturada',
    NO_REQUIERE: 'Sin factura',
    ERROR: 'Error',
  };
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${config[estado] || config.NO_REQUIERE}`}>
      {labels[estado] || estado}
    </span>
  );
}

function DetalleVenta({ venta, onCerrar }) {
  if (!venta) return null;

  let materiales = [];
  try {
    materiales = JSON.parse(venta.materiales || '[]');
  } catch { }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end justify-center" onClick={onCerrar}>
      <div
        className="bg-[#1a1917] rounded-t-3xl w-full max-w-[480px] max-h-[85dvh] overflow-y-auto fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-[#1a1917] px-5 pt-5 pb-3 border-b border-[#363430]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#F0EDE8]">{venta.clienteNombre || 'Cliente sin nombre'}</h2>
              <p className="text-sm text-[#9b9690]">{venta.fecha} · {venta.hora}</p>
            </div>
            <button onClick={onCerrar} className="text-[#9b9690] p-1">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Monto y estado */}
          <div className="flex items-center justify-between">
            <p className="text-3xl font-bold text-[#F0EDE8]">
              ${new Intl.NumberFormat('es-AR').format(venta.montoCobrado)}
            </p>
            <ChipFacturado estado={venta.facturado} />
          </div>

          {/* Info del trabajo */}
          <div className="bg-[#242320] rounded-2xl p-4 space-y-3 border border-[#363430]">
            <InfoFila label="Servicio" valor={venta.tipoServicio} />
            <InfoFila label="Pago" valor={venta.modalidadPago} />
            <InfoFila label="Urgencia" valor={venta.esUrgencia ? 'Sí' : 'No'} />
            {venta.clienteTel && <InfoFila label="Teléfono" valor={venta.clienteTel} />}
          </div>

          {/* Materiales */}
          {materiales.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[#9b9690] uppercase tracking-wide mb-2">Materiales</p>
              <div className="space-y-2">
                {materiales.map((m, i) => (
                  <div key={i} className="flex justify-between items-center bg-[#242320] rounded-xl px-4 py-2.5 border border-[#363430]">
                    <p className="text-sm text-[#F0EDE8]">{m.descripcion}</p>
                    <p className="text-xs text-[#9b9690]">x{m.cantidad}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notas */}
          {venta.notas && (
            <div>
              <p className="text-xs font-medium text-[#9b9690] uppercase tracking-wide mb-2">Notas</p>
              <p className="text-sm text-[#F0EDE8] bg-[#242320] rounded-xl px-4 py-3 border border-[#363430]">
                {venta.notas}
              </p>
            </div>
          )}

          {/* Datos de facturación */}
          {venta.facturado === 'EMITIDA' && venta.cae && (
            <div className="bg-[#3B6D11]/20 rounded-2xl p-4 border border-[#3B6D11]/40">
              <p className="text-xs font-medium text-green-400 uppercase tracking-wide mb-2">Comprobante emitido</p>
              <InfoFila label="N° Comprobante" valor={venta.nroComprobante} />
              <InfoFila label="CAE" valor={venta.cae} />
              <InfoFila label="Vence" valor={venta.vencimientoCAE} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoFila({ label, valor }) {
  return (
    <div className="flex justify-between items-center text-sm py-0.5">
      <span className="text-[#9b9690]">{label}</span>
      <span className="text-[#F0EDE8] font-medium">{valor}</span>
    </div>
  );
}

export default function Historial() {
  const navigate = useNavigate();
  const [ventas, setVentas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [ventaSeleccionada, setVentaSeleccionada] = useState(null);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [filtros, setFiltros] = useState({ facturado: '', tipoServicio: '' });

  useEffect(() => {
    cargarVentas();
  }, [pagina, filtros]);

  const cargarVentas = async () => {
    setCargando(true);
    try {
      const params = { pagina, limite: 20 };
      if (filtros.facturado) params.facturado = filtros.facturado;
      if (filtros.tipoServicio) params.tipoServicio = filtros.tipoServicio;

      const data = await api.ventas.listar(params);
      setVentas(data.ventas);
      setTotalPaginas(data.totalPaginas);
    } catch (err) {
      console.error('Error al cargar historial:', err);
    } finally {
      setCargando(false);
    }
  };

  const setFiltro = (campo, valor) => {
    setFiltros(prev => ({ ...prev, [campo]: valor }));
    setPagina(1);
  };

  const ESTADOS_FACTURA = [
    { valor: '', label: 'Todos' },
    { valor: 'PENDIENTE', label: 'Pendiente' },
    { valor: 'EMITIDA', label: 'Emitida' },
    { valor: 'NO_REQUIERE', label: 'Sin factura' },
    { valor: 'ERROR', label: 'Error' },
  ];

  return (
    <div className="flex flex-col min-h-dvh bg-[#1a1917] pb-20">
      {/* Header */}
      <header className="px-5 pt-12 pb-4 border-b border-[#363430]">
        <h1 className="text-xl font-bold text-[#F0EDE8]">Historial</h1>
        <p className="text-xs text-[#9b9690] mt-0.5">Todos los trabajos registrados</p>
      </header>

      {/* Filtros */}
      <div className="px-4 pt-3 pb-2 overflow-x-auto">
        <div className="flex gap-2 w-max">
          {ESTADOS_FACTURA.map(({ valor, label }) => (
            <button
              key={valor}
              onClick={() => setFiltro('facturado', valor)}
              className={`px-4 h-8 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                filtros.facturado === valor
                  ? 'bg-[#185FA5] text-white'
                  : 'bg-[#242320] text-[#9b9690] border border-[#363430]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div className="px-4 py-2 space-y-2 fade-in">
        {cargando ? (
          [...Array(5)].map((_, i) => (
            <div key={i} className="skeleton h-20 rounded-2xl" />
          ))
        ) : ventas.length === 0 ? (
          <div className="bg-[#242320] rounded-2xl p-8 text-center border border-[#363430] mt-4">
            <p className="text-[#9b9690]">No hay trabajos que coincidan con los filtros.</p>
          </div>
        ) : (
          ventas.map(venta => (
            <button
              key={venta.id}
              onClick={() => setVentaSeleccionada(venta)}
              className="w-full bg-[#242320] rounded-2xl p-4 border border-[#363430] flex items-center gap-3 active:bg-[#2d2c29] transition-colors text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="font-semibold text-[#F0EDE8] text-sm truncate">
                    {venta.clienteNombre || 'Sin nombre'}
                  </p>
                  <span className="font-bold text-[#F0EDE8] text-sm whitespace-nowrap">
                    ${new Intl.NumberFormat('es-AR').format(venta.montoCobrado)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[#9b9690] text-xs truncate">{venta.tipoServicio}</p>
                    <p className="text-[#9b9690] text-xs">{venta.fecha} · {venta.modalidadPago}</p>
                  </div>
                  <ChipFacturado estado={venta.facturado} />
                </div>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[#9b9690] flex-shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))
        )}

        {/* Paginación */}
        {totalPaginas > 1 && (
          <div className="flex items-center justify-center gap-4 pt-4 pb-2">
            <button
              onClick={() => setPagina(p => Math.max(1, p - 1))}
              disabled={pagina === 1}
              className="h-10 px-5 rounded-xl bg-[#242320] border border-[#363430] text-sm text-[#F0EDE8] disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="text-sm text-[#9b9690]">{pagina} / {totalPaginas}</span>
            <button
              onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
              disabled={pagina === totalPaginas}
              className="h-10 px-5 rounded-xl bg-[#242320] border border-[#363430] text-sm text-[#F0EDE8] disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        )}
      </div>

      {/* Modal detalle */}
      {ventaSeleccionada && (
        <DetalleVenta
          venta={ventaSeleccionada}
          onCerrar={() => setVentaSeleccionada(null)}
        />
      )}
    </div>
  );
}
