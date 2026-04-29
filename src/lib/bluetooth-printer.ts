/**
 * Web Bluetooth ESC/POS thermal printer (80mm)
 * Layout mirrors the jsPDF 80mm output exactly.
 * Works on Android Chrome.
 */
import { parseCochoFromObs, cochoHasValues, formatCochoLine } from "@/components/CochoButton";

function formatTipoPagamento(tp?: string): string {
  if (!tp) return "";
  if (tp === "aprazo") return "A prazo";
  if (tp === "avista") return "À vista";
  if (tp === "apcasa") return "AP Casa";
  if (tp === "parcial") return "Parcial";
  return "";
}

const ESC = 0x1B;
const GS = 0x1D;
const LF = 0x0A;

const CMD = {
  INIT: [ESC, 0x40],
  BOLD_ON: [ESC, 0x45, 0x01],
  BOLD_OFF: [ESC, 0x45, 0x00],
  ALIGN_LEFT: [ESC, 0x61, 0x00],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  ALIGN_RIGHT: [ESC, 0x61, 0x02],
  FONT_NORMAL: [ESC, 0x21, 0x00],
  FONT_DOUBLE_H: [ESC, 0x21, 0x10],
  CUT: [GS, 0x56, 0x00],
  PARTIAL_CUT: [GS, 0x56, 0x01],
  FEED: [ESC, 0x64, 0x04],
  LINE_SPACING_DEFAULT: [ESC, 0x32],
};

// 42-col for 80mm printers (Font A standard)
const COLS = 42;
const SEP_DASH = Array.from({ length: COLS }, () => '-'.charCodeAt(0));
const SEP_DOT  = Array.from({ length: COLS }, () => '.'.charCodeAt(0));

// Bluetooth
const FALLBACK_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
];
const FALLBACK_CHARS = [
  '00002af1-0000-1000-8000-00805f9b34fb',
  'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
  '49535343-8841-43f4-a8d4-ecbe34729bb3',
];

let cachedDevice: any = null;
let cachedServer: any = null;
let cachedCharacteristic: any = null;

export function isBluetoothSupported(): boolean {
  return !!(navigator as any).bluetooth;
}

export async function connectPrinter(): Promise<boolean> {
  if (!isBluetoothSupported()) throw new Error('Web Bluetooth não suportado.');
  try {
    if (cachedDevice?.gatt?.connected && cachedCharacteristic) return true;

    const device = await (navigator as any).bluetooth.requestDevice({
      filters: [{ services: [FALLBACK_SERVICES[0]] }],
      optionalServices: FALLBACK_SERVICES,
    }).catch(() =>
      (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: FALLBACK_SERVICES,
      })
    );
    if (!device) throw new Error('Nenhuma impressora selecionada.');

    cachedDevice = device;
    device.addEventListener('gattserverdisconnected', () => {
      cachedServer = null;
      cachedCharacteristic = null;
    });

    const server = await device.gatt!.connect();
    cachedServer = server;

    let characteristic: any = null;
    for (const svcUuid of FALLBACK_SERVICES) {
      try {
        const service = await server.getPrimaryService(svcUuid);
        for (const charUuid of FALLBACK_CHARS) {
          try {
            const ch = await service.getCharacteristic(charUuid);
            if (ch.properties.write || ch.properties.writeWithoutResponse) { characteristic = ch; break; }
          } catch { /* next */ }
        }
        if (characteristic) break;
        const chars = await service.getCharacteristics();
        for (const ch of chars) {
          if (ch.properties.write || ch.properties.writeWithoutResponse) { characteristic = ch; break; }
        }
        if (characteristic) break;
      } catch { /* next */ }
    }

    if (!characteristic) throw new Error('Característica de escrita não encontrada.');
    cachedCharacteristic = characteristic;
    return true;
  } catch (err) {
    cachedDevice = null; cachedServer = null; cachedCharacteristic = null;
    throw err;
  }
}

export function disconnectPrinter() {
  if (cachedDevice?.gatt?.connected) cachedDevice.gatt.disconnect();
  cachedDevice = null; cachedServer = null; cachedCharacteristic = null;
}

export function isPrinterConnected(): boolean {
  return !!(cachedDevice?.gatt?.connected && cachedCharacteristic);
}

// ── Encoding ──────────────────────────────────────────────

function encode(text: string): number[] {
  const bytes: number[] = [];
  const map: Record<number, number> = {
    0xE7: 0x87, 0xC7: 0x80,
    0xE3: 0x61, 0xC3: 0x41, 0xF5: 0x6F, 0xD5: 0x4F,
    0xE1: 0x61, 0xC1: 0x41, 0xE9: 0x65, 0xC9: 0x45,
    0xED: 0x69, 0xCD: 0x49, 0xF3: 0x6F, 0xD3: 0x4F,
    0xFA: 0x75, 0xDA: 0x55, 0xEA: 0x65, 0xCA: 0x45,
    0xF4: 0x6F, 0xD4: 0x4F, 0xE2: 0x61, 0xC2: 0x41,
  };
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    bytes.push(map[c] ?? (c > 127 ? 0x3F : c));
  }
  return bytes;
}

async function sendData(data: Uint8Array): Promise<void> {
  if (!cachedCharacteristic) throw new Error('Impressora não conectada.');
  const chunkSize = 100;
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    if (cachedCharacteristic.properties.writeWithoutResponse) {
      await cachedCharacteristic.writeValueWithoutResponse(chunk);
    } else {
      await cachedCharacteristic.writeValueWithResponse(chunk);
    }
    if (i + chunkSize < data.length) await new Promise(r => setTimeout(r, 20));
  }
}

// ── Helpers ───────────────────────────────────────────────

function ln(text: string): number[] { return [...encode(text), LF]; }
function pad(s: string, n: number): string { return s.length >= n ? s.substring(0, n) : s + ' '.repeat(n - s.length); }
function rpad(s: string, n: number): string { return s.length >= n ? s.substring(0, n) : ' '.repeat(n - s.length) + s; }
function fmt(n: number | string): string { return Number(n).toFixed(2); }
function fmtDate(d: string): string { return d ? d.split('-').reverse().join('/') : ''; }

const UNIT_ORDER: Record<string, number> = { MC: 0, VS: 1, CX: 2, UN: 3 };
function sortByUnit<T>(items: T[], getUnit: (i: T) => string, getName: (i: T) => string): T[] {
  return [...items].sort((a, b) => {
    const ua = UNIT_ORDER[getUnit(a)] ?? 99;
    const ub = UNIT_ORDER[getUnit(b)] ?? 99;
    return ua !== ub ? ua - ub : getName(a).localeCompare(getName(b), 'pt-BR');
  });
}
function consolidate(items: any[], priceKey: string): any[] {
  const map = new Map<string, any>();
  for (const item of items) {
    const key = `${item.produto_id}_${Number(item[priceKey]).toFixed(2)}`;
    if (map.has(key)) map.get(key).quantidade += Number(item.quantidade);
    else map.set(key, { ...item, quantidade: Number(item.quantidade) });
  }
  return Array.from(map.values());
}

/**
 * Build item lines – 2-line layout like PDF:
 *   Line 1: product name (full width, bold)
 *   Line 2: QTD x Preço .............. Total
 */
function buildItemLines(qty: string, name: string, price: string, total: string): { nameLine: number[]; detailLine: number[] } {
  // Line 1: full product name (truncate at COLS)
  const nameLine = ln(name.length > COLS ? name.substring(0, COLS) : name);
  // Line 2: "QTD x PRICE" left, "TOTAL" right
  const left = `${qty} x ${price}`;
  const right = total;
  const gap = COLS - left.length - right.length;
  const detailLine = ln(left + (gap > 0 ? ' '.repeat(gap) : ' ') + right);
  return { nameLine, detailLine };
}

// ── Header (shared by Saída and Entrada) ──────────────────

function buildHeader(buf: number[]) {
  buf.push(...CMD.ALIGN_LEFT);
  buf.push(...CMD.BOLD_ON);
  buf.push(...CMD.FONT_DOUBLE_H);
  buf.push(...ln('JP Flores'));
  buf.push(...CMD.FONT_NORMAL);
  buf.push(...CMD.BOLD_ON);
  buf.push(...ln('Comercio de Flores LTDA.'));
  buf.push(...CMD.BOLD_OFF);
  buf.push(...ln('CNPJ: 16.905.456/0001-30'));
  buf.push(LF);
}

// ── Saída ─────────────────────────────────────────────────

export async function btPrintSaida(pedido: any, descontoPercent = 0): Promise<void> {
  if (!isPrinterConnected()) await connectPrinter();

  const cliente = pedido.clientes;
  const rawItens = pedido.itens_saida || [];
  const itens = sortByUnit(
    consolidate(rawItens, 'preco'),
    (i: any) => i.produtos?.unidade || '',
    (i: any) => i.produtos?.descricao || ''
  );

  const orcNum = pedido.orcamento_num || 0;
  const tipoPag = formatTipoPagamento(pedido.tipo_pagamento);

  const buf: number[] = [];
  buf.push(...CMD.INIT, ...CMD.LINE_SPACING_DEFAULT);

  // Header
  buildHeader(buf);

  // Cliente name (large)
  buf.push(...CMD.BOLD_ON, ...CMD.FONT_DOUBLE_H);
  buf.push(...ln(cliente?.nome || ''));
  buf.push(...CMD.FONT_NORMAL, ...CMD.BOLD_OFF);

  // Info line: date + number + payment
  let info = `${fmtDate(pedido.data)}  No ${orcNum}`;
  buf.push(...ln(info));
  buf.push(LF);

  // No table header needed – items are self-explanatory
  buf.push(...SEP_DASH, LF);

  // Items
  let subtotal = 0;
  for (let idx = 0; idx < itens.length; idx++) {
    const item = itens[idx];
    const t = Number(item.quantidade) * Number(item.preco);
    subtotal += t;

    const { nameLine, detailLine } = buildItemLines(
      String(item.quantidade),
      item.produtos?.descricao || '',
      fmt(item.preco),
      fmt(t)
    );
    buf.push(...CMD.BOLD_ON);
    buf.push(...nameLine);
    buf.push(...CMD.BOLD_OFF);
    buf.push(...detailLine);

    // Dotted separator between items (not after last)
    if (idx < itens.length - 1) {
      buf.push(...SEP_DOT, LF);
    }
  }

  // Bottom separator
  buf.push(...SEP_DASH, LF);

  // Total (double height = bigger)
  buf.push(...CMD.ALIGN_RIGHT, ...CMD.BOLD_ON);
  if (descontoPercent > 0) {
    const desc = subtotal * (descontoPercent / 100);
    const fin = subtotal - desc;
    buf.push(...ln(`Subtotal: R$ ${fmt(subtotal)}`));
    buf.push(...ln(`Desc (${descontoPercent}%): -R$ ${fmt(desc)}`));
    buf.push(...CMD.FONT_DOUBLE_H);
    buf.push(...ln(`Total: R$ ${fmt(fin)}`));
    buf.push(...CMD.FONT_NORMAL);

    // Parcial breakdown after discount
    if (tipoPag === "parcial") {
      const parcialMatch = (pedido.observacao || "").match(/Valor pago parcial: R\$ ([\d.,]+)/);
      const valorPago = parcialMatch ? Number(parcialMatch[1].replace(",", ".")) : 0;
      if (valorPago > 0) {
        buf.push(LF);
        buf.push(...CMD.FONT_DOUBLE_H);
        buf.push(...ln(`Pagou: R$ ${fmt(valorPago)}`));
        buf.push(...ln(`Ficou: R$ ${fmt(fin - valorPago)}`));
        buf.push(...CMD.FONT_NORMAL);
      }
    }
  } else {
    buf.push(...CMD.FONT_DOUBLE_H);
    buf.push(...ln(`Total: R$ ${fmt(subtotal)}`));
    buf.push(...CMD.FONT_NORMAL);

    // Parcial breakdown
    if (tipoPag === "parcial") {
      const parcialMatch = (pedido.observacao || "").match(/Valor pago parcial: R\$ ([\d.,]+)/);
      const valorPago = parcialMatch ? Number(parcialMatch[1].replace(",", ".")) : 0;
      if (valorPago > 0) {
        buf.push(LF);
        buf.push(...CMD.FONT_DOUBLE_H);
        buf.push(...ln(`Pagou: R$ ${fmt(valorPago)}`));
        buf.push(...ln(`Ficou: R$ ${fmt(subtotal - valorPago)}`));
        buf.push(...CMD.FONT_NORMAL);
      }
    }
  }
  buf.push(...CMD.BOLD_OFF);

  // Cocho info
  const cochoData = parseCochoFromObs(pedido.observacao);
  if (cochoHasValues(cochoData)) {
    buf.push(LF);
    buf.push(...CMD.ALIGN_LEFT, ...CMD.BOLD_ON);
    buf.push(...ln(`Cochos: ${formatCochoLine(cochoData)}`));
    buf.push(...CMD.BOLD_OFF);
  }

  // Tipo pagamento grande no final (se não for parcial, que já mostra breakdown)
  if (tipoPag && tipoPag !== "parcial") {
    buf.push(LF);
    buf.push(...CMD.ALIGN_CENTER, ...CMD.BOLD_ON, ...CMD.FONT_DOUBLE_H);
    buf.push(...ln(formatTipoPagamento(tipoPag)));
    buf.push(...CMD.FONT_NORMAL, ...CMD.BOLD_OFF);
  }

  // Feed + cut
  buf.push(...CMD.ALIGN_LEFT, ...CMD.FEED, ...CMD.PARTIAL_CUT);
  await sendData(new Uint8Array(buf));
}

// ── Entrada ───────────────────────────────────────────────

export async function btPrintEntrada(pedido: any): Promise<void> {
  if (!isPrinterConnected()) await connectPrinter();

  const rawItens = pedido.itens_entrada || [];
  const itens = sortByUnit(
    consolidate(rawItens, 'preco_custo'),
    (i: any) => i.produtos?.unidade || '',
    (i: any) => i.produtos?.descricao || ''
  );

  const orcNum = pedido.orcamento_num || 0;
  const tipoPag = formatTipoPagamento(pedido.tipo_pagamento);

  const buf: number[] = [];
  buf.push(...CMD.INIT, ...CMD.LINE_SPACING_DEFAULT);

  buildHeader(buf);

  // Fornecedor
  buf.push(...CMD.BOLD_ON, ...CMD.FONT_DOUBLE_H);
  buf.push(...ln(pedido.fornecedores?.nome || ''));
  buf.push(...CMD.FONT_NORMAL, ...CMD.BOLD_OFF);

  let info = `${fmtDate(pedido.data)}  No ${orcNum}`;
  buf.push(...ln(info));
  buf.push(LF);

  // Table header
  buf.push(...CMD.BOLD_ON);
  buf.push(...ln('QTD Produto          P.Cust Total'));
  buf.push(...SEP_DASH, LF);

  let total = 0;
  for (let idx = 0; idx < itens.length; idx++) {
    const item = itens[idx];
    const t = Number(item.quantidade) * Number(item.preco_custo);
    total += t;

    const { nameLine, detailLine } = buildItemLines(
      String(item.quantidade),
      item.produtos?.descricao || '',
      fmt(item.preco_custo),
      fmt(t)
    );
    buf.push(...CMD.BOLD_ON);
    buf.push(...nameLine);
    buf.push(...CMD.BOLD_OFF);
    buf.push(...detailLine);

    if (idx < itens.length - 1) {
      buf.push(...SEP_DOT, LF);
    }
  }

  buf.push(...SEP_DASH, LF);

  buf.push(...CMD.ALIGN_RIGHT, ...CMD.BOLD_ON, ...CMD.FONT_DOUBLE_H);
  buf.push(...ln(`Total: R$ ${fmt(total)}`));
  buf.push(...CMD.FONT_NORMAL, ...CMD.BOLD_OFF);

  // Tipo pagamento grande no final
  if (tipoPag) {
    buf.push(LF);
    buf.push(...CMD.ALIGN_CENTER, ...CMD.BOLD_ON, ...CMD.FONT_DOUBLE_H);
    buf.push(...ln(formatTipoPagamento(tipoPag)));
    buf.push(...CMD.FONT_NORMAL, ...CMD.BOLD_OFF);
  }

  buf.push(...CMD.ALIGN_LEFT, ...CMD.FEED, ...CMD.PARTIAL_CUT);
  await sendData(new Uint8Array(buf));
}
