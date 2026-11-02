import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

/** Every bottom sheet the app can show. One at a time. */
export type SheetSpec =
  | { kind: "addCall"; symbol?: string; date?: string; segment?: string; link?: string; editId?: string }
  | { kind: "call"; id: string }
  | { kind: "explain"; term: string }
  | { kind: "sample" }
  | { kind: "install" };

interface UiValue {
  sheet: SheetSpec | null;
  open: (s: SheetSpec) => void;
  close: () => void;
}

const UiContext = createContext<UiValue | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState<SheetSpec | null>(null);
  const open = useCallback((s: SheetSpec) => setSheet(s), []);
  const close = useCallback(() => setSheet(null), []);
  const value = useMemo(() => ({ sheet, open, close }), [sheet, open, close]);
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiValue {
  const v = useContext(UiContext);
  if (!v) throw new Error("useUi outside UiProvider");
  return v;
}

const reduced = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Bottom sheet: slides up, traps focus, closes on Escape, backdrop tap, or the close button,
 * and gives focus back to whatever opened it.
 */
export function Sheet({ title, onClose, children, footer, tall }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; tall?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const opener = useRef<Element | null>(null);

  const dismiss = useCallback(() => {
    if (reduced()) return onClose();
    setLeaving(true);
    window.setTimeout(onClose, 200);
  }, [onClose]);

  useEffect(() => {
    opener.current = document.activeElement;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector<HTMLElement>("h2");
    first?.focus({ preventScroll: true });
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dismiss();
      } else if (e.key === "Tab" && el) {
        const items = [...el.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex="0"]')].filter((n) => n.offsetParent !== null || n === document.activeElement);
        if (!items.length) return;
        const firstItem = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstItem) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          firstItem.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      (opener.current as HTMLElement | null)?.focus?.({ preventScroll: true });
    };
  }, [dismiss]);

  return (
    <div className={`sheet-layer ${leaving ? "leaving" : ""}`}>
      <div className="sheet-backdrop" onClick={dismiss} aria-hidden="true" />
      <div ref={ref} className={`sheet ${tall ? "tall" : ""}`} role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <h2 id="sheet-title" tabIndex={-1}>
            {title}
          </h2>
          <button type="button" className="icon-btn" onClick={dismiss} aria-label="Close">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}
