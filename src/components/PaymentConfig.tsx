import { useState, useEffect } from 'react';
import api from '../api/axiosClient';
import {
  Settings,
  Plus,
  Trash2,
  Loader2,
  Save,
  CreditCard,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';

interface RecargoEntry {
  cuotas: number;
  porcentaje: number;
}

const formatPrecio = (valor: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(valor);

export default function PaymentConfig() {
  const [recargos, setRecargos] = useState<RecargoEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // ── Carga inicial ─────────────────────────────────────────────
  const fetchConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data } = await api.get<{ recargos_credito?: Record<string, number> }>('/config');
      const raw = data?.recargos_credito ?? {};
      const entries: RecargoEntry[] = Object.entries(raw).map(([k, v]) => ({
        cuotas: Number(k),
        porcentaje: Number((v * 100).toFixed(2)),
      }));
      entries.sort((a, b) => a.cuotas - b.cuotas);
      setRecargos(entries.length > 0 ? entries : [{ cuotas: 1, porcentaje: 5 }]);
    } catch {
      setError('No se pudo cargar la configuración de recargos.');
      setRecargos([{ cuotas: 1, porcentaje: 5 }]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  // ── Guardar ───────────────────────────────────────────────────
  const handleSave = async () => {
    // Validar
    for (const entry of recargos) {
      if (!entry.cuotas || entry.cuotas < 1 || !Number.isInteger(entry.cuotas)) {
        setError('El número de cuotas debe ser un entero positivo.');
        return;
      }
      if (entry.porcentaje < 0) {
        setError('El porcentaje no puede ser negativo.');
        return;
      }
    }

    // Detectar cuotas duplicadas
    const cuotasSet = new Set(recargos.map((r) => r.cuotas));
    if (cuotasSet.size !== recargos.length) {
      setError('Hay cuotas duplicadas. Cada valor de cuota debe ser único.');
      return;
    }

    const payload: Record<string, number> = {};
    for (const entry of recargos) {
      payload[String(entry.cuotas)] = entry.porcentaje / 100;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(false);
      await api.put('/config/recargos', { recargos_credito: payload });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError('Error al guardar los recargos. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  // ── Agregar / Eliminar filas ──────────────────────────────────
  const addRow = () => {
    const maxCuotas = recargos.length > 0 ? Math.max(...recargos.map((r) => r.cuotas)) : 0;
    setRecargos([...recargos, { cuotas: maxCuotas + 1, porcentaje: 0 }]);
  };

  const removeRow = (idx: number) => {
    if (recargos.length <= 1) return;
    setRecargos(recargos.filter((_, i) => i !== idx));
  };

  const updateRow = (idx: number, field: keyof RecargoEntry, value: string) => {
    setRecargos((prev) =>
      prev.map((r, i) =>
        i === idx ? { ...r, [field]: parseFloat(value) || 0 } : r
      )
    );
  };

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-50 rounded-lg">
            <Settings size={15} className="text-purple-600" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-800">Configuración de Pagos</h2>
            <p className="text-xs text-gray-400">Cuotas y recargos de tarjeta de crédito</p>
          </div>
        </div>
        <button
          onClick={fetchConfig}
          disabled={loading}
          title="Recargar configuración"
          className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-purple-500 transition-colors disabled:opacity-40"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="px-6 py-5 space-y-4">
        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 text-red-600 rounded-xl text-xs font-medium border border-red-100">
            <AlertCircle size={14} className="shrink-0" />
            {error}
          </div>
        )}

        {/* Success */}
        {success && (
          <div className="flex items-center gap-2 p-3 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-medium border border-emerald-100">
            <Save size={14} className="shrink-0" />
            Configuración guardada con éxito.
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">Cargando configuración...</span>
          </div>
        ) : (
          <>
            {/* Tabla de cuotas */}
            <div className="space-y-2">
              {/* Header de columnas */}
              <div className="grid grid-cols-[1fr_1fr_auto] gap-3 px-1">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Cuotas</span>
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Recargo (%)</span>
                <span className="w-8" />
              </div>

              {recargos.map((entry, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-3 items-center">
                  <div className="relative">
                    <CreditCard size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={entry.cuotas || ''}
                      onChange={(e) => updateRow(idx, 'cuotas', e.target.value)}
                      placeholder="Ej: 12"
                      className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-transparent transition"
                    />
                  </div>
                  <div className="relative">
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400 pointer-events-none">%</span>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={entry.porcentaje || ''}
                      onChange={(e) => updateRow(idx, 'porcentaje', e.target.value)}
                      placeholder="Ej: 25"
                      className="w-full pl-3 pr-8 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-transparent transition"
                    />
                  </div>
                  <button
                    onClick={() => removeRow(idx)}
                    disabled={recargos.length <= 1}
                    className="p-2 rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Eliminar cuota"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            {/* Botón agregar */}
            <button
              onClick={addRow}
              className="flex items-center gap-1.5 text-xs font-semibold text-purple-500 hover:text-purple-700 transition-colors"
            >
              <Plus size={14} />
              Agregar cuota
            </button>

            {/* Botón guardar */}
            <button
              onClick={handleSave}
              disabled={saving}
              className={`w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                saving
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-purple-600 hover:bg-purple-700 text-white shadow-sm'
              }`}
            >
              {saving ? (
                <><Loader2 size={15} className="animate-spin" /> Guardando...</>
              ) : (
                <><Save size={15} /> Guardar Recargos</>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
