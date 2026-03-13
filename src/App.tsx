import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { ShoppingCart, Wallet, PackageOpen, BarChart3 } from 'lucide-react';
import NuevaVenta from './pages/NuevaVenta';
import Caja from './pages/Caja';
import Inventario from './pages/Inventario';
import Dashboard from './pages/Dashboard';

function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen bg-gray-100 font-sans">
        
        {/* Menú Lateral (Sidebar) */}
        <aside className="w-64 bg-white shadow-xl flex flex-col">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-2xl font-black text-indigo-600 tracking-tight">POS Edge</h2>
            <p className="text-xs text-gray-400 mt-1">Librería Central</p>
          </div>
          
          <nav className="flex-1 p-4 space-y-2">
            <Link to="/" className="flex items-center gap-3 p-3 rounded-lg text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition-all font-medium">
              <ShoppingCart size={20} />
              Nueva Venta
            </Link>
            <Link to="/caja" className="flex items-center gap-3 p-3 rounded-lg text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition-all font-medium">
              <Wallet size={20} />
              Caja / Cobros
            </Link>
            <Link to="/inventario" className="flex items-center gap-3 p-3 rounded-lg text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition-all font-medium">
              <PackageOpen size={20} />
              Inventario
            </Link>
            <Link to="/dashboard" className="flex items-center gap-3 p-3 rounded-lg text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition-all font-medium">
              <BarChart3 size={20} />
              Dashboard
            </Link>
          </nav>
        </aside>

        {/* Área Principal de Contenido */}
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<NuevaVenta />} />
            <Route path="/caja" element={<Caja />} />
            <Route path="/inventario" element={<Inventario />} />
            <Route path="/dashboard" element={<Dashboard />} />
          </Routes>
        </main>

      </div>
    </BrowserRouter>
  );
}

export default App;