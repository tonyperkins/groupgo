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
      padding: "16px 20px 24px",
      background: C.card,
      borderTop: `1px solid ${C.borderLight}`,
      boxShadow: "0 -8px 24px rgba(0,0,0,0.5)",
      display: "flex",
      gap: 12,
      zIndex: 100,
    }}>
      <div
        onClick={onSubmit}
        style={{
          flex: 1,
          background: "linear-gradient(135deg, #F59E0B, #D97706)",
          color: "#000",
          borderRadius: 16,
          padding: "16px 0",
          textAlign: "center",
          fontSize: 16,
          fontWeight: 900,
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(245, 158, 11, 0.3)",
          transition: "transform 0.1s, box-shadow 0.15s",
          textShadow: "0 1px 2px rgba(255,255,255,0.3)"
        }}
      >
        {isResubmit ? "Save Changes →" : "Lock in My Votes →"}
      </div>

      <div
        onClick={isResubmit ? onCancelEdit : onOptOut}
        style={{
          background: C.surface,
          color: C.textDim,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          padding: "16px 20px",
          fontSize: 15,
          fontWeight: 800,
          cursor: "pointer",
          whiteSpace: "nowrap",
          transition: "background 0.15s, color 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = C.red; e.currentTarget.style.borderColor = C.red; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = C.textDim; e.currentTarget.style.borderColor = C.border; }}
      >
        {isResubmit ? "Cancel" : "Opt Out"}
      </div>
    </div>
  );
}
