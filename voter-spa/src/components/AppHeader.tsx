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
      padding: "12px 20px 10px",
      borderBottom: `1px solid ${C.border}`,
      background: C.surface,
      flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: FS.lg, fontWeight: 800, color: C.text, fontFamily: "'Georgia', serif" }}>GroupGo</span>
            <span style={{ fontSize: FS.xs, background: C.accent, color: "#000", borderRadius: 4, padding: "1px 6px", fontWeight: 700, letterSpacing: "0.05em" }}>VOTE</span>
          </div>
          {pollTitle && (
            <div style={{ fontSize: FS.sm, color: C.textMuted, marginTop: 1 }}>{pollTitle}</div>
          )}
          {countdown && (
            <div style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 10, color: countdown.urgent ? C.red : C.textDim }}>⏱</span>
              <span style={{
                fontSize: 10, fontWeight: countdown.urgent ? 800 : 600,
                color: countdown.urgent ? C.red : C.textDim,
                letterSpacing: "0.02em",
              }}>{countdown.label}</span>
            </div>
          )}
        </div>
        {statusChip}
        <div style={{
          fontSize: FS.sm, fontWeight: 700, color: C.textMuted,
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: "5px 12px",
          flexShrink: 0,
        }}>{userName}</div>
      </div>
    </div>
  );
}
