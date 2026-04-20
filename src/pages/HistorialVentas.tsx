import { useState, useEffect, useCallback } from 'react';
import api from '../api/axiosClient';
import { useAuth } from '../context/AuthContext';
import {
  Search,
  Receipt,
  Loader2,
  X,
  ChevronLeft,
  ChevronRight,
  PackageSearch,
  CheckCircle,
  XCircle,
  ShoppingBag,
  CreditCard,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DetalleVenta {
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

interface PagoVenta {
  metodo: string;
  monto: number;
}

interface Venta {
  id: string;
  created_at: string;
  estado: 'PAGADA' | 'ANULADA';
  vendedor_nombre: string;
  total: number;
  detalles: DetalleVenta[];
  pagos: PagoVenta[];
}

interface MetaPaginacion {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatPrecio = (valor: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(valor);

const formatHora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

const formatFecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const hoyISO = () => new Date().toISOString().slice(0, 10);

/** Detecta si el texto parece un ID de ticket (UUID o alfanumérico largo) */
const esIdTicket = (txt: string) =>
  /^[0-9a-f-]{8,}$/i.test(txt.trim()) || /^[A-Z0-9]{6,}$/i.test(txt.trim());

const LIMIT = 20;

// ─── Component ────────────────────────────────────────────────────────────────

export default function HistorialVentas() {
  const { rol } = useAuth();
  const esEmpleado = rol === 'EMPLEADO';

  const [ventas, setVentas] = useState<Venta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fecha, setFecha] = useState(hoyISO());
  const [busqueda, setBusqueda] = useState('');
  const [debouncedBusqueda, setDebouncedBusqueda] = useState('');

  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<MetaPaginacion | null>(null);

  const [ventaDetalle, setVentaDetalle] = useState<Venta | null>(null);

  // ── Debounce búsqueda ──────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setDebouncedBusqueda(busqueda);
    }, 400);
    return () => clearTimeout(t);
  }, [busqueda]);

  useEffect(() => { setPage(1); }, [fecha]);

  // ── Fetch ──────────────────────────────────────────────────────────────
  const fetchVentas = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params: Record<string, string | number> = { page, limit: LIMIT, fecha };

      if (debouncedBusqueda) {
        if (esIdTicket(debouncedBusqueda)) {
          params.id = debouncedBusqueda.trim();
        } else {
          params.search = debouncedBusqueda.trim();
        }
      }

      const { data } = await api.get<{ data: Venta[]; meta: MetaPaginacion }>(
        '/ventas',
        { params }
      );
      setVentas(data.data);
      setMeta(data.meta);
    } catch {
      setError('No se pudo cargar el historial. Verificá la conexión con el servidor.');
    } finally {
      setIsLoading(false);
    }
  }, [page, fecha, debouncedBusqueda]);

  useEffect(() => { fetchVentas(); }, [fetchVentas]);

  const cerrarDetalle = () => setVentaDetalle(null);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-gray-50">

      {/* ── Cabecera ──────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 shadow-sm px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Historial de Ventas</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {!isLoading && meta
                ? `${meta.total} ticket${meta.total !== 1 ? 's' : ''} encontrado${meta.total !== 1 ? 's' : ''}`
                : 'Cargando...'}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition"
            />
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="ID de ticket o vendedor..."
                className="pl-9 pr-4 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition w-56"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Contenido ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-6">

        {isLoading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
            <Loader2 size={36} className="animate-spin text-indigo-400" />
            <p className="text-sm font-medium">Cargando tickets...</p>
          </div>
        )}

        {!isLoading && error && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <PackageSearch size={48} className="text-red-300" />
            <p className="text-sm text-red-500 font-medium max-w-xs">{error}</p>
            <button onClick={fetchVentas} className="text-xs text-indigo-500 hover:underline font-medium">
              Reintentar
            </button>
          </div>
        )}

        {!isLoading && !error && ventas.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
            <Receipt size={48} className="text-gray-300" />
            <p className="text-sm font-medium">
              {busqueda
                ? `Sin resultados para "${busqueda}"`
                : `No hay tickets para el ${new Date(fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}`}
            </p>
          </div>
        )}

        {!isLoading && !error && ventas.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="w-full overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3.5 whitespace-nowrap">Hora</th>
                    <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3.5 whitespace-nowrap">ID Ticket</th>
                    <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3.5 whitespace-nowrap">Vendedor</th>
                    <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3.5 whitespace-nowrap">Método de Pago</th>
                    <th className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3.5 whitespace-nowrap">Estado</th>
                    {!esEmpleado && (
                      <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3.5 whitespace-nowrap">Total</th>
                    )}
                    <th className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3.5 whitespace-nowrap">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {ventas.map((venta) => {
                    const primerPago = venta.pagos?.[0];
                    return (
                      <tr
                        key={venta.id}
                        onClick={() => setVentaDetalle(venta)}
                        className="hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <td className="px-5 py-4 whitespace-nowrap">
                          <p className="text-xs font-semibold text-gray-700">{formatHora(venta.created_at)}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">{formatFecha(venta.created_at)}</p>
                        </td>

                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-md">
                            #{venta.id.slice(-8).toUpperCase()}
                          </span>
                        </td>

                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-700 font-medium">{venta.vendedor_nombre || '—'}</span>
                        </td>

                        <td className="px-4 py-4 whitespace-nowrap">
                          {primerPago ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded-md">
                              <CreditCard size={11} />
                              {primerPago.metodo}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>

                        <td className="px-4 py-4 text-center whitespace-nowrap">
                          {venta.estado === 'PAGADA' ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle size={11} />
                              Pagada
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-red-50 text-red-500 border border-red-200">
                              <XCircle size={11} />
                              Anulada
                            </span>
                          )}
                        </td>

                        {!esEmpleado && (
                          <td className="px-5 py-4 text-right whitespace-nowrap">
                            <span className={`font-bold ${venta.estado === 'ANULADA' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                              {formatPrecio(venta.total)}
                            </span>
                          </td>
                        )}

                        <td className="px-5 py-4 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setVentaDetalle(venta)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 hover:border-indigo-200 transition-colors"
                          >
                            <Receipt size={12} />
                            Ver
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {meta && meta.totalPages > 1 && (
              <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-4 flex-wrap">
                <p className="text-xs text-gray-400">
                  Página <span className="font-semibold text-gray-600">{meta.page}</span> de{' '}
                  <span className="font-semibold text-gray-600">{meta.totalPages}</span>{' '}
                  (<span className="font-semibold text-gray-600">{meta.total}</span> tickets)
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => p - 1)}
                    disabled={page === 1}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={13} />
                    Anterior
                  </button>
                  <span className="text-xs font-bold text-gray-700 min-w-[2rem] text-center">
                    {page} / {meta.totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page === meta.totalPages}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Siguiente
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL — Detalle del Ticket
      ══════════════════════════════════════════════════════════════════════ */}
      {ventaDetalle && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) cerrarDetalle(); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 rounded-xl">
                  <ShoppingBag size={16} className="text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-800">Detalle del Ticket</h2>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">
                    #{ventaDetalle.id.slice(-8).toUpperCase()}
                    {' · '}
                    {ventaDetalle.vendedor_nombre || 'Vendedor desconocido'}
                  </p>
                </div>
              </div>
              <button
                onClick={cerrarDetalle}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Info rápida */}
            <div className="flex items-center gap-6 px-6 py-3 bg-gray-50 border-b border-gray-100 shrink-0 flex-wrap">
              <div>
                <p className="text-[10px] text-gray-400 uppercase font-semibold">Fecha y Hora</p>
                <p className="text-sm font-semibold text-gray-700">
                  {formatFecha(ventaDetalle.created_at)} {formatHora(ventaDetalle.created_at)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase font-semibold">Estado</p>
                <p className="text-sm">
                  {ventaDetalle.estado === 'PAGADA' ? (
                    <span className="inline-flex items-center gap-1 font-bold text-emerald-600">
                      <CheckCircle size={13} /> Pagada
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-bold text-red-500">
                      <XCircle size={13} /> Anulada
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Lista de productos */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {(!ventaDetalle.detalles || ventaDetalle.detalles.length === 0) ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-gray-400">
                  <PackageSearch size={32} className="text-gray-300" />
                  <p className="text-sm">No hay productos para este ticket.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider py-2">Producto</th>
                      <th className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider py-2 px-2">Cant.</th>
                      <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider py-2 px-2">P. Unit.</th>
                      <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider py-2">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {ventaDetalle.detalles.map((item, i) => (
                      <tr key={i}>
                        <td className="py-3 pr-2">
                          <span className="font-medium text-gray-800">{item.nombre}</span>
                        </td>
                        <td className="py-3 px-2 text-center">
                          <span className="text-xs font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                            ×{item.cantidad}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-right text-gray-500 text-xs">
                          {formatPrecio(item.precio_unitario)}
                        </td>
                        <td className="py-3 text-right font-bold text-gray-800">
                          {formatPrecio(item.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer — Total + Método de pago */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex flex-wrap gap-2">
                  {ventaDetalle.pagos && ventaDetalle.pagos.length > 0 ? (
                    ventaDetalle.pagos.map((pago, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-200 px-2.5 py-1 rounded-lg">
                        <CreditCard size={11} />
                        {pago.metodo}: {formatPrecio(pago.monto)}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-gray-400">Sin información de pago</span>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-400 uppercase font-semibold">Total</p>
                  <p className={`text-lg font-black ${ventaDetalle.estado === 'ANULADA' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                    {formatPrecio(ventaDetalle.total)}
                  </p>
                </div>
              </div>
              <button
                onClick={cerrarDetalle}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
