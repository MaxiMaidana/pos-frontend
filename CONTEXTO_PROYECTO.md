# POS Edge — Contexto Completo del Proyecto

> Documento de referencia para pasarle a otro modelo de IA. Contiene toda la información necesaria para entender la estructura, arquitectura, flujos y decisiones de diseño del proyecto.

---

## 1. ¿Qué es esto?

**POS Edge** es el frontend de un **Sistema de Punto de Venta (POS)** hecho en React. Se usa en un negocio real con **dos locales físicos** y una dueña/administradora que lo monitorea de forma remota vía web.

**Stack principal:**
- React 18 + TypeScript + Vite 5
- Tailwind CSS 3
- React Router DOM v7
- Axios (HTTP)
- Sonner (toasts/notificaciones)
- Lucide React (íconos)
- PapaParse (import/export CSV)

---

## 2. Arquitectura Dual — Local vs. Web

El frontend funciona en **dos modos** completamente distintos según el hostname:

```ts
// src/utils/env.ts
export const isWebMode = window.location.hostname.includes('vercel.app');
```

| Aspecto | Modo POS Local (`isWebMode = false`) | Modo Web Admin (`isWebMode = true`) |
|---|---|---|
| **Dónde corre** | PC del local (LAN) | Vercel (internet) |
| **Usuarios** | Empleados (cajeros/vendedores) | Dueña/administradora |
| **Backend** | Fastify local en la misma red (SQLite vía Prisma) | Futuro: Supabase directo |
| **Pantallas** | Nueva Venta, Caja, Inventario, Historial | Dashboard, Inventario, Historial |
| **Autenticación** | PIN de empleado | PIN de administrador |
| **Funciona offline** | Sí (SQLite local) | No |

---

## 3. Estructura de Carpetas

```
src/
├── api/
│   └── axiosClient.ts          # Instancia Axios: Bearer token + interceptor 401 → auto-logout
├── components/
│   ├── ProtectedRoute.tsx       # Guards: AdminRoute, EmpleadoRoute, SharedRoute
│   └── SyncButton.tsx           # Botón POST /sync/manual → sincroniza Local ↔ Supabase
├── context/
│   └── AuthContext.tsx           # Provider con rol (ADMIN|EMPLEADO), login, logout
├── hooks/
│   └── useNombreTienda.ts       # GET /config/identidad → nombre del local actual
├── pages/
│   ├── Login.tsx                 # Pantalla de login con tabs Empleado/Admin
│   ├── NuevaVenta.tsx            # Catálogo + Carrito + Generación de Comandas (BORRADOR → PENDIENTE)
│   ├── Caja.tsx                  # Cobro de comandas, apertura/cierre de turno, arqueo
│   ├── Inventario.tsx            # CRUD productos, import/export CSV, stock dual L1/L2
│   ├── Dashboard.tsx             # Métricas: recaudación, vendedores, desglose, stock bajo
│   └── HistorialVentas.tsx       # Lista de tickets pasados con detalle y búsqueda
└── utils/
    ├── env.ts                    # isWebMode
    └── constants.ts              # RECARGOS_CREDITO, CUOTAS_CREDITO
```

---

## 4. Autenticación y Seguridad

### Flujo
1. Usuario ingresa PIN en `/login`
2. `POST /auth/login` con `{ rol, password }` → backend devuelve `{ token }` (JWT)
3. Token se guarda en `localStorage('token')`; rol en `localStorage('pos_rol')`
4. Axios intercepta **cada request** y adjunta `Authorization: Bearer <token>`
5. Si cualquier respuesta es **401**, el interceptor limpia localStorage y redirige a `/login`

### Roles y Permisos

| Pantalla | ADMIN | EMPLEADO |
|---|---|---|
| Dashboard | ✅ | ❌ |
| Inventario (ver) | ✅ | ✅ |
| Inventario (editar/importar) | ✅ | ❌ |
| Nueva Venta | ❌ | ✅ |
| Caja / Cobros | ❌ | ✅ |
| Historial Ventas | ✅ | ✅ (sin columna Total) |

**Guards** implementados en `ProtectedRoute.tsx`:
- `AdminRoute`: solo ADMIN (EMPLEADO → `/`, sin sesión → `/login`)
- `EmpleadoRoute`: solo EMPLEADO (ADMIN → `/dashboard`, sin sesión → `/login`)
- `SharedRoute`: cualquier sesión autenticada

### Bloqueo de Logout
Si el empleado tiene una **caja abierta** (`localStorage('sesion_caja')` con `abierta: true`), el botón de logout muestra un mensaje de error y **no permite salir** hasta que haga el cierre de turno.

---

## 5. Rutas del Frontend

```tsx
"/"            → isWebMode ? redirect("/dashboard") : <EmpleadoRoute><NuevaVenta /></EmpleadoRoute>
"/caja"        → isWebMode ? redirect("/dashboard") : <EmpleadoRoute><Caja /></EmpleadoRoute>
"/inventario"  → <SharedRoute><Inventario /></SharedRoute>
"/historial"   → <SharedRoute><HistorialVentas /></SharedRoute>
"/dashboard"   → <AdminRoute><Dashboard /></AdminRoute>
"/login"       → <Login />
"*"            → redirect("/login")
```

---

## 6. Componente por Componente — Detalle Completo

### 6.1 — `axiosClient.ts` (API Client)

```
Base URL: VITE_API_URL || http://${window.location.hostname}:3000/api
```

- Interceptor de request: adjunta Bearer token desde `localStorage('token')`
- Interceptor de response: si recibe 401 → limpia `token`, `pos_rol`, `sesion_caja`, `pos_vendedor` y redirige a `/login`

---

### 6.2 — `Login.tsx` (199 líneas)

**Estados:** `tab`, `password`, `showPassword`, `error`, `isLoading`

**Flujo:**
- En `isWebMode`, abre directamente en tab "admin" y esconde el tab de empleado
- `POST /auth/login` → guarda token → llama `loginAdmin()` o `loginEmpleado()` del AuthContext
- Auto-redirect si ya está logueado (ADMIN → `/dashboard`, EMPLEADO → `/`)
- Muestra nombre de la tienda mediante `useNombreTienda()`

---

### 6.3 — `NuevaVenta.tsx` (1024 líneas) — ⚡ RECIENTEMENTE REFACTORIZADO

**Concepto central: 1 vendedor = 1 carrito**

**Nuevo flujo (sistema de Dropdown explícito):**

1. Al montar, hace `GET /api/vendedores` para llenar un **Select/Dropdown** en la cabecera del carrito.
2. Hasta que no se seleccione un vendedor, **no se pueden agregar productos**.
3. Al seleccionar vendedor → `GET /api/ventas?vendedorId=X&estado=BORRADOR`:
   - Si hay venta → carga sus detalles en el carrito
   - Si no hay → carrito vacío
4. Cada acción (agregar, quitar, eliminar) **sincroniza automáticamente** con el backend:
   - Sin venta existente → `POST /api/ventas` (`estado: 'BORRADOR'`, `vendedorId`)
   - Con venta → `PUT /api/ventas/:id` (actualiza detalles)
5. Al tocar **"Confirmar Comanda"** → modal pide **nombre del cliente** (opcional) → `PUT /api/ventas/:id` con `estado: 'PENDIENTE'` y `cliente_nombre`
6. Tras confirmar → **reset total**: carrito vacío, dropdown vuelve a "Seleccionar Vendedor"

**Tipos definidos:**
- `Producto` — id, nombre, precio_actual, stock_local, marca?, categoria?
- `ItemCarrito` — producto_id, nombre, precio_unitario_historico, cantidad, stock_local
- `Vendedor` — id, nombre
- `DetalleVenta` — producto_id, cantidad, precio_unitario_historico, nombre?, producto?
- `MetaPaginacion` — total, page, limit, totalPages

**Estados (useState):**
- Catálogo: `productos`, `isLoading`, `errorCatalogo`, `busqueda`, `debouncedSearch`, `page`, `meta`, `permitirStockNegativo`
- Vendedor: `vendedores`, `selectedVendedorId`, `ventaId`, `isLoadingVenta`, `isSyncing`
- Carrito: `carrito`, `isCartOpen`
- Modal confirmar: `modalConfirmarOpen`, `clienteNombre`, `isSubmitting`
- Alta Exprés: `modalAltaOpen`, `formAlta`, `isCreando`

**API endpoints:**
| Método | Ruta | Propósito |
|---|---|---|
| `GET` | `/vendedores` | Listar vendedores para el dropdown |
| `GET` | `/productos?page&limit&soloActivos&search` | Catálogo paginado |
| `GET` | `/ventas?vendedorId&estado=BORRADOR` | Buscar venta borrador del vendedor |
| `POST` | `/ventas` | Crear venta borrador (primer producto agregado) |
| `PUT` | `/ventas/:id` | Actualizar detalles / Confirmar comanda |
| `POST` | `/productos` | Alta Exprés: crear producto rápido |

**Features notables:**
- **Modo Transición**: toggle que permite vender sin stock (para migración de datos)
- **Alta Exprés**: modal para crear un producto nuevo rápido y agregarlo al carrito en un solo paso
- **Sincronización optimista**: usa `useRef` para `ventaId` evitando stale closures en callbacks async
- **Layout responsive**: catálogo a la izquierda, carrito a la derecha (desktop) o bottom sheet (móvil)
- **Búsqueda debounced**: 500ms de delay
- **Paginación**: 15 productos por página

---

### 6.4 — `Caja.tsx` (1440 líneas)

**Concepto: apertura/cierre de turno de caja + cobro de comandas**

**Tipos definidos:**
- `Venta` — id, vendedor_nombre, estado, descuento_total, total, detalles[], created_at?
- `DetalleVenta` — producto_id, nombre_producto, producto{nombre}, cantidad, precio_unitario_historico
- `LineaPago` — metodo (EFECTIVO|TARJETA|TRANSFERENCIA), monto, tipoTarjeta?, cuotas?
- `SesionCaja` — abierta, cajero, caja_id, sesion_id?
- `CajaDisponible` — id, nombre
- `FormMovimiento` — tipo (RETIRO|INGRESO), monto, motivo
- `Arqueo` — monto_inicial, ventas_efectivo?, total_retiros?, total_ingresos?, total_esperado?

**Flujo:**

1. **Apertura de turno**: seleccionar caja → nombre del cajero → monto inicial → `POST /caja/abrir` → sesión se guarda en `localStorage('sesion_caja')`
2. **Cobro**: lista las ventas en estado `PENDIENTE` → selecciona una → distribuye el pago en líneas (multi-pago) → `POST /ventas/:id/cobrar`
3. **Pagos soportados**: EFECTIVO, TARJETA (DEBITO/CREDITO con cuotas y recargo automático), TRANSFERENCIA
4. **Recargos de crédito**: según `constants.ts` → 1 cuota=5%, 2=7%, 3=10%, 6=15%
5. **Movimientos**: retiros/ingresos de efectivo → `POST /caja/:id/movimiento`
6. **Anulación**: marca venta como ANULADA vía `PATCH /ventas/:id`
7. **Cierre de turno**: muestra arqueo (`GET /caja/:id/arqueo`) → ingresa monto contado → `POST /caja/:id/cerrar`

**API endpoints:**
| Método | Ruta | Propósito |
|---|---|---|
| `GET` | `/ventas?estado=PENDIENTE&limit=200` | Listar comandas pendientes |
| `GET` | `/caja` | Listar cajas disponibles |
| `POST` | `/caja/abrir` | Abrir turno: `{caja_id, cajero_nombre, monto_inicial}` |
| `POST` | `/ventas/:id/cobrar` | Cobrar: `{caja_id, pagos[]}` |
| `PATCH` | `/ventas/:id` | Anular: `{estado: 'ANULADA', sesion_id}` |
| `POST` | `/caja/:id/movimiento` | Movimiento: `{tipo, monto, motivo, sesion_id}` |
| `GET` | `/caja/:id/arqueo` | Datos de cierre |
| `POST` | `/caja/:id/cerrar` | Cerrar: `{monto_efectivo_contado, sesion_id}` |

**Features notables:**
- Sesión de caja persistida en localStorage → sobrevive recargas
- Bloquea cobros en mobile (pantalla chica) → muestra aviso
- Multi-pago con distribución visual del monto restante
- Tooltip de recargos con tabla de cuotas
- Resiliencia: si backend responde 400/404 al cerrar (sesión inexistente), limpia localStorage y desbloquea UI
- Helpers inline: `formatPrecio()`, `shortId()`, `calcularTotal()`

---

### 6.5 — `Inventario.tsx` (1154 líneas)

**Concepto: CRUD de productos con stock dual (L1/L2) y CSV**

**Tipos definidos:**
- `Producto` — id, nombre, codigo_barras?, precio_actual, precio_sin_redondear?, costo?, margen?, marca?, categoria?, proveedor?, stock_local, stock_otro?, stock_minimo, activo?
- `FormProducto` — todo como strings para el formulario
- `MetaPaginacion` — total, page, limit, totalPages

**API endpoints:**
| Método | Ruta | Propósito |
|---|---|---|
| `GET` | `/productos?page&limit&search&stockExacto` | Lista paginada |
| `POST` | `/productos` | Crear producto |
| `PUT` | `/productos/:id` | Editar producto |
| `DELETE` | `/productos/:id` | Eliminar producto |
| `GET` | `/productos/export` | Exportar CSV |
| `POST` | `/productos/import` | Importar CSV (batches de 500) |
| `PATCH` | `/productos/:id/toggle-activo` | Toggle visibilidad en POS ("En Caja") |

**Features notables:**
- Tabla paginada con búsqueda debounced (500ms texto, 400ms stock)
- Filtro de stock exacto (ej: "ver todo con stock = 0")
- Calculadora de precio: `precio = Math.ceil(costo × margen)` + muestra precio sin redondear
- Import CSV: parsea precios en formato AR (`$16.909,20`), procesado en batches de 500
- Export CSV como blob descargable
- Stock dual: L1 (propio) con badge azul, L2 (otro local) con badge verde
- Toggle "En Caja" para activar/desactivar productos sin borrarlos
- Soporte scanner: Enter en código de barras → focus al campo de precio

---

### 6.6 — `Dashboard.tsx` (1282 líneas)

**Concepto: panel de métricas y analíticas para la administradora**

**Tipos definidos:**
- `Stats` — recaudacionTotal, recaudacionBase?, recaudacionNeta?, ventasTotales, ventasCanceladas, productosStockBajo, desglosePagosGlobal?
- `VendedorAnalitica` — vendedor_nombre/nombre/vendedor, cantidadVentas, recaudacionTotal, cantidadAnuladas
- `DesglosePagos` — EFECTIVO, TARJETA_DEBITO, TARJETA_CREDITO, TRANSFERENCIA
- `CajaAnalitica` — sesión con todos los campos de arqueo
- `Analiticas` — { rendimientoVendedores[], reporteCajas[] }
- `VentaDetalle` — para modal drill-down
- `ProductoStock` — producto con stocks[] multi-tienda
- `Tienda` — id, nombre/nombre_tienda

**API endpoints:**
| Método | Ruta | Propósito |
|---|---|---|
| `GET` | `/tiendas` | Listar tiendas para selector |
| `GET` | `/config/identidad` | Identidad del local (modo local) |
| `GET` | `/dashboard/stats?fecha&tienda_id` | Métricas resumen |
| `GET` | `/dashboard/analiticas?fecha&tienda_id` | Vendedores + sesiones de caja |
| `POST` | `/sync/manual` | Sincronizar con la nube |
| `GET` | `/ventas?fecha&estado=PAGADA` | Drill-down recaudación |
| `GET` | `/ventas?fecha&vendedor_nombre=...` | Drill-down por vendedor |
| `GET` | `/ventas?fecha&sesion_id=...` | Drill-down por sesión de caja |
| `GET` | `/productos?stockBajo=true&tienda_id` | Drill-down stock bajo |

**Features notables:**
- Selector de fecha con botón "Hoy"
- Multi-tienda: selector de sucursal, auto-detecta la local vía `/config/identidad`
- 4 cards clickables: Recaudación, Ventas, Anuladas, Stock Bajo → cada una abre drill-down modal
- Tabla de rendimiento por vendedor con totales
- Cards de sesión de caja con arqueo completo (esperado vs contado, diferencia con color)
- Cálculo inverso de intereses de crédito: descompone la recaudación en base + recargo
- Recaudación Neta (sin intereses) y desglose por método de pago
- Modal de drill-down con 3 modos: recaudación, ventas, stock

---

### 6.7 — `HistorialVentas.tsx` (459 líneas)

**Concepto: lista de tickets históricos con búsqueda y detalle**

**Tipos definidos:**
- `Venta` — id, created_at, estado (PAGADA|ANULADA), vendedor_nombre, total, detalles[], pagos[]
- `DetalleVenta` — nombre, cantidad, precio_unitario, subtotal
- `PagoVenta` — metodo, monto
- `MetaPaginacion`

**API endpoints:**
| Método | Ruta | Propósito |
|---|---|---|
| `GET` | `/ventas?page&limit&fecha&search` o `&id` | Lista paginada (detecta UUID vs texto) |

**Features notables:**
- Filtro por fecha
- Búsqueda inteligente: detecta UUID → busca por `id`, sino por `search`
- Debounce 400ms
- Tabla paginada (20 x página)
- Column "Total" oculta para rol EMPLEADO
- Badges de estado: Pagada (verde), Anulada (rojo)
- Modal detalle de ticket: productos, pagos, total

---

## 7. Sincronización Local ↔ Nube

El backend tiene un motor de sync (`sync.service.ts`) que se dispara manualmente con el botón **"Forzar Sync"** (`POST /sync/manual`) visible en el catálogo.

### Push (subida hacia Supabase)
Sube ventas, movimientos de caja y cambios de inventario que tienen `synced_at = null`.

### Pull (descarga desde Supabase)
Descarga el catálogo actualizado y el stock del **otro local** (`StockTienda`) → se guarda en SQLite local como `stock_otro`. Esto permite que la UI muestre el badge **L2** incluso sin internet.

---

## 8. Recargos de Tarjeta de Crédito

Definidos en `src/utils/constants.ts`:

```ts
export const RECARGOS_CREDITO: Record<number, number> = {
  1: 0.05,   // 1 cuota → 5%
  2: 0.07,   // 2 cuotas → 7%
  3: 0.10,   // 3 cuotas → 10%
  6: 0.15,   // 6 cuotas → 15%
};
export const CUOTAS_CREDITO = [1, 2, 3, 6] as const;
```

Se aplican automáticamente en `Caja.tsx` al seleccionar crédito. El `Dashboard.tsx` hace el cálculo inverso para mostrar la recaudación neta (sin intereses del banco).

---

## 9. Persistencia en localStorage

| Key | Contenido | Usado por |
|---|---|---|
| `token` | JWT del backend | axiosClient (interceptor) |
| `pos_rol` | `'ADMIN'` o `'EMPLEADO'` | AuthContext |
| `sesion_caja` | `{ abierta, cajero, caja_id, sesion_id }` (JSON) | Caja.tsx |
| `pos_stock_negativo` | `'true'` o `'false'` | NuevaVenta.tsx (Modo Transición) |

---

## 10. Flujo de Vida de una Venta

```
BORRADOR → PENDIENTE → PAGADA
                     ↘ ANULADA
```

1. **BORRADOR**: el vendedor selecciona productos en NuevaVenta. Se crea con `POST /ventas` y se edita en vivo con `PUT /ventas/:id`. Existe silenciosamente en el backend.
2. **PENDIENTE**: el vendedor toca "Confirmar Comanda" → pasa a PENDIENTE con nombre de cliente opcional. Aparece en la lista de Caja para ser cobrada.
3. **PAGADA**: el cajero la cobra desde Caja → `POST /ventas/:id/cobrar`, descuenta stock.
4. **ANULADA**: el cajero cancela la venta desde Caja → `PATCH /ventas/:id { estado: 'ANULADA' }`, restaura stock.

---

## 11. Layout y Diseño UI

- **Sidebar collapsible** con tooltips al colapsar (desktop)
- **Hamburger drawer** en mobile
- **Responsive**: NuevaVenta usa split-view (catálogo | carrito) en desktop, bottom-sheet en mobile
- **Bottom bar mobile**: Caja bloquea el cobro en pantalla chica
- **Toasts**: `sonner` en top-right, 3 segundos, colores contextiales (success, error)
- **Modales**: overlay backdrop-blur para Alta Exprés, Confirm Comanda, Detalle Ticket, Arqueo, Movimientos
- **Branding**: "POS Edge" en indigo-600, badges de rol (violet para admin, indigo para empleado)

---

## 12. Variables de Entorno

```env
VITE_API_URL=http://192.168.x.x:3000/api     # Backend Fastify local
VITE_SUPABASE_URL=https://xxxx.supabase.co     # Futuro: Web Admin directo
VITE_SUPABASE_ANON_KEY=eyJ...                  # Futuro: Web Admin directo
```

---

## 13. Resumen de Endpoints del Backend (API)

### Auth
| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/auth/login` | `{ rol, password }` → `{ token }` |

### Productos
| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/productos` | Lista paginada con filtros |
| `POST` | `/productos` | Crear producto |
| `PUT` | `/productos/:id` | Editar producto |
| `DELETE` | `/productos/:id` | Eliminar producto |
| `PATCH` | `/productos/:id/toggle-activo` | Toggle visibilidad |
| `GET` | `/productos/export` | Export CSV |
| `POST` | `/productos/import` | Import CSV (batch) |

### Vendedores
| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/vendedores` | Lista de vendedores |

### Ventas
| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/ventas` | Lista con filtros (estado, vendedorId, fecha, search, id) |
| `POST` | `/ventas` | Crear venta (BORRADOR) |
| `PUT` | `/ventas/:id` | Actualizar venta (detalles, estado, cliente_nombre) |
| `PATCH` | `/ventas/:id` | Cambiar estado (ANULADA) |
| `POST` | `/ventas/:id/cobrar` | Cobrar: `{ caja_id, pagos[] }` |

### Caja
| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/caja` | Listar cajas disponibles |
| `POST` | `/caja/abrir` | Abrir turno |
| `POST` | `/caja/:id/movimiento` | Retiro o Ingreso de efectivo |
| `GET` | `/caja/:id/arqueo` | Datos de cierre |
| `POST` | `/caja/:id/cerrar` | Cerrar turno |

### Dashboard
| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/dashboard/stats` | Métricas resumen |
| `GET` | `/dashboard/analiticas` | Vendedores + sesiones de caja |

### Configuración
| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/config/identidad` | Nombre del local actual |
| `GET` | `/tiendas` | Lista de tiendas/sucursales |

### Sincronización
| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/sync/manual` | Forzar sync local ↔ Supabase |

---

## 14. Estadísticas del Código

| Archivo | Líneas | useState | API calls | Modales | Interfaces |
|---|---|---|---|---|---|
| Login.tsx | 199 | 5 | 1 | 0 | 1 |
| NuevaVenta.tsx | 1024 | 17 | 6 | 2 | 5 |
| Caja.tsx | 1440 | 16 | 7 | 2 | 9 |
| Inventario.tsx | 1154 | 17 | 6 | 2 | 4 |
| Dashboard.tsx | 1282 | 17 | 7+ | 1 (3 modos) | 10 |
| HistorialVentas.tsx | 459 | 8 | 1 | 1 | 4 |
| **Total** | **~5558** | **80** | **~28** | **8+** | **33** |

**Otros archivos:**
- `App.tsx` (~350 líneas): routing, sidebar, mobile drawer
- `axiosClient.ts` (~42 líneas): Axios + interceptors
- `AuthContext.tsx` (~60 líneas): provider de rol
- `ProtectedRoute.tsx` (~35 líneas): guards de ruta
- `SyncButton.tsx` (~30 líneas): botón de sync
- `useNombreTienda.ts` (~25 líneas): hook de identidad
- `constants.ts` (~20 líneas): recargos
- `env.ts` (~6 líneas): detección de modo
