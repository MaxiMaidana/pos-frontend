import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../api/axiosClient';
import SyncButton from '../components/SyncButton';
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  PackageSearch,
  Loader2,
  User,
  Tag,
  CheckCircle,
  LogOut,
  AlertTriangle,
  ChevronUp,
  X,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Producto {
  id: string;
  nombre: string;
  precio_actual: number;
  stock: number;
}

interface ItemCarrito {
  producto_id: string;
  nombre: string;
  precio_unitario_historico: number;
  cantidad: number;
}

interface MetaPaginacion {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LIMIT = 15;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatPrecio = (valor: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(valor);

// ─── Component ────────────────────────────────────────────────────────────────

export default function NuevaVenta() {
  // Catálogo
  const [productos, setProductos] = useState<Producto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorCatalogo, setErrorCatalogo] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<MetaPaginacion | null>(null);
  const [permitirStockNegativo, setPermitirStockNegativo] = useState<boolean>(
    () => localStorage.getItem('pos_stock_negativo') === 'true'
  );

  // Comanda
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [vendedorNombre, setVendedorNombre] = useState('');
  const [inputVendedor, setInputVendedor] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // ── Fetch productos ──────────────────────────────────────────────────────
  const fetchProductos = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorCatalogo(null);
      const { data } = await api.get<{ data: Producto[]; meta: MetaPaginacion }>(
        `/productos`,
        { params: { page, limit: LIMIT, soloActivos: true, ...(debouncedSearch && { search: debouncedSearch }) } }
      );
      setProductos(data.data);
      setMeta(data.meta);
    } catch (error: unknown) {
      if (error instanceof Error) {
        alert('Error en el  celu: ' + error.message);
      } else {
        alert('Error en el  celu: Error desconocido');
      }
      setErrorCatalogo('No se pudieron cargar los productos. Verificá que el servidor esté corriendo.');
    } finally {
      setIsLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => {
    fetchProductos();
  }, [fetchProductos]);

  // ── Debounce: sincroniza busqueda → debouncedSearch y resetea paginación ──
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setDebouncedSearch(busqueda);
    }, 500);
    return () => clearTimeout(timer);
  }, [busqueda]);

  // ── Persistir modo stock negativo ──────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('pos_stock_negativo', String(permitirStockNegativo));
  }, [permitirStockNegativo]);

  // ── Restaurar vendedor del turno activo ──────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('pos_vendedor');
    if (saved) setVendedorNombre(saved);
  }, []);

  // ── Gestión de turno ─────────────────────────────────────────────────────
  const fijarVendedor = () => {
    const nombre = inputVendedor.trim();
    if (!nombre) return;
    localStorage.setItem('pos_vendedor', nombre);
    setVendedorNombre(nombre);
    setInputVendedor('');
  };

  const cerrarTurno = () => {
    localStorage.removeItem('pos_vendedor');
    setVendedorNombre('');
    setCarrito([]);
  };

  // ── Total ────────────────────────────────────────────────────────────────
  const total = useMemo(
    () => carrito.reduce((acc, item) => acc + item.precio_unitario_historico * item.cantidad, 0),
    [carrito]
  );

  // ── Acciones del carrito ─────────────────────────────────────────────────
  const agregarAlCarrito = (producto: Producto) => {
    if (!permitirStockNegativo && producto.stock <= 0) return;
    setCarrito((prev) => {
      const existente = prev.find((i) => i.producto_id === producto.id);
      if (existente) {
        return prev.map((i) =>
          i.producto_id === producto.id
            ? { ...i, cantidad: i.cantidad + 1 }
            : i
        );
      }
      return [
        ...prev,
        {
          producto_id: producto.id,
          nombre: producto.nombre,
          precio_unitario_historico: producto.precio_actual,
          cantidad: 1,
        }, 
      ];
    });
  };

  const cambiarCantidad = (producto_id: string, delta: number) => {
    setCarrito((prev) =>
      prev
        .map((i) =>
          i.producto_id === producto_id ? { ...i, cantidad: i.cantidad + delta } : i
        )
        .filter((i) => i.cantidad > 0)
    );
  };

  const eliminarItem = (producto_id: string) => {
    setCarrito((prev) => prev.filter((i) => i.producto_id !== producto_id));
  };

  const cantidadEnCarrito = (producto_id: string) =>
    carrito.find((i) => i.producto_id === producto_id)?.cantidad ?? 0;

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleGenerarComanda = async () => {
    if (!vendedorNombre) {
      alert('Por favor, seleccioná un vendedor antes de continuar.');
      return;
    }
    if (carrito.length === 0) {
      alert('El carrito está vacío. Agregá al menos un producto.');
      return;
    }

    const payload = {
      vendedor_nombre: vendedorNombre,
      descuento_total: 0,
      detalles: carrito.map((item) => ({
        producto_id: item.producto_id,
        cantidad: item.cantidad,
        precio_unitario_historico: item.precio_unitario_historico,
      })),
    };

    try {
      setIsSubmitting(true);
      await api.post(`/ventas`, payload);
      alert('✅ Comanda enviada a la caja');
      setCarrito([]);
      await fetchProductos();
    } catch {
      alert('❌ Error al enviar la comanda. Intentá de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col md:flex-row h-full gap-0 relative">

      {/* ══════════════════════════════════════════════════════
          COLUMNA IZQUIERDA — Catálogo de Productos
      ══════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col bg-gray-50 border-r border-gray-200 min-w-0 pb-20 md:pb-0">

        {/* Header catálogo */}
        <div className="p-5 bg-white border-b border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold text-gray-800">Catálogo de Productos</h1>

            <div className="flex items-center gap-2">
              <SyncButton />

              {/* Toggle: Permitir stock negativo */}
              <button
              onClick={() => setPermitirStockNegativo((prev) => !prev)}
              className={`
                flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all duration-200
                ${permitirStockNegativo
                  ? 'bg-amber-50 border-amber-300 text-amber-700'
                  : 'bg-gray-50 border-gray-200 text-gray-400 hover:border-gray-300'
                }
              `}
              title="Permitir venta sin stock (Modo Transición)"
            >

              {/* Track del switch */}
              <span
                className={`
                  relative inline-flex w-8 h-4 rounded-full transition-colors duration-200 shrink-0
                  ${permitirStockNegativo ? 'bg-amber-400' : 'bg-gray-300'}
                `}
              >
                <span
                  className={`
                    absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform duration-200
                    ${permitirStockNegativo ? 'translate-x-4' : 'translate-x-0'}
                  `}
                />
              </span>
              <span className="hidden sm:inline leading-none">
                {permitirStockNegativo ? (
                  <span className="flex items-center gap-1">
                    <AlertTriangle size={11} />
                    Modo Transición
                  </span>
                ) : 'Venta sin stock'}
              </span>
            </button>
            </div>
          </div>

          <div className="relative">
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar producto..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition"
            />
          </div>

          {/* Banner de aviso cuando el modo está activo */}
          {permitirStockNegativo && (
            <div className="mt-2.5 flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium px-3 py-2 rounded-lg">
              <AlertTriangle size={13} className="shrink-0" />
              Modo Transición activo: pods vender productos sin stock.
            </div>
          )}
        </div>

        {/* Grid de productos */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* Estado: Cargando */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
              <Loader2 size={40} className="animate-spin text-indigo-400" />
              <p className="text-sm font-medium">Cargando productos...</p>
            </div>
          )}

          {/* Estado: Error */}
          {!isLoading && errorCatalogo && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3">
              <PackageSearch size={48} className="text-red-300" />
              <p className="text-sm text-red-500 font-medium max-w-xs">{errorCatalogo}</p>
            </div>
          )}

          {/* Estado: Sin resultados */}
          {!isLoading && !errorCatalogo && productos.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
              <PackageSearch size={48} className="text-gray-300" />
              <p className="text-sm font-medium">
                {busqueda ? `Sin resultados para "${busqueda}"` : 'No hay productos disponibles'}
              </p>
            </div>
          )}

          {/* Grid */}
          {!isLoading && !errorCatalogo && productos.length > 0 && (
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
              {productos.map((producto) => {
                const enCarrito = cantidadEnCarrito(producto.id);
                const sinStock = producto.stock <= 0;
                // En modo transición, solo se bloquea por falta de vendedor
                const bloqueada = !vendedorNombre || (!permitirStockNegativo && sinStock);
                return (
                  <button
                    key={producto.id}
                    onClick={() => agregarAlCarrito(producto)}
                    disabled={bloqueada}
                    className={`
                      relative text-left bg-white rounded-xl p-4 shadow-sm border transition-all duration-150
                      ${bloqueada
                        ? 'opacity-50 cursor-not-allowed border-gray-200'
                        : 'border-gray-200 hover:border-indigo-400 hover:shadow-md active:scale-[0.98] cursor-pointer'
                      }
                      ${enCarrito > 0 ? 'border-indigo-400 ring-2 ring-indigo-100' : ''}
                      ${sinStock && permitirStockNegativo && !bloqueada ? 'border-amber-300 ring-1 ring-amber-100' : ''}
                    `}
                  >
                    {/* Badge cantidad en carrito */}
                    {enCarrito > 0 && (
                      <span className="absolute top-2 right-2 bg-indigo-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                        {enCarrito}
                      </span>
                    )}

                    <div className="flex items-start gap-2 mb-3">
                      <div className={`p-1.5 rounded-lg ${sinStock && permitirStockNegativo ? 'bg-amber-50' : 'bg-indigo-50'}`}>
                        <Tag size={14} className={sinStock && permitirStockNegativo ? 'text-amber-500' : 'text-indigo-500'} />
                      </div>
                      <p className="text-sm font-semibold text-gray-800 leading-tight line-clamp-2 flex-1">
                        {producto.nombre}
                      </p>
                    </div>

                    <p className="text-lg font-black text-indigo-600 mt-auto">
                      {formatPrecio(producto.precio_actual)}
                    </p>

                    {/* Indicador de stock contextual */}
                    {sinStock ? (
                      <p className={`text-xs font-medium mt-1 flex items-center gap-1 ${
                        permitirStockNegativo ? 'text-amber-500' : 'text-red-400'
                      }`}>
                        {permitirStockNegativo ? (
                          <>
                            <AlertTriangle size={10} />
                            Stock: {producto.stock}
                          </>
                        ) : 'Sin stock'}
                      </p>
                    ) : (
                      <p className="text-xs font-medium mt-1 text-emerald-500">
                        {producto.stock} disponibles
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Paginación */}
          {!isLoading && !errorCatalogo && meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-4 pb-2">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 1}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition-colors"
              >
                ← Anterior
              </button>
              <span className="text-xs font-bold text-gray-500 bg-white border border-gray-200 px-3 py-2 rounded-lg shadow-sm">
                {page} / {meta.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page === meta.totalPages}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition-colors"
              >
                Siguiente →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          FAB — Ver Carrito (solo móvil)
      ══════════════════════════════════════════════════════ */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 p-3 bg-white border-t border-gray-200 shadow-lg">
        <button
          onClick={() => setIsCartOpen(true)}
          className="w-full flex items-center justify-between px-5 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-bold text-sm shadow-lg shadow-indigo-200 transition-all"
        >
          <div className="flex items-center gap-2">
            <ShoppingCart size={18} />
            <span>Ver Comanda</span>
          </div>
          <div className="flex items-center gap-2">
            {carrito.length > 0 && (
              <span className="bg-white text-indigo-600 text-xs font-black px-2 py-0.5 rounded-full">
                {carrito.reduce((acc, i) => acc + i.cantidad, 0)}
              </span>
            )}
            <span className="font-black">{formatPrecio(total)}</span>
            <ChevronUp size={16} />
          </div>
        </button>
      </div>

      {/* Overlay oscuro (móvil) */}
      {isCartOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setIsCartOpen(false)}
        />
      )}

      {/* ══════════════════════════════════════════════════════
          COLUMNA DERECHA — Comanda Actual
          Desktop: columna fija derecha
          Móvil: sheet desde abajo
      ══════════════════════════════════════════════════════ */}
      <div className={`
        md:w-96 md:flex md:flex-col md:bg-white md:shadow-xl md:static md:translate-y-0
        fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl
        flex flex-col
        transition-transform duration-300 ease-in-out
        max-h-[85vh] md:max-h-full
        ${isCartOpen ? 'translate-y-0' : 'translate-y-full md:translate-y-0'}
      `}>

        {/* Header comanda */}
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <ShoppingCart size={20} className="text-indigo-500" />
            <h2 className="text-lg font-bold text-gray-800">Comanda Actual</h2>
            {carrito.length > 0 && (
              <span className="ml-auto bg-indigo-100 text-indigo-600 text-xs font-bold px-2 py-0.5 rounded-full">
                {carrito.reduce((acc, i) => acc + i.cantidad, 0)} ítems
              </span>
            )}
            {/* Botón cerrar — solo móvil */}
            <button
              onClick={() => setIsCartOpen(false)}
              className="md:hidden ml-auto p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
              aria-label="Cerrar comanda"
            >
              <X size={18} />
            </button>
          </div>

          {/* Vendedor del turno */}
          {vendedorNombre ? (
            /* Píldora: turno activo */
            <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-1.5 bg-indigo-100 rounded-full shrink-0">
                  <User size={13} className="text-indigo-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest leading-none mb-0.5">
                    Turno activo
                  </p>
                  <p className="text-sm font-bold text-indigo-700 truncate">{vendedorNombre}</p>
                </div>
              </div>
              <button
                onClick={cerrarTurno}
                title="Cerrar turno"
                className="ml-2 p-1.5 rounded-lg text-indigo-400 hover:bg-indigo-100 hover:text-indigo-600 transition-colors shrink-0"
              >
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            /* Input: iniciar turno */
            <div className="flex gap-2">
              <div className="relative flex-1">
                <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400 pointer-events-none" />
                <input
                  type="text"
                  value={inputVendedor}
                  onChange={(e) => setInputVendedor(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fijarVendedor()}
                  placeholder="Nombre de quien atiende..."
                  autoComplete="off"
                  autoFocus
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-amber-300 bg-amber-50 text-sm text-gray-700 placeholder-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent transition"
                />
              </div>
              <button
                onClick={fijarVendedor}
                disabled={!inputVendedor.trim()}
                className="px-3 py-2 rounded-lg text-sm font-bold bg-amber-400 hover:bg-amber-500 active:scale-95 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
              >
                Iniciar
              </button>
            </div>
          )}
        </div>

        {/* Lista de ítems */}
        <div className="flex-1 overflow-y-auto">
          {carrito.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-3 p-6">
              <ShoppingCart size={52} strokeWidth={1.5} />
              <p className="text-sm font-medium text-gray-400 text-center">
                El carrito está vacío.
                <br />
                <span className="text-gray-300">Tocá un producto para agregarlo.</span>
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50 px-4 py-2">
              {carrito.map((item) => (
                <li key={item.producto_id} className="py-3.5">
                  {/* Nombre */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm font-semibold text-gray-800 leading-tight line-clamp-2 flex-1">
                      {item.nombre}
                    </p>
                    <button
                      onClick={() => eliminarItem(item.producto_id)}
                      className="text-gray-300 hover:text-red-400 transition-colors p-0.5 shrink-0"
                      title="Eliminar ítem"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  {/* Precio unitario + controles + subtotal */}
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-400">
                      {formatPrecio(item.precio_unitario_historico)} c/u
                    </p>

                    {/* Controles cantidad */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => cambiarCantidad(item.producto_id, -1)}
                        className="w-6 h-6 rounded-md bg-gray-100 hover:bg-red-100 hover:text-red-500 text-gray-500 flex items-center justify-center transition-colors"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="text-sm font-bold text-gray-700 w-5 text-center">
                        {item.cantidad}
                      </span>
                      <button
                        onClick={() => cambiarCantidad(item.producto_id, 1)}
                        disabled={(() => {
                          if (permitirStockNegativo) return false;
                          const prod = productos.find((p) => p.id === item.producto_id);
                          return prod ? item.cantidad >= prod.stock : false;
                        })()}
                        className="w-6 h-6 rounded-md bg-gray-100 hover:bg-indigo-100 hover:text-indigo-500 text-gray-500 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Plus size={12} />
                      </button>
                    </div>

                    {/* Subtotal */}
                    <p className="text-sm font-bold text-gray-800 min-w-[70px] text-right">
                      {formatPrecio(item.precio_unitario_historico * item.cantidad)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer — Total + botón */}
        <div className="p-5 border-t border-gray-100 bg-gray-50">
          {/* Total */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-base font-semibold text-gray-500">Total a cobrar</span>
            <span className="text-2xl font-black text-gray-900">
              {formatPrecio(total)}
            </span>
          </div>

          {/* Botón generar comanda */}
          <button
            onClick={handleGenerarComanda}
            disabled={isSubmitting || carrito.length === 0 || !vendedorNombre}
            className={`
              w-full py-4 rounded-xl text-base font-bold flex items-center justify-center gap-2.5 transition-all duration-200
              ${isSubmitting || carrito.length === 0 || !vendedorNombre
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white shadow-lg shadow-indigo-200 hover:shadow-indigo-300'
              }
            `}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <CheckCircle size={20} />
                Generar Comanda
              </>
            )}
          </button>

          {/* Hint de validación */}
          {(carrito.length === 0 || !vendedorNombre) && !isSubmitting && (
            <p className="text-xs text-center text-gray-400 mt-2">
              {!vendedorNombre
                ? 'Iniciá tu turno para comenzar a vender'
                : 'Agregá al menos un producto al carrito'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
