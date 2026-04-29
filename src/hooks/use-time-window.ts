import { useState, useCallback, useMemo } from "react";

/**
 * Time window padrão para listagens grandes (Saídas, Entradas, AR, AP, etc).
 * Ciclo ao expandir: 30d → 3m → 6m → 12m → 24m → tudo.
 * Reset ao limpar filtros volta para 30d.
 *
 * - `since` é uma string ISO YYYY-MM-DD pronta para usar em `.gte("data", since)`,
 *   ou `null` quando o usuário escolheu "tudo".
 */
export type TimeWindowStep = "30d" | "3m" | "6m" | "12m" | "24m" | "all";

const ORDER: TimeWindowStep[] = ["30d", "3m", "6m", "12m", "24m", "all"];

const LABELS: Record<TimeWindowStep, string> = {
  "30d": "30 dias",
  "3m": "3 meses",
  "6m": "6 meses",
  "12m": "12 meses",
  "24m": "24 meses",
  all: "Tudo",
};

const NEXT_BUTTON_LABEL: Record<TimeWindowStep, string | null> = {
  "30d": "Ver 3 meses",
  "3m": "Ver 6 meses",
  "6m": "Ver 12 meses",
  "12m": "Ver 24 meses",
  "24m": "Ver tudo",
  all: null,
};

function computeSince(step: TimeWindowStep): string | null {
  if (step === "all") return null;
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (step === "30d") d.setDate(d.getDate() - 30);
  else if (step === "3m") d.setMonth(d.getMonth() - 3);
  else if (step === "6m") d.setMonth(d.getMonth() - 6);
  else if (step === "12m") d.setMonth(d.getMonth() - 12);
  else if (step === "24m") d.setMonth(d.getMonth() - 24);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function useTimeWindow(initial: TimeWindowStep = "30d") {
  const [step, setStep] = useState<TimeWindowStep>(initial);

  const since = useMemo(() => computeSince(step), [step]);

  const expand = useCallback(() => {
    setStep((prev) => {
      const i = ORDER.indexOf(prev);
      return ORDER[Math.min(i + 1, ORDER.length - 1)];
    });
  }, []);

  const reset = useCallback(() => setStep(initial), [initial]);

  return {
    step,
    since,
    label: LABELS[step],
    nextLabel: NEXT_BUTTON_LABEL[step],
    canExpand: step !== "all",
    expand,
    reset,
    setStep,
  };
}
