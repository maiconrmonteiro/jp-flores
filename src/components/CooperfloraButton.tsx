import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import cooperfloraIcon from "@/assets/cooperflora-icon.png";

interface CooperfloraButtonProps {
  stage: 0 | 1 | 2;
  onToggle: () => void;
  disabled?: boolean;
}

/**
 * Small toggle button with the Cooperflora icon.
 * Stage 0 = inactive, Stage 1 = saldo column visible, Stage 2 = purchase dialog (future)
 */
export function CooperfloraButton({ stage, onToggle, disabled }: CooperfloraButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onToggle}
          disabled={disabled}
          className={`h-9 w-9 rounded-full p-1 transition-all ${
            stage === 2
              ? "ring-2 ring-green-500/70 bg-green-500/20"
              : stage === 1
                ? "ring-2 ring-primary/60 bg-primary/10"
                : "opacity-50 hover:opacity-100"
          }`}
        >
          <img
            src={cooperfloraIcon}
            alt="Cooperflora"
            className="h-7 w-7 object-contain"
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {stage === 0 && "Ver saldo da empresa"}
        {stage === 1 && "Abrir compras Cooperflora"}
        {stage === 2 && "Fechar Cooperflora"}
      </TooltipContent>
    </Tooltip>
  );
}
