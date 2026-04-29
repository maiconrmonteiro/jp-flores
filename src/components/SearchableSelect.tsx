import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown } from "lucide-react";

interface Option {
  value: string;
  label: string;
}

export interface SearchableSelectHandle {
  focus: () => void;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onValueChange: (value: string) => void;
  onAfterSelect?: () => void;
  placeholder?: string;
  className?: string;
  priorityIds?: Set<string>;
}

export const SearchableSelect = forwardRef<SearchableSelectHandle, SearchableSelectProps>(
  ({ options, value, onValueChange, onAfterSelect, placeholder = "Selecione...", className, priorityIds }, ref) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [highlightIdx, setHighlightIdx] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => {
        setOpen(true);
        // Use double-rAF: first to let React render the dropdown, second to focus the now-mounted input
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            inputRef.current?.focus();
          });
        });
      },
    }));

    const UNIT_ORDER: Record<string, number> = { MC: 0, VS: 1, CX: 2, UN: 3 };
    const sortByUnit = (a: Option, b: Option) => {
      const unitA = a.label.match(/\((\w+)\)\s*$/)?.[1] || "";
      const unitB = b.label.match(/\((\w+)\)\s*$/)?.[1] || "";
      const orderA = UNIT_ORDER[unitA] ?? 99;
      const orderB = UNIT_ORDER[unitB] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      return a.label.localeCompare(b.label, "pt-BR");
    };

    const baseFiltered = options.filter(o =>
      o.label.toLowerCase().includes(search.toLowerCase())
    );

    const priorityResults = priorityIds && priorityIds.size > 0
      ? baseFiltered.filter(o => priorityIds.has(o.value)).sort(sortByUnit)
      : [];
    const otherResults = priorityIds && priorityIds.size > 0
      ? baseFiltered.filter(o => !priorityIds.has(o.value)).sort(sortByUnit)
      : baseFiltered.sort(sortByUnit);
    const filtered = [...priorityResults, ...otherResults];

    const selectedLabel = options.find(o => o.value === value)?.label;

    // Auto-highlight first result when filtered list changes
    useEffect(() => {
      setHighlightIdx(0);
    }, [search]);

    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setOpen(false);
          setSearch("");
          setHighlightIdx(-1);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Scroll highlighted item into view
    useEffect(() => {
      if (highlightIdx >= 0 && listRef.current) {
        const items = listRef.current.querySelectorAll("[data-option]");
        items[highlightIdx]?.scrollIntoView({ block: "nearest" });
      }
    }, [highlightIdx]);

    const selectItem = (val: string) => {
      onValueChange(val);
      setOpen(false);
      setSearch("");
      setHighlightIdx(-1);
      // Call immediately (no timeout) so mobile keyboard opens in the next focused input
      onAfterSelect?.();
    };

    const handleInputKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIdx(prev => (prev < filtered.length - 1 ? prev + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIdx(prev => (prev > 0 ? prev - 1 : filtered.length - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (highlightIdx >= 0 && highlightIdx < filtered.length) {
          selectItem(filtered[highlightIdx].value);
        }
      } else if (e.key === "Tab") {
        if (highlightIdx >= 0 && highlightIdx < filtered.length) {
          e.preventDefault();
          selectItem(filtered[highlightIdx].value);
        } else if (filtered.length === 1) {
          e.preventDefault();
          selectItem(filtered[0].value);
        }
      } else if (e.key === "Escape") {
        setOpen(false);
        setSearch("");
        setHighlightIdx(-1);
      }
    };

    const handleOpen = () => {
      setOpen(true);
      setTimeout(() => {
        inputRef.current?.focus();
        // Scroll container to the very top of the viewport
        containerRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
        // Second scroll after keyboard finishes opening (~350ms on Android)
        setTimeout(() => {
          containerRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
        }, 350);
      }, 50);
    };

    return (
      <div ref={containerRef} className={cn("relative", className)}>
        <button
          type="button"
          onClick={() => {
            if (open) {
              setOpen(false);
              setSearch("");
              setHighlightIdx(-1);
            } else {
              handleOpen();
            }
          }}
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            !value && "text-muted-foreground"
          )}
        >
          <span className="truncate">{selectedLabel || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
        {open && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
            <Input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Filtrar..."
              className="h-8 mb-1"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: "calc(2.25rem * 5 + 0.5rem)" }}>
              {filtered.length === 0 && (
                <p className="py-2 px-2 text-sm text-muted-foreground">Nenhum resultado</p>
              )}
              {filtered.map((o, idx) => {
                const getUnit = (label: string) => label.match(/\((\w+)\)\s*$/)?.[1] || "";
                const curUnit = getUnit(o.label);
                const prevUnit = idx > 0 ? getUnit(filtered[idx - 1].label) : "";
                const showPrioritySep = priorityResults.length > 0 && otherResults.length > 0 && idx === priorityResults.length;
                const isInPriority = idx < priorityResults.length;
                const isInOther = idx >= priorityResults.length;
                const prevInSameSection = idx > 0 && ((isInPriority && idx - 1 < priorityResults.length) || (isInOther && idx - 1 >= priorityResults.length));
                const showUnitHeader = !prevInSameSection || curUnit !== prevUnit;
                return (
                <React.Fragment key={o.value}>
                  {showPrioritySep && (
                    <div className="px-2 py-1 text-xs text-muted-foreground border-t my-1">
                      Todos os produtos
                    </div>
                  )}
                  {showUnitHeader && curUnit && (
                    <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-t mt-1">
                      {curUnit}
                    </div>
                  )}
                  <button
                    type="button"
                    data-option
                    onClick={() => selectItem(o.value)}
                    className={cn(
                      "flex w-full items-start rounded-sm px-2 py-1.5 text-sm text-left cursor-pointer hover:bg-accent hover:text-accent-foreground",
                      value === o.value && "bg-accent",
                      highlightIdx === idx && "bg-primary/20 text-accent-foreground"
                    )}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === o.value ? "opacity-100" : "opacity-0")} />
                    {o.label}
                  </button>
                </React.Fragment>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }
);

SearchableSelect.displayName = "SearchableSelect";
