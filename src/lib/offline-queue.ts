import { supabase } from "@/integrations/supabase/client";

export interface OfflineOperation {
  id: string;
  type: "insert" | "update" | "delete";
  table: string;
  data?: Record<string, any>;
  matchId?: string; // row id for update/delete
  timestamp: number;
}

const STORAGE_KEY = "offline_queue";

function getQueue(): OfflineOperation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: OfflineOperation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

let _counter = 0;

export function enqueue(op: Omit<OfflineOperation, "id" | "timestamp">) {
  const queue = getQueue();
  queue.push({ ...op, id: `op_${Date.now()}_${++_counter}`, timestamp: Date.now() });
  saveQueue(queue);
  // Dispatch custom event so listeners can update count
  window.dispatchEvent(new Event("offline-queue-change"));
}

export function getPendingCount(): number {
  return getQueue().length;
}

export async function processQueue(): Promise<{ processed: number; errors: number }> {
  const queue = getQueue();
  if (queue.length === 0) return { processed: 0, errors: 0 };

  let processed = 0;
  let errors = 0;
  const remaining: OfflineOperation[] = [];

  for (const op of queue) {
    try {
      let result: any;

      if (op.type === "insert") {
        result = await supabase.from(op.table as any).insert(op.data as any);
      } else if (op.type === "update" && op.matchId) {
        result = await supabase.from(op.table as any).update(op.data as any).eq("id", op.matchId);
      } else if (op.type === "delete" && op.matchId) {
        result = await supabase.from(op.table as any).delete().eq("id", op.matchId);
      }

      if (result?.error) {
        console.error("Offline sync error:", result.error);
        errors++;
        remaining.push(op);
      } else {
        processed++;
      }
    } catch (e) {
      console.error("Offline sync exception:", e);
      errors++;
      remaining.push(op);
    }
  }

  saveQueue(remaining);
  window.dispatchEvent(new Event("offline-queue-change"));
  return { processed, errors };
}

export function clearQueue() {
  saveQueue([]);
  window.dispatchEvent(new Event("offline-queue-change"));
}
