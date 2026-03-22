import { useState, useEffect, useRef } from "react";
import { C, FS } from "../tokens";
import { VoterSession, VoterEvent, EventReview } from "../api/voter";
import { ShowtimeCard, SessionVote } from "./ShowtimeCard";
import { HelpIcon } from "./HelpIcon";

interface VoteTabProps {
  sessions: VoterSession[];
  events: VoterEvent[];
  votes: Record<string, string>;
  votedSessionCount: number;
  isParticipating: boolean;
  hasCompletedVoting: boolean;
  isFlexible: boolean;
  isEditing: boolean;
  pollId: number;
  onSessionVote: (sessionId: number, vote: SessionVote) => void;
  onSetFlexible: (flexible: boolean) => void;
  onJoin: () => void;
}

function formatDate(dateStr: string): string {
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
    <div style={{
      background: C.card,
      border: `1px solid ${isFlexible ? C.accent : C.border}`,
      borderRadius: 12, padding: "12px 14px",
      display: "flex", alignItems: "center", gap: 12,
      opacity: disabled ? 0.4 : 1,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: FS.md, fontWeight: 800, color: C.text, marginBottom: 3, display: "flex", alignItems: "center" }}>
          I'm In — Whatever You Choose!
          <HelpIcon title="Flexible voting" body="Turn this on if you're happy with whatever the group picks. You'll count as available for every option, giving them a boost." />
        </div>
        <div style={{ fontSize: FS.base, color: C.textMuted, lineHeight: 1.4 }}>
          Skip showtime voting and count yourself as available for every option.
        </div>
      </div>
      <div
        onClick={() => !disabled && onToggle()}
        style={{
          width: 44, height: 26, borderRadius: 99,
          background: isFlexible ? C.accent : C.borderLight,
          border: isFlexible ? "none" : `1px solid ${C.borderTap}`,
          boxSizing: "border-box",
          display: "flex", alignItems: "center",
          justifyContent: isFlexible ? "flex-end" : "flex-start",
          padding: "0 3px", flexShrink: 0,
          cursor: disabled ? "default" : "pointer",
          transition: "background 0.2s, border-color 0.2s",
        }}
      >
        <div style={{
          width: 20, height: 20, borderRadius: "50%",
          background: isFlexible ? "#000" : C.textMuted,
          transition: "background 0.2s",
        }} />
      </div>
    </div>
  );
}

// ─── Filter pill ──────────────────────────────────────────────────────────────

interface FilterPillProps {
  label: string;
  active: boolean;
  onClear: () => void;
  onClick: () => void;
}

function FilterPill({ label, active, onClear, onClick }: FilterPillProps) {
  return (
    <div
      onClick={active ? undefined : onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        background: active ? C.accentDim : C.surface,
        border: `1px solid ${active ? C.accent : C.border}`,
        borderRadius: 99, padding: "7px 14px",
        fontSize: FS.sm, fontWeight: 600,
        color: active ? C.accent : C.textMuted,
        cursor: "pointer", flexShrink: 0,
      }}
    >
      <span>{label}</span>
      {active && (
        <span
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          style={{ fontSize: 12, lineHeight: 1, color: C.accent, fontWeight: 900 }}
        >✕</span>
      )}
    </div>
  );
}

// ─── Bottom sheet picker ──────────────────────────────────────────────────────

interface PickerSheetProps {
  title: string;
  options: string[];
  selected: string | null;
  onSelect: (v: string | null) => void;
  onClose: () => void;
}

function PickerSheet({ title, options, selected, onSelect, onClose }: PickerSheetProps) {
  const [pressed, setPressed] = useState<string | null>(null);

  function handleSelect(val: string | null) {
    onSelect(val);
    onClose();
  }

  const allLabel = title.replace("Filter by ", "All ") + "s";

  const rows: { key: string; label: string; value: string | null }[] = [
    { key: "__all__", label: allLabel, value: null },
    ...options.map((o) => ({ key: o, label: o, value: o })),
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        zIndex: 200,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.card,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          border: `1px solid ${C.border}`, borderBottom: "none",
          width: "100%", maxWidth: 480, boxSizing: "border-box",
          display: "flex", flexDirection: "column",
          paddingBottom: 32,
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center",
          padding: "16px 20px 12px",
          borderBottom: `1px solid ${C.border}`,
        }}>
          <div style={{ flex: 1, fontSize: FS.md, fontWeight: 800, color: C.text }}>{title}</div>
          <div
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: "50%",
              background: C.surface, border: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, color: C.textMuted, cursor: "pointer",
            }}
          >✕</div>
        </div>

        {/* Option rows */}
        {rows.map((row, i) => {
          const isActive = row.value === selected;
          const isPressed = pressed === row.key;
          return (
            <div
              key={row.key}
              onPointerDown={() => setPressed(row.key)}
              onPointerUp={() => setPressed(null)}
              onPointerLeave={() => setPressed(null)}
              onClick={() => handleSelect(row.value)}
              style={{
                display: "flex", alignItems: "center",
                padding: "13px 20px",
                borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : "none",
                background: isPressed ? C.border : "transparent",
                cursor: "pointer",
                transition: "background 0.1s",
              }}
            >
              <span style={{
                flex: 1,
                fontSize: FS.base,
                fontWeight: isActive ? 700 : 400,
                color: isActive ? C.accent : C.text,
              }}>{row.label}</span>
              {isActive && (
                <span style={{ fontSize: 14, color: C.accent, fontWeight: 900 }}>✓</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── EventGroup ───────────────────────────────────────────────────────────────

interface EventGroupProps {
  event: VoterEvent;
  sessions: VoterSession[];
  votes: Record<string, string>;
  locked: boolean;
  submitted: boolean;
  isLocked: boolean;
  pollId: number;
  onSessionVote: (sessionId: number, vote: SessionVote) => void;
}

function EventGroup({ event, sessions, votes, locked, submitted, isLocked, onSessionVote, pollId }: EventGroupProps) {
  const hasConfirmedVote = sessions.some((s) => votes[`session:${s.id}`] === "can_do");
  const storageKey = `gg_collapsed_${pollId}_${event.id}`;

  const getInitialCollapsed = () => {
    const stored = localStorage.getItem(storageKey);
    if (stored !== null) return stored === "true";
    // Before votes load we don't know yet — default collapsed
    return true;
  };

  const [collapsed, setCollapsedState] = useState(getInitialCollapsed);
  const votesLoaded = useRef(false);

  // Once votes load for the first time, set collapsed based on whether
  // there's a selection — but only if the user hasn't manually toggled yet
  useEffect(() => {
    if (votesLoaded.current) return;
    if (Object.keys(votes).length === 0) return;
    votesLoaded.current = true;
    if (localStorage.getItem(storageKey) === null) {
      setCollapsedState(!hasConfirmedVote);
    }
  }, [votes, hasConfirmedVote, storageKey]);

  const setCollapsed = (val: boolean) => {
    localStorage.setItem(storageKey, String(val));
    setCollapsedState(val);
  };

  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);
  const [reviews, setReviews] = useState<EventReview[] | null>(null);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsOpen, setReviewsOpen] = useState(false);

  function loadReviews(e: React.MouseEvent) {
    e.stopPropagation();
    if (reviews !== null) { setReviewsOpen(!reviewsOpen); return; }
    setReviewsLoading(true);
    // Since we took getEventReviews from voterApi... we'll need to make sure we can import it
    import("../api/voter").then(({ voterApi }) => {
      voterApi.getEventReviews(event.id)
        .then((d) => { setReviews(d.reviews); setReviewsOpen(true); })
        .catch(() => setReviews([]))
        .finally(() => setReviewsLoading(false));
    });
  }

  const thumbnailUrl = event.poster_url ?? event.image_url ?? null;
  const isMovie = event.event_type === "movie";
  const synopsis = event.synopsis ?? "";
  const synopsisShort = synopsis.length > 180;

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 14, overflow: "hidden",
    }}>
      {/* Header */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 12px",
          cursor: "pointer",
          borderBottom: !collapsed ? `1px solid ${C.border}` : "none",
        }}
      >
        {thumbnailUrl && (
          <img
            src={thumbnailUrl}
            alt={event.title}
            style={{
              width: !collapsed ? 80 : 44, 
              height: !collapsed ? 120 : 64, 
              objectFit: "cover",
              borderRadius: !collapsed ? 12 : 8, flexShrink: 0,
              boxShadow: !collapsed ? "0 6px 16px rgba(0,0,0,0.4)" : "none",
              transition: "all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)"
            }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignSelf: !collapsed ? "flex-start" : "center" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div style={{ fontSize: !collapsed ? 18 : FS.md, fontWeight: 800, color: C.text, lineHeight: 1.3, marginBottom: !collapsed ? 4 : 0 }}>
              {event.title}
            </div>
          </div>
          {(event.year || event.runtime_mins || (!event.year && event.venue_name) || event.tmdb_rating) && (
            <div style={{ fontSize: FS.sm, color: C.textMuted, display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px 6px" }}>
               {isMovie && event.year && <span>{event.year}</span>}
               {isMovie && event.year && event.runtime_mins && <span>•</span>}
               {isMovie && event.runtime_mins && <span>{Math.floor(event.runtime_mins / 60)}h {event.runtime_mins % 60}m</span>}
               {isMovie && (event.year || event.runtime_mins) && event.tmdb_rating ? <span>•</span> : null}
               {isMovie && event.tmdb_rating ? <span style={{ color: C.accent, fontWeight: 700 }}>★ {event.tmdb_rating}</span> : null}
               {!isMovie && event.venue_name && <span>📍 {event.venue_name}</span>}
            </div>
          )}
          
          {/* Expanded view extra details */}
          {!collapsed && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", flex: 1 }}>
              {/* Genres */}
              {isMovie && event.genres && event.genres.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                  {event.genres.slice(0, 3).map((g) => (
                    <span key={g} style={{
                      fontSize: 10, fontWeight: 700, color: C.textDim,
                      border: `1px solid ${C.border}`, borderRadius: 99, padding: "2px 8px",
                      textTransform: "uppercase", letterSpacing: "0.05em"
                    }}>{g}</span>
                  ))}
                </div>
              )}

              {/* Synopsis */}
              {synopsis && (
                <div style={{ marginTop: "auto" }}>
                  <div style={{
                    fontSize: 13, color: C.textDim, lineHeight: 1.5,
                    overflow: "hidden", display: "-webkit-box",
                    WebkitLineClamp: synopsisExpanded ? undefined : 3,
                    WebkitBoxOrient: "vertical",
                  }}>
                    {synopsis}
                  </div>
                  {synopsisShort && !synopsisExpanded && (
                    <div
                      onClick={(e) => { e.stopPropagation(); setSynopsisExpanded(true); }}
                      style={{ fontSize: 12, color: C.accent, marginTop: 4, cursor: "pointer", fontWeight: 700 }}
                    >Read more</div>
                  )}
                </div>
              )}
            </div>
          )}

          {collapsed && (
            <div style={{ fontSize: FS.sm, color: C.textMuted, marginTop: 2 }}>
              {sessions.length} option{sessions.length !== 1 ? "s" : ""} · tap to vote
            </div>
          )}
        </div>
        <span style={{
          fontSize: 14, color: C.textMuted, flexShrink: 0,
          transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
          transition: "transform 0.2s",
          display: "inline-block",
        }}>▾</span>
      </div>

      {!collapsed && (
        <div style={{ padding: "0 12px 12px 12px", borderBottom: `1px solid ${C.border}` }}>
          {/* Button Row */}
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            {isMovie && event.trailer_key && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowTrailer(!showTrailer); }}
                style={{
                  flex: 1, background: showTrailer ? C.accentGlow : C.surface,
                  border: `1px solid ${showTrailer ? C.accentDim : C.border}`, color: showTrailer ? C.accent : C.text,
                  padding: "10px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer",
                  transition: "all 0.2s"
                }}
              >
                {showTrailer ? "Close Trailer" : "▶ Watch Trailer"}
              </button>
            )}
            {isMovie && (
              <button
                onClick={loadReviews}
                style={{
                  flex: 1, background: reviewsOpen ? C.accentGlow : C.surface,
                  border: `1px solid ${reviewsOpen ? C.accentDim : C.border}`, color: reviewsOpen ? C.accent : C.text,
                  padding: "10px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer",
                  transition: "all 0.2s"
                }}
              >
                {reviewsLoading ? "..." : reviewsOpen ? "Hide Reviews" : "Read Reviews"}
              </button>
            )}
            {!isMovie && event.external_url && (
               <a
                 href={event.external_url} target="_blank" rel="noopener noreferrer"
                 onClick={(e) => e.stopPropagation()}
                 style={{
                   flex: 1, background: C.surface, border: `1px solid ${C.border}`, color: C.accent,
                   padding: "10px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer",
                   textAlign: "center", textDecoration: "none"
                 }}
               >More Info ↗</a>
            )}
          </div>

          {/* Trailer Expand */}
          {showTrailer && event.trailer_key && (
            <div style={{ position: "relative", paddingBottom: "56.25%", borderRadius: 12, overflow: "hidden", background: "#000", marginTop: 12 }}>
              <iframe
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
                src={`https://www.youtube.com/embed/${event.trailer_key}?autoplay=1&rel=0`}
                allow="autoplay; encrypted-media" allowFullScreen
              />
            </div>
          )}

          {/* Reviews Expand */}
          {reviewsOpen && reviews && reviews.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, background: C.surface, padding: 12, borderRadius: 12, border: `1px solid ${C.border}`, marginTop: 12 }}>
              {reviews.map((r, i) => (
                <div key={i} style={{ paddingBottom: i < reviews.length - 1 ? 12 : 0, borderBottom: i < reviews.length - 1 ? `1px solid ${C.border}` : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{r.author}</span>
                    {r.rating != null && <span style={{ fontSize: 13, color: C.accent, fontWeight: 700 }}>★ {r.rating}</span>}
                  </div>
                  <div style={{ fontSize: 13, color: C.textDim, lineHeight: 1.5 }}>"{r.excerpt}"</div>
                </div>
              ))}
            </div>
          )}
          {reviewsOpen && reviews && reviews.length === 0 && (
            <div style={{ fontSize: 13, color: C.textMuted, textAlign: "center", padding: 12, background: C.surface, borderRadius: 12, marginTop: 12 }}>No reviews found for this movie.</div>
          )}
        </div>
      )}

      {/* Sessions grouped by date — inline if only 1 session, accordion otherwise */}
      {!collapsed && (() => {
        if (sessions.length === 1) {
          const session = sessions[0];
          const rawVote = votes[`session:${session.id}`] as SessionVote | undefined;
          return (
            <div>
              <div style={{
                padding: "7px 12px 6px",
                background: C.surface,
                borderTop: `1px solid ${C.border}`,
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                  background: rawVote === "can_do" ? C.accent : C.textDim,
                  display: "inline-block",
                }} />
                <span style={{ flex: 1, fontSize: FS.sm, fontWeight: 700, color: C.text }}>{formatDate(session.session_date)}</span>
              </div>
              <div style={{ borderTop: `1px solid ${C.border}` }}>
                <ShowtimeCard
                  session={session}
                  event={event}
                  eventTitle=""
                  vote={rawVote ?? null}
                  locked={locked}
                  submitted={submitted}
                  isLocked={isLocked}
                  onVote={onSessionVote}
                />
              </div>
            </div>
          );
        }
        const byDate = new Map<string, VoterSession[]>();
        for (const s of sessions) {
          const arr = byDate.get(s.session_date) ?? [];
          arr.push(s);
          byDate.set(s.session_date, arr);
        }
        const dates = Array.from(byDate.keys()).sort();
        return (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {dates.map((date) => {
              const dateSessions = byDate.get(date) ?? [];
              const selectedCount = dateSessions.filter(
                (s) => votes[`session:${s.id}`] === "can_do"
              ).length;
              return (
              <div key={date}>
                <div style={{
                  padding: "7px 12px 6px",
                  background: C.surface,
                  borderTop: `1px solid ${C.border}`,
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                    background: selectedCount > 0 ? C.accent : C.textDim,
                    display: "inline-block",
                  }} />
                  <span style={{
                    flex: 1,
                    fontSize: FS.sm, fontWeight: 700, color: C.text,
                  }}>{formatDate(date)}</span>
                  <span style={{
                    fontSize: FS.xs, color: C.textDim, fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}>{selectedCount} of {dateSessions.length} selected</span>
                </div>
                {(byDate.get(date) ?? []).map((session) => {
                  const rawVote = votes[`session:${session.id}`] as SessionVote | undefined;
                  return (
                    <div key={session.id} style={{ borderTop: `1px solid ${C.border}` }}>
                      <ShowtimeCard
                        session={session}
                        event={event}
                        eventTitle=""
                        vote={rawVote ?? null}
                        locked={locked}
                        submitted={submitted}
                        isLocked={isLocked}
                        onVote={onSessionVote}
                      />
                    </div>
                  );
                })}
              </div>
            );})}
          </div>
        );
      })()}
    </div>
  );
}

// ─── VoteTab ──────────────────────────────────────────────────────────────────

export function VoteTab({
  sessions,
  events,
  votes,
  votedSessionCount,
  isParticipating,
  hasCompletedVoting,
  isFlexible,
  isEditing,
  pollId,
  onSessionVote,
  onSetFlexible,
  onJoin,
}: VoteTabProps) {
  const [locationFilter, setLocationFilter] = useState<string | null>(null);
  const [eventFilter, setEventFilter] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<string | null>(null);
  const [openPicker, setOpenPicker] = useState<"event" | "location" | "date" | null>(null);

  const isSubmitted = hasCompletedVoting && !isEditing;
  const cardLocked = !isParticipating;

  // Event lookup map — must be defined before filters
  const eventMap = new Map(events.map((e) => [e.id, e]));

  // Unique filter options
  const eventOptions = Array.from(new Set(events.map((e) => e.title))).sort();
  const locationOptions = Array.from(new Set(sessions.map((s) => {
    const ev = eventMap.get(s.event_id);
    return ev && !ev.is_movie ? (ev.venue_name ?? "") : s.theater_name;
  }).filter((v) => v !== ""))).sort();
  const dateOptions = Array.from(new Set(sessions.map((s) => s.session_date))).sort()
    .map((d) => formatDate(d));
  const dateOptionMap = Object.fromEntries(
    Array.from(new Set(sessions.map((s) => s.session_date))).sort()
      .map((d) => [formatDate(d), d])
  );

  // Apply filters
  const filteredSessions = sessions.filter((s) => {
    if (locationFilter) {
      const ev = eventMap.get(s.event_id);
      const locLabel = ev && !ev.is_movie ? (ev.venue_name ?? "") : s.theater_name;
      if (locLabel !== locationFilter) return false;
    }
    if (eventFilter) {
      const ev = events.find((e) => e.id === s.event_id);
      if (!ev || ev.title !== eventFilter) return false;
    }
    if (dateFilter && s.session_date !== dateOptionMap[dateFilter]) return false;
    return true;
  });
  const sessionsByEvent = new Map<number, VoterSession[]>();
  for (const s of filteredSessions) {
    const arr = sessionsByEvent.get(s.event_id) ?? [];
    arr.push(s);
    sessionsByEvent.set(s.event_id, arr);
  }
  const eventOrder = events.map((e) => e.id).filter((id) => sessionsByEvent.has(id));

  const activeFilterCount = [locationFilter, eventFilter, dateFilter].filter(Boolean).length;

  return (
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>

      {/* ── Preview join nudge ────────────────────────────────────── */}
      {!isParticipating && (
        <div style={{
          background: C.card, border: `1px solid ${C.accent}`,
          borderRadius: 12, padding: "10px 14px",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>👋</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: FS.md, fontWeight: 800, color: C.accent, marginBottom: 2 }}>
              You're not in the vote yet
            </div>
            <div style={{ fontSize: FS.base, color: C.textMuted }}>
              Join to influence these standings.
            </div>
          </div>
          <div
            onClick={onJoin}
            style={{
              background: C.accent, color: "#000", fontSize: FS.base, fontWeight: 700,
              padding: "10px 18px", borderRadius: 8, cursor: "pointer", flexShrink: 0,
            }}
          >Join</div>
        </div>
      )}

      {/* ── Submitted info card ──────────────────────────────────── */}
      {isSubmitted && (
        <div style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: "12px 14px",
          display: "flex", alignItems: "flex-start", gap: 10,
        }}>
          <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>🔒</span>
          <div>
            <div style={{ fontSize: FS.base, fontWeight: 700, color: C.text, lineHeight: 1.4 }}>
              Your vote is locked in
            </div>
            <div style={{ fontSize: FS.sm, color: C.textMuted, marginTop: 3, lineHeight: 1.4 }}>
              Tap ✓ DONE above to change your selections or opt out.
            </div>
          </div>
        </div>
      )}

      {/* ── Stat bar ─────────────────────────────────────────────── */}
      <div style={{
        padding: "4px 0 6px",
        borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: FS.base, color: C.textMuted, flex: 1 }}>
          {isFlexible ? "Flexible mode — all options" : "Select what works for you"}
        </span>
        {votedSessionCount > 0 && !isFlexible && (
          <span style={{ fontSize: FS.base, color: C.green, fontWeight: 700 }}>
            {votedSessionCount} confirmed
          </span>
        )}
      </div>

      {/* ── Filter bar ───────────────────────────────────────────── */}
      {!isFlexible && (
        <div style={{ display: "flex", gap: 6, flexWrap: "nowrap", overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 2, scrollbarWidth: "none" }}>
          <FilterPill
            label={eventFilter ? `Event: ${eventFilter}` : "Event"}
            active={!!eventFilter}
            onClear={() => setEventFilter(null)}
            onClick={() => setOpenPicker("event")}
          />
          <FilterPill
            label={locationFilter ? `Location: ${locationFilter}` : "Location"}
            active={!!locationFilter}
            onClear={() => setLocationFilter(null)}
            onClick={() => setOpenPicker("location")}
          />
          <FilterPill
            label={dateFilter ?? "Date"}
            active={!!dateFilter}
            onClear={() => setDateFilter(null)}
            onClick={() => setOpenPicker("date")}
          />
          {activeFilterCount > 0 && (
            <div
              onClick={() => { setEventFilter(null); setLocationFilter(null); setDateFilter(null); }}
              style={{
                fontSize: FS.sm, color: C.textMuted, padding: "7px 10px",
                cursor: "pointer", alignSelf: "center",
              }}
            >Clear all</div>
          )}
        </div>
      )}

      {/* ── Editing hint ─────────────────────────────────────────── */}
      {isEditing && (
        <div style={{
          background: "#3D2A00",
          border: "1px solid #E8A020",
          borderRadius: 10,
          padding: "8px 12px",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontSize: 14 }}>✏️</span>
          <span style={{ fontSize: FS.base, color: "#E8A020", fontWeight: 700 }}>
            Editing — hit Resubmit when done
          </span>
        </div>
      )}

      {/* ── Flexible toggle ──────────────────────────────────────── */}
      <FlexibleToggle
        isFlexible={isFlexible}
        disabled={!isParticipating || isSubmitted}
        onToggle={() => onSetFlexible(!isFlexible)}
      />

      {/* ── Flexible confirmation ─────────────────────────────────── */}
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
            Your vote counts as approval for every option.
            You're all set unless you want to turn flexible mode back off.
          </div>
        </div>
      )}

      {/* ── Event groups ─────────────────────────────────────────── */}
      {!isFlexible && eventOrder.map((eventId) => {
        const event = eventMap.get(eventId);
        if (!event) return null;
        const eventSessions = sessionsByEvent.get(eventId) ?? [];
        return (
          <EventGroup
            key={eventId}
            event={event}
            sessions={eventSessions}
            votes={votes}
            locked={cardLocked}
            submitted={isSubmitted}
            isLocked={isSubmitted}
            pollId={pollId}
            onSessionVote={onSessionVote}
          />
        );
      })}

      {/* ── Empty state ───────────────────────────────────────────── */}
      {!isFlexible && eventOrder.length === 0 && (
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 14, padding: "32px 20px", textAlign: "center",
        }}>
          <div style={{ fontSize: 13, color: C.textMuted }}>
            {activeFilterCount > 0
              ? "No options match the current filters."
              : "No vote options yet."}
          </div>
        </div>
      )}

      {/* ── Filter pickers ───────────────────────────────────────── */}
      {openPicker === "event" && (
        <PickerSheet
          title="Filter by event"
          options={eventOptions}
          selected={eventFilter}
          onSelect={setEventFilter}
          onClose={() => setOpenPicker(null)}
        />
      )}
      {openPicker === "location" && (
        <PickerSheet
          title="Filter by location"
          options={locationOptions}
          selected={locationFilter}
          onSelect={setLocationFilter}
          onClose={() => setOpenPicker(null)}
        />
      )}
      {openPicker === "date" && (
        <PickerSheet
          title="Filter by date"
          options={dateOptions}
          selected={dateFilter}
          onSelect={setDateFilter}
          onClose={() => setOpenPicker(null)}
        />
      )}
    </div>
  );
}
