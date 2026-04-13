# POS Frontend — Documentación del Proyecto

## ¿Qué es este proyecto?

Es el **frontend de un Sistema de Punto de Venta (POS)** desarrollado en React + Vite + TypeScript + Tailwind CSS. Fue diseñado para un negocio con **dos locales físicos** y una administradora que lo monitorea de forma remota desde la web.

---

## Arquitectura General

El sistema funciona en dos modos bien diferenciados según desde dónde se acceda:

### Modo POS Local (`isWebMode = false`)
Corre en la computadora física de cada local. Apunta a un **backend Fastify** que corre en la misma máquina (o red local), el cual usa **SQLite como base de datos local** (vía Prisma). Apto para trabajar offline.

### Modo Web Administrador (`isWebMode = true`)
Se despliega en **Vercel**. La dueña lo accede desde cualquier navegador para ver el dashboard y gestionar el inventario. En el futuro se conectará directamente a **Supabase** (PostgreSQL en la nube) sin pasar por el backend local.

La detección del modo se hace con:
```ts
// src/utils/env.ts
export const isWebMode = window.location.hostname.includes('vercel.app');
```

---

## Stack Tecnológico

| Capa | Tecnología |
|---|---|
| UI | React 18 + TypeScript |
| Build | Vite 5 |
| Estilos | Tailwind CSS 3 |
| Routing | React Router DOM v7 |
| HTTP (local) | Axios — cliente centralizado en `src/api/axiosClient.ts` |
| Notificaciones | Sonner (toasts) |
| Íconos | Lucide React |
| CSV | PapaParse |
| Autenticación | JWT (token guardado en `localStorage`) |
| Base de datos local | SQLite vía Prisma (en el backend Fastify) |
| Base de datos en la nube | Supabase (PostgreSQL) |

---

## Estructura de Carpetas

```
src/
├── api/
│   └── axiosClient.ts       # Instancia Axios con Bearer token e interceptor global de 401
├── components/
│   ├── ProtectedRoute.tsx   # Guards de ruta por rol (ADMIN / EMPLEADO / SHARED)
│   └── SyncButton.tsx       # Botón que dispara POST /sync/manual al backend local
├── context/
│   └── AuthContext.tsx      # Estado global de autenticación (rol, login, logout)
├── pages/
│   ├── Login.tsx            # Pantalla de login con dos tabs: Empleado y Administrador
│   ├── NuevaVenta.tsx       # Catálogo de productos + carrito + generación de comandas
│   ├── Caja.tsx             # Cobro de comandas, apertura/cierre de turno de caja
│   ├── Inventario.tsx       # ABM de productos, CSV, vista de stock por local (L1/L2)
│   └── Dashboard.tsx        # Estadísticas de recaudación, ventas, desglose de pagos
└── utils/
    ├── env.ts               # Detección del entorno (local vs Vercel)
    └── constants.ts         # Recargos de crédito, cuotas, etc.
```

---

## Flujo de Trabajo Completo

### 1. Autenticación

El usuario ingresa su PIN → el backend valida y devuelve un JWT → se guarda en `localStorage('token')` → el rol (`ADMIN` o `EMPLEADO`) se persiste en `localStorage('pos_rol')`.

En modo web (`isWebMode = true`), la pantalla de login abre directamente el tab de **Administrador**. En el local físico, abre el tab de **Empleado**.

---

### 2. Nueva Venta (Empleado)

1. El empleado registra su nombre para iniciar turno (se persiste en `localStorage('pos_vendedor')`).
2. Busca productos en el catálogo con debounce de 500ms, paginados de a 15.
3. Agrega productos al carrito. Con **Modo Transición** activo, puede vender aunque el stock figure en 0.
4. Confirma → `POST /ventas` → la comanda queda en estado `PENDIENTE` esperando ser cobrada en caja.

---

### 3. Cobro en Caja

1. El cajero abre su turno (`POST /caja/:id/abrir`) registrando el monto inicial de efectivo. La sesión se persiste en `localStorage('sesion_caja')`.
2. Ve las comandas en estado `PENDIENTE` y selecciona una para cobrar.
3. Distribuye el pago en uno o varios métodos: efectivo, débito, crédito (con recargo automático por cuotas) o transferencia.
4. Confirma el cobro → `POST /caja/cobrar`.
5. Al finalizar el día, cuenta el efectivo del cajón y cierra el turno → `POST /caja/:id/cerrar`.

**Manejo de desincronización:** si el backend rechaza el cierre con error 400 o 404 (la sesión ya no existe en SQLite), el frontend muestra un aviso, limpia automáticamente el `localStorage` y devuelve al usuario a la pantalla de apertura — evitando que quede "atrapado".

---

### 4. Inventario

- Lista todos los productos con stock separado por local gracias a la arquitectura multi-sucursal:
  - **🏠 L1** → `stock_local` (el propio negocio)
  - **🏪 L2** → `stock_otro` (el otro local, descargado desde la nube vía sync)
- Crear, editar y eliminar productos (solo en modo local con autenticación).
- **Importación masiva** desde CSV — columnas esperadas: `nombre`, `codigo_barras`, `precio_actual`, `stock`. Se procesa en batches de 500 registros.
- **Exportación** a CSV del inventario completo.
- Toggle **"En caja"**: activa o desactiva si el producto aparece en el catálogo de ventas (no lo borra).

---

### 5. Dashboard (solo Administrador)

Muestra métricas de un período seleccionado:

- Recaudación total (con y sin recargos de crédito)
- Cantidad de ventas totales vs anuladas
- Productos con stock bajo
- Desglose por método de pago (efectivo, débito, crédito, transferencia)
- Rendimiento por vendedor (ventas y recaudación)

---

## Sincronización Local ↔ Nube

El backend local tiene un motor de sincronización (`sync.service.ts`) que corre de forma automática o se dispara manualmente desde el botón **"Forzar Sync"** de la UI (`POST /sync/manual`).

### Push (subida hacia Supabase)
El backend sube las ventas, movimientos de caja y cambios de inventario que tienen `synced_at = null`, marcándolos como sincronizados una vez subidos.

### Pull (bajada desde Supabase)
El backend descarga desde Supabase el catálogo actualizado y el stock del otro local (`StockTienda`) para guardarlo en SQLite local. Esto permite que, incluso sin internet, el frontend siga mostrando el badge **L2** con el último valor conocido.

---

## Roles y Permisos

| Pantalla | ADMIN | EMPLEADO |
|---|---|---|
| Dashboard | ✅ | ❌ |
| Inventario (ver) | ✅ | ✅ |
| Inventario (editar / importar) | ✅ | ❌ |
| Nueva Venta | ❌ | ✅ |
| Caja / Cobros | ❌ | ✅ |

El ADMIN en Vercel solo puede ver el Dashboard y el Inventario.
El empleado en el local físico solo puede crear ventas y cobrar.

---

## Seguridad

- Cada request a la API lleva el token JWT en el header `Authorization: Bearer <token>`.
- El interceptor de Axios captura cualquier respuesta `401` globalmente: limpia el `localStorage` y redirige al login automáticamente.
- El logout del empleado bloquea la salida si hay una caja abierta, obligando a hacer el cierre de turno primero.

---

## Variables de Entorno

```env
# URL del backend Fastify corriendo en la red local
VITE_API_URL=http://192.168.x.x:3000/api

# Futuro — para modo Web con Supabase directo (sin pasar por el backend local)
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```
