import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from '@/context/ToastContext';
import { AppProvider } from '@/context/AppContext';
import ScrollToTop from '@/components/ScrollToTop';
import CookieConsent from '@/components/CookieConsent';
import EventPage from '@/pages/EventPage';
import LegalPage from '@/pages/LegalPage';
import AdminApp from '@/pages/AdminApp';
import StaffApp from '@/pages/StaffApp';

export default function App() {
  return (
    <AppProvider>
      <ToastProvider>
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<EventPage />} />
            <Route path="/terms" element={<LegalPage page="terms" />} />
            <Route path="/privacy" element={<LegalPage page="privacy" />} />
            <Route path="/refund" element={<LegalPage page="refund" />} />
            <Route path="/stall" element={<Navigate to="/" replace />} />
            <Route path="/admin/*" element={<AdminApp />} />
            <Route path="/staff" element={<StaffApp />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <CookieConsent />
        </BrowserRouter>
      </ToastProvider>
    </AppProvider>
  );
}
