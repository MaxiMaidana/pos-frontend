import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// ─── AdminRoute ───────────────────────────────────────────────────────────────
// Solo deja pasar rol ADMIN. Si es EMPLEADO → /  Si no hay sesión → /login

export function AdminRoute({ children }: { children: ReactNode }) {
  const { rol } = useAuth();
  if (rol === 'EMPLEADO') return <Navigate to="/" replace />;
  if (rol !== 'ADMIN') return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// ─── SharedRoute ───────────────────────────────────────────────────────────────
// Permite el acceso a cualquier usuario autenticado (ADMIN o EMPLEADO).
// Rutas compartidas: /inventario

export function SharedRoute({ children }: { children: ReactNode }) {
  const { rol } = useAuth();
  if (rol === null) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// ─── EmpleadoRoute ────────────────────────────────────────────────────────────
// Solo deja pasar rol EMPLEADO. Si es ADMIN → /dashboard  Si no hay sesión → /login

export function EmpleadoRoute({ children }: { children: ReactNode }) {
  const { rol } = useAuth();
  if (rol === 'ADMIN') return <Navigate to="/dashboard" replace />;
  if (rol !== 'EMPLEADO') return <Navigate to="/login" replace />;
  return <>{children}</>;
}
