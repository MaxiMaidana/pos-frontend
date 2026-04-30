import { useState, useEffect } from 'react';
import api from '../api/axiosClient';
import { RECARGOS_CREDITO } from '../utils/constants';
import PaymentConfig from '../components/PaymentConfig';
import { isWebMode } from '../utils/env';
import {
  DollarSign,
  ShoppingBag,
  XCircle,
  AlertTriangle,
  Calendar,
  Building2,
  User,
  CreditCard,
  ArrowRightLeft,
  Banknote,
  BarChart3,
  RefreshCw,
  X,
  Loader2,
  Receipt,
  Package,
  Barcode,
  Store,
  Search,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Stats {
  recaudacionTotal: number;
  /** Recaudación sin recargos de crédito (campo enviado por el backend actualizado) */
  recaudacionBase?: number;
  /** Alias alternativo que algunos backends pueden enviar */
  recaudacionNeta?: number;
  ventasTotales: number;
  ventasCanceladas: number;
  productosStockBajo: number;
  desglosePagosGlobal?: {
    EFECTIVO: number;
    TARJETA?: number;                // legacy — puede venir en backends viejos
    TARJETA_DEBITO?: number;
    TARJETA_CREDITO?: number;        // monto bruto cobrado al cliente
    TARJETA_CREDITO_BASE?: number;   // monto neto sin recargo
    TARJETA_CREDITO_RECARGO?: number;// recargo del banco
    TRANSFERENCIA: number;
  };
}

interface VendedorAnalitica {
  vendedor_nombre?: string;
  nombre?: string;
  vendedor?: string;
  cantidadVentas: number;
  recaudacionTotal: number;
  cantidadAnuladas: number;
}

interface DesglosePagos {
  EFECTIVO: number;
  TARJETA?: number;          // legacy
  TARJETA_DEBITO?: number;
  TARJETA_CREDITO?: number;
  TRANSFERENCIA: number;
}

interface CajaAnalitica {
  id: string;
  caja_id?: string;
  caja?: string;
  sesion_id?: string;
  nombre: string;
  cajero_nombre: string;
  estado: 'ABIERTA' | 'CERRADA' | string;
  monto_inicial: number;
  ventas_efectivo?: number;       // Nuevos campos del backend
  ingresos?: number;              // Alias posible del backend
  retiros?: number;               // Alias posible del backend
  pagos?: { efectivo?: number };  // Alias posible del backend
  total_ingresos?: number;        // Ingresos manuales registrados
  total_retiros?: number;         // Retiros manuales registrados
  monto_esperado: number;
  monto_cierre: number | null;
  desglosePagos: DesglosePagos;
  fecha_apertura?: string;
}

interface Analiticas {
  rendimientoVendedores: VendedorAnalitica[];
  reporteCajas: CajaAnalitica[];
}

interface DetalleVenta {
  cantidad: number;
  producto?: { nombre?: string };
  producto_nombre?: string;
}

interface PagoVenta {
  metodo: string;   // 'EFECTIVO' | 'TARJETA_DEBITO' | 'TARJETA_CREDITO' | 'TRANSFERENCIA'
  monto: number;
  cuotas?: number;
}

interface VentaDetalle {
  id: string;
  created_at: string;
  estado: string;
  total: number;
  detalles?: DetalleVenta[];
  pagos?: PagoVenta[];
}

interface ProductoStock {
  id: string;
  nombre: string;
  codigo_barras?: string;
  stock_local: number;
  stock_otro?: number | null;
  stock_minimo?: number;
  precio_actual?: number;
  marca?: string;
  proveedor?: string;
  stocks?: { tienda_id: string; cantidad: number }[];
}

interface Tienda {
  id: string;
  nombre?: string;
  nombre_tienda?: string;
}

interface IdentidadConfig {
  nombre_tienda?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────


// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatPrecio = (valor: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(valor);

const hoy = () => new Date().toLocaleDateString('en-CA');

const formatFechaLegible = (fecha: string) => {
  const [year, month, day] = fecha.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="h-3 bg-gray-200 rounded w-28" />
        <div className="w-10 h-10 bg-gray-200 rounded-xl" />
      </div>
      <div className="h-8 bg-gray-200 rounded w-36 mb-2" />
      <div className="h-3 bg-gray-100 rounded w-20" />
    </div>
  );
}

function SkeletonTable({ rows = 4 }: { rows?: number }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-pulse">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="w-8 h-8 bg-gray-200 rounded-lg" />
        <div className="h-4 bg-gray-200 rounded w-40" />
      </div>
      <div className="divide-y divide-gray-50">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-6 py-4 flex gap-4">
            <div className="h-3 bg-gray-200 rounded flex-1" />
            <div className="h-3 bg-gray-100 rounded w-16" />
            <div className="h-3 bg-gray-100 rounded w-20" />
            <div className="h-3 bg-gray-100 rounded w-10" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [fecha, setFecha] = useState<string>(hoy);
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const [tiendaSeleccionada, setTiendaSeleccionada] = useState<string>('');
  const [filtroInicialResuelto, setFiltroInicialResuelto] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [analiticas, setAnaliticas] = useState<Analiticas>({ rendimientoVendedores: [], reporteCajas: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Modal drill-down
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTipo, setModalTipo] = useState<'venta' | 'stock' | 'recaudacion'>('venta');
  const [modalTitle, setModalTitle] = useState('');
  const [ventasDetalle, setVentasDetalle] = useState<VentaDetalle[]>([]);
  const [productosStock, setProductosStock] = useState<ProductoStock[]>([]);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [totalInteresesCredito, setTotalInteresesCredito] = useState(0);
  const [busquedaStock, setBusquedaStock] = useState('');
  const [totalStockBajo, setTotalStockBajo] = useState(0);

  // ── Carga de sucursales ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const fetchTiendas = async () => {
      try {
        const response = await api.get<Tienda[] | { data?: Tienda[] }>(`/tiendas`);
        const tiendasData = Array.isArray(response.data)
          ? response.data
          : Array.isArray(response.data?.data)
            ? response.data.data
            : [];

        if (!cancelled) {
          setTiendas(tiendasData);

          if (isWebMode) {
            setTiendaSeleccionada('');
          } else {
            try {
              const identidadRes = await api.get<IdentidadConfig | { data?: IdentidadConfig }>(`/config/identidad`);
              const identidadRaw = identidadRes.data;
              const identidad: IdentidadConfig =
                identidadRaw && typeof identidadRaw === 'object' && 'data' in identidadRaw
                  ? (identidadRaw.data ?? {})
                  : (identidadRaw as IdentidadConfig);

              const nombreTiendaActual = (identidad?.nombre_tienda ?? '').trim().toLowerCase();
              const tiendaMatch = tiendasData.find((tienda) => {
                const nombre = (tienda.nombre ?? tienda.nombre_tienda ?? '').trim().toLowerCase();
                return nombre && nombre === nombreTiendaActual;
              });

              if (tiendaMatch?.id) {
                setTiendaSeleccionada(tiendaMatch.id);
              }
            } catch (error) {
              console.error('Dashboard: error al cargar identidad local desde /config/identidad', error);
            }
          }
        }
      } catch (error) {
        console.error('Dashboard: error al cargar sucursales desde /tiendas', error);
        if (!cancelled) {
          setTiendas([]);
        }
      } finally {
        if (!cancelled) {
          setFiltroInicialResuelto(true);
        }
      }
    };

    fetchTiendas();
    return () => { cancelled = true; };
  }, []);

  // ── Fetch de datos ───────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      if (!filtroInicialResuelto) return;

      try {
        setLoading(true);
        setError(null);
        setStats(null);
        setAnaliticas({ rendimientoVendedores: [], reporteCajas: [] });

        const params = {
          fecha,
          ...(tiendaSeleccionada ? { tienda_id: tiendaSeleccionada } : {}),
        };

        const [statsRes, analiticasRes] = await Promise.all([
          api.get<Stats>(`/dashboard/stats`, { params }),
          api.get<Analiticas>(`/dashboard/analiticas`, { params }),
        ]);

        if (!cancelled) {
          console.log('Data Stats:', statsRes.data);
          console.log('Data Analiticas:', analiticasRes.data);
          setStats(statsRes.data);
          setAnaliticas(analiticasRes.data);
        }
      } catch {
        if (!cancelled) {
          setError('No se pudo cargar la información del dashboard. Verificá que el servidor esté corriendo.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [fecha, retryCount, tiendaSeleccionada, filtroInicialResuelto]);

  // ── Sincronización manual con la nube ────────────────────────────────────
  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await api.post(`/sync/manual`);
    } catch {
      // El endpoint de sync puede no existir; continuamos con el refetch igual
    } finally {
      setRetryCount((c) => c + 1);
      setIsSyncing(false);
    }
  };

  // ── Drill-down: abrir modal con ventas o productos filtrados ──────────────────
  const handleOpenModal = async (
    tipo: 'vendedor' | 'caja' | 'ventas_estado' | 'stock' | 'recaudacion',
    id: string,
    titulo: string
  ) => {
    setModalTitle(titulo);
    setVentasDetalle([]);
    setProductosStock([]);
    setModalOpen(true);

    if (tipo === 'recaudacion') {
      setModalTipo('recaudacion');
      setLoadingDetalle(true);
      try {
        const { data } = await api.get<VentaDetalle[]>(`/ventas`, {
          params: { fecha, estado: 'PAGADA' },
        });
        const ventas = Array.isArray(data) ? data : (data as { data?: VentaDetalle[] }).data ?? [];
        // Calcular el total de intereses sumando solo los de TARJETA_CREDITO
        let intereses = 0;
        for (const venta of ventas) {
          for (const pago of venta.pagos ?? []) {
            if (pago.metodo === 'TARJETA_CREDITO') {
              const recargoDecimal = RECARGOS_CREDITO[pago.cuotas ?? 1] ?? 0;
              const baseMonto = pago.monto / (1 + recargoDecimal);
              intereses += pago.monto - baseMonto;
            }
          }
        }
        setTotalInteresesCredito(intereses);
      } catch {
        setTotalInteresesCredito(0);
      } finally {
        setLoadingDetalle(false);
      }
      return;
    }

    setLoadingDetalle(true);
    try {
      if (tipo === 'stock') {
        setModalTipo('stock');
        setBusquedaStock('');
        const { data } = await api.get(`/productos`, {
          params: { stockBajo: true, ...(tiendaSeleccionada && { tienda_id: tiendaSeleccionada }) },
        });
        const productos: ProductoStock[] = Array.isArray(data) ? data : (data as { data?: ProductoStock[] }).data ?? [];
        const total = (data as { meta?: { total?: number } })?.meta?.total ?? productos.length;
        setProductosStock(productos);
        setTotalStockBajo(total);
      } else {
        setModalTipo('venta');
        const params =
          tipo === 'vendedor' ? { fecha, vendedor_nombre: id }
          : tipo === 'ventas_estado' ? { fecha, estado: id }
          : { fecha, sesion_id: id };
        const { data } = await api.get<VentaDetalle[]>(`/ventas`, { params });
        setVentasDetalle(Array.isArray(data) ? data : (data as { data?: VentaDetalle[] }).data ?? []);
      }
    } catch {
      // states already reset above
    } finally {
      setLoadingDetalle(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-full bg-gray-50">

      {/* ── Cabecera ─────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 shadow-sm px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-xl">
              <BarChart3 size={20} className="text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">Panel Administrativo</h1>
              <p className="text-xs text-gray-400 mt-0.5 capitalize">
                {formatFechaLegible(fecha)}
              </p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center w-full md:w-auto">
            {/* Selector de fecha */}
            <div className="relative w-full md:w-auto">
              <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="date"
                value={fecha}
                max={hoy()}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full md:w-auto pl-9 pr-4 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition cursor-pointer"
              />
            </div>

            {/* Selector de sucursal */}
            <div className="relative w-full md:w-auto">
              <Store size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <select
                value={tiendaSeleccionada}
                onChange={(e) => setTiendaSeleccionada(e.target.value)}
                className="w-full md:w-auto md:min-w-48 pl-9 pr-9 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition appearance-none cursor-pointer"
              >
                <option value="">Todas las sucursales</option>
                {tiendas.map((tienda) => (
                  <option key={tienda.id} value={tienda.id}>
                    {tienda.nombre ?? tienda.nombre_tienda ?? tienda.id}
                  </option>
                ))}
              </select>
            </div>

            {/* Botón volver a hoy */}
            {fecha !== hoy() && (
              <button
                onClick={() => setFecha(hoy())}
                className="w-full md:w-auto flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 transition-colors"
              >
                <RefreshCw size={12} />
                Hoy
              </button>
            )}

            {/* Botón Sincronizar Nube */}
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="w-full md:w-auto flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed border border-indigo-700 transition-colors shadow-sm"
            >
              <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
              {isSyncing ? 'Sincronizando...' : 'Sincronizar Nube'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Contenido ────────────────────────────────────────────────────── */}
      <div className="p-6 space-y-6">

        {/* ── Error ──────────────────────────────────────────────────────── */}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="p-4 bg-red-50 rounded-full">
              <XCircle size={32} className="text-red-400" />
            </div>
            <p className="text-sm text-red-500 font-medium max-w-sm">{error}</p>
            <button
              onClick={() => setRetryCount((c) => c + 1)}
              className="text-xs text-indigo-500 hover:underline font-semibold"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* ── Tarjetas de Resumen ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {loading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : stats && (
            <>
              {/* Recaudación Total */}
              <div
                className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-5 hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => handleOpenModal('recaudacion', 'global', 'Desglose de Recaudación')}
                title="Ver desglose por método de pago"
              >
                <div className="flex items-start justify-between mb-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Recaudación Total</p>
                  <div className="p-2 bg-emerald-50 rounded-xl">
                    <DollarSign size={16} className="text-emerald-600" />
                  </div>
                </div>
                <p className="text-2xl font-black text-gray-900 tracking-tight">
                  {formatPrecio(stats.recaudacionBase ?? stats.recaudacionTotal)}
                </p>
                <p className="text-xs text-emerald-600 font-medium mt-1.5">
                  {stats.recaudacionBase != null && stats.recaudacionBase < stats.recaudacionTotal
                    ? 'Base neta · excl. recargos'
                    : 'Ventas cobradas'
                  }
                </p>
              </div>

              {/* Ventas Cerradas */}
              <div
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => handleOpenModal('ventas_estado', 'PAGADA', 'Ventas Cerradas — PAGADAS')}
                title="Ver listado de ventas pagadas"
              >
                <div className="flex items-start justify-between mb-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Ventas Cerradas</p>
                  <div className="p-2 bg-indigo-50 rounded-xl">
                    <ShoppingBag size={16} className="text-indigo-600" />
                  </div>
                </div>
                <p className="text-2xl font-black text-gray-900 tracking-tight">
                  {stats.ventasTotales}
                </p>
                <p className="text-xs text-gray-400 font-medium mt-1.5">Comandas cobradas hoy</p>
              </div>

              {/* Ventas Anuladas */}
              <div
                className="bg-white rounded-2xl border border-red-100 shadow-sm p-5 hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => handleOpenModal('ventas_estado', 'ANULADA', 'Ventas Anuladas')}
                title="Ver listado de ventas anuladas"
              >
                <div className="flex items-start justify-between mb-3">
                  <p className="text-xs font-semibold text-red-400 uppercase tracking-wider">Ventas Anuladas</p>
                  <div className="p-2 bg-red-50 rounded-xl">
                    <XCircle size={16} className="text-red-500" />
                  </div>
                </div>
                <p className="text-2xl font-black text-red-600 tracking-tight">
                  {stats.ventasCanceladas}
                </p>
                <p className="text-xs text-red-400 font-medium mt-1.5">Comandas anuladas hoy</p>
              </div>

              {/* Alertas de Stock */}
              <div
                className="bg-white rounded-2xl border border-amber-100 shadow-sm p-5 hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => handleOpenModal('stock', '', 'Productos con Stock Bajo')}
                title="Ver productos con stock bajo"
              >
                <div className="flex items-start justify-between mb-3">
                  <p className="text-xs font-semibold text-amber-500 uppercase tracking-wider">Alertas de Stock</p>
                  <div className="p-2 bg-amber-50 rounded-xl">
                    <AlertTriangle size={16} className="text-amber-500" />
                  </div>
                </div>
                <p className="text-2xl font-black text-amber-600 tracking-tight">
                  {stats.productosStockBajo}
                </p>
                <p className="text-xs text-amber-500 font-medium mt-1.5">
                  {stats.productosStockBajo === 0
                    ? 'Stock en orden ✓'
                    : `Producto${stats.productosStockBajo !== 1 ? 's' : ''} con stock bajo`}
                </p>
              </div>
            </>
          )}
        </div>

        {/* ── Tablas de Rendimiento ───────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

          {/* ── Sección A: Rendimiento por Vendedor ── */}
          {loading ? (
            <SkeletonTable rows={4} />
          ) : analiticas && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
                <div className="p-2 bg-indigo-50 rounded-lg">
                  <User size={15} className="text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-800">Rendimiento por Vendedor</h2>
                  <p className="text-xs text-gray-400">{(analiticas?.rendimientoVendedores ?? []).length} vendedor{(analiticas?.rendimientoVendedores ?? []).length !== 1 ? 'es' : ''} activo{(analiticas?.rendimientoVendedores ?? []).length !== 1 ? 's' : ''}</p>
                </div>
              </div>

              {(analiticas?.rendimientoVendedores ?? []).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-300 gap-2">
                  <User size={32} strokeWidth={1.5} />
                  <p className="text-sm text-gray-400">Sin ventas registradas para esta fecha</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3">
                        Vendedor
                      </th>
                      <th className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 py-3">
                        Comandas
                      </th>
                      <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 py-3">
                        Recaudado
                      </th>
                      <th className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3">
                        Anulac.
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(analiticas?.rendimientoVendedores ?? []).slice().reverse().map((v, idx) => (
                      <tr
                        key={idx}
                        className="hover:bg-indigo-50 cursor-pointer transition-colors"
                        onClick={() => handleOpenModal(
                          'vendedor',
                          v?.vendedor_nombre || v?.nombre || v?.vendedor || '',
                          'Ventas de ' + (v?.vendedor_nombre || v?.nombre || v?.vendedor || 'Desconocido')
                        )}
                        title="Ver detalle de ventas"
                      >
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                              <span className="text-xs font-bold text-indigo-600">
                                {(v?.vendedor_nombre || v?.nombre || v?.vendedor || '?').charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <span className="font-semibold text-gray-800">{v?.vendedor_nombre || v?.nombre || v?.vendedor || 'Desconocido'}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3.5 text-center">
                          <span className="inline-flex items-center justify-center bg-indigo-50 text-indigo-700 text-xs font-bold px-2.5 py-1 rounded-full">
                            {v?.cantidadVentas ?? 0}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-right font-bold text-gray-800">
                          {formatPrecio(v?.recaudacionTotal ?? 0)}
                        </td>
                        <td className="px-6 py-3.5 text-center">
                          {(v?.cantidadAnuladas ?? 0) > 0 ? (
                            <span className="inline-flex items-center justify-center bg-red-50 text-red-500 text-xs font-bold px-2.5 py-1 rounded-full">
                              {v.cantidadAnuladas}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Totales */}
                  <tfoot>
                    <tr className="bg-gray-50 border-t border-gray-200">
                      <td className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                        Total del día
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-xs font-black text-gray-700">
                          {(analiticas?.rendimientoVendedores ?? []).reduce((a, v) => a + (v?.cantidadVentas ?? 0), 0)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-black text-emerald-700">
                        {formatPrecio((analiticas?.rendimientoVendedores ?? []).reduce((a, v) => a + (v?.recaudacionTotal ?? 0), 0))}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span className="text-xs font-black text-red-500">
                          {(analiticas?.rendimientoVendedores ?? []).reduce((a, v) => a + (v?.cantidadAnuladas ?? 0), 0) || '—'}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          )}

          {/* ── Sección B: Arqueo de Cajas ── */}
          {loading ? (
            <SkeletonTable rows={3} />
          ) : analiticas && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
                <div className="p-2 bg-emerald-50 rounded-lg">
                  <Building2 size={15} className="text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-800">Arqueo de Cajas</h2>
                  <p className="text-xs text-gray-400">{(analiticas?.reporteCajas ?? []).length} sesión{(analiticas?.reporteCajas ?? []).length !== 1 ? 'es' : ''} registrada{(analiticas?.reporteCajas ?? []).length !== 1 ? 's' : ''}</p>
                </div>
              </div>

              {(analiticas?.reporteCajas ?? []).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-300 gap-2">
                  <Building2 size={32} strokeWidth={1.5} />
                  <p className="text-sm text-gray-400">Sin sesiones de caja para esta fecha</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {(analiticas?.reporteCajas ?? []).slice().sort((a, b) => {
                      // Prioridad 1: ABIERTA siempre primero
                      const aAbierta = a.estado === 'ABIERTA' ? 0 : 1;
                      const bAbierta = b.estado === 'ABIERTA' ? 0 : 1;
                      if (aAbierta !== bAbierta) return aAbierta - bAbierta;
                      // Prioridad 2: más reciente primero
                      const aFecha = a.fecha_apertura ?? a.id;
                      const bFecha = b.fecha_apertura ?? b.id;
                      return bFecha.localeCompare(aFecha);
                    }).map((caja) => {
                    const montoInicial = Number(caja?.monto_inicial) || 0;
                    const ventasEfectivo = Number(
                      caja?.ventas_efectivo
                      ?? caja?.pagos?.efectivo
                      ?? caja?.desglosePagos?.EFECTIVO
                      ?? 0
                    ) || 0;
                    const ingresosManuales = Number(caja?.total_ingresos ?? caja?.ingresos ?? 0) || 0;
                    const retirosManuales = Number(caja?.total_retiros ?? caja?.retiros ?? 0) || 0;
                    const montoEsperado = montoInicial + ventasEfectivo + ingresosManuales - retirosManuales;
                    const montoCierre = caja?.monto_cierre != null ? Number(caja.monto_cierre) : null;
                    const diferencia = montoCierre !== null ? montoCierre - montoEsperado : null;

                    return (
                      <div
                        key={caja.id}
                        className="px-6 py-5 hover:bg-indigo-50 cursor-pointer transition-colors"
                        onClick={() => handleOpenModal(
                          'caja',
                          caja.sesion_id || caja.id,
                          'Ventas de la sesión — ' + (caja.caja || caja.cajero_nombre || 'Caja')
                        )}
                        title="Ver detalle de ventas"
                      >
                        {/* Cabecera de la tarjeta de caja */}
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md tracking-wide">
                                {caja.caja || 'Caja Desconocida'}
                              </span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                caja?.estado === 'ABIERTA'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-gray-100 text-gray-500'
                              }`}>
                                {caja?.estado ?? '—'}
                              </span>
                            </div>
                            <p className="font-bold text-gray-800 text-sm">{caja?.cajero_nombre ?? '—'}</p>
                          </div>
                        </div>

                        {/* Desglose detallado del cálculo */}
                        <div className="bg-gradient-to-br from-gray-50 to-gray-25 rounded-xl p-4 mb-3 border border-gray-100 space-y-1.5 text-xs">
                          {/* Inicial */}
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-medium">Inicial</span>
                            <span className="font-bold text-gray-700">{formatPrecio(montoInicial)}</span>
                          </div>
                          
                          {/* Ventas en efectivo */}
                          <div className="flex justify-between items-center text-emerald-600">
                            <span className="font-medium">+ Ventas en efectivo</span>
                            <span className="font-bold">{formatPrecio(ventasEfectivo)}</span>
                          </div>
                          
                          {/* Ingresos manuales (SIEMPRE visible) */}
                          <div className={`flex justify-between items-center ${ingresosManuales > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                            <span className="font-medium">+ Ingresos manuales</span>
                            <span className="font-bold">{formatPrecio(ingresosManuales)}</span>
                          </div>
                          
                          {/* Retiros (SIEMPRE visible) */}
                          <div className={`flex justify-between items-center ${retirosManuales > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                            <span className="font-medium">− Retiros</span>
                            <span className="font-bold">{formatPrecio(retirosManuales)}</span>
                          </div>
                          
                          {/* Separador */}
                          <div className="h-px bg-gray-200 my-1" />
                          
                          {/* Total esperado */}
                          <div className="flex justify-between items-center text-indigo-700">
                            <span className="font-bold">= Total esperado</span>
                            <span className="font-black text-base">{formatPrecio(montoEsperado)}</span>
                          </div>
                        </div>
                        
                        {/* Cierre contado y diferencia */}
                        <div className={`rounded-xl px-4 py-3 text-center border-2 mb-3 ${
                          caja?.estado === 'ABIERTA'
                            ? 'bg-gray-50 border-gray-200'
                            : diferencia === 0
                            ? 'bg-emerald-50 border-emerald-200'
                            : diferencia !== null && diferencia < 0
                            ? 'bg-red-50 border-red-200'
                            : diferencia !== null && diferencia > 0
                            ? 'bg-sky-50 border-sky-200'
                            : 'bg-gray-50 border-gray-200'
                        }`}>
                          {caja.estado === 'ABIERTA' ? (
                            <p className="text-gray-400 font-medium text-sm">Sesión abierta</p>
                          ) : (
                            <div className="space-y-1.5">
                              <div>
                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Efectivo contado</p>
                                <p className="text-lg font-black text-gray-800">
                                  {formatPrecio(Number(caja.monto_cierre) || 0)}
                                </p>
                              </div>
                              {(() => {
                                const diferencia = (Number(caja.monto_cierre) || 0) - montoEsperado;
                                if (diferencia === 0) return <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded inline-block">✅ Cuadra exacto</span>;
                                if (diferencia < 0) return <span className="text-xs font-bold text-red-700 bg-red-100 px-2 py-1 rounded inline-block">❌ Faltan {formatPrecio(Math.abs(diferencia))}</span>;
                                return <span className="text-xs font-bold text-sky-700 bg-sky-100 px-2 py-1 rounded inline-block">⚠️ Sobran {formatPrecio(diferencia)}</span>;
                              })()}
                            </div>
                          )}
                        </div>

                        {/* Desglose de pagos */}
                        <div className="pt-2 border-t border-gray-100 space-y-2">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Desglose de pagos cobrados:</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-50 text-teal-700 text-xs font-semibold border border-teal-100">
                              <Banknote size={12} />
                              Efectivo: {formatPrecio(Number(caja.desglosePagos?.EFECTIVO) || 0)}
                            </span>

                            <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-100">
                              <CreditCard size={12} />
                              Débito: {formatPrecio(Number(caja.desglosePagos?.TARJETA_DEBITO) || 0)}
                            </span>

                            <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-50 text-violet-700 text-xs font-semibold border border-violet-100">
                              <CreditCard size={12} />
                              Crédito: {formatPrecio(Number(caja.desglosePagos?.TARJETA_CREDITO) || 0)}
                            </span>

                            <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-50 text-sky-700 text-xs font-semibold border border-sky-100">
                              <ArrowRightLeft size={12} />
                              Transfer.: {formatPrecio(Number(caja.desglosePagos?.TRANSFERENCIA) || 0)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Configuración de Pagos ─────────────────────────────────── */}
        <PaymentConfig />
      </div>

      {/* ══════════════════════════════════════════════════════════════
          MODAL — Detalle de Ventas (Drill-down)
      ══════════════════════════════════════════════════════════════ */}
      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${
                  modalTipo === 'stock' ? 'bg-amber-50'
                  : modalTipo === 'recaudacion' ? 'bg-emerald-50'
                  : 'bg-indigo-50'
                }`}>
                  {modalTipo === 'stock'
                    ? <Package size={16} className="text-amber-600" />
                    : modalTipo === 'recaudacion'
                    ? <DollarSign size={16} className="text-emerald-600" />
                    : <Receipt size={16} className="text-indigo-600" />
                  }
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-800">{modalTitle}</h2>
                  <p className="text-xs text-gray-400 mt-0.5 capitalize">{formatFechaLegible(fecha)}</p>
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Cuerpo */}
            <div className="flex-1 overflow-y-auto p-6">

              {/* Spinner */}
              {loadingDetalle && (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
                  <Loader2 size={32} className="animate-spin text-indigo-400" />
                  <p className="text-sm font-medium">
                    {modalTipo === 'stock' ? 'Cargando productos...' : 'Cargando ventas...'}
                  </p>
                </div>
              )}

              {/* Desglose de recaudación */}
              {!loadingDetalle && modalTipo === 'recaudacion' && (() => {
                const d = stats?.desglosePagosGlobal;
                const totalBruto   = Number(stats?.recaudacionTotal) || 0;
                const recargos     = totalInteresesCredito;
                const neta         = totalBruto - recargos;
                const creditoBruto = Number(d?.TARJETA_CREDITO) || 0;

                return (
                  <div className="space-y-3 py-2">

                    {/* Total cobrado (bruto) */}
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-6 py-5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-emerald-100 rounded-xl">
                          <DollarSign size={20} className="text-emerald-700" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Total cobrado</p>
                          <p className="text-xs text-emerald-500 mt-0.5">Todos los métodos · monto bruto</p>
                        </div>
                      </div>
                      <p className="text-2xl font-black text-emerald-800 tracking-tight">
                        {formatPrecio(totalBruto)}
                      </p>
                    </div>

                    {/* Recaudación Neta — siempre visible */}
                    <div className="bg-green-700 border border-green-800 rounded-2xl px-6 py-5 flex items-center justify-between shadow-md">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-green-600 rounded-xl">
                          <Store size={20} className="text-white" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-green-200 uppercase tracking-wider">Recaudación Neta (Local)</p>
                          <p className="text-xs text-green-300 mt-0.5">
                            {recargos > 0
                              ? `Excl. intereses bancarios (−${formatPrecio(recargos)})`
                              : 'Sin recargos de crédito en el día'
                            }
                          </p>
                        </div>
                      </div>
                      <p className="text-2xl font-black text-white tracking-tight">
                        {formatPrecio(neta)}
                      </p>
                    </div>

                    {/* Efectivo */}
                    <div className="bg-teal-50 border border-teal-100 rounded-2xl px-6 py-5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-teal-100 rounded-xl">
                          <Banknote size={20} className="text-teal-700" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-teal-600 uppercase tracking-wider">Efectivo</p>
                          <p className="text-xs text-teal-500 mt-0.5">Pagos en billetes y monedas</p>
                        </div>
                      </div>
                      <p className="text-2xl font-black text-teal-800 tracking-tight">
                        {formatPrecio(Number(d?.EFECTIVO) || 0)}
                      </p>
                    </div>

                    {/* Tarjeta Débito */}
                    <div className="bg-blue-50 border border-blue-100 rounded-2xl px-6 py-5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-blue-100 rounded-xl">
                          <CreditCard size={20} className="text-blue-700" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">Tarjeta Débito</p>
                          <p className="text-xs text-blue-500 mt-0.5">Pago inmediato</p>
                        </div>
                      </div>
                      <p className="text-2xl font-black text-blue-800 tracking-tight">
                        {formatPrecio(Number(d?.TARJETA_DEBITO) || 0)}
                      </p>
                    </div>

                    {/* Tarjeta Crédito */}
                    <div className="bg-violet-50 border border-violet-100 rounded-2xl px-6 py-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-violet-100 rounded-xl">
                            <CreditCard size={20} className="text-violet-700" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-violet-600 uppercase tracking-wider">Tarjeta Crédito</p>
                            <p className="text-xs text-violet-500 mt-0.5">Cobrado al cliente (incl. recargo)</p>
                          </div>
                        </div>
                        <p className="text-2xl font-black text-violet-800 tracking-tight">
                          {formatPrecio(creditoBruto)}
                        </p>
                      </div>
                      {recargos > 0 && (
                        <div className="mt-3 pt-3 border-t border-violet-100 flex gap-4 text-xs">
                          <div className="flex-1 text-center">
                            <p className="text-violet-400 font-medium">Base del local</p>
                            <p className="font-bold text-violet-700 mt-0.5">{formatPrecio(creditoBruto - recargos)}</p>
                          </div>
                          <div className="w-px bg-violet-100" />
                          <div className="flex-1 text-center">
                            <p className="text-violet-400 font-medium">Recargo bancario</p>
                            <p className="font-bold text-violet-500 mt-0.5">+{formatPrecio(recargos)}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Transferencia */}
                    <div className="bg-sky-50 border border-sky-100 rounded-2xl px-6 py-5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-sky-100 rounded-xl">
                          <ArrowRightLeft size={20} className="text-sky-700" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-sky-600 uppercase tracking-wider">Transferencia</p>
                          <p className="text-xs text-sky-500 mt-0.5">Mercado Pago, bancaria</p>
                        </div>
                      </div>
                      <p className="text-2xl font-black text-sky-800 tracking-tight">
                        {formatPrecio(Number(d?.TRANSFERENCIA) || 0)}
                      </p>
                    </div>

                  </div>
                );
              })()}
              {/* Sin datos — ventas */}
              {!loadingDetalle && modalTipo === 'venta' && ventasDetalle.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-300">
                  <Receipt size={40} strokeWidth={1.5} />
                  <p className="text-sm text-gray-400">No hay ventas registradas para este filtro.</p>
                </div>
              )}

              {/* Sin datos — stock */}
              {!loadingDetalle && modalTipo === 'stock' && productosStock.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-300">
                  <Package size={40} strokeWidth={1.5} />
                  <p className="text-sm text-gray-400">No hay productos con stock bajo. ✅</p>
                </div>
              )}

              {/* Lista de ventas */}
              {!loadingDetalle && modalTipo === 'venta' && ventasDetalle.length > 0 && (
                <div className="space-y-3">
                  {ventasDetalle.map((venta) => (
                    <div key={venta.id} className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                          {/* Hora */}
                          <span className="text-xs font-mono text-gray-500 bg-white border border-gray-200 px-2 py-1 rounded-lg">
                            {new Date(venta.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {/* Estado */}
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                            venta.estado === 'PAGADA'
                              ? 'bg-emerald-100 text-emerald-700'
                              : venta.estado === 'ANULADA'
                              ? 'bg-red-100 text-red-600'
                              : 'bg-gray-100 text-gray-500'
                          }`}>
                            {venta.estado}
                          </span>
                        </div>
                        {/* Total */}
                        <span className="text-base font-black text-gray-900">
                          {formatPrecio(Number(venta.total) || 0)}
                        </span>
                      </div>

                      {/* Ítems */}
                      {(venta.detalles ?? []).length > 0 && (
                        <ul className="space-y-1">
                          {(venta.detalles ?? []).map((detalle, i) => (
                            <li key={i} className="flex items-center gap-2 text-xs text-gray-600">
                              <span className="font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded text-[10px]">
                                {detalle.cantidad}×
                              </span>
                              <span className="truncate">
                                {detalle.producto?.nombre || detalle.producto_nombre || 'Producto'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* Métodos de pago */}
                      {(venta.pagos ?? []).length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap mt-2.5 pt-2.5 border-t border-gray-200">
                          {(venta.pagos ?? []).map((pago, i) => {
                            let label: string;
                            let colorClass: string;
                            if (pago.metodo === 'EFECTIVO') {
                              label = 'Efectivo';
                              colorClass = 'bg-teal-50 text-teal-700 border-teal-100';
                            } else if (pago.metodo === 'TARJETA_DEBITO') {
                              label = 'T. Débito';
                              colorClass = 'bg-blue-50 text-blue-700 border-blue-100';
                            } else if (pago.metodo === 'TARJETA_CREDITO') {
                              label = pago.cuotas && pago.cuotas > 1
                                ? `T. Crédito (${pago.cuotas} cuotas)`
                                : 'T. Crédito';
                              colorClass = 'bg-violet-50 text-violet-700 border-violet-100';
                            } else if (pago.metodo === 'TRANSFERENCIA') {
                              label = 'Transferencia';
                              colorClass = 'bg-sky-50 text-sky-700 border-sky-100';
                            } else {
                              label = pago.metodo;
                              colorClass = 'bg-gray-50 text-gray-500 border-gray-100';
                            }
                            return (
                              <span
                                key={i}
                                className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border ${colorClass}`}
                              >
                                <CreditCard size={9} />
                                {label} · {formatPrecio(Number(pago.monto) || 0)}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Lista de productos con stock bajo */}
              {!loadingDetalle && modalTipo === 'stock' && productosStock.length > 0 && (() => {
                const term = busquedaStock.toLowerCase();
                const filtrados = productosStock
                  .filter((p) =>
                    !term ||
                    p.nombre.toLowerCase().includes(term) ||
                    p.codigo_barras?.toLowerCase().includes(term) ||
                    p.marca?.toLowerCase().includes(term) ||
                    p.proveedor?.toLowerCase().includes(term)
                  )
                  .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

                return (
                  <div className="space-y-3">
                    {/* Buscador */}
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      <input
                        type="text"
                        value={busquedaStock}
                        onChange={(e) => setBusquedaStock(e.target.value)}
                        placeholder="Buscar por nombre, código, marca o proveedor…"
                        className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent transition"
                      />
                    </div>

                    {filtrados.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-8">Sin resultados para "{busquedaStock}"</p>
                    ) : (
                      filtrados.map((producto) => (
                        <div
                          key={producto.id}
                          className="bg-gray-50 rounded-xl border border-gray-100 p-4 flex items-center justify-between gap-4"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-gray-800 text-sm truncate">{producto.nombre}</p>
                            {producto.codigo_barras ? (
                              <p className="text-xs font-mono text-gray-400 mt-0.5 flex items-center gap-1">
                                <Barcode size={11} />
                                {producto.codigo_barras}
                              </p>
                            ) : (
                              <p className="text-xs text-gray-300 mt-0.5">Sin código de barras</p>
                            )}
                            {(producto.marca || producto.proveedor) && (
                              <p className="text-[11px] text-gray-400 mt-1">
                                {producto.marca && <span>Marca: <span className="font-medium text-gray-500">{producto.marca}</span></span>}
                                {producto.marca && producto.proveedor && <span className="mx-1">|</span>}
                                {producto.proveedor && <span>Prov: <span className="font-medium text-gray-500">{producto.proveedor}</span></span>}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                            {tiendas.length > 0 ? tiendas.map((tienda) => {
                              const stockEntry = (producto.stocks ?? []).find((s) => s.tienda_id === tienda.id);
                              const cantidad = stockEntry?.cantidad ?? 0;
                              const nombre = tienda.nombre ?? tienda.nombre_tienda ?? tienda.id;
                              return (
                                <span
                                  key={tienda.id}
                                  className={`text-xs font-bold px-2.5 py-1 rounded-full border whitespace-nowrap ${
                                    cantidad > (producto.stock_minimo ?? 5)
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : cantidad > 0
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : 'bg-red-50 text-red-600 border-red-200'
                                  }`}
                                >
                                  {nombre}: {cantidad}
                                </span>
                              );
                            }) : (
                              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                                producto.stock_local > 0
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-red-50 text-red-600 border-red-200'
                              }`}>
                                Local: {producto.stock_local}
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            {!loadingDetalle && modalTipo !== 'recaudacion' && (modalTipo === 'stock' ? productosStock.length > 0 : ventasDetalle.length > 0) && (
              <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 rounded-b-2xl shrink-0">
                <p className="text-xs text-gray-400">
                  {modalTipo === 'stock' ? (() => {
                    const term = busquedaStock.toLowerCase();
                    const count = productosStock.filter((p) =>
                      !term ||
                      p.nombre.toLowerCase().includes(term) ||
                      p.codigo_barras?.toLowerCase().includes(term) ||
                      p.marca?.toLowerCase().includes(term) ||
                      p.proveedor?.toLowerCase().includes(term)
                    ).length;
                    return (
                      <>
                        Mostrando <span className="font-bold text-gray-600">{busquedaStock ? count : productosStock.length}</span> de{' '}
                        <span className="font-bold text-gray-600">{totalStockBajo.toLocaleString('es-AR')}</span>{' '}
                        producto{totalStockBajo !== 1 ? 's' : ''} con stock bajo
                        {busquedaStock && ` (filtro local)`}
                      </>
                    );
                  })() : (
                    <>
                      <span className="font-bold text-gray-600">{ventasDetalle.length}</span>{' '}
                      venta{ventasDetalle.length !== 1 ? 's' : ''} encontrada{ventasDetalle.length !== 1 ? 's' : ''}
                    </>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
