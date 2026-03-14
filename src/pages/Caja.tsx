import { useState, useEffect, useCallback } from 'react';
import api from '../api/axiosClient';
import {
  Wallet,
  User,
  Receipt,
  Loader2,
  AlertCircle,
  CreditCard,
  CheckCircle,
  ChevronRight,
  RefreshCw,
  Plus,
  Trash2,
  XCircle,
  LogOut,
  Lock,
  MonitorX,
  Building2,
  DollarSign,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DetalleVenta {
  producto_id: string;
  nombre_producto?: string;
  producto?: { nombre: string };
  cantidad: number;
  precio_unitario_historico: number;
}

interface LineaPago {
  metodo: MetodoPago;
  monto: string;
}

interface Venta {
  id: string;
  vendedor_nombre: string;
  estado: string;
  descuento_total: number;
  total: number;
  detalles: DetalleVenta[];
  created_at?: string;
}

type MetodoPago = 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA';

interface SesionCaja {
  abierta: boolean;
  cajero: string;
  caja_id: string;
  sesion_id?: string;
}

interface CajaDisponible {
  id: string;
  nombre: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────


// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatPrecio = (valor: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(valor);

const shortId = (id: string) => `...${id.slice(-6)}`;

const calcularTotal = (venta: Venta): number => {
  if (typeof venta.total === 'number' && venta.total > 0) return venta.total;
  return venta.detalles.reduce(
    (acc, d) => acc + d.precio_unitario_historico * d.cantidad,
    0
  ) - (venta.descuento_total ?? 0);
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function Caja() {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorLista, setErrorLista] = useState<string | null>(null);

  const [seleccionada, setSeleccionada] = useState<Venta | null>(null);
  const [pagos, setPagos] = useState<LineaPago[]>([{ metodo: 'EFECTIVO', monto: '' }]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sesión de caja
  const [sesion, setSesion] = useState<SesionCaja | null>(null);
  const [cajasDisponibles, setCajasDisponibles] = useState<CajaDisponible[]>([]);
  const [formApertura, setFormApertura] = useState({ cajero_nombre: '', monto_inicial: '', caja_id: '' });
  const [isAbriendo, setIsAbriendo] = useState(false);

  // ── Fetch ventas pendientes ──────────────────────────────────────────────
  const fetchVentas = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorLista(null);
      const { data } = await api.get<Venta[]>(`/ventas`);
      setVentas(data.filter((v) => v.estado === 'PENDIENTE'));
    } catch {
      setErrorLista('No se pudieron cargar las comandas. Verificá que el servidor esté corriendo.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVentas();
  }, [fetchVentas]);

  // ── Restaurar sesión de caja desde localStorage ────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('sesion_caja');
    if (saved) {
      try {
        setSesion(JSON.parse(saved));
      } catch {
        localStorage.removeItem('sesion_caja');
      }
    }
  }, []);

  // ── Fetch cajas disponibles (solo cuando no hay sesión) ──────────────────
  const fetchCajas = useCallback(async () => {
    try {
      const { data } = await api.get<CajaDisponible[]>(`/caja`);
      setCajasDisponibles(data);
      if (data.length > 0) {
        setFormApertura((prev) => ({ ...prev, caja_id: data[0].id }));
      }
    } catch {
      // Si falla, el select quedará vacío
    }
  }, []);

  useEffect(() => {
    if (!sesion) fetchCajas();
  }, [sesion, fetchCajas]);

  // ── Helpers de líneas de pago ─────────────────────────────────────────────
  const resetPagos = () => setPagos([{ metodo: 'EFECTIVO', monto: '' }]);

  const agregarLinea = () =>
    setPagos((prev) => {
      if (prev.length === 1) {
        // Transición a modo split: desbloquea la primera línea
        return [{ ...prev[0], monto: '' }, { metodo: 'EFECTIVO', monto: '' }];
      }
      return [...prev, { metodo: 'EFECTIVO', monto: '' }];
    });

  const actualizarLinea = (idx: number, campo: keyof LineaPago, valor: string) =>
    setPagos((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, [campo]: valor } : p))
    );

  const eliminarLinea = (idx: number) =>
    setPagos((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      // Volver a modo único: restaurar monto al total completo
      if (next.length === 1 && seleccionada) {
        return [{ ...next[0], monto: String(calcularTotal(seleccionada)) }];
      }
      return next;
    });

  // ── Cobrar ───────────────────────────────────────────────────────────────
  const handleCobrar = async () => {
    if (!seleccionada || !sesion) return;

    const payload = {
      caja_id: sesion.caja_id,
      pagos: pagos.map((p) => ({ metodo: p.metodo, monto: parseFloat(p.monto) || 0 })),
    };

    try {
      setIsSubmitting(true);
      await api.post(`/ventas/${seleccionada.id}/cobrar`, payload);
      alert('¡Cobro registrado con éxito!');
      setSeleccionada(null);
      resetPagos();
      await fetchVentas();
    } catch {
      alert('❌ Error al registrar el cobro. Intentá de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Anular ───────────────────────────────────────────────────────────────
  const handleAnular = async () => {
    if (!seleccionada) return;
    const confirmar = window.confirm('¿Seguro que deseas anular esta comanda y devolver el stock?');
    if (!confirmar) return;

    try {
      setIsSubmitting(true);
      await api.patch(`/ventas/${seleccionada.id}`, {
        estado: 'ANULADA',
        sesion_id: sesion?.sesion_id,
      });
      alert('🗑️ Comanda anulada. El stock fue repuesto.');
      setSeleccionada(null);
      resetPagos();
      await fetchVentas();
    } catch {
      alert('❌ Error al anular la comanda. Intentá de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Abrir caja ───────────────────────────────────────────────────────────────
  const handleAbrirCaja = async () => {
    if (!formApertura.cajero_nombre.trim() || !formApertura.caja_id) return;
    try {
      setIsAbriendo(true);
      const { data: sesionData } = await api.post<{ sesion_id?: string }>(`/caja/abrir`, {
        caja_id: formApertura.caja_id,
        cajero_nombre: formApertura.cajero_nombre.trim(),
        monto_inicial: parseFloat(formApertura.monto_inicial) || 0,
      });
      const nuevaSesion: SesionCaja = {
        abierta: true,
        cajero: formApertura.cajero_nombre.trim(),
        caja_id: formApertura.caja_id,
        sesion_id: sesionData?.sesion_id,
      };
      localStorage.setItem('sesion_caja', JSON.stringify(nuevaSesion));
      setSesion(nuevaSesion);
      setFormApertura({ cajero_nombre: '', monto_inicial: '', caja_id: '' });
      await fetchVentas();
    } catch {
      alert('❌ Error al abrir la caja. Verificá el servidor.');
    } finally {
      setIsAbriendo(false);
    }
  };

  // ── Cerrar turno ───────────────────────────────────────────────────────────────
  const handleCerrarTurno = async () => {
    if (!sesion) return;
    const input = window.prompt('Ingresá el monto de efectivo en el cajón al cierre:');
    if (input === null) return; // canceló
    const monto_efectivo_cierre = parseFloat(input);
    if (isNaN(monto_efectivo_cierre)) {
      alert('El monto ingresado no es válido. Usá solo números.');
      return;
    }
    try {
      setIsSubmitting(true);
      await api.post(`/caja/${sesion.caja_id}/cerrar`, { monto_efectivo_cierre });
      localStorage.removeItem('sesion_caja');
      setSesion(null);
      setSeleccionada(null);
      setVentas([]);
    } catch {
      alert('❌ Error al cerrar el turno. Intentá de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — Caja Cerrada (Apertura de Turno)
  // ─────────────────────────────────────────────────────────────────────────

  if (!sesion) {
    return (
      <>
        {/* ── Bloque móvil ────────────────────────────────────────────── */}
        <div className="flex md:hidden flex-col items-center justify-center h-full bg-gray-50 text-center p-8 gap-5">
          <div className="p-5 bg-red-50 rounded-full">
            <MonitorX size={40} className="text-red-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-700">Cobros no disponibles en móvil</h2>
            <p className="text-sm text-gray-400 mt-2 max-w-xs leading-relaxed">
              Por favor, dirigíte a la computadora de la caja física para cobrar y cerrar las comandas.
            </p>
          </div>
        </div>

        {/* ── Contenido desktop ───────────────────────────────────────── */}
        <div className="hidden md:flex h-full items-center justify-center bg-gray-50">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-sm p-8">

            {/* Ícono y título */}
            <div className="flex flex-col items-center mb-7">
              <div className="p-4 bg-indigo-50 rounded-2xl mb-3">
                <Lock size={28} className="text-indigo-500" />
              </div>
              <h2 className="text-xl font-black text-gray-800">Apertura de Turno</h2>
              <p className="text-sm text-gray-400 mt-1.5 text-center leading-relaxed">
                Configurá la caja y el monto inicial<br />para comenzar a cobrar.
              </p>
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); handleAbrirCaja(); }}
              className="space-y-4"
            >
              {/* Selector de caja */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Caja de trabajo
                </label>
                <div className="relative">
                  <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <select
                    value={formApertura.caja_id}
                    onChange={(e) => setFormApertura((prev) => ({ ...prev, caja_id: e.target.value }))}
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent appearance-none cursor-pointer transition"
                  >
                    {cajasDisponibles.length === 0 && <option value="">Cargando cajas...</option>}
                    {cajasDisponibles.map((caja) => (
                      <option key={caja.id} value={caja.id}>{caja.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Nombre del cajero */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Tu nombre
                </label>
                <div className="relative">
                  <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={formApertura.cajero_nombre}
                    onChange={(e) => setFormApertura((prev) => ({ ...prev, cajero_nombre: e.target.value }))}
                    placeholder="Ej: María García"
                    autoFocus
                    autoComplete="off"
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition"
                  />
                </div>
              </div>

              {/* Monto inicial */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Monto inicial en caja
                </label>
                <div className="relative">
                  <DollarSign size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formApertura.monto_inicial}
                    onChange={(e) => setFormApertura((prev) => ({ ...prev, monto_inicial: e.target.value }))}
                    placeholder="0.00"
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isAbriendo || !formApertura.cajero_nombre.trim() || !formApertura.caja_id}
                className={`
                  w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all duration-200 mt-2
                  ${isAbriendo || !formApertura.cajero_nombre.trim() || !formApertura.caja_id
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white shadow-lg shadow-indigo-100 hover:shadow-indigo-200'
                  }
                `}
              >
                {isAbriendo
                  ? <><Loader2 size={16} className="animate-spin" /> Abriendo caja...</>
                  : <><Wallet size={16} /> Abrir Caja y Comenzar</>
                }
              </button>
            </form>
          </div>
        </div>
      </>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — Caja Abierta
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Bloque móvil ──────────────────────────────────────────────── */}
      <div className="flex md:hidden flex-col items-center justify-center h-full bg-gray-50 text-center p-8 gap-5">
        <div className="p-5 bg-red-50 rounded-full">
          <MonitorX size={40} className="text-red-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-700">Cobros no disponibles en móvil</h2>
          <p className="text-sm text-gray-400 mt-2 max-w-xs leading-relaxed">
            Por favor, dirigíte a la computadora de la caja física para cobrar y cerrar las comandas.
          </p>
        </div>
      </div>
      {/* ── Contenido desktop ────────────────────────────────────────── */}
      <div className="hidden md:flex flex-col h-full">

      {/* ── Banner: turno activo ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-2.5 bg-emerald-600 text-white shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Lock size={14} className="text-emerald-200" />
            <span className="text-sm font-bold">Caja abierta</span>
          </div>
          <span className="text-emerald-400">·</span>
          <div className="flex items-center gap-1.5">
            <User size={13} className="text-emerald-200" />
            <span className="text-sm text-emerald-100">{sesion.cajero}</span>
          </div>
        </div>
        <button
          onClick={handleCerrarTurno}
          disabled={isSubmitting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white border border-emerald-500 transition-colors disabled:opacity-50"
        >
          <LogOut size={13} />
          Cerrar turno
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">

      {/* ══════════════════════════════════════════════════════
          COLUMNA IZQUIERDA — Comandas Pendientes
      ══════════════════════════════════════════════════════ */}
      <div className="w-80 flex flex-col bg-gray-50 border-r border-gray-200 shrink-0">

        {/* Header */}
        <div className="p-5 bg-white border-b border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-800">Comandas</h1>
              <p className="text-xs text-gray-400 mt-0.5">Pendientes de cobro</p>
            </div>
            <button
              onClick={fetchVentas}
              disabled={isLoading}
              title="Refrescar"
              className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-indigo-500 transition-colors disabled:opacity-40"
            >
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Contador */}
          {!isLoading && !errorLista && (
            <div className="mt-3 flex items-center gap-2">
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  ventas.length > 0
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {ventas.length} pendiente{ventas.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">

          {/* Cargando */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
              <Loader2 size={32} className="animate-spin text-indigo-400" />
              <p className="text-sm font-medium">Cargando comandas...</p>
            </div>
          )}

          {/* Error */}
          {!isLoading && errorLista && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
              <AlertCircle size={40} className="text-red-300" />
              <p className="text-sm text-red-500 font-medium">{errorLista}</p>
              <button
                onClick={fetchVentas}
                className="text-xs text-indigo-500 hover:underline font-medium"
              >
                Reintentar
              </button>
            </div>
          )}

          {/* Sin pendientes */}
          {!isLoading && !errorLista && ventas.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
              <CheckCircle size={40} className="text-emerald-300" />
              <p className="text-sm font-semibold text-gray-500">Todo cobrado</p>
              <p className="text-xs text-gray-400">No hay comandas pendientes en este momento.</p>
            </div>
          )}

          {/* Tarjetas de comanda */}
          {!isLoading &&
            !errorLista &&
            ventas.map((venta) => {
              const isActive = seleccionada?.id === venta.id;
              const total = calcularTotal(venta);
              return (
                <button
                  key={venta.id}
                  onClick={() => {
                    if (isActive) {
                      setSeleccionada(null);
                      resetPagos();
                    } else {
                      setSeleccionada(venta);
                      setPagos([{ metodo: 'EFECTIVO', monto: String(calcularTotal(venta)) }]);
                    }
                  }}
                  className={`
                    w-full text-left rounded-xl p-4 border transition-all duration-150
                    ${isActive
                      ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-100 shadow-sm'
                      : 'bg-white border-gray-200 hover:border-indigo-300 hover:shadow-sm'
                    }
                  `}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {/* ID recortado */}
                      <p className="text-xs font-mono font-bold text-gray-400 mb-1">
                        {shortId(venta.id)}
                      </p>
                      {/* Vendedor */}
                      <div className="flex items-center gap-1.5">
                        <User size={12} className={isActive ? 'text-indigo-500' : 'text-gray-400'} />
                        <p className={`text-sm font-semibold truncate ${isActive ? 'text-indigo-700' : 'text-gray-700'}`}>
                          {venta.vendedor_nombre}
                        </p>
                      </div>
                      {/* Ítems */}
                      <p className="text-xs text-gray-400 mt-1">
                        {venta.detalles?.length ?? 0} ítem{(venta.detalles?.length ?? 0) !== 1 ? 's' : ''}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <p className={`text-base font-black ${isActive ? 'text-indigo-700' : 'text-gray-800'}`}>
                        {formatPrecio(total)}
                      </p>
                      <ChevronRight
                        size={14}
                        className={`transition-transform ${isActive ? 'text-indigo-400 translate-x-0.5' : 'text-gray-300'}`}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          COLUMNA DERECHA — Detalle y Cobro
      ══════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col bg-white min-w-0">

        {/* Estado vacío */}
        {!seleccionada && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
            <div className="p-5 bg-gray-100 rounded-full">
              <Receipt size={52} strokeWidth={1.5} className="text-gray-300" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-400">Ninguna comanda seleccionada</p>
              <p className="text-sm text-gray-300 mt-1">
                Seleccioná una comanda de la izquierda para ver el detalle y cobrar.
              </p>
            </div>
          </div>
        )}

        {/* Detalle de la comanda seleccionada */}
        {seleccionada && (() => {
          const total = calcularTotal(seleccionada);
          return (
            <div className="flex flex-col h-full">

              {/* Header detalle */}
              <div className="p-6 border-b border-gray-100 bg-gray-50">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-mono text-gray-400 mb-1">ID: {seleccionada.id}</p>
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-indigo-100 rounded-full">
                        <User size={13} className="text-indigo-600" />
                      </div>
                      <p className="text-lg font-bold text-gray-800">{seleccionada.vendedor_nombre}</p>
                    </div>
                  </div>
                  <span className="bg-amber-100 text-amber-700 text-xs font-bold px-3 py-1 rounded-full border border-amber-200 shrink-0">
                    PENDIENTE
                  </span>
                </div>
              </div>

              {/* Tabla de ítems */}
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3">
                        Producto
                      </th>
                      <th className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 py-3">
                        Cant.
                      </th>
                      <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 py-3">
                        P. Unit.
                      </th>
                      <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3">
                        Subtotal
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {seleccionada.detalles.map((detalle, idx) => {
                      const subtotal = detalle.precio_unitario_historico * detalle.cantidad;
                      return (
                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-3.5">
                            <p className="font-medium text-gray-800">
                              {detalle.producto?.nombre ?? detalle.nombre_producto ?? detalle.producto_id}
                            </p>
                          </td>
                          <td className="px-3 py-3.5 text-center">
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold">
                              {detalle.cantidad}
                            </span>
                          </td>
                          <td className="px-3 py-3.5 text-right text-gray-500">
                            {formatPrecio(detalle.precio_unitario_historico)}
                          </td>
                          <td className="px-6 py-3.5 text-right font-semibold text-gray-800">
                            {formatPrecio(subtotal)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer — Total + cobro */}
              <div className="p-6 border-t border-gray-100 bg-gray-50 space-y-4">

                {/* Descuento + Total */}
                <div className="space-y-1.5">
                  {seleccionada.descuento_total > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Descuento</span>
                      <span className="text-emerald-600 font-semibold">
                        -{formatPrecio(seleccionada.descuento_total)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-base font-semibold text-gray-500">Total a cobrar</span>
                    <span className="text-3xl font-black text-gray-900">{formatPrecio(total)}</span>
                  </div>
                </div>

                {/* Split Payments ──────────────────────────────────── */}
                {(() => {
                  const montoIngresado = pagos.reduce(
                    (acc, p) => acc + (parseFloat(p.monto) || 0), 0
                  );
                  const restante = total - montoIngresado;
                  const listo = Math.abs(restante) < 0.01;

                  return (
                    <>
                      {/* Líneas de pago */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Métodos de pago
                          </p>
                          <button
                            onClick={agregarLinea}
                            className="flex items-center gap-1 text-xs font-semibold text-indigo-500 hover:text-indigo-700 transition-colors"
                          >
                            <Plus size={13} />
                            Agregar pago
                          </button>
                        </div>

                        {pagos.map((linea, idx) => (
                          <div key={idx} className="flex gap-2 items-center">
                            {/* Select método */}
                            <div className="relative shrink-0">
                              <CreditCard size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                              <select
                                value={linea.metodo}
                                onChange={(e) => actualizarLinea(idx, 'metodo', e.target.value)}
                                className="pl-8 pr-3 py-2 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-transparent appearance-none cursor-pointer transition"
                              >
                                <option value="EFECTIVO">Efectivo</option>
                                <option value="TARJETA">Tarjeta</option>
                                <option value="TRANSFERENCIA">Transferencia</option>
                              </select>
                            </div>

                            {/* Monto: bloqueado en modo único, editable en split */}
                            {pagos.length === 1 ? (
                              <div className="flex-1 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-sm font-bold text-emerald-700 text-right select-none">
                                {formatPrecio(parseFloat(linea.monto) || 0)}
                              </div>
                            ) : (
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="Monto"
                                value={linea.monto}
                                onChange={(e) => actualizarLinea(idx, 'monto', e.target.value)}
                                autoFocus={idx === 0}
                                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-transparent transition"
                              />
                            )}

                            {/* Eliminar línea */}
                            {pagos.length > 1 && (
                              <button
                                onClick={() => eliminarLinea(idx)}
                                className="p-1.5 rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-400 transition-colors shrink-0"
                              >
                                <XCircle size={16} />
                              </button>
                            )}
                          </div>
                        ))}

                        {/* Hint en modo único */}
                        {pagos.length === 1 && (
                          <p className="text-xs text-gray-400 text-center pt-0.5">
                            ¿Pago dividido? Usá <span className="font-semibold text-indigo-400">+ Agregar pago</span> para split.
                          </p>
                        )}
                      </div>

                      {/* Resumen de montos */}
                      <div className="bg-gray-100 rounded-xl p-3.5 space-y-1.5 text-sm">
                        <div className="flex justify-between text-gray-500">
                          <span>Total de la venta</span>
                          <span className="font-semibold text-gray-700">{formatPrecio(total)}</span>
                        </div>
                        <div className="flex justify-between text-gray-500">
                          <span>Monto ingresado</span>
                          <span className={`font-semibold ${
                            montoIngresado > total + 0.01 ? 'text-red-500' : 'text-gray-700'
                          }`}>
                            {formatPrecio(montoIngresado)}
                          </span>
                        </div>
                        <div className="h-px bg-gray-200" />
                        <div className="flex justify-between font-bold">
                          <span className={listo ? 'text-emerald-600' : 'text-amber-600'}>Restante</span>
                          <span className={listo ? 'text-emerald-600' : 'text-amber-600'}>
                            {formatPrecio(Math.max(restante, 0))}
                          </span>
                        </div>
                      </div>

                      {/* Botón Cobrar */}
                      <button
                        onClick={handleCobrar}
                        disabled={isSubmitting || !listo}
                        className={`
                          w-full py-4 rounded-xl text-base font-bold flex items-center justify-center gap-2.5 transition-all duration-200
                          ${isSubmitting || !listo
                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            : 'bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-white shadow-lg shadow-emerald-100 hover:shadow-emerald-200'
                          }
                        `}
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 size={18} className="animate-spin" />
                            Procesando...
                          </>
                        ) : (
                          <>
                            <Wallet size={20} />
                            Cobrar {formatPrecio(total)}
                          </>
                        )}
                      </button>

                      {/* Botón Anular */}
                      <button
                        onClick={handleAnular}
                        disabled={isSubmitting}
                        className="w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 border border-red-200 text-red-400 hover:bg-red-50 hover:text-red-600 hover:border-red-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
                      >
                        <Trash2 size={15} />
                        Anular Comanda
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>
          );
        })()}
      </div>

      </div>
      </div>{/* /hidden md:flex */}
    </>
  );
}
