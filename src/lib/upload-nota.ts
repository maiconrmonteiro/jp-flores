import { supabase } from "@/integrations/supabase/client";

const BUCKET = "notas-fornecedor";
const MAX_DIMENSION = 1600; // px - suficiente p/ ler nota fiscal
const JPEG_QUALITY = 0.72;

/**
 * Comprime uma imagem (File/Blob) para JPEG redimensionado.
 * Mantém proporção, limita lado maior a MAX_DIMENSION e aplica qualidade ~72%.
 */
export async function compressImage(file: File | Blob): Promise<Blob> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
    reader.readAsDataURL(file);
  });

  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Falha ao decodificar imagem"));
    i.src = dataUrl;
  });

  let { width, height } = img;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    if (width > height) {
      height = Math.round((height * MAX_DIMENSION) / width);
      width = MAX_DIMENSION;
    } else {
      width = Math.round((width * MAX_DIMENSION) / height);
      height = MAX_DIMENSION;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas não suportado");
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("Falha ao gerar JPEG"));
        resolve(blob);
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

/**
 * Comprime e envia a foto da nota para o bucket público.
 * Retorna a URL pública do arquivo.
 */
export async function uploadNotaFornecedor(
  file: File | Blob,
  pedidoId: string,
): Promise<string> {
  const compressed = await compressImage(file);
  const filename = `${pedidoId}_${Date.now()}.jpg`;
  const path = `${pedidoId}/${filename}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, compressed, {
      contentType: "image/jpeg",
      upsert: false,
    });

  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
