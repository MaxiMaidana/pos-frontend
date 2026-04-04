import { useState } from 'react';
import { toast } from 'sonner';
import { CloudUpload, Loader2 } from 'lucide-react';
import api from '../api/axiosClient';

export default function SyncButton() {
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await api.post('/sync/manual');
      toast.success('Sincronización completada.');
    } catch {
      toast.error('Error al sincronizar. Verificá la conexión con el servidor.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <button
      onClick={handleSync}
      disabled={isSyncing}
      title="Forzar sincronización con la nube"
      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
    >
      {isSyncing
        ? <Loader2 size={13} className="animate-spin" />
        : <CloudUpload size={13} />
      }
      <span className="hidden sm:inline">{isSyncing ? 'Sincronizando...' : 'Forzar Sync'}</span>
    </button>
  );
}
