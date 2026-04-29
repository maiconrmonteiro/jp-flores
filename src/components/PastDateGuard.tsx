import { useState } from "react";
import { localToday } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle } from "lucide-react";

// --- 24h localStorage cache for confirmed past dates ---
const STORAGE_KEY = "past_date_confirmed";

function getConfirmedDates(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch { return {}; }
}

function isDateConfirmed(dateStr: string): boolean {
  const map = getConfirmedDates();
  const ts = map[dateStr];
  if (!ts) return false;
  return Date.now() - ts < 24 * 60 * 60 * 1000;
}

function markDateConfirmed(dateStr: string) {
  const map = getConfirmedDates();
  // Clean expired entries
  const now = Date.now();
  for (const k of Object.keys(map)) {
    if (now - map[k] >= 24 * 60 * 60 * 1000) delete map[k];
  }
  map[dateStr] = now;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

// --- Components ---

interface PendingDate {
  value: string;
  step: 1 | 2;
}

interface PastDateGuardDialogProps {
  pending: PendingDate | null;
  onConfirm: (value: string) => void;
  onCancel: () => void;
  onAdvance: (value: string) => void;
}

function PastDateGuardDialog({ pending, onConfirm, onCancel, onAdvance }: PastDateGuardDialogProps) {
  const formatDate = (value: string) => value.split("-").reverse().join("/");
  const today = localToday();

  const isOpen = pending !== null;
  const isStep1 = pending?.step === 1;
  const isStep2 = pending?.step === 2;

  return (
    <>
      {/* Step 1: Initial warning */}
      <AlertDialog open={isOpen && isStep1}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2" style={{ color: "#d97706" }}>
              <AlertTriangle className="h-5 w-5" style={{ color: "#d97706" }} />
              Data anterior a hoje
            </AlertDialogTitle>
            <AlertDialogDescription>
              Você está criando um pedido com data{" "}
              <strong>{pending ? formatDate(pending.value) : ""}</strong>, que é anterior à data de hoje (
              {formatDate(today)}).
              <br /><br />
              Deseja realmente usar esta data?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancel}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              style={{ background: "#d97706" }}
              onClick={() => pending && onAdvance(pending.value)}
            >
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Step 2: Critical warning */}
      <AlertDialog open={isOpen && isStep2}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Atenção — Pedido NÃO será contabilizado!
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="text-destructive font-bold text-base mt-2 bg-destructive/10 rounded p-3 border border-destructive">
                  ⚠️ ESTE PEDIDO NÃO SERÁ CONTABILIZADO PARA COMPRA DESTA SEMANA.
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  A data <strong>{pending ? formatDate(pending.value) : ""}</strong> é anterior a hoje.
                  Pedidos com datas passadas não entram no cálculo de necessidade de compra.
                </p>
                <p className="mt-2 text-sm font-semibold">
                  Ao confirmar, este aviso não aparecerá mais para esta data nas próximas 24 horas.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancel}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={() => {
                if (pending) {
                  markDateConfirmed(pending.value);
                  onConfirm(pending.value);
                }
              }}
            >
              Sim, usar data passada
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface UsePastDateGuardResult {
  guardedOnChange: (value: string) => void;
  dialog: React.ReactElement;
}

/**
 * Wraps a date onChange handler to show a two-step confirmation
 * when the selected date is before today.
 * If the date was already confirmed within the last 24h, skips the dialog.
 */
export function usePastDateGuard(
  onChange: (value: string) => void
): UsePastDateGuardResult {
  const [pending, setPending] = useState<PendingDate | null>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const guardedOnChange = (value: string) => {
    const selected = new Date(value + "T00:00:00");
    if (selected < today) {
      if (isDateConfirmed(value)) {
        onChange(value);
      } else {
        setPending({ value, step: 1 });
      }
    } else {
      onChange(value);
    }
  };

  const dialog = (
    <PastDateGuardDialog
      pending={pending}
      onCancel={() => setPending(null)}
      onAdvance={(v) => setPending({ value: v, step: 2 })}
      onConfirm={(v) => { onChange(v); setPending(null); }}
    />
  );

  return { guardedOnChange, dialog };
}

/**
 * Returns a React element showing a past-date warning dialog.
 * Used when editing items on an order that already has a past date.
 * If the date was already confirmed within 24h, calls onConfirm immediately.
 */
interface PastDateEditWarningProps {
  open: boolean;
  orderDate: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PastDateEditWarning({ open, orderDate, onConfirm, onCancel }: PastDateEditWarningProps) {
  const formatDate = (value: string) => value.split("-").reverse().join("/");

  // If the date is already confirmed in the 24h cache, auto-confirm
  if (open && isDateConfirmed(orderDate)) {
    // Use setTimeout to avoid calling setState during render
    setTimeout(onConfirm, 0);
    return null;
  }

  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Pedido com data passada
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>
              <p className="text-destructive font-bold text-base mt-2 bg-destructive/10 rounded p-3 border border-destructive">
                ⚠️ ESTE PEDIDO NÃO SERÁ CONTABILIZADO PARA COMPRA DESTA SEMANA.
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                Este pedido possui data <strong>{formatDate(orderDate)}</strong>, que é anterior a hoje.
                Alterações neste pedido não afetam o cálculo de necessidade de compra da semana atual.
              </p>
              <p className="mt-2 text-sm font-semibold">
                Ao confirmar, este aviso não aparecerá mais para esta data nas próximas 24 horas.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive hover:bg-destructive/90 text-white"
            onClick={() => {
              markDateConfirmed(orderDate);
              onConfirm();
            }}
          >
            Sim, editar pedido passado
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
