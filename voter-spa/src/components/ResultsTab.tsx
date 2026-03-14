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
  const [expanded, setExpanded] = useState(false);

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
          Group progress
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
            {fmt12h(entry.session.session_time)} · {entry.session.theater_name}
            {entry.session.format !== "Standard" && (
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

// ─── ResultsTab ───────────────────────────────────────────────────────────────

interface ResultsTabProps {
  isParticipating: boolean;
  hasCompletedVoting: boolean;
  onJoin: () => void;
}

const POLL_INTERVAL_MS = 15_000;

export function ResultsTab({ isParticipating, hasCompletedVoting, onJoin }: ResultsTabProps) {
  const navigate = useNavigate();
  const [data, setData] = useState<ResultsResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function fetchResults() {
    voterApi.getResultsJson()
      .then((d) => { setData(d); setLoadError(false); })
      .catch(() => setLoadError(true));
  }

  useEffect(() => {
    fetchResults();
    intervalRef.current = setInterval(fetchResults, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Re-fetch immediately when participation state changes (join / opt-out)
  useEffect(() => {
    fetchResults();
  }, [isParticipating]);

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

  // MY PICK comparison: by (event_id:session_id) string, not object identity
  function isMyPick(entry: ResultsEntry): boolean {
    return pickKeySet.has(`${entry.event.id}:${entry.session.id}`);
  }

  const filtered = filter === "mine"
    ? results.filter(isMyPick)
    : results;

  // ── Empty states — two distinct variants ─────────────────────────────────
  //   1. no_valid_options=false, results=[] → no one has voted yet
  //   2. no_valid_options=true              → votes exist but no combo satisfies everyone
  const isEmpty = results.length === 0;

  return (
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>

      {/* ── Preview-mode join CTA nudge ─────────────────────────── */}
      {!isParticipating && (
        <div style={{
          background: C.card, border: `1px solid ${C.accent}`,
          borderRadius: 12, padding: "10px 14px",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>👋</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.accent, marginBottom: 2 }}>
              You're not in the vote yet
            </div>
            <div style={{ fontSize: 15, color: C.textMuted }}>
              Join to influence these standings.
            </div>
          </div>
          <div
            onClick={onJoin}
            style={{
              background: C.accent, color: "#000", fontSize: 14, fontWeight: 700,
              padding: "6px 14px", borderRadius: 8, cursor: "pointer", flexShrink: 0,
            }}
          >Join</div>
        </div>
      )}

      {/* Poll-closed banner */}
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

      {/* Winner card */}
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
          {winner.session.booking_url && (
            <a href={winner.session.booking_url} target="_blank" rel="noopener noreferrer" style={{
              display: "block", marginTop: 4,
              background: C.accent, color: "#000",
              borderRadius: 12, padding: "12px 18px",
              textAlign: "center", fontSize: 16, fontWeight: 700,
              textDecoration: "none",
            }}>Get Tickets &#x2192;</a>
          )}
        </div>
      )}

      {/* Group progress ──────────────────────────────────────── */}
      <GroupProgress
        voters={participation.voters}
        totalVoters={totalVoters}
        fullyVoted={participation.fully_voted}
      />

      {/* ── Others voted but I haven't nudge ───────────────────── */}
      {isParticipating && !hasCompletedVoting && participation.fully_voted > 0 && (
        <div style={{
          background: C.card, border: `1px solid ${C.accent}`,
          borderRadius: 12, padding: "10px 14px",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>👋</span>
          <div style={{ fontSize: 14, color: C.textMuted }}>
            <span style={{ fontWeight: 700, color: C.accent }}>
              {participation.fully_voted} member{participation.fully_voted !== 1 ? "s" : ""} voted.
            </span>
            {" "}Click above to submit and add yours to influence the result.
          </div>
        </div>
      )}

      {/* ── Section label + filter ──────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "2px 2px 0",
      }}>
        <span style={{
          fontSize: 15, fontWeight: 700, color: C.textMuted, letterSpacing: "0.1em",
        }}>GROUP STANDINGS</span>

        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {!isClosed && (
            <span style={{ fontSize: 14, color: C.textDim, marginRight: 4 }}>live &middot; updates every 15s</span>
          )}
          {/* Filter pills — only shown when user is participating and has picks */}
          {isParticipating && personal_pick_keys.length > 0 && (
            <>
              {(["all", "mine"] as const).map((val) => (
                <div
                  key={val}
                  onClick={() => setFilter(val)}
                  style={{
                    fontSize: 13, fontWeight: 700, cursor: "pointer",
                    padding: "5px 14px", borderRadius: 99,
                    background: filter === val ? C.accent : C.card,
                    color: filter === val ? "#000" : C.textMuted,
                    border: `1px solid ${filter === val ? C.accent : C.border}`,
                  }}
                >{val === "all" ? "All" : "My Picks"}</div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── Empty state 1: no one has voted yet ─────────────────── */}
      {isEmpty && !no_valid_options && (
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 14, padding: "40px 24px",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 36 }}>🍿</span>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>No votes yet</div>
          <div style={{ fontSize: 13, color: C.textMuted, textAlign: "center", lineHeight: 1.6 }}>
            Standings will appear here as your group starts voting.
          </div>
        </div>
      )}

      {/* ── Empty state 2: votes exist but no valid combination ─── */}
      {isEmpty && no_valid_options && has_any_votes && (
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 14, padding: "40px 24px",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 36 }}>😕</span>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>
            No valid combinations yet
          </div>
          <div style={{ fontSize: 13, color: C.textMuted, textAlign: "center", lineHeight: 1.6 }}>
            Everyone's voted, but no single showtime works for the whole group. Try adjusting your showtimes or switching on flexible mode.
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

      {/* ── "My Picks" filter: empty ─────────────────────────────── */}
      {filter === "mine" && filtered.length === 0 && results.length > 0 && (
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 14, padding: "28px 20px", textAlign: "center",
        }}>
          <div style={{ fontSize: 12, color: C.textMuted }}>
            None of your picks are in the top results yet.
          </div>
        </div>
      )}

      {/* ── Ranked result cards ──────────────────────────────────── */}
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

      {/* ── Bottom CTA ──────────────────────────────────────────── */}
      {results.length > 0 && (
        <div style={{
          background: C.accent, color: "#000",
          borderRadius: 14, padding: "13px 18px",
          textAlign: "center", fontSize: 14, fontWeight: 700,
          letterSpacing: "0.02em", cursor: "pointer",
        }}>
          {results[0].session.booking_url
            ? `Get Tickets for #1 →`
            : `#1 · ${results[0].event.title}`}
        </div>
      )}
    </div>
  );
}
