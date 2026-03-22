import { useEffect } from "react";
import { C } from "../tokens";

interface ToastProps {
  message: string | null;
  onDismiss: () => void;
  type?: "success" | "info" | "warning" | "error";
  durationMs?: number;
}

export function Toast({ message, onDismiss, type = "info", durationMs = 3000 }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
  }, [message, durationMs, onDismiss]);

  if (!message) return null;

  const icon = type === "success" ? "✅" : (type === "error" || type === "warning") ? "⚠️" : "ℹ️";
  const borderColor = type === "success" ? "#22C55E" : (type === "error" || type === "warning") ? C.red : C.accent;

  return (
    <div style={{
      position: "fixed", bottom: 84, left: 16, right: 16, zIndex: 1000,
      display: "flex", justifyContent: "center", pointerEvents: "none",
    }}>
      <div style={{
        background: "#0A0A0F", border: `1px solid ${borderColor}`,
        borderRadius: 16, padding: "12px 16px",
        display: "flex", alignItems: "center", gap: 12,
        boxShadow: `0 8px 32px rgba(0,0,0,0.6)`,
        maxWidth: 400, width: "100%", pointerEvents: "auto",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.4, flex: 1 }}>{message}</span>
        <span
          onClick={onDismiss}
          style={{ fontSize: 14, color: C.textMuted, cursor: "pointer", flexShrink: 0, padding: 4 }}
        >✕</span>
      </div>
    </div>
  );
}
