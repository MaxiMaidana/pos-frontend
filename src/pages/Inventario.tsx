import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Papa from 'papaparse';
import { toast } from 'sonner';
import api from '../api/axiosClient';

import SyncButton from '../components/SyncButton';
import {
  Search,
  Plus,
  Edit,
  Trash2,
  AlertTriangle,
  PackageSearch,
  Loader2,
  X,
  ChevronLeft,
  ChevronRight,
  Package,
  Tag,
  Barcode,
  Hash,
  Eye,
  EyeOff,
  Upload,
  Download,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Producto {
  id: string;
  nombre: string;
  codigo_barras?: string;
  precio_actual: number;
  costo?: number;
  marca?: string;
  categoria?: string;
  proveedor?: string;
  stock_local: number;
  stock_otro?: number | null;
  stock_minimo: number;
  activo?: boolean;
}

interface FormProducto {
  nombre: string;
  codigo_barras: string;
  precio_actual: string;
  costo: string;
  marca: string;
  categoria: string;
  proveedor: string;
  stock: string;
  stock_minimo: string;
}

interface MetaPaginacion {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

type ModoModal = 'crear' | 'editar';

// ─── Constants ────────────────────────────────────────────────────────────────

const LIMIT = 15;

const FORM_VACIO: FormProducto = {
  nombre: '',
  codigo_barras: '',
  precio_actual: '',
  costo: '',
  marca: '',
  categoria: '',
  proveedor: '',
  stock: '',
  stock_minimo: '5',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatPrecio = (valor: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(valor);

// ─── Component ────────────────────────────────────────────────────────────────

export default function Inventario() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');

  // Paginación
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<MetaPaginacion | null>(null);

  // Búsqueda con debounce
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Modal
  const [modalAbierto, setModalAbierto] = useState(false);
  const [modoModal, setModoModal] = useState<ModoModal>('crear');
  const [productoEditando, setProductoEditando] = useState<Producto | null>(null);
  const [form, setForm] = useState<FormProducto>(FORM_VACIO);
  const [isGuardando, setIsGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  // Ref para mover el foco desde el lector de códigos al siguiente campo
  const precioInputRef = useRef<HTMLInputElement>(null);

  // CSV import
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Producto en vista de detalle (solo lectura)
  const [productoViendo, setProductoViendo] = useState<Producto | null>(null);

  // ── Fetch productos ──────────────────────────────────────────────────────
  const fetchProductos = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const { data } = await api.get<{ data: Producto[]; meta: MetaPaginacion }>(
        `/productos`,
        { params: { page, limit: LIMIT, ...(debouncedSearch && { search: debouncedSearch }) } }
      );
      setProductos(data.data);
      setMeta(data.meta);
    } catch {
      setError('No se pudieron cargar los productos. Verificá que el servidor esté corriendo.');
    } finally {
      setIsLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => {
    fetchProductos();
  }, [fetchProductos]);

  // Debounce: al cambiar la búsqueda, esperar 500ms y resetear a página 1
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setDebouncedSearch(busqueda);
    }, 500);
    return () => clearTimeout(timer);
  }, [busqueda]);

  // ── Filtro ampliado (client-side): marca, categoría, proveedor ──────────
  const productosFiltrados = useMemo(() => {
    if (!debouncedSearch) return productos;
    const term = debouncedSearch.toLowerCase();
    return productos.filter((p) =>
      p.nombre.toLowerCase().includes(term) ||
      p.codigo_barras?.toLowerCase().includes(term) ||
      p.marca?.toLowerCase().includes(term) ||
      p.categoria?.toLowerCase().includes(term) ||
      p.proveedor?.toLowerCase().includes(term)
    );
  }, [productos, debouncedSearch]);

  // ── Acciones modal ───────────────────────────────────────────────────────
  const abrirModalCrear = () => {
    setModoModal('crear');
    setProductoEditando(null);
    setForm(FORM_VACIO);
    setErrorForm(null);
    setModalAbierto(true);
  };

  const abrirModalEditar = (producto: Producto) => {
    setModoModal('editar');
    setProductoEditando(producto);
    setForm({
      nombre: producto.nombre,
      codigo_barras: producto.codigo_barras ?? '',
      precio_actual: String(producto.precio_actual),
      costo: producto.costo != null ? String(producto.costo) : '',
      marca: producto.marca ?? '',
      categoria: producto.categoria ?? '',
      proveedor: producto.proveedor ?? '',
      stock: String(producto.stock_local),
      stock_minimo: String(producto.stock_minimo ?? 5),
    });
    setErrorForm(null);
    setModalAbierto(true);
  };

  const cerrarModal = () => {
    setModalAbierto(false);
    setProductoEditando(null);
    setForm(FORM_VACIO);
    setErrorForm(null);
  };

  const handleCampo = (campo: keyof FormProducto, valor: string) =>
    setForm((prev) => ({ ...prev, [campo]: valor }));

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleGuardar = async () => {
    if (!form.nombre.trim()) {
      setErrorForm('El nombre del producto es obligatorio.');
      return;
    }
    if (!form.precio_actual || isNaN(parseFloat(form.precio_actual))) {
      setErrorForm('El precio debe ser un número válido.');
      return;
    }

    const payload = {
      nombre: form.nombre.trim(),
      codigo_barras: form.codigo_barras.trim() || undefined,
      precio_actual: parseFloat(form.precio_actual),
      costo: form.costo ? parseFloat(form.costo) : undefined,
      marca: form.marca.trim() || undefined,
      categoria: form.categoria.trim() || undefined,
      proveedor: form.proveedor.trim() || undefined,
      stock: form.stock ? parseInt(form.stock) : 0,
      stock_minimo: form.stock_minimo ? parseInt(form.stock_minimo) : 5,
    };

    try {
      setIsGuardando(true);
      setErrorForm(null);

      if (modoModal === 'crear') {
        await api.post(`/productos`, payload);
        alert('✅ Producto creado correctamente.');
      } else if (productoEditando) {
        await api.put(`/productos/${productoEditando.id}`, payload);
        alert('✅ Producto actualizado correctamente.');
      }

      cerrarModal();
      await fetchProductos();
    } catch {
      setErrorForm('Error al guardar el producto. Intentá de nuevo.');
    } finally {
      setIsGuardando(false);
    }
  };

  // ── Eliminar ─────────────────────────────────────────────────────────────
  const handleEliminar = async (producto: Producto) => {
    const confirmar = window.confirm(
      `¿Estás seguro de eliminar "${producto.nombre}"? Esta acción no se puede deshacer.`
    );
    if (!confirmar) return;

    try {
      await api.delete(`/productos/${producto.id}`);
      alert(`🗑️ "${producto.nombre}" eliminado correctamente.`);
      await fetchProductos();
    } catch {
      alert('❌ Error al eliminar el producto. Intentá de nuevo.');
    }
  };

  // ── Exportar CSV ──────────────────────────────────────────────────────
  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const response = await api.get('/productos/export', { responseType: 'blob' });
      const url = URL.createObjectURL(response.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventario_${new Date().toLocaleDateString('en-CA')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Error al exportar el inventario.');
    } finally {
      setIsExporting(false);
    }
  };

  // ── Importar CSV ──────────────────────────────────────────────────────
  const handleCsvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so same file can be re-selected
    if (!file) return;

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        // Normaliza formato argentino "$16.909,20" → 16909.20
        const parsePrecioAR = (val?: string): number => {
          if (!val) return 0;
          const limpio = val.replace(/\$/g, '').replace(/\./g, '').replace(',', '.').trim();
          return parseFloat(limpio) || 0;
        };

        const productos = results.data
          .map((row) => ({
            codigo_barras: (row.CODIGO ?? row.codigo_barras)?.trim() || undefined,
            nombre:        (row.PRODUCTO ?? row.nombre)?.trim(),
            precio_actual: parsePrecioAR(row.VENTA ?? row.SUGERIDO ?? row.precio_actual),
            costo:         parsePrecioAR(row.COSTO ?? row.costo) || undefined,
            marca:         (row.MARCA ?? row.marca)?.trim() || undefined,
            proveedor:     (row.PROVEEDOR ?? row.proveedor)?.trim() || undefined,
            stock:         parseInt((row.STOCK ?? row.stock) ?? '0') || 0,
          }))
          .filter((p) => p.nombre && p.nombre.length > 0);

        if (productos.length === 0) {
          toast.error('El archivo CSV no contiene filas válidas.');
          return;
        }

        const BATCH = 500;
        const totalBatches = Math.ceil(productos.length / BATCH);
        setIsImporting(true);
        const toastId = toast.loading(`Importando ${productos.length} productos...`);
        try {
          for (let i = 0; i < totalBatches; i++) {
            const chunk = productos.slice(i * BATCH, (i + 1) * BATCH);
            await api.post('/productos/import', { productos: chunk });
          }
          toast.success(`${productos.length} productos importados correctamente.`, { id: toastId });
          await fetchProductos();
        } catch {
          toast.error('Error al importar. Verificá el formato del CSV e intentá de nuevo.', { id: toastId });
        } finally {
          setIsImporting(false);
        }
      },
      error: () => {
        toast.error('No se pudo leer el archivo CSV.');
      },
    });
  };

  // ── Toggle activo ("En caja") ──────────────────────────────────────────
  const handleToggleActivo = async (producto: Producto) => {
    try {
      await api.patch(`/productos/${producto.id}/toggle-activo`);
      setProductos((prev) =>
        prev.map((p) =>
          p.id === producto.id ? { ...p, activo: !(p.activo ?? true) } : p
        )
      );
    } catch {
      alert('❌ No se pudo cambiar el estado del producto. Intentá de nuevo.');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-gray-50">

      {/* ── Cabecera ──────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 shadow-sm px-6 pt-4 pb-0">

        {/* Fila 1: título + buscador + Nuevo Producto */}
        <div className="flex items-center justify-between gap-4 pb-3">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Inventario</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {!isLoading && meta && `${meta.total} producto${meta.total !== 1 ? 's' : ''} registrado${meta.total !== 1 ? 's' : ''}`}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-1 max-w-md ml-auto">
            {/* Búsqueda */}
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o código..."
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition"
              />
            </div>

            <button
              onClick={abrirModalCrear}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-white text-sm font-bold shadow-sm shadow-emerald-100 transition-all shrink-0"
            >
              <Plus size={16} />
              Nuevo Producto
            </button>
          </div>
        </div>

        {/* Fila 2: botones de gestión */}
        <div className="flex items-center justify-end gap-2 py-2 border-t border-gray-100">
          {/* Input oculto */}
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleCsvChange}
          />

          <SyncButton />

          <button
            onClick={handleExportCsv}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 text-sm font-bold transition-all shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting
              ? <Loader2 size={15} className="animate-spin" />
              : <Download size={15} />}
            {isExporting ? 'Exportando...' : 'Exportar CSV'}
          </button>

          <button
            onClick={() => csvInputRef.current?.click()}
            disabled={isImporting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-sm font-bold transition-all shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isImporting
              ? <Loader2 size={15} className="animate-spin" />
              : <Upload size={15} />}
            {isImporting ? 'Importando...' : 'Importar CSV'}
          </button>
        </div>
      </div>

      {/* ── Tabla ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-6">

        {/* Cargando */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
            <Loader2 size={36} className="animate-spin text-indigo-400" />
            <p className="text-sm font-medium">Cargando inventario...</p>
          </div>
        )}

        {/* Error */}
        {!isLoading && error && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <PackageSearch size={48} className="text-red-300" />
            <p className="text-sm text-red-500 font-medium max-w-xs">{error}</p>
            <button
              onClick={fetchProductos}
              className="text-xs text-indigo-500 hover:underline font-medium"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Sin resultados de búsqueda */}
        {!isLoading && !error && productosFiltrados.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
            <PackageSearch size={48} className="text-gray-300" />
            <p className="text-sm font-medium">
              {busqueda ? `Sin resultados para "${busqueda}"` : 'No hay productos cargados aún.'}
            </p>
            {!busqueda && (
              <button
                onClick={abrirModalCrear}
                className="text-xs text-emerald-500 hover:underline font-semibold"
              >
                + Crear el primer producto
              </button>
            )}
          </div>
        )}

        {/* Tabla de productos */}
        {!isLoading && !error && productosFiltrados.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3.5 whitespace-nowrap">
                    Nombre
                  </th>
                  <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3.5 whitespace-nowrap">
                    Código de Barras
                  </th>
                  <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3.5 whitespace-nowrap">
                    Precio
                  </th>
                  <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3.5 whitespace-nowrap">
                    Costo
                  </th>
                  <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3.5 whitespace-nowrap">
                    Marca
                  </th>
                  <th className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3.5 whitespace-nowrap">
                    Stock
                  </th>
                  <th className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3.5 whitespace-nowrap">
                    En Caja
                  </th>
                  <th className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3.5 whitespace-nowrap">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {productosFiltrados.map((producto) => {
                  const activo = producto.activo ?? true;
                  return (
                    <tr
                      key={producto.id}
                      onClick={() => setProductoViendo(producto)}
                      className={`hover:bg-gray-50 transition-colors group cursor-pointer ${
                        !activo ? 'opacity-50 bg-gray-50' : ''
                      }`}
                    >

                      {/* Nombre */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 bg-indigo-50 rounded-lg shrink-0">
                            <Package size={14} className="text-indigo-500" />
                          </div>
                          <p className="font-semibold text-gray-800">{producto.nombre}</p>
                        </div>
                      </td>

                      {/* Código de barras */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        {producto.codigo_barras ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-mono text-gray-500 bg-gray-100 px-2 py-1 rounded-md">
                            <Barcode size={11} className="text-gray-400" />
                            {producto.codigo_barras}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>

                      {/* Precio */}
                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        <span className="font-bold text-gray-800">
                          {formatPrecio(producto.precio_actual)}
                        </span>
                      </td>

                      {/* Costo */}
                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        {producto.costo != null ? (
                          <span className="text-sm text-gray-500">
                            {formatPrecio(producto.costo)}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>

                      {/* Marca */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        {producto.marca ? (
                          <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded-md">
                            {producto.marca}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>

                      {/* Stock */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex flex-nowrap items-center justify-center gap-1.5">
                          {/* L1 — este local */}
                          <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border ${
                            producto.stock_local > 0
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-red-50 text-red-500 border-red-200'
                          }`}>
                            🏠 L1: {producto.stock_local}
                          </span>
                          {/* L2 — otro local */}
                          <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border ${
                            (producto.stock_otro ?? 0) > 0
                              ? 'bg-sky-50 text-sky-700 border-sky-200'
                              : 'bg-red-50 text-red-500 border-red-200'
                          }`}>
                            🏪 L2: {producto.stock_otro ?? 0}
                          </span>
                        </div>
                      </td>

                      {/* En caja (toggle activo) */}
                      <td className="px-4 py-4 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleToggleActivo(producto)}
                          title={activo ? 'Pausar (ocultar del POS)' : 'Activar (mostrar en el POS)'}
                          className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-colors ${
                            activo
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100'
                              : 'bg-gray-100 border-gray-200 text-gray-400 hover:bg-gray-200'
                          }`}
                        >
                          {activo
                            ? <Eye size={13} />
                            : <EyeOff size={13} />
                          }
                        </button>
                      </td>

                      {/* Acciones */}
                      <td className="px-6 py-4 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => abrirModalEditar(producto)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 hover:border-indigo-200 transition-colors"
                          >
                            <Edit size={12} />
                            Editar
                          </button>
                          <button
                            onClick={() => handleEliminar(producto)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-500 bg-red-50 hover:bg-red-100 border border-red-100 hover:border-red-200 transition-colors"
                          >
                            <Trash2 size={12} />
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>

            {/* Pie de tabla — paginación */}
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                {meta && (
                  <p className="text-xs text-gray-400">
                    Mostrando página{' '}
                    <span className="font-semibold text-gray-600">{meta.page}</span> de{' '}
                    <span className="font-semibold text-gray-600">{meta.totalPages}</span>
                    {' '}(Total:{' '}
                    <span className="font-semibold text-gray-600">{meta.total}</span> productos)
                  </p>
                )}
                {productosFiltrados.some((p) => p.stock_local <= (p.stock_minimo ?? 5)) && (
                  <div className="flex items-center gap-1.5 text-xs text-red-400 font-medium">
                    <AlertTriangle size={12} />
                    Hay productos con stock bajo (según mínimo configurado)
                  </div>
                )}
              </div>

              {meta && meta.totalPages > 1 && (
                <div className="flex items-center gap-2 shrink-0">
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
              )}
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL — Crear / Editar Producto
      ══════════════════════════════════════════════════════════════════════ */}
      {modalAbierto && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) cerrarModal(); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">

            {/* Header del modal */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 rounded-xl">
                  {modoModal === 'crear' ? (
                    <Plus size={16} className="text-indigo-600" />
                  ) : (
                    <Edit size={16} className="text-indigo-600" />
                  )}
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-800">
                    {modoModal === 'crear' ? 'Nuevo Producto' : 'Editar Producto'}
                  </h2>
                  {modoModal === 'editar' && productoEditando && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[220px]">
                      {productoEditando.nombre}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={cerrarModal}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Cuerpo del modal */}
            <div className="px-6 py-5 space-y-4">

              {/* Error de formulario */}
              {errorForm && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-xs font-medium px-3 py-2.5 rounded-lg">
                  <AlertTriangle size={13} />
                  {errorForm}
                </div>
              )}

              {/* Nombre */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Nombre <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Tag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={form.nombre}
                    onChange={(e) => handleCampo('nombre', e.target.value)}
                    placeholder="Ej: Cuaderno A4 tapa dura"
                    autoFocus
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition"
                  />
                </div>
              </div>

              {/* Código de barras */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Código de Barras <span className="text-gray-300 font-normal normal-case">(opcional)</span>
                </label>
                <div className="relative">
                  <Barcode size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={form.codigo_barras}
                    onChange={(e) => handleCampo('codigo_barras', e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        precioInputRef.current?.focus();
                      }
                    }}
                    placeholder="Ej: 7798012345678"
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition font-mono"
                  />
                </div>
              </div>

              {/* Precio y Stock en fila */}
              <div className="grid grid-cols-2 gap-3">
                {/* Precio */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Precio <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none font-bold">$</span>
                    <input
                      ref={precioInputRef}
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.precio_actual}
                      onChange={(e) => handleCampo('precio_actual', e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-7 pr-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition"
                    />
                  </div>
                </div>

                {/* Stock */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Stock <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={form.stock}
                      onChange={(e) => handleCampo('stock', e.target.value)}
                      placeholder="0"
                      className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition"
                    />
                  </div>
                </div>
              </div>

              {/* Stock Mínimo para Alerta */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Stock Mínimo para Alerta
                </label>
                <div className="relative">
                  <AlertTriangle size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.stock_minimo}
                    onChange={(e) => handleCampo('stock_minimo', e.target.value)}
                    placeholder="5"
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition"
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Se mostrará alerta cuando el stock sea igual o menor a este valor</p>
              </div>

              {/* Costo */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Costo <span className="text-gray-300 font-normal normal-case">(opcional)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none font-bold">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.costo}
                    onChange={(e) => handleCampo('costo', e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-7 pr-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition"
                  />
                </div>
              </div>

              {/* Marca y Categoría */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Marca
                  </label>
                  <input
                    type="text"
                    value={form.marca}
                    onChange={(e) => handleCampo('marca', e.target.value)}
                    placeholder="Ej: Arcor"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Categoría
                  </label>
                  <input
                    type="text"
                    value={form.categoria}
                    onChange={(e) => handleCampo('categoria', e.target.value)}
                    placeholder="Ej: Bebidas"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition"
                  />
                </div>
              </div>

              {/* Proveedor */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Proveedor
                </label>
                <input
                  type="text"
                  value={form.proveedor}
                  onChange={(e) => handleCampo('proveedor', e.target.value)}
                  placeholder="Ej: Distribuidora Norte"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition"
                />
              </div>
            </div>

            {/* Footer del modal */}
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
              <button
                onClick={cerrarModal}
                disabled={isGuardando}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleGuardar}
                disabled={isGuardando || !form.nombre.trim() || !(parseFloat(form.precio_actual) > 0)}
                className={`
                  flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all duration-200
                  disabled:opacity-50 disabled:cursor-not-allowed
                  ${isGuardando || !form.nombre.trim() || !(parseFloat(form.precio_actual) > 0)
                    ? 'bg-gray-200 text-gray-400'
                    : 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white shadow-md shadow-indigo-100'
                  }
                `}
              >
                {isGuardando ? (
                  <><Loader2 size={15} className="animate-spin" /> Guardando...</>
                ) : (
                  modoModal === 'crear' ? 'Crear Producto' : 'Guardar Cambios'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL — Detalle del Producto (Solo lectura)
      ══════════════════════════════════════════════════════════════════════ */}
      {productoViendo && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setProductoViendo(null); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 rounded-xl">
                  <Package size={16} className="text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-800">Detalle del Producto</h2>
                  <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[220px]">
                    {productoViendo.nombre}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setProductoViendo(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              {[
                { label: 'Nombre', value: productoViendo.nombre },
                { label: 'Código de Barras', value: productoViendo.codigo_barras },
                { label: 'Precio de Venta', value: formatPrecio(productoViendo.precio_actual) },
                { label: 'Costo', value: productoViendo.costo != null ? formatPrecio(productoViendo.costo) : undefined },
                { label: 'Marca', value: productoViendo.marca },
                { label: 'Categoría', value: productoViendo.categoria },
                { label: 'Proveedor', value: productoViendo.proveedor },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
                  <span className="text-sm font-medium text-gray-800">{value || '—'}</span>
                </div>
              ))}

              {/* Alerta de stock */}
              <div className="flex items-center justify-between py-2.5 border-b border-gray-50">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Alerta stock bajo en</span>
                <span className="text-sm font-medium text-gray-800">{productoViendo.stock_minimo ?? 5} unidades</span>
              </div>

              {/* Stock badges */}
              <div className="flex items-center justify-between pt-4">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Stock</span>
                <div className="flex items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border ${
                    productoViendo.stock_local > 0
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-red-50 text-red-500 border-red-200'
                  }`}>
                    🏠 L1: {productoViendo.stock_local}
                  </span>
                  <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border ${
                    (productoViendo.stock_otro ?? 0) > 0
                      ? 'bg-sky-50 text-sky-700 border-sky-200'
                      : 'bg-red-50 text-red-500 border-red-200'
                  }`}>
                    🏪 L2: {productoViendo.stock_otro ?? 0}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
              <button
                onClick={() => setProductoViendo(null)}
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
