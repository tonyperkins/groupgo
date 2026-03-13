import { useEffect } from "react";
import { C } from "../tokens";

interface ToastProps {
  message: string | null;
  onDismiss: () => void;
  durationMs?: number;
}

export function Toast({ message, onDismiss, durationMs = 3000 }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
  }, [message, durationMs, onDismiss]);

  if (!message) return null;

  return (
    <div style={{
      position: "absolute", bottom: 80, left: 16, right: 16, zIndex: 100,
    }}>
      <div style={{
        background: "#1A1A10", border: `1px solid ${C.accent}`,
        borderRadius: 10, padding: "10px 14px",
        display: "flex", alignItems: "center", gap: 10,
        boxShadow: `0 4px 24px rgba(0,0,0,0.5)`,
      }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
        <span style={{ fontSize: 12, color: C.text, lineHeight: 1.4, flex: 1 }}>{message}</span>
        <span
          onClick={onDismiss}
          style={{ fontSize: 14, color: C.textMuted, cursor: "pointer", flexShrink: 0 }}
        >✕</span>
      </div>
    </div>
  );
}
