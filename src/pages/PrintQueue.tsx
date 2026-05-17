import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { PrintQueuePanel } from "@/components/print-queue/PrintQueuePanel";
import { PrintJobModal } from "@/components/print-queue/PrintJobModal";
import { trpc } from "@/client/trpc";

const STATUS_TABS = [
  { value: undefined, label: "All" },
  { value: "pending", label: "Pending" },
  { value: "printing", label: "Printing" },
  { value: "completed", label: "Done" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

type TabValue = (typeof STATUS_TABS)[number]["value"];

export default function PrintQueue() {
  const [searchParams, setSearchParams] = useSearchParams();
  const openParam = searchParams.get("open");
  const [initialArchiveSource] = useState<"upload" | undefined>(
    openParam === "upload" ? "upload" : undefined,
  );
  const [modalOpen, setModalOpen] = useState(openParam === "upload");
  const [activeTab, setActiveTab] = useState<TabValue>(undefined);
  const utils = trpc.useUtils();

  useEffect(() => {
    if (openParam === "upload") {
      setSearchParams({}, { replace: true });
    }
  }, [openParam, setSearchParams]);

  function handleQueued() {
    void utils.printQueue.listQueue.invalidate();
    setActiveTab(undefined);
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Print Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage queued Bambu printer jobs
          </p>
        </div>
        <Button size="sm" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Queue job
        </Button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 border-b border-border">
        {STATUS_TABS.map((tab) => (
          <button
            key={String(tab.value)}
            onClick={() => setActiveTab(tab.value)}
            className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.value
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <PrintQueuePanel statusFilter={activeTab} />

      <PrintJobModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onQueued={handleQueued}
        initialArchiveSource={initialArchiveSource}
      />
    </div>
  );
}
