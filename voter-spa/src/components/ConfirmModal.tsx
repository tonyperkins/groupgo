import { createPortal } from "react-dom";
import { C } from "../tokens";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  isDestructive = false,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return createPortal(
    <div style={{
      position: "fixed", inset: 0, zIndex: 10000,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
    }}>
      {/* Backdrop */}
      <div 
        onClick={onCancel}
        style={{
          position: "absolute", inset: 0,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }} 
      />

      {/* Modal Card */}
      <div style={{
        position: "relative", zIndex: 1,
        background: C.card, border: `1px solid ${C.borderLight}`,
        borderRadius: 24, padding: "32px 24px 24px",
        maxWidth: 400, width: "100%",
        boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
        textAlign: "center",
        animation: "modalIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
      }}>
        <style>{`
          @keyframes modalIn {
            from { opacity: 0; transform: scale(0.95) translateY(10px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }
        `}</style>
        
        <h3 style={{ fontSize: 20, fontWeight: 900, color: C.text, margin: "0 0 12px" }}>
          {title}
        </h3>
        
        <p style={{ fontSize: 14, color: C.textMuted, lineHeight: 1.6, margin: "0 0 32px" }}>
          {message}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={onConfirm}
            style={{
              background: isDestructive ? "#400" : C.accent,
              color: isDestructive ? "#f55" : "#000",
              border: `1px solid ${isDestructive ? "#622" : "none"}`,
              borderRadius: 16, padding: "14px",
              fontSize: 15, fontWeight: 800, cursor: "pointer",
            }}
          >
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            style={{
              background: "transparent",
              color: C.textDim,
              border: `1px solid ${C.border}`,
              borderRadius: 16, padding: "14px",
              fontSize: 15, fontWeight: 700, cursor: "pointer",
            }}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
