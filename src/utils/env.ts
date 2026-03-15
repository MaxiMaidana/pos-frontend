const { hostname } = window.location;

// Si el dominio incluye "vercel.app", sabemos 100% seguro que es la web de la dueña.
// Cualquier otra cosa (localhost, 192.168.x.x, 10.0.x.x) será el Punto de Venta local.
export const isWebMode = 
hostname.includes('vercel.app');