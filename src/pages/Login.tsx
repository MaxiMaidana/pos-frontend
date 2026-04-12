import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Lock,
  ShieldCheck,
  UserCheck,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axiosClient';
import { isWebMode } from '../utils/env';
import { useNombreTienda } from '../hooks/useNombreTienda';

// ─── Constants ────────────────────────────────────────────────────────────────

// ─── Types ──────────────────────────────────────────────────────────────────────

type Tab = 'empleado' | 'admin';

// ─── Component ────────────────────────────────────────────────────────────────

export default function Login() {
  const { rol, loginAdmin, loginEmpleado } = useAuth();
  const navigate = useNavigate();

  // Redirigir si ya está autenticado
  useEffect(() => {
    if (rol === 'ADMIN') navigate('/dashboard', { replace: true });
    if (rol === 'EMPLEADO') navigate('/', { replace: true });
  }, [rol, navigate]);

  const nombreTienda = useNombreTienda();

  const [tab, setTab] = useState<Tab>(isWebMode ? 'admin' : 'empleado');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleTabChange = (next: Tab) => {
    setTab(next);
    setPassword('');
    setError(null);
  };

  const handleSubmit = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const { data } = await api.post<{ token: string }>('/auth/login', {
        rol: tab === 'admin' ? 'ADMIN' : 'EMPLEADO',
        password,
      });
      localStorage.setItem('token', data.token);
      if (tab === 'admin') {
        loginAdmin();
        navigate('/dashboard');
      } else {
        loginEmpleado();
        navigate('/');
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      setError(
        status === 401
          ? 'Contraseña incorrecta. Intentá de nuevo.'
          : 'Error al conectar con el servidor. Verificá tu conexión.'
      );
      setPassword('');
    } finally {
      setIsLoading(false);
    }
  };



  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-sm p-8">

        {/* Logo */}
        <div className="flex flex-col items-center mb-7">
          <div className="p-4 bg-indigo-50 rounded-2xl mb-3">
            <Lock size={28} className="text-indigo-500" />
          </div>
          <h1 className="text-2xl font-black text-gray-800 tracking-tight">POS Edge</h1>
          {nombreTienda && <p className="text-sm text-gray-400 mt-1">{nombreTienda}</p>}
        </div>

        {/* Tabs */}
        {!isWebMode && (
          <div className="flex rounded-xl bg-gray-100 p-1 mb-5">
            <button
              onClick={() => handleTabChange('empleado')}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                tab === 'empleado'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Empleado
            </button>
            <button
              onClick={() => handleTabChange('admin')}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                tab === 'admin'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Administrador
            </button>
          </div>
        )}

        {/* Descripción del modo */}
        <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl mb-5 text-xs font-medium ${
          tab === 'admin' ? 'bg-violet-50 text-violet-700' : 'bg-indigo-50 text-indigo-700'
        }`}>
          {tab === 'admin'
            ? <ShieldCheck size={13} className="shrink-0" />
            : <UserCheck size={13} className="shrink-0" />
          }
          <span>{tab === 'admin' ? 'Acceso al panel de administración' : 'Acceso al punto de venta'}</span>
        </div>

        {/* Formulario */}
        <form
          onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Contraseña
            </label>
            <div className="relative">
              <Lock
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                placeholder="••••••••"
                autoFocus
                autoComplete="current-password"
                className="w-full pl-9 pr-10 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={!password || isLoading}
            className={`
              w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2
              transition-all duration-200 mt-2
              ${
                !password || isLoading
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : tab === 'admin'
                    ? 'bg-violet-600 hover:bg-violet-700 active:scale-[0.98] text-white shadow-lg shadow-violet-100'
                    : 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white shadow-lg shadow-indigo-100'
              }
            `}
          >
            {isLoading
              ? <><Loader2 size={16} className="animate-spin" /> Verificando...</>
              : tab === 'admin'
                ? <><ShieldCheck size={16} /> Entrar como Administrador</>
                : <><UserCheck size={16} /> Entrar como Empleado <ArrowRight size={15} /></>
            }
          </button>
        </form>

      </div>
    </div>
  );
}
