import { useParams } from "react-router-dom";
import { AuthCard } from "@daveyplate/better-auth-ui";
import logoHorizontalDark from "@/assets/Horizontal White & Blue.svg";
import logoHorizontalLight from "@/assets/Horizontal Black & Blue.svg";

export default function AuthPage() {
  const { pathname } = useParams();

  return (
    <main className="flex min-h-screen items-center justify-center p-4 md:p-6">
      <div className="flex flex-col items-center gap-6 w-full max-w-sm">
        <img
          src={logoHorizontalLight}
          alt="Monash Automation"
          className="h-10 w-auto dark:hidden"
        />
        <img
          src={logoHorizontalDark}
          alt="Monash Automation"
          className="h-10 w-auto hidden dark:block"
        />
        <AuthCard pathname={pathname} socialLayout="auto" />
      </div>
    </main>
  );
}
