import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "@/client/trpc";
import { useKiosk } from "@/contexts/kiosk-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import logoLight from "@/assets/Horizontal Black & Blue.svg";
import logoDark from "@/assets/Horizontal White & Blue.svg";
import { OutageBanner } from "@/components/OutageBanner";

function isAfterHoursNow(): boolean {
  const h = new Date().getHours();
  return h >= 18 || h < 8;
}

export default function KioskLanding() {
  const [studentId, setStudentId] = useState("");
  const [showNotionDialog, setShowNotionDialog] = useState(false);
  const [showNotRegisteredDialog, setShowNotRegisteredDialog] = useState(false);
  const [afterHours, setAfterHours] = useState(isAfterHoursNow);

  useEffect(() => {
    const id = setInterval(() => setAfterHours(isAfterHoursNow()), 60_000);
    return () => clearInterval(id);
  }, []);
  const { setSession } = useKiosk();
  const navigate = useNavigate();

  const lookup = trpc.kiosk.lookupStudent.useMutation({
    onSuccess: (data) => {
      if (!data.found) {
        setShowNotRegisteredDialog(true);
        return;
      }
      setSession({
        student: {
          studentId: data.studentInfo.studentId,
          name: data.studentInfo.name,
          email: data.studentInfo.email,
          discordId: data.studentInfo.discordId,
        },
        user: data.user,
      });
      void navigate("/kiosk/home");
    },
    onError: (err) => {
      if (err.message === "MEMBER_NOT_FOUND") {
        setShowNotionDialog(true);
      } else {
        toast.error(err.message);
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = studentId.trim();
    if (!id) return;
    lookup.mutate({ studentId: id });
  };

  return (
    <>
      <OutageBanner />
      <AlertDialog
        open={showNotRegisteredDialog}
        onOpenChange={setShowNotRegisteredDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Account not initialised</AlertDialogTitle>
            <AlertDialogDescription>
              Your student ID hasn&apos;t been set up in the inventory system
              yet. Visit{" "}
              <span className="font-medium text-foreground">
                {window.location.host}
              </span>{" "}
              on a personal device to initialise your account, then try again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => setShowNotRegisteredDialog(false)}
            >
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={showNotionDialog} onOpenChange={setShowNotionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Student ID not found</AlertDialogTitle>
            <AlertDialogDescription>
              Your student ID could not be found in the member database. Please
              update your credentials on the Notion page and try again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowNotionDialog(false)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {afterHours && (
        <div className="fixed bottom-6 right-6 flex items-center gap-2 rounded-full bg-yellow-400/15 border border-yellow-400/40 px-4 py-2 text-yellow-700 dark:text-yellow-300 text-sm font-medium shadow-sm">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-400" />
          </span>
          After Hours
        </div>
      )}
      <div className="min-h-screen bg-background flex flex-col p-8">
        <div className="flex justify-center pt-8">
          <img
            src={logoLight}
            alt="Monash Automation"
            className="h-12 w-auto dark:hidden"
          />
          <img
            src={logoDark}
            alt="Monash Automation"
            className="h-12 w-auto hidden dark:block"
          />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-sm space-y-8">
            <div className="text-center space-y-2">
              <h1 className="text-3xl font-bold">Kiosk Terminal</h1>
              <p className="text-muted-foreground text-sm">
                Tap your card or enter your student ID
              </p>
            </div>

            {/* TODO: replace input with NFC tap event listener when hardware available */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                autoFocus
                placeholder="Student ID"
                value={studentId}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "");
                  setStudentId(digits);
                }}
                inputMode="numeric"
                pattern="[0-9]*"
                className="text-center text-lg h-14"
                disabled={lookup.isPending}
              />
              <Button
                type="submit"
                className="w-full h-12 text-base"
                disabled={!studentId.trim() || lookup.isPending}
              >
                {lookup.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Looking up...
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
