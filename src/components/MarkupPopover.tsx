import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface MarkupPopoverProps {
  markup: number;
  customMarkup: string;
  isCustomMarkup: boolean;
  presets: number[];
  onPresetChange: (value: number) => void;
  onCustomChange: (value: string) => void;
  onCustomActivate: () => void;
}

export function MarkupPopover({
  markup,
  customMarkup,
  isCustomMarkup,
  presets,
  onPresetChange,
  onCustomChange,
  onCustomActivate,
}: MarkupPopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center justify-center h-8 min-w-[2.5rem] px-2 rounded-md border bg-background shadow-sm hover:bg-muted transition-colors text-xs font-bold text-muted-foreground"
          title={`Margem: ${markup}%`}
        >
          {markup}%
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-3">
        <p className="text-xs font-medium text-muted-foreground mb-2">Margem de venda</p>
        <div className="flex gap-1 flex-wrap">
          {presets.map(p => (
            <Button
              key={p}
              type="button"
              size="sm"
              variant={markup === p && !isCustomMarkup ? "default" : "outline"}
              onClick={() => onPresetChange(p)}
              className="h-7 px-2.5 text-xs"
            >
              {p}%
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant={isCustomMarkup ? "default" : "outline"}
            onClick={onCustomActivate}
            className="h-7 px-2.5 text-xs"
          >
            Outro
          </Button>
        </div>
        {isCustomMarkup && (
          <div className="flex items-center gap-1 mt-2">
            <Input
              type="number"
              value={customMarkup}
              onChange={e => onCustomChange(e.target.value)}
              className="w-16 h-7 text-xs text-center"
              min={1}
              placeholder="%"
              autoFocus
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-2">Atual: <span className="font-bold">{markup}%</span></p>
      </PopoverContent>
    </Popover>
  );
}
