import { useState, useRef, useCallback, useEffect, useImperativeHandle, forwardRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { SearchableSelect, SearchableSelectHandle } from "@/components/SearchableSelect";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, ShoppingBag, Check, X, Loader2, AlertTriangle } from "lucide-react";
import { PastDateEditWarning } from "@/components/PastDateGuard";
import { CooperfloraButton } from "@/components/CooperfloraButton";

interface OrderItem {
  _key?: string;
  id?: string;
  produto_id: string;
  quantidade: number;
  [key: string]: any;
}

interface Props {
  items: OrderItem[];
  setItems: React.Dispatch<React.SetStateAction<any[]>>;
  produtoOptions: { value: string; label: string }[];
  priceField?: string;
  getSuggestedPrice?: (produtoId: string) => number;
  showAmbulanteButton?: boolean;
  showQtyPedida?: boolean;
  currentStock?: Map<string, { total: number; baixado: number; descricao: string; unidade: string }>;
  createItem?: (produtoId: string, qty: number, price: number, isBaixa?: boolean) => any;
  onAddItem?: (item: OrderItem, isBaixa: boolean) => Promise<{ id: string } | null>;
  onEditItem?: (item: OrderItem) => Promise<void>;
  onRemoveItem?: (item: OrderItem) => Promise<void>;
  renderExtraButtons?: (produtoId: string) => React.ReactNode;
  ambulantePrimary?: boolean;
  priorityProductIds?: Set<string>;
  /** If set, shows a past-date warning before saving edits when the order's date is in the past */
  orderDate?: string;
  /** Show Cooperflora button for saldo/purchase integration */
  showCooperfloraButton?: boolean;
  /** Company saldo map: produto_id -> balance (positive = surplus, negative = deficit) */
  companySaldo?: Map<string, number>;
  /** Whether company saldo is currently loading */
  companySaldoLoading?: boolean;
  /** Callback when cooperflora stage changes: 0=off, 1=saldo, 2=purchase */
  onCooperfloraStageChange?: (stage: 0 | 1 | 2) => void;
  /** Current cooperflora stage (controlled) */
  cooperfloraStage?: 0 | 1 | 2;
}

export interface OrderItemsEditorHandle {
  flushEdit: () => Promise<void>;
}

let _keyCounter = 0;
const nextKey = () => `oie_${++_keyCounter}`;

/** Parse a string that may use comma as decimal separator */
const parseDecimal = (v: string): number => {
  const n = Number(v.replace(",", "."));
  return isNaN(n) ? 0 : n;
};

const OrderItemsEditor = forwardRef<OrderItemsEditorHandle, Props>(function OrderItemsEditor({
  items,
  setItems,
  produtoOptions,
  priceField,
  getSuggestedPrice,
  showAmbulanteButton,
  showQtyPedida,
  currentStock,
  createItem,
  onAddItem,
  onEditItem,
  onRemoveItem,
  renderExtraButtons,
  ambulantePrimary,
  priorityProductIds,
  orderDate,
  showCooperfloraButton,
  companySaldo,
  companySaldoLoading,
  onCooperfloraStageChange,
  cooperfloraStage = 0,
}: Props, ref) {
  const [newProdutoId, setNewProdutoId] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newPreco, setNewPreco] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editPreco, setEditPreco] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Past-date warning before editing an item on a past-date order
  const [pastDateWarning, setPastDateWarning] = useState<{ pendingIdx: number } | null>(null);
  const [pastDateConfirmed, setPastDateConfirmed] = useState(false);

  // Helper: is the orderDate in the past?
  const isOrderInPast = !!orderDate && (() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return new Date(orderDate + "T00:00:00") < today;
  })();

  // Confirmation dialog for adding regular item when ambulantePrimary is active
  const [confirmAddRegular, setConfirmAddRegular] = useState(false);

  // Confirm delete item dialog
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null);

  // Stock overflow confirmation dialog
  const [stockOverflow, setStockOverflow] = useState<{
    produtoId: string;
    requestedQty: number;
    availableQty: number;
    price: number;
    excessQty: number;
    // For edit overflow: the original item being edited
    editItem?: OrderItem;
    editIdx?: number;
  } | null>(null);

  const newProdutoRef = useRef<SearchableSelectHandle>(null);
  const newQtyRef = useRef<HTMLInputElement>(null);
  const newPrecoRef = useRef<HTMLInputElement>(null);
  const editQtyRef = useRef<HTMLInputElement>(null);
  const editPrecoRef = useRef<HTMLInputElement>(null);
  const proxyInputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const listContainerRef = useRef<HTMLDivElement>(null);

  const hasPrice = !!priceField;

  const getProductName = useCallback((produtoId: string) => {
    return produtoOptions.find(p => p.value === produtoId)?.label || "";
  }, [produtoOptions]);

  const handleProductSelect = (produtoId: string) => {
    setNewProdutoId(produtoId);
    if (produtoId && getSuggestedPrice && hasPrice) {
      const suggested = getSuggestedPrice(produtoId);
      if (suggested > 0) setNewPreco(String(suggested));
    }
    // Focus synchronously so mobile keyboard opens automatically
    newQtyRef.current?.focus();
  };

  const addItem = async (isBaixa = false) => {
    if (!newProdutoId || isSaving) return;
    // Capture focus on proxy input synchronously so mobile keeps keyboard open through the await
    proxyInputRef.current?.focus();

    const qtyNum = parseDecimal(newQty) || 1;
    const priceNum = hasPrice ? parseDecimal(newPreco) : 0;

    // Check ambulante stock before baixa
    if (isBaixa && currentStock) {
      const stock = currentStock.get(newProdutoId);
      const available = stock ? stock.total - stock.baixado : 0;

      // Also account for baixas already in current items list (not yet reflected in allBaixas)
      const alreadyInList = items
        .filter(it => it.produto_id === newProdutoId && it.is_baixa_ambulante)
        .reduce((sum, it) => sum + Number(it.quantidade), 0);
      // allBaixas already includes saved items, items with id are already counted
      const unsavedBaixas = items
        .filter(it => it.produto_id === newProdutoId && it.is_baixa_ambulante && !it.id)
        .reduce((sum, it) => sum + Number(it.quantidade), 0);
      const realAvailable = available - unsavedBaixas;

      if (realAvailable <= 0) {
        // No stock at all - show dialog offering to add as regular item
        setStockOverflow({
          produtoId: newProdutoId,
          requestedQty: qtyNum,
          availableQty: 0,
          price: priceNum,
          excessQty: qtyNum,
        });
        return;
      }

      if (qtyNum > realAvailable) {
        // Partial stock - show dialog
        setStockOverflow({
          produtoId: newProdutoId,
          requestedQty: qtyNum,
          availableQty: realAvailable,
          price: priceNum,
          excessQty: qtyNum - realAvailable,
        });
        return;
      }
    }

    await addItemInternal(newProdutoId, qtyNum, priceNum, isBaixa);
  };

  const addItemInternal = async (produtoId: string, qtyNum: number, priceNum: number, isBaixa: boolean) => {
    // Check if an item with the same produto_id + same price already exists
    const existingIdx = items.findIndex(it =>
      it.produto_id === produtoId &&
      (!hasPrice || Number(it[priceField!] || 0) === priceNum) &&
      (!isBaixa === !it.is_baixa_ambulante)
    );

    if (existingIdx >= 0) {
      // Merge: sum quantities
      const existing = items[existingIdx];
      const mergedQty = Number(existing.quantidade) + qtyNum;
      const updatedItem = { ...existing, quantidade: mergedQty };
      setItems(prev => prev.map((item, i) => i === existingIdx ? updatedItem : item));

      if (onEditItem && updatedItem.id) {
        setIsSaving(true);
        try { await onEditItem(updatedItem); } catch {}
        setIsSaving(false);
      }
    } else {
      // New item
      const tempKey = nextKey();
      const newItem = createItem
        ? createItem(produtoId, qtyNum, priceNum, isBaixa)
        : {
            _key: tempKey,
            produto_id: produtoId,
            quantidade: qtyNum,
            ...(hasPrice ? { [priceField!]: priceNum } : {}),
            ...(isBaixa ? { is_baixa_ambulante: true } : {}),
          };
      if (!newItem._key) newItem._key = tempKey;

      if (onAddItem) {
        setIsSaving(true);
        try {
          const result = await onAddItem(newItem, isBaixa);
          if (result) {
            setItems(prev => [...prev, { ...newItem, id: result.id }]);
          }
        } catch {
          setIsSaving(false);
          return;
        }
        setIsSaving(false);
      } else {
        setItems(prev => [...prev, newItem]);
      }
    }

    setNewProdutoId("");
    setNewQty("1");
    setNewPreco("");
    // Re-open product select immediately so mobile keyboard opens for next item
    newProdutoRef.current?.focus();
  };

  const handleOverflowConfirm = async () => {
    if (!stockOverflow) return;
    const { produtoId, availableQty, price, excessQty, editItem, editIdx } = stockOverflow;
    setStockOverflow(null);

    if (editItem !== undefined && editIdx !== undefined) {
      // Edit overflow: cap the baixa item at available qty, add excess as regular item
      const cappedQty = Math.max(availableQty, 0);
      if (cappedQty > 0) {
        const updatedItem = { ...editItem, quantidade: cappedQty, ...(hasPrice ? { [priceField!]: price } : {}) };
        setItems(prev => prev.map((it, i) => i === editIdx ? updatedItem : it));
        setEditingIdx(null);
        if (onEditItem && updatedItem.id) {
          setIsSaving(true);
          try { await onEditItem(updatedItem); } catch {}
          setIsSaving(false);
        }
      }
      // Add excess as regular item
      await addItemInternal(produtoId, excessQty, price, false);
    } else {
      // Add overflow (original behavior)
      if (availableQty > 0) {
        await addItemInternal(produtoId, availableQty, price, true);
      }
      await addItemInternal(produtoId, excessQty, price, false);
    }
  };

  const handleOverflowCancel = () => {
    setStockOverflow(null);
  };

  const handleNewKeyDown = (e: React.KeyboardEvent, field: "qty" | "preco") => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (field === "qty" && hasPrice) {
        newPrecoRef.current?.focus();
      } else {
        addItem(ambulantePrimary ? true : false).catch(() => {});
      }
    }
  };

  // When editingIdx changes, focus the qty input (fallback for cases where startEdit can't do it synchronously)
  useEffect(() => {
    if (editingIdx !== null) {
      editQtyRef.current?.focus();
    }
  }, [editingIdx]);

  const startEdit = (idx: number) => {
    const item = items[idx];
    if (!item) return;
    // If the order has a past date and hasn't been confirmed yet for this session, show warning
    if (isOrderInPast && !pastDateConfirmed) {
      setPastDateWarning({ pendingIdx: idx });
      return;
    }
    setEditingIdx(idx);
    setEditQty(String(Number(item.quantidade) || 1));
    if (hasPrice) setEditPreco(String(Number(item[priceField!]) || 0));
    setTimeout(() => editQtyRef.current?.focus(), 0);
  };

  const confirmEditRef = useRef<() => Promise<void>>();

  const confirmEdit = async () => {
    if (editingIdx === null || isSaving) return;
    let qtyNum = parseDecimal(editQty) || 1;
    const priceNum = parseDecimal(editPreco);
    const item = items[editingIdx];


    // Check ambulante stock if editing a baixa item and quantity increased
    if (item.is_baixa_ambulante && currentStock && qtyNum > Number(item.quantidade)) {
      const stock = currentStock.get(item.produto_id);
      const totalAvailable = stock ? stock.total - stock.baixado : 0;
      // Current item's saved qty is already counted in "baixado", so add it back
      const currentSavedQty = Number(item.quantidade);
      const realAvailable = totalAvailable + currentSavedQty;
      // Also subtract unsaved baixas from OTHER items (not this one)
      const otherUnsavedBaixas = items
        .filter((it, i) => i !== editingIdx && it.produto_id === item.produto_id && it.is_baixa_ambulante && !it.id)
        .reduce((sum, it) => sum + Number(it.quantidade), 0);
      const finalAvailable = realAvailable - otherUnsavedBaixas;

      if (qtyNum > finalAvailable) {
        const excess = qtyNum - finalAvailable;
        setStockOverflow({
          produtoId: item.produto_id,
          requestedQty: qtyNum,
          availableQty: Math.max(finalAvailable, 0),
          price: hasPrice ? priceNum : 0,
          excessQty: excess,
          editItem: item,
          editIdx: editingIdx,
        });
        return;
      }
    }

    const updatedItem = {
      ...item,
      quantidade: qtyNum,
      ...(hasPrice ? { [priceField!]: priceNum } : {}),
    };
    setItems(prev => prev.map((it, i) => i === editingIdx ? updatedItem : it));
    setEditingIdx(null);
    // Keep focusedIdx at current position so user can continue navigating
    const sortPos = sortedIndices.indexOf(editingIdx);
    if (sortPos >= 0) setFocusedIdx(sortPos);
    // Return focus to list container so arrow keys work immediately
    setTimeout(() => listContainerRef.current?.focus(), 0);

    if (onEditItem && updatedItem.id) {
      setIsSaving(true);
      try { await onEditItem(updatedItem); } catch {}
      setIsSaving(false);
    }
  };

  confirmEditRef.current = confirmEdit;

  useImperativeHandle(ref, () => ({
    flushEdit: async () => {
      if (confirmEditRef.current) await confirmEditRef.current();
    },
  }), []);

  const handleEditBlur = useCallback((e: React.FocusEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    const row = e.currentTarget.closest("tr") || e.currentTarget.closest("[data-editing-row]");
    // If focus moves to another element inside the SAME editing row (e.g. qty → price), don't save yet
    if (row && relatedTarget && row.contains(relatedTarget)) return;
    confirmEditRef.current?.();
  }, []);

  const cancelEdit = () => {
    const sortPos = editingIdx !== null ? sortedIndices.indexOf(editingIdx) : null;
    setEditingIdx(null);
    if (sortPos !== null && sortPos >= 0) setFocusedIdx(sortPos);
    setTimeout(() => listContainerRef.current?.focus(), 0);
  };

  const removeItem = async (idx: number) => {
    const removed = items[idx];
    setItems(prev => prev.filter((_, i) => i !== idx));
    if (editingIdx === idx) setEditingIdx(null);

    if (onRemoveItem && removed?.id) {
      try { await onRemoveItem(removed); } catch {}
    }
  };

  const askRemoveItem = (idx: number) => setConfirmDeleteIdx(idx);
  const confirmRemoveItem = () => {
    if (confirmDeleteIdx !== null) {
      removeItem(confirmDeleteIdx);
      setConfirmDeleteIdx(null);
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent, field?: "qty" | "preco") => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (field === "qty" && hasPrice) {
        editPrecoRef.current?.focus();
      } else {
        confirmEdit();
      }
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  };

  const totalParcial = hasPrice
    ? items.reduce((s, i) => s + (i.produto_id ? Number(i.quantidade || 0) * Number(i[priceField!] || 0) : 0), 0)
    : 0;

  const canAddAmbulante = showAmbulanteButton && newProdutoId && currentStock?.has(newProdutoId);

  // Sort items for display: MC → VS → CX → UN, then alphabetically
  const UNIT_ORDER: Record<string, number> = { MC: 0, VS: 1, CX: 2, UN: 3 };
  const sortedIndices = useMemo(() => {
    const indices = items.map((_, i) => i);
    indices.sort((a, b) => {
      const nameA = getProductName(items[a].produto_id);
      const nameB = getProductName(items[b].produto_id);
      // Extract unit from the product label (usually at end, e.g. "Rosa Vermelha (CX)")
      const unitA = produtoOptions.find(p => p.value === items[a].produto_id)?.label.match(/\((\w+)\)\s*$/)?.[1] || "";
      const unitB = produtoOptions.find(p => p.value === items[b].produto_id)?.label.match(/\((\w+)\)\s*$/)?.[1] || "";
      const orderA = UNIT_ORDER[unitA] ?? 99;
      const orderB = UNIT_ORDER[unitB] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      return nameA.localeCompare(nameB, "pt-BR");
    });
    return indices;
  }, [items, produtoOptions, getProductName]);

  return (
    <div className="space-y-3">
      {/* Hidden proxy input for iOS keyboard activation */}
      <input
        ref={proxyInputRef}
        type="text"
        inputMode="decimal"
        aria-hidden="true"
        tabIndex={-1}
        style={{ position: "absolute", opacity: 0, height: 0, width: 0, pointerEvents: "none" }}
      />
      

      <div className="p-3 rounded-md border bg-muted/30 space-y-2">
        <SearchableSelect
          ref={newProdutoRef}
          options={produtoOptions}
          value={newProdutoId}
          onValueChange={handleProductSelect}
          placeholder="Produto"
          priorityIds={priorityProductIds}
        />
        <div className={hasPrice
          ? "grid gap-1.5 grid-cols-2"
          : "grid gap-1.5 grid-cols-1 max-w-[6rem]"
        }>
          <Input
            ref={newQtyRef}
            type="text"
            inputMode="numeric"
            placeholder="Qtd"
            value={newQty}
            onChange={e => setNewQty(e.target.value)}
            onKeyDown={e => handleNewKeyDown(e, "qty")}
            onFocus={e => e.target.select()}
            className="px-2 text-center text-base min-w-0"
          />
          {hasPrice && (
            <Input
              ref={newPrecoRef}
              type="text"
              inputMode="decimal"
              placeholder="R$"
              value={newPreco}
              onChange={e => setNewPreco(e.target.value)}
              onKeyDown={e => handleNewKeyDown(e, "preco")}
              onFocus={e => e.target.select()}
              className="px-2 text-base min-w-0"
            />
          )}
        </div>
        <div className="flex gap-2">
          {ambulantePrimary ? (
            <>
              {showAmbulanteButton && (
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  onClick={() => addItem(true)}
                  disabled={!canAddAmbulante || isSaving}
                  title={canAddAmbulante ? "Adicionar como baixa do ambulante" : "Produto sem saldo no ambulante"}
                >
                  {isSaving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <ShoppingBag className="mr-1 h-3 w-3" />}
                  Ambulante
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setConfirmAddRegular(true)}
                disabled={!newProdutoId || isSaving}
              >
                <Plus className="mr-1 h-3 w-3" />
                Adicionar Item
              </Button>
            </>
          ) : (
            <>
              <Button type="button" size="sm" onClick={() => addItem(false)} disabled={!newProdutoId || isSaving}>
                {isSaving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-3 w-3" />}
                Adicionar Item
              </Button>
              {showAmbulanteButton && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => addItem(true)}
                  disabled={!canAddAmbulante || isSaving}
                  title={canAddAmbulante ? "Adicionar como baixa do ambulante" : "Produto sem saldo no ambulante"}
                >
                  <ShoppingBag className="mr-1 h-3 w-3" />Ambulante
                </Button>
              )}
            </>
          )}
          {renderExtraButtons?.(newProdutoId)}
          {showCooperfloraButton && (
            <CooperfloraButton
              stage={cooperfloraStage}
              onToggle={() => {
                const next = cooperfloraStage === 0 ? 1 : cooperfloraStage === 1 ? 2 : 0;
                onCooperfloraStageChange?.(next as 0 | 1 | 2);
              }}
            />
          )}
        </div>
      </div>

      {items.length > 0 && (
        <div className="rounded-md border overflow-hidden">
          <div
            ref={listContainerRef}
            className="divide-y divide-border outline-none"
            tabIndex={0}
            onKeyDown={(e) => {
              if (editingIdx !== null) return; // don't interfere with edit mode
              const len = sortedIndices.length;
              if (!len) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setFocusedIdx(prev => {
                  const next = prev === null ? 0 : Math.min(prev + 1, len - 1);
                  const el = itemRefs.current.get(sortedIndices[next]);
                  el?.scrollIntoView({ block: "nearest" });
                  return next;
                });
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setFocusedIdx(prev => {
                  const next = prev === null ? 0 : Math.max(prev - 1, 0);
                  const el = itemRefs.current.get(sortedIndices[next]);
                  el?.scrollIntoView({ block: "nearest" });
                  return next;
                });
              } else if (e.key === "Enter" && focusedIdx !== null) {
                e.preventDefault();
                startEdit(sortedIndices[focusedIdx]);
              }
            }}
          >
            {sortedIndices.map((idx, sortPos) => {
              const item = items[idx];
              const isEditing = editingIdx === idx;
              const productName = getProductName(item.produto_id);
              const isBaixa = item.is_baixa_ambulante;

              if (isEditing) {
                return (
                  <div key={item._key || idx} className="bg-muted/50 px-2 py-0.5" data-editing-row>
                    <div className="text-xs font-medium leading-none line-clamp-2">
                      {isBaixa && <span className="text-destructive font-bold mr-1">(A)</span>}
                      {productName}
                    </div>
                    <div className="flex items-center gap-1 -mt-px">
                      {showQtyPedida && (
                        <span className="text-[11px] text-muted-foreground shrink-0">Ped:{item.qty_pedida ?? ""}</span>
                      )}
                      <Input
                        ref={editQtyRef}
                        type="text"
                        inputMode="numeric"
                        value={editQty}
                        onChange={e => setEditQty(e.target.value)}
                        onKeyDown={e => handleEditKeyDown(e, "qty")}
                        onFocus={e => e.target.select()}
                        onBlur={handleEditBlur}
                        className="h-6 w-14 px-1 text-center text-xs mr-1"
                        placeholder="Qtd"
                      />
                      {cooperfloraStage >= 1 && (
                        <span className="text-[11px] shrink-0">
                          {(() => {
                            const s = companySaldo?.get(item.produto_id);
                            if (s === undefined) return companySaldoLoading ? "…" : "—";
                            return <span className={s < 0 ? "text-destructive font-bold" : s > 0 ? "text-primary font-medium" : "text-muted-foreground"}>{s}</span>;
                          })()}
                        </span>
                      )}
                      {hasPrice && (
                        <Input
                          ref={editPrecoRef}
                          type="text"
                          inputMode="decimal"
                          value={editPreco}
                          onChange={e => setEditPreco(e.target.value)}
                          onKeyDown={e => handleEditKeyDown(e, "preco")}
                          onFocus={e => e.target.select()}
                          onBlur={handleEditBlur}
                          className="h-6 w-16 px-1 text-right text-xs"
                          placeholder="Preço"
                        />
                      )}
                      {hasPrice && (
                        <span className="text-[11px] font-semibold shrink-0 ml-auto">
                          {(parseDecimal(editQty) * parseDecimal(editPreco)).toFixed(2)}
                        </span>
                      )}
                      <div className="flex shrink-0">
                        <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={confirmEdit} disabled={isSaving}>
                          <Check className="h-3 w-3 text-green-600" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={cancelEdit}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              }

              const isFocused = focusedIdx === sortPos;
              return (
                <div
                  key={item._key || idx}
                  ref={(el) => { if (el) itemRefs.current.set(idx, el); else itemRefs.current.delete(idx); }}
                  className={`px-2 py-0.5 cursor-pointer hover:bg-muted/80 active:bg-muted/70 ${isFocused ? "bg-muted/60 ring-1 ring-inset ring-primary/30" : ""}`}
                  onClick={() => { setFocusedIdx(sortPos); startEdit(idx); }}
                >
                  <div className="text-xs md:text-sm font-medium leading-none line-clamp-2">
                    {isBaixa && <span className="text-destructive font-bold mr-1">(A)</span>}
                    {productName}
                  </div>
                  <div className="flex items-center text-xs md:text-sm text-muted-foreground -mt-px">
                    {showQtyPedida && (
                      <span className="mr-2">Ped:{item.qty_pedida ?? ""}</span>
                    )}
                    <span className="mr-4">{item.quantidade}</span>
                    {cooperfloraStage >= 1 && (
                      <span className="mr-2">
                        {(() => {
                          const s = companySaldo?.get(item.produto_id);
                          if (s === undefined) return companySaldoLoading ? "…" : "—";
                          return <span className={s < 0 ? "text-destructive font-bold" : s > 0 ? "text-primary font-medium" : "text-muted-foreground"}>{s}</span>;
                        })()}
                      </span>
                    )}
                    {hasPrice && (
                      <span className="mr-4">R${Number(item[priceField!] || 0).toFixed(2)}</span>
                    )}
                    {hasPrice && (
                      <span className="font-semibold text-foreground ml-auto">
                        Tot:{(Number(item.quantidade || 0) * Number(item[priceField!] || 0)).toFixed(2)}
                      </span>
                    )}
                    <div className="shrink-0 ml-1" onClick={e => e.stopPropagation()}>
                      <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => askRemoveItem(idx)}
                        title="Excluir item"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {hasPrice && (
            <div className="flex justify-end px-3 py-1.5 border-t bg-muted/20">
              <span className="text-sm font-semibold">Total: R$ {totalParcial.toFixed(2)}</span>
            </div>
          )}
        </div>
      )}

      {/* Past-date order warning (shown once per dialog open) */}
      <PastDateEditWarning
        open={pastDateWarning !== null}
        orderDate={orderDate || ""}
        onConfirm={() => {
          const idx = pastDateWarning!.pendingIdx;
          setPastDateConfirmed(true);
          setPastDateWarning(null);
          const item = items[idx];
          if (!item) return;
          setEditingIdx(idx);
          setEditQty(String(Number(item.quantidade) || 1));
          if (hasPrice) setEditPreco(String(Number(item[priceField!]) || 0));
          setTimeout(() => editQtyRef.current?.focus(), 0);
        }}
        onCancel={() => setPastDateWarning(null)}
      />

      {/* Confirm add regular item when ambulantePrimary */}
      <Dialog open={confirmAddRegular} onOpenChange={(v) => { if (!v) setConfirmAddRegular(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirmar Adição de Item
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Pedido com data de entrega para hoje ou que já passou. Deseja realmente adicionar item?
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setConfirmAddRegular(false);
                addItem(true);
              }}
            >
              <ShoppingBag className="mr-1 h-3 w-3" />Ambulante
            </Button>
            <Button
              onClick={() => {
                setConfirmAddRegular(false);
                addItem(false);
              }}
            >
              <Plus className="mr-1 h-3 w-3" />Adicionar Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stock overflow confirmation dialog */}
      <Dialog open={!!stockOverflow} onOpenChange={(v) => { if (!v) handleOverflowCancel(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Saldo Ambulante Insuficiente
            </DialogTitle>
          </DialogHeader>
          {stockOverflow && (
            <div className="space-y-3">
              <p className="text-sm">
                <strong>{getProductName(stockOverflow.produtoId)}</strong>
              </p>
              {stockOverflow.availableQty > 0 ? (
                <div className="text-sm space-y-1">
                  <p>Quantidade solicitada: <strong>{stockOverflow.requestedQty}</strong></p>
                  <p>Saldo disponível no ambulante: <strong>{stockOverflow.availableQty}</strong></p>
                  <p>Quantidade excedente: <strong>{stockOverflow.excessQty}</strong></p>
                  <p className="mt-2 text-muted-foreground">
                    Deseja dar baixa de <strong>{stockOverflow.availableQty}</strong> no ambulante e adicionar as <strong>{stockOverflow.excessQty}</strong> restantes como item normal?
                  </p>
                </div>
              ) : (
                <div className="text-sm space-y-1">
                  <p>Quantidade solicitada: <strong>{stockOverflow.requestedQty}</strong></p>
                  <p>Saldo disponível no ambulante: <strong>0</strong></p>
                  <p className="mt-2 text-muted-foreground">
                    Não há mais saldo no ambulante para este produto. Deseja adicionar as <strong>{stockOverflow.excessQty}</strong> unidades como item normal?
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleOverflowCancel}>Cancelar</Button>
            <Button onClick={handleOverflowConfirm}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Confirm delete item */}
      <Dialog open={confirmDeleteIdx !== null} onOpenChange={(open) => { if (!open) setConfirmDeleteIdx(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir item</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Deseja excluir <strong>{confirmDeleteIdx !== null ? getProductName(items[confirmDeleteIdx]?.produto_id) : ""}</strong> do pedido?
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmDeleteIdx(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmRemoveItem}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

export default OrderItemsEditor;
