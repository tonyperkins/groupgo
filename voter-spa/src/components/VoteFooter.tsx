import { C } from "../tokens";

interface VoteFooterProps {
  isParticipating: boolean;
  hasCompletedVoting: boolean;
  isEditing: boolean;
  isFlexible: boolean;
  votes: Record<string, string>;
  onSubmit: () => void;
  onOptOut: () => void;
  onCancelEdit: () => void;
}

export function VoteFooter({
  isParticipating,
  hasCompletedVoting,
  isEditing,
  isFlexible,
  votes,
  onSubmit,
  onOptOut,
  onCancelEdit,
}: VoteFooterProps) {
  const hasSelections =
    isFlexible ||
    Object.entries(votes).some(([k, v]) => k.startsWith("session:") && v === "can_do");

  // Preview — not participating
  if (!isParticipating) return null;

  // Submitted and not editing — hidden
  if (hasCompletedVoting && !isEditing) return null;

  // Voting with no selections — hidden
  if (!isEditing && !hasSelections) return null;

  const isResubmit = isEditing;

  return (
    <div style={{
      flexShrink: 0,
      padding: "10px 16px 12px",
      background: C.surface,
      borderTop: `1px solid ${C.border}`,
      display: "flex",
      gap: 8,
    }}>
      <div
        onClick={onSubmit}
        style={{
          flex: 1,
          background: "#E8A020",
          color: "#000",
          borderRadius: 12,
          padding: "12px 0",
          textAlign: "center",
          fontSize: 14,
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        {isResubmit ? "Resubmit →" : "Submit vote →"}
      </div>

      <div
        onClick={isResubmit ? onCancelEdit : onOptOut}
        style={{
          background: "transparent",
          color: C.textMuted,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: "12px 16px",
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {isResubmit ? "Cancel" : "Opt out"}
      </div>
    </div>
  );
}
