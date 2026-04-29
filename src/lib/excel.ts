import XLSX from "xlsx-js-style";

const EMPRESA = "Ilha Verde Comércio de Flores LTDA.";
const CNPJ = "CNPJ: 16.905.456/0001-30";

const BORDER_THIN = {
  top: { style: "thin", color: { rgb: "999999" } },
  bottom: { style: "thin", color: { rgb: "999999" } },
  left: { style: "thin", color: { rgb: "999999" } },
  right: { style: "thin", color: { rgb: "999999" } },
};

const HEADER_STYLE = {
  font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
  fill: { fgColor: { rgb: "4A7C59" } },
  alignment: { horizontal: "center" as const, vertical: "center" as const },
  border: BORDER_THIN,
};

const TITLE_STYLE = {
  font: { bold: true, sz: 16 },
  alignment: { horizontal: "center" as const, vertical: "center" as const },
};

const SUBTITLE_STYLE = {
  font: { sz: 11, color: { rgb: "555555" } },
  alignment: { horizontal: "center" as const },
};

const INFO_STYLE = {
  font: { sz: 11 },
};

const CELL_STYLE = {
  font: { sz: 10 },
  border: BORDER_THIN,
  alignment: { vertical: "center" as const },
};

const CELL_CENTER = {
  ...CELL_STYLE,
  alignment: { horizontal: "center" as const, vertical: "center" as const },
};

const CELL_RIGHT = {
  ...CELL_STYLE,
  alignment: { horizontal: "right" as const, vertical: "center" as const },
};

const TOTAL_STYLE = {
  font: { bold: true, sz: 12 },
  alignment: { horizontal: "right" as const },
  border: {
    top: { style: "medium" as const, color: { rgb: "333333" } },
    bottom: { style: "medium" as const, color: { rgb: "333333" } },
  },
};

const NEG_STYLE = {
  ...CELL_STYLE,
  font: { sz: 10, color: { rgb: "FF0000" } },
  alignment: { horizontal: "center" as const, vertical: "center" as const },
};

interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
  align?: "left" | "center" | "right";
  format?: "currency" | "number";
}

interface ExcelExportOptions {
  filename: string;
  sheetName?: string;
  columns: ExcelColumn[];
  rows: Record<string, any>[];
  title?: string;
  subtitle?: string;
  info?: string[];
  totalRow?: { label: string; value: number; colSpan: number };
  highlightNegative?: string; // key to check for negative
  skipCompanyHeader?: boolean; // omit company name/CNPJ rows
}

function fmtDate(d: string) {
  return d ? d.split("-").reverse().join("/") : "";
}

export function exportToExcel({
  filename,
  sheetName = "Dados",
  columns,
  rows,
  title,
  subtitle,
  info = [],
  totalRow,
  highlightNegative,
  skipCompanyHeader = false,
}: ExcelExportOptions) {
  const wb = XLSX.utils.book_new();
  
  // Build sheet data array
  const sheetData: any[][] = [];
  let currentRow = 0;

  // Company header (optional)
  if (!skipCompanyHeader) {
    sheetData.push([EMPRESA]);
    currentRow++;
    sheetData.push([CNPJ]);
    currentRow++;
    sheetData.push([]); // empty row
    currentRow++;
  }

  // Title
  if (title) {
    sheetData.push([title]);
    currentRow++;
  }

  // Subtitle
  if (subtitle) {
    sheetData.push([subtitle]);
    currentRow++;
  }

  // Info lines
  info.forEach(line => {
    sheetData.push([line]);
    currentRow++;
  });

  if (title || subtitle || info.length) {
    sheetData.push([]); // spacer
    currentRow++;
  }

  const headerRowIdx = currentRow;

  // Column headers
  sheetData.push(columns.map(c => c.header));
  currentRow++;

  // Data rows
  const dataStartRow = currentRow;
  rows.forEach(row => {
    sheetData.push(columns.map(c => {
      const val = row[c.key];
      if (c.format === "currency" && typeof val === "number") {
        return `R$ ${val.toFixed(2)}`;
      }
      return val ?? "";
    }));
    currentRow++;
  });

  // Total row
  if (totalRow) {
    sheetData.push([]);
    currentRow++;
    const totalRowData = new Array(columns.length).fill("");
    totalRowData[totalRow.colSpan - 1] = totalRow.label;
    totalRowData[columns.length - 1] = `R$ ${totalRow.value.toFixed(2)}`;
    sheetData.push(totalRowData);
    currentRow++;
  }

  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Set column widths
  ws["!cols"] = columns.map(c => ({ wch: c.width || 15 }));

  // Set row heights
  const rowHeights: Record<number, { hpx: number }> = {};
  if (!skipCompanyHeader) {
    rowHeights[0] = { hpx: 24 };
    if (title) rowHeights[3] = { hpx: 26 };
  } else {
    if (title) rowHeights[0] = { hpx: 26 };
  }
  ws["!rows"] = Array.from({ length: currentRow }, (_, i) => rowHeights[i] || { hpx: 18 });

  // Merge cells for company header, title, subtitle
  const numCols = columns.length;
  const merges: XLSX.Range[] = [];
  if (!skipCompanyHeader) {
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: numCols - 1 } }); // empresa
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: numCols - 1 } }); // cnpj
  }

  let mergeRow = skipCompanyHeader ? 0 : 3;
  if (title) {
    merges.push({ s: { r: mergeRow, c: 0 }, e: { r: mergeRow, c: numCols - 1 } });
    mergeRow++;
  }
  if (subtitle) {
    merges.push({ s: { r: mergeRow, c: 0 }, e: { r: mergeRow, c: numCols - 1 } });
    mergeRow++;
  }
  info.forEach(() => {
    merges.push({ s: { r: mergeRow, c: 0 }, e: { r: mergeRow, c: numCols - 1 } });
    mergeRow++;
  });

  if (totalRow) {
    const totalRowIdx = currentRow - 1;
    if (totalRow.colSpan > 1) {
      merges.push({ s: { r: totalRowIdx, c: 0 }, e: { r: totalRowIdx, c: totalRow.colSpan - 1 } });
    }
  }

  ws["!merges"] = merges;

  // Apply styles
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");

  const companyOffset = skipCompanyHeader ? 0 : 3; // rows used by company header
  const titleRowIdx = companyOffset;

  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellRef = XLSX.utils.encode_cell({ r, c });
      if (!ws[cellRef]) ws[cellRef] = { v: "", t: "s" };

      if (!skipCompanyHeader) {
        // Company name
        if (r === 0) {
          ws[cellRef].s = { font: { bold: true, sz: 14 }, alignment: { horizontal: "center" } };
          continue;
        }
        // CNPJ
        if (r === 1) {
          ws[cellRef].s = SUBTITLE_STYLE;
          continue;
        }
      }

      // Title
      if (title && r === titleRowIdx) {
        ws[cellRef].s = TITLE_STYLE;
      }
      // Subtitle
      else if (subtitle && r === titleRowIdx + (title ? 1 : 0)) {
        ws[cellRef].s = SUBTITLE_STYLE;
      }
      // Info lines
      else if (r >= companyOffset && r < headerRowIdx) {
        ws[cellRef].s = INFO_STYLE;
      }
      // Header row
      else if (r === headerRowIdx) {
        ws[cellRef].s = HEADER_STYLE;
      }
      // Total row
      else if (totalRow && r === currentRow - 1) {
        ws[cellRef].s = TOTAL_STYLE;
      }
      // Data rows
      else if (r >= dataStartRow && r < dataStartRow + rows.length) {
        const col = columns[c];
        const dataRowIdx = r - dataStartRow;
        const isNeg = highlightNegative && rows[dataRowIdx] && rows[dataRowIdx][highlightNegative] < 0;

        if (isNeg && col?.key === highlightNegative) {
          ws[cellRef].s = NEG_STYLE;
        } else if (col?.align === "right" || col?.format === "currency") {
          ws[cellRef].s = CELL_RIGHT;
        } else if (col?.align === "center") {
          ws[cellRef].s = CELL_CENTER;
        } else {
          ws[cellRef].s = CELL_STYLE;
        }

        // Zebra striping
        if (dataRowIdx % 2 === 1) {
          ws[cellRef].s = {
            ...ws[cellRef].s,
            fill: { fgColor: { rgb: "F5F5F5" } },
          };
        }
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
