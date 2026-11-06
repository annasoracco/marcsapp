import { useEffect, useLayoutEffect, useRef } from "react";

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Element to focus first; defaults to the sheet itself. */
  initialFocus?: React.RefObject<HTMLElement | null>;
}

/** A bottom sheet: slides up over the page, closes on Escape, the scrim, or the Done button. */
export function Sheet({ title, onClose, children, initialFocus }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    (initialFocus?.current ?? ref.current)?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      if (e.key === "Tab" && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input, select, [tabindex]:not([tabindex="-1"])',
        );
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.documentElement.classList.add("sheet-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("sheet-open");
      prev?.focus?.({ preventScroll: true });
    };
  }, [initialFocus]);

  return (
    <div className="sheet-layer">
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" ref={ref} tabIndex={-1}>
        <div className="sheet-head">
          <h2 id="sheet-title" className="sheet-title">
            {title}
          </h2>
          <button type="button" className="btn text done" onClick={onClose}>
            Done
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
