const { hostname } = window.location;

// Si el dominio incluye "vercel.app", sabemos 100% seguro que es la web de la dueña.
// Cualquier otra cosa (localhost, 192.168.x.x, 10.0.x.x) será el Punto de Venta local.
// TODO: si algún día se usa un dominio propio para el panel admin, esta detección
// se rompe (dejaría de incluir 'vercel.app'). Ajustar a una variable de entorno
// (ej. VITE_WEB_MODE) en vez de inferir por hostname.
export const isWebMode =
hostname.includes('vercel.app');