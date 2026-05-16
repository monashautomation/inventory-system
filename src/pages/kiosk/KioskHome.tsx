import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useKiosk } from "@/contexts/kiosk-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LogOut, Clock, PackageCheck, PackagePlus } from "lucide-react";
import logoTextDark from "@/assets/Horizontal White & Blue.svg";
import logoTextLight from "@/assets/Horizontal Black & Blue.svg";

const actions = [
  {
    label: "Log After Hours",
    description: "Record after-hours lab access",
    icon: Clock,
    href: "/kiosk/after-hours",
  },
  {
    label: "Check Out Items",
    description: "Scan items to borrow",
    icon: PackagePlus,
    href: "/kiosk/checkout",
  },
  {
    label: "Check In Items",
    description: "Return your loaned items",
    icon: PackageCheck,
    href: "/kiosk/checkin",
  },
] as const;

export default function KioskHome() {
  const { session, logout } = useKiosk();
  const navigate = useNavigate();

  useEffect(() => {
    if (!session) void navigate("/kiosk", { replace: true });
  }, [session, navigate]);

  if (!session) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b px-8 py-4 relative flex items-center justify-between">
        <div>
          <p className="text-lg font-semibold">{session.student.name}</p>
          <p className="text-sm text-muted-foreground">
            {session.student.email}
          </p>
        </div>
        <img
          src={logoTextLight}
          alt="Monash Automation"
          className="h-8 w-auto absolute left-1/2 -translate-x-1/2 dark:hidden"
        />
        <img
          src={logoTextDark}
          alt="Monash Automation"
          className="h-8 w-auto absolute left-1/2 -translate-x-1/2 hidden dark:block"
        />
        <Button variant="ghost" size="sm" onClick={logout}>
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </div>

      {/* Actions */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-lg space-y-4">
          <h2 className="text-xl font-semibold text-center mb-6">
            What would you like to do?
          </h2>
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Card
                key={action.href}
                className="cursor-pointer hover:bg-accent transition-colors"
                onClick={() => navigate(action.href)}
              >
                <CardContent className="flex items-center gap-4 py-5">
                  <div className="rounded-lg bg-primary/10 p-3">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">{action.label}</p>
                    <p className="text-sm text-muted-foreground">
                      {action.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
