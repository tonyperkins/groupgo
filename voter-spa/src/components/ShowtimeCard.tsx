import { C } from "../tokens";
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
  const isDeclined = vote === "cant_do";
  const interactive = !locked && !submitted && !isLocked;

  const cardOpacity = isLocked ? 0.65 : locked ? 0.4 : 1;

  return (
    <div
      style={{
        background: C.card,
        borderRadius: 16,
        border: `1px solid ${isConfirmed ? C.green : isDeclined ? C.red : C.border}`,
        padding: "16px",
        opacity: cardOpacity,
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        transition: "all 0.2s ease-out",
        display: "flex", flexDirection: "column", gap: 16,
      }}
    >
      {/* Top Info Row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
           <div style={{ fontSize: 22, fontWeight: 900, color: isConfirmed ? C.green : isDeclined ? C.textMuted : C.accent, lineHeight: 1 }}>
             {fmt12h(session.session_time)}
           </div>
           {eventTitle && (
            <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginTop: 6 }}>
              {eventTitle}
            </div>
           )}
           <div style={{ fontSize: 13, color: C.textDim, marginTop: 2 }}>
              {event.is_movie ? session.theater_name : (event.venue_name ?? "")}
           </div>
        </div>

        {event.is_movie && session.format !== "Standard" && (
          <span style={{
            flexShrink: 0, fontSize: 11, fontWeight: 800, letterSpacing: "0.05em",
            color: C.accent, background: C.accentDim,
            borderRadius: 6, padding: "4px 8px", textTransform: "uppercase"
          }}>{session.format}</span>
        )}
      </div>

      {/* Button Row */}
      <div style={{ display: "flex", gap: 12 }}>
        <button
          onClick={() => interactive && onVote(session.id, isDeclined ? "abstain" : "cant_do")}
          style={{
            flex: 1, padding: "12px", borderRadius: 12,
            background: isDeclined ? "rgba(239,68,68,0.15)" : C.surface,
            border: `1px solid ${isDeclined ? C.red : C.border}`,
            color: isDeclined ? C.red : C.textDim,
            fontSize: 14, fontWeight: 800, cursor: interactive ? "pointer" : "default",
            transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          {isDeclined ? "❌ Skipped" : "Skip"}
        </button>

        <button
          onClick={() => interactive && onVote(session.id, isConfirmed ? "abstain" : "can_do")}
          style={{
            flex: 1, padding: "12px", borderRadius: 12,
            background: isConfirmed ? "rgba(34,197,94,0.15)" : C.surface,
            border: `1px solid ${isConfirmed ? C.green : C.border}`,
            color: isConfirmed ? C.green : C.textDim,
            fontSize: 14, fontWeight: 800, cursor: interactive ? "pointer" : "default",
            transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          {isConfirmed ? "✅ I'm Down" : "I'm Down"}
        </button>
      </div>
    </div>
  );
}
