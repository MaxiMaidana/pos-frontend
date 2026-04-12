import { useState, useEffect } from 'react';
import api from '../api/axiosClient';
import { isWebMode } from '../utils/env';

/**
 * Devuelve el nombre del local actual.
 * - En modo web (Vercel): retorna "Panel Administrativo Global" sin hacer ninguna petición.
 * - En modo local: consulta GET /config/identidad y usa nombre_tienda.
 *   Si la petición falla, retorna una cadena vacía (sin romper la UI).
 */
export function useNombreTienda(): string {
  const [nombre, setNombre] = useState<string>(
    isWebMode ? 'Panel Administrativo Global' : ''
  );

  useEffect(() => {
    if (isWebMode) return;
    api
      .get<{ nombre_tienda: string }>('/config/identidad')
      .then(({ data }) => {
        if (data?.nombre_tienda) setNombre(data.nombre_tienda);
      })
      .catch(() => {
        // Falla silenciosa: no interrumpir el flujo de login/sidebar
      });
  }, []);

  return nombre;
}
