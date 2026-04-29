import { useState, useEffect } from "react";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { getPendingCount, processQueue } from "@/lib/offline-queue";
import { WifiOff, Wifi, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function OfflineIndicator() {
  const { isOnline } = useOnlineStatus();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [pendingCount, setPendingCount] = useState(getPendingCount());
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const update = () => setPendingCount(getPendingCount());
    window.addEventListener("offline-queue-change", update);
    const interval = setInterval(update, 2000);
    return () => {
      window.removeEventListener("offline-queue-change", update);
      clearInterval(interval);
    };
  }, []);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      syncNow();
    }
  }, [isOnline]);

  const syncNow = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const { processed, errors } = await processQueue();
      setPendingCount(getPendingCount());
      if (processed > 0) {
        qc.invalidateQueries();
        toast({ title: `${processed} alteração(ões) sincronizada(s)` });
      }
      if (errors > 0) {
        toast({ title: `${errors} erro(s) na sincronização`, description: "Tente novamente", variant: "destructive" });
      }
    } finally {
      setIsSyncing(false);
    }
  };

  if (isOnline && pendingCount === 0) return null;

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm mb-3 ${
      isOnline ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
    }`}>
      {isOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
      <span className="flex-1">
        {isOnline
          ? `${pendingCount} alteração(ões) pendente(s)`
          : `Offline${pendingCount > 0 ? ` — ${pendingCount} pendente(s)` : ""}`}
      </span>
      {isOnline && pendingCount > 0 && (
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={syncNow} disabled={isSyncing}>
          {isSyncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          <span className="ml-1">Sincronizar</span>
        </Button>
      )}
    </div>
  );
}
