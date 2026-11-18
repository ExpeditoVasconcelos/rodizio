import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import AdminPage from './pages/administration/AdminPage';
import DemonstrationPage from './pages/demonstration/DemonstrationPage';
import TabletPanelPage from './pages/tablet-panel/TabletPanelPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/painel" element={<TabletPanelPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/demo" element={<DemonstrationPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

