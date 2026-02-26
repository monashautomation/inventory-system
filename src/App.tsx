import { Route, BrowserRouter, Routes } from "react-router-dom";
import Assets from "@/pages/Assets";
import Consumables from "@/pages/Consumables";
import Dashboard from "@/pages/Dashboard";
import Cart from "@/pages/Cart";
import AuthPage from "@/auth/page.tsx";
import { CartProvider } from "@/contexts/cart-context";
import { AuthProvider } from "@/auth/provider.tsx";
import React from "react";
import Settings from "@/pages/Settings";
import { Toaster } from "sonner";
import Transaction from "@/pages/Transaction.tsx";
import ErrorPage from "@/pages/Error.tsx";
import QR from "@/pages/QR.tsx";
import ItemDetails from "@/pages/ItemDetails.tsx";
import { ProtectedLayout } from "@/auth/ProtectedLayout.tsx";
import CheckIn from "@/pages/CheckIn.tsx";
import Chat from "./pages/Chat";
import PrintGcode from "@/pages/PrintGcode";
import PrintMonitoring from "@/pages/PrintMonitoring";
import PrinterManagement from "@/pages/PrinterManagement";

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
          <Toaster position="top-right" richColors closeButton />
          <Routes>
            <Route path="error" element={<ErrorPage />} />
            <Route path="/auth/:pathname" element={<AuthPage />} />
            <Route path="/" element={<ProtectedLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/transactions" element={<Transaction />} />
              <Route path="/assets/*" element={<Assets />} />
              <Route path="/consumables/*" element={<Consumables />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/item/:id" element={<ItemDetails />} />
              <Route path="/qr/*" element={<QR />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/checkin" element={<CheckIn />} />
              <Route path="/print" element={<PrintGcode />} />
              <Route path="/print-monitor" element={<PrintMonitoring />} />
              <Route
                path="/printer-management"
                element={<PrinterManagement />}
              />
            </Route>
          </Routes>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
