import { ReactNode } from "react";
import { C, FS } from "../tokens";

interface AppHeaderProps {
  userName: string;
  pollTitle: string | null;
  votingClosesAt: string | null;
  statusChip?: ReactNode;
}

function formatCountdown(closesAt: string | null): { label: string; urgent: boolean } | null {
  if (!closesAt) return null;
  const diff = new Date(closesAt).getTime() - Date.now();
  if (diff <= 0) return { label: "Voting closed", urgent: true };
  const hours = Math.floor(diff / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (hours >= 24) return null;
  const urgent = hours < 2;
  const label = hours > 0 ? `${hours}h ${mins}m left` : `${mins}m left`;
  return { label, urgent };
}

export function AppHeader({ userName, pollTitle, votingClosesAt, statusChip }: AppHeaderProps) {
  const countdown = formatCountdown(votingClosesAt);

  return (
    <div style={{
      padding: "10px 16px 8px",
      borderBottom: `1px solid ${C.border}`,
      background: C.surface,
      flexShrink: 0,
    }}>
      {/* Row 1: branding + status chip + username */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: FS.lg, fontWeight: 800, color: C.text, fontFamily: "'Georgia', serif", whiteSpace: "nowrap" }}>GroupGo</span>
          <span style={{ fontSize: FS.xs, background: C.accent, color: "#000", borderRadius: 4, padding: "1px 6px", fontWeight: 700, letterSpacing: "0.05em", whiteSpace: "nowrap", flexShrink: 0 }}>VOTE</span>
          {countdown && (
            <span style={{
              fontSize: FS.xs, fontWeight: countdown.urgent ? 800 : 600,
              color: countdown.urgent ? C.red : C.textDim,
              whiteSpace: "nowrap", flexShrink: 0,
            }}>⏱ {countdown.label}</span>
          )}
        </div>
        {statusChip}
        <div style={{
          fontSize: FS.sm, fontWeight: 700, color: C.textMuted,
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: "5px 10px",
          flexShrink: 0, whiteSpace: "nowrap",
          maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis",
        }}>{userName}</div>
      </div>
      {/* Row 2: poll title */}
      {pollTitle && (
        <div style={{
          fontSize: FS.sm, color: C.textMuted, marginTop: 3,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{pollTitle}</div>
      )}
    </div>
  );
}
