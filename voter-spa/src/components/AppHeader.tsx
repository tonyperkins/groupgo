import { ReactNode, useState } from "react";
import { C, FS } from "../tokens";
import { voterApi } from "../api/voter";

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
  const [confirming, setConfirming] = useState(false);

  const handleLogout = async () => {
    if (!confirming) { setConfirming(true); return; }
    try { await voterApi.logout(); } catch { /* best effort */ }
    window.location.href = "/";
  };

  return (
    <div style={{
      padding: "10px 16px 8px",
      borderBottom: `1px solid ${C.border}`,
      background: C.surface,
      flexShrink: 0,
    }}>
      {/* Row 1: branding + status chip + username + logout */}
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
        {/* User name chip + exit button */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <div style={{
            fontSize: FS.sm, fontWeight: 700, color: C.textMuted,
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: "5px 10px",
            whiteSpace: "nowrap",
            maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis",
          }}>{userName}</div>
          <button
            onClick={handleLogout}
            onBlur={() => setConfirming(false)}
            title={confirming ? "Tap again to confirm sign out" : "Sign out"}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              background: confirming ? "#7f1d1d" : C.card,
              border: `1px solid ${confirming ? "#ef4444" : C.border}`,
              borderRadius: 8, padding: "5px 8px",
              cursor: "pointer", flexShrink: 0,
              transition: "background 0.15s, border-color 0.15s",
              color: confirming ? "#fca5a5" : C.textDim,
            }}
          >
            {confirming ? (
              <span style={{ fontSize: FS.xs, fontWeight: 700, whiteSpace: "nowrap" }}>Sign out?</span>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            )}
          </button>
        </div>
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
