import { useState } from "react";
import { Navigate } from "react-router-dom";
import { authClient } from "@/auth/client";
import { trpc } from "@/client/trpc";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, Monitor, XCircle } from "lucide-react";
import {
  clearToken,
  hasStoredCiphertext,
  storeToken,
} from "@/lib/kiosk-crypto";

export default function KioskProvision() {
  const { data: session, isPending } = authClient.useSession();
  const [provisioned, setProvisioned] = useState(() => hasStoredCiphertext());

  const provision = trpc.kiosk.provisionTerminal.useMutation({
    onSuccess: async ({ token }) => {
      await storeToken(token);
      setProvisioned(true);
    },
  });

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth/sign-in" replace />;
  }

  if (session.user.role !== "admin") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="flex justify-center">
            <div className="rounded-full bg-destructive/10 p-6">
              <XCircle className="w-12 h-12 text-destructive" />
            </div>
          </div>
          <h1 className="text-2xl font-bold">Admin access required</h1>
          <p className="text-muted-foreground text-sm">
            Only admins can authorise kiosk terminals.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="flex justify-center">
          <div
            className={`rounded-full p-6 ${provisioned ? "bg-green-500/10" : "bg-primary/10"}`}
          >
            <Monitor
              className={`w-12 h-12 ${provisioned ? "text-green-500" : "text-primary"}`}
            />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Provision Kiosk Terminal</h1>
          <p className="text-muted-foreground text-sm">
            {provisioned
              ? "This terminal is authorised and ready."
              : "This terminal has not been authorised yet."}
          </p>
        </div>

        {provisioned ? (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 text-green-500 text-sm font-medium">
              <CheckCircle2 className="w-4 h-4" />
              Authorised
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={async () => {
                await clearToken();
                setProvisioned(false);
              }}
            >
              Revoke this terminal
            </Button>
          </div>
        ) : (
          <Button
            className="w-full h-12 text-base"
            onClick={() => provision.mutate()}
            disabled={provision.isPending}
          >
            {provision.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Authorising...
              </>
            ) : (
              "Authorise this terminal"
            )}
          </Button>
        )}

        {provision.error && (
          <p className="text-destructive text-sm">{provision.error.message}</p>
        )}
      </div>
    </div>
  );
}
