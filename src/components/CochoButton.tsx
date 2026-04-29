import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Box } from "lucide-react";

export interface CochoData {
  preto: number;
  velling: number;
  quebrado: number;
}

const COCHO_REGEX = /\[COCHO:preto=(\d+),velling=(\d+),quebrado=(\d+)\]/;

export function parseCochoFromObs(obs: string | null | undefined): CochoData {
  if (!obs) return { preto: 0, velling: 0, quebrado: 0 };
  const m = obs.match(COCHO_REGEX);
  if (!m) return { preto: 0, velling: 0, quebrado: 0 };
  return { preto: Number(m[1]), velling: Number(m[2]), quebrado: Number(m[3]) };
}

export function stripCochoFromObs(obs: string | null | undefined): string {
  if (!obs) return "";
  return obs.replace(COCHO_REGEX, "").trim();
}

export function upsertCochoInObs(obs: string | null | undefined, cocho: CochoData): string {
  const clean = stripCochoFromObs(obs);
  if (cocho.preto === 0 && cocho.velling === 0 && cocho.quebrado === 0) return clean;
  const tag = `[COCHO:preto=${cocho.preto},velling=${cocho.velling},quebrado=${cocho.quebrado}]`;
  return clean ? `${clean} ${tag}` : tag;
}

export function cochoHasValues(cocho: CochoData): boolean {
  return cocho.preto > 0 || cocho.velling > 0 || cocho.quebrado > 0;
}

export function formatCochoLine(cocho: CochoData): string {
  const parts: string[] = [];
  if (cocho.preto > 0) parts.push(`Preto: ${cocho.preto}`);
  if (cocho.velling > 0) parts.push(`Velling: ${cocho.velling}`);
  if (cocho.quebrado > 0) parts.push(`Quebrado: ${cocho.quebrado}`);
  return parts.join(" | ");
}

interface Props {
  observacao: string;
  onObservacaoChange: (obs: string) => void;
}

export function CochoButton({ observacao, onObservacaoChange }: Props) {
  const current = parseCochoFromObs(observacao);
  const [preto, setPreto] = useState(current.preto);
  const [velling, setVelling] = useState(current.velling);
  const [quebrado, setQuebrado] = useState(current.quebrado);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const c = parseCochoFromObs(observacao);
      setPreto(c.preto);
      setVelling(c.velling);
      setQuebrado(c.quebrado);
    }
  }, [isOpen, observacao]);

  const hasValues = cochoHasValues(current);

  // Salva imediatamente a cada alteração de valor
  const updateValue = (setter: (v: number) => void, newVal: number, field: 'preto' | 'velling' | 'quebrado') => {
    const val = Math.max(0, newVal || 0);
    setter(val);
    const updated = { preto, velling, quebrado, [field]: val };
    const newObs = upsertCochoInObs(observacao, updated);
    onObservacaoChange(newObs);
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      const newObs = upsertCochoInObs(observacao, { preto, velling, quebrado });
      onObservacaoChange(newObs);
    }
    setIsOpen(open);
  };

  return (
    <Popover open={isOpen} onOpenChange={handleClose} modal={false}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant={hasValues ? "default" : "outline"} className="h-8 px-2 gap-1 text-xs">
          <Box className="h-3.5 w-3.5" />
          Cocho
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        <div className="space-y-2">
          <Label className="text-xs font-semibold">Material Circulante</Label>
          {[
            { label: "Cocho Preto", value: preto, set: setPreto, field: 'preto' as const },
            { label: "Cocho Velling", value: velling, set: setVelling, field: 'velling' as const },
            { label: "Cocho Quebrado", value: quebrado, set: setQuebrado, field: 'quebrado' as const },
          ].map(({ label, value, set, field }) => (
            <div key={label} className="flex items-center justify-between gap-2">
              <span className="text-xs">{label}</span>
              <Input
                type="number"
                min={0}
                value={value || ""}
                onChange={e => updateValue(set, Number(e.target.value), field)}
                className="h-7 w-16 text-xs text-right"
              />
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
