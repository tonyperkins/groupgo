import { useNavigate, useLocation } from "react-router-dom";
import { C, FS } from "../tokens";

export type TabId = "discover" | "vote" | "results";

interface TabBarProps {
  votedSessionCount: number;
  isParticipating: boolean;
  isFlexible: boolean;
}

const TABS: { id: TabId; icon: string; label: string; route: string }[] = [
  { id: "discover", icon: "🔍", label: "Discover", route: "/vote/discover" },
  { id: "vote",     icon: "✅", label: "Vote",     route: "/vote/vote" },
  { id: "results",  icon: "🏆", label: "Results",  route: "/vote/results" },
];

export function TabBar({ votedSessionCount, isParticipating, isFlexible }: TabBarProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const activeTab: TabId = pathname.includes("results")
    ? "results"
    : pathname.includes("vote/vote")
    ? "vote"
    : "discover";

  const effectiveVoteCount = isFlexible ? -1 : votedSessionCount;
  const badges: Record<TabId, number | null> = {
    discover: null,
    vote:     effectiveVoteCount,
    results:  null,
  };

  return (
    <div style={{
      display: "flex",
      borderTop: `1px solid ${C.border}`,
      background: C.surface,
      flexShrink: 0,
    }}>
      {TABS.map((tab) => {
        const isActive = tab.id === activeTab;
        const badge = badges[tab.id];

        return (
          <div
            key={tab.id}
            onClick={() => navigate(tab.route)}
            style={{
              flex: 1, padding: "12px 0",
              display: "flex", flexDirection: "column",
              alignItems: "center", gap: 2,
              position: "relative",
              cursor: "pointer",
              borderTop: isActive ? `2px solid ${C.accent}` : "2px solid transparent",
              background: isActive ? C.accentGlow : "transparent",
              transition: "background 0.15s",
            }}
          >
            <div style={{ position: "relative", display: "inline-flex" }}>
              <span style={{ fontSize: isActive ? 28 : 24, transition: "font-size 0.15s" }}>{tab.icon}</span>
              {badge !== null && (
                <div style={{
                  position: "absolute", top: -8, right: -10,
                  minWidth: 16, height: 16, borderRadius: 99,
                  background: !isParticipating ? C.borderLight : (badge > 0 || badge === -1) ? C.accent : C.borderLight,
                  border: `2px solid ${C.surface}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: "0 3px",
                  opacity: !isParticipating ? 0.65 : 1,
                }}>
                  <span style={{
                    fontSize: 9, fontWeight: 900, lineHeight: 1,
                    color: !isParticipating ? C.textDim : (badge > 0 || badge === -1) ? "#000" : C.textDim,
                  }}>{badge === -1 ? "✓" : badge}</span>
                </div>
              )}
            </div>
            <span style={{
              fontSize: FS.sm, fontWeight: 700, letterSpacing: "0.04em",
              color: isActive ? C.accent : C.textMuted,
            }}>{tab.label.toUpperCase()}</span>
          </div>
        );
      })}
    </div>
  );
}
