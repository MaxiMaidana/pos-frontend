import axios from 'axios';
// ─── Instancia centralizada ───────────────────────────────────────────────────

const apiURL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3000/api`;
const api = axios.create({
  baseURL: apiURL,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Interceptor de petición — adjunta el Bearer token ────────────────────────

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Interceptor de respuesta — maneja 401 globalmente ────────────────────────

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token inválido o expirado → limpiar sesión y redirigir al login
      localStorage.removeItem('token');
      localStorage.removeItem('pos_rol');
      localStorage.removeItem('sesion_caja');
      localStorage.removeItem('pos_vendedor');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
