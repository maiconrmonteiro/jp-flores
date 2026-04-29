import { useState } from "react";
import { DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useLatestCostPrices } from "@/hooks/use-markup";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ApplyPricesButtonProps {
  markup: number;
  motoristaId?: string;
}

export function ApplyPricesButton({ markup, motoristaId }: ApplyPricesButtonProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { data: latestCostPrices = {} } = useLatestCostPrices();

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
  };

  const handleApply = () => {
    if (!selectedDate) return;
    setCalendarOpen(false);
    setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    if (!selectedDate) return;
    setLoading(true);

    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");

      // Fetch pedidos_saida for that date (filtered by motorista if provided)
      let pedidosQuery = supabase
        .from("pedidos_saida")
        .select("id")
        .eq("data", dateStr);
      if (motoristaId) pedidosQuery = pedidosQuery.eq("motorista_id", motoristaId);
      const { data: pedidos, error: pedidosError } = await pedidosQuery;

      if (pedidosError) throw pedidosError;
      if (!pedidos || pedidos.length === 0) {
        toast({ title: "Nenhum pedido encontrado", description: `Não há pedidos de saída para ${format(selectedDate, "dd/MM/yyyy")}.` });
        setLoading(false);
        setConfirmOpen(false);
        return;
      }

      const pedidoIds = pedidos.map((p) => p.id);

      // Fetch itens_saida with preco = 0 for those pedidos
      const { data: itensZerados, error: itensError } = await supabase
        .from("itens_saida")
        .select("id, produto_id, preco")
        .in("pedido_id", pedidoIds)
        .eq("preco", 0);

      if (itensError) throw itensError;
      if (!itensZerados || itensZerados.length === 0) {
        toast({ title: "Nenhum preço zerado", description: "Todos os itens já possuem preço definido." });
        setLoading(false);
        setConfirmOpen(false);
        return;
      }

      // Update each item with suggested price
      let updated = 0;
      for (const item of itensZerados) {
        const costPrice = latestCostPrices[item.produto_id];
        if (!costPrice) continue;

        const suggestedPrice = Math.round(costPrice * (1 + markup / 100) * 100) / 100;
        if (suggestedPrice <= 0) continue;

        const { error: updateError } = await supabase
          .from("itens_saida")
          .update({ preco: suggestedPrice })
          .eq("id", item.id)
          .eq("preco", 0); // safety: only update if still zero

        if (!updateError) updated++;
      }

      toast({
        title: "Preços aplicados!",
        description: `${updated} item(ns) atualizado(s) com margem de ${markup}%.`,
      });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setConfirmOpen(false);
      setSelectedDate(undefined);
    }
  };

  return (
    <>
      <Popover open={calendarOpen} onOpenChange={(open) => { setCalendarOpen(open); if (open) setSelectedDate(undefined); }}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" title="Aplicar preços zerados">
            Aplicar Preços
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end" side="top">
          <div className="p-3 space-y-3">
            <p className="text-xs font-medium text-muted-foreground">
              Selecione a data para aplicar preços ({markup}%)
            </p>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              className="pointer-events-auto"
            />
            {selectedDate && (
              <Button size="sm" className="w-full" onClick={handleApply}>
                Aplicar em {format(selectedDate, "dd/MM/yyyy")}
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar aplicação de preços</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os produtos com preço <strong>R$ 0,00</strong> nos pedidos de saída do dia{" "}
              <strong>{selectedDate ? format(selectedDate, "dd/MM/yyyy") : ""}</strong> serão
              atualizados com a margem de <strong>{markup}%</strong> sobre o custo.
              <br /><br />
              Produtos que já possuem preço digitado (qualquer valor acima de zero) <strong>não serão alterados</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={loading}>
              {loading ? "Aplicando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
