import { useRef, useState } from "react";
import { C } from "../tokens";
import { VoterEvent } from "../api/voter";

export type MovieVote = "yes" | "no" | "abstain";
export type MovieCardMode = "voting" | "readonly" | "info" | "results";

interface MovieCardProps {
  event: VoterEvent;
  mode: MovieCardMode;
  /** Current vote value — used in voting/readonly/results modes */
  vote?: MovieVote | null;
  /** When false, Yes/No buttons are dimmed and non-interactive (zero-yes state) */
  canVote?: boolean;
  /** Results mode: total yes count across the group */
  groupYesCount?: number;
  onVote?: (eventId: number, vote: MovieVote, vetoReason?: string) => void;
}

// ─── Poster image or emoji fallback ───────────────────────────────────────────

function Poster({ event, size }: { event: VoterEvent; size: number }) {
  const [imgFailed, setImgFailed] = useState(false);
  if (event.poster_url && !imgFailed) {
    return (
      <img
        src={event.poster_url}
        alt={event.title}
        onError={() => setImgFailed(true)}
        style={{
          width: size, height: Math.round(size * 1.5),
          borderRadius: 8, objectFit: "cover",
          border: `1px solid ${C.border}`,
        }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: Math.round(size * 1.5),
      borderRadius: 8, background: C.surface,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: Math.round(size * 0.5), border: `1px solid ${C.border}`,
    }}>🎬</div>
  );
}

// ─── Chip row (year / runtime / content rating) ───────────────────────────────

function MetaChips({ event }: { event: VoterEvent }) {
  const chips = [
    event.year ? String(event.year) : null,
    event.runtime_mins ? `${Math.floor(event.runtime_mins / 60)}h ${event.runtime_mins % 60}m` : null,
  ].filter(Boolean) as string[];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
      {chips.map((c) => (
        <span key={c} style={{
          fontSize: 10, color: C.textMuted,
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 6, padding: "2px 7px",
        }}>{c}</span>
      ))}
    </div>
  );
}

// ─── Genre tag pills ──────────────────────────────────────────────────────────

function GenreTags({ genres }: { genres: string[] }) {
  if (!genres.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
      {genres.map((g) => (
        <span key={g} style={{
          fontSize: 10, color: C.textDim,
          border: `1px solid ${C.border}`,
          borderRadius: 99, padding: "1px 7px",
        }}>{g}</span>
      ))}
    </div>
  );
}

// ─── Trailer section ──────────────────────────────────────────────────────────

interface TrailerProps {
  event: VoterEvent;
  onLoad: () => void;
}

function TrailerPlayer({ event, onLoad }: TrailerProps) {
  if (!event.trailer_key) {
    return (
      <div style={{
        margin: "0 14px 12px",
        borderRadius: 10, background: C.surface,
        border: `1px solid ${C.border}`,
        height: 175,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 13, color: C.textMuted }}>No trailer available</span>
      </div>
    );
  }
  return (
    <div style={{
      margin: "0 14px 12px",
      borderRadius: 10, overflow: "hidden",
      background: "#000", height: 175,
    }}>
      <iframe
        src={`https://www.youtube.com/embed/${event.trailer_key}?autoplay=1`}
        title={`${event.title} trailer`}
        allow="autoplay; encrypted-media"
        allowFullScreen
        onLoad={onLoad}
        style={{ width: "100%", height: "100%", border: "none", display: "block" }}
      />
    </div>
  );
}

// ─── Vote buttons row ─────────────────────────────────────────────────────────

interface VoteRowProps {
  eventId: number;
  vote: MovieVote | null;
  canVote: boolean;
  trailerOpen: boolean;
  vetoReason: string;
  onVetoReasonChange: (v: string) => void;
  onVote: (vote: MovieVote, vetoReason?: string) => void;
}

function VoteRow({ eventId: _eventId, vote, canVote, trailerOpen, vetoReason, onVetoReasonChange, onVote }: VoteRowProps) {
  const yesActive = vote === "yes";
  const noActive = vote === "no";

  // Subtitle text shown when trailer is open (mockup trailer-expanded screen)
  const subtitle = trailerOpen;

  return (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8 }}>
        {/* Yes button */}
        <div
          onClick={() => canVote && onVote("yes")}
          style={{
            flex: 1, borderRadius: 10,
            padding: subtitle ? "10px 8px" : "12px 8px",
            background: yesActive ? C.greenDim : C.surface,
            border: `1px solid ${yesActive ? C.green : C.border}`,
            cursor: canVote ? "pointer" : "default",
            opacity: canVote ? 1 : 0.4,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 14, color: yesActive ? C.green : C.textMuted }}>✓</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: yesActive ? C.green : C.textMuted }}>Yes</span>
          </div>
          {subtitle && (
            <span style={{ fontSize: 10, color: C.green, opacity: 0.7 }}>Keep it in the running</span>
          )}
        </div>

        {/* No button */}
        <div
          onClick={() => canVote && onVote(noActive ? "abstain" : "no")}
          style={{
            flex: 1, borderRadius: 10,
            padding: subtitle ? "10px 8px" : "12px 8px",
            background: noActive ? C.redDim : C.surface,
            border: `1px solid ${noActive ? C.red : C.border}`,
            cursor: canVote ? "pointer" : "default",
            opacity: canVote ? 1 : 0.4,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 14, color: noActive ? C.red : C.textMuted }}>✕</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: noActive ? C.red : C.textMuted }}>No</span>
          </div>
          {subtitle && (
            <span style={{ fontSize: 10, color: C.red, opacity: 0.7 }}>Rule it out</span>
          )}
        </div>
      </div>

      {/* Veto reason — "Why not?" textarea, shown when voted No */}
      {noActive && canVote && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, letterSpacing: "0.04em" }}>
            Why not? <span style={{ fontWeight: 400, color: C.textDim }}>(optional)</span>
          </label>
          <textarea
            value={vetoReason}
            onChange={(e) => onVetoReasonChange(e.target.value)}
            onBlur={() => {
              if (vetoReason.trim()) onVote("no", vetoReason.trim());
            }}
            placeholder="e.g. Already saw it, too long…"
            rows={2}
            style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "8px 10px",
              fontSize: 12, color: C.text,
              resize: "none", outline: "none", fontFamily: "inherit",
              lineHeight: 1.5,
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Main MovieCard component ─────────────────────────────────────────────────

export function MovieCard({
  event,
  mode,
  vote = null,
  canVote = true,
  groupYesCount,
  onVote,
}: MovieCardProps) {
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [vetoReason, setVetoReason] = useState("");
  const cardRef = useRef<HTMLDivElement>(null);

  const yesVoted = vote === "yes";
  const noVoted = vote === "no";

  // Border color by vote state (voting/readonly) or trailer open
  const borderColor =
    mode === "results" ? C.border
    : trailerOpen ? C.accent
    : yesVoted ? C.green
    : noVoted ? C.red
    : C.border;

  const cardOpacity = noVoted && mode !== "readonly" ? 0.7 : 1;

  function handleTrailerOpen() {
    setTrailerOpen(true);
  }

  function handleTrailerLoaded() {
    // Gap flagged in brief: scrollIntoView after iframe loads
    requestAnimationFrame(() => {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  function handleVote(v: MovieVote, reason?: string) {
    // Toggle yes off → abstain
    if (v === "yes" && vote === "yes") {
      onVote?.(event.id, "abstain");
      return;
    }
    // Switching away from no clears veto reason
    if (v !== "no") setVetoReason("");
    onVote?.(event.id, v, reason);
  }

  const posterSize = 54;

  return (
    <div
      ref={cardRef}
      style={{
        background: C.card,
        borderRadius: 16,
        border: `1px solid ${borderColor}`,
        overflow: "hidden",
        opacity: cardOpacity,
        transition: "border-color 0.2s, opacity 0.2s",
      }}
    >
      {/* ── readonly "YOUR PICK" top banner ─────────────────────── */}
      {mode === "readonly" && yesVoted && (
        <div style={{
          background: C.green, color: "#000",
          fontSize: 9, fontWeight: 800, letterSpacing: "0.05em",
          padding: "3px 10px", display: "block",
        }}>✓ YOUR PICK</div>
      )}

      {/* ── Main info row ────────────────────────────────────────── */}
      <div style={{ padding: trailerOpen ? "12px 14px 10px" : "14px", display: "flex", gap: 12 }}>
        {/* Poster column */}
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <Poster event={event} size={posterSize} />
          <div style={{
            background: C.accentDim, border: `1px solid ${C.accent}`,
            borderRadius: 6, padding: "2px 6px",
            fontSize: 9, fontWeight: 800, color: C.accent,
          }}>
            ★ {event.tmdb_rating?.toFixed(1) ?? "—"}
          </div>
        </div>

        {/* Text column */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 4, lineHeight: 1.2 }}>
            {event.title}
          </div>
          <MetaChips event={event} />

          {/* Show synopsis + genre tags when trailer is open or mode is readonly/info */}
          {(trailerOpen || mode === "readonly" || mode === "info") && (
            <>
              {event.synopsis && (
                <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5, marginTop: 4 }}>
                  {event.synopsis}
                </div>
              )}
              <GenreTags genres={event.genres} />
            </>
          )}

          {/* Genre tags always shown in voting mode when not trailer-open */}
          {!trailerOpen && mode === "voting" && (
            <GenreTags genres={event.genres} />
          )}

          {/* Trailer open: close button */}
          {trailerOpen && (
            <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
              <div
                onClick={() => setTrailerOpen(false)}
                style={{
                  background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 99, padding: "5px 12px",
                  display: "flex", alignItems: "center", gap: 6,
                  fontSize: 12, fontWeight: 700, color: C.text, cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 10 }}>✕</span> Close trailer
              </div>
            </div>
          )}

          {/* results mode: vote count on right side (handled below via flex) */}
          {mode === "results" && groupYesCount !== undefined && (
            <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 18, fontWeight: 900, color: C.accent }}>{groupYesCount}</span>
              <span style={{ fontSize: 11, color: C.textMuted }}>yes</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Trailer iframe (expanded) ─────────────────────────────── */}
      {trailerOpen && (
        <TrailerPlayer event={event} onLoad={handleTrailerLoaded} />
      )}

      {/* ── Watch Trailer button (collapsed) ──────────────────────── */}
      {!trailerOpen && (mode === "voting" || mode === "readonly" || mode === "info") && (
        <div style={{ padding: "0 14px 12px" }}>
          <div
            onClick={handleTrailerOpen}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: "9px", cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 12, color: C.accent }}>▶</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.textMuted }}>Watch Trailer</span>
          </div>
        </div>
      )}

      {/* ── Vote buttons (voting mode only) ───────────────────────── */}
      {mode === "voting" && (
        <div style={{ padding: "0 14px 14px" }}>
          <VoteRow
            eventId={event.id}
            vote={vote}
            canVote={canVote}
            trailerOpen={trailerOpen}
            vetoReason={vetoReason}
            onVetoReasonChange={setVetoReason}
            onVote={handleVote}
          />
        </div>
      )}
    </div>
  );
}
