/**
 * Generates an image of a purchase order (entrada) and copies it to clipboard.
 * Shows: Logo + "PEDIDO [day before]" + items table + total
 */

const DAYS_PT: Record<number, string> = {
  0: "DOMINGO",
  1: "SEGUNDA-FEIRA",
  2: "TERÇA-FEIRA",
  3: "QUARTA-FEIRA",
  4: "QUINTA-FEIRA",
  5: "SEXTA-FEIRA",
  6: "SÁBADO",
};

function getDayBefore(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  return DAYS_PT[date.getDay()] || "";
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function fmt(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

export async function copyOrderImageToClipboard(pedido: any): Promise<string> {
  const items: Array<{ nome: string; unidade: string; qty: number; preco: number }> = (
    pedido.itens_entrada || []
  ).map((i: any) => ({
    nome: i.produtos?.descricao || "—",
    unidade: i.produtos?.unidade || "UN",
    qty: Number(i.quantidade) || 0,
    preco: Number(i.preco_custo) || 0,
  }));

  // Sort by unit order MC > VS > CX > UN, then alphabetical
  const UNIT_ORDER: Record<string, number> = { MC: 0, VS: 1, CX: 2, UN: 3 };
  items.sort((a, b) => {
    const ua = UNIT_ORDER[a.unidade] ?? 99;
    const ub = UNIT_ORDER[b.unidade] ?? 99;
    if (ua !== ub) return ua - ub;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });

  const dayName = getDayBefore(pedido.data);
  const fornecedor = pedido.fornecedores?.nome || "";

  // Canvas dimensions
  const W = 800;
  const ROW_H = 42;
  const HEADER_H = 110;
  const TABLE_HEADER_H = 44;
  const FOOTER_H = 60;
  const PADDING = 30;
  const H = HEADER_H + TABLE_HEADER_H + items.length * ROW_H + FOOTER_H + PADDING;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Header: logo on left + title on right, same line
  const headerY = 25;
  let logoEndX = PADDING;
  try {
    const logo = await loadImage("/logo-jp-flores.png");
    const logoH = 60;
    const logoW = (logo.width / logo.height) * logoH;
    ctx.drawImage(logo, PADDING, headerY, logoW, logoH);
    logoEndX = PADDING + logoW + 15;
  } catch {
    // no logo
  }

  // Title: "PEDIDO SEGUNDA-FEIRA" next to logo
  ctx.fillStyle = "#1a5e1f";
  ctx.font = "bold 36px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`PEDIDO ${dayName}`, logoEndX, headerY + 40);

  // Supplier name below
  if (fornecedor) {
    ctx.fillStyle = "#555555";
    ctx.font = "bold 18px Arial, sans-serif";
    ctx.fillText(fornecedor, logoEndX, headerY + 65);
  }

  // Table columns: QTD | PRODUTO | PREÇO | TOTAL
  const tableY = HEADER_H;
  const colQty = PADDING;
  const colNome = PADDING + 70;
  const colPreco = W - PADDING - 130;
  const colTotal = W - PADDING;

  // Table header
  ctx.fillStyle = "#1a5e1f";
  ctx.fillRect(PADDING, tableY, W - 2 * PADDING, TABLE_HEADER_H);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 16px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("QTD", colQty + 10, tableY + 28);
  ctx.fillText("PRODUTO", colNome, tableY + 28);
  ctx.textAlign = "right";
  ctx.fillText("PREÇO", colPreco, tableY + 28);
  ctx.fillText("TOTAL", colTotal - 10, tableY + 28);

  // Table rows
  let totalGeral = 0;
  items.forEach((item, idx) => {
    const rowY = tableY + TABLE_HEADER_H + idx * ROW_H;
    const rowTotal = item.qty * item.preco;
    totalGeral += rowTotal;

    // Alternating row bg
    if (idx % 2 === 0) {
      ctx.fillStyle = "#f0f7f0";
      ctx.fillRect(PADDING, rowY, W - 2 * PADDING, ROW_H);
    }

    // Row bottom border
    ctx.strokeStyle = "#e0e0e0";
    ctx.beginPath();
    ctx.moveTo(PADDING, rowY + ROW_H);
    ctx.lineTo(W - PADDING, rowY + ROW_H);
    ctx.stroke();

    ctx.fillStyle = "#333333";
    ctx.font = "bold 16px Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(item.qty < 10 ? `0${item.qty}` : String(item.qty), colQty + 10, rowY + 27);
    // Truncate long names
    const maxNameW = colPreco - colNome - 20;
    let displayName = item.nome;
    while (ctx.measureText(displayName).width > maxNameW && displayName.length > 3) {
      displayName = displayName.slice(0, -1);
    }
    if (displayName !== item.nome) displayName += "…";
    ctx.fillText(displayName, colNome, rowY + 27);
    ctx.textAlign = "right";
    ctx.fillText(`R$ ${fmt(item.preco)}`, colPreco, rowY + 27);
    ctx.fillText(`R$ ${fmt(rowTotal)}`, colTotal - 10, rowY + 27);
  });

  // Total bar
  const totalY = tableY + TABLE_HEADER_H + items.length * ROW_H + 10;
  ctx.fillStyle = "#1a5e1f";
  ctx.fillRect(PADDING, totalY, W - 2 * PADDING, 40);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 18px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("TOTAL", colQty + 10, totalY + 27);
  ctx.textAlign = "right";
  ctx.fillText(`R$ ${fmt(totalGeral)}`, colTotal - 10, totalY + 27);

  // Copy to clipboard
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error("Falha ao gerar imagem"));
    }, "image/png");
  });

  await navigator.clipboard.write([
    new ClipboardItem({ "image/png": blob }),
  ]);

  // Return data URL for preview
  return canvas.toDataURL("image/png");
}
