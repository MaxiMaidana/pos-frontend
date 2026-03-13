import { createContext, useContext, useState, type ReactNode } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole = 'ADMIN' | 'EMPLEADO';

interface AuthContextType {
  rol: UserRole | null;
  loginAdmin: () => void;
  loginEmpleado: () => void;
  logout: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [rol, setRol] = useState<UserRole | null>(() => {
    const saved = localStorage.getItem('pos_rol');
    return saved === 'ADMIN' || saved === 'EMPLEADO' ? (saved as UserRole) : null;
  });

  const loginAdmin = () => {
    localStorage.setItem('pos_rol', 'ADMIN');
    setRol('ADMIN');
  };

  const loginEmpleado = () => {
    localStorage.setItem('pos_rol', 'EMPLEADO');
    setRol('EMPLEADO');
  };

  const logout = () => {
    localStorage.removeItem('pos_rol');
    localStorage.removeItem('sesion_caja');
    localStorage.removeItem('pos_vendedor');
    setRol(null);
  };

  return (
    <AuthContext.Provider value={{ rol, loginAdmin, loginEmpleado, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
