const PARTIAL_PAYMENT_LABEL = "Valor pago parcial: R$";

function normalizeCurrencyString(raw: string) {
  const value = raw.trim();
  if (!value) return "";

  if (value.includes(",") && value.includes(".")) {
    return value.replace(/\./g, "").replace(",", ".");
  }

  return value.replace(",", ".");
}

export function extractPartialPaymentValue(observacao?: string | null) {
  if (!observacao) return null;

  const match = observacao.match(/Valor pago parcial: R\$\s*([\d.,]+)/i);
  if (!match) return null;

  const parsed = Number(normalizeCurrencyString(match[1]));
  return Number.isFinite(parsed) ? parsed : null;
}

export function stripPartialPaymentObservation(observacao?: string | null) {
  if (!observacao) return "";

  return observacao
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith(PARTIAL_PAYMENT_LABEL))
    .join("\n")
    .trim();
}

export function upsertPartialPaymentObservation(observacao: string | null | undefined, valor: number) {
  const cleaned = stripPartialPaymentObservation(observacao);
  const partialLine = `${PARTIAL_PAYMENT_LABEL} ${valor.toFixed(2)}`;
  return cleaned ? `${cleaned}\n${partialLine}` : partialLine;
}