import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';

// Componente de campo de formulario reutilizable
function Campo({ label, children, requerido }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#9b9690] mb-1.5 uppercase tracking-wide">
        {label} {requerido && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}

// Toggle switch
function Toggle({ activo, onChange, label }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!activo)}
      className={`relative flex items-center gap-3 p-3.5 rounded-xl border transition-all w-full text-left ${
        activo ? 'bg-[#185FA5]/20 border-[#185FA5]' : 'bg-[#242320] border-[#363430]'
      }`}
    >
      <div className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 ${activo ? 'bg-[#185FA5]' : 'bg-[#363430]'}`}>
        <div className={`w-5 h-5 rounded-full bg-white mt-0.5 transition-transform shadow-sm ${activo ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </div>
      <span className="text-sm text-[#F0EDE8]">{label}</span>
    </button>
  );
}

// Selector de materiales — carga todos al abrir, filtra mientras escribís
function SelectorMateriales({ seleccionados, onChange }) {
  const [busqueda, setBusqueda] = useState('');
  const [todosLosProductos, setTodosLosProductos] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState(false);

  // Cargar todos los productos la primera vez que se abre (o al reintentar)
  const cargarProductos = async () => {
    setCargando(true);
    setErrorCarga(false);
    try {
      const data = await api.catalogo.productos();
      if (!data || data.length === 0) throw new Error('Sin datos');
      setTodosLosProductos(data);
    } catch {
      setErrorCarga(true);
    } finally {
      setCargando(false);
    }
  };

  const abrir = async () => {
    setAbierto(true);
    if (todosLosProductos.length > 0) return; // ya cargados
    await cargarProductos();
  };

  // Filtrado 100% en el cliente — sin llamadas al servidor
  const productosFiltrados = busqueda.length < 1
    ? todosLosProductos
    : todosLosProductos.filter(p => {
        const q = busqueda.toLowerCase();
        return (
          p.descripcion.toLowerCase().includes(q) ||
          p.codigo.toLowerCase().includes(q) ||
          p.marca.toLowerCase().includes(q) ||
          p.categoria.toLowerCase().includes(q)
        );
      });

  const toggleProducto = (producto) => {
    const yaSeleccionado = seleccionados.find(p => p.codigo === producto.codigo);
    if (yaSeleccionado) {
      onChange(seleccionados.filter(p => p.codigo !== producto.codigo));
    } else {
      onChange([...seleccionados, { ...producto, cantidad: 1 }]);
    }
  };

  const cambiarCantidad = (codigo, cantidad) => {
    onChange(seleccionados.map(p =>
      p.codigo === codigo ? { ...p, cantidad: Math.max(1, parseInt(cantidad) || 1) } : p
    ));
  };

  const totalMateriales = seleccionados.reduce((sum, p) => sum + (p.precioVenta * (p.cantidad || 1)), 0);

  return (
    <div className="space-y-3">
      {/* Chips de seleccionados */}
      {seleccionados.length > 0 && (
        <div className="space-y-2">
          {seleccionados.map(prod => (
            <div key={prod.codigo} className="flex items-center gap-2 bg-[#185FA5]/10 rounded-xl p-3 border border-[#185FA5]/30">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#F0EDE8] truncate">{prod.descripcion}</p>
                <p className="text-xs text-[#9b9690]">${new Intl.NumberFormat('es-AR').format(prod.precioVenta)} c/u</p>
              </div>
              <input
                type="number"
                min="1"
                value={prod.cantidad}
                onChange={e => cambiarCantidad(prod.codigo, e.target.value)}
                className="w-14 h-8 bg-[#2d2c29] rounded-lg text-center text-sm text-[#F0EDE8] border border-[#363430]"
              />
              <button type="button" onClick={() => toggleProducto(prod)} className="text-[#9b9690] p-1">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
          <p className="text-xs text-right text-[#9b9690]">
            Total materiales: <span className="text-[#F0EDE8] font-medium">${new Intl.NumberFormat('es-AR').format(totalMateriales)}</span>
          </p>
        </div>
      )}

      {/* Botón para abrir / campo de búsqueda */}
      {!abierto ? (
        <button
          type="button"
          onClick={abrir}
          className="w-full h-11 bg-[#2d2c29] rounded-xl px-4 text-sm text-[#9b9690] border border-[#363430] flex items-center gap-2 active:border-[#185FA5] transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 flex-shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {seleccionados.length > 0 ? 'Agregar más materiales...' : 'Tocar para ver y elegir materiales...'}
        </button>
      ) : (
        <div className="space-y-2">
          {/* Buscador */}
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9b9690]">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre, código, categoría..."
              className="w-full h-11 bg-[#2d2c29] rounded-xl pl-10 pr-4 text-sm text-[#F0EDE8] placeholder-[#9b9690] border border-[#185FA5] outline-none"
            />
            {busqueda && (
              <button type="button" onClick={() => setBusqueda('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9b9690]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Lista de productos */}
          <div className="bg-[#242320] rounded-xl border border-[#363430] overflow-hidden">
            {cargando ? (
              <div className="flex items-center justify-center py-8 gap-2 text-[#9b9690] text-sm">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Cargando catálogo...
              </div>
            ) : errorCarga ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <p className="text-sm text-red-400">No se pudo cargar el catálogo</p>
                <button
                  type="button"
                  onClick={cargarProductos}
                  className="h-9 px-4 rounded-lg bg-[#185FA5]/20 border border-[#185FA5]/40 text-[#185FA5] text-sm font-medium active:bg-[#185FA5]/30"
                >
                  Reintentar
                </button>
              </div>
            ) : (
              <>
                <div className="px-3 py-2 border-b border-[#363430] flex items-center justify-between">
                  <span className="text-xs text-[#9b9690]">
                    {busqueda
                      ? `${productosFiltrados.length} resultado${productosFiltrados.length !== 1 ? 's' : ''} para "${busqueda}"`
                      : `${todosLosProductos.length} productos — escribí para filtrar`
                    }
                  </span>
                  <button type="button" onClick={() => setAbierto(false)} className="text-xs text-[#185FA5]">
                    Cerrar
                  </button>
                </div>

                <div className="max-h-64 overflow-y-auto">
                  {(busqueda ? productosFiltrados : productosFiltrados.slice(0, 50)).map(prod => {
                    const seleccionado = seleccionados.find(p => p.codigo === prod.codigo);
                    return (
                      <button
                        key={prod.codigo}
                        type="button"
                        onClick={() => toggleProducto(prod)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left border-b border-[#363430] last:border-0 transition-colors ${
                          seleccionado ? 'bg-[#185FA5]/15' : 'active:bg-[#2d2c29]'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center ${
                          seleccionado ? 'bg-[#185FA5] border-[#185FA5]' : 'border-[#9b9690]'
                        }`}>
                          {seleccionado && (
                            <svg viewBox="0 0 12 12" fill="white" className="w-3 h-3">
                              <path d="M10 3L5 8.5 2 5.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-[#F0EDE8] leading-tight" style={{display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>
                            {prod.descripcion}
                          </p>
                          <p className="text-xs text-[#9b9690] mt-0.5">{prod.codigo} · {prod.categoria}</p>
                        </div>
                        <span className="text-sm font-semibold text-[#F0EDE8] whitespace-nowrap flex-shrink-0">
                          ${new Intl.NumberFormat('es-AR').format(prod.precioVenta)}
                        </span>
                      </button>
                    );
                  })}
                  {!busqueda && todosLosProductos.length > 50 && (
                    <p className="text-xs text-center text-[#9b9690] py-3">
                      Mostrando 50 de {todosLosProductos.length}. Escribí para buscar.
                    </p>
                  )}
                  {busqueda && productosFiltrados.length === 0 && (
                    <p className="text-xs text-center text-[#9b9690] py-6">
                      Sin resultados para "{busqueda}"
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Búsqueda de clientes — con selector de contactos del celular
function BuscadorCliente({ nombre, telefono, onNombreChange, onTelefonoChange, onSeleccionar }) {
  const [resultados, setResultados] = useState([]);
  const [mostrarResultados, setMostrarResultados] = useState(false);
  const soportaContactos = typeof navigator !== 'undefined' && 'contacts' in navigator;
  const timerRef = useRef(null);

  const buscar = useCallback(async (texto) => {
    if (texto.length < 2) { setResultados([]); return; }
    try {
      const data = await api.clientes.buscar(texto);
      setResultados(data);
      setMostrarResultados(true);
    } catch { }
  }, []);

  const handleNombre = (e) => {
    const val = e.target.value;
    onNombreChange(val);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => buscar(val), 300);
  };

  const seleccionar = (cliente) => {
    onSeleccionar(cliente);
    setMostrarResultados(false);
    setResultados([]);
  };

  // Abre el selector nativo de contactos del celular
  const elegirDeContactos = async () => {
    try {
      const contactos = await navigator.contacts.select(['name', 'tel'], { multiple: false });
      if (contactos?.length > 0) {
        const c = contactos[0];
        const nombreContacto = c.name?.[0] || '';
        // Limpiar el teléfono: sacar espacios, guiones, paréntesis
        const telLimpio = (c.tel?.[0] || '').replace(/[\s\-\(\)\+]/g, '');
        onNombreChange(nombreContacto);
        onTelefonoChange(telLimpio);
        setResultados([]);
        setMostrarResultados(false);
      }
    } catch (err) {
      // AbortError = el usuario canceló, no es un error real
      if (err.name !== 'AbortError') console.error('Error al leer contacto:', err);
    }
  };

  return (
    <div className="space-y-2">
      {/* Botón de agenda del celular (solo si el navegador lo soporta) */}
      {soportaContactos && (
        <button
          type="button"
          onClick={elegirDeContactos}
          className="w-full h-11 bg-[#185FA5]/15 border border-[#185FA5]/40 rounded-xl flex items-center justify-center gap-2 text-sm text-[#185FA5] font-medium active:bg-[#185FA5]/25 transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
          </svg>
          Elegir de mis contactos
        </button>
      )}

      <div className="relative">
        <input
          type="text"
          value={nombre}
          onChange={handleNombre}
          onFocus={() => resultados.length > 0 && setMostrarResultados(true)}
          onBlur={() => setTimeout(() => setMostrarResultados(false), 150)}
          placeholder={soportaContactos ? 'O escribí el nombre manualmente...' : 'Nombre del cliente'}
          className="w-full h-11 bg-[#2d2c29] rounded-xl px-4 text-sm text-[#F0EDE8] placeholder-[#9b9690] border border-[#363430] focus:border-[#185FA5] outline-none"
        />
        {mostrarResultados && resultados.length > 0 && (
          <div className="absolute top-12 left-0 right-0 bg-[#242320] rounded-xl border border-[#363430] z-10 shadow-xl max-h-40 overflow-y-auto">
            {resultados.map(c => (
              <button
                key={c.id}
                type="button"
                onMouseDown={() => seleccionar(c)}
                className="w-full text-left px-4 py-3 text-sm text-[#F0EDE8] border-b border-[#363430] last:border-0 active:bg-[#2d2c29]"
              >
                <p className="font-medium">{c.nombre}</p>
                <p className="text-xs text-[#9b9690]">{c.telefono} · {c.totalTrabajos} trabajo(s)</p>
              </button>
            ))}
          </div>
        )}
      </div>
      <input
        type="tel"
        value={telefono}
        onChange={e => onTelefonoChange(e.target.value)}
        placeholder="Teléfono (opcional)"
        className="w-full h-11 bg-[#2d2c29] rounded-xl px-4 text-sm text-[#F0EDE8] placeholder-[#9b9690] border border-[#363430] focus:border-[#185FA5] outline-none"
      />
    </div>
  );
}

export default function RegistrarVenta() {
  const navigate = useNavigate();
  const { exito, error: mostrarError } = useToast();

  // Estado del formulario
  const [servicios, setServicios] = useState([]);
  const [config, setConfig] = useState({ porcentajeUrgencia: 0.30, valorHoraMO: 2500 });
  const [guardando, setGuardando] = useState(false);

  const [form, setForm] = useState({
    tipoServicio: '',
    clienteNombre: '',
    clienteTel: '',
    materiales: [],
    montoCobrado: '',
    modalidadPago: 'Efectivo',
    esUrgencia: false,
    requiereFactura: false,
    cuitCliente: '',
    tipoComprobante: 'C',
    condicionIVA: 'CF',
    notas: '',
  });

  const [precioSugerido, setPrecioSugerido] = useState(null);

  // Cargar servicios y configuración al montar
  useEffect(() => {
    api.catalogo.servicios().then(setServicios).catch(console.error);
    api.catalogo.configuracion().then(setConfig).catch(console.error);
  }, []);

  // Calcular precio sugerido cuando cambia el servicio, materiales o urgencia
  useEffect(() => {
    const servicio = servicios.find(s => s.nombre === form.tipoServicio);
    if (!servicio) { setPrecioSugerido(null); return; }

    // Precio base viene calculado del Excel (horas × valor_hora + materiales_incluidos)
    // Precio urgencia también viene del Excel (precioBase × 1 + porcentajeUrgencia)
    // Si el Excel tiene precioUrgencia ya calculado, lo usamos directo.
    // Si no, lo calculamos con el % de configuración.
    let precioBase;
    if (form.esUrgencia) {
      precioBase = servicio.precioUrgencia > 0
        ? servicio.precioUrgencia
        : servicio.precioBase * (1 + config.porcentajeUrgencia);
    } else {
      precioBase = servicio.precioBase;
    }

    // Sumar materiales extra seleccionados (adicionales al servicio)
    const totalMaterialesExtra = form.materiales.reduce(
      (sum, p) => sum + (p.precioVenta * (p.cantidad || 1)), 0
    );

    setPrecioSugerido(Math.round(precioBase + totalMaterialesExtra));
  }, [form.tipoServicio, form.materiales, form.esUrgencia, servicios, config]);

  const set = (campo, valor) => setForm(prev => ({ ...prev, [campo]: valor }));

  const usarPrecioSugerido = () => {
    if (precioSugerido !== null) set('montoCobrado', String(precioSugerido));
  };

  const handleSeleccionarCliente = (cliente) => {
    set('clienteNombre', cliente.nombre);
    set('clienteTel', cliente.telefono);
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    if (!form.tipoServicio) return mostrarError('Seleccioná un tipo de servicio');
    if (!form.montoCobrado) return mostrarError('Ingresá el monto cobrado');

    setGuardando(true);
    try {
      await api.ventas.registrar({
        ...form,
        montoCobrado: parseFloat(form.montoCobrado),
      });
      exito('¡Trabajo registrado correctamente!');
      navigate('/dashboard');
    } catch (err) {
      mostrarError(err.message || 'Error al guardar la venta');
    } finally {
      setGuardando(false);
    }
  };

  const MODALIDADES = ['Efectivo', 'Transferencia', 'Débito'];

  return (
    <div className="flex flex-col min-h-dvh bg-[#1a1917] pb-24">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 pt-12 pb-4 sticky top-0 bg-[#1a1917] z-10 border-b border-[#363430]">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-xl bg-[#242320] flex items-center justify-center text-[#9b9690] active:scale-95 transition-transform"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-[#F0EDE8]">Registrar trabajo</h1>
      </header>

      <form onSubmit={handleGuardar} className="px-4 py-5 space-y-5 fade-in">
        {/* Tipo de servicio */}
        <Campo label="Tipo de servicio" requerido>
          <select
            value={form.tipoServicio}
            onChange={e => set('tipoServicio', e.target.value)}
            className="w-full h-11 bg-[#2d2c29] rounded-xl px-4 text-sm text-[#F0EDE8] border border-[#363430] focus:border-[#185FA5] outline-none appearance-none"
          >
            <option value="">Seleccioná un servicio...</option>
            {/* Agrupar por categoría */}
            {[...new Set(servicios.map(s => s.categoria))].map(cat => (
              <optgroup key={cat} label={cat}>
                {servicios.filter(s => s.categoria === cat).map(s => (
                  <option key={s.idServicio} value={s.nombre}>{s.nombre}</option>
                ))}
              </optgroup>
            ))}
          </select>
          {/* Nota del servicio seleccionado */}
          {form.tipoServicio && (() => {
            const s = servicios.find(sv => sv.nombre === form.tipoServicio);
            return s?.notas ? (
              <p className="text-xs text-[#9b9690] mt-1.5 px-1">ℹ {s.notas}</p>
            ) : null;
          })()}
        </Campo>

        {/* Cliente */}
        <Campo label="Cliente">
          <BuscadorCliente
            nombre={form.clienteNombre}
            telefono={form.clienteTel}
            onNombreChange={v => set('clienteNombre', v)}
            onTelefonoChange={v => set('clienteTel', v)}
            onSeleccionar={handleSeleccionarCliente}
          />
        </Campo>

        {/* Urgencia */}
        <Toggle
          activo={form.esUrgencia}
          onChange={v => set('esUrgencia', v)}
          label={`Es urgencia (+${Math.round(config.porcentajeUrgencia * 100)}% al precio sugerido)`}
        />

        {/* Materiales */}
        <Campo label="Materiales usados">
          <SelectorMateriales
            seleccionados={form.materiales}
            onChange={v => set('materiales', v)}
          />
        </Campo>

        {/* Monto cobrado */}
        <Campo label="Monto cobrado" requerido>
          <div className="space-y-2">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9b9690] font-medium">$</span>
              <input
                type="number"
                inputMode="decimal"
                value={form.montoCobrado}
                onChange={e => set('montoCobrado', e.target.value)}
                placeholder="0"
                className="w-full h-12 bg-[#2d2c29] rounded-xl pl-8 pr-4 text-lg font-bold text-[#F0EDE8] placeholder-[#9b9690] border border-[#363430] focus:border-[#185FA5] outline-none"
              />
            </div>
            {precioSugerido !== null && (
              <button
                type="button"
                onClick={usarPrecioSugerido}
                className="w-full h-9 rounded-lg bg-[#3B6D11]/20 border border-[#3B6D11]/40 text-[#3B6D11] text-sm font-medium active:bg-[#3B6D11]/30 transition-colors"
              >
                Usar precio sugerido: ${new Intl.NumberFormat('es-AR').format(precioSugerido)}
              </button>
            )}
          </div>
        </Campo>

        {/* Modalidad de pago */}
        <Campo label="Modalidad de pago" requerido>
          <div className="flex gap-2">
            {MODALIDADES.map(m => (
              <button
                key={m}
                type="button"
                onClick={() => set('modalidadPago', m)}
                className={`flex-1 h-10 rounded-xl text-sm font-medium transition-all ${
                  form.modalidadPago === m
                    ? 'bg-[#185FA5] text-white'
                    : 'bg-[#2d2c29] text-[#9b9690] border border-[#363430]'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </Campo>

        {/* Requiere factura */}
        <Toggle
          activo={form.requiereFactura}
          onChange={v => set('requiereFactura', v)}
          label="El cliente requiere factura"
        />

        {/* Datos de facturación (condicional) */}
        {form.requiereFactura && (
          <div className="bg-[#242320] rounded-2xl p-4 border border-[#363430] space-y-4 fade-in">
            <Campo label="CUIT del cliente">
              <input
                type="text"
                inputMode="numeric"
                value={form.cuitCliente}
                onChange={e => set('cuitCliente', e.target.value.replace(/\D/g, ''))}
                placeholder="20123456789"
                maxLength={11}
                className="w-full h-11 bg-[#2d2c29] rounded-xl px-4 text-sm text-[#F0EDE8] placeholder-[#9b9690] border border-[#363430] focus:border-[#185FA5] outline-none font-mono tracking-wider"
              />
            </Campo>

            <Campo label="Tipo de comprobante">
              <div className="flex gap-2">
                {[['A', 'Factura A'], ['B', 'Factura B'], ['C', 'Factura C']].map(([tipo, label]) => (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => set('tipoComprobante', tipo)}
                    className={`flex-1 h-10 rounded-xl text-sm font-medium transition-all ${
                      form.tipoComprobante === tipo
                        ? 'bg-[#185FA5] text-white'
                        : 'bg-[#2d2c29] text-[#9b9690] border border-[#363430]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Campo>

            <Campo label="Condición IVA del cliente">
              <select
                value={form.condicionIVA}
                onChange={e => set('condicionIVA', e.target.value)}
                className="w-full h-11 bg-[#2d2c29] rounded-xl px-4 text-sm text-[#F0EDE8] border border-[#363430] focus:border-[#185FA5] outline-none appearance-none"
              >
                <option value="CF">Consumidor Final</option>
                <option value="RI">Responsable Inscripto</option>
                <option value="MT">Monotributista</option>
                <option value="EX">Exento</option>
                <option value="RNI">No Inscripto</option>
              </select>
            </Campo>
          </div>
        )}

        {/* Notas */}
        <Campo label="Notas">
          <textarea
            value={form.notas}
            onChange={e => set('notas', e.target.value)}
            placeholder="Observaciones del trabajo, accesorios usados, etc."
            rows={3}
            className="w-full bg-[#2d2c29] rounded-xl px-4 py-3 text-sm text-[#F0EDE8] placeholder-[#9b9690] border border-[#363430] focus:border-[#185FA5] outline-none resize-none"
          />
        </Campo>

        {/* Botón guardar */}
        <button
          type="submit"
          disabled={guardando}
          className="w-full h-14 rounded-2xl bg-[#3B6D11] text-white font-semibold text-base active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
        >
          {guardando ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Guardando...
            </span>
          ) : '✓ Guardar trabajo'}
        </button>
      </form>
    </div>
  );
}
