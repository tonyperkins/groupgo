import { createPortal } from "react-dom";
import { C } from "../tokens";

interface OptOutModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function OptOutModal({ onConfirm, onCancel }: OptOutModalProps) {
  return createPortal(
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 9999,
        padding: "0 24px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.card,
          border: `1px solid ${C.borderLight}`,
          borderRadius: 18,
          padding: "24px 20px 20px",
          width: "100%",
          maxWidth: 340,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 900, color: C.text, textAlign: "center" }}>
          Opt out of this poll?
        </div>
        <div style={{
          fontSize: 13, color: C.textMuted, textAlign: "center", lineHeight: 1.5,
        }}>
          Your votes will be removed. You can rejoin at any time.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
          <div
            onClick={onConfirm}
            style={{
              background: C.accentDim,
              border: `1px solid ${C.accent}`,
              borderRadius: 12,
              padding: "13px",
              textAlign: "center",
              fontSize: 14,
              fontWeight: 800,
              color: C.accent,
              cursor: "pointer",
            }}
          >
            Yes, opt out
          </div>
          <div
            onClick={onCancel}
            style={{
              background: "transparent",
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: "13px",
              textAlign: "center",
              fontSize: 14,
              fontWeight: 700,
              color: C.textMuted,
              cursor: "pointer",
            }}
          >
            Cancel — stay in
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
