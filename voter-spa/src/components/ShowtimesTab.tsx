import { useState } from "react";
import { C } from "../tokens";
import { VoterSession, VoterEvent } from "../api/voter";
import { ShowtimeCard, SessionVote } from "./ShowtimeCard";

interface ShowtimesTabProps {
  sessions: VoterSession[];
  events: VoterEvent[];
  votes: Record<string, string>;
  votedSessionCount: number;
  yesMovieCount: number;
  isParticipating: boolean;
  hasCompletedVoting: boolean;
  isFlexible: boolean;
  isEditing: boolean;
  onSessionVote: (sessionId: number, vote: SessionVote) => void;
  onSetFlexible: (flexible: boolean) => void;
}

function formatDate(dateStr: string): string {
  // YYYY-MM-DD → "Friday, May 30"
  try {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  } catch {
    return dateStr;
  }
}

// ─── Flexible toggle ──────────────────────────────────────────────────────────

interface FlexibleToggleProps {
  isFlexible: boolean;
  disabled: boolean;
  onToggle: () => void;
}

function FlexibleToggle({ isFlexible, disabled, onToggle }: FlexibleToggleProps) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${isFlexible ? C.accent : C.border}`,
        borderRadius: 12, padding: "12px 14px",
        display: "flex", alignItems: "center", gap: 12,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 3 }}>
          I'm In — Whatever You Choose!
        </div>
        <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.4 }}>
          Skip showtime voting and count yourself as available for every showtime.
        </div>
      </div>
      {/* Toggle pill */}
      <div
        onClick={() => !disabled && onToggle()}
        style={{
          width: 44, height: 26, borderRadius: 99,
          background: isFlexible ? C.accent : C.border,
          display: "flex", alignItems: "center",
          justifyContent: isFlexible ? "flex-end" : "flex-start",
          padding: "0 3px", flexShrink: 0,
          cursor: disabled ? "default" : "pointer",
          transition: "background 0.2s",
        }}
      >
        <div style={{
          width: 20, height: 20, borderRadius: "50%",
          background: isFlexible ? "#000" : C.textDim,
          transition: "background 0.2s",
        }} />
      </div>
    </div>
  );
}

// ─── Main ShowtimesTab ────────────────────────────────────────────────────────

export function ShowtimesTab({
  sessions,
  events,
  votes,
  votedSessionCount,
  yesMovieCount,
  isParticipating,
  hasCompletedVoting,
  isFlexible,
  isEditing,
  onSessionVote,
  onSetFlexible,
}: ShowtimesTabProps) {
  const [locationFilter, setLocationFilter] = useState<string | null>(null);

  const isSubmitted = hasCompletedVoting && !isEditing;
  const noYesMovies = yesMovieCount === 0 && isParticipating && !isSubmitted;
  const cardLocked = !isParticipating;

  // Derive unique theater names for location filter
  const theaters = Array.from(new Set(sessions.map((s) => s.theater_name))).sort();

  // Filter sessions by selected location
  const visibleSessions = locationFilter
    ? sessions.filter((s) => s.theater_name === locationFilter)
    : sessions;

  // Group visible sessions by date
  const byDate = new Map<string, VoterSession[]>();
  for (const s of visibleSessions) {
    const existing = byDate.get(s.session_date) ?? [];
    existing.push(s);
    byDate.set(s.session_date, existing);
  }
  const sortedDates = Array.from(byDate.keys()).sort();

  // Event lookup
  const eventMap = new Map(events.map((e) => [e.id, e]));

  // Filter sessions to only those whose movie was voted "yes" (or show all in info/flexible)
  const yesEventIds = new Set(
    Object.entries(votes)
      .filter(([k, v]) => k.startsWith("event:") && v === "yes")
      .map(([k]) => parseInt(k.split(":")[1], 10))
  );

  const filteredByDate = new Map<string, VoterSession[]>();
  for (const [date, dateSessions] of byDate) {
    const relevant = isParticipating && !isFlexible && yesEventIds.size > 0
      ? dateSessions.filter((s) => yesEventIds.has(s.event_id))
      : dateSessions;
    if (relevant.length > 0) filteredByDate.set(date, relevant);
  }

  return (
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>

      {/* ── Stat bar ─────────────────────────────────────────────── */}
      <div style={{
        padding: "4px 0 6px",
        borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 11, color: C.textMuted, flex: 1 }}>
          {isFlexible ? "Flexible mode — all times" : "Pick your showtimes"}
        </span>
        {votedSessionCount > 0 && !isFlexible && (
          <span style={{ fontSize: 11, color: C.green, fontWeight: 700 }}>
            {votedSessionCount} confirmed
          </span>
        )}
      </div>

      {/* ── No yes-movies hint (inline, never replaces list) ──────── */}
      {noYesMovies && !isFlexible && (
        <div style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 12, padding: "10px 14px",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>🎬</span>
          <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.4 }}>
            Vote <span style={{ color: C.green, fontWeight: 700 }}>Yes</span> on at least one movie
            to enable showtime voting.
          </div>
        </div>
      )}

      {/* ── How it works explainer ───────────────────────────────── */}
      {!isFlexible && (
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 12, padding: "12px 14px",
        }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.text, marginBottom: 4 }}>
            How showtime voting works
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>
            Tap <span style={{ color: C.green, fontWeight: 700 }}>✓</span> on showtimes that work for you.
            Only times you confirm count as available.
          </div>
        </div>
      )}

      {/* ── Flexible toggle ──────────────────────────────────────── */}
      <FlexibleToggle
        isFlexible={isFlexible}
        disabled={!isParticipating || isSubmitted}
        onToggle={() => onSetFlexible(!isFlexible)}
      />

      {/* ── Flexible confirmation card ───────────────────────────── */}
      {isFlexible && (
        <div style={{
          background: `linear-gradient(135deg, ${C.accentDim}, ${C.card})`,
          border: `1px solid ${C.accent}`, borderRadius: 16,
          padding: "20px 16px", textAlign: "center",
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: C.accent, marginBottom: 8 }}>
            You're flexible!
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6 }}>
            Your vote counts as approval for every showtime combination.
            You're all set unless you want to turn flexible mode back off.
          </div>
        </div>
      )}

      {/* ── Location filter ──────────────────────────────────────── */}
      {!isFlexible && theaters.length > 1 && (
        <div>
          <div style={{
            fontSize: 10, fontWeight: 700, color: C.textMuted,
            letterSpacing: "0.1em", marginBottom: 8,
          }}>FILTER LOCATIONS</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {theaters.map((loc) => {
              const active = locationFilter === loc;
              return (
                <div
                  key={loc}
                  onClick={() => setLocationFilter(active ? null : loc)}
                  style={{
                    background: active ? C.surface : "transparent",
                    border: `1px solid ${active ? C.borderLight : C.border}`,
                    borderRadius: 99, padding: "5px 12px",
                    fontSize: 11, fontWeight: 600,
                    color: active ? C.text : C.textMuted,
                    cursor: "pointer",
                  }}
                >{loc}</div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Showtime cards grouped by date ───────────────────────── */}
      {!isFlexible && sortedDates.map((date) => {
        const dateSessions = filteredByDate.get(date);
        if (!dateSessions) return null;
        return (
          <div key={date} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Date heading */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13 }}>📅</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>
                {formatDate(date)}
              </span>
            </div>

            {dateSessions.map((session) => {
              const event = eventMap.get(session.event_id);
              const rawVote = votes[`session:${session.id}`] as SessionVote | undefined;
              return (
                <ShowtimeCard
                  key={session.id}
                  session={session}
                  eventTitle={event?.title ?? "Unknown"}
                  vote={rawVote ?? null}
                  locked={cardLocked || noYesMovies}
                  submitted={isSubmitted}
                  onVote={onSessionVote}
                />
              );
            })}
          </div>
        );
      })}

      {/* ── Empty state when filter yields nothing ───────────────── */}
      {!isFlexible && filteredByDate.size === 0 && (
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 14, padding: "32px 20px", textAlign: "center",
        }}>
          <div style={{ fontSize: 13, color: C.textMuted }}>
            No showtimes available{locationFilter ? ` at ${locationFilter}` : ""}.
          </div>
        </div>
      )}
    </div>
  );
}
