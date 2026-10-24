import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from '@/context/ToastContext';
import { AppProvider } from '@/context/AppContext';
import ScrollToTop from '@/components/ScrollToTop';
import LandingPage from '@/pages/LandingPage';
import AdminApp from '@/pages/AdminApp';

export default function App() {
  return (
    <AppProvider>
      <ToastProvider>
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/admin/*" element={<AdminApp />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AppProvider>
  );
}
