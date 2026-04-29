// Print utilities for 80mm thermal printer using jsPDF
import jsPDF from "jspdf";
import { parseCochoFromObs, cochoHasValues, formatCochoLine, stripCochoFromObs } from "@/components/CochoButton";
import { stripPartialPaymentObservation } from "@/lib/order-payment";

const W = 80; // page width mm
const M = 4;  // margin mm
const ROW_H = 6;   // height per single-line item row (includes separator)
const ROW_H2 = 9.5; // height per two-line item row (includes separator)
const BASE_SAIDA = 80;
const BASE_ENTRADA = 80;

// Pre-cache logo on module load to avoid delay on first print
let cachedLogoBase64: string | null = null;
let logoLoadPromise: Promise<string | null> | null = null;

function loadLogoBase64(): Promise<string | null> {
  if (cachedLogoBase64) return Promise.resolve(cachedLogoBase64);
  if (logoLoadPromise) return logoLoadPromise;
  logoLoadPromise = (async () => {
    try {
      const res = await fetch("/logo-jp-flores.png");
      const blob = await res.blob();
      return new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          cachedLogoBase64 = reader.result as string;
          resolve(cachedLogoBase64);
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  })();
  return logoLoadPromise;
}

// Start preloading immediately
loadLogoBase64();

async function drawCompanyHeader(pdf: jsPDF, logoBase64: string | null): Promise<number> {
  let y = 4;

  // Logo à esquerda + nome ao lado
  const logoSize = 10;
  const textX = logoBase64 ? M + logoSize + 2 : M;

  if (logoBase64) {
    pdf.addImage(logoBase64, "PNG", M, y - 1, logoSize, logoSize);
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(0, 0, 0);
  pdf.text("JP Flores", textX, y + 2.5);

  pdf.setFontSize(6.5);
  pdf.text("Comércio de Flores LTDA.", textX, y + 5.5);

  pdf.setFontSize(6);
  pdf.text("CNPJ: 16.905.456/0001-30", textX, y + 8);

  y += logoSize + 4;

  return y;
}

export async function printSaida80mm(pedido: any, descontoPercent = 0) {
  const cliente = pedido.clientes;
  const rawItens = pedido.itens_saida || [];
  const consolidated = consolidateItems(rawItens, "preco");
  const itens = sortByUnitThenName(consolidated, (i: any) => i.produtos?.unidade || "", (i: any) => i.produtos?.descricao || "");
  let subtotal = 0;

  // Calculate dynamic page height based on whether items need 2 lines
  let estimatedRowsH = 0;
  for (const i of itens) {
    const desc = i.produtos?.descricao || "";
    estimatedRowsH += desc.length > MAX_PRODUCT_CHARS ? ROW_H2 : ROW_H;
  }
  // Add extra height for discount line, parcial info, and tipo_pagamento
  const isParcial = pedido.tipo_pagamento === "parcial";
  const cochoExtra = cochoHasValues(parseCochoFromObs(pedido.observacao)) ? 8 : 0;
  const extraH = (descontoPercent > 0 ? 10 : 0) + (isParcial ? 20 : 0) + 12 + cochoExtra;
  const pageH = BASE_SAIDA + estimatedRowsH + extraH;

  const pdf = new jsPDF({ unit: "mm", format: [W, pageH] });

  const logoBase64 = await loadLogoBase64();
  let y = await drawCompanyHeader(pdf, logoBase64);

  const orcamentoNum = pedido.orcamento_num || Math.floor(10000 + Math.random() * 90000);

  // Cliente em destaque
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(0, 0, 0);
  pdf.text(cliente?.nome || "", M, y);
  y += 4;

  // Data, Nº na mesma linha (tipo pagamento vai ao final)
  pdf.setFontSize(8);
  const infoLine = `${fmtDate(pedido.data)}  Nº ${orcamentoNum}`;
  pdf.text(infoLine, M, y);
  y += 5;

  // Table header
  y = tableHeader(pdf, ["QTD", "Produto", "Preço", "Total"], y);

  // Rows - produtos em negrito, sem abreviação
  for (let idx = 0; idx < itens.length; idx++) {
    const i = itens[idx];
    const t = Number(i.quantidade) * Number(i.preco);
    subtotal += t;
    y = tableRowBold(pdf, String(i.quantidade), i.produtos?.descricao || "", fmt(i.preco), fmt(t), y, idx === itens.length - 1);
  }

  const tipoPag = pedido.tipo_pagamento || "";
  const tipoPagLabel = formatTipoPagamento(tipoPag);

  // Parse valor pago from observacao for parcial
  let valorPago = 0;
  if (isParcial && pedido.observacao) {
    const m = pedido.observacao.match(/Valor pago parcial: R\$ ([\d.,]+)/);
    if (m) valorPago = Number(m[1].replace(",", "."));
  }

  if (descontoPercent > 0) {
    const descontoValor = subtotal * (descontoPercent / 100);
    const totalFinal = subtotal - descontoValor;
    y = totalLineWithDiscount(pdf, subtotal, descontoPercent, descontoValor, totalFinal, y);
    // Parcial breakdown after discount
    if (isParcial && valorPago > 0) {
      y = parcialBreakdown(pdf, totalFinal, valorPago, y);
    }
  } else {
    y = totalLine(pdf, subtotal, y);
    // Parcial breakdown
    if (isParcial && valorPago > 0) {
      y = parcialBreakdown(pdf, subtotal, valorPago, y);
    }
  }

  // Cocho info
  const cochoData = parseCochoFromObs(pedido.observacao);
  if (cochoHasValues(cochoData)) {
    y += 2;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text(`Cochos: ${formatCochoLine(cochoData)}`, M, y);
    y += 6;
  }

  // Tipo pagamento no final, grande
  if (tipoPagLabel && !isParcial) {
    y = tipoPagamentoLine(pdf, tipoPagLabel, y);
  }

  openPdf(pdf, cliente?.nome, pedido.data);
}

export async function printEntrada80mm(pedido: any) {
  const rawItens = pedido.itens_entrada || [];
  const consolidated = consolidateItems(rawItens, "preco_custo");
  const itens = sortByUnitThenName(consolidated, (i: any) => i.produtos?.unidade || "", (i: any) => i.produtos?.descricao || "");
  let total = 0;

  let estimatedRowsH = 0;
  for (const i of itens) {
    const desc = i.produtos?.descricao || "";
    estimatedRowsH += desc.length > MAX_PRODUCT_CHARS ? ROW_H2 : ROW_H;
  }
  const tipoPagLabel = formatTipoPagamento(pedido.tipo_pagamento);
  const descontoExtra = (Number(pedido.desconto) || 0) > 0 ? 12 : 0;
  const pageH = BASE_ENTRADA + estimatedRowsH + 12 + descontoExtra;

  const pdf = new jsPDF({ unit: "mm", format: [W, pageH] });

  const logoBase64 = await loadLogoBase64();
  let y = await drawCompanyHeader(pdf, logoBase64);

  const orcamentoNum = pedido.orcamento_num || Math.floor(10000 + Math.random() * 90000);

  // Fornecedor em destaque
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(0, 0, 0);
  pdf.text(pedido.fornecedores?.nome || "", M, y);
  y += 4;

  // Data, Nº na mesma linha (tipo pagamento vai ao final)
  pdf.setFontSize(8);
  pdf.text(`${fmtDate(pedido.data)}  Nº ${orcamentoNum}`, M, y);
  y += 5;

  y = tableHeader(pdf, ["QTD", "Produto", "P.Custo", "Total"], y);

  for (let idx = 0; idx < itens.length; idx++) {
    const i = itens[idx];
    const t = Number(i.quantidade) * Number(i.preco_custo);
    total += t;
    y = tableRowBold(pdf, String(i.quantidade), i.produtos?.descricao || "", fmt(i.preco_custo), fmt(t), y, idx === itens.length - 1);
  }

  const desconto = Number(pedido.desconto) || 0;
  if (desconto > 0) {
    const totalFinal = Math.max(0, total - desconto);
    y = totalLineWithDiscountRS(pdf, total, desconto, totalFinal, y);
  } else {
    y = totalLine(pdf, total, y);
  }

  // Tipo pagamento no final, grande
  if (tipoPagLabel) {
    y = tipoPagamentoLine(pdf, tipoPagLabel, y);
  }

  openPdf(pdf, pedido.fornecedores?.nome, pedido.data);
}

// ---- Entrada A4 Print (HTML-based) ----

export async function printEntradaA4(pedido: any) {
  const rawItens = pedido.itens_entrada || [];
  const consolidated = consolidateItems(rawItens, "preco_custo");
  const itens = sortByUnitThenName(consolidated, (i: any) => i.produtos?.unidade || "", (i: any) => i.produtos?.descricao || "");

  const logoUrl = `${window.location.origin}/logo-jp-flores.png`;
  const dataFormatada = fmtDate(pedido.data);
  const orcamentoNum = pedido.orcamento_num || "";
  const tipoPagLabel = formatTipoPagamento(pedido.tipo_pagamento);

  let total = 0;
  let rowsHtml = "";
  itens.forEach((i: any) => {
    const t = Number(i.quantidade) * Number(i.preco_custo);
    total += t;
    const un = i.produtos?.unidade || "UN";
    rowsHtml += `<tr><td class="col-qty">${i.quantidade}</td><td>${i.produtos?.descricao || ""}</td><td class="col-un">${un}</td><td class="col-price">R$ ${fmt(i.preco_custo)}</td><td class="col-total">R$ ${fmt(t)}</td></tr>`;
  });

  const pagamentoHtml = tipoPagLabel ? `<div style="font-size:11px;font-weight:600;color:#333;margin-bottom:4px">Pagamento: ${tipoPagLabel}</div>` : "";

  const styles = `
    body{font-family:Arial,Helvetica,sans-serif;margin:15px;font-size:11px;color:#222}
    .header{display:flex;align-items:center;gap:12px;border-bottom:2px solid #333;padding-bottom:8px;margin-bottom:6px}
    .header img{width:55px;height:55px;object-fit:contain}
    .header-info{line-height:1.3}
    .header-info .empresa{font-size:13px;font-weight:bold}
    .header-info .cnpj{font-size:10px;color:#555}
    .header-info .data{font-size:10px;color:#555}
    .orcamento-num{font-size:14px;font-weight:600;text-align:right;margin-bottom:4px;color:#222}
    .fornecedor-nome{font-size:16px;font-weight:bold;margin:6px 0 2px}
    table{border-collapse:collapse;width:100%;margin-bottom:6px}
    th,td{border:1px solid #999;padding:2px 6px;text-align:left;font-size:12px}
    th{background:#e8e8e8;font-size:10px;font-weight:bold}
    .col-qty{width:30px;text-align:center}
    .col-price{width:65px;text-align:right}
    .col-total{width:65px;text-align:right}
    .col-un{width:25px;text-align:center}
    .total-row{font-weight:bold;text-align:right;font-size:12px;margin-top:2px}
    @media print{body{margin:10px}}
  `;

  const body = `
    <div class="header">
      <img src="${logoUrl}" alt="Logo"/>
      <div class="header-info">
        <div class="empresa">JP Flores LTDA.</div>
        <div class="cnpj">CNPJ: 16.905.456/0001-30</div>
        <div class="data">Data: ${dataFormatada}</div>
      </div>
    </div>
    ${orcamentoNum ? `<div class="orcamento-num">Nº ${orcamentoNum}</div>` : ""}
    <div class="fornecedor-nome">${pedido.fornecedores?.nome || ""}</div>
    ${pagamentoHtml}
    <table><thead><tr><th class="col-qty">QTD</th><th>Produto</th><th class="col-un">UN</th><th class="col-price">P.Custo</th><th class="col-total">Total</th></tr></thead><tbody>${rowsHtml}</tbody></table>
    ${(() => {
      const desconto = Number(pedido.desconto) || 0;
      if (desconto > 0) {
        const totalFinal = Math.max(0, total - desconto);
        return `<div class="total-row">Subtotal: R$ ${fmt(total)}</div><div class="total-row" style="font-size:11px;color:#666">Desconto: -R$ ${fmt(desconto)}</div><div class="total-row" style="font-size:14px">Total: R$ ${fmt(totalFinal)}</div>`;
      }
      return `<div class="total-row">Total: R$ ${fmt(total)}</div>`;
    })()}
  `;

  const html = `<html><head><title>Entrada</title><style>${styles}</style></head><body>${body}</body></html>`;
  openHtmlPrint(html);
}

// ---- helpers ----

// Compact column layout: QTD just fits "QTD", product takes most space, price/total tight
const COL_QTD_X = M;           // QTD starts at margin
const COL_PROD_X = M + 9;     // Product starts after ~9mm (fits "QTD" text)
const COL_PRICE_R = W - M - 16; // Price right-aligned
const COL_TOTAL_R = W - M;     // Total right-aligned
const MAX_PRODUCT_CHARS = 20;  // Max chars per line for product name (must not overlap price)

function title(pdf: jsPDF, text: string, y: number) {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(text, W / 2, y, { align: "center" });
  return y + 6;
}

function line(pdf: jsPDF, text: string, size: number, y: number) {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(size);
  pdf.setTextColor(0, 0, 0);
  pdf.text(text, M, y);
  return y + 5;
}

function tableHeader(pdf: jsPDF, headers: string[], y: number) {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(0, 0, 0);
  pdf.text(headers[0], COL_QTD_X, y);
  pdf.text(headers[1], COL_PROD_X, y);
  pdf.text(headers[2], COL_PRICE_R, y, { align: "right" });
  pdf.text(headers[3], COL_TOTAL_R, y, { align: "right" });
  y += 1.5;
  pdf.setLineWidth(0.4);
  pdf.setDrawColor(0);
  pdf.line(M, y, W - M, y);
  return y + 3;
}

function tableRow(pdf: jsPDF, cells: string[], y: number) {
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(0, 0, 0);
  pdf.text(cells[0], COL_QTD_X, y);
  pdf.text(cells[1], COL_PROD_X, y);
  pdf.text(cells[2], COL_PRICE_R, y, { align: "right" });
  pdf.text(cells[3], COL_TOTAL_R, y, { align: "right" });
  return y + 4.5;
}

/** Renders a bold row with multi-line product name (max 2 lines, no truncation) */
function tableRowBold(pdf: jsPDF, qty: string, product: string, price: string, total: string, y: number, isLast = false): number {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(0, 0, 0);

  const lines = wrapText(product, MAX_PRODUCT_CHARS);

  pdf.text(qty, COL_QTD_X, y);
  pdf.text(lines[0], COL_PROD_X, y);
  pdf.text(price, COL_PRICE_R, y, { align: "right" });
  pdf.text(total, COL_TOTAL_R, y, { align: "right" });

  if (lines.length > 1) {
    y += 3.5;
    pdf.text(lines[1], COL_PROD_X, y);
  }

  if (!isLast) {
    y += 3;
    pdf.setDrawColor(100);
    pdf.setLineWidth(0.2);
    pdf.setLineDashPattern([1, 1], 0);
    pdf.line(M, y, W - M, y);
    pdf.setLineDashPattern([], 0);
    pdf.setDrawColor(0);
    return y + 3;
  }

  return y + 4.5;
}

/** Wrap text into lines of max `max` characters, max 2 lines */
function wrapText(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  // Try to break at last space within max
  const sub = text.substring(0, max);
  const lastSpace = sub.lastIndexOf(" ");
  if (lastSpace > 0) {
    return [text.substring(0, lastSpace), text.substring(lastSpace + 1).substring(0, max)];
  }
  // No space, hard break
  return [text.substring(0, max), text.substring(max, max * 2)];
}

function totalLine(pdf: jsPDF, total: number, y: number) {
  y += 2;
  pdf.setLineWidth(0.4);
  pdf.line(M, y, W - M, y);
  y += 5;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.setTextColor(0, 0, 0);
  pdf.text("Total: R$ " + fmt(total), W - M, y, { align: "right" });
  return y + 6;
}

function totalLineWithDiscount(pdf: jsPDF, subtotal: number, descontoPercent: number, descontoValor: number, totalFinal: number, y: number) {
  y += 2;
  pdf.setLineWidth(0.4);
  pdf.line(M, y, W - M, y);
  y += 5;
  // Subtotal
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(0, 0, 0);
  pdf.text("Subtotal: R$ " + fmt(subtotal), W - M, y, { align: "right" });
  y += 5;
  // Desconto
  pdf.setFontSize(10);
  pdf.text(`Desconto (${descontoPercent}%): -R$ ${fmt(descontoValor)}`, W - M, y, { align: "right" });
  y += 5;
  // Total final
  pdf.setFontSize(16);
  pdf.text("Total: R$ " + fmt(totalFinal), W - M, y, { align: "right" });
  return y + 6;
}

function totalLineWithDiscountRS(pdf: jsPDF, subtotal: number, descontoRS: number, totalFinal: number, y: number) {
  y += 2;
  pdf.setLineWidth(0.4);
  pdf.line(M, y, W - M, y);
  y += 5;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(0, 0, 0);
  pdf.text("Subtotal: R$ " + fmt(subtotal), W - M, y, { align: "right" });
  y += 5;
  pdf.setFontSize(10);
  pdf.text(`Desconto: -R$ ${fmt(descontoRS)}`, W - M, y, { align: "right" });
  y += 5;
  pdf.setFontSize(16);
  pdf.text("Total: R$ " + fmt(totalFinal), W - M, y, { align: "right" });
  return y + 6;
}

function parcialBreakdown(pdf: jsPDF, totalNota: number, valorPago: number, y: number) {
  const ficou = totalNota - valorPago;
  y += 2;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.setTextColor(0, 0, 0);
  pdf.text(`Pagou: R$ ${fmt(valorPago)}`, W - M, y, { align: "right" });
  y += 5;
  pdf.text(`Ficou: R$ ${fmt(ficou)}`, W - M, y, { align: "right" });
  return y + 4;
}

function tipoPagamentoLine(pdf: jsPDF, tipoPag: string, y: number) {
  y += 2;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.setTextColor(0, 0, 0);
  pdf.text(tipoPag, W / 2, y, { align: "center" });
  return y + 8;
}

function isStandalonePWA() {
  return (
    (window.navigator as any).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function buildPdfFilename(nome?: string, data?: string): string {
  const clean = (nome || "pedido").replace(/[^a-zA-Z0-9À-ÿ]/g, "").substring(0, 30);
  const ddmm = data ? data.split("-").slice(1).reverse().join("") : new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }).replace("/", "");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${clean}${ddmm}${rand}.pdf`;
}

function openPdf(pdf: jsPDF, nome?: string, data?: string) {
  const blob = pdf.output("blob");
  const url = URL.createObjectURL(blob);
  const filename = buildPdfFilename(nome, data);

  if (isStandalonePWA() && isIOS()) {
    // iOS PWA: force download so native viewer opens with "Open in..."
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return;
  }

  // Android PWA and browsers: open directly in viewer
  const w = window.open(url, "_blank");
  if (!w) {
    // Fallback if popup blocked: force download
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function fmt(n: number | string) { return Number(n).toFixed(2); }
function fmtDate(d: string) { return d ? d.split("-").reverse().join("/") : ""; }
function trunc(s: string, max: number) { return s.length > max ? s.substring(0, max - 1) + "." : s; }

const UNIT_ORDER: Record<string, number> = { MC: 0, VS: 1, CX: 2, UN: 3 };

export function sortByUnitThenName<T>(items: T[], getUnit: (i: T) => string, getName: (i: T) => string): T[] {
  return [...items].sort((a, b) => {
    const ua = UNIT_ORDER[getUnit(a)] ?? 99;
    const ub = UNIT_ORDER[getUnit(b)] ?? 99;
    if (ua !== ub) return ua - ub;
    return getName(a).localeCompare(getName(b));
  });
}

/**
 * Consolidate items with the same produto_id + price by summing quantities.
 * Returns a new array with merged items.
 */
export function consolidateItems<T extends { produto_id: string; quantidade: number; [key: string]: any }>(
  items: T[],
  priceField: string
): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    const key = `${item.produto_id}||${Number(item[priceField] || 0).toFixed(4)}`;
    if (map.has(key)) {
      const existing = map.get(key)!;
      existing.quantidade = Number(existing.quantidade) + Number(item.quantidade);
    } else {
      map.set(key, { ...item });
    }
  }
  return Array.from(map.values());
}

// ---- Saída A4 Print (HTML-based, same style as Totalizador romaneio) ----

export async function printSaidaA4(pedido: any, descontoPercent = 0, observacao = "") {
  const cliente = pedido.clientes;
  const rawItens = pedido.itens_saida || [];
  const consolidated = consolidateItems(rawItens, "preco");
  const itens = sortByUnitThenName(consolidated, (i: any) => i.produtos?.unidade || "", (i: any) => i.produtos?.descricao || "");

  const logoUrl = `${window.location.origin}/logo-jp-flores.png`;
  const dataFormatada = fmtDate(pedido.data);
  const orcamentoNum = pedido.orcamento_num || "";

  let subtotal = 0;
  let rowsHtml = "";
  itens.forEach((i: any) => {
    const total = Number(i.quantidade) * Number(i.preco);
    subtotal += total;
    const un = i.produtos?.unidade || "UN";
    rowsHtml += `<tr><td class="col-qty">${i.quantidade}</td><td>${i.produtos?.descricao || ""}</td><td class="col-un-rom">${un}</td><td class="col-price">R$ ${fmt(i.preco)}</td><td class="col-total">R$ ${fmt(total)}</td></tr>`;
  });

  let enderecoHtml = "";
  if (cliente?.bairro) enderecoHtml += `${cliente.bairro}, `;
  if (cliente?.cidade) enderecoHtml += `${cliente.cidade}`;
  if (cliente?.estado) enderecoHtml += ` - ${cliente.estado}`;
  if (cliente?.cep) enderecoHtml += ` | CEP: ${cliente.cep}`;
  if (cliente?.complemento) enderecoHtml += ` | ${cliente.complemento}`;
  if (cliente?.telefone) enderecoHtml += ` | Tel: ${cliente.telefone}`;

  // Parse parcial value
  const isParcial = pedido.tipo_pagamento === "parcial";
  let valorPagoParcial = 0;
  if (isParcial && pedido.observacao) {
    const m = pedido.observacao.match(/Valor pago parcial: R\$ ([\d.,]+)/);
    if (m) valorPagoParcial = Number(m[1].replace(",", "."));
  }

  let totalHtml = "";
  if (descontoPercent > 0) {
    const descontoValor = subtotal * (descontoPercent / 100);
    const totalFinal = subtotal - descontoValor;
    totalHtml = `<div class="total-row">Subtotal: R$ ${fmt(subtotal)}</div>`;
    totalHtml += `<div class="total-row" style="font-weight:normal;font-size:11px">Desconto (${descontoPercent}%): -R$ ${fmt(descontoValor)}</div>`;
    totalHtml += `<div class="total-row">Total: R$ ${fmt(totalFinal)}</div>`;
    if (isParcial && valorPagoParcial > 0) {
      totalHtml += `<div class="total-row" style="color:#2563eb">Pagou: R$ ${fmt(valorPagoParcial)}</div>`;
      totalHtml += `<div class="total-row" style="color:#d97706">Ficou: R$ ${fmt(totalFinal - valorPagoParcial)}</div>`;
    }
  } else {
    totalHtml = `<div class="total-row">Total: R$ ${fmt(subtotal)}</div>`;
    if (isParcial && valorPagoParcial > 0) {
      totalHtml += `<div class="total-row" style="color:#2563eb">Pagou: R$ ${fmt(valorPagoParcial)}</div>`;
      totalHtml += `<div class="total-row" style="color:#d97706">Ficou: R$ ${fmt(subtotal - valorPagoParcial)}</div>`;
    }
  }

  const cleanObs = stripPartialPaymentObservation(stripCochoFromObs(observacao));
  let obsHtml = "";
  if (cleanObs && cleanObs.trim()) {
    obsHtml = `<div class="obs"><strong>Obs.:</strong> ${cleanObs.trim()}</div>`;
  }

  const cochoDataA4 = parseCochoFromObs(pedido.observacao || observacao);
  let cochoHtml = "";
  if (cochoHasValues(cochoDataA4)) {
    cochoHtml = `<div style="font-size:20px;font-weight:bold;margin-top:6px;padding-top:4px;border-top:2px solid #333">Cochos: ${formatCochoLine(cochoDataA4)}</div>`;
  }

  const styles = `
    body{font-family:Arial,Helvetica,sans-serif;margin:15px;font-size:11px;color:#222}
    .header{display:flex;align-items:center;gap:12px;border-bottom:2px solid #333;padding-bottom:8px;margin-bottom:6px}
    .header img{width:55px;height:55px;object-fit:contain}
    .header-info{line-height:1.3}
    .header-info .empresa{font-size:13px;font-weight:bold}
    .header-info .cnpj{font-size:10px;color:#555}
    .header-info .data{font-size:10px;color:#555}
    .orcamento-num{font-size:14px;font-weight:600;text-align:right;margin-bottom:4px;color:#222}
    .cliente-nome{font-size:16px;font-weight:bold;margin:6px 0 2px}
    .motorista-nome{font-size:12px;font-weight:600;color:#444;margin-bottom:2px}
    .endereco{font-size:10px;color:#555;margin-bottom:6px}
    .obs{font-size:14px;font-weight:bold;color:#000;margin-top:10px;padding-top:6px;border-top:1px dashed #999}
    table{border-collapse:collapse;width:100%;margin-bottom:6px}
    th,td{border:1px solid #999;padding:2px 6px;text-align:left;font-size:12px}
    th{background:#e8e8e8;font-size:10px;font-weight:bold}
    .col-qty{width:30px;text-align:center}
    .col-price{width:65px;text-align:right}
    .col-total{width:65px;text-align:right}
    .col-un-rom{width:25px;text-align:center}
    .total-row{font-weight:bold;text-align:right;font-size:12px;margin-top:2px}
    @media print{body{margin:10px}}
  `;

  const tipoPagSaidaA4 = formatTipoPagamento(pedido.tipo_pagamento);
  const pagamentoHtml = tipoPagSaidaA4 ? `<div style="font-size:11px;font-weight:600;color:#333;margin-bottom:4px">Pagamento: ${tipoPagSaidaA4}</div>` : "";

  const body = `
    <div class="header">
      <img src="${logoUrl}" alt="Logo"/>
      <div class="header-info">
        <div class="empresa">JP Flores LTDA.</div>
        <div class="cnpj">CNPJ: 16.905.456/0001-30</div>
        <div class="data">Data: ${dataFormatada}</div>
      </div>
    </div>
    ${orcamentoNum ? `<div class="orcamento-num">Orçamento Nº ${orcamentoNum}</div>` : ""}
    <div class="cliente-nome">${cliente?.nome || ""}</div>
    ${pedido.motoristas?.nome ? `<div class="motorista-nome">Motorista: ${pedido.motoristas.nome}</div>` : ""}
    ${enderecoHtml ? `<div class="endereco">${enderecoHtml}</div>` : ""}
    ${pagamentoHtml}
    <table><thead><tr><th class="col-qty">QTD</th><th>Produto</th><th class="col-un-rom">UN</th><th class="col-price">Preço</th><th class="col-total">Total</th></tr></thead><tbody>${rowsHtml}</tbody></table>
    ${totalHtml}
    ${cochoHtml}
    ${obsHtml}
  `;

  const html = `<html><head><title>Pedido</title><style>${styles}</style></head><body>${body}</body></html>`;
  openHtmlPrint(html);
}

// ---- Print ALL Saídas for a date in A4 (one per page) ----

export async function printAllSaidasA4(pedidos: any[]) {
  if (pedidos.length === 0) return;

  // Print each pedido individually using printSaidaA4-style rendering
  // but combined into a single document with forced page breaks
  const logoUrl = `${window.location.origin}/logo-jp-flores.png`;

  const pages: string[] = [];

  pedidos.forEach((pedido) => {
    const cliente = pedido.clientes;
    const rawItens = pedido.itens_saida || [];
    const consolidated = consolidateItems(rawItens, "preco");
    const itens = sortByUnitThenName(consolidated, (i: any) => i.produtos?.unidade || "", (i: any) => i.produtos?.descricao || "");

    const dataFormatada = fmtDate(pedido.data);
    const orcamentoNum = pedido.orcamento_num || "";

    let subtotal = 0;
    let rowsHtml = "";
    itens.forEach((i: any) => {
      const total = Number(i.quantidade) * Number(i.preco);
      subtotal += total;
      const un = i.produtos?.unidade || "UN";
      rowsHtml += `<tr><td class="col-qty">${i.quantidade}</td><td>${i.produtos?.descricao || ""}</td><td class="col-un-rom">${un}</td><td class="col-price">R$ ${fmt(i.preco)}</td><td class="col-total">R$ ${fmt(total)}</td></tr>`;
    });

    let enderecoHtml = "";
    if (cliente?.bairro) enderecoHtml += `${cliente.bairro}, `;
    if (cliente?.cidade) enderecoHtml += `${cliente.cidade}`;
    if (cliente?.estado) enderecoHtml += ` - ${cliente.estado}`;
    if (cliente?.cep) enderecoHtml += ` | CEP: ${cliente.cep}`;
    if (cliente?.complemento) enderecoHtml += ` | ${cliente.complemento}`;
    if (cliente?.telefone) enderecoHtml += ` | Tel: ${cliente.telefone}`;

    const tipoPag = formatTipoPagamento(pedido.tipo_pagamento);
    const pagamentoHtml = tipoPag ? `<div style="font-size:11px;font-weight:600;color:#333;margin-bottom:4px">Pagamento: ${tipoPag}</div>` : "";

    const cleanObsAll = stripPartialPaymentObservation(stripCochoFromObs(pedido.observacao));
    const obsHtml = cleanObsAll?.trim() ? `<div class="obs"><strong>Obs.:</strong> ${cleanObsAll.trim()}</div>` : "";

    const cochoAll = parseCochoFromObs(pedido.observacao);
    const cochoHtmlAll = cochoHasValues(cochoAll) ? `<div style="font-size:20px;font-weight:bold;margin-top:6px;padding-top:4px;border-top:2px solid #333">Cochos: ${formatCochoLine(cochoAll)}</div>` : "";

    const descontoPercent = Number(pedido.desconto) || 0;
    const isParcialAll = pedido.tipo_pagamento === "parcial";
    let valorPagoParcialAll = 0;
    if (isParcialAll && pedido.observacao) {
      const m = pedido.observacao.match(/Valor pago parcial: R\$ ([\d.,]+)/);
      if (m) valorPagoParcialAll = Number(m[1].replace(",", "."));
    }

    let totalHtml = "";
    if (descontoPercent > 0) {
      const descontoValor = subtotal * (descontoPercent / 100);
      const totalFinal = subtotal - descontoValor;
      totalHtml = `<div class="total-row">Subtotal: R$ ${fmt(subtotal)}</div>`;
      totalHtml += `<div class="total-row" style="font-weight:normal;font-size:11px">Desconto (${descontoPercent}%): -R$ ${fmt(descontoValor)}</div>`;
      totalHtml += `<div class="total-row">Total: R$ ${fmt(totalFinal)}</div>`;
      if (isParcialAll && valorPagoParcialAll > 0) {
        totalHtml += `<div class="total-row" style="color:#2563eb">Pagou: R$ ${fmt(valorPagoParcialAll)}</div>`;
        totalHtml += `<div class="total-row" style="color:#d97706">Ficou: R$ ${fmt(totalFinal - valorPagoParcialAll)}</div>`;
      }
    } else {
      totalHtml = `<div class="total-row">Total: R$ ${fmt(subtotal)}</div>`;
      if (isParcialAll && valorPagoParcialAll > 0) {
        totalHtml += `<div class="total-row" style="color:#2563eb">Pagou: R$ ${fmt(valorPagoParcialAll)}</div>`;
        totalHtml += `<div class="total-row" style="color:#d97706">Ficou: R$ ${fmt(subtotal - valorPagoParcialAll)}</div>`;
      }
    }

    pages.push(`
      <div class="header">
        <img src="${logoUrl}" alt="Logo"/>
        <div class="header-info">
          <div class="empresa">JP Flores LTDA.</div>
          <div class="cnpj">CNPJ: 16.905.456/0001-30</div>
          <div class="data">Data: ${dataFormatada}</div>
        </div>
      </div>
      ${orcamentoNum ? `<div class="orcamento-num">Orçamento Nº ${orcamentoNum}</div>` : ""}
      <div class="cliente-nome">${cliente?.nome || ""}</div>
      ${pedido.motoristas?.nome ? `<div class="motorista-nome">Motorista: ${pedido.motoristas.nome}</div>` : ""}
      ${enderecoHtml ? `<div class="endereco">${enderecoHtml}</div>` : ""}
      ${pagamentoHtml}
      <table><thead><tr><th class="col-qty">QTD</th><th>Produto</th><th class="col-un-rom">UN</th><th class="col-price">Preço</th><th class="col-total">Total</th></tr></thead><tbody>${rowsHtml}</tbody></table>
      ${totalHtml}
      ${cochoHtmlAll}
      ${obsHtml}
    `);
  });

  const styles = `
    body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:0;font-size:11px;color:#222}
    .page{width:210mm;min-height:297mm;padding:15mm;box-sizing:border-box;page-break-after:always;break-after:page}
    .page:last-child{page-break-after:auto;break-after:auto}
    .header{display:flex;align-items:center;gap:12px;border-bottom:2px solid #333;padding-bottom:8px;margin-bottom:6px}
    .header img{width:55px;height:55px;object-fit:contain}
    .header-info{line-height:1.3}
    .header-info .empresa{font-size:13px;font-weight:bold}
    .header-info .cnpj{font-size:10px;color:#555}
    .header-info .data{font-size:10px;color:#555}
    .orcamento-num{font-size:14px;font-weight:600;text-align:right;margin-bottom:4px;color:#222}
    .cliente-nome{font-size:16px;font-weight:bold;margin:6px 0 2px}
    .motorista-nome{font-size:12px;font-weight:600;color:#444;margin-bottom:2px}
    .endereco{font-size:10px;color:#555;margin-bottom:6px}
    .obs{font-size:14px;font-weight:bold;color:#000;margin-top:10px;padding-top:6px;border-top:1px dashed #999}
    table{border-collapse:collapse;width:100%;margin-bottom:6px}
    th,td{border:1px solid #999;padding:2px 6px;text-align:left;font-size:12px}
    th{background:#e8e8e8;font-size:10px;font-weight:bold}
    .col-qty{width:30px;text-align:center}
    .col-price{width:65px;text-align:right}
    .col-total{width:65px;text-align:right}
    .col-un-rom{width:25px;text-align:center}
    .total-row{font-weight:bold;text-align:right;font-size:12px;margin-top:2px}
    @media screen{.page{border-bottom:4px dashed #aaa;margin-bottom:30px;background:#fff;box-shadow:0 0 10px rgba(0,0,0,0.1)}.page:last-child{border-bottom:none}}
    @media print{body{margin:0;padding:0}.page{width:auto;min-height:auto;padding:10mm;margin:0;box-shadow:none;border:none}}
  `;

  const pagesHtml = pages.map(p => `<div class="page">${p}</div>`).join("");
  const html = `<html><head><title>Pedidos</title><style>${styles}</style></head><body>${pagesHtml}</body></html>`;
  openHtmlPrint(html);
}

// ---- Orçamento A4 Print ----

export async function printOrcamentoA4(
  orcamento: {
    motoristaNome?: string;
    observacao?: string;
    descontoTipo?: "percent" | "reais";
    descontoValor?: number;
    itens: Array<{ produto_id: string; quantidade: number; preco: number; descricao?: string; unidade?: string }>;
  }
) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = 210;
  const margin = 15;
  const contentW = pageW - margin * 2;

  let y = 15;

  // Logo + título lado a lado
  const logoBase64 = await loadLogoBase64();
  if (logoBase64) {
    const logoW = 22;
    const logoH = 22;
    const startX = (pageW - logoW - 4 - 60) / 2;
    pdf.addImage(logoBase64, "PNG", startX, y, logoW, logoH);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.setTextColor(0, 0, 0);
    pdf.text("JP Flores", startX + logoW + 4, y + 10);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(13);
    pdf.setTextColor(60, 60, 60);
    pdf.text("Orçamentos", startX + logoW + 4, y + 17);
    y += logoH + 6;
  } else {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.text("JP Flores", pageW / 2, y, { align: "center" });
    y += 8;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(13);
    pdf.text("Orçamentos", pageW / 2, y, { align: "center" });
    y += 8;
  }

  // Separator
  pdf.setLineWidth(0.5);
  pdf.setDrawColor(0);
  pdf.setTextColor(0, 0, 0);
  pdf.line(margin, y, pageW - margin, y);
  y += 8;

  // Motorista (se houver)
  if (orcamento.motoristaNome) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.text(`Motorista: ${orcamento.motoristaNome}`, margin, y);
    y += 6;
  }

  // Date
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.text(`Data: ${new Date().toLocaleDateString("pt-BR")}`, margin, y);
  y += 8;

  // Observação
  if (orcamento.observacao && orcamento.observacao.trim()) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(0, 0, 0);
    const obsLabel = "Obs.: ";
    const obsLabelW = pdf.getTextWidth(obsLabel);
    const obsLines = pdf.splitTextToSize(orcamento.observacao.trim(), contentW - obsLabelW);
    pdf.text(obsLabel, margin, y);
    pdf.setFont("helvetica", "normal");
    pdf.text(obsLines[0], margin + obsLabelW, y);
    for (let li = 1; li < obsLines.length; li++) {
      y += 5;
      pdf.text(obsLines[li], margin + obsLabelW, y);
    }
    y += 7;
  }

  y += 2;

  // Table header
  const colQtd = margin;
  const colUn = margin + 18;
  const colDesc = margin + 30;
  const colPrecoR = pageW - margin - 30;
  const colTotalR = pageW - margin;

  pdf.setFillColor(230, 240, 230);
  pdf.rect(margin, y - 5, contentW, 8, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(0, 0, 0);
  pdf.text("Qtd", colQtd, y);
  pdf.text("Un", colUn, y);
  pdf.text("Produto", colDesc, y);
  pdf.text("Preço Unit.", colPrecoR, y, { align: "right" });
  pdf.text("Total", colTotalR, y, { align: "right" });
  y += 4;
  pdf.setLineWidth(0.3);
  pdf.line(margin, y, pageW - margin, y);
  y += 5;

  // Rows
  let grandTotal = 0;
  const UNIT_ORDER_A4: Record<string, number> = { MC: 0, VS: 1, CX: 2, UN: 3 };
  const sorted = [...orcamento.itens].sort((a, b) => {
    const ua = UNIT_ORDER_A4[a.unidade || ""] ?? 99;
    const ub = UNIT_ORDER_A4[b.unidade || ""] ?? 99;
    if (ua !== ub) return ua - ub;
    return (a.descricao || "").localeCompare(b.descricao || "", "pt-BR");
  });

  pdf.setFontSize(10);
  let rowIdx = 0;
  for (const i of sorted) {
    const total = Number(i.quantidade) * Number(i.preco);
    grandTotal += total;

    if (rowIdx % 2 === 1) {
      pdf.setFillColor(248, 250, 248);
      pdf.rect(margin, y - 4, contentW, 6.5, "F");
    }

    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(0, 0, 0);
    pdf.text(String(i.quantidade), colQtd, y);
    pdf.text(i.unidade || "", colUn, y);
    pdf.text(i.descricao || "", colDesc, y);
    pdf.text(`R$ ${fmt(i.preco)}`, colPrecoR, y, { align: "right" });
    pdf.setFont("helvetica", "bold");
    pdf.text(`R$ ${fmt(total)}`, colTotalR, y, { align: "right" });
    y += 6.5;
    rowIdx++;

    if (y > 270) {
      pdf.addPage();
      y = 20;
    }
  }

  // Total
  y += 3;
  pdf.setLineWidth(0.5);
  pdf.setDrawColor(0);
  pdf.line(margin, y, pageW - margin, y);
  y += 8;

  const dv = orcamento.descontoValor || 0;
  const dt = orcamento.descontoTipo || "percent";
  const descontoCalc = dv > 0 ? (dt === "percent" ? grandTotal * dv / 100 : dv) : 0;
  const finalTotal = Math.max(0, grandTotal - descontoCalc);

  if (descontoCalc > 0) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.setTextColor(0, 0, 0);
    pdf.text(`Subtotal: R$ ${fmt(grandTotal)}`, pageW - margin, y, { align: "right" });
    y += 6;
    pdf.setTextColor(180, 0, 0);
    const descLabel = dt === "percent" ? `Desconto (${dv}%): -R$ ${fmt(descontoCalc)}` : `Desconto: -R$ ${fmt(descontoCalc)}`;
    pdf.text(descLabel, pageW - margin, y, { align: "right" });
    y += 7;
    pdf.setTextColor(0, 0, 0);
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(0, 0, 0);
  pdf.text(`Total: R$ ${fmt(finalTotal)}`, pageW - margin, y, { align: "right" });

  return pdf;
}

export async function openOrcamentoPdf(
  orcamento: Parameters<typeof printOrcamentoA4>[0]
): Promise<void> {
  const pdf = await printOrcamentoA4(orcamento);
  openPdf(pdf);
}

export function openHtmlPrint(html: string) {
  if (isStandalonePWA()) {
    // In iOS standalone PWA, window.open is blocked — render inline
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.top = "0";
    iframe.style.left = "0";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.zIndex = "99999";
    iframe.style.border = "none";
    iframe.style.background = "#fff";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      // Add a close button
      const btn = doc.createElement("button");
      btn.textContent = "✕ Fechar";
      Object.assign(btn.style, {
        position: "fixed", top: "8px", right: "8px", zIndex: "100000",
        padding: "8px 16px", fontSize: "16px", background: "#333", color: "#fff",
        border: "none", borderRadius: "8px", cursor: "pointer",
      });
      btn.onclick = () => iframe.remove();
      doc.body.appendChild(btn);
    }
    return;
  }
  const w = window.open("", "_blank");
  w?.document.write(html);
  w?.document.close();
  w?.print();
}

function formatTipoPagamento(tp?: string): string {
  if (!tp) return "";
  if (tp === "aprazo") return "A prazo";
  if (tp === "avista") return "À vista";
  if (tp === "apcasa") return "AP Casa";
  if (tp === "parcial") return "Parcial";
  return "";
}

export async function printAllEntradasA4(pedidos: any[]) {
  if (!pedidos.length) return;

  const logoUrl = `${window.location.origin}/logo-jp-flores.png`;
  const styles = `
    body{font-family:Arial,Helvetica,sans-serif;margin:15px;font-size:11px;color:#222}
    .page{page-break-after:always}
    .page:last-child{page-break-after:auto}
    .header{display:flex;align-items:center;gap:12px;border-bottom:2px solid #333;padding-bottom:8px;margin-bottom:6px}
    .header img{width:55px;height:55px;object-fit:contain}
    .header-info{line-height:1.3}
    .header-info .empresa{font-size:13px;font-weight:bold}
    .header-info .cnpj{font-size:10px;color:#555}
    .header-info .data{font-size:10px;color:#555}
    .orcamento-num{font-size:14px;font-weight:600;text-align:right;margin-bottom:4px;color:#222}
    .fornecedor-nome{font-size:16px;font-weight:bold;margin:6px 0 2px}
    table{border-collapse:collapse;width:100%;margin-bottom:6px}
    th,td{border:1px solid #999;padding:2px 6px;text-align:left;font-size:12px}
    th{background:#e8e8e8;font-size:10px;font-weight:bold}
    .col-qty{width:30px;text-align:center}
    .col-price{width:65px;text-align:right}
    .col-total{width:65px;text-align:right}
    .col-un{width:25px;text-align:center}
    .total-row{font-weight:bold;text-align:right;font-size:12px;margin-top:2px}
    @media print{body{margin:10px}}
  `;

  let pagesHtml = "";
  for (const pedido of pedidos) {
    const rawItens = pedido.itens_entrada || [];
    const consolidated = consolidateItems(rawItens, "preco_custo");
    const itens = sortByUnitThenName(consolidated, (i: any) => i.produtos?.unidade || "", (i: any) => i.produtos?.descricao || "");

    const dataFormatada = fmtDate(pedido.data);
    const orcamentoNum = pedido.orcamento_num || "";
    const tipoPagLabel = formatTipoPagamento(pedido.tipo_pagamento);

    let total = 0;
    let rowsHtml = "";
    itens.forEach((i: any) => {
      const t = Number(i.quantidade) * Number(i.preco_custo);
      total += t;
      const un = i.produtos?.unidade || "UN";
      rowsHtml += `<tr><td class="col-qty">${i.quantidade}</td><td>${i.produtos?.descricao || ""}</td><td class="col-un">${un}</td><td class="col-price">R$ ${fmt(i.preco_custo)}</td><td class="col-total">R$ ${fmt(t)}</td></tr>`;
    });

    const pagamentoHtml = tipoPagLabel ? `<div style="font-size:11px;font-weight:600;color:#333;margin-bottom:4px">Pagamento: ${tipoPagLabel}</div>` : "";

    const desconto = Number(pedido.desconto) || 0;
    const totalHtml = desconto > 0
      ? `<div class="total-row">Subtotal: R$ ${fmt(total)}</div><div class="total-row" style="font-size:11px;color:#666">Desconto: -R$ ${fmt(desconto)}</div><div class="total-row" style="font-size:14px">Total: R$ ${fmt(Math.max(0, total - desconto))}</div>`
      : `<div class="total-row">Total: R$ ${fmt(total)}</div>`;

    pagesHtml += `
      <div class="page">
        <div class="header">
          <img src="${logoUrl}" alt="Logo"/>
          <div class="header-info">
            <div class="empresa">JP Flores LTDA.</div>
            <div class="cnpj">CNPJ: 16.905.456/0001-30</div>
            <div class="data">Data: ${dataFormatada}</div>
          </div>
        </div>
        ${orcamentoNum ? `<div class="orcamento-num">Nº ${orcamentoNum}</div>` : ""}
        <div class="fornecedor-nome">${pedido.fornecedores?.nome || ""}</div>
        ${pagamentoHtml}
        <table><thead><tr><th class="col-qty">QTD</th><th>Produto</th><th class="col-un">UN</th><th class="col-price">P.Custo</th><th class="col-total">Total</th></tr></thead><tbody>${rowsHtml}</tbody></table>
        ${totalHtml}
      </div>
    `;
  }

  const html = `<html><head><title>Entradas</title><style>${styles}</style></head><body>${pagesHtml}</body></html>`;
  openHtmlPrint(html);
}

type OrcPayload = {
  motoristaNome?: string;
  observacao?: string;
  descontoTipo?: "percent" | "reais";
  descontoValor?: number;
  itens: Array<{ produto_id: string; quantidade: number; preco: number; descricao?: string; unidade?: string }>;
};

/** Exports the quotation as a mobile-friendly PNG image */
export async function exportOrcamentoImage(orcamento: OrcPayload): Promise<void> {
  const SCALE = 2; // retina quality
  const W_PX = 800; // logical width — optimised for phone screens
  const PAD = 36;
  const ROW_H_PX = 46;
  const HEADER_H = 170;
  const hasDesconto = (orcamento.descontoValor || 0) > 0;
  const FOOTER_H = hasDesconto ? 150 : 80;
  const OBS_LINE_H = 22;

  const UNIT_ORDER_IMG: Record<string, number> = { MC: 0, VS: 1, CX: 2, UN: 3 };
  const sorted = [...orcamento.itens].sort((a, b) => {
    const ua = UNIT_ORDER_IMG[a.unidade || ""] ?? 99;
    const ub = UNIT_ORDER_IMG[b.unidade || ""] ?? 99;
    if (ua !== ub) return ua - ub;
    return (a.descricao || "").localeCompare(b.descricao || "", "pt-BR");
  });

  // Estimate observation height
  const obsText = orcamento.observacao?.trim() || "";
  const obsLines = obsText ? Math.ceil(obsText.length / 70) : 0; // rough estimate
  const obsH = obsLines > 0 ? obsLines * OBS_LINE_H + 10 : 0;

  const TABLE_HEAD_H = 44;
  const totalH = HEADER_H + obsH + TABLE_HEAD_H + sorted.length * ROW_H_PX + FOOTER_H;

  const canvas = document.createElement("canvas");
  canvas.width = W_PX * SCALE;
  canvas.height = totalH * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W_PX, totalH);

  // ---- Header ----
  let y = PAD;

  // Logo
  const logoSrc = "/logo-jp-flores.png";
  const logoImg = await new Promise<HTMLImageElement | null>(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = logoSrc;
  });

  const LOGO_SIZE = 72;
  const headerCenterY = y + LOGO_SIZE / 2;
  if (logoImg) {
    ctx.drawImage(logoImg, PAD, y, LOGO_SIZE, LOGO_SIZE);
  }

  // Title text beside logo
  const textX = PAD + LOGO_SIZE + 18;
  ctx.fillStyle = "#1a4a1a";
  ctx.font = "bold 30px system-ui, Arial, sans-serif";
  ctx.fillText("JP Flores", textX, headerCenterY - 6);
  ctx.fillStyle = "#4a7c4a";
  ctx.font = "20px system-ui, Arial, sans-serif";
  ctx.fillText("Orçamentos", textX, headerCenterY + 20);

  // Date right
  ctx.fillStyle = "#666666";
  ctx.font = "15px system-ui, Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(new Date().toLocaleDateString("pt-BR"), W_PX - PAD, y + 20);

  if (orcamento.motoristaNome) {
    ctx.fillStyle = "#333333";
    ctx.font = "16px system-ui, Arial, sans-serif";
    ctx.fillText(orcamento.motoristaNome, W_PX - PAD, y + 42);
  }

  ctx.textAlign = "left";
  y = PAD + LOGO_SIZE + 20;

  // Separator
  ctx.strokeStyle = "#2d6a2d";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W_PX - PAD, y);
  ctx.stroke();
  y += 16;

  // Observation
  if (obsText) {
    ctx.fillStyle = "#333333";
    ctx.font = "bold 15px system-ui, Arial, sans-serif";
    ctx.textAlign = "left";
    const obsLabel = "Obs.: ";
    const obsLabelW = ctx.measureText(obsLabel).width;
    ctx.fillText(obsLabel, PAD, y + 14);
    ctx.font = "15px system-ui, Arial, sans-serif";
    // Wrap obs text
    const maxObsW = W_PX - PAD * 2 - obsLabelW;
    const words = obsText.split(" ");
    let line = "";
    let lineY = y + 14;
    let firstLine = true;
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxObsW && line) {
        ctx.fillText(line, firstLine ? PAD + obsLabelW : PAD, lineY);
        firstLine = false;
        lineY += OBS_LINE_H;
        line = word;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, firstLine ? PAD + obsLabelW : PAD, lineY);
    y = lineY + 12;
  }

  // ---- Table ----
  const COL_QTD = PAD;
  const COL_UN = PAD + 60;
  const COL_DESC = PAD + 108;
  const COL_PRECO_R = W_PX - PAD - 110;
  const COL_TOTAL_R = W_PX - PAD;

  // Table header bg
  ctx.fillStyle = "#e8f4e8";
  ctx.fillRect(PAD, y, W_PX - PAD * 2, TABLE_HEAD_H);

  ctx.fillStyle = "#1a4a1a";
  ctx.font = "bold 16px system-ui, Arial, sans-serif";
  const thY = y + TABLE_HEAD_H / 2 + 6;
  ctx.textAlign = "left";
  ctx.fillText("Qtd", COL_QTD, thY);
  ctx.fillText("Un", COL_UN, thY);
  ctx.fillText("Produto", COL_DESC, thY);
  ctx.textAlign = "right";
  ctx.fillText("Preço", COL_PRECO_R, thY);
  ctx.fillText("Total", COL_TOTAL_R, thY);

  y += TABLE_HEAD_H;

  // Rows
  let grandTotal = 0;
  sorted.forEach((item, idx) => {
    const total = item.quantidade * item.preco;
    grandTotal += total;

    // Alternating row bg
    if (idx % 2 === 1) {
      ctx.fillStyle = "#f5faf5";
      ctx.fillRect(PAD, y, W_PX - PAD * 2, ROW_H_PX);
    }

    const rowTextY = y + ROW_H_PX / 2 + 6;
    ctx.fillStyle = "#222222";
    ctx.font = "16px system-ui, Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(String(item.quantidade), COL_QTD, rowTextY);
    ctx.fillStyle = "#555555";
    ctx.fillText(item.unidade || "", COL_UN, rowTextY);
    ctx.fillStyle = "#222222";

    // Truncate description if too long
    const maxDescW = COL_PRECO_R - COL_DESC - 12;
    let desc = item.descricao || "";
    ctx.font = "16px system-ui, Arial, sans-serif";
    while (ctx.measureText(desc).width > maxDescW && desc.length > 0) {
      desc = desc.slice(0, -1);
    }
    if (desc !== item.descricao) desc = desc.slice(0, -1) + "…";
    ctx.fillText(desc, COL_DESC, rowTextY);

    ctx.fillStyle = "#444444";
    ctx.textAlign = "right";
    ctx.font = "15px system-ui, Arial, sans-serif";
    ctx.fillText(`R$ ${fmt(item.preco)}`, COL_PRECO_R, rowTextY);
    ctx.fillStyle = "#222222";
    ctx.font = "bold 16px system-ui, Arial, sans-serif";
    ctx.fillText(`R$ ${fmt(total)}`, COL_TOTAL_R, rowTextY);

    y += ROW_H_PX;
  });

  // ---- Footer / Total ----
  y += 10;
  ctx.strokeStyle = "#2d6a2d";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W_PX - PAD, y);
  ctx.stroke();
  y += 28;

  const dv = orcamento.descontoValor || 0;
  const dt = orcamento.descontoTipo || "percent";
  const descontoCalc = dv > 0 ? (dt === "percent" ? grandTotal * dv / 100 : dv) : 0;
  const finalTotal = Math.max(0, grandTotal - descontoCalc);

  ctx.textAlign = "right";
  if (descontoCalc > 0) {
    ctx.fillStyle = "#333333";
    ctx.font = "18px system-ui, Arial, sans-serif";
    ctx.fillText(`Subtotal: R$ ${fmt(grandTotal)}`, W_PX - PAD, y);
    y += 26;
    ctx.fillStyle = "#cc0000";
    ctx.font = "18px system-ui, Arial, sans-serif";
    const descLabel = dt === "percent" ? `Desconto (${dv}%): -R$ ${fmt(descontoCalc)}` : `Desconto: -R$ ${fmt(descontoCalc)}`;
    ctx.fillText(descLabel, W_PX - PAD, y);
    y += 28;
  }

  ctx.fillStyle = "#1a4a1a";
  ctx.font = "bold 22px system-ui, Arial, sans-serif";
  ctx.fillText(`Total: R$ ${fmt(finalTotal)}`, W_PX - PAD, y);

  // Convert to blob for sharing
  const dataUrl = canvas.toDataURL("image/png");
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const file = new File([blob], `orcamento-${new Date().toISOString().split("T")[0]}.png`, { type: "image/png" });

  // Detect mobile: use native share on mobile, clipboard on desktop
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (isMobile && navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Orçamento JP Flores" });
      return;
    } catch {
      // User cancelled or share failed — fall through
    }
  }

  // Desktop: copy image to clipboard so user can Ctrl+V into WhatsApp Web
  if (!isMobile && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      // Show a toast-style temporary notification
      const toast = document.createElement("div");
      toast.textContent = "✅ Imagem copiada! Cole com Ctrl+V no WhatsApp Web";
      Object.assign(toast.style, {
        position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)",
        background: "#1a4a1a", color: "#fff", padding: "12px 24px", borderRadius: "8px",
        fontSize: "15px", zIndex: "99999", boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      });
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3500);
      return;
    } catch {
      // Clipboard write failed — fall through to new tab
    }
  }

  // Final fallback: open as blob URL in new tab
  const blobUrl = URL.createObjectURL(blob);
  const newTab = window.open();
  if (newTab) {
    newTab.document.write(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Orçamento</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#f0f0f0;display:flex;justify-content:center;padding:8px;min-height:100vh}img{width:100%;max-width:800px;height:auto;display:block}</style></head><body><img src="${blobUrl}" /></body></html>`);
    newTab.document.close();
  } else {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  }
}



// ---- 80mm Ambulante Print (saldo only, with selling price) ----

export async function printAmbulante80mm(
  ambulante: any,
  motoristaNome: string,
  costPrices: Record<string, number>,
  markupPercent: number
) {
  const rawItens = ambulante.itens_ambulante || [];
  const positive = rawItens.filter((i: any) => Number(i.quantidade) > 0);
  const consolidated = consolidateItems(positive, "preco");
  const itens = sortByUnitThenName(consolidated, (i: any) => i.produtos?.unidade || "", (i: any) => i.produtos?.descricao || "");

  // Calculate dynamic page height
  let estimatedRowsH = 0;
  for (const i of itens) {
    const desc = i.produtos?.descricao || "";
    estimatedRowsH += desc.length > MAX_PRODUCT_CHARS ? ROW_H2 : ROW_H;
  }
  const pageH = BASE_SAIDA + estimatedRowsH + 10;

  const pdf = new jsPDF({ unit: "mm", format: [W, pageH] });

  const logoBase64 = await loadLogoBase64();
  let y = await drawCompanyHeader(pdf, logoBase64);

  // Title
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(0, 0, 0);
  pdf.text("Saldo Ambulante", M, y);
  y += 4;

  // Motorista + Data
  pdf.setFontSize(8);
  pdf.text(`${motoristaNome}  ${fmtDate(ambulante.data)}`, M, y);
  y += 5;

  // Table header
  y = tableHeader(pdf, ["QTD", "Produto", "Preço", "Total"], y);

  // Rows
  let grandTotal = 0;
  for (let idx = 0; idx < itens.length; idx++) {
    const i = itens[idx];
    const cost = costPrices[i.produto_id] || 0;
    const preco = Math.round(cost * (1 + markupPercent / 100) * 100) / 100;
    const total = Number(i.quantidade) * preco;
    grandTotal += total;
    y = tableRowBold(pdf, String(i.quantidade), i.produtos?.descricao || "", fmt(preco), fmt(total), y, idx === itens.length - 1);
  }

  y = totalLine(pdf, grandTotal, y);

  openPdf(pdf, motoristaNome, ambulante.data);
}

// ---- 80mm Saldo Empresa Print ----

export async function printSaldoEmpresa80mm(
  rows: Array<{ descricao: string; unidade: string; saldo: number; precoVenda: number }>,
  data: string,
  markupPercent: number,
) {
  // Only positive saldo
  const itens = rows
    .filter((r) => r.saldo > 0)
    .sort((a, b) => {
      const UNIT_ORDER: Record<string, number> = { MC: 0, VS: 1, CX: 2, UN: 3 };
      const ua = UNIT_ORDER[a.unidade] ?? 99;
      const ub = UNIT_ORDER[b.unidade] ?? 99;
      if (ua !== ub) return ua - ub;
      return a.descricao.localeCompare(b.descricao, "pt-BR");
    });

  // Calculate dynamic page height
  let estimatedRowsH = 0;
  for (const r of itens) {
    estimatedRowsH += r.descricao.length > MAX_PRODUCT_CHARS ? ROW_H2 : ROW_H;
  }
  const pageH = BASE_SAIDA + estimatedRowsH + 10;

  const pdf = new jsPDF({ unit: "mm", format: [W, pageH] });

  const logoBase64 = await loadLogoBase64();
  let y = await drawCompanyHeader(pdf, logoBase64);

  // Title
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(0, 0, 0);
  pdf.text("Saldo da Empresa", M, y);
  y += 4;

  // Data + markup
  pdf.setFontSize(8);
  pdf.text(`${fmtDate(data)}  Markup ${markupPercent}%`, M, y);
  y += 5;

  // Table header
  y = tableHeader(pdf, ["QTD", "Produto", "Preço", "Total"], y);

  // Rows
  let grandTotal = 0;
  for (let idx = 0; idx < itens.length; idx++) {
    const r = itens[idx];
    const total = r.saldo * r.precoVenda;
    grandTotal += total;
    y = tableRowBold(pdf, String(r.saldo), r.descricao, fmt(r.precoVenda), fmt(total), y, idx === itens.length - 1);
  }

  y = totalLine(pdf, grandTotal, y);

  openPdf(pdf, "Saldo Empresa", data);
}

// ---- A4 Ambulante Print ----


export async function printAmbulanteA4(
  ambulante: any,
  motoristaNome: string,
  costPrices: Record<string, number>,
  markupPercent: number,
  options?: { hideTotal?: boolean }
) {
  const hideTotal = options?.hideTotal ?? false;
  const rawItens = ambulante.itens_ambulante || [];
  const consolidated = consolidateItems(rawItens, "preco");
  const itens = sortByUnitThenName(consolidated, (i: any) => i.produtos?.unidade || "", (i: any) => i.produtos?.descricao || "");

  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = 210;
  const margin = 12;
  const contentW = pageW - margin * 2;

  let y = 10;

  // Compact header: logo + title + info in one line
  const logoBase64 = await loadLogoBase64();
  if (logoBase64) {
    pdf.addImage(logoBase64, "PNG", margin, y, 14, 14);
  }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(0, 0, 0);
  pdf.text("JP Flores", margin + 16, y + 5);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(80, 80, 80);
  pdf.text("Saldo Ambulante", margin + 16, y + 10);
  // Motorista + Data on the right
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(0, 0, 0);
  pdf.text(motoristaNome, pageW - margin, y + 5, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text(fmtDate(ambulante.data), pageW - margin, y + 10, { align: "right" });
  y += 16;

  // Thin separator
  pdf.setLineWidth(0.3);
  pdf.setDrawColor(150);
  pdf.line(margin, y, pageW - margin, y);
  y += 4;

  // Table header
  const colQtd = margin;
  const colUn = margin + 14;
  const colDesc = margin + 24;
  const colPrecoR = pageW - margin - 24;
  const colTotalR = pageW - margin;

  pdf.setFillColor(230, 240, 230);
  pdf.rect(margin, y - 3.5, contentW, 5.5, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.5);
  pdf.setTextColor(0, 0, 0);
  pdf.text("Qtd", colQtd, y);
  pdf.text("Un", colUn, y);
  pdf.text("Produto", colDesc, y);
  pdf.text("Preço", hideTotal ? colTotalR : colPrecoR, y, { align: "right" });
  if (!hideTotal) pdf.text("Total", colTotalR, y, { align: "right" });
  y += 3.5;
  pdf.setLineWidth(0.2);
  pdf.line(margin, y, pageW - margin, y);
  y += 3;

  // Rows
  let grandTotal = 0;
  pdf.setFontSize(8.5);
  const rowH = 5;
  let rowIdx = 0;

  for (const i of itens) {
    const cost = costPrices[i.produto_id] || 0;
    const preco = Math.round(cost * (1 + markupPercent / 100) * 100) / 100;
    const total = Number(i.quantidade) * preco;
    grandTotal += total;

    if (rowIdx % 2 === 1) {
      pdf.setFillColor(248, 250, 248);
      pdf.rect(margin, y - 3, contentW, rowH, "F");
    }

    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(0, 0, 0);
    pdf.text(String(i.quantidade), colQtd, y);
    pdf.text(i.produtos?.unidade || "", colUn, y);
    pdf.text(i.produtos?.descricao || "", colDesc, y);
    pdf.text(`R$ ${fmt(preco)}`, hideTotal ? colTotalR : colPrecoR, y, { align: "right" });
    if (!hideTotal) {
      pdf.setFont("helvetica", "bold");
      pdf.text(`R$ ${fmt(total)}`, colTotalR, y, { align: "right" });
    }
    y += rowH;
    rowIdx++;

    if (y > 280) {
      pdf.addPage();
      y = 12;
    }
  }

  // Total
  if (!hideTotal) {
    y += 2;
    pdf.setLineWidth(0.3);
    pdf.line(margin, y, pageW - margin, y);
    y += 5;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text(`Total: R$ ${fmt(grandTotal)}`, pageW - margin, y, { align: "right" });
  }

  openPdf(pdf);
}
