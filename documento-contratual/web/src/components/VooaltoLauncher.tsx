import React, { useEffect, useRef, useState } from "react";
import { App } from "../App";

/**
 * Plug-and-play React launcher for an existing application. Nothing is installed or
 * spawned: PDF.js/Tesseract run in browser Web Workers and all outputs are Blobs.
 * Mount anywhere inside your current React tree: <VooaltoLauncher />.
 */
export function VooaltoLauncher({
  label = "Abrir motor de contratos",
}: {
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      openerRef.current?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        onClick={() => setOpen(true)}
        style={{ background: "#172636", color: "white", padding: "10px 18px", borderRadius: 8, cursor: "pointer" }}
      >
        {label}
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Sistema VOOALTO de contratos"
          style={{
            position: "fixed", inset: 0, zIndex: 2147483647,
            background: "rgba(15,23,42,.75)", display: "flex", flexDirection: "column",
          }}
        >
          <div style={{ background: "#172636", display: "flex", justifyContent: "flex-end", padding: "8px 14px" }}>
            <button
              ref={closeRef}
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar motor de contratos"
              style={{ color: "white", cursor: "pointer", padding: "4px 12px" }}
            >
              Fechar ×
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: "auto", background: "#f3f5f8" }}>
            <App />
          </div>
        </div>
      )}
    </>
  );
}
