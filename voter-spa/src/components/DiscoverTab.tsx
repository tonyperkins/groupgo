import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { C, FS } from "../tokens";
import { VoterEvent, VoterSession, EventReview, voterApi } from "../api/voter";

interface DiscoverTabProps {
  events: VoterEvent[];
  sessions?: VoterSession[];
  isParticipating: boolean;
  hasCompletedVoting: boolean;
  joinUrl?: string | null;
}

// ─── Event Info Panel ─────────────────────────────────────────────────────────

function EventTypebadge({ type }: { type: string }) {
  const label = type === "movie" ? "🎬 Movie"
    : type === "concert" ? "🎵 Concert"
    : type === "restaurant" ? "🍽️ Restaurant"
    : type === "bar" ? "🍺 Bar"
    : `📍 ${type.charAt(0).toUpperCase() + type.slice(1)}`;
  return (
    <span style={{
      fontSize: FS.sm, fontWeight: 700, letterSpacing: "0.06em",
      color: C.accent, background: C.accentDim,
      borderRadius: 6, padding: "3px 8px",
      whiteSpace: "nowrap", flexShrink: 0,
    }}>{label}</span>
  );
}

function fmt12h(time24: string): string {
  const [hStr, mStr] = time24.split(":");
  const h = parseInt(hStr, 10);
  const m = mStr ?? "00";
  return `${h % 12 || 12}:${m} ${h < 12 ? "AM" : "PM"}`;
}

function fmtDate(dateStr: string): string {
  try {
    return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
    });
  } catch { return dateStr; }
}

interface EventCardProps {
  event: VoterEvent;
  sessions?: VoterSession[];
  joinUrl?: string | null;
}

function EventCard({ event, sessions, joinUrl }: EventCardProps) {
  const eventSessions = (sessions ?? []).filter(s => s.event_id === event.id);

  // Group sessions by date
  const byDate = eventSessions.reduce<Record<string, VoterSession[]>>((acc, s) => {
    (acc[s.session_date] = acc[s.session_date] ?? []).push(s);
    return acc;
  }, {});
  const sortedDates = Object.keys(byDate).sort();
  const [showtimesOpen, setShowtimesOpen] = useState(false);
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);
  const [reviews, setReviews] = useState<EventReview[] | null>(null);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsOpen, setReviewsOpen] = useState(false);

  const isMovie = event.event_type === "movie";
  const synopsis = event.synopsis ?? "";
  const synopsisShort = synopsis.length > 180;

  function loadReviews() {
    if (reviews !== null) { setReviewsOpen(!reviewsOpen); return; }
    setReviewsLoading(true);
    voterApi.getEventReviews(event.id)
      .then((d) => { setReviews(d.reviews); setReviewsOpen(true); })
      .catch(() => setReviews([]))
      .finally(() => setReviewsLoading(false));
  }

  const imageUrl = event.poster_url ?? event.image_url ?? null;

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 16, overflow: "hidden",
    }}>
      {/* Banner / poster */}
      {imageUrl && (
        <div style={{
          width: "100%", aspectRatio: isMovie ? "2/3" : "16/7",
          maxHeight: isMovie ? 280 : 160,
          overflow: "hidden", flexShrink: 0,
          background: C.surface,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <img
            src={imageUrl}
            alt={event.title}
            style={{
              width: "100%", height: "100%",
              objectFit: isMovie ? "cover" : "cover",
            }}
          />
        </div>
      )}

      <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Title + badge */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: FS.xl, fontWeight: 900, color: C.text, lineHeight: 1.2 }}>
              {event.title}
            </div>
            {isMovie && event.year && (
              <div style={{ fontSize: FS.base, color: C.textMuted, marginTop: 2 }}>
                {event.year}
                {event.runtime_mins && ` · ${Math.floor(event.runtime_mins / 60)}h ${event.runtime_mins % 60}m`}
                {event.rating && ` · ${event.rating}`}
              </div>
            )}
            {!isMovie && event.venue_name && (
              <div style={{ fontSize: FS.base, color: C.textMuted, marginTop: 2 }}>
                📍 {event.venue_name}
              </div>
            )}
          </div>
          <EventTypebadge type={event.event_type} />
        </div>

        {/* TMDB rating + genres (movies) */}
        {isMovie && (
          <div style={{ display: "flex", flexWrap: "nowrap", overflowX: "auto", gap: 6, alignItems: "center", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
            {event.tmdb_rating != null && event.tmdb_rating > 0 && (
              <span style={{
                fontSize: FS.sm, fontWeight: 700, color: C.accent,
                background: C.accentDim, borderRadius: 6, padding: "4px 10px",
                flexShrink: 0,
              }}>⭐ {event.tmdb_rating.toFixed(1)}</span>
            )}
            {event.genres.slice(0, 4).map((g) => (
              <span key={g} style={{
                fontSize: FS.sm, color: C.textMuted, border: `1px solid ${C.border}`,
                borderRadius: 99, padding: "4px 10px", flexShrink: 0,
              }}>{g}</span>
            ))}
          </div>
        )}

        {/* Synopsis / description */}
        {synopsis && (
          <div>
            <div style={{
              fontSize: FS.base, color: C.textMuted, lineHeight: 1.6,
              overflow: "hidden",
              WebkitLineClamp: synopsisExpanded ? undefined : 3,
              display: synopsisExpanded ? "block" : "-webkit-box",
              WebkitBoxOrient: "vertical",
            }}>
              {synopsis}
            </div>
            {synopsisShort && (
              <div
                onClick={() => setSynopsisExpanded(!synopsisExpanded)}
                style={{ fontSize: FS.sm, color: C.accent, marginTop: 4, cursor: "pointer", fontWeight: 600 }}
              >
                {synopsisExpanded ? "Show less" : "Read more"}
              </div>
            )}
          </div>
        )}

        {/* External URL (non-movies) */}
        {!isMovie && event.external_url && (
          <a
            href={event.external_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: 16, color: C.accent, fontWeight: 600,
              textDecoration: "none",
            }}
          >More Info →</a>
        )}

        {/* Trailer + Reviews buttons (movies) */}
        {isMovie && (
          <div style={{ display: "flex", gap: 8 }}>
            {event.trailer_key && (
              <div
                onClick={() => setShowTrailer(!showTrailer)}
                style={{
                  flex: 1, background: showTrailer ? C.accentDim : C.surface,
                  border: `1px solid ${showTrailer ? C.accent : C.border}`,
                  borderRadius: 8, padding: "9px 12px",
                  fontSize: FS.base, fontWeight: 700, color: showTrailer ? C.accent : C.text,
                  textAlign: "center", cursor: "pointer",
                }}
              >{showTrailer ? "▶ Hide Trailer" : "▶ Watch Trailer"}</div>
            )}
            <div
              onClick={loadReviews}
              style={{
                flex: 1, background: reviewsOpen ? C.accentDim : C.surface,
                border: `1px solid ${reviewsOpen ? C.accent : C.border}`,
                borderRadius: 8, padding: "9px 12px",
                fontSize: FS.base, fontWeight: 700, color: reviewsOpen ? C.accent : C.text,
                textAlign: "center", cursor: "pointer",
              }}
            >{reviewsLoading ? "…" : reviewsOpen ? "Hide Reviews" : "Reviews"}</div>
          </div>
        )}

        {/* Trailer iframe */}
        {showTrailer && event.trailer_key && (
          <div style={{
            position: "relative", paddingBottom: "56.25%",
            borderRadius: 10, overflow: "hidden",
          }}>
            <iframe
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
              src={`https://www.youtube.com/embed/${event.trailer_key}?autoplay=1&rel=0`}
              allow="autoplay; encrypted-media"
              allowFullScreen
            />
          </div>
        )}

        {/* Showtimes collapsible card — shown when sessions are available */}
        {eventSessions.length > 0 && (
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 10, overflow: "hidden",
          }}>
            {/* Toggle header */}
            <div
              onClick={() => setShowtimesOpen(o => !o)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "9px 12px", cursor: "pointer",
                borderBottom: showtimesOpen ? `1px solid ${C.border}` : "none",
              }}
            >
              <span style={{
                fontSize: FS.base, fontWeight: 800, letterSpacing: "0.1em", color: C.textMuted,
              }}>SHOWTIMES</span>
              <span style={{ fontSize: FS.sm, color: C.textDim }}>
                {eventSessions.length} time{eventSessions.length !== 1 ? "s" : ""} &nbsp;{showtimesOpen ? "▴" : "▾"}
              </span>
            </div>

            {/* Expanded body */}
            {showtimesOpen && (
              <>
                {sortedDates.map(date => (
                  <div key={date} style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: FS.md, fontWeight: 700, color: C.text, marginBottom: 6 }}>
                      {fmtDate(date)}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {byDate[date].map(s => (
                        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "nowrap" }}>
                          <span style={{ fontSize: FS.md, fontWeight: 700, color: C.accent, flexShrink: 0, minWidth: 76 }}>
                            {fmt12h(s.session_time)}
                          </span>
                          <span style={{ fontSize: FS.base, color: C.textMuted, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s.theater_name}
                          </span>
                          {s.format !== "Standard" && (
                            <span style={{
                              flexShrink: 0, fontSize: FS.sm, fontWeight: 700, letterSpacing: "0.06em",
                              color: C.accent, background: C.accentDim,
                              borderRadius: 4, padding: "2px 6px", whiteSpace: "nowrap",
                            }}>{s.format}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {joinUrl && (
                  <a
                    href={joinUrl}
                    style={{
                      display: "block", textAlign: "center",
                      padding: "11px 12px",
                      fontSize: 16, fontWeight: 700,
                      color: C.accent, textDecoration: "none",
                      background: C.accentGlow,
                    }}
                  >
                    🎟️ Enter PIN to pick your showtimes →
                  </a>
                )}
              </>
            )}
          </div>
        )}

        {/* Reviews */}
        {reviewsOpen && reviews && reviews.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {reviews.map((r, i) => (
              <div key={i} style={{
                background: C.surface, borderRadius: 10, padding: "10px 12px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{r.author}</span>
                  {r.rating != null && (
                    <span style={{ fontSize: 13, color: C.accent }}>⭐ {r.rating}/10</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.5 }}>{r.excerpt}</div>
              </div>
            ))}
          </div>
        )}
        {reviewsOpen && reviews && reviews.length === 0 && (
          <div style={{ fontSize: 13, color: C.textMuted, textAlign: "center" }}>No reviews found.</div>
        )}
      </div>
    </div>
  );
}

// ─── DiscoverTab ──────────────────────────────────────────────────────────────

export function DiscoverTab({ events, sessions, isParticipating: _isParticipating, hasCompletedVoting: _hasCompletedVoting, joinUrl }: DiscoverTabProps) {
  const navigate = useNavigate();
  const isBrowse = !!joinUrl;

  if (events.length === 0) {
    return (
      <div style={{ padding: "48px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
        <div style={{ fontSize: 16, color: C.textMuted }}>No events yet</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header hint */}
      <div style={{
        padding: "6px 0 8px", borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 13, color: C.textMuted, flex: 1 }}>
          {events.length} event{events.length !== 1 ? "s" : ""}
          {isBrowse ? " · browse showtimes, then join to vote" : " · browse, then vote on the Vote tab"}
        </span>
        {!isBrowse && (
          <div
            onClick={() => navigate("/vote/vote")}
            style={{ fontSize: 13, fontWeight: 700, color: C.accent, cursor: "pointer" }}
          >Vote →</div>
        )}
      </div>

      {events.map((event) => (
        <EventCard key={event.id} event={event} sessions={sessions} joinUrl={joinUrl} />
      ))}
    </div>
  );
}
