import { useNavigate } from "react-router-dom";
import { C } from "../tokens";
import { VoterEvent } from "../api/voter";
import { MovieCard, MovieVote } from "./MovieCard";

interface MoviesTabProps {
  events: VoterEvent[];
  votes: Record<string, string>;
  yesMovieCount: number;
  isParticipating: boolean;
  hasCompletedVoting: boolean;
  isEditing: boolean;
  onVote: (eventId: number, vote: MovieVote, vetoReason?: string) => void;
}

export function MoviesTab({
  events,
  votes,
  yesMovieCount,
  isParticipating,
  hasCompletedVoting,
  isEditing,
  onVote,
}: MoviesTabProps) {
  const navigate = useNavigate();

  const totalMovies = events.length;
  const votedCount = events.filter((e) => {
    const v = votes[`event:${e.id}`];
    return v === "yes" || v === "no";
  }).length;

  // Derive card mode
  const isSubmitted = hasCompletedVoting && !isEditing;
  const cardMode = isSubmitted ? "readonly" : isParticipating ? "voting" : "info";

  // In voting mode: cards can be clicked only once there's at least one yes OR
  // if the user is actively casting their first vote. The "zero-yes" unlock hint
  // shows when participating but yesMovieCount === 0 and not yet submitted.
  const showUnlockHint = isParticipating && !isSubmitted && yesMovieCount === 0;

  return (
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>

      {/* ── Stat bar ────────────────────────────────────────────── */}
      <div style={{
        padding: "6px 0 2px",
        display: "flex", alignItems: "center", gap: 8,
        borderBottom: `1px solid ${C.border}`,
        marginBottom: 2,
      }}>
        <span style={{ fontSize: 11, color: C.textMuted, flex: 1 }}>
          {isSubmitted
            ? `${yesMovieCount} of ${totalMovies} picked`
            : `${votedCount} of ${totalMovies} movies voted`}
        </span>
      </div>

      {/* ── Zero-yes unlock hint ─────────────────────────────────── */}
      {showUnlockHint && (
        <div style={{
          background: C.card, border: `1px dashed ${C.border}`,
          borderRadius: 14, padding: "14px 16px", textAlign: "center",
        }}>
          <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.5 }}>
            Vote <span style={{ color: C.green, fontWeight: 700 }}>Yes</span> on at least one movie to unlock Showtimes
          </div>
        </div>
      )}

      {/* ── Submitted CTA ────────────────────────────────────────── */}
      {isSubmitted && (
        <div
          onClick={() => navigate("/vote/results")}
          style={{
            background: C.accent, color: "#000",
            borderRadius: 14, padding: "13px 18px",
            textAlign: "center", fontSize: 14, fontWeight: 700,
            letterSpacing: "0.02em", cursor: "pointer",
          }}
        >View Live Results →</div>
      )}

      {/* ── Movie cards ──────────────────────────────────────────── */}
      {events.map((event) => {
        const rawVote = votes[`event:${event.id}`] as MovieVote | undefined;
        const vote: MovieVote | null = rawVote ?? null;
        // canVote=false only in the zero-yes state (participating, no yes yet, not submitted)
        // Once user casts first yes, all cards become interactive
        const canVote = isParticipating && !isSubmitted;

        return (
          <MovieCard
            key={event.id}
            event={event}
            mode={cardMode}
            vote={vote}
            canVote={canVote}
            onVote={onVote}
          />
        );
      })}
    </div>
  );
}
