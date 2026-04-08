import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function Login() {
  const [pin, setPin] = useState(['', '', '', '']);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const inputsRef = useRef([]);
  const { login } = useAuth();
  const { exito } = useToast();
  const navigate = useNavigate();

  const handleDigito = (index, valor) => {
    // Solo acepta números
    if (!/^\d?$/.test(valor)) return;

    const nuevoPin = [...pin];
    nuevoPin[index] = valor;
    setPin(nuevoPin);
    setError('');

    // Avanzar al siguiente input
    if (valor && index < 3) {
      inputsRef.current[index + 1]?.focus();
    }

    // Si completó los 4 dígitos, intentar login automáticamente
    if (valor && index === 3) {
      const pinCompleto = [...nuevoPin.slice(0, 3), valor].join('');
      if (pinCompleto.length === 4) {
        intentarLogin(pinCompleto);
      }
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const intentarLogin = async (pinStr) => {
    if (cargando) return;
    setCargando(true);
    setError('');
    try {
      await login(pinStr);
      exito('Bienvenido, Vichi!');
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'PIN incorrecto');
      setPin(['', '', '', '']);
      inputsRef.current[0]?.focus();
    } finally {
      setCargando(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const pinCompleto = pin.join('');
    if (pinCompleto.length === 4) intentarLogin(pinCompleto);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-[#1a1917] px-6">
      {/* Logo / Branding */}
      <div className="mb-12 text-center fade-in">
        <div className="w-20 h-20 rounded-3xl bg-[#185FA5] flex items-center justify-center mx-auto mb-5 shadow-lg">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.8} className="w-10 h-10">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-[#F0EDE8] tracking-tight">Cerrajería Vichi</h1>
        <p className="text-[#9b9690] text-sm mt-1">Sistema de gestión</p>
      </div>

      {/* Formulario PIN */}
      <form onSubmit={handleSubmit} className="w-full max-w-xs fade-in">
        <p className="text-center text-[#9b9690] text-sm mb-6">Ingresá tu PIN de acceso</p>

        <div className="flex gap-3 justify-center mb-6">
          {pin.map((digito, i) => (
            <input
              key={i}
              ref={el => inputsRef.current[i] = el}
              type="tel"
              inputMode="numeric"
              maxLength={1}
              value={digito}
              onChange={e => handleDigito(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              disabled={cargando}
              className={`w-14 h-16 text-center text-2xl font-bold rounded-2xl bg-[#242320] border-2 text-[#F0EDE8] outline-none transition-all ${
                error ? 'border-red-500' :
                digito ? 'border-[#185FA5]' :
                'border-[#363430] focus:border-[#185FA5]'
              } disabled:opacity-50`}
              autoFocus={i === 0}
            />
          ))}
        </div>

        {error && (
          <p className="text-red-400 text-sm text-center mb-4">{error}</p>
        )}

        <button
          type="submit"
          disabled={pin.join('').length < 4 || cargando}
          className="w-full h-13 rounded-2xl bg-[#185FA5] text-white font-semibold text-base active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {cargando ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Verificando...
            </span>
          ) : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
