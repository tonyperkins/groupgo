import { useState, useEffect, useRef } from "react";
import { C, FS } from "../tokens";

interface HelpIconProps {
  title: string;
  body: string;
}

export function HelpIcon({ title, body }: HelpIconProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: Event) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  return (
    <>
      {/* ? circle trigger */}
      <span
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 16, height: 16, borderRadius: "50%",
          fontSize: 10, fontWeight: 700, lineHeight: 1,
          color: C.textDim, border: `1px solid ${C.textDim}`,
          cursor: "pointer", flexShrink: 0, verticalAlign: "middle",
          marginLeft: 5, opacity: 0.65,
          userSelect: "none",
        }}
      >?</span>

      {/* Modal overlay */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            ref={ref}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 14, padding: "20px 20px 18px",
              maxWidth: 340, width: "100%",
              boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ fontSize: FS.base, fontWeight: 800, color: C.text, flex: 1, paddingRight: 12 }}>{title}</div>
              <span
                onClick={() => setOpen(false)}
                style={{ fontSize: 16, color: C.textDim, cursor: "pointer", lineHeight: 1, flexShrink: 0 }}
              >✕</span>
            </div>
            <div style={{ fontSize: FS.sm, lineHeight: 1.6, color: C.textMuted }}>{body}</div>
          </div>
        </div>
      )}
    </>
  );
}
