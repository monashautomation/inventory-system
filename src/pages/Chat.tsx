import { Construction } from "lucide-react";

export default function Chat() {
  return (
    <div className="flex flex-col h-[94vh] w-full pt-4">
      <div className="mb-6 px-4">
        <h1 className="text-3xl font-bold text-left">Chat</h1>
        <p className="text-muted-foreground">
          Ask questions about your inventory
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <div className="rounded-full bg-muted p-6">
            <Construction className="h-10 w-10 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Coming Soon</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Chat is currently under development. Check back soon.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
