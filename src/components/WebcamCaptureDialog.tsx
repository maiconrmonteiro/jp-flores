import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, RotateCcw, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (file: File) => void;
}

/**
 * Diálogo que abre a webcam (getUserMedia) para capturar uma foto.
 * Funciona em desktop (webcam) e mobile (câmera traseira preferencial).
 */
export default function WebcamCaptureDialog({ open, onOpenChange, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const startStream = async () => {
    setError(null);
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      setError(err?.message || "Não foi possível acessar a câmera. Verifique as permissões do navegador.");
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (open && !previewUrl) {
      startStream();
    }
    if (!open) {
      stopStream();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setPreviewBlob(null);
      setError(null);
    }
    return () => {
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        setPreviewBlob(blob);
        setPreviewUrl(url);
        stopStream();
      },
      "image/jpeg",
      0.92,
    );
  };

  const handleRetake = async () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
    await startStream();
  };

  const handleConfirm = () => {
    if (!previewBlob) return;
    const file = new File([previewBlob], `nota_${Date.now()}.jpg`, { type: "image/jpeg" });
    onCapture(file);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tirar foto da nota</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3">
          {error ? (
            <div className="text-sm text-destructive text-center p-4">{error}</div>
          ) : previewUrl ? (
            <img src={previewUrl} alt="Preview" className="w-full max-h-[60vh] object-contain rounded border" />
          ) : (
            <div className="relative w-full bg-black rounded overflow-hidden">
              <video ref={videoRef} className="w-full max-h-[60vh] object-contain" playsInline muted />
              {starting && (
                <div className="absolute inset-0 flex items-center justify-center text-white">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {previewUrl ? (
            <>
              <Button variant="outline" onClick={handleRetake}>
                <RotateCcw className="h-4 w-4 mr-2" /> Refazer
              </Button>
              <Button onClick={handleConfirm}>Usar esta foto</Button>
            </>
          ) : (
            <Button onClick={handleCapture} disabled={!!error || starting}>
              <Camera className="h-4 w-4 mr-2" /> Capturar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
