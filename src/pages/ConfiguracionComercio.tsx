import { useState, useEffect } from 'react';
import api from '../api/axiosClient';
import PaymentConfig from '../components/PaymentConfig';
import { isWebMode } from '../utils/env';
import { applyPrimaryColor } from '../utils/theme';
import { Settings, Receipt, ArrowRightLeft, Palette } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Tienda {
  id: string;
  nombre?: string;
  nombre_tienda?: string;
  facturacionHabilitada?: boolean;
}

interface IdentidadConfig {
  nombre_tienda?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConfiguracionComercio() {
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const [tiendaSeleccionada, setTiendaSeleccionada] = useState<string>('');
  const [isTogglingFacturacion, setIsTogglingFacturacion] = useState(false);

  const [transferenciaConsumidorFinal, setTransferenciaConsumidorFinal] = useState(false);
  const [isTogglingTransferencia, setIsTogglingTransferencia] = useState(false);

  const [colorPrimario, setColorPrimario] = useState('');
  const [isSavingColor, setIsSavingColor] = useState(false);

  const [cuit, setCuit] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [condicionFiscalArca, setCondicionFiscalArca] = useState<'MONOTRIBUTO' | 'RESPONSABLE_INSCRIPTO'>('MONOTRIBUTO');
  const [puntoVenta, setPuntoVenta] = useState('');
  const [entornoProduccion, setEntornoProduccion] = useState(false);
  const [isSavingFiscal, setIsSavingFiscal] = useState(false);

  // ── Carga de sucursales (con auto-selección del local propio, si corresponde) ──
  useEffect(() => {
    let cancelled = false;

    const fetchTiendas = async () => {
      try {
        const response = await api.get<Tienda[] | { data?: Tienda[] }>('/tiendas');
        const tiendasData = Array.isArray(response.data)
          ? response.data
          : Array.isArray(response.data?.data)
            ? response.data.data
            : [];

        if (cancelled) return;
        setTiendas(tiendasData);

        if (isWebMode) return;

        try {
          const identidadRes = await api.get<IdentidadConfig | { data?: IdentidadConfig }>('/config/identidad');
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

          if (tiendaMatch?.id) setTiendaSeleccionada(tiendaMatch.id);
        } catch (error) {
          console.error('ConfiguracionComercio: error al cargar identidad local desde /config/identidad', error);
        }
      } catch (error) {
        console.error('ConfiguracionComercio: error al cargar sucursales desde /tiendas', error);
        if (!cancelled) setTiendas([]);
      }
    };

    fetchTiendas();
    return () => { cancelled = true; };
  }, []);

  // ── Fetch config global (transferencia, color, datos fiscales) ────────────
  useEffect(() => {
    api.get<{
      transferenciaConsumidorFinal?: boolean;
      colorPrimario?: string | null;
      cuit?: string;
      razonSocial?: string;
      condicionFiscal?: 'MONOTRIBUTO' | 'RESPONSABLE_INSCRIPTO';
      puntoVenta?: number;
      entornoProduccion?: boolean;
    }>('/config')
      .then(({ data }) => {
        setTransferenciaConsumidorFinal(data?.transferenciaConsumidorFinal ?? false);
        setColorPrimario(data?.colorPrimario ?? '');
        setCuit(data?.cuit ?? '');
        setRazonSocial(data?.razonSocial ?? '');
        setCondicionFiscalArca(data?.condicionFiscal ?? 'MONOTRIBUTO');
        setPuntoVenta(data?.puntoVenta != null ? String(data.puntoVenta) : '');
        setEntornoProduccion(data?.entornoProduccion ?? false);
      })
      .catch(() => {});
  }, []);

  const tiendaActual = tiendas.find((t) => t.id === tiendaSeleccionada);
  const facturacionHabilitada = tiendaActual?.facturacionHabilitada ?? false;

  return (
    <div className="min-h-full bg-gray-50">

      {/* ── Cabecera ─────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 shadow-sm px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 rounded-xl">
            <Settings size={20} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Configuración del Comercio</h1>
            <p className="text-xs text-gray-400 mt-0.5">Pagos, facturación electrónica y marca</p>
          </div>
        </div>
      </div>

      {/* ── Contenido ────────────────────────────────────────────────────── */}
      <div className="p-6 space-y-6">

        {/* ── Configuración de Pagos ─────────────────────────────────── */}
        <PaymentConfig />

        {/* ── Datos Fiscales (ARCA) ─────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-indigo-50 rounded-xl">
              <Receipt size={18} className="text-indigo-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-800">Datos fiscales (ARCA)</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                CUIT, razón social y punto de venta para emitir facturas electrónicas de este comercio.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">CUIT</label>
              <input
                type="text"
                value={cuit}
                onChange={(e) => setCuit(e.target.value)}
                placeholder="20409378472"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Razón social</label>
              <input
                type="text"
                value={razonSocial}
                onChange={(e) => setRazonSocial(e.target.value)}
                placeholder="Nombre legal del comercio"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Condición fiscal</label>
              <select
                value={condicionFiscalArca}
                onChange={(e) => setCondicionFiscalArca(e.target.value as 'MONOTRIBUTO' | 'RESPONSABLE_INSCRIPTO')}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition"
              >
                <option value="MONOTRIBUTO">Monotributo</option>
                <option value="RESPONSABLE_INSCRIPTO">Responsable Inscripto</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">
                Punto de venta <span className="text-gray-300 font-normal normal-case">(propio de este local)</span>
              </label>
              <input
                type="number"
                min="1"
                value={puntoVenta}
                onChange={(e) => setPuntoVenta(e.target.value)}
                placeholder="1"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 mt-4 p-3 bg-gray-50 rounded-xl">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-700">Entorno de producción</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {entornoProduccion
                  ? 'Factura real — además necesita AFIP_CERT y AFIP_KEY cargados en el .env del servidor.'
                  : 'Homologación (testing) — no emite facturas reales todavía.'}
              </p>
            </div>
            <button
              onClick={() => setEntornoProduccion((prev) => !prev)}
              className={`relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none shrink-0 ${
                entornoProduccion ? 'bg-indigo-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                  entornoProduccion ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <p className="text-[11px] text-gray-400 mt-2.5">
            CUIT, razón social y condición fiscal se comparten con los demás locales de este comercio. El punto de venta es propio de este local nada más.
          </p>

          <button
            onClick={async () => {
              setIsSavingFiscal(true);
              try {
                await api.put('/config', {
                  cuit,
                  razonSocial,
                  condicionFiscal: condicionFiscalArca,
                  puntoVenta: puntoVenta ? parseInt(puntoVenta, 10) : undefined,
                  entornoProduccion,
                });
              } catch {
                alert('❌ No se pudieron guardar los datos fiscales.');
              } finally {
                setIsSavingFiscal(false);
              }
            }}
            disabled={isSavingFiscal}
            className="w-full mt-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
          >
            {isSavingFiscal ? 'Guardando...' : 'Guardar datos fiscales'}
          </button>
        </div>

        {/* ── Preferencias y marca ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">

          {/* ── Facturación ARCA (por local) ──────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-indigo-50 rounded-xl">
                <Receipt size={18} className="text-indigo-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-800">Facturación electrónica ARCA</h3>
                <p className="text-xs text-gray-400 mt-0.5">Habilitá el checkbox de facturar en la caja de un local.</p>
              </div>
            </div>

            <select
              value={tiendaSeleccionada}
              onChange={(e) => setTiendaSeleccionada(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition"
            >
              <option value="">Elegí un local...</option>
              {tiendas.map((tienda) => (
                <option key={tienda.id} value={tienda.id}>{tienda.nombre ?? tienda.nombre_tienda ?? tienda.id}</option>
              ))}
            </select>

            <div className="flex items-center justify-between gap-4 mt-3">
              <p className="text-xs text-gray-400 min-w-0">
                {!tiendaSeleccionada
                  ? 'Seleccioná una sucursal para configurarlo.'
                  : facturacionHabilitada
                    ? 'Los cajeros pueden emitir facturas al cobrar.'
                    : 'El checkbox de facturar está oculto en la caja.'}
              </p>
              <button
                onClick={async () => {
                  if (!tiendaSeleccionada) return;
                  setIsTogglingFacturacion(true);
                  try {
                    const nuevoValor = !facturacionHabilitada;
                    await api.put(`/tiendas/${tiendaSeleccionada}/facturacion`, { habilitada: nuevoValor });
                    setTiendas((prev) =>
                      prev.map((t) => t.id === tiendaSeleccionada ? { ...t, facturacionHabilitada: nuevoValor } : t)
                    );
                  } catch {
                    alert('❌ No se pudo actualizar la configuración.');
                  } finally {
                    setIsTogglingFacturacion(false);
                  }
                }}
                disabled={isTogglingFacturacion || !tiendaSeleccionada}
                className={`relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none shrink-0 ${
                  facturacionHabilitada ? 'bg-indigo-600' : 'bg-gray-200'
                } ${(isTogglingFacturacion || !tiendaSeleccionada) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                    facturacionHabilitada ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* ── Transferencia → Consumidor Final ────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-50 rounded-xl">
                  <ArrowRightLeft size={18} className="text-blue-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-800">Transferencia → Consumidor Final</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {transferenciaConsumidorFinal
                      ? 'Al elegir Transferencia se marca automáticamente Consumidor Final.'
                      : 'El cajero elige el tipo de factura manualmente.'}
                  </p>
                </div>
              </div>
              <button
                onClick={async () => {
                  setIsTogglingTransferencia(true);
                  try {
                    const nuevoValor = !transferenciaConsumidorFinal;
                    await api.put('/config', { transferenciaConsumidorFinal: nuevoValor });
                    setTransferenciaConsumidorFinal(nuevoValor);
                  } catch {
                    alert('❌ No se pudo actualizar la configuración.');
                  } finally {
                    setIsTogglingTransferencia(false);
                  }
                }}
                disabled={isTogglingTransferencia}
                className={`relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none ${
                  transferenciaConsumidorFinal ? 'bg-blue-600' : 'bg-gray-200'
                } ${isTogglingTransferencia ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                    transferenciaConsumidorFinal ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* ── Color primario de marca ──────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-pink-50 rounded-xl">
                <Palette size={18} className="text-pink-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-800">Color primario de marca</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Reemplaza el indigo por defecto en botones, acentos y la barra lateral.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="color"
                value={colorPrimario || '#4f46e5'}
                onChange={(e) => setColorPrimario(e.target.value)}
                className="w-11 h-11 rounded-lg border border-gray-200 cursor-pointer shrink-0"
                aria-label="Elegir color primario"
              />
              <input
                type="text"
                value={colorPrimario}
                onChange={(e) => setColorPrimario(e.target.value)}
                placeholder="#4f46e5 (indigo por defecto)"
                className="flex-1 min-w-0 px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition"
              />
              <button
                onClick={async () => {
                  setIsSavingColor(true);
                  try {
                    const valor = colorPrimario.trim() || null;
                    await api.put('/config', { colorPrimario: valor });
                    applyPrimaryColor(valor);
                  } catch {
                    alert('❌ No se pudo guardar el color.');
                  } finally {
                    setIsSavingColor(false);
                  }
                }}
                disabled={isSavingColor}
                className="px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors shrink-0"
              >
                {isSavingColor ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mt-2.5">
              Se aplica acá al instante. En los otros locales aparece recién cuando reinician el programa (no hace falta en este, el que estás usando ahora).
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
