import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { C } from "../tokens";
import { voterApi, ResultsResponse, ResultsEntry } from "../api/voter";

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
                background: C.surface, borderRadius: 99, padding: "4px 10px",
                border: `1px solid ${v.fully_voted ? color + "40" : C.border}`,
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: "50%",
                  background: color,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontWeight: 800,
                  color: v.fully_voted ? "#000" : C.textDim,
                }}>{v.name[0].toUpperCase()}</div>
                <span style={{ fontSize: 13, color: v.fully_voted ? C.text : C.textDim }}>
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
}

function RankedCard({ entry, totalVoters, isMyPick, isTop, showAllFilter }: RankedCardProps) {
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
  onSubmitVote?: () => void;
}

const POLL_INTERVAL_MS = 15_000;

export function ResultsTab({ isParticipating, hasCompletedVoting, isEditing = false, onJoin, onSubmitVote }: ResultsTabProps) {
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
          background: C.accentDim, border: `1px solid ${C.accent}`,
          borderRadius: 12, padding: "10px 14px",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 20 }}>&#x1F3C6;</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.accent }}>Poll closed</div>
            <div style={{ fontSize: 15, color: C.textMuted }}>Voting has ended. These are the final results.</div>
          </div>
        </div>
      )}

      {/* ── Winner card ──────────────────────────────────────────── */}
      {winner && (
        <div style={{
          background: `linear-gradient(135deg, rgba(232,160,32,0.15), ${C.card})`,
          border: `2px solid ${C.accent}`,
          borderRadius: 18, padding: "20px 18px",
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", color: C.accent }}>WINNER</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: C.text, lineHeight: 1.2 }}>{winner.event.title}</div>
          <div style={{ fontSize: 14, color: C.textMuted }}>{fmt12h(winner.session.session_time)} &middot; {fmtDate(winner.session.session_date)}</div>
          <div style={{ fontSize: 14, color: C.textMuted }}>
            {winner.session.theater_name}
            {winner.session.format !== "Standard" && (
              <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: C.accent, background: C.accentDim, borderRadius: 4, padding: "1px 5px" }}>{winner.session.format}</span>
            )}
          </div>
          <div style={{ fontSize: 15, fontWeight: 900, color: C.accent }}>
            {winner.voter_count}/{totalVoters} <span style={{ fontSize: 13, fontWeight: 400, color: C.textMuted }}>members available</span>
          </div>
          {winner.event.booking_url && (
            <a href={winner.event.booking_url} target="_blank" rel="noopener noreferrer" style={{
              display: "block", marginTop: 4,
              background: C.accent, color: "#000",
              borderRadius: 12, padding: "12px 18px",
              textAlign: "center", fontSize: 16, fontWeight: 700,
              textDecoration: "none",
            }}>{winner.event.event_type === "restaurant" ? "Make a Reservation \u2192" : winner.event.event_type === "bar" ? "Get Directions \u2192" : "Get Tickets \u2192"}</a>
          )}
        </div>
      )}

      {/* ── MY PENDING VOTE — shown only when OPEN ───────────────── */}
      {!isClosed && isParticipating && !hasSubmitted && (
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 14, padding: "14px",
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.1em", color: C.textMuted }}>MY PENDING VOTE</div>
          {hasAnySelections ? (
            <>
              {results.filter(isMyPick).slice(0, 3).map((entry) => (
                <div key={`${entry.event.id}:${entry.session.id}`} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 10px",
                  background: C.surface, borderRadius: 10,
                  border: `1px solid ${C.border}`,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{entry.event.title}</div>
                    <div style={{ fontSize: 12, color: C.textMuted }}>
                      {fmt12h(entry.session.session_time)} · {fmtDate(entry.session.session_date)}
                    </div>
                  </div>
                </div>
              ))}
              {hasAnySelections && personal_pick_keys.length > 3 && (
                <div style={{ fontSize: 12, color: C.textDim, paddingLeft: 2 }}>
                  +{personal_pick_keys.length - 3} more selections
                </div>
              )}
              <div
                onClick={onSubmitVote ?? (() => navigate("/vote/vote"))}
                style={{
                  background: C.accent, color: "#000", fontWeight: 700, fontSize: 14,
                  borderRadius: 10, padding: "10px 16px", textAlign: "center", cursor: "pointer",
                }}
              >{isEditing ? "Resubmit →" : "Submit your vote →"}</div>
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
          <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.1em", color: C.textMuted, flex: 1 }}>
            GROUP STANDINGS
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
              {filtered.map((entry) => (
                <RankedCard
                  key={`${entry.event.id}:${entry.session.id}`}
                  entry={entry}
                  totalVoters={totalVoters}
                  isMyPick={isMyPick(entry)}
                  isTop={entry.rank === 1}
                  showAllFilter={filter === "all"}
                />
              ))}

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
