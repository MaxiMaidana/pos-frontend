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
  LogOut,
  AlertTriangle,
  ChevronUp,
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

interface MetaPaginacion {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface BorradorDetalle {
  producto_id: string;
  nombre: string;
  precio_unitario_historico: number;
  cantidad: number;
  stock_local?: number;
}

interface BorradorVenta {
  id: string;
  vendedor_nombre: string;
  estado: 'BORRADOR';
  detalles: BorradorDetalle[];
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

  // Alta Exprés
  const [modalAltaOpen, setModalAltaOpen] = useState(false);
  const [formAlta, setFormAlta] = useState({ nombre: '', precio_actual: '', codigo_barras: '', costo: '' });
  const [isCreando, setIsCreando] = useState(false);

  // Borradores (carritos persistidos en DB)
  const [borradores, setBorradores] = useState<BorradorVenta[]>([]);
  const [borradorActualId, setBorradorActualId] = useState<string | null>(null);
  const borradorIdRef = useRef<string | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSincronizando, setIsSincronizando] = useState(false);

  // Modal comanda
  const [modalComandaOpen, setModalComandaOpen] = useState(false);
  const [clienteNombre, setClienteNombre] = useState('');

  // ── Fetch borradores ─────────────────────────────────────────────────────
  const fetchBorradores = useCallback(async () => {
    try {
      const { data } = await api.get<{ data: BorradorVenta[] }>('/ventas', {
        params: { estado: 'BORRADOR', limit: 50 },
      });
      setBorradores(data.data ?? []);
    } catch {
      // silent — no bloquea la UI
    }
  }, []);

  useEffect(() => { fetchBorradores(); }, [fetchBorradores]);

  // Mantener la ref sincronizada con el estado para su uso en efectos
  useEffect(() => { borradorIdRef.current = borradorActualId; }, [borradorActualId]);

  // ── Cargar borrador en el carrito ─────────────────────────────────────────
  const cargarBorrador = (venta: BorradorVenta) => {
    setBorradorActualId(venta.id);
    borradorIdRef.current = venta.id;
    setCarrito(
      venta.detalles.map((d) => ({
        producto_id: d.producto_id,
        nombre: d.nombre,
        precio_unitario_historico: d.precio_unitario_historico,
        cantidad: d.cantidad,
        stock_local: d.stock_local ?? 999,
      }))
    );
  };

  // ── Sincronizar carrito ↔ backend (debounced) ─────────────────────────────
  useEffect(() => {
    if (!vendedorNombre) return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);

    // Carrito vacío + borrador existente → eliminar borrador
    if (carrito.length === 0 && borradorIdRef.current) {
      const idAEliminar = borradorIdRef.current;
      setBorradorActualId(null);
      borradorIdRef.current = null;
      api.delete(`/ventas/${idAEliminar}`).catch(() => {});
      fetchBorradores();
      return;
    }

    if (carrito.length === 0) return;

    syncTimerRef.current = setTimeout(async () => {
      const detallesPayload = carrito.map((i) => ({
        producto_id: i.producto_id,
        cantidad: i.cantidad,
        precio_unitario_historico: i.precio_unitario_historico,
      }));
      try {
        setIsSincronizando(true);
        if (!borradorIdRef.current) {
          const { data } = await api.post<BorradorVenta>('/ventas', {
            vendedor_nombre: vendedorNombre,
            estado: 'BORRADOR',
            descuento_total: 0,
            detalles: detallesPayload,
          });
          setBorradorActualId(data.id);
          borradorIdRef.current = data.id;
        } else {
          await api.put(`/ventas/${borradorIdRef.current}`, { detalles: detallesPayload });
        }
        fetchBorradores();
      } catch {
        // silent — el carrito local sigue funcionando
      } finally {
        setIsSincronizando(false);
      }
    }, 800);

    return () => { if (syncTimerRef.current) clearTimeout(syncTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carrito, vendedorNombre]);

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
    setBorradorActualId(null);
    borradorIdRef.current = null;
  };

  // Crear un carrito nuevo limpio (sin tocar los borradores existentes)
  const handleNuevoCarrito = () => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    setCarrito([]);
    setBorradorActualId(null);
    borradorIdRef.current = null;
  };

  // ── Total ────────────────────────────────────────────────────────────────
  const total = useMemo(
    () => carrito.reduce((acc, item) => acc + item.precio_unitario_historico * item.cantidad, 0),
    [carrito]
  );

  // ── Acciones del carrito ─────────────────────────────────────────────────
  const agregarAlCarrito = (producto: Producto) => {
    if (!permitirStockNegativo && producto.stock_local <= 0) {
      toast.error('Stock insuficiente');
      return;
    }
    const existente = carrito.find((i) => i.producto_id === producto.id);
    if (existente && !permitirStockNegativo && existente.cantidad >= producto.stock_local) {
      toast.error('Stock insuficiente');
      return;
    }
    setCarrito((prev) => {
      const item = prev.find((i) => i.producto_id === producto.id);
      if (item) {
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
          stock_local: producto.stock_local,
        },
      ];
    });
  };

  const cambiarCantidad = (producto_id: string, delta: number) => {
    if (delta > 0 && !permitirStockNegativo) {
      const item = carrito.find((i) => i.producto_id === producto_id);
      if (item && item.cantidad >= item.stock_local) {
        toast.error('Stock insuficiente');
        return;
      }
    }
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
      // Agregar directamente al carrito (stock_local=0, se permite por ser Alta Exprés)
      setCarrito((prev) => {
        const existe = prev.find((i) => i.producto_id === nuevo.id);
        if (existe) {
          return prev.map((i) =>
            i.producto_id === nuevo.id ? { ...i, cantidad: i.cantidad + 1 } : i
          );
        }
        return [
          ...prev,
          {
            producto_id: nuevo.id,
            nombre: nuevo.nombre,
            precio_unitario_historico: nuevo.precio_actual,
            cantidad: 1,
            stock_local: 0,
          },
        ];
      });
      toast.success('Producto creado y agregado al carrito.');
      setModalAltaOpen(false);
      setFormAlta({ nombre: '', precio_actual: '', codigo_barras: '', costo: '' });
    } catch {
      toast.error('Error al crear el producto. Intentá de nuevo.');
    } finally {
      setIsCreando(false);
    }
  };

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleAbrirModalComanda = () => {
    if (!vendedorNombre) {
      alert('Por favor, seleccioná un vendedor antes de continuar.');
      return;
    }
    if (carrito.length === 0) {
      alert('El carrito está vacío. Agregá al menos un producto.');
      return;
    }
    setClienteNombre('');
    setModalComandaOpen(true);
  };

  const handleConfirmarComanda = async () => {
    if (!borradorIdRef.current) {
      // Fallback: si el sync aún no creó el borrador, esperar un momento
      toast.error('El carrito aún se está guardando. Intentá en un segundo.');
      return;
    }
    try {
      setIsSubmitting(true);
      await api.put(`/ventas/${borradorIdRef.current}`, {
        estado: 'PENDIENTE',
        cliente_nombre: clienteNombre.trim() || undefined,
      });
      toast.success('✅ Comanda enviada a la caja');
      setCarrito([]);
      setBorradorActualId(null);
      borradorIdRef.current = null;
      setModalComandaOpen(false);
      setClienteNombre('');
      await fetchBorradores();
      await fetchProductos();
    } catch {
      toast.error('❌ Error al enviar la comanda. Intentá de nuevo.');
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

          {/* Barra de pestañas de carritos (borradores) */}
          <div className="mt-3 -mx-1 flex items-stretch border-b border-gray-200 overflow-x-auto">
            {borradores.map((b) => {
              const esActivo = borradorActualId === b.id;
              return (
                <button
                  key={b.id}
                  onClick={() => cargarBorrador(b)}
                  className={`
                    inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold whitespace-nowrap
                    border-b-2 transition-all shrink-0
                    ${
                      esActivo
                        ? 'border-indigo-500 text-indigo-700 bg-indigo-50'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 bg-transparent'
                    }
                  `}
                >
                  <User size={11} className={esActivo ? 'text-indigo-500' : 'text-gray-400'} />
                  {b.vendedor_nombre}
                  <span className={`text-[10px] font-semibold ${ esActivo ? 'text-indigo-400' : 'text-gray-400' }`}>
                    ({b.detalles.length})
                  </span>
                </button>
              );
            })}
            {/* Pestaña “+” para nuevo carrito */}
            <button
              onClick={handleNuevoCarrito}
              title="Nuevo carrito"
              className={`
                inline-flex items-center px-3 py-2 text-xs font-bold
                border-b-2 transition-all shrink-0
                ${
                  borradorActualId === null && carrito.length === 0
                    ? 'border-emerald-500 text-emerald-600 bg-emerald-50'
                    : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300'
                }
              `}
            >
              <Plus size={14} />
            </button>
            {/* Indicador de guardado */}
            {isSincronizando && (
              <span className="ml-auto self-center pr-2 text-[10px] text-gray-400 flex items-center gap-1 shrink-0">
                <Loader2 size={10} className="animate-spin" />
                Guardando...
              </span>
            )}
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
                const sinStock = producto.stock_local <= 0;
                // En modo transición, solo se bloquea por falta de vendedor
                const bloqueada = !vendedorNombre || (!permitirStockNegativo && sinStock);
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
                    {/* Badge cantidad en carrito */}
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

                    {/* Indicador de stock contextual */}
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
                        disabled={!permitirStockNegativo && item.cantidad >= item.stock_local}
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
            onClick={handleAbrirModalComanda}
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
              {/* Código de barras */}
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

              {/* Nombre */}
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

              {/* Precio */}
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

              {/* Costo */}
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
      {/* ══ Modal: Nombre de Cliente ═══════════════════════════════════════════════ */}
      {modalComandaOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setModalComandaOpen(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-50 rounded-xl">
                  <User size={16} className="text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-800">Generar Comanda</h2>
                  <p className="text-xs text-gray-400 mt-0.5">{carrito.length} productos · {formatPrecio(total)}</p>
                </div>
              </div>
              <button
                onClick={() => setModalComandaOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Nombre del Cliente <span className="font-normal text-gray-400 normal-case">(opcional)</span>
              </label>
              <input
                type="text"
                value={clienteNombre}
                onChange={(e) => setClienteNombre(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConfirmarComanda()}
                placeholder="Ej: Juan García"
                autoFocus
                autoComplete="off"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition"
              />
              <p className="text-xs text-gray-400 mt-2">
                Se mostrará en la caja para identificar el pedido.
              </p>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
              <button
                onClick={() => setModalComandaOpen(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarComanda}
                disabled={isSubmitting}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                  isSubmitting
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-white shadow-sm shadow-emerald-100'
                }`}
              >
                {isSubmitting
                  ? <><Loader2 size={15} className="animate-spin" /> Enviando...</>
                  : <><CheckCircle size={15} /> Confirmar Comanda</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
