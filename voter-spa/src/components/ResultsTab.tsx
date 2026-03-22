import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { C } from "../tokens";
import { voterApi, ResultsResponse, ResultsEntry, VoterSession, VoterEvent } from "../api/voter";
import { HelpIcon } from "./HelpIcon";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt12h(time24: string): string {
  const [hStr, mStr] = time24.split(":");
  const h = parseInt(hStr, 10);
  const m = mStr ?? "00";
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${period}`;
}

function fmtDate(dateStr: string): string {
  try {
    return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

const avatarColors = ["#22C55E", "#F59E0B", "#3B82F6", "#8B5CF6", "#EF4444", "#EC4899"];

// ─── Group progress panel ────────────────────────────────────────────────────

interface GroupProgressProps {
  voters: { name: string; fully_voted: boolean }[];
  totalVoters: number;
  fullyVoted: number;
}

function GroupProgress({ voters, totalVoters, fullyVoted }: GroupProgressProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 14, overflow: "hidden",
    }}>
      {/* Header row */}
      <div
        onClick={() => setExpanded((x) => !x)}
        style={{
          padding: "12px 14px", display: "flex", alignItems: "center", gap: 10,
          cursor: "pointer",
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 800, color: C.text, flex: 1 }}>
          Who's voted
        </span>
        {/* Stacked avatar row */}
        <div style={{ display: "flex" }}>
          {voters.map((v, i) => {
            const color = v.fully_voted ? avatarColors[i % avatarColors.length] : C.border;
            return (
              <div key={i} style={{
                width: 24, height: 24, borderRadius: "50%",
                background: color,
                border: `2px solid ${C.card}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 800,
                color: v.fully_voted ? "#000" : C.textDim,
                marginLeft: i > 0 ? -6 : 0,
                zIndex: voters.length - i,
                position: "relative",
              }}>{v.name[0].toUpperCase()}</div>
            );
          })}
        </div>
        <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 6 }}>
          {fullyVoted}/{totalVoters} voted {expanded ? "▴" : "▾"}
        </span>
      </div>

      {/* Expanded pill list */}
      {expanded && (
        <div style={{ padding: "0 14px 12px", display: "flex", flexWrap: "wrap", gap: 6 }}>
          {voters.map((v, i) => {
            const color = v.fully_voted ? avatarColors[i % avatarColors.length] : C.border;
            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 6,
                background: v.fully_voted ? color + "18" : C.surface,
                borderRadius: 99, padding: "4px 10px",
                border: `1px solid ${v.fully_voted ? color + "60" : C.border}`,
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: "50%",
                  background: color,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontWeight: 800,
                  color: v.fully_voted ? "#000" : C.textDim,
                }}>{v.name[0].toUpperCase()}</div>
                <span style={{ fontSize: 13, fontWeight: 700, color: v.fully_voted ? C.text : C.textDim }}>
                  {v.name}
                </span>
                {!v.fully_voted && (
                  <span style={{ fontSize: 12, color: C.textDim }}>· pending</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Ranked result card ───────────────────────────────────────────────────────

interface RankedCardProps {
  entry: ResultsEntry;
  totalVoters: number;
  isMyPick: boolean;
  isTop: boolean;
  showAllFilter: boolean;
  runtimeMins?: number | null;
}

function RankedCard({ entry, totalVoters, isMyPick, isTop, showAllFilter, runtimeMins }: RankedCardProps) {
  const highlight = isTop && showAllFilter;
  const borderColor = isMyPick ? C.green : highlight ? C.accent : C.border;
  const barColor = highlight ? C.accent : isMyPick ? C.green : C.borderLight;

  return (
    <div style={{
      background: highlight
        ? `linear-gradient(135deg, rgba(232,160,32,0.1), ${C.card})`
        : C.card,
      border: `1px solid ${borderColor}`,
      borderRadius: 14, padding: "12px 14px",
      position: "relative", overflow: "hidden",
    }}>
      {/* MY PICK ribbon — top-right corner */}
      {isMyPick && (
        <div style={{
          position: "absolute", top: 0, right: 0,
          background: C.green, color: "#000",
          fontSize: 9, fontWeight: 800, letterSpacing: "0.05em",
          padding: "3px 8px", borderBottomLeftRadius: 8,
        }}>MY PICK</div>
      )}

      {/* Main row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        {/* Rank badge */}
        <div style={{
          width: 26, height: 26, borderRadius: 8, flexShrink: 0,
          background: highlight ? C.accent : C.surface,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 900,
          color: highlight ? "#000" : C.textMuted,
        }}>#{entry.rank}</div>

        {/* Title + detail */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 1 }}>
            {entry.event.title}
          </div>
          <div style={{ fontSize: 15, color: C.textMuted }}>
            {fmt12h(entry.session.session_time)} · {entry.event.is_movie ? entry.session.theater_name : (entry.event.venue_name ?? entry.session.theater_name)}
            {entry.event.is_movie && runtimeMins && ` · ${runtimeMins} min`}
            {entry.event.is_movie && entry.session.format !== "Standard" && (
              <span style={{
                marginLeft: 6, fontSize: 12, fontWeight: 700,
                color: C.accent, background: C.accentDim,
                borderRadius: 4, padding: "1px 5px",
              }}>{entry.session.format}</span>
            )}
          </div>
          <div style={{ fontSize: 14, color: C.textDim, marginTop: 1 }}>
            {fmtDate(entry.session.session_date)}
          </div>
        </div>

        {/* Score */}
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{
            fontSize: 18, fontWeight: 900,
            color: highlight ? C.accent : C.textMuted,
          }}>
            {entry.voter_count}
            <span style={{ fontSize: 12, color: C.textDim, fontWeight: 400 }}>
              {" "}/ {totalVoters}
            </span>
          </div>
          <div style={{ fontSize: 13, color: C.textDim }}>members</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{
        height: 3, background: C.border, borderRadius: 99,
        overflow: "hidden", marginBottom: 10,
      }}>
        <div style={{
          height: "100%", borderRadius: 99,
          width: `${totalVoters > 0 ? (entry.voter_count / totalVoters) * 100 : 0}%`,
          background: barColor,
        }} />
      </div>

      {/* Voter initials bubbles */}
      {entry.voter_names.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          {entry.voter_names.map((name, j) => {
            const color = avatarColors[j % avatarColors.length];
            return (
              <div key={j} title={name} style={{
                width: 26, height: 26, borderRadius: "50%",
                background: color,
                border: `2px solid ${C.card}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 800, color: "#000",
                flexShrink: 0,
              }}>{name[0]?.toUpperCase()}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Live pulse dot ───────────────────────────────────────────────────────────

const pulseStyle = `
@keyframes gg-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
@keyframes gg-flash {
  0% { opacity: 1; background: #fff; }
  100% { opacity: 1; background: #E8A020; }
}
.gg-pulse-dot { animation: gg-pulse 2s ease-in-out infinite; }
.gg-pulse-dot.flash { animation: gg-flash 0.5s ease-out forwards; }
`;

function LiveDot({ flashing }: { flashing: boolean }) {
  return (
    <>
      <style>{pulseStyle}</style>
      <span
        className={`gg-pulse-dot${flashing ? " flash" : ""}`}
        style={{
          display: "inline-block",
          width: 8, height: 8, borderRadius: "50%",
          background: C.accent, flexShrink: 0,
        }}
      />
    </>
  );
}

// ─── ResultsTab ───────────────────────────────────────────────────────────────

interface ResultsTabProps {
  isParticipating: boolean;
  hasCompletedVoting: boolean;
  isEditing?: boolean;
  onJoin: () => void;
  onSubmitVote?: () => Promise<void> | void;
  onCancelEdit?: () => void;
  sessions?: VoterSession[];
  events?: VoterEvent[];
}

const POLL_INTERVAL_MS = 15_000;

export function ResultsTab({ isParticipating, hasCompletedVoting, isEditing = false, onJoin, onSubmitVote, onCancelEdit, sessions = [], events = [] }: ResultsTabProps) {
  const navigate = useNavigate();
  const [data, setData] = useState<ResultsResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const [standingsCollapsed, setStandingsCollapsed] = useState(true);
  const [dotFlashing, setDotFlashing] = useState(false);
  const prevResultsRef = useRef<string>("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function fetchResults() {
    voterApi.getResultsJson()
      .then((d) => {
        const newKey = JSON.stringify(d.results.map((r) => `${r.event.id}:${r.session.id}:${r.score}`));
        if (prevResultsRef.current && prevResultsRef.current !== newKey) {
          setDotFlashing(true);
          setTimeout(() => setDotFlashing(false), 600);
        }
        prevResultsRef.current = newKey;
        setData(d);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }

  useEffect(() => {
    fetchResults();
    intervalRef.current = setInterval(fetchResults, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  useEffect(() => { fetchResults(); }, [isParticipating]);

  useEffect(() => {
    if (hasCompletedVoting && !isEditing) setStandingsCollapsed(false);
  }, [hasCompletedVoting, isEditing]);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (!data && !loadError) {
    return (
      <div style={{ padding: "48px 20px", textAlign: "center" }}>
        <div style={{ color: C.textMuted, fontSize: 15 }}>Loading results…</div>
      </div>
    );
  }

  if (loadError && !data) {
    return (
      <div style={{ padding: "48px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
        <div style={{ color: C.text, fontWeight: 700, marginBottom: 6 }}>Could not load results</div>
        <div
          onClick={fetchResults}
          style={{
            marginTop: 16, display: "inline-block",
            background: C.accent, color: "#000", fontWeight: 700,
            borderRadius: 10, padding: "8px 20px", cursor: "pointer", fontSize: 15,
          }}
        >Retry</div>
      </div>
    );
  }

  const d = data!;
  const { participation, results, no_valid_options, has_any_votes, personal_pick_keys, poll_status } = d;
  const isClosed = poll_status === "CLOSED";
  const winner = isClosed && results.length > 0 ? results[0] : null;
  const pickKeySet = new Set(personal_pick_keys);
  const totalVoters = participation.total_voters;
  const hasSubmitted = hasCompletedVoting && !isEditing;
  const hasAnySelections = personal_pick_keys.length > 0;

  function isMyPick(entry: ResultsEntry): boolean {
    return pickKeySet.has(`${entry.event.id}:${entry.session.id}`);
  }

  const filtered = filter === "mine" ? results.filter(isMyPick) : results;
  const isEmpty = results.length === 0;

  const winnerEventFull = winner ? events.find((e) => e.id === winner.event.id) : null;
  const winnerPosterUrl = winnerEventFull?.poster_url ?? winnerEventFull?.image_url;

  return (
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>

      {/* ── Preview-mode join CTA ────────────────────────────────── */}
      {!isParticipating && (
        <div style={{
          background: C.card, border: `1px solid ${C.accent}`,
          borderRadius: 12, padding: "10px 14px",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>👋</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.accent, marginBottom: 2 }}>You're not in the vote yet</div>
            <div style={{ fontSize: 15, color: C.textMuted }}>Join to influence these standings.</div>
          </div>
          <div onClick={onJoin} style={{
            background: C.accent, color: "#000", fontSize: 14, fontWeight: 700,
            padding: "6px 14px", borderRadius: 8, cursor: "pointer", flexShrink: 0,
          }}>Join</div>
        </div>
      )}

      {/* ── Poll-closed banner ───────────────────────────────────── */}
      {isClosed && (
        <div style={{
          background: "rgba(232, 160, 32, 0.15)", border: `1px solid ${C.accent}`,
          borderRadius: 12, padding: "12px 16px",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <span style={{ fontSize: 24, textShadow: "0 2px 4px rgba(232, 160, 32, 0.3)" }}>🏆</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: C.accent }}>Poll closed</div>
            <div style={{ fontSize: 15, color: C.text, fontWeight: 600 }}>Voting has ended. These are the final results.</div>
          </div>
        </div>
      )}

      {/* ── Winner Hero Lockup ────────────────────────────────────── */}
      {winner && (
        <div style={{
          position: "relative",
          borderRadius: 20, overflow: "hidden",
          border: `1px solid ${C.accent}`,
          boxShadow: `0 8px 32px rgba(245, 158, 11, 0.25)`,
          marginBottom: 8,
          background: C.card,
        }}>
          {/* Background Poster */}
          {winnerPosterUrl && (
             <div style={{
               position: "absolute", inset: 0, zIndex: 0,
               backgroundImage: `url(${winnerPosterUrl})`,
               backgroundSize: "cover", backgroundPosition: "center top",
             }} />
          )}

          {/* Gradient Overlay */}
          <div style={{
            position: "absolute", inset: 0, zIndex: 1,
            background: `linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, ${C.bg} 85%, ${C.bg} 100%)`,
          }} />

          {/* Content */}
          <div style={{ position: "relative", zIndex: 2, padding: "140px 20px 24px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <div style={{
              background: C.accent, color: "#000",
              fontSize: 11, fontWeight: 900, letterSpacing: "0.15em",
              padding: "4px 12px", borderRadius: 99, marginBottom: 12,
              boxShadow: "0 4px 12px rgba(245, 158, 11, 0.4)"
            }}>
              WINNER CROWNED
            </div>
            
            <div style={{ fontSize: 32, fontWeight: 900, color: "#fff", lineHeight: 1.1, textShadow: "0 2px 8px rgba(0,0,0,0.8)", marginBottom: 16 }}>
              {winner.event.title}
            </div>

            {/* Glowing Info Card */}
            <div style={{
              background: "rgba(255,255,255,0.06)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 16, padding: "16px", width: "100%",
              display: "flex", flexDirection: "column", gap: 6,
            }}>
               <div style={{ fontSize: 24, fontWeight: 900, color: C.accent, textShadow: "0 2px 4px rgba(0,0,0,0.5)" }}>
                 {fmt12h(winner.session.session_time)}
               </div>
               <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>
                 {fmtDate(winner.session.session_date)}
               </div>
               <div style={{ fontSize: 14, color: C.textDim, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <span>{winner.session.theater_name}</span>
                  {winner.session.format !== "Standard" && (
                    <span style={{ fontSize: 11, fontWeight: 800, color: C.accent, background: "rgba(245, 158, 11, 0.15)", padding: "2px 6px", borderRadius: 6 }}>{winner.session.format}</span>
                  )}
               </div>
            </div>

            <div style={{ fontSize: 15, fontWeight: 800, color: C.textMuted, marginTop: 16 }}>
              <span style={{ color: "#fff" }}>{winner.voter_count}</span> of {totalVoters} members are going
            </div>

            {winner.event.booking_url && (
              <a href={winner.event.booking_url} target="_blank" rel="noopener noreferrer" style={{
                display: "block", marginTop: 20, width: "100%",
                background: "linear-gradient(135deg, #F59E0B, #D97706)",
                color: "#000", border: "none",
                borderRadius: 14, padding: "16px 0",
                textAlign: "center", fontSize: 16, fontWeight: 900,
                textDecoration: "none", boxShadow: "0 4px 16px rgba(245, 158, 11, 0.4)",
              }}>
                {winner.event.event_type === "restaurant" ? "Make Reservation \u2192" : "Get Tickets \u2192"}
              </a>
            )}
          </div>
        </div>
      )}

      {/* ── MY PENDING VOTE — shown only when OPEN ───────────────── */}
      {!isClosed && isParticipating && !hasSubmitted && (
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 14, padding: "14px",
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.1em", color: C.textMuted, display: "flex", alignItems: "center" }}>MY PENDING VOTE<HelpIcon title="What is this?" body="These are your current picks — not submitted yet. Hit Submit to add them to the group standings." /></div>
          {hasAnySelections ? (
            <>
              <div style={{ fontSize: 13, color: C.textMuted }}>
                {isEditing ? "You're editing — resubmit to update your vote." : `${personal_pick_keys.length} selection${personal_pick_keys.length !== 1 ? "s" : ""} — not submitted yet.`}
              </div>
              {personal_pick_keys.slice(0, 3).map((key) => {
                const [eId, sId] = key.split(":").map(Number);
                const session = sessions.find((s) => s.id === sId);
                const event = events.find((e) => e.id === eId);
                if (!session || !event) return null;
                const venue = event.venue_name || session.theater_name || "";
                return (
                  <div key={key} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 10px",
                    background: C.surface, borderRadius: 10,
                    border: `1px solid ${C.border}`,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{event.title}</div>
                      <div style={{ fontSize: 12, color: C.textMuted }}>
                        {fmt12h(session.session_time)} · {fmtDate(session.session_date)}{venue ? ` · ${venue}` : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
              {hasAnySelections && personal_pick_keys.length > 3 && (
                <div style={{ fontSize: 12, color: C.textDim, paddingLeft: 2 }}>
                  +{personal_pick_keys.length - 3} more selections
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <div
                  onClick={onSubmitVote ? async () => { await onSubmitVote(); fetchResults(); } : () => navigate("/vote/vote")}
                  style={{
                    flex: 1, background: C.accent, color: "#000", fontWeight: 700, fontSize: 14,
                    borderRadius: 10, padding: "10px 16px", textAlign: "center", cursor: "pointer",
                  }}
                >{isEditing ? "Resubmit →" : "Submit your vote →"}</div>
                {isEditing && onCancelEdit && (
                  <div
                    onClick={onCancelEdit}
                    style={{
                      background: "transparent", color: C.textMuted, fontWeight: 600, fontSize: 14,
                      borderRadius: 10, padding: "10px 16px", textAlign: "center", cursor: "pointer",
                      border: `1px solid ${C.border}`,
                    }}
                  >Cancel</div>
                )}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 14, color: C.textMuted }}>You haven't picked anything yet.</div>
              <div
                onClick={() => navigate("/vote/vote")}
                style={{
                  background: C.surface, color: C.accent, fontWeight: 700, fontSize: 14,
                  borderRadius: 10, padding: "10px 16px", textAlign: "center", cursor: "pointer",
                  border: `1px solid ${C.accent}`,
                }}
              >Go to Vote tab →</div>
            </>
          )}
        </div>
      )}

      {/* ── GROUP STANDINGS ──────────────────────────────────────── */}
      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 14, overflow: "hidden",
      }}>
        {/* Header */}
        <div
          onClick={() => setStandingsCollapsed((x) => !x)}
          style={{
            padding: "12px 14px", display: "flex", alignItems: "center", gap: 8,
            cursor: "pointer",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.1em", color: C.textMuted, flex: 1, display: "flex", alignItems: "center" }}>
            GROUP STANDINGS<HelpIcon title="How rankings work" body="Options are ranked by how many members selected them. Flexible members count as supporting every option." />
          </span>
          {!isClosed && <LiveDot flashing={dotFlashing} />}
          {/* Filter pills */}
          {isParticipating && hasSubmitted && personal_pick_keys.length > 0 && (
            <div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
              {(["all", "mine"] as const).map((val) => (
                <div
                  key={val}
                  onClick={() => setFilter(val)}
                  style={{
                    fontSize: 12, fontWeight: 700, cursor: "pointer",
                    padding: "4px 12px", borderRadius: 99,
                    background: filter === val ? C.accent : C.surface,
                    color: filter === val ? "#000" : C.textMuted,
                    border: `1px solid ${filter === val ? C.accent : C.border}`,
                  }}
                >{val === "all" ? "All" : "Mine"}</div>
              ))}
            </div>
          )}
          <span style={{ fontSize: 13, color: C.textDim, marginLeft: 4 }}>
            {!standingsCollapsed ? "▴" : "▾"}
          </span>
        </div>

        {/* Expanded content — open by default if voter has submitted, otherwise toggle */}
        {!standingsCollapsed && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 10px 10px" }}>
              {/* Participation row */}
              <GroupProgress
                voters={participation.voters}
                totalVoters={totalVoters}
                fullyVoted={participation.fully_voted}
              />

              {/* Empty: no submitted votes yet */}
              {isEmpty && !no_valid_options && (
                <div style={{
                  background: C.surface, borderRadius: 12, padding: "28px 16px",
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>🍿</div>
                  <div style={{ fontSize: 14, color: C.textMuted }}>No votes submitted yet — be the first.</div>
                </div>
              )}

              {/* Empty: no valid combo */}
              {isEmpty && no_valid_options && has_any_votes && (
                <div style={{
                  background: C.surface, borderRadius: 12, padding: "28px 16px",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                }}>
                  <span style={{ fontSize: 28 }}>😕</span>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>No valid combinations yet</div>
                  <div style={{ fontSize: 12, color: C.textMuted, textAlign: "center", lineHeight: 1.6 }}>
                    No single showtime works for the whole group. Try adjusting or switching on flexible mode.
                  </div>
                  <div
                    onClick={() => navigate("/vote/showtimes")}
                    style={{
                      marginTop: 4, background: C.accent, color: "#000",
                      fontWeight: 700, fontSize: 12,
                      borderRadius: 8, padding: "7px 18px", cursor: "pointer",
                    }}
                  >Adjust Showtimes →</div>
                </div>
              )}

              {/* Mine filter empty */}
              {filter === "mine" && filtered.length === 0 && results.length > 0 && (
                <div style={{
                  background: C.surface, borderRadius: 12, padding: "20px 16px", textAlign: "center",
                }}>
                  <div style={{ fontSize: 12, color: C.textMuted }}>None of your picks are in the top results yet.</div>
                </div>
              )}

              {/* Ranked cards */}
              {filtered.map((entry) => {
                const fullEvent = events.find((e) => e.id === entry.event.id);
                return (
                  <RankedCard
                    key={`${entry.event.id}:${entry.session.id}`}
                    entry={entry}
                    totalVoters={totalVoters}
                    isMyPick={isMyPick(entry)}
                    isTop={entry.rank === 1}
                    showAllFilter={filter === "all"}
                    runtimeMins={fullEvent?.runtime_mins}
                  />
                );
              })}

              {/* Bottom CTA */}
              {isClosed && winner && winner.event.booking_url && (
                <a href={winner.event.booking_url} target="_blank" rel="noopener noreferrer" style={{
                  display: "block",
                  background: C.accent, color: "#000",
                  borderRadius: 14, padding: "13px 18px",
                  textAlign: "center", fontSize: 14, fontWeight: 700,
                  letterSpacing: "0.02em", textDecoration: "none",
                }}>
                  {winner.event.event_type === "restaurant" ? "Make a Reservation \u2192" : winner.event.event_type === "bar" ? "Get Directions \u2192" : "Get Tickets \u2192"}
                </a>
              )}
            </div>
          )}
      </div>
    </div>
  );
}
