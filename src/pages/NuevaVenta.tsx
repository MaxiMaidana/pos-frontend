import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
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
  AlertTriangle,
  ChevronUp,
  ChevronDown,
  X,
  Zap,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Producto {
  id: string;
  nombre: string;
  precio_actual: number;
  stock_local: number;
  marca?: string;
  categoria?: string;
}

interface ItemCarrito {
  producto_id: string;
  nombre: string;
  precio_unitario_historico: number;
  cantidad: number;
  stock_local: number;
}

interface Vendedor {
  id: string;
  nombre: string;
}

interface DetalleVenta {
  producto_id: string;
  cantidad: number;
  precio_unitario_historico: number;
  nombre?: string;
  producto?: { nombre: string; stock_local?: number };
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

  // Vendedores & Venta Borrador
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [selectedVendedorId, setSelectedVendedorId] = useState('');
  const [ventaId, setVentaId] = useState<string | null>(null);
  const ventaIdRef = useRef<string | null>(null);
  const [isLoadingVenta, setIsLoadingVenta] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Comanda
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Modal Confirmar Comanda
  const [modalConfirmarOpen, setModalConfirmarOpen] = useState(false);
  const [clienteNombre, setClienteNombre] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Alta Exprés
  const [modalAltaOpen, setModalAltaOpen] = useState(false);
  const [formAlta, setFormAlta] = useState({ nombre: '', precio_actual: '', codigo_barras: '', costo: '' });
  const [isCreando, setIsCreando] = useState(false);

  // ── Keep ventaIdRef in sync ────────────────────────────────────────────
  useEffect(() => {
    ventaIdRef.current = ventaId;
  }, [ventaId]);

  // ── Fetch vendedores on mount ─────────────────────────────────────────
  useEffect(() => {
    api.get('/vendedores')
      .then(({ data }) => {
        console.log('Vendedores recibidos:', data);
        const lista = Array.isArray(data) ? data : data.data ?? [];
        setVendedores(lista);
      })
      .catch((err) => {
        console.error('Error al cargar vendedores:', err);
        toast.error('No se pudieron cargar los vendedores');
      });
  }, []);

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
        alert('Error en el celu: ' + error.message);
      } else {
        alert('Error en el celu: Error desconocido');
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

  // ── Fetch venta borrador al cambiar vendedor ──────────────────────────────
  useEffect(() => {
    if (!selectedVendedorId) {
      setCarrito([]);
      setVentaId(null);
      return;
    }

    let cancelled = false;
    setIsLoadingVenta(true);

    api.get('/ventas', { params: { vendedorId: selectedVendedorId, estado: 'BORRADOR' } })
      .then(({ data }) => {
        if (cancelled) return;
        const ventas = Array.isArray(data) ? data : data.data ?? [];
        if (ventas.length > 0) {
          const venta = ventas[0];
          setVentaId(venta.id);
          setCarrito(
            (venta.detalles || []).map((d: DetalleVenta) => ({
              producto_id: d.producto_id,
              nombre: d.nombre || d.producto?.nombre || 'Producto',
              precio_unitario_historico: d.precio_unitario_historico,
              cantidad: d.cantidad,
              stock_local: d.producto?.stock_local ?? 0,
            }))
          );
        } else {
          setVentaId(null);
          setCarrito([]);
        }
      })
      .catch(() => {
        if (cancelled) return;
        toast.error('Error al buscar venta en borrador');
        setVentaId(null);
        setCarrito([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingVenta(false);
      });

    return () => { cancelled = true; };
  }, [selectedVendedorId]);

  // ── Total ────────────────────────────────────────────────────────────────
  const total = useMemo(
    () => carrito.reduce((acc, item) => acc + item.precio_unitario_historico * item.cantidad, 0),
    [carrito]
  );

  // ── Sync carrito con backend ─────────────────────────────────────────────
  const syncCarrito = useCallback(async (items: ItemCarrito[]) => {
    if (!selectedVendedorId) return;

    const detalles = items.map((item) => ({
      producto_id: item.producto_id,
      cantidad: item.cantidad,
      precio_unitario_historico: item.precio_unitario_historico,
    }));

    try {
      setIsSyncing(true);
      if (!ventaIdRef.current) {
        const { data } = await api.post('/ventas/borrador', {
          vendedorId: selectedVendedorId,
          detalles,
        });
        const newId = data.id ?? data.data?.id;
        setVentaId(newId);
      } else {
        await api.put(`/ventas/${ventaIdRef.current}/borrador`, { detalles });
      }
    } catch {
      toast.error('Error al sincronizar la comanda');
    } finally {
      setIsSyncing(false);
    }
  }, [selectedVendedorId]);

  // ── Acciones del carrito ─────────────────────────────────────────────────
  const agregarAlCarrito = (producto: Producto) => {
    if (!selectedVendedorId) {
      toast.error('Seleccioná un vendedor primero');
      return;
    }
    if (!permitirStockNegativo && producto.stock_local <= 0) {
      toast.error('Stock insuficiente');
      return;
    }
    const existente = carrito.find((i) => i.producto_id === producto.id);
    if (existente && !permitirStockNegativo && existente.cantidad >= producto.stock_local) {
      toast.error('Stock insuficiente');
      return;
    }

    const nuevoCarrito = (() => {
      const item = carrito.find((i) => i.producto_id === producto.id);
      if (item) {
        return carrito.map((i) =>
          i.producto_id === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i
        );
      }
      return [
        ...carrito,
        {
          producto_id: producto.id,
          nombre: producto.nombre,
          precio_unitario_historico: producto.precio_actual,
          cantidad: 1,
          stock_local: producto.stock_local,
        },
      ];
    })();

    setCarrito(nuevoCarrito);
    syncCarrito(nuevoCarrito);
  };

  const cambiarCantidad = (producto_id: string, delta: number) => {
    if (delta > 0 && !permitirStockNegativo) {
      const item = carrito.find((i) => i.producto_id === producto_id);
      if (item && item.cantidad >= item.stock_local) {
        toast.error('Stock insuficiente');
        return;
      }
    }
    const nuevoCarrito = carrito
      .map((i) =>
        i.producto_id === producto_id ? { ...i, cantidad: i.cantidad + delta } : i
      )
      .filter((i) => i.cantidad > 0);

    setCarrito(nuevoCarrito);
    syncCarrito(nuevoCarrito);
  };

  const eliminarItem = (producto_id: string) => {
    const nuevoCarrito = carrito.filter((i) => i.producto_id !== producto_id);
    setCarrito(nuevoCarrito);
    syncCarrito(nuevoCarrito);
  };

  const cantidadEnCarrito = (producto_id: string) =>
    carrito.find((i) => i.producto_id === producto_id)?.cantidad ?? 0;

  // ── Alta Exprés ─────────────────────────────────────────────────────────
  const handleCrearProducto = async () => {
    const nombre = formAlta.nombre.trim();
    const precio = parseFloat(formAlta.precio_actual);
    if (!nombre) {
      toast.error('El nombre del producto es obligatorio.');
      return;
    }
    if (isNaN(precio) || precio <= 0) {
      toast.error('Ingresá un precio válido mayor a cero.');
      return;
    }
    try {
      setIsCreando(true);
      const { data: nuevo } = await api.post<Producto>(`/productos`, {
        nombre,
        precio_actual: precio,
        stock: 0,
        ...(formAlta.costo && !isNaN(parseFloat(formAlta.costo)) ? { costo: parseFloat(formAlta.costo) } : {}),
        ...(formAlta.codigo_barras.trim() && { codigo_barras: formAlta.codigo_barras.trim() }),
      });

      const nuevoCarrito = (() => {
        const existe = carrito.find((i) => i.producto_id === nuevo.id);
        if (existe) {
          return carrito.map((i) =>
            i.producto_id === nuevo.id ? { ...i, cantidad: i.cantidad + 1 } : i
          );
        }
        return [
          ...carrito,
          {
            producto_id: nuevo.id,
            nombre: nuevo.nombre,
            precio_unitario_historico: nuevo.precio_actual,
            cantidad: 1,
            stock_local: 0,
          },
        ];
      })();

      setCarrito(nuevoCarrito);
      if (selectedVendedorId) syncCarrito(nuevoCarrito);
      toast.success('Producto creado y agregado al carrito.');
      setModalAltaOpen(false);
      setFormAlta({ nombre: '', precio_actual: '', codigo_barras: '', costo: '' });
    } catch {
      toast.error('Error al crear el producto. Intentá de nuevo.');
    } finally {
      setIsCreando(false);
    }
  };

  // ── Confirmar Comanda ────────────────────────────────────────────────────
  const handleAbrirConfirmar = () => {
    if (!selectedVendedorId) {
      toast.error('Seleccioná un vendedor antes de continuar.');
      return;
    }
    if (carrito.length === 0) {
      toast.error('El carrito está vacío. Agregá al menos un producto.');
      return;
    }
    setClienteNombre('');
    setModalConfirmarOpen(true);
  };

  const handleConfirmarComanda = async () => {
    if (!ventaIdRef.current) {
      toast.error('No hay una venta activa para confirmar.');
      return;
    }
    try {
      setIsSubmitting(true);
      await api.post(`/ventas/${ventaIdRef.current}/confirmar`, {
        ...(clienteNombre.trim() && { cliente_nombre: clienteNombre.trim() }),
      });
      toast.success('✅ Comanda confirmada y enviada a la caja');

      // Reset carrito pero mantener vendedor seleccionado
      setCarrito([]);
      setVentaId(null);
      setModalConfirmarOpen(false);
      setClienteNombre('');
      await fetchProductos();
    } catch {
      toast.error('Error al confirmar la comanda. Intentá de nuevo.');
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

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar producto..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition"
              />
            </div>
            <button
              onClick={() => setModalAltaOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-600 text-xs font-bold hover:bg-indigo-100 hover:border-indigo-300 transition-colors shrink-0"
              title="Crear producto rápido y agregar al carrito"
            >
              <Zap size={14} />
              <span className="hidden sm:inline">Crear Rápido</span>
            </button>
          </div>

          {/* Banner de aviso cuando el modo está activo */}
          {permitirStockNegativo && (
            <div className="mt-2.5 flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium px-3 py-2 rounded-lg">
              <AlertTriangle size={13} className="shrink-0" />
              Modo Transición activo: podés vender productos sin stock.
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
                const sinStock = producto.stock_local <= 0;
                const bloqueada = !selectedVendedorId || isLoadingVenta || (!permitirStockNegativo && sinStock);
                return (
                  <button
                    key={producto.id}
                    onClick={() => agregarAlCarrito(producto)}
                    disabled={bloqueada}
                    className={`
                      relative text-left bg-white rounded-xl p-3 shadow-sm border transition-all duration-150
                      ${bloqueada
                        ? 'opacity-50 cursor-not-allowed border-gray-200'
                        : 'border-gray-200 hover:border-indigo-400 hover:shadow-md active:scale-[0.98] cursor-pointer'
                      }
                      ${enCarrito > 0 ? 'border-indigo-400 ring-2 ring-indigo-100' : ''}
                      ${sinStock && permitirStockNegativo && !bloqueada ? 'border-amber-300 ring-1 ring-amber-100' : ''}
                    `}
                  >
                    {enCarrito > 0 && (
                      <span className="absolute top-2 right-2 bg-indigo-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                        {enCarrito}
                      </span>
                    )}

                    <div className="flex items-start gap-2 mb-2">
                      <div className={`p-1.5 rounded-lg ${sinStock && permitirStockNegativo ? 'bg-amber-50' : 'bg-indigo-50'}`}>
                        <Tag size={14} className={sinStock && permitirStockNegativo ? 'text-amber-500' : 'text-indigo-500'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 leading-tight line-clamp-2">
                          {producto.nombre}
                        </p>
                        {(producto.marca || producto.categoria) && (
                          <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                            {[producto.marca, producto.categoria].filter(Boolean).join(' | ')}
                          </p>
                        )}
                      </div>
                    </div>

                    <p className="text-lg font-black text-indigo-600 mt-auto">
                      {formatPrecio(producto.precio_actual)}
                    </p>

                    {sinStock ? (
                      <p className={`text-xs font-medium mt-1 flex items-center gap-1 ${
                        permitirStockNegativo ? 'text-amber-500' : 'text-red-400'
                      }`}>
                        {permitirStockNegativo ? (
                          <>
                            <AlertTriangle size={10} />
                            Stock: {producto.stock_local}
                          </>
                        ) : 'Sin stock'}
                      </p>
                    ) : (
                      <p className="text-xs font-medium mt-1 text-emerald-500">
                        {producto.stock_local} disponibles
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
              <span className="bg-indigo-100 text-indigo-600 text-xs font-bold px-2 py-0.5 rounded-full">
                {carrito.reduce((acc, i) => acc + i.cantidad, 0)} ítems
              </span>
            )}
            {isSyncing && (
              <Loader2 size={14} className="animate-spin text-indigo-400 ml-1" />
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

          {/* ── Dropdown de Vendedor ─────────────────────────────────────── */}
          <div className="relative">
            <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none z-10" />
            <select
              value={selectedVendedorId}
              onChange={(e) => setSelectedVendedorId(e.target.value)}
              className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 text-sm font-semibold text-gray-700 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition cursor-pointer"
            >
              <option value="">Seleccionar Vendedor</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>{v.nombre}</option>
              ))}
            </select>
            <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
          </div>

          {/* Indicador de carga de borrador */}
          {isLoadingVenta && (
            <div className="flex items-center gap-2 mt-2.5 text-indigo-500 text-xs font-medium">
              <Loader2 size={13} className="animate-spin" />
              Buscando comanda en borrador…
            </div>
          )}

          {/* Indicador de venta activa */}
          {!isLoadingVenta && selectedVendedorId && ventaId && (
            <div className="flex items-center gap-2 mt-2.5 bg-emerald-50 border border-emerald-200 text-emerald-600 text-xs font-medium px-3 py-1.5 rounded-lg">
              <CheckCircle size={12} />
              Borrador cargado — los cambios se guardan automáticamente
            </div>
          )}
        </div>

        {/* Lista de ítems */}
        <div className="flex-1 overflow-y-auto">
          {!selectedVendedorId ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-3 p-6">
              <User size={52} strokeWidth={1.5} />
              <p className="text-sm font-medium text-gray-400 text-center">
                Seleccioná un vendedor
                <br />
                <span className="text-gray-300">para comenzar a armar la comanda.</span>
              </p>
            </div>
          ) : carrito.length === 0 ? (
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

                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-400">
                      {formatPrecio(item.precio_unitario_historico)} c/u
                    </p>

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
                        disabled={!permitirStockNegativo && item.cantidad >= item.stock_local}
                        className="w-6 h-6 rounded-md bg-gray-100 hover:bg-indigo-100 hover:text-indigo-500 text-gray-500 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Plus size={12} />
                      </button>
                    </div>

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
          <div className="flex items-center justify-between mb-4">
            <span className="text-base font-semibold text-gray-500">Total a cobrar</span>
            <span className="text-2xl font-black text-gray-900">
              {formatPrecio(total)}
            </span>
          </div>

          <button
            onClick={handleAbrirConfirmar}
            disabled={isSubmitting || carrito.length === 0 || !selectedVendedorId || isLoadingVenta}
            className={`
              w-full py-4 rounded-xl text-base font-bold flex items-center justify-center gap-2.5 transition-all duration-200
              ${isSubmitting || carrito.length === 0 || !selectedVendedorId || isLoadingVenta
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white shadow-lg shadow-indigo-200 hover:shadow-indigo-300'
              }
            `}
          >
            <CheckCircle size={20} />
            Confirmar Comanda
          </button>

          {(carrito.length === 0 || !selectedVendedorId) && !isSubmitting && (
            <p className="text-xs text-center text-gray-400 mt-2">
              {!selectedVendedorId
                ? 'Seleccioná un vendedor para comenzar a vender'
                : 'Agregá al menos un producto al carrito'}
            </p>
          )}
        </div>
      </div>

      {/* ══ Modal: Confirmar Comanda ════════════════════════════════════════════ */}
      {modalConfirmarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setModalConfirmarOpen(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 rounded-xl">
                  <CheckCircle size={16} className="text-indigo-600" />
                </div>
                <h2 className="text-base font-bold text-gray-800">Confirmar Comanda</h2>
              </div>
              <button
                onClick={() => setModalConfirmarOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Resumen */}
            <div className="px-6 py-5 space-y-4">
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</span>
                  <span className="text-lg font-black text-gray-900">{formatPrecio(total)}</span>
                </div>
                <p className="text-xs text-gray-400">
                  {carrito.reduce((acc, i) => acc + i.cantidad, 0)} productos · Vendedor: {vendedores.find((v) => v.id === selectedVendedorId)?.nombre}
                </p>
              </div>

              {/* Nombre del cliente */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Nombre del Cliente / Referencia <span className="font-normal text-gray-400">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={clienteNombre}
                  onChange={(e) => setClienteNombre(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleConfirmarComanda()}
                  placeholder="Ej: Mesa 3, Juan, etc."
                  autoFocus
                  autoComplete="off"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition"
                />
              </div>
            </div>

            {/* Acciones */}
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
              <button
                onClick={() => setModalConfirmarOpen(false)}
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarComanda}
                disabled={isSubmitting}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                  isSubmitting
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                }`}
              >
                {isSubmitting
                  ? <><Loader2 size={15} className="animate-spin" /> Enviando...</>
                  : <><CheckCircle size={15} /> Confirmar</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal: Alta Exprés ══════════════════════════════════════════════════ */}
      {modalAltaOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setModalAltaOpen(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 rounded-xl">
                  <Zap size={16} className="text-indigo-600" />
                </div>
                <h2 className="text-base font-bold text-gray-800">Alta Exprés</h2>
              </div>
              <button
                onClick={() => setModalAltaOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Formulario */}
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Código de barras <span className="font-normal text-gray-400">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={formAlta.codigo_barras}
                  onChange={(e) => setFormAlta((prev) => ({ ...prev, codigo_barras: e.target.value }))}
                  placeholder="Escaneá o escribí el código…"
                  autoComplete="off"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Nombre <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formAlta.nombre}
                  onChange={(e) => setFormAlta((prev) => ({ ...prev, nombre: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && handleCrearProducto()}
                  placeholder="Ej: Coca Cola 500ml"
                  autoFocus
                  autoComplete="off"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Precio de venta <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400 pointer-events-none">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formAlta.precio_actual}
                    onChange={(e) => setFormAlta((prev) => ({ ...prev, precio_actual: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && handleCrearProducto()}
                    placeholder="0.00"
                    className="w-full pl-7 pr-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Costo <span className="font-normal text-gray-400">(opcional)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400 pointer-events-none">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formAlta.costo}
                    onChange={(e) => setFormAlta((prev) => ({ ...prev, costo: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && handleCrearProducto()}
                    placeholder="0.00"
                    className="w-full pl-7 pr-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition"
                  />
                </div>
              </div>
            </div>

            {/* Acciones */}
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
              <button
                onClick={() => { setModalAltaOpen(false); setFormAlta({ nombre: '', precio_actual: '', codigo_barras: '', costo: '' }); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCrearProducto}
                disabled={isCreando || !formAlta.nombre.trim() || !formAlta.precio_actual}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                  isCreando || !formAlta.nombre.trim() || !formAlta.precio_actual
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                }`}
              >
                {isCreando
                  ? <><Loader2 size={15} className="animate-spin" /> Creando...</>
                  : <><Zap size={15} /> Guardar y agregar</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
