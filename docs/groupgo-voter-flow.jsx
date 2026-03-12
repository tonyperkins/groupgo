import { useState } from "react";

const screens = [
  "secure-entry",
  "secure-entry-wrong-pin",
  "preview-mode",
  "zero-yes-preview",
  "active-voting",
  "countdown-normal",
  "countdown-urgent",
  "change-vote",
  "trailer-expanded",
  "flexible-mode",
  "flexible-mode-on",
  "leave-confirm",
  "opted-out",
  "toast-no-movie",
  "toast-no-showtime",
  "toast-both-missing",
  "showtimes-submitted",
  "results-no-votes",
  "results-others-voted",
  "results-all-voted",
  "results-review",
  "results-preview",
  "results-poll-closed",
  "no-active-poll",
  "vote-submitted",
];

const screenLabels = {
  "secure-entry": "Secure Entry",
  "secure-entry-wrong-pin": "Secure Entry — Wrong PIN",
  "preview-mode": "Preview Mode",
  "leave-confirm": "Opt Out Confirm",
  "opted-out": "Opted Out",
  "zero-yes-preview": "Zero Yes Preview",
  "active-voting": "Active Voting",
  "flexible-mode": "Showtimes (Flexible Off)",
  "flexible-mode-on": "Showtimes (Flexible On)",
  "showtimes-submitted": "Showtimes — Submitted",
  "countdown-normal": "Countdown — Normal",
  "countdown-urgent": "Countdown — Urgent",
  "change-vote": "Change Vote (Editing)",
  "toast-no-showtime": "Toast — No Showtime Selected",
  "toast-both-missing": "Toast — Both Missing",
  "results-no-votes": "Results — No Votes Yet",
  "results-others-voted": "Results — Others Voted, You Haven't",
  "results-all-voted": "Results — All Members Voted",
  "results-review": "Results — You Voted",
  "results-preview": "Results — Preview Mode",
  "results-poll-closed": "Results — Poll Closed",
  "no-active-poll": "No Active Poll",
  "vote-submitted": "Vote Submitted",
};

const movies = [
  { id: 1, title: "Dune: Messiah", genre: "Sci-Fi", runtime: "2h 41m", rating: "PG-13", votes: 4, thumb: "🏜️", score: "9.1", year: "2026", tags: ["Sci-Fi", "Epic"], blurb: "Paul Atreides faces the consequences of his rise to power across the known universe." },
  { id: 2, title: "The Brutalist", genre: "Drama", runtime: "3h 35m", rating: "R", votes: 3, thumb: "🏛️", score: "8.7", year: "2024", tags: ["Drama", "History"], blurb: "A visionary architect flees post-war Europe and attempts to rebuild his life in America." },
  { id: 3, title: "Thunderbolts", genre: "Action", runtime: "2h 7m", rating: "PG-13", votes: 5, thumb: "⚡", score: "8.2", year: "2025", tags: ["Action", "Marvel"], blurb: "A ragtag team of antiheroes is assembled for a dangerous covert mission." },
];

const showtimes = [
  { id: 1, movieId: 1, time: "7:00 PM", theater: "AMC River Oaks", price: "$16", seats: 12 },
  { id: 2, movieId: 1, time: "9:30 PM", theater: "AMC River Oaks", price: "$16", seats: 4 },
  { id: 3, movieId: 3, time: "7:15 PM", theater: "Regal Westway", price: "$14", seats: 8 },
  { id: 4, movieId: 2, time: "6:45 PM", theater: "Alamo Drafthouse", price: "$18", seats: 6 },
];

// ─── Design tokens ────────────────────────────────────────────────
const C = {
  bg: "#0A0A0F",
  surface: "#111118",
  card: "#16161F",
  border: "#1E1E2E",
  borderLight: "#2A2A3E",
  accent: "#E8A020",
  accentDim: "#7A5510",
  accentGlow: "rgba(232,160,32,0.15)",
  green: "#22C55E",
  greenDim: "#14532D",
  red: "#EF4444",
  redDim: "#450A0A",
  blue: "#3B82F6",
  blueDim: "#1E3A5F",
  text: "#F0EEE8",
  textMuted: "#7A7A8E",
  textDim: "#4A4A5E",
  locked: "#2A2A3E",
};

// ─── Shared components ────────────────────────────────────────────

function PhoneFrame({ children, label }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <div style={{
        width: 390,
        height: 844,
        background: C.bg,
        borderRadius: 44,
        border: `2px solid ${C.border}`,
        boxShadow: `0 0 0 1px #000, 0 40px 80px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.04)`,
        overflow: "hidden",
        position: "relative",
        display: "flex",
        flexDirection: "column",
      }}>
        {/* Notch */}
        <div style={{
          position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
          width: 120, height: 30, background: "#000",
          borderBottomLeftRadius: 16, borderBottomRightRadius: 16, zIndex: 20,
        }} />
        {/* Status bar */}
        <div style={{
          height: 44, display: "flex", alignItems: "flex-end", justifyContent: "space-between",
          padding: "0 20px 6px", flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, color: C.text, fontWeight: 600, fontFamily: "monospace" }}>9:41</span>
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            {["▲", "●●●●", "⬛"].map((icon, i) => (
              <span key={i} style={{ fontSize: 9, color: C.textMuted }}>{icon}</span>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {children}
        </div>
      </div>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
        color: C.accent, fontFamily: "'Courier New', monospace",
        textAlign: "center", maxWidth: 390, lineHeight: 1.4,
      }}>{label}</div>
    </div>
  );
}

function AppHeader({ title, subtitle, showBack, countdown, countdownUrgent }) {
  return (
    <div style={{
      padding: "12px 20px 10px",
      borderBottom: `1px solid ${C.border}`,
      background: C.surface,
      flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {showBack && <span style={{ fontSize: 18, color: C.accent, cursor: "pointer" }}>←</span>}
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: C.text, fontFamily: "'Georgia', serif" }}>GroupGo</span>
            <span style={{ fontSize: 9, background: C.accent, color: "#000", borderRadius: 4, padding: "1px 5px", fontWeight: 700, letterSpacing: "0.05em" }}>VOTE</span>
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 1 }}>{subtitle}</div>
          {countdown && (
            <div style={{
              marginTop: 3, display: "flex", alignItems: "center", gap: 4,
            }}>
              <span style={{ fontSize: 10, color: countdownUrgent ? C.red : C.textDim }}>⏱</span>
              <span style={{
                fontSize: 10, fontWeight: countdownUrgent ? 800 : 600,
                color: countdownUrgent ? C.red : C.textDim,
                letterSpacing: "0.02em",
              }}>{countdown}</span>
            </div>
          )}
        </div>
        <div style={{
          fontSize: 12, fontWeight: 700, color: C.textMuted,
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: "4px 10px",
        }}>Sam</div>
      </div>
    </div>
  );
}

function ProgressBar({ step }) {
  const segments = ["Joined", "Movie", "Showtime", "Submitted"];
  return (
    <div style={{ padding: "8px 16px 6px", flexShrink: 0, background: C.surface }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
        {segments.map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 99,
            background: i < step ? C.accent : C.border,
          }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {segments.map((label, i) => (
          <div key={i} style={{
            flex: 1, textAlign: "center",
            fontSize: 8, fontWeight: i < step ? 700 : 400,
            color: i < step ? C.accent : C.textDim,
            letterSpacing: "0.03em",
          }}>{label.toUpperCase()}</div>
        ))}
      </div>
    </div>
  );
}

function TabBar({ active, locked = [], movieCount = 0, showtimeCount = 0 }) {
  const tabs = [
    { id: "movies", icon: "🎬", label: "Movies", badge: movieCount },
    { id: "showtimes", icon: "🕐", label: "Showtimes", badge: showtimeCount },
    { id: "results", icon: "🏆", label: "Results", badge: null },
  ];
  return (
    <div style={{
      display: "flex", borderTop: `1px solid ${C.border}`,
      background: C.surface, flexShrink: 0,
    }}>
      {tabs.map(t => {
        const isActive = t.id === active;
        const isLocked = locked.includes(t.id);
        return (
          <div key={t.id} style={{
            flex: 1, padding: "10px 0", display: "flex", flexDirection: "column",
            alignItems: "center", gap: 2, position: "relative",
            cursor: isLocked ? "default" : "pointer",
            opacity: isLocked ? 0.35 : 1,
            borderTop: isActive ? `2px solid ${C.accent}` : "2px solid transparent",
          }}>
            <div style={{ position: "relative", display: "inline-flex" }}>
              <span style={{ fontSize: 18 }}>{t.icon}</span>
              {t.badge !== null && (
                <div style={{
                  position: "absolute", top: -5, right: -8,
                  minWidth: 16, height: 16, borderRadius: 99,
                  background: t.badge > 0 ? C.accent : C.borderLight,
                  border: `2px solid ${C.surface}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: "0 3px",
                }}>
                  <span style={{
                    fontSize: 9, fontWeight: 900, lineHeight: 1,
                    color: t.badge > 0 ? "#000" : C.textDim,
                  }}>{t.badge}</span>
                </div>
              )}
            </div>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
              color: isActive ? C.accent : C.textMuted,
            }}>{t.label.toUpperCase()}</span>
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({ type, label }) {
  const styles = {
    preview: { bg: C.blueDim, color: C.blue, border: C.blue },
    "opted-out": { bg: C.redDim, color: C.red, border: C.red },
    active: { bg: C.greenDim, color: C.green, border: C.green },
    completed: { bg: C.accentDim, color: C.accent, border: C.accent },
  };
  const s = styles[type] || styles.active;
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: s.bg, border: `1px solid ${s.border}`,
      borderRadius: 99, padding: "3px 10px",
    }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: s.color }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: s.color, letterSpacing: "0.06em" }}>{label}</span>
    </div>
  );
}

function CTAButton({ label, variant = "primary", disabled, small, fullWidth = true }) {
  const vars = {
    primary: { bg: C.accent, color: "#000", border: C.accent },
    secondary: { bg: "transparent", color: C.accent, border: C.accent },
    ghost: { bg: C.card, color: C.textMuted, border: C.border },
    locked: { bg: C.locked, color: C.textDim, border: C.border },
    danger: { bg: C.redDim, color: C.red, border: C.red },
  };
  const v = vars[variant] || vars.primary;
  return (
    <div style={{
      background: v.bg, color: v.color, border: `1px solid ${v.border}`,
      borderRadius: 14, padding: small ? "8px 14px" : "13px 18px",
      textAlign: "center", fontSize: small ? 12 : 14, fontWeight: 700,
      letterSpacing: "0.02em", cursor: disabled ? "default" : "pointer",
      opacity: disabled ? 0.5 : 1,
      width: fullWidth ? "100%" : "auto",
    }}>{label}</div>
  );
}

function MovieCard({ movie, voted, mode, compact, canVote = true }) {
  // voted: "yes" | "no" | null (abstain/no response)
  const yesActive = voted === "yes";
  const noActive = voted === "no";
  const borderColor = yesActive ? C.green : noActive ? C.red : C.border;
  const glowColor = yesActive ? `0 0 0 1px ${C.green}20, 0 4px 16px ${C.green}10`
                  : noActive  ? `0 0 0 1px ${C.red}15, 0 4px 12px ${C.red}08`
                  : "none";

  return (
    <div style={{
      background: C.card, borderRadius: 16, border: `1px solid ${borderColor}`,
      padding: compact ? "10px 12px" : "14px",
      boxShadow: glowColor,
      opacity: noActive ? 0.7 : 1,
    }}>
      {/* Top row: poster + info */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div style={{
            width: compact ? 52 : 64, height: compact ? 70 : 84, borderRadius: 10,
            background: C.surface, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: compact ? 24 : 32, border: `1px solid ${C.border}`,
          }}>
            {movie.thumb}
          </div>
          {/* Rating badge — sits cleanly below poster */}
          <div style={{
            background: C.accent, color: "#000", fontSize: 9, fontWeight: 800,
            borderRadius: 6, padding: "2px 6px",
          }}>★ {movie.score}</div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: compact ? 13 : 15, fontWeight: 800, color: C.text, marginBottom: 4, lineHeight: 1.2 }}>{movie.title}</div>
          {/* Chips row */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6 }}>
            {[movie.year, movie.runtime, movie.rating].map(tag => (
              <span key={tag} style={{
                fontSize: 10, color: C.textMuted, background: C.surface,
                border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 7px",
              }}>{tag}</span>
            ))}
          </div>
          {/* Genre tags */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {movie.tags.map(tag => (
              <span key={tag} style={{
                fontSize: 10, color: C.textDim, background: "transparent",
                border: `1px solid ${C.border}`, borderRadius: 99, padding: "1px 7px",
              }}>{tag}</span>
            ))}
          </div>
        </div>

        {/* Results mode vote count */}
        {mode === "results" && (
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: C.accent }}>{movie.votes}</div>
            <div style={{ fontSize: 10, color: C.textMuted }}>yes</div>
          </div>
        )}

        {/* Readonly completed badge */}
        {mode === "readonly" && yesActive && (
          <div style={{
            width: 26, height: 26, borderRadius: 8, background: C.green,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <span style={{ fontSize: 13, color: "#000" }}>✓</span>
          </div>
        )}
      </div>

      {/* Blurb */}
      {!compact && movie.blurb && (
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 10, lineHeight: 1.5 }}>
          {movie.blurb}
        </div>
      )}

      {/* Watch Trailer — shown in voting and info modes */}
      {(mode === "voting" || mode === "info") && (
        <div style={{ marginTop: 12 }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
            padding: "9px", cursor: "pointer",
          }}>
            <span style={{ fontSize: 12, color: C.accent }}>▶</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.textMuted }}>Watch Trailer</span>
          </div>
        </div>
      )}

      {/* Vote row — only in voting mode */}
      {mode === "voting" && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Yes / No buttons */}
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{
              flex: 1, borderRadius: 10, padding: "12px 8px",
              background: yesActive ? C.greenDim : C.surface,
              border: `1px solid ${yesActive ? C.green : C.border}`,
              cursor: canVote ? "pointer" : "default",
              opacity: canVote ? 1 : 0.4,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              <span style={{ fontSize: 14, color: yesActive ? C.green : C.textMuted }}>✓</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: yesActive ? C.green : C.textMuted }}>Yes</span>
            </div>
            <div style={{
              flex: 1, borderRadius: 10, padding: "12px 8px",
              background: noActive ? C.redDim : C.surface,
              border: `1px solid ${noActive ? C.red : C.border}`,
              cursor: canVote ? "pointer" : "default",
              opacity: canVote ? 1 : 0.4,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              <span style={{ fontSize: 14, color: noActive ? C.red : C.textMuted }}>✕</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: noActive ? C.red : C.textMuted }}>No</span>
            </div>
          </div>

          {/* Abstain hint removed — dimmed buttons communicate state sufficiently */}
        </div>
      )}
    </div>
  );
}

function ShowtimeCard({ showtime, movie, ctaState }) {
  // ctaState: "active" | "join-first" | "vote-movie" | "completed" | "preview"
  const ctas = {
    active: { label: "Pick This Time", variant: "primary" },
    "join-first": { label: "🔒 Join from Movies first", variant: "locked" },
    "vote-movie": { label: "🔒 Mark this movie Yes first", variant: "locked" },
    completed: { label: "🔒 Voting complete", variant: "locked" },
    preview: { label: "🔒 Join to vote", variant: "locked" },
  };
  const cta = ctas[ctaState] || ctas.active;
  return (
    <div style={{
      background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: "12px 14px",
      boxShadow: ctaState === "active" ? `0 2px 12px ${C.accentGlow}` : "none",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 20 }}>{movie.thumb}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{movie.title}</div>
          <div style={{ fontSize: 11, color: C.textMuted }}>{showtime.theater}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.accent }}>{showtime.time}</div>
          <div style={{ fontSize: 10, color: C.textMuted }}>{showtime.price} · {showtime.seats} seats</div>
        </div>
      </div>
      <CTAButton label={cta.label} variant={cta.variant} small />
    </div>
  );
}

function ScrollArea({ children, style }) {
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", scrollbarWidth: "none", ...style }}>
      <style>{`::-webkit-scrollbar { display: none; }`}</style>
      <div style={{ paddingTop: 2 }}>
        {children}
      </div>
    </div>
  );
}

// ─── Individual screens ────────────────────────────────────────────

function SecureEntryScreen() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: C.bg }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 24px", gap: 28 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🎟️</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: C.text, fontFamily: "'Georgia', serif", marginBottom: 6 }}>You're Invited</div>
          <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.5 }}>Perkins Family Movie Night · Fri May 30</div>
        </div>

        <div style={{ background: C.card, borderRadius: 18, border: `1px solid ${C.border}`, padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, letterSpacing: "0.1em", marginBottom: 12 }}>ENTER 4-DIGIT PIN</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 16 }}>
            {[8, null, null, null].map((val, i) => (
              <div key={i} style={{
                width: 56, height: 64, borderRadius: 14,
                background: C.surface, border: `2px solid ${i === 0 ? C.accent : i === 1 ? C.borderLight : C.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 28, fontWeight: 900, color: C.text,
                boxShadow: i === 1 ? `0 0 0 3px ${C.accentGlow}` : "none",
              }}>
                {val || (i === 0 ? "8" : "")}
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((k, i) => (
              <div key={i} style={{
                height: 48, borderRadius: 12, background: k === "" ? "transparent" : C.surface,
                border: `1px solid ${k === "" ? "transparent" : C.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, fontWeight: 700, color: C.text, cursor: k === "" ? "default" : "pointer",
              }}>{k}</div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <CTAButton label="Join as Voter" variant="primary" disabled />
          <CTAButton label="Preview Without Voting" variant="secondary" />
        </div>
      </div>
      <div style={{ padding: "0 24px 20px", display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
        <span style={{ fontSize: 12, color: C.textDim }}>🔒 End-to-end encrypted · invite-only</span>
      </div>
    </div>
  );
}

// ─── Toast notification ───────────────────────────────────────────
function Toast({ message }) {
  if (!message) return null;
  return (
    <div style={{
      background: "#1A1A10", border: `1px solid ${C.accent}`,
      borderRadius: 10, padding: "10px 14px",
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
      <span style={{ fontSize: 12, color: C.text, lineHeight: 1.4 }}>{message}</span>
    </div>
  );
}

// ─── Participation banner — reused across Movies + Showtimes pages ─
function ParticipationBanner({ joined, submitted, onSubmit }) {
  if (!joined) {
    return (
      <div style={{ padding: "6px 16px", background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{
          background: C.blueDim, border: `1px solid ${C.blue}`, borderRadius: 8,
          padding: "6px 10px", display: "flex", alignItems: "center", gap: 8,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.blue, flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.blue, flex: 1 }}>Preview Mode</span>
          <div style={{
            background: C.blue, color: "#000", fontSize: 11, fontWeight: 700,
            padding: "3px 10px", borderRadius: 6, cursor: "pointer",
          }}>Join</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ padding: "6px 16px", background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
      <div style={{
        background: C.greenDim, border: `1px solid ${C.green}`, borderRadius: 8,
        padding: "6px 10px", display: "flex", alignItems: "center", gap: 8,
      }}>
        {submitted
          ? <span style={{ fontSize: 12, flexShrink: 0 }}>✅</span>
          : <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, flexShrink: 0 }} />
        }
        <span style={{ fontSize: 12, fontWeight: 700, color: C.green, flex: 1 }}>
          {submitted ? "Submitted" : "Voting"}
        </span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {submitted ? (
            <div style={{
              background: C.surface, color: C.text, fontSize: 11, fontWeight: 700,
              padding: "3px 10px", borderRadius: 6, cursor: "pointer",
              border: `1px solid ${C.borderLight}`,
            }}>Change Vote</div>
          ) : (
            <div onClick={onSubmit} style={{
              background: C.green, color: "#000", fontSize: 11, fontWeight: 700,
              padding: "3px 10px", borderRadius: 6, cursor: "pointer",
            }}>Submit</div>
          )}
          <div style={{
            background: "rgba(0,0,0,0.25)", color: C.textMuted, fontSize: 11, fontWeight: 700,
            padding: "3px 10px", borderRadius: 6, cursor: "pointer",
            border: `1px solid rgba(255,255,255,0.15)`,
          }}>Opt Out</div>
        </div>
      </div>
    </div>
  );
}

// ─── Leave confirmation dialog ────────────────────────────────────
function LeaveConfirmDialog() {
  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.75)",
      display: "flex", flexDirection: "column", justifyContent: "flex-end",
      zIndex: 100,
      borderRadius: 38,
      overflow: "hidden",
    }}>
      <div style={{
        width: "100%", background: C.card,
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        border: `1px solid ${C.border}`, borderBottom: "none",
        padding: "20px 20px 28px",
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        {/* Handle */}
        <div style={{ width: 36, height: 4, borderRadius: 99, background: C.borderLight, margin: "0 auto -4px" }} />

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>👋</div>
          <div style={{ fontSize: 17, fontWeight: 900, color: C.text, marginBottom: 8 }}>Opt out of this poll?</div>
          <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6 }}>
            Your votes will be saved. Rejoin anytime with the same invite link and PIN.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{
            background: C.redDim, border: `1px solid ${C.red}`, borderRadius: 14,
            padding: "13px", textAlign: "center", cursor: "pointer",
            fontSize: 14, fontWeight: 700, color: C.red,
          }}>Yes, opt out</div>
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14,
            padding: "13px", textAlign: "center", cursor: "pointer",
            fontSize: 14, fontWeight: 700, color: C.textMuted,
          }}>Cancel — stay in</div>
        </div>
      </div>
    </div>
  );
}

function PreviewModeScreen() {
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <AppHeader subtitle="Perkins Family Movie Night" />
      <ProgressBar step={1} />
      <ParticipationBanner joined={false} />
      <ScrollArea>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {movies.map(m => <MovieCard key={m.id} movie={m} mode="info" />)}
        </div>
      </ScrollArea>
      <TabBar active="movies" locked={["results"]} movieCount={0} showtimeCount={0} />
    </div>
  );
}

function JoinedWithLeaveScreen() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      <AppHeader subtitle="Perkins Family Movie Night" />
      <ProgressBar step={1} />
      <ParticipationBanner joined={true} />
      <ScrollArea>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <MovieCard movie={movies[0]} mode="voting" voted="yes" canVote={true} />
          <MovieCard movie={movies[1]} mode="voting" voted={null} canVote={true} />
        </div>
      </ScrollArea>
      <TabBar active="movies" locked={["results"]} movieCount={1} showtimeCount={0} />
      <LeaveConfirmDialog />
    </div>
  );
}

function ZeroYesPreviewScreen() {
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <AppHeader subtitle="Perkins Family Movie Night" />
      <ProgressBar step={0} />
      <ParticipationBanner joined={true} />
      <div style={{ padding: "8px 16px", flexShrink: 0, background: C.surface, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: C.textMuted, flex: 1 }}>Pick your movies</span>
      </div>
      <ScrollArea>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{
            background: C.card, border: `1px dashed ${C.border}`, borderRadius: 14,
            padding: "14px 16px", textAlign: "center",
          }}>
            <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.5 }}>
              Vote <span style={{ color: C.green, fontWeight: 700 }}>Yes</span> on at least one movie to unlock Showtimes
            </div>
          </div>
          {movies.map(m => <MovieCard key={m.id} movie={m} mode="voting" voted={null} canVote={false} />)}
        </div>
      </ScrollArea>
      <TabBar active="movies" locked={["results"]} movieCount={0} showtimeCount={0} />
    </div>
  );
}

function ToastNoMovieScreen() {
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", position: "relative" }}>
      <AppHeader subtitle="Perkins Family Movie Night" />
      <ProgressBar step={0} />
      <ParticipationBanner joined={true} />
      <div style={{ padding: "8px 16px", flexShrink: 0, background: C.surface, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: C.textMuted, flex: 1 }}>0 of 3 movies voted</span>
        <span style={{ fontSize: 11, color: C.accent, fontWeight: 700 }}>4 members voting</span>
      </div>
      <ScrollArea>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <Toast message="Vote Yes on at least one movie before submitting." />
          <MovieCard movie={movies[0]} mode="voting" voted={null} canVote={true} />
          <MovieCard movie={movies[1]} mode="voting" voted={null} canVote={true} />
          <MovieCard movie={movies[2]} mode="voting" voted={null} canVote={true} />
        </div>
      </ScrollArea>
      <TabBar active="movies" locked={["results"]} movieCount={0} showtimeCount={0} />
    </div>
  );
}

function ToastNoShowtimeScreen() {
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", position: "relative" }}>
      <AppHeader subtitle="Perkins Family Movie Night" />
      <ProgressBar step={1} />
      <ParticipationBanner joined={true} />
      <div style={{ padding: "8px 16px", flexShrink: 0, background: C.surface, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: C.textMuted, flex: 1 }}>2 of 3 movies voted</span>
        <span style={{ fontSize: 11, color: C.accent, fontWeight: 700 }}>4 members voting</span>
      </div>
      <ScrollArea>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <Toast message="Confirm at least one showtime before submitting." />
          <MovieCard movie={movies[0]} mode="voting" voted="yes" canVote={true} />
          <MovieCard movie={movies[1]} mode="voting" voted="no" canVote={true} />
          <MovieCard movie={movies[2]} mode="voting" voted={null} canVote={true} />
        </div>
      </ScrollArea>
      <TabBar active="movies" locked={["results"]} movieCount={2} showtimeCount={0} />
    </div>
  );
}

function ToastBothMissingScreen() {
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", position: "relative" }}>
      <AppHeader subtitle="Perkins Family Movie Night" />
      <ProgressBar step={0} />
      <ParticipationBanner joined={true} />
      <div style={{ padding: "8px 16px", flexShrink: 0, background: C.surface, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: C.textMuted, flex: 1 }}>0 of 3 movies voted</span>
        <span style={{ fontSize: 11, color: C.accent, fontWeight: 700 }}>4 members voting</span>
      </div>
      <ScrollArea>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <Toast message="Pick at least one movie and one showtime before submitting." />
          <MovieCard movie={movies[0]} mode="voting" voted={null} canVote={true} />
          <MovieCard movie={movies[1]} mode="voting" voted={null} canVote={true} />
          <MovieCard movie={movies[2]} mode="voting" voted={null} canVote={true} />
        </div>
      </ScrollArea>
      <TabBar active="movies" locked={["results"]} movieCount={0} showtimeCount={0} />
    </div>
  );
}

function TrailerExpandedScreen() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <AppHeader subtitle="Perkins Family Movie Night" />
      <ProgressBar step={1} />
      <ParticipationBanner joined={true} />
      <div style={{ padding: "8px 16px", flexShrink: 0, background: C.surface, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: C.textMuted, flex: 1 }}>2 of 3 movies voted</span>
        <span style={{ fontSize: 11, color: C.accent, fontWeight: 700 }}>4 members voting</span>
      </div>
      <ScrollArea>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Card 1 — voted yes, collapsed */}
          <div style={{ background: C.card, border: `1px solid ${C.green}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", display: "flex", gap: 12 }}>
              <div style={{ width: 54, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ width: 54, height: 72, borderRadius: 8, background: C.surface, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>{movies[0].thumb}</div>
                <div style={{ background: C.accentDim, border: `1px solid ${C.accent}`, borderRadius: 6, padding: "2px 6px", fontSize: 10, fontWeight: 800, color: C.accent }}>★ {movies[0].score}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 4 }}>{movies[0].title}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                  {[movies[0].year, movies[0].runtime, movies[0].rating].map(t => (
                    <span key={t} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 7px", fontSize: 10, color: C.textMuted }}>{t}</span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <div style={{ flex: 1, background: C.green, borderRadius: 10, padding: "8px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <span style={{ fontSize: 14 }}>✓</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#000" }}>Yes</span>
                  </div>
                  <div style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <span style={{ fontSize: 14, color: C.textMuted }}>✕</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.textMuted }}>No</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2 — trailer expanded */}
          <div style={{ background: C.card, border: `1px solid ${C.accent}`, borderRadius: 16, overflow: "hidden" }}>
            {/* Movie info row */}
            <div style={{ padding: "12px 14px 10px", display: "flex", gap: 12 }}>
              <div style={{ width: 54, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ width: 54, height: 72, borderRadius: 8, background: C.surface, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>{movies[1].thumb}</div>
                <div style={{ background: C.accentDim, border: `1px solid ${C.accent}`, borderRadius: 6, padding: "2px 6px", fontSize: 10, fontWeight: 800, color: C.accent }}>★ {movies[1].score}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 4 }}>{movies[1].title}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
                  {[movies[1].year, movies[1].runtime, movies[1].rating].map(t => (
                    <span key={t} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 7px", fontSize: 10, color: C.textMuted }}>{t}</span>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>{movies[1].blurb}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                  {movies[1].tags.map(tag => (
                    <span key={tag} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 99, padding: "2px 8px", fontSize: 10, color: C.textMuted }}>{tag}</span>
                  ))}
                </div>
                {/* Close trailer button */}
                <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
                  <div style={{
                    background: C.surface, border: `1px solid ${C.border}`,
                    borderRadius: 99, padding: "5px 12px",
                    display: "flex", alignItems: "center", gap: 6,
                    fontSize: 12, fontWeight: 700, color: C.text, cursor: "pointer",
                  }}>
                    <span style={{ fontSize: 10 }}>✕</span> Close trailer
                  </div>
                </div>
              </div>
            </div>

            {/* Trailer player area */}
            <div style={{
              margin: "0 14px 12px",
              borderRadius: 10, overflow: "hidden",
              background: "#000",
              height: 175,
              display: "flex", alignItems: "center", justifyContent: "center",
              position: "relative",
            }}>
              {/* Fake video still */}
              <div style={{
                width: "100%", height: "100%",
                background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexDirection: "column", gap: 8,
              }}>
                <div style={{ fontSize: 40 }}>🏛️</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>Official Trailer</div>
              </div>
              {/* Play button overlay */}
              <div style={{
                position: "absolute",
                width: 48, height: 48, borderRadius: "50%",
                background: "rgba(255,255,255,0.15)",
                border: "2px solid rgba(255,255,255,0.4)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, paddingLeft: 3,
              }}>▶</div>
            </div>

            {/* Yes / No with subtitles */}
            <div style={{ padding: "0 14px 14px", display: "flex", gap: 8 }}>
              <div style={{
                flex: 1, background: C.greenDim, border: `1px solid ${C.green}`,
                borderRadius: 12, padding: "10px 8px",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                cursor: "pointer",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 14, color: C.green }}>✓</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: C.green }}>Yes</span>
                </div>
                <span style={{ fontSize: 10, color: C.green, opacity: 0.7 }}>Keep it in the running</span>
              </div>
              <div style={{
                flex: 1, background: C.redDim, border: `1px solid ${C.red}`,
                borderRadius: 12, padding: "10px 8px",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                cursor: "pointer",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 14, color: C.red }}>✕</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: C.red }}>No</span>
                </div>
                <span style={{ fontSize: 10, color: C.red, opacity: 0.7 }}>Rule it out</span>
              </div>
            </div>
          </div>

          {/* Card 3 — unvoted, collapsed */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", display: "flex", gap: 12 }}>
              <div style={{ width: 54, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ width: 54, height: 72, borderRadius: 8, background: C.surface, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>{movies[2].thumb}</div>
                <div style={{ background: C.accentDim, border: `1px solid ${C.accent}`, borderRadius: 6, padding: "2px 6px", fontSize: 10, fontWeight: 800, color: C.accent }}>★ {movies[2].score}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 4 }}>{movies[2].title}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                  {[movies[2].year, movies[2].runtime, movies[2].rating].map(t => (
                    <span key={t} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 7px", fontSize: 10, color: C.textMuted }}>{t}</span>
                  ))}
                </div>
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px", textAlign: "center", fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 8 }}>▶ Watch Trailer</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <div style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <span style={{ fontSize: 13, color: C.textMuted }}>✓</span><span style={{ fontSize: 13, fontWeight: 700, color: C.textMuted }}>Yes</span>
                  </div>
                  <div style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <span style={{ fontSize: 13, color: C.textMuted }}>✕</span><span style={{ fontSize: 13, fontWeight: 700, color: C.textMuted }}>No</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </ScrollArea>
      <TabBar active="movies" locked={["results"]} movieCount={1} showtimeCount={0} />
    </div>
  );
}

function CountdownNormalScreen() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <AppHeader subtitle="Perkins Family Movie Night" countdown="Voting closes in 3 days, 4 hrs" countdownUrgent={false} />
      <ProgressBar step={1} />
      <ParticipationBanner joined={true} />
      <div style={{ padding: "8px 16px", flexShrink: 0, background: C.surface, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: C.textMuted, flex: 1 }}>1 of 3 movies voted</span>
        <span style={{ fontSize: 11, color: C.accent, fontWeight: 700 }}>4 members voting</span>
      </div>
      <ScrollArea>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <MovieCard movie={movies[0]} mode="voting" voted="yes" canVote={true} />
          <MovieCard movie={movies[1]} mode="voting" voted={null} canVote={true} />
          <MovieCard movie={movies[2]} mode="voting" voted={null} canVote={true} />
        </div>
      </ScrollArea>
      <TabBar active="movies" locked={["results"]} movieCount={1} showtimeCount={0} />
    </div>
  );
}

function CountdownUrgentScreen() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <AppHeader subtitle="Perkins Family Movie Night" countdown="Voting closes in 14 hrs — don't miss it!" countdownUrgent={true} />
      <ProgressBar step={1} />
      <ParticipationBanner joined={true} />
      <div style={{ padding: "8px 16px", flexShrink: 0, background: C.surface, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: C.textMuted, flex: 1 }}>1 of 3 movies voted</span>
        <span style={{ fontSize: 11, color: C.accent, fontWeight: 700 }}>4 members voting</span>
      </div>
      <ScrollArea>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Urgent nudge banner */}
          <div style={{
            background: C.redDim, border: `1px solid ${C.red}`,
            borderRadius: 12, padding: "10px 14px",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>⏰</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.red, marginBottom: 2 }}>Voting closes soon</div>
              <div style={{ fontSize: 11, color: C.textMuted }}>Finish your picks and submit before the window closes.</div>
            </div>
          </div>
          <MovieCard movie={movies[0]} mode="voting" voted="yes" canVote={true} />
          <MovieCard movie={movies[1]} mode="voting" voted={null} canVote={true} />
          <MovieCard movie={movies[2]} mode="voting" voted={null} canVote={true} />
        </div>
      </ScrollArea>
      <TabBar active="movies" locked={["results"]} movieCount={1} showtimeCount={0} />
    </div>
  );
}

function ChangeVoteScreen() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <AppHeader subtitle="Perkins Family Movie Night" countdown="Voting closes in 3 days, 4 hrs" countdownUrgent={false} />
      <ProgressBar step={1} />
      {/* Banner shows "Editing" state */}
      <div style={{ padding: "6px 16px", background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{
          background: C.accentDim, border: `1px solid ${C.accent}`, borderRadius: 8,
          padding: "6px 10px", display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontSize: 12, flexShrink: 0 }}>✏️</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.accent, flex: 1 }}>Editing your vote</span>
          <div style={{
            background: C.accent, color: "#000", fontSize: 11, fontWeight: 700,
            padding: "3px 10px", borderRadius: 6, cursor: "pointer",
          }}>Resubmit</div>
          <div style={{
            background: "rgba(0,0,0,0.25)", color: C.textMuted, fontSize: 11, fontWeight: 700,
            padding: "3px 10px", borderRadius: 6, cursor: "pointer",
            border: `1px solid rgba(255,255,255,0.15)`,
          }}>Opt Out</div>
        </div>
      </div>
      <div style={{ padding: "8px 16px", flexShrink: 0, background: C.surface, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: C.textMuted, flex: 1 }}>2 of 3 movies voted</span>
        <span style={{ fontSize: 11, color: C.accent, fontWeight: 700 }}>4 members voting</span>
      </div>
      <ScrollArea>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Editing indicator card */}
          <div style={{
            background: C.accentDim, border: `1px solid ${C.accent}40`,
            borderRadius: 10, padding: "9px 14px",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>✏️</span>
            <span style={{ fontSize: 12, color: C.accent, fontWeight: 600 }}>
              Editing — your previous vote is still active until you resubmit.
            </span>
          </div>
          <MovieCard movie={movies[0]} mode="voting" voted="yes" canVote={true} />
          <MovieCard movie={movies[1]} mode="voting" voted="no" canVote={true} />
          <MovieCard movie={movies[2]} mode="voting" voted={null} canVote={true} />
        </div>
      </ScrollArea>
      <TabBar active="movies" movieCount={2} showtimeCount={2} />
    </div>
  );
}

function ActiveVotingScreen() {
  const [toast, setToast] = useState(null);

  const handleSubmit = () => {
    // Has movies voted yes but no showtimes confirmed yet
    setToast("Pick at least one showtime before submitting.");
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", position: "relative" }}>
      <AppHeader subtitle="Perkins Family Movie Night" />
      <ProgressBar step={1} />
      <ParticipationBanner joined={true} onSubmit={handleSubmit} />
      <div style={{ padding: "8px 16px", flexShrink: 0, background: C.surface, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: C.textMuted, flex: 1 }}>2 of 3 movies voted</span>
        <span style={{ fontSize: 11, color: C.accent, fontWeight: 700 }}>4 members voting</span>
      </div>
      <ScrollArea>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <MovieCard movie={movies[0]} mode="voting" voted="yes" canVote={true} />
          <MovieCard movie={movies[1]} mode="voting" voted="no" canVote={true} />
          <MovieCard movie={movies[2]} mode="voting" voted={null} canVote={true} />
        </div>
      </ScrollArea>
      <Toast message={toast} />
      <TabBar active="movies" locked={["results"]} movieCount={1} showtimeCount={0} />
    </div>
  );
}

function FlexibleModeScreen() {
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <AppHeader subtitle="Perkins Family Movie Night" />
      <ProgressBar step={2} />
      <ParticipationBanner joined={true} />
      <div style={{ padding: "8px 16px", flexShrink: 0, background: C.surface, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: C.textMuted }}>Pick your showtimes</span>
      </div>
      <ScrollArea>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>

          {/* How it works */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.text, marginBottom: 4 }}>How showtime voting works</div>
            <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>
              Tap <span style={{ color: C.green, fontWeight: 700 }}>✓</span> on showtimes that work for you. Only times you confirm count as available.
            </div>
          </div>

          {/* Flexible toggle — OFF state */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 3 }}>I'm In — Whatever You Choose!</div>
              <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.4 }}>Skip showtime voting and count yourself as available for every showtime.</div>
            </div>
            {/* Toggle off */}
            <div style={{
              width: 44, height: 26, borderRadius: 99, background: C.border,
              display: "flex", alignItems: "center", padding: "0 3px", flexShrink: 0, cursor: "pointer",
            }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", background: C.textDim }} />
            </div>
          </div>

          {/* Location filter */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, letterSpacing: "0.1em", marginBottom: 8 }}>FILTER LOCATIONS</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {["AMC River Oaks", "Regal Westway", "Alamo Drafthouse"].map((loc, i) => (
                <div key={loc} style={{
                  background: i === 0 ? C.surface : "transparent",
                  border: `1px solid ${i === 0 ? C.borderLight : C.border}`,
                  borderRadius: 99, padding: "5px 12px",
                  fontSize: 11, fontWeight: 600,
                  color: i === 0 ? C.text : C.textMuted, cursor: "pointer",
                }}>{loc}</div>
              ))}
            </div>
          </div>

          {/* Date group */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13 }}>📅</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>Friday, May 30</span>
          </div>

          {/* Showtime cards — opt-in model, default unavailable */}
          {[
            { movie: movies[0], time: "7:00 PM", theater: "AMC River Oaks", price: "$16", seats: 12, available: true },
            { movie: movies[0], time: "9:30 PM", theater: "AMC River Oaks", price: "$16", seats: 4, available: false },
            { movie: movies[2], time: "7:15 PM", theater: "Regal Westway", price: "$14", seats: 8, available: false },
          ].map((s, i) => (
            <div key={i} style={{
              background: C.card, borderRadius: 14,
              border: `1px solid ${s.available ? C.green : C.border}`,
              padding: "12px 14px",
              opacity: s.available ? 1 : 0.5,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>{s.movie.thumb}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{s.movie.title}</div>
                  <div style={{ fontSize: 11, color: C.textMuted }}>{s.theater}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: s.available ? C.accent : C.textDim }}>{s.time}</div>
                    <div style={{ fontSize: 10, color: C.textMuted }}>{s.price} · {s.seats} seats</div>
                  </div>
                  {/* Single confirm toggle */}
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: s.available ? C.greenDim : C.surface,
                    border: `1px solid ${s.available ? C.green : C.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", fontSize: 16,
                    color: s.available ? C.green : C.textDim,
                  }}>✓</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      <TabBar active="showtimes" locked={["results"]} movieCount={1} showtimeCount={0} />
    </div>
  );
}

// Flexible mode ON state
function FlexibleModeOnScreen() {
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <AppHeader subtitle="Perkins Family Movie Night" />
      <ProgressBar step={2} />
      <ParticipationBanner joined={true} />
      <div style={{ padding: "8px 16px", flexShrink: 0, background: C.surface, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: C.textMuted }}>Pick your showtimes</span>
      </div>
      <ScrollArea>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>

          {/* How it works */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.text, marginBottom: 4 }}>How showtime voting works</div>
            <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>
              Tap <span style={{ color: C.green, fontWeight: 700 }}>✓</span> on showtimes that work for you. Only times you confirm count as available.
            </div>
          </div>

          {/* Flexible toggle — ON state */}
          <div style={{
            background: C.card, border: `1px solid ${C.accent}`,
            borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 3 }}>I'm In — Whatever You Choose!</div>
              <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.4 }}>Skip showtime voting and count yourself as available for every showtime.</div>
            </div>
            {/* Toggle on */}
            <div style={{
              width: 44, height: 26, borderRadius: 99, background: C.accent,
              display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 3px", flexShrink: 0, cursor: "pointer",
            }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#000" }} />
            </div>
          </div>

          {/* Flexible confirmation */}
          <div style={{
            background: `linear-gradient(135deg, ${C.accentDim}, ${C.card})`,
            border: `1px solid ${C.accent}`, borderRadius: 16,
            padding: "20px 16px", textAlign: "center",
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: C.accent, marginBottom: 8 }}>You're flexible!</div>
            <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6 }}>
              Your vote counts as approval for every showtime combination. You're all set unless you want to turn flexible mode back off.
            </div>
          </div>

        </div>
      </ScrollArea>
      <TabBar active="showtimes" locked={["results"]} movieCount={1} showtimeCount={1} />
    </div>
  );
}

function ResultsNoVotesScreen() {
  const members = [
    { name: "L", color: "#22C55E", voted: false },
    { name: "A", color: "#F59E0B", voted: false },
    { name: "M", color: "#F59E0B", voted: false },
    { name: "T", color: "#3B82F6", voted: false },
    { name: "S", color: "#8B5CF6", voted: false },
  ];

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <AppHeader subtitle="Perkins Family Movie Night" />
      <ProgressBar step={0} />
      <ParticipationBanner joined={true} />
      <ScrollArea>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Group progress — all pending */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.text, flex: 1 }}>Group progress</span>
              <div style={{ display: "flex" }}>
                {members.map((m, i) => (
                  <div key={i} style={{
                    width: 24, height: 24, borderRadius: "50%",
                    background: C.border,
                    border: `2px solid ${C.card}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 800, color: C.textDim,
                    marginLeft: i > 0 ? -6 : 0,
                  }}>{m.name}</div>
                ))}
              </div>
              <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 6 }}>▾</span>
            </div>
            <div style={{ padding: "0 14px 12px", display: "flex", flexWrap: "wrap", gap: 6 }}>
              {members.map((m, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: C.surface, borderRadius: 99, padding: "4px 10px",
                  border: `1px solid ${C.border}`,
                }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%",
                    background: C.border,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, fontWeight: 800, color: C.textDim,
                  }}>{m.name}</div>
                  <span style={{ fontSize: 11, color: C.textDim }}>
                    {["Laurie", "Alex", "Miranda", "Tony", "Sam"][i]}
                  </span>
                  <span style={{ fontSize: 10, color: C.textDim }}>· pending</span>
                </div>
              ))}
            </div>
          </div>

          {/* Section label */}
          <div style={{ padding: "2px 2px 0" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, letterSpacing: "0.1em" }}>GROUP STANDINGS</span>
          </div>

          {/* Empty state */}
          <div style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 14, padding: "40px 24px",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 36 }}>🍿</span>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>No votes yet</div>
            <div style={{ fontSize: 12, color: C.textMuted, textAlign: "center", lineHeight: 1.6 }}>
              Standings will appear here as your group starts voting.
            </div>
          </div>

        </div>
      </ScrollArea>
      <TabBar active="results" movieCount={0} showtimeCount={0} />
    </div>
  );
}

function ResultsOthersVotedScreen() {
  const members = [
    { name: "L", color: "#22C55E", voted: true },
    { name: "A", color: "#F59E0B", voted: true },
    { name: "M", color: "#F59E0B", voted: false },
    { name: "T", color: "#3B82F6", voted: true },
    { name: "S", color: "#8B5CF6", voted: false }, // Sam hasn't voted
  ];

  const totalMembers = 5;

  const results = [
    {
      movie: movies[2], time: "7:15 PM", theater: "Regal Westway",
      voterCount: 3,
      voters: [members[0], members[1], members[3]],
    },
    {
      movie: movies[0], time: "7:00 PM", theater: "AMC River Oaks",
      voterCount: 2,
      voters: [members[0], members[3]],
    },
    {
      movie: movies[1], time: "6:45 PM", theater: "Alamo Drafthouse",
      voterCount: 1,
      voters: [members[1]],
    },
  ];

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <AppHeader subtitle="Perkins Family Movie Night" />
      <ProgressBar step={0} />
      <ParticipationBanner joined={true} />
      <ScrollArea>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Group progress */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.text, flex: 1 }}>Group progress</span>
              <div style={{ display: "flex" }}>
                {members.map((m, i) => (
                  <div key={i} style={{
                    width: 24, height: 24, borderRadius: "50%",
                    background: m.voted ? m.color : C.border,
                    border: `2px solid ${C.card}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 800, color: m.voted ? "#000" : C.textDim,
                    marginLeft: i > 0 ? -6 : 0,
                  }}>{m.name}</div>
                ))}
              </div>
              <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 6 }}>▾</span>
            </div>
            <div style={{ padding: "0 14px 12px", display: "flex", flexWrap: "wrap", gap: 6 }}>
              {members.map((m, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: C.surface, borderRadius: 99, padding: "4px 10px",
                  border: `1px solid ${m.voted ? m.color + "40" : C.border}`,
                }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%",
                    background: m.voted ? m.color : C.border,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, fontWeight: 800, color: m.voted ? "#000" : C.textDim,
                  }}>{m.name}</div>
                  <span style={{ fontSize: 11, color: m.voted ? C.text : C.textDim }}>
                    {["Laurie", "Alex", "Miranda", "Tony", "Sam"][i]}
                  </span>
                  {!m.voted && <span style={{ fontSize: 10, color: C.textDim }}>· pending</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Nudge to vote */}
          <div style={{
            background: C.card, border: `1px solid ${C.accent}`,
            borderRadius: 12, padding: "10px 14px",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>👋</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.accent, marginBottom: 2 }}>Your vote isn't in yet</div>
              <div style={{ fontSize: 11, color: C.textMuted }}>3 members have voted. Add yours to influence the result.</div>
            </div>
          </div>

          {/* Section label — no filter since no my picks */}
          <div style={{ padding: "2px 2px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, letterSpacing: "0.1em" }}>GROUP STANDINGS</span>
            <span style={{ fontSize: 10, color: C.textDim }}>live · updates as votes come in</span>
          </div>

          {/* Results — no MY PICK tags, no green borders */}
          {results.map((r, i) => (
            <div key={i} style={{
              background: i === 0 ? `linear-gradient(135deg, rgba(232,160,32,0.1), ${C.card})` : C.card,
              border: `1px solid ${i === 0 ? C.accent : C.border}`,
              borderRadius: 14, padding: "12px 14px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                  background: i === 0 ? C.accent : C.surface,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 900,
                  color: i === 0 ? "#000" : C.textMuted,
                }}>#{i + 1}</div>
                <span style={{ fontSize: 20 }}>{r.movie.thumb}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{r.movie.title}</div>
                  <div style={{ fontSize: 11, color: C.textMuted }}>{r.time} · {r.theater}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: i === 0 ? C.accent : C.textMuted }}>
                    {r.voterCount}
                    <span style={{ fontSize: 10, color: C.textDim, fontWeight: 400 }}> / {totalMembers}</span>
                  </div>
                  <div style={{ fontSize: 9, color: C.textDim }}>members</div>
                </div>
              </div>
              <div style={{ height: 3, background: C.border, borderRadius: 99, overflow: "hidden", marginBottom: 10 }}>
                <div style={{
                  height: "100%", borderRadius: 99,
                  width: `${(r.voterCount / totalMembers) * 100}%`,
                  background: i === 0 ? C.accent : C.borderLight,
                }} />
              </div>
              <div style={{ display: "flex", gap: 5 }}>
                {r.voters.map((v, j) => (
                  <div key={j} style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: v.color, border: `2px solid ${C.card}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, fontWeight: 800, color: "#000",
                  }}>{v.name}</div>
                ))}
              </div>
            </div>
          ))}

          <CTAButton label="Go Vote Now →" variant="primary" />

        </div>
      </ScrollArea>
      <TabBar active="results" movieCount={0} showtimeCount={0} />
    </div>
  );
}

function ResultsReviewScreen() {
  const [filter, setFilter] = useState("all");

  const members = [
    { name: "L", color: "#22C55E", voted: true },
    { name: "A", color: "#F59E0B", voted: true },
    { name: "M", color: "#F59E0B", voted: false },
    { name: "T", color: "#3B82F6", voted: false },
    { name: "S", color: "#8B5CF6", voted: true },
  ];

  const totalMembers = 5;

  const allResults = [
    {
      movie: movies[2], time: "7:15 PM", theater: "Regal Westway",
      voterCount: 4, myPick: true,
      voters: [members[0], members[1], members[4], members[3]],
    },
    {
      movie: movies[0], time: "7:00 PM", theater: "AMC River Oaks",
      voterCount: 3, myPick: true,
      voters: [members[0], members[2], members[4]],
    },
    {
      movie: movies[0], time: "9:30 PM", theater: "AMC River Oaks",
      voterCount: 2, myPick: false,
      voters: [members[1], members[3]],
    },
    {
      movie: movies[1], time: "6:45 PM", theater: "Alamo Drafthouse",
      voterCount: 1, myPick: false,
      voters: [members[2]],
    },
  ];

  const filtered = filter === "mine" ? allResults.filter(r => r.myPick) : allResults;

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <AppHeader subtitle="Perkins Family Movie Night" />
      <ProgressBar step={4} />
      <ParticipationBanner joined={true} submitted={true} />
      <ScrollArea>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Group progress — collapsible */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.text, flex: 1 }}>Group progress</span>
              <div style={{ display: "flex" }}>
                {members.map((m, i) => (
                  <div key={i} style={{
                    width: 24, height: 24, borderRadius: "50%",
                    background: m.voted ? m.color : C.border,
                    border: `2px solid ${C.card}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 800, color: m.voted ? "#000" : C.textDim,
                    marginLeft: i > 0 ? -6 : 0,
                  }}>{m.name}</div>
                ))}
              </div>
              <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 6 }}>▾</span>
            </div>
            <div style={{ padding: "0 14px 12px", display: "flex", flexWrap: "wrap", gap: 6 }}>
              {members.map((m, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: C.surface, borderRadius: 99, padding: "4px 10px",
                  border: `1px solid ${m.voted ? m.color + "40" : C.border}`,
                }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%",
                    background: m.voted ? m.color : C.border,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, fontWeight: 800, color: m.voted ? "#000" : C.textDim,
                  }}>{m.name}</div>
                  <span style={{ fontSize: 11, color: m.voted ? C.text : C.textDim }}>
                    {["Laurie", "Alex", "Miranda", "Tony", "Sam"][i]}
                  </span>
                  {!m.voted && <span style={{ fontSize: 10, color: C.textDim }}>· pending</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Filter + label row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 2px 0" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, letterSpacing: "0.1em" }}>GROUP STANDINGS</span>
            <div style={{ display: "flex", gap: 6 }}>
              {[["all", "All"], ["mine", "My Picks"]].map(([val, label]) => (
                <div key={val} onClick={() => setFilter(val)} style={{
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                  padding: "4px 12px", borderRadius: 99,
                  background: filter === val ? C.accent : C.card,
                  color: filter === val ? "#000" : C.textMuted,
                  border: `1px solid ${filter === val ? C.accent : C.border}`,
                }}>{label}</div>
              ))}
            </div>
          </div>

          {/* Ranked results */}
          {filtered.map((r, i) => {
            const globalRank = allResults.indexOf(r);
            const isTop = globalRank === 0;
            return (
              <div key={i} style={{
                background: isTop && filter === "all" ? `linear-gradient(135deg, rgba(232,160,32,0.1), ${C.card})` : C.card,
                border: `1px solid ${r.myPick ? C.green : isTop && filter === "all" ? C.accent : C.border}`,
                borderRadius: 14, padding: "12px 14px",
                position: "relative", overflow: "hidden",
              }}>
                {r.myPick && (
                  <div style={{
                    position: "absolute", top: 0, right: 0,
                    background: C.green, color: "#000",
                    fontSize: 9, fontWeight: 800, letterSpacing: "0.05em",
                    padding: "3px 8px", borderBottomLeftRadius: 8,
                  }}>MY PICK</div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                    background: isTop && filter === "all" ? C.accent : C.surface,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 900,
                    color: isTop && filter === "all" ? "#000" : C.textMuted,
                  }}>#{globalRank + 1}</div>

                  <span style={{ fontSize: 20 }}>{r.movie.thumb}</span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{r.movie.title}</div>
                    <div style={{ fontSize: 11, color: C.textMuted }}>{r.time} · {r.theater}</div>
                  </div>

                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 900, color: isTop && filter === "all" ? C.accent : C.textMuted }}>
                      {r.voterCount}
                      <span style={{ fontSize: 10, color: C.textDim, fontWeight: 400 }}> / {totalMembers}</span>
                    </div>
                    <div style={{ fontSize: 9, color: C.textDim }}>members</div>
                  </div>
                </div>

                <div style={{ height: 3, background: C.border, borderRadius: 99, overflow: "hidden", marginBottom: 10 }}>
                  <div style={{
                    height: "100%", borderRadius: 99,
                    width: `${(r.voterCount / totalMembers) * 100}%`,
                    background: isTop && filter === "all" ? C.accent : r.myPick ? C.green : C.borderLight,
                  }} />
                </div>

                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {r.voters.map((v, j) => (
                    <div key={j} style={{
                      width: 22, height: 22, borderRadius: "50%",
                      background: v.color, border: `2px solid ${C.card}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9, fontWeight: 800, color: "#000",
                    }}>{v.name}</div>
                  ))}
                </div>
              </div>
            );
          })}

          <CTAButton label="Get Tickets for #1 →" variant="primary" />

        </div>
      </ScrollArea>
      <TabBar active="results" movieCount={2} showtimeCount={2} />
    </div>
  );
}

function VoteSubmittedScreen() {
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <AppHeader subtitle="Perkins Family Movie Night" />
      <ProgressBar step={4} />
      <ParticipationBanner joined={true} submitted={true} />
      <ScrollArea>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Movies — info only, no Yes/No, submitted picks shown with green badge */}
          {movies.map((movie, i) => (
            <div key={movie.id} style={{
              background: C.card,
              border: `1px solid ${i < 2 ? C.green : C.border}`,
              borderRadius: 16, overflow: "hidden",
              opacity: i < 2 ? 1 : 0.5,
            }}>
              {/* My pick badge on voted movies */}
              {i < 2 && (
                <div style={{
                  background: C.green, color: "#000",
                  fontSize: 9, fontWeight: 800, letterSpacing: "0.05em",
                  padding: "3px 10px", display: "inline-block",
                }}>✓ YOUR PICK</div>
              )}
              <div style={{ padding: "12px 14px", display: "flex", gap: 12 }}>
                <div style={{
                  width: 54, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                }}>
                  <div style={{
                    width: 54, height: 72, borderRadius: 8, background: C.surface,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28,
                  }}>{movie.thumb}</div>
                  <div style={{
                    background: C.accentDim, border: `1px solid ${C.accent}`,
                    borderRadius: 6, padding: "2px 6px",
                    fontSize: 10, fontWeight: 800, color: C.accent,
                  }}>★ {movie.score}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 4 }}>{movie.title}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                    {[movie.year, movie.runtime, movie.rating].map(t => (
                      <span key={t} style={{
                        background: C.surface, border: `1px solid ${C.border}`,
                        borderRadius: 6, padding: "2px 7px", fontSize: 10, color: C.textMuted,
                      }}>{t}</span>
                    ))}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                    {movie.tags.map(tag => (
                      <span key={tag} style={{
                        background: C.surface, border: `1px solid ${C.border}`,
                        borderRadius: 99, padding: "2px 8px", fontSize: 10, color: C.textMuted,
                      }}>{tag}</span>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5, marginBottom: 10 }}>{movie.blurb}</div>
                  {/* Watch Trailer only — no vote buttons */}
                  <div style={{
                    background: C.surface, border: `1px solid ${C.border}`,
                    borderRadius: 10, padding: "8px", textAlign: "center",
                    fontSize: 12, fontWeight: 700, color: C.textMuted, cursor: "pointer",
                  }}>▶ Watch Trailer</div>
                </div>
              </div>
            </div>
          ))}

          {/* View Results CTA */}
          <CTAButton label="View Live Results →" variant="primary" />

        </div>
      </ScrollArea>
      <TabBar active="movies" movieCount={2} showtimeCount={2} />
    </div>
  );
}

// ─── Secure Entry — Wrong PIN ─────────────────────────────────────
function SecureEntryWrongPinScreen() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: C.bg, alignItems: "center", justifyContent: "center", padding: "24px 32px" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🎟️</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: C.text, marginBottom: 4 }}>You're Invited</div>
      <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 32 }}>Perkins Family Movie Night · Fri May 30</div>

      <div style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "20px", marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.red, letterSpacing: "0.08em", textAlign: "center", marginBottom: 14 }}>
          ENTER 4-DIGIT PIN
        </div>
        {/* PIN dots — all filled, red tint */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 16 }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              width: 44, height: 44, borderRadius: 10,
              background: C.redDim,
              border: `2px solid ${C.red}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, color: C.red, fontWeight: 900,
            }}>●</div>
          ))}
        </div>
        {/* Error message */}
        <div style={{
          background: C.redDim, border: `1px solid ${C.red}`,
          borderRadius: 8, padding: "8px 12px",
          fontSize: 12, color: C.red, textAlign: "center", fontWeight: 600,
          marginBottom: 16,
        }}>Incorrect PIN. Please try again.</div>

        {/* Keypad */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {[1,2,3,4,5,6,7,8,9,null,0,"⌫"].map((k, i) => (
            <div key={i} style={{
              height: 48, borderRadius: 10,
              background: k === null ? "transparent" : C.card,
              border: k === null ? "none" : `1px solid ${C.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: k === "⌫" ? 18 : 20, fontWeight: 700,
              color: C.text, cursor: k === null ? "default" : "pointer",
            }}>{k}</div>
          ))}
        </div>
      </div>

      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
        <CTAButton label="Join as Voter" variant="primary" disabled />
        <CTAButton label="Preview Without Voting" variant="secondary" />
      </div>
      <div style={{ marginTop: 20, fontSize: 12, color: C.textDim }}>🔒 End-to-end encrypted · invite-only</div>
    </div>
  );
}

// ─── Opted Out State ──────────────────────────────────────────────
function OptedOutScreen() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <AppHeader subtitle="Perkins Family Movie Night" />
      <ProgressBar step={1} />
      {/* Opted out banner — muted, grey */}
      <div style={{
        padding: "10px 14px", flexShrink: 0,
        background: C.surface, borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.textDim, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: C.textMuted, flex: 1 }}>You opted out</span>
        <div style={{
          background: C.accent, borderRadius: 8, padding: "6px 14px",
          fontSize: 12, fontWeight: 800, color: "#000", cursor: "pointer",
        }}>Rejoin</div>
      </div>
      <ScrollArea>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Opted out info card */}
          <div style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 12, padding: "14px",
            display: "flex", gap: 12, alignItems: "flex-start",
          }}>
            <span style={{ fontSize: 24, flexShrink: 0 }}>👋</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 4 }}>You've opted out of this vote</div>
              <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>
                You can still browse movies and see results. Tap Rejoin anytime to cast your vote before the poll closes.
              </div>
            </div>
          </div>
          {/* Movies — info only, dimmed */}
          {movies.map((movie) => (
            <div key={movie.id} style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 16, overflow: "hidden", opacity: 0.6,
            }}>
              <div style={{ padding: "12px 14px", display: "flex", gap: 12 }}>
                <div style={{ width: 54, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 54, height: 72, borderRadius: 8, background: C.surface, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>{movie.thumb}</div>
                  <div style={{ background: C.accentDim, border: `1px solid ${C.accent}`, borderRadius: 6, padding: "2px 6px", fontSize: 10, fontWeight: 800, color: C.accent }}>★ {movie.score}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 4 }}>{movie.title}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                    {[movie.year, movie.runtime, movie.rating].map(t => (
                      <span key={t} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 7px", fontSize: 10, color: C.textMuted }}>{t}</span>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5, marginBottom: 10 }}>{movie.blurb}</div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px", textAlign: "center", fontSize: 12, fontWeight: 700, color: C.textMuted }}>▶ Watch Trailer</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      <TabBar active="movies" movieCount={0} showtimeCount={0} />
    </div>
  );
}

// ─── Showtimes — Vote Submitted (read-only) ───────────────────────
function ShowtimesSubmittedScreen() {
  const confirmedShowtimes = [
    { movieTitle: "Thunderbolts", time: "7:15 PM", theater: "Regal Westway", price: "$16", seats: 8 },
    { movieTitle: "Dune: Messiah", time: "7:00 PM", theater: "AMC River Oaks", price: "$16", seats: 12 },
  ];
  const otherShowtimes = [
    { movieTitle: "Dune: Messiah", time: "9:30 PM", theater: "AMC River Oaks", price: "$16", seats: 4 },
    { movieTitle: "The Brutalist", time: "6:45 PM", theater: "Alamo Drafthouse", price: "$14", seats: 20 },
  ];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <AppHeader subtitle="Perkins Family Movie Night" />
      <ProgressBar step={4} />
      <ParticipationBanner joined={true} submitted={true} />
      <ScrollArea>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Your confirmed times */}
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, letterSpacing: "0.1em", padding: "2px 2px 0" }}>YOUR CONFIRMED TIMES</div>
          {confirmedShowtimes.map((s, i) => (
            <div key={i} style={{
              background: C.card, border: `1px solid ${C.green}`,
              borderRadius: 14, padding: "12px 14px",
              display: "flex", alignItems: "center", gap: 12,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, background: C.greenDim,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, flexShrink: 0,
              }}>✓</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{s.movieTitle}</div>
                <div style={{ fontSize: 11, color: C.textMuted }}>{s.time} · {s.theater}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.green }}>{s.time}</div>
                <div style={{ fontSize: 10, color: C.textDim }}>{s.price} · {s.seats} seats</div>
              </div>
            </div>
          ))}

          {/* Other showtimes — locked */}
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, letterSpacing: "0.1em", padding: "6px 2px 0" }}>OTHER SHOWTIMES</div>
          {otherShowtimes.map((s, i) => (
            <div key={i} style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 14, padding: "12px 14px",
              display: "flex", alignItems: "center", gap: 12,
              opacity: 0.5,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, background: C.surface,
                border: `1px solid ${C.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, color: C.textDim, flexShrink: 0,
              }}>🔒</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.textMuted }}>{s.movieTitle}</div>
                <div style={{ fontSize: 11, color: C.textDim }}>{s.time} · {s.theater}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.textDim }}>{s.time}</div>
                <div style={{ fontSize: 10, color: C.textDim }}>{s.price} · {s.seats} seats</div>
              </div>
            </div>
          ))}

          <CTAButton label="View Live Results →" variant="primary" />
        </div>
      </ScrollArea>
      <TabBar active="showtimes" movieCount={2} showtimeCount={2} />
    </div>
  );
}

// ─── Results — Preview Mode (not joined) ─────────────────────────
function ResultsPreviewScreen() {
  const members = [
    { name: "L", color: "#22C55E", voted: true },
    { name: "A", color: "#F59E0B", voted: true },
    { name: "M", color: "#F59E0B", voted: true },
    { name: "T", color: "#3B82F6", voted: false },
    { name: "S", color: "#8B5CF6", voted: false },
  ];
  const results = [
    { movie: movies[2], time: "7:15 PM", theater: "Regal Westway", voterCount: 3, voters: [members[0], members[1], members[2]] },
    { movie: movies[0], time: "7:00 PM", theater: "AMC River Oaks", voterCount: 2, voters: [members[0], members[2]] },
    { movie: movies[1], time: "6:45 PM", theater: "Alamo Drafthouse", voterCount: 1, voters: [members[1]] },
  ];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <AppHeader subtitle="Perkins Family Movie Night" />
      <ProgressBar step={0} />
      {/* Preview mode blue banner */}
      <div style={{
        padding: "10px 14px", flexShrink: 0,
        background: C.blueDim, borderBottom: `1px solid ${C.blue}40`,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.blue, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: C.blue, flex: 1 }}>Preview Mode</span>
        <div style={{
          background: C.blue, borderRadius: 8, padding: "6px 14px",
          fontSize: 12, fontWeight: 800, color: "#fff", cursor: "pointer",
        }}>Join to Vote</div>
      </div>
      <ScrollArea>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Join nudge */}
          <div style={{ background: C.card, border: `1px solid ${C.blue}60`, borderRadius: 12, padding: "10px 14px", display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>🗳️</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.blue, marginBottom: 2 }}>You're not in this vote</div>
              <div style={{ fontSize: 11, color: C.textMuted }}>Join to cast your picks and influence the group's decision.</div>
            </div>
          </div>

          <div style={{ padding: "2px 2px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, letterSpacing: "0.1em" }}>LIVE STANDINGS</span>
            <span style={{ fontSize: 10, color: C.textDim }}>3 / 5 voted</span>
          </div>

          {results.map((r, i) => (
            <div key={i} style={{
              background: i === 0 ? `linear-gradient(135deg, rgba(232,160,32,0.1), ${C.card})` : C.card,
              border: `1px solid ${i === 0 ? C.accent : C.border}`,
              borderRadius: 14, padding: "12px 14px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, background: i === 0 ? C.accent : C.surface, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: i === 0 ? "#000" : C.textMuted }}>#{i + 1}</div>
                <span style={{ fontSize: 20 }}>{r.movie.thumb}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{r.movie.title}</div>
                  <div style={{ fontSize: 11, color: C.textMuted }}>{r.time} · {r.theater}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: i === 0 ? C.accent : C.textMuted }}>{r.voterCount}<span style={{ fontSize: 10, color: C.textDim, fontWeight: 400 }}> / 5</span></div>
                  <div style={{ fontSize: 9, color: C.textDim }}>members</div>
                </div>
              </div>
              <div style={{ height: 3, background: C.border, borderRadius: 99, overflow: "hidden", marginBottom: 10 }}>
                <div style={{ height: "100%", borderRadius: 99, width: `${(r.voterCount / 5) * 100}%`, background: i === 0 ? C.accent : C.borderLight }} />
              </div>
              <div style={{ display: "flex", gap: 5 }}>
                {r.voters.map((v, j) => (
                  <div key={j} style={{ width: 22, height: 22, borderRadius: "50%", background: v.color, border: `2px solid ${C.card}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: "#000" }}>{v.name}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      <TabBar active="results" movieCount={0} showtimeCount={0} />
    </div>
  );
}

// ─── Results — All Members Voted ─────────────────────────────────
function ResultsAllVotedScreen() {
  const members = [
    { name: "L", color: "#22C55E" },
    { name: "A", color: "#F59E0B" },
    { name: "M", color: "#F59E0B" },
    { name: "T", color: "#3B82F6" },
    { name: "S", color: "#8B5CF6" },
  ];
  const results = [
    { movie: movies[2], time: "7:15 PM", theater: "Regal Westway", voterCount: 4, myPick: true, voters: members.slice(0, 4) },
    { movie: movies[0], time: "7:00 PM", theater: "AMC River Oaks", voterCount: 3, myPick: true, voters: [members[0], members[2], members[4]] },
    { movie: movies[1], time: "6:45 PM", theater: "Alamo Drafthouse", voterCount: 1, myPick: false, voters: [members[1]] },
  ];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <AppHeader subtitle="Perkins Family Movie Night" />
      <ProgressBar step={4} />
      <ParticipationBanner joined={true} submitted={true} />
      <ScrollArea>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>

          {/* All voted celebration card */}
          <div style={{
            background: `linear-gradient(135deg, ${C.greenDim}, ${C.card})`,
            border: `1px solid ${C.green}`,
            borderRadius: 12, padding: "12px 14px",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <span style={{ fontSize: 24, flexShrink: 0 }}>🎉</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.green, marginBottom: 2 }}>Everyone has voted!</div>
              <div style={{ fontSize: 11, color: C.textMuted }}>All 5 members are in. These are your final standings.</div>
            </div>
            <div style={{ display: "flex", flexShrink: 0 }}>
              {members.map((m, i) => (
                <div key={i} style={{ width: 22, height: 22, borderRadius: "50%", background: m.color, border: `2px solid ${C.card}`, marginLeft: i > 0 ? -6 : 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: "#000" }}>{m.name}</div>
              ))}
            </div>
          </div>

          <div style={{ padding: "2px 2px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, letterSpacing: "0.1em" }}>FINAL STANDINGS</span>
            <div style={{ display: "flex", gap: 6 }}>
              {["All", "My Picks"].map((f, i) => (
                <div key={f} style={{ background: i === 0 ? C.accent : C.surface, border: `1px solid ${i === 0 ? C.accent : C.border}`, borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: 700, color: i === 0 ? "#000" : C.textMuted }}>{f}</div>
              ))}
            </div>
          </div>

          {results.map((r, i) => (
            <div key={i} style={{
              background: i === 0 ? `linear-gradient(135deg, rgba(232,160,32,0.12), ${C.card})` : C.card,
              border: `1px solid ${r.myPick ? C.green : i === 0 ? C.accent : C.border}`,
              borderRadius: 14, overflow: "hidden",
            }}>
              {r.myPick && (
                <div style={{ background: C.green, color: "#000", fontSize: 9, fontWeight: 800, letterSpacing: "0.05em", padding: "3px 10px" }}>✓ MY PICK</div>
              )}
              <div style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, background: i === 0 ? C.accent : C.surface, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: i === 0 ? "#000" : C.textMuted }}>#{i + 1}</div>
                  <span style={{ fontSize: 20 }}>{r.movie.thumb}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{r.movie.title}</div>
                    <div style={{ fontSize: 11, color: C.textMuted }}>{r.time} · {r.theater}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 900, color: i === 0 ? C.accent : C.textMuted }}>{r.voterCount}<span style={{ fontSize: 10, color: C.textDim, fontWeight: 400 }}> / 5</span></div>
                    <div style={{ fontSize: 9, color: C.textDim }}>members</div>
                  </div>
                </div>
                <div style={{ height: 3, background: C.border, borderRadius: 99, overflow: "hidden", marginBottom: 10 }}>
                  <div style={{ height: "100%", borderRadius: 99, width: `${(r.voterCount / 5) * 100}%`, background: i === 0 ? C.accent : r.myPick ? C.green : C.borderLight }} />
                </div>
                <div style={{ display: "flex", gap: 5 }}>
                  {r.voters.map((v, j) => (
                    <div key={j} style={{ width: 22, height: 22, borderRadius: "50%", background: v.color, border: `2px solid ${C.card}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: "#000" }}>{v.name}</div>
                  ))}
                </div>
              </div>
            </div>
          ))}
          <CTAButton label="Get Tickets for #1 →" variant="primary" />
        </div>
      </ScrollArea>
      <TabBar active="results" movieCount={2} showtimeCount={2} />
    </div>
  );
}

// ─── Results — Poll Closed / Winner Decided ───────────────────────
function ResultsPollClosedScreen() {
  const members = [
    { name: "L", color: "#22C55E", voted: true },
    { name: "A", color: "#F59E0B", voted: true },
    { name: "M", color: "#F59E0B", voted: true },
    { name: "T", color: "#3B82F6", voted: true },
    { name: "S", color: "#8B5CF6", voted: true },
  ];
  const [progressOpen, setProgressOpen] = useState(false);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <AppHeader subtitle="Perkins Family Movie Night" />
      <ProgressBar step={4} />
      {/* Closed banner — no submit, no opt out */}
      <div style={{
        padding: "8px 16px", flexShrink: 0,
        background: C.accentDim, borderBottom: `1px solid ${C.accent}40`,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 13 }}>🏆</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.accent, flex: 1 }}>Poll closed · Winner decided</span>
        <span style={{ fontSize: 11, color: C.textMuted }}>Fri May 30</span>
      </div>
      <ScrollArea>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Poll closed context card */}
          <div style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 14, padding: "14px 16px",
          }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: C.text, marginBottom: 6 }}>Perkins Family Movie Night</div>
            <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6, marginBottom: 14 }}>
              This poll is closed. These standings reflect the final locked outcome.
            </div>
            <CTAButton label="🎟 Get Tickets →" variant="primary" />
          </div>

          {/* Official Plan card */}
          <div style={{
            background: `linear-gradient(135deg, rgba(232,160,32,0.12), ${C.card})`,
            border: `1px solid ${C.accent}`,
            borderRadius: 14, padding: "14px 16px",
          }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: C.accent, letterSpacing: "0.1em", marginBottom: 12 }}>🏆 OFFICIAL PLAN</div>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{
                width: 60, height: 80, borderRadius: 8, background: C.surface,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 30, flexShrink: 0,
              }}>⚡</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: C.text, marginBottom: 2 }}>Thunderbolts</div>
                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>Friday, May 30</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: C.accent, marginBottom: 4 }}>7:15 PM</div>
                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>Regal Westway · $16 · 8 seats</div>
                {/* Links row */}
                <div style={{ display: "flex", gap: 10 }}>
                  {["Website", "Location", "Directions"].map(link => (
                    <div key={link} style={{
                      fontSize: 11, fontWeight: 700, color: C.accent,
                      borderBottom: `1px solid ${C.accent}60`,
                      paddingBottom: 1, cursor: "pointer",
                    }}>{link}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Group progress collapsible */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
            <div
              onClick={() => setProgressOpen(!progressOpen)}
              style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
            >
              <span style={{ fontSize: 13, fontWeight: 800, color: C.text, flex: 1 }}>Group progress</span>
              <div style={{ display: "flex" }}>
                {members.slice(0, 3).map((m, i) => (
                  <div key={i} style={{ width: 24, height: 24, borderRadius: "50%", background: m.color, border: `2px solid ${C.card}`, marginLeft: i > 0 ? -6 : 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#000" }}>{m.name}</div>
                ))}
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: C.borderLight, border: `2px solid ${C.card}`, marginLeft: -6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: C.textMuted }}>+2</div>
              </div>
              <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 4 }}>{progressOpen ? "▴" : "▾"}</span>
            </div>
            {progressOpen && (
              <div style={{ padding: "0 14px 12px", display: "flex", flexWrap: "wrap", gap: 6 }}>
                {members.map((m, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: C.surface, borderRadius: 99, padding: "4px 10px",
                    border: `1px solid ${m.color}40`,
                  }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: m.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: "#000" }}>{m.name}</div>
                    <span style={{ fontSize: 11, color: C.text }}>{["Laurie", "Alex", "Miranda", "Tony", "Sam"][i]}</span>
                    <span style={{ fontSize: 10, color: C.green }}>✓</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Your choices */}
          <div style={{ padding: "4px 2px 0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>Your choices</span>
              <span style={{ fontSize: 11, color: C.textMuted }}>2 selected</span>
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5, marginBottom: 10 }}>
              These are only the movie-and-showtime combinations you explicitly selected with Yes.
            </div>
          </div>

          {/* My picks — locked */}
          {[
            { movie: movies[2], time: "7:15 PM", theater: "Regal Westway" },
            { movie: movies[0], time: "7:00 PM", theater: "AMC River Oaks" },
          ].map((r, i) => (
            <div key={i} style={{
              background: C.card, border: `1px solid ${C.green}`,
              borderRadius: 14, overflow: "hidden",
            }}>
              <div style={{ background: C.green, color: "#000", fontSize: 9, fontWeight: 800, letterSpacing: "0.05em", padding: "3px 10px" }}>✓ MY PICK</div>
              <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 44, height: 56, borderRadius: 8, background: C.surface, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>{r.movie.thumb}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 2 }}>{r.movie.title}</div>
                  <div style={{ fontSize: 11, color: C.textMuted }}>{r.time} · {r.theater}</div>
                </div>
              </div>
            </div>
          ))}

          {/* Final standings */}
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, letterSpacing: "0.1em", padding: "4px 2px 0" }}>FINAL STANDINGS</div>
          {[
            { movie: movies[0], rank: 2, time: "7:00 PM", theater: "AMC River Oaks", count: 3 },
            { movie: movies[1], rank: 3, time: "6:45 PM", theater: "Alamo Drafthouse", count: 1 },
          ].map((r, i) => (
            <div key={i} style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 14, padding: "12px 14px", opacity: 0.65,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 26, height: 26, borderRadius: 8, background: C.surface, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: C.textMuted, flexShrink: 0 }}>#{r.rank}</div>
                <span style={{ fontSize: 20 }}>{r.movie.thumb}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.textMuted }}>{r.movie.title}</div>
                  <div style={{ fontSize: 11, color: C.textDim }}>{r.time} · {r.theater}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.textDim }}>{r.count}<span style={{ fontSize: 10, fontWeight: 400 }}> / 5</span></div>
              </div>
            </div>
          ))}

        </div>
      </ScrollArea>
      <TabBar active="results" movieCount={2} showtimeCount={2} />
    </div>
  );
}

function NoActivePollScreen() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <AppHeader subtitle="Perkins Family Movie Night" />
      {/* No progress bar — no active poll context */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px", gap: 16 }}>
        <div style={{ fontSize: 56, lineHeight: 1 }}>🍿</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: C.text, textAlign: "center" }}>No Active Poll</div>
        <div style={{ fontSize: 13, color: C.textMuted, textAlign: "center", lineHeight: 1.6 }}>
          The last poll has been closed. Check results below.
        </div>
        <div style={{ width: "100%", marginTop: 8 }}>
          <CTAButton label="View Final Results →" variant="primary" />
        </div>
      </div>
      <TabBar active="movies" movieCount={0} showtimeCount={0} />
    </div>
  );
}

const screenComponents = {
  "secure-entry": SecureEntryScreen,
  "secure-entry-wrong-pin": SecureEntryWrongPinScreen,
  "preview-mode": PreviewModeScreen,
  "leave-confirm": JoinedWithLeaveScreen,
  "opted-out": OptedOutScreen,
  "zero-yes-preview": ZeroYesPreviewScreen,
  "active-voting": ActiveVotingScreen,
  "flexible-mode": FlexibleModeScreen,
  "flexible-mode-on": FlexibleModeOnScreen,
  "showtimes-submitted": ShowtimesSubmittedScreen,
  "countdown-normal": CountdownNormalScreen,
  "countdown-urgent": CountdownUrgentScreen,
  "change-vote": ChangeVoteScreen,
  "trailer-expanded": TrailerExpandedScreen,
  "toast-no-movie": ToastNoMovieScreen,
  "toast-no-showtime": ToastNoShowtimeScreen,
  "toast-both-missing": ToastBothMissingScreen,
  "results-no-votes": ResultsNoVotesScreen,
  "results-others-voted": ResultsOthersVotedScreen,
  "results-all-voted": ResultsAllVotedScreen,
  "results-preview": ResultsPreviewScreen,
  "results-poll-closed": ResultsPollClosedScreen,
  "no-active-poll": NoActivePollScreen,
  "vote-submitted": VoteSubmittedScreen,
  "results-review": ResultsReviewScreen,
};

export default function App() {
  const [selected, setSelected] = useState(null);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#07070D",
      fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
      padding: "32px 24px 48px",
    }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{ fontSize: 13, letterSpacing: "0.18em", color: C.accent, fontWeight: 700, marginBottom: 8, fontFamily: "monospace" }}>
          ◆ GROUPGO · VOTER FLOW
        </div>
        <h1 style={{
          fontSize: 32, fontWeight: 900, color: C.text,
          fontFamily: "'Georgia', serif", margin: 0, lineHeight: 1.2,
        }}>Mobile Mockups</h1>
        <p style={{ fontSize: 14, color: C.textMuted, marginTop: 8 }}>
        25 screens · dark theme · all voter states
        </p>

        {/* Filter pills */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 20 }}>
          <div
            onClick={() => setSelected(null)}
            style={{
              padding: "6px 16px", borderRadius: 99, cursor: "pointer", fontSize: 12, fontWeight: 700,
              background: selected === null ? C.accent : C.card,
              color: selected === null ? "#000" : C.textMuted,
              border: `1px solid ${selected === null ? C.accent : C.border}`,
            }}
          >All Screens</div>
          {screens.map(s => (
            <div
              key={s}
              onClick={() => setSelected(s === selected ? null : s)}
              style={{
                padding: "6px 16px", borderRadius: 99, cursor: "pointer", fontSize: 12, fontWeight: 700,
                background: selected === s ? C.accent : C.card,
                color: selected === s ? "#000" : C.textMuted,
                border: `1px solid ${selected === s ? C.accent : C.border}`,
              }}
            >{screenLabels[s]}</div>
          ))}
        </div>
      </div>

      {/* Screens grid */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 40, justifyContent: "center",
      }}>
        {(selected ? [selected] : screens).map(id => {
          const Component = screenComponents[id];
          return (
            <PhoneFrame key={id} label={screenLabels[id]}>
              <Component />
            </PhoneFrame>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{
        maxWidth: 900, margin: "56px auto 0",
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 20, padding: 28,
      }}>
        <div style={{ fontSize: 11, letterSpacing: "0.12em", color: C.accent, fontWeight: 700, marginBottom: 16 }}>
          ◆ FLOW LOGIC
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
          {[
            ["🔑 Secure Entry", "PIN + invite link. Join as voter or preview."],
            ["👁️ Preview Mode", "Not joined or opted out. Browse only."],
            ["0️⃣ Zero Yes Preview", "Joined but 0 Yes votes. Showtimes tab shows badge."],
            ["✅ Active Voting", "≥1 Yes voted. Badge increments on tab bar."],
            ["🔀 Flexible Mode", "Showtimes: active for Yes movies, locked for others."],
            ["🎉 Completed", "View Results + Edit My Votes. Locked showtimes CTAs."],
            ["🏆 Results", "Winner callout, ranked list, Get Tickets CTA."],
          ].map(([title, desc]) => (
            <div key={title} style={{ display: "flex", gap: 10 }}>
              <div style={{ fontSize: 20, flexShrink: 0, lineHeight: 1.3 }}>{title.split(" ")[0]}</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{title.slice(3)}</div>
                <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.4, marginTop: 2 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
