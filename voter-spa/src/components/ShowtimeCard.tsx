import { C, FS } from "../tokens";
import { VoterSession, VoterEvent } from "../api/voter";

export type SessionVote = "can_do" | "cant_do" | "abstain";

interface ShowtimeCardProps {
  session: VoterSession;
  event: VoterEvent;
  eventTitle: string;
  vote: SessionVote | null;
  /** locked: tab-level lock (not participating); submitted: voting complete */
  locked: boolean;
  submitted: boolean;
  /** isLocked: submitted + not editing — read-only display, muted toggle */
  isLocked?: boolean;
  onVote: (sessionId: number, vote: SessionVote) => void;
}

function fmt12h(time24: string): string {
  const [hStr, mStr] = time24.split(":");
  const h = parseInt(hStr, 10);
  const m = mStr ?? "00";
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${period}`;
}

export function ShowtimeCard({
  session,
  event,
  eventTitle,
  vote,
  locked,
  submitted,
  isLocked = false,
  onVote,
}: ShowtimeCardProps) {
  const isConfirmed = vote === "can_do";
  const interactive = !locked && !submitted && !isLocked;

  function handleToggle() {
    if (!interactive) return;
    onVote(session.id, isConfirmed ? "cant_do" : "can_do");
  }

  const borderColor = isConfirmed ? C.green : C.border;
  const cardOpacity = isLocked ? 0.65 : locked ? 0.4 : 1;

  return (
    <div
      onClick={handleToggle}
      style={{
        background: C.card,
        borderRadius: 14,
        border: `1px solid ${borderColor}`,
        padding: "12px 14px",
        opacity: cardOpacity,
        cursor: interactive ? "pointer" : "default",
        transition: "border-color 0.2s, opacity 0.2s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Movie + theater info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {eventTitle && (
            <div style={{ fontSize: FS.md, fontWeight: 800, color: C.text, marginBottom: 2 }}>
              {eventTitle}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "nowrap", minWidth: 0 }}>
            <span style={{ fontSize: FS.base, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1 }}>
              {event.is_movie ? session.theater_name : (event.venue_name ?? "")}
            </span>
            {event.is_movie && session.format !== "Standard" && (
              <span style={{
                flexShrink: 0, fontSize: FS.sm, fontWeight: 700,
                color: C.accent, background: C.accentDim,
                borderRadius: 4, padding: "2px 6px",
                whiteSpace: "nowrap",
              }}>{session.format}</span>
            )}
          </div>
        </div>

        {/* Time + confirm toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{
              fontSize: FS.lg, fontWeight: 800,
              color: isConfirmed ? C.accent : C.textMuted,
            }}>{fmt12h(session.session_time)}</div>
          </div>

          {/* Confirm checkmark toggle */}
          <div
            style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: isConfirmed
                ? (isLocked ? C.locked : "rgba(34,197,94,0.18)")
                : C.surface,
              border: `1px solid ${isConfirmed ? C.green : C.borderLight}`,
              color: isConfirmed ? C.green : C.textDim,
              display: "flex", alignItems: "center", justifyContent: "center",
              pointerEvents: "none",
              fontWeight: 800,
              fontSize: FS.lg,
              transition: "background 0.15s, border-color 0.15s",
            }}
          >{isConfirmed ? "✓" : ""}</div>
        </div>
      </div>
    </div>
  );
}
