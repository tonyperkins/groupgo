import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { C, FS } from "../tokens";

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

const CHIP_STYLES: Record<ChipState, { bg: string; border: string; color: string; label: string; caret: boolean }> = {
  preview:   { bg: "#1E3A5F", border: "#3B82F6", color: "#3B82F6", label: "JOIN →",    caret: false },
  voting:    { bg: "#7A5510", border: "#E8A020", color: "#E8A020", label: "VOTING ▾",  caret: false },
  submitted: { bg: "#14532D", border: "#22C55E", color: "#22C55E", label: "✓ DONE ▾",  caret: false },
  editing:   { bg: "#7A5510", border: "#E8A020", color: "#E8A020", label: "EDITING ▾", caret: false },
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
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
      });
    }
  }, [anchorRef]);

  if (!pos) return null;

  const menuItems: { label: string; action: () => void }[] =
    chipState === "voting"
      ? [
          { label: "Go to Vote tab", action: () => { navigate("/vote/vote"); onClose(); } },
          { label: "Clear selections", action: () => { onClearSelections(); onClose(); } },
          { label: "Opt out", action: () => { onOptOut(); onClose(); } },
        ]
      : chipState === "submitted"
      ? [
          { label: "Change vote", action: () => { onChangeVote(); onClose(); } },
          { label: "Opt out", action: () => { onOptOut(); onClose(); } },
        ]
      : chipState === "editing"
      ? [
          { label: "Go to Vote tab", action: () => { navigate("/vote/vote"); onClose(); } },
          { label: "Clear selections", action: () => { onClearSelections(); onClose(); } },
          { label: "Cancel edit", action: () => { onCancelEdit(); onClose(); } },
        ]
      : [];

  return createPortal(
    <>
      {/* Dim overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.45)",
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
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: "6px 0",
          minWidth: 170,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
      >
        {menuItems.map((item, i) => (
          <div
            key={i}
            onClick={item.action}
            style={{
              padding: "14px 18px",
              fontSize: FS.base,
              fontWeight: 700,
              color: C.text,
              cursor: "pointer",
              borderTop: i > 0 ? `1px solid ${C.border}` : "none",
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

  function handleClick() {
    if (chipState === "preview") {
      onJoin();
    } else {
      setPopoverOpen((v) => !v);
    }
  }

  return (
    <>
      <div
        ref={chipRef}
        onClick={handleClick}
        style={{
          background: style.bg,
          border: `1px solid ${style.border}`,
          borderRadius: 8,
          padding: "7px 13px",
          fontSize: FS.sm,
          fontWeight: 800,
          color: style.color,
          cursor: "pointer",
          letterSpacing: "0.04em",
          userSelect: "none",
          flexShrink: 0,
        }}
      >
        {style.label}
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
    </>
  );
}
