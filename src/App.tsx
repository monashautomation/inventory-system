import {
  Route,
  BrowserRouter,
  Routes,
  Navigate,
  useLocation,
} from "react-router-dom";
import Assets from "@/pages/Assets";
import Consumables from "@/pages/Consumables";
import ConsumableRequests from "@/pages/ConsumableRequests";
import MyRequests from "@/pages/MyRequests";
import AuditLog from "@/pages/AuditLog";
import Activity from "@/pages/Activity";
import Members from "@/pages/Members";
import Dashboard from "@/pages/Dashboard";
import Cart from "@/pages/Cart";
import AuthPage from "@/auth/page.tsx";
import { CartProvider } from "@/contexts/cart-context";
import { AuthProvider } from "@/auth/provider.tsx";
import React from "react";
import Settings from "@/pages/Settings";
import { Toaster } from "sonner";
import ErrorPage from "@/pages/Error.tsx";
import QR from "@/pages/QR.tsx";
import ItemDetails from "@/pages/ItemDetails.tsx";
import { ProtectedLayout } from "@/auth/ProtectedLayout.tsx";
import CheckIn from "@/pages/CheckIn.tsx";
import Chat from "./pages/Chat";
import PrintGcode from "@/pages/PrintGcode";
import PrintMonitoring from "@/pages/PrintMonitoring";
import PrintCam from "@/pages/PrintCam";
import PrinterManagement from "@/pages/PrinterManagement";
import PrintQueue from "@/pages/PrintQueue";
import PrintStats from "@/pages/PrintStats";
import PrintHistory from "@/pages/PrintHistory";
import { KioskProvider } from "@/contexts/kiosk-context";
import KioskLanding from "@/pages/kiosk/KioskLanding";
import KioskHome from "@/pages/kiosk/KioskHome";
import KioskAfterHours from "@/pages/kiosk/KioskAfterHours";
import KioskCheckout from "@/pages/kiosk/KioskCheckout";
import KioskCheckin from "@/pages/kiosk/KioskCheckin";
import KioskPrintStatus from "@/pages/kiosk/KioskPrintStatus";
import KioskProvision from "@/pages/kiosk/KioskProvision";
import { KioskGuardLayout } from "@/pages/kiosk/KioskGuardLayout";
import { LEGACY_PRINT_REDIRECTS, PRINTING_ROUTES } from "@/lib/printingRoutes";

/** Redirect to `to`, preserving the query string and hash (e.g. ?open=upload). */
const RedirectPreserve = ({ to }: { to: string }) => {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
};

const App = () => {
  React.useEffect(() => {
    // On mount, apply theme based on localStorage or system preference
    const isDark =
      localStorage.theme === "dark" ||
      (!localStorage.theme &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <KioskProvider>
            <Toaster position="top-right" richColors closeButton />
            <Routes>
              <Route path="error" element={<ErrorPage />} />
              <Route path="/auth/:pathname" element={<AuthPage />} />
              <Route path="/kiosk/provision" element={<KioskProvision />} />
              <Route element={<KioskGuardLayout />}>
                <Route path="/kiosk" element={<KioskLanding />} />
                <Route path="/kiosk/home" element={<KioskHome />} />
                <Route
                  path="/kiosk/after-hours"
                  element={<KioskAfterHours />}
                />
                <Route path="/kiosk/checkout" element={<KioskCheckout />} />
                <Route path="/kiosk/checkin" element={<KioskCheckin />} />
                <Route
                  path="/kiosk/print-status"
                  element={<KioskPrintStatus />}
                />
              </Route>
              <Route path="/" element={<ProtectedLayout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/activity" element={<Activity />} />
                <Route
                  path="/transactions"
                  element={<Navigate to="/activity" replace />}
                />
                <Route
                  path="/audit-log"
                  element={<Navigate to="/activity" replace />}
                />
                <Route path="/assets/*" element={<Assets />} />
                <Route
                  path="/consumables/requests"
                  element={<ConsumableRequests />}
                />
                <Route path="/consumables/*" element={<Consumables />} />
                <Route path="/my-requests" element={<MyRequests />} />
                <Route path="/audit-log" element={<AuditLog />} />
                <Route path="/members" element={<Members />} />
                <Route path="/cart" element={<Cart />} />
                <Route path="/item/:id" element={<ItemDetails />} />
                <Route path="/qr/*" element={<QR />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/chat" element={<Chat />} />
                <Route path="/checkin" element={<CheckIn />} />
                <Route
                  path="/printing"
                  element={<Navigate to={PRINTING_ROUTES.monitor} replace />}
                />
                <Route path="/printing/send" element={<PrintGcode />} />
                <Route path="/printing/queue" element={<PrintQueue />} />
                <Route path="/printing/monitor" element={<PrintMonitoring />} />
                <Route path="/printing/cameras" element={<PrintCam />} />
                <Route path="/printing/stats" element={<PrintStats />} />
                <Route path="/printing/history" element={<PrintHistory />} />
                <Route
                  path="/printing/printers"
                  element={<PrinterManagement />}
                />
                {/* Legacy URLs: kept permanently so old links keep working */}
                {Object.entries(LEGACY_PRINT_REDIRECTS).map(([from, to]) => (
                  <Route
                    key={from}
                    path={from}
                    element={<RedirectPreserve to={to} />}
                  />
                ))}
              </Route>
            </Routes>
          </KioskProvider>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
