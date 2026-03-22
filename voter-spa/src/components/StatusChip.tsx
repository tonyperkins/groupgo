import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { C } from "../tokens";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChipState = "preview" | "voting" | "submitted" | "editing";

interface Prefs {
  is_participating: boolean;
  has_completed_voting: boolean;
}

export function deriveChipState(prefs: Prefs, isEditing: boolean): ChipState {
  if (!prefs.is_participating) return "preview";
  if (prefs.has_completed_voting && !isEditing) return "submitted";
  if (isEditing) return "editing";
  return "voting";
}

// ─── Per-state style tokens ───────────────────────────────────────────────────

const CHIP_STYLES: Record<ChipState, { bg: string; border: string; color: string; label: string }> = {
  preview:   { bg: "transparent", border: "transparent", color: "transparent", label: "" },
  voting:    { bg: "rgba(232, 160, 32, 0.15)", border: C.accent, color: C.accent, label: "VOTING" },
  submitted: { bg: "rgba(34, 197, 94, 0.15)", border: C.green, color: C.green, label: "✓ VOTED" },
  editing:   { bg: "rgba(232, 160, 32, 0.15)", border: C.accent, color: C.accent, label: "EDITING" },
};

// ─── Popover contents ─────────────────────────────────────────────────────────

interface PopoverProps {
  chipState: ChipState;
  anchorRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onChangeVote: () => void;
  onOptOut: () => void;
  onCancelEdit: () => void;
  onClearSelections: () => void;
}

function Popover({ chipState, anchorRef, onClose, onChangeVote, onOptOut, onCancelEdit, onClearSelections }: PopoverProps) {
  const navigate = useNavigate();
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, [anchorRef]);

  if (!pos) return null;

  const menuItems: { label: string; action: () => void; danger?: boolean }[] =
    chipState === "voting"
      ? [
          { label: "🗳️ Go to Vote tab", action: () => { navigate("/vote/vote"); onClose(); } },
          { label: "🗑️ Clear selections", action: () => { onClearSelections(); onClose(); } },
          { label: "🚪 Opt out", action: () => { onOptOut(); onClose(); }, danger: true },
        ]
      : chipState === "submitted"
      ? [
          { label: "✏️ Change vote", action: () => { onChangeVote(); onClose(); } },
          { label: "🚪 Opt out", action: () => { onOptOut(); onClose(); }, danger: true },
        ]
      : chipState === "editing"
      ? [
          { label: "🗳️ Go to Vote tab", action: () => { navigate("/vote/vote"); onClose(); } },
          { label: "🗑️ Clear selections", action: () => { onClearSelections(); onClose(); } },
          { label: "↩️ Cancel edit", action: () => { onCancelEdit(); onClose(); } },
        ]
      : [];

  return createPortal(
    <>
      {/* Dim overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "transparent",
          zIndex: 9998,
        }}
      />
      {/* Popover card */}
      <div
        style={{
          position: "fixed",
          top: pos.top,
          right: pos.right,
          zIndex: 9999,
          background: C.card,
          border: `1px solid ${C.borderLight}`,
          borderRadius: 12,
          padding: "6px 0",
          minWidth: 180,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ padding: "8px 16px", fontSize: 11, fontWeight: 900, color: C.textDim, letterSpacing: "0.08em", borderBottom: `1px solid ${C.borderLight}`, marginBottom: 4 }}>
          POLL ACTIONS
        </div>
        {menuItems.map((item, i) => (
          <div
            key={i}
            onClick={item.action}
            style={{
              padding: "12px 16px",
              fontSize: 14,
              fontWeight: 700,
              color: item.danger ? C.red : C.text,
              cursor: "pointer",
            }}
          >
            {item.label}
          </div>
        ))}
      </div>
    </>,
    document.body
  );
}

// ─── StatusChip ───────────────────────────────────────────────────────────────

interface StatusChipProps {
  prefs: Prefs;
  isEditing: boolean;
  onJoin: () => void;
  onChangeVote: () => void;
  onOptOut: () => void;
  onCancelEdit: () => void;
  onClearSelections: () => void;
}

export function StatusChip({
  prefs,
  isEditing,
  onJoin,
  onChangeVote,
  onOptOut,
  onCancelEdit,
  onClearSelections,
}: StatusChipProps) {
  const chipState = deriveChipState(prefs, isEditing);
  const style = CHIP_STYLES[chipState];
  const [popoverOpen, setPopoverOpen] = useState(false);
  const chipRef = useRef<HTMLDivElement>(null);

  if (chipState === "preview") {
    return (
      <div
        onClick={onJoin}
        style={{
          background: C.blue, color: "#FFF",
          padding: "6px 14px", borderRadius: 99,
          fontSize: 13, fontWeight: 800, cursor: "pointer",
          boxShadow: "0 2px 8px rgba(59, 130, 246, 0.4)",
          whiteSpace: "nowrap", flexShrink: 0,
        }}
      >
        + Join Poll
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {/* Read-only status badge */}
      <div style={{
        background: style.bg, border: `1px solid ${style.border}`, color: style.color,
        padding: "3px 8px", borderRadius: 6,
        fontSize: 11, fontWeight: 900, letterSpacing: "0.05em",
        userSelect: "none", whiteSpace: "nowrap"
      }}>
        {style.label}
      </div>

      {/* Modern ellipsis action menu trigger */}
      <div
        ref={chipRef}
        onClick={() => setPopoverOpen(!popoverOpen)}
        style={{
          width: 30, height: 30, borderRadius: "50%",
          background: popoverOpen ? C.borderLight : C.surface, 
          border: `1px solid ${C.borderLight}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", color: C.text,
          transition: "background 0.15s",
          boxShadow: "0 2px 4px rgba(0,0,0,0.05)"
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </div>

      {popoverOpen && (
        <Popover
          chipState={chipState}
          anchorRef={chipRef}
          onClose={() => setPopoverOpen(false)}
          onChangeVote={onChangeVote}
          onOptOut={onOptOut}
          onCancelEdit={onCancelEdit}
          onClearSelections={onClearSelections}
        />
      )}
    </div>
  );
}
