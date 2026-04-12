import { useState } from 'react';
import { Toaster } from 'sonner';
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import {
  ShoppingCart,
  Wallet,
  PackageOpen,
  BarChart3,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  LogOut,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import NuevaVenta from './pages/NuevaVenta';
import Caja from './pages/Caja';
import Inventario from './pages/Inventario';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AdminRoute, EmpleadoRoute, SharedRoute } from './components/ProtectedRoute';
import { isWebMode } from './utils/env';
import { useNombreTienda } from './hooks/useNombreTienda';

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS_CAJERO = [
  { to: '/',           icon: ShoppingCart, label: 'Nueva Venta'   },
  { to: '/caja',       icon: Wallet,       label: 'Caja / Cobros' },
  { to: '/inventario', icon: PackageOpen,  label: 'Inventario'    },
];

const NAV_ITEMS_ADMIN = [
  { to: '/dashboard',  icon: BarChart3,   label: 'Dashboard'  },
  { to: '/inventario', icon: PackageOpen, label: 'Inventario' },
];

type NavItem = (typeof NAV_ITEMS_CAJERO)[number];

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({
  navItems,
  collapsed,
  onToggleCollapse,
  onClose,
  mobile = false,
}: {
  navItems: NavItem[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onClose?: () => void;
  mobile?: boolean;
}) {
  const location = useLocation();
  const { logout, rol } = useAuth();
  const nombreTienda = useNombreTienda();

  const [blockMessage, setBlockMessage] = useState<string | null>(null);

  // ── Logout con bloqueo de caja ──────────────────────────────────────────
  const handleSmartLogout = () => {
    // Admin siempre puede salir
    if (rol === 'ADMIN') {
      logout();
      return;
    }

    // Cajero: verificar si tiene caja abierta en localStorage
    const raw = localStorage.getItem('sesion_caja');
    if (raw) {
      try {
        const sesion = JSON.parse(raw) as { abierta?: boolean };
        if (sesion?.abierta === true) {
          // Auto-expandir el sidebar para que el toast sea visible
          if (collapsed && !mobile) onToggleCollapse();
          setBlockMessage(
            'Tenés una caja abierta. Andá a Caja / Cobros y realizá el Cierre de Turno antes de salir.'
          );
          return;
        }
      } catch {
        // dato malformado → permitir logout igualmente
      }
    }

    logout();
  };

  return (
    <aside
      className={`
        flex flex-col bg-white shadow-xl h-full transition-all duration-300 ease-in-out
        ${mobile ? 'w-64' : collapsed ? 'w-16' : 'w-64'}
      `}
    >
      {/* Header de la marca */}
      <div className={`flex items-center border-b border-gray-100 shrink-0 ${collapsed && !mobile ? 'justify-center px-3 py-5' : 'justify-between px-5 py-5'}`}>
        {(!collapsed || mobile) && (
          <div className="min-w-0">
            <h2 className="text-xl font-black text-indigo-600 tracking-tight truncate">POS Edge</h2>
            {nombreTienda && <p className="text-xs text-gray-400 mt-0.5 truncate">{nombreTienda}</p>}
          </div>
        )}

        {/* Botón colapsar (desktop) / cerrar (mobile) */}
        {mobile ? (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors shrink-0"
            aria-label="Cerrar menú"
          >
            <X size={18} />
          </button>
        ) : (
          <button
            onClick={onToggleCollapse}
            className={`p-1.5 rounded-lg text-gray-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors shrink-0 ${collapsed ? 'mx-auto' : ''}`}
            aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        )}
      </div>

      {/* Badge de rol */}
      {(!collapsed || mobile) && (
        <div className="px-5 pt-3 pb-1">
          <span
            className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
              rol === 'ADMIN'
                ? 'bg-violet-100 text-violet-600'
                : 'bg-indigo-100 text-indigo-600'
            }`}
          >
            <ShieldCheck size={9} />
            {rol === 'ADMIN' ? 'Administrador' : 'Empleado'}
          </span>
        </div>
      )}

      {/* Nav items */}
      <nav className={`flex-1 py-3 space-y-1 ${collapsed && !mobile ? 'px-2' : 'px-3'}`}>
        {navItems.map(({ to, icon: Icon, label }) => {
          const isActive = location.pathname === to;
          return (
            <div key={to} className="relative group">
              <Link
                to={to}
                onClick={mobile ? onClose : undefined}
                className={`
                  flex items-center rounded-xl transition-all duration-150 font-medium text-sm
                  ${collapsed && !mobile ? 'justify-center p-3' : 'gap-3 px-3 py-2.5'}
                  ${isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                    : 'text-gray-600 hover:bg-indigo-50 hover:text-indigo-600'
                  }
                `}
                aria-label={label}
              >
                <Icon size={20} className="shrink-0" />
                {(!collapsed || mobile) && <span className="truncate">{label}</span>}
              </Link>

              {/* Tooltip solo en desktop colapsado */}
              {collapsed && !mobile && (
                <div className="
                  pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3
                  bg-gray-800 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg
                  whitespace-nowrap opacity-0 group-hover:opacity-100
                  transition-opacity duration-150 z-50
                  before:content-[''] before:absolute before:right-full before:top-1/2
                  before:-translate-y-1/2 before:border-4 before:border-transparent
                  before:border-r-gray-800
                ">
                  {label}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer — logout */}
      <div className={`border-t border-gray-100 shrink-0 ${collapsed && !mobile ? 'p-2' : 'p-3'}`}>
        {(!collapsed || mobile) && (
          <p className="text-[10px] text-gray-300 font-medium px-2 mb-2">v1.0.0 · POS Edge</p>
        )}

        {/* Toast de bloqueo — caja abierta */}
        {blockMessage && (!collapsed || mobile) && (
          <div className="mb-2 p-3 bg-red-50 border border-red-200 rounded-xl">
            <div className="flex items-start gap-2">
              <AlertTriangle size={13} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-600 leading-snug flex-1">
                <span className="font-bold block mb-0.5">🛑 Acción denegada</span>
                {blockMessage}
              </p>
              <button
                onClick={() => setBlockMessage(null)}
                className="text-red-400 hover:text-red-600 shrink-0 transition-colors"
                aria-label="Cerrar aviso"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        )}
        <div className="relative group">
          <button
            onClick={handleSmartLogout}
            className={`
              w-full flex items-center rounded-xl transition-all duration-150 font-medium text-sm
              text-red-500 hover:bg-red-50 hover:text-red-600
              ${collapsed && !mobile ? 'justify-center p-3' : 'gap-3 px-3 py-2.5'}
            `}
            aria-label="Cerrar sesión"
          >
            <LogOut size={20} className="shrink-0" />
            {(!collapsed || mobile) && <span className="truncate">Cerrar Sesión</span>}
          </button>
          {collapsed && !mobile && (
            <div className="
              pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3
              bg-gray-800 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg
              whitespace-nowrap opacity-0 group-hover:opacity-100
              transition-opacity duration-150 z-50
              before:content-[''] before:absolute before:right-full before:top-1/2
              before:-translate-y-1/2 before:border-4 before:border-transparent
              before:border-r-gray-800
            ">
              Cerrar Sesión
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

// ─── AppContent ───────────────────────────────────────────────────────────────

function AppContent() {
  const { rol } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const isAuth = rol !== null;
  const navItems = (rol === 'ADMIN' || isWebMode) ? NAV_ITEMS_ADMIN : NAV_ITEMS_CAJERO;

  return (
    <div className="flex h-screen bg-gray-100 font-sans overflow-hidden">

      {isAuth && (
        <>
          {/* ── Sidebar Desktop (md+) ─────────────────────────────────── */}
          <div className="hidden md:flex shrink-0">
            <Sidebar
              navItems={navItems}
              collapsed={isSidebarCollapsed}
              onToggleCollapse={() => setIsSidebarCollapsed((v) => !v)}
            />
          </div>

          {/* ── Overlay Mobile ────────────────────────────────────────── */}
          {isMobileMenuOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
              onClick={() => setIsMobileMenuOpen(false)}
            />
          )}

          {/* ── Sidebar Mobile (drawer) ───────────────────────────────── */}
          <div
            className={`
              fixed inset-y-0 left-0 z-50 md:hidden
              transition-transform duration-300 ease-in-out
              ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
            `}
          >
            <Sidebar
              navItems={navItems}
              collapsed={false}
              onToggleCollapse={() => {}}
              onClose={() => setIsMobileMenuOpen(false)}
              mobile
            />
          </div>
        </>
      )}

      {/* ── Main ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Top bar mobile — solo cuando autenticado */}
        {isAuth && (
          <header className="md:hidden flex items-center gap-3 bg-white border-b border-gray-200 px-4 py-3 shrink-0 shadow-sm">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-indigo-600 transition-colors"
              aria-label="Abrir menú"
            >
              <Menu size={20} />
            </button>
            <span className="text-base font-black text-indigo-600 tracking-tight">POS Edge</span>
          </header>
        )}

        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/login"      element={<Login />}                                        />
            <Route path="/"           element={isWebMode ? <Navigate to="/dashboard" replace /> : <EmpleadoRoute><NuevaVenta /></EmpleadoRoute>}      />
            <Route path="/caja"       element={isWebMode ? <Navigate to="/dashboard" replace /> : <EmpleadoRoute><Caja /></EmpleadoRoute>}            />
            <Route path="/inventario" element={<SharedRoute><Inventario /></SharedRoute>}         />
            <Route path="/dashboard"  element={<AdminRoute><Dashboard /></AdminRoute>}           />
            <Route path="*"           element={<Navigate to="/login" replace />}                 />
          </Routes>
        </main>
      </div>

    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="bottom-right" richColors />
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
