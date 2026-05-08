import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { Lock, Loader2 } from "lucide-react";
import { hasStoredCiphertext, loadToken } from "@/lib/kiosk-crypto";

type Status = "loading" | "authorised" | "unauthorised";

export function KioskGuardLayout() {
  const [status, setStatus] = useState<Status>(
    // Skip async if there's no ciphertext at all
    hasStoredCiphertext() ? "loading" : "unauthorised",
  );

  useEffect(() => {
    if (status !== "loading") return;
    loadToken()
      .then((token) => setStatus(token ? "authorised" : "unauthorised"))
      .catch(() => setStatus("unauthorised"));
  }, [status]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === "unauthorised") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="flex justify-center">
            <div className="rounded-full bg-destructive/10 p-6">
              <Lock className="w-12 h-12 text-destructive" />
            </div>
          </div>
          <h1 className="text-2xl font-bold">Unauthorised Terminal</h1>
          <p className="text-muted-foreground text-sm">
            This terminal has not been authorised. Ask an admin to visit{" "}
            <span className="font-medium text-foreground">
              /kiosk/provision
            </span>{" "}
            on this device.
          </p>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
