import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';

export default function YendoDomicilio() {
  const navigate = useNavigate();
  const { info } = useToast();

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [minutos, setMinutos] = useState('');
  const [resultados, setResultados] = useState([]);
  const [mostrarResultados, setMostrarResultados] = useState(false);
  const timerRef = useRef(null);

  const mensajeGenerado = nombre && minutos
    ? `Hola ${nombre}, soy Vichi el cerrajero. Ya estoy saliendo hacia tu domicilio. En aproximadamente ${minutos} minutos estoy llegando. Cualquier consulta escribime acá.`
    : '';

  const buscarCliente = useCallback(async (texto) => {
    if (texto.length < 2) { setResultados([]); return; }
    try {
      const data = await api.clientes.buscar(texto);
      setResultados(data);
      setMostrarResultados(true);
    } catch { }
  }, []);

  const handleNombre = (e) => {
    const val = e.target.value;
    setNombre(val);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => buscarCliente(val), 300);
  };

  const seleccionarCliente = (cliente) => {
    setNombre(cliente.nombre);
    setTelefono(cliente.telefono || '');
    setMostrarResultados(false);
    setResultados([]);
  };

  const copiarMensaje = async () => {
    try {
      await navigator.clipboard.writeText(mensajeGenerado);
      info('¡Mensaje copiado!');
    } catch {
      // Fallback para dispositivos sin clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = mensajeGenerado;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      info('¡Mensaje copiado!');
    }
  };

  const abrirWhatsApp = () => {
    if (!telefono) return;
    const telLimpio = telefono.replace(/\D/g, '');
    // Agregar código de país Argentina si no lo tiene
    const telConCodigo = telLimpio.startsWith('54') ? telLimpio : `54${telLimpio}`;
    const url = `https://wa.me/${telConCodigo}?text=${encodeURIComponent(mensajeGenerado)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="flex flex-col min-h-dvh bg-[#1a1917]">
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
        <div>
          <h1 className="text-lg font-bold text-[#F0EDE8]">Estoy yendo</h1>
          <p className="text-xs text-[#9b9690]">Generá el mensaje para el cliente</p>
        </div>
      </header>

      <div className="px-4 py-5 space-y-5 fade-in">
        {/* Ícono */}
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-3xl bg-[#185FA5]/20 border border-[#185FA5]/30 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="#185FA5" strokeWidth={1.5} className="w-10 h-10">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
        </div>

        {/* Nombre del cliente */}
        <div>
          <label className="block text-xs font-medium text-[#9b9690] mb-1.5 uppercase tracking-wide">
            Cliente
          </label>
          <div className="relative">
            <input
              type="text"
              value={nombre}
              onChange={handleNombre}
              onFocus={() => resultados.length > 0 && setMostrarResultados(true)}
              onBlur={() => setTimeout(() => setMostrarResultados(false), 150)}
              placeholder="Nombre del cliente"
              className="w-full h-11 bg-[#2d2c29] rounded-xl px-4 text-sm text-[#F0EDE8] placeholder-[#9b9690] border border-[#363430] focus:border-[#185FA5] outline-none"
            />
            {mostrarResultados && resultados.length > 0 && (
              <div className="absolute top-12 left-0 right-0 bg-[#242320] rounded-xl border border-[#363430] z-10 shadow-xl max-h-40 overflow-y-auto">
                {resultados.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={() => seleccionarCliente(c)}
                    className="w-full text-left px-4 py-3 text-sm text-[#F0EDE8] border-b border-[#363430] last:border-0 active:bg-[#2d2c29]"
                  >
                    <p className="font-medium">{c.nombre}</p>
                    <p className="text-xs text-[#9b9690]">{c.telefono}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Teléfono */}
        <div>
          <label className="block text-xs font-medium text-[#9b9690] mb-1.5 uppercase tracking-wide">
            Teléfono (para WhatsApp)
          </label>
          <input
            type="tel"
            value={telefono}
            onChange={e => setTelefono(e.target.value)}
            placeholder="11 1234 5678"
            className="w-full h-11 bg-[#2d2c29] rounded-xl px-4 text-sm text-[#F0EDE8] placeholder-[#9b9690] border border-[#363430] focus:border-[#185FA5] outline-none"
          />
        </div>

        {/* Minutos */}
        <div>
          <label className="block text-xs font-medium text-[#9b9690] mb-1.5 uppercase tracking-wide">
            ¿En cuántos minutos llegás?
          </label>
          <div className="flex gap-2">
            {[10, 15, 20, 30, 45, 60].map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setMinutos(String(m))}
                className={`flex-1 h-10 rounded-xl text-sm font-medium transition-all ${
                  minutos === String(m)
                    ? 'bg-[#185FA5] text-white'
                    : 'bg-[#2d2c29] text-[#9b9690] border border-[#363430]'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <input
            type="number"
            value={minutos}
            onChange={e => setMinutos(e.target.value)}
            placeholder="O escribí los minutos"
            className="w-full h-11 mt-2 bg-[#2d2c29] rounded-xl px-4 text-sm text-[#F0EDE8] placeholder-[#9b9690] border border-[#363430] focus:border-[#185FA5] outline-none"
          />
        </div>

        {/* Mensaje generado */}
        {mensajeGenerado && (
          <div className="fade-in space-y-3">
            <label className="block text-xs font-medium text-[#9b9690] uppercase tracking-wide">
              Mensaje generado
            </label>
            <div className="bg-[#242320] rounded-2xl p-4 border border-[#185FA5]/30">
              <p className="text-sm text-[#F0EDE8] leading-relaxed">{mensajeGenerado}</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={copiarMensaje}
                className="flex-1 h-12 rounded-xl bg-[#242320] border border-[#363430] text-[#F0EDE8] text-sm font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copiar
              </button>

              <button
                onClick={abrirWhatsApp}
                disabled={!telefono}
                className="flex-1 h-12 rounded-xl bg-[#25D366] text-white text-sm font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-40"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
