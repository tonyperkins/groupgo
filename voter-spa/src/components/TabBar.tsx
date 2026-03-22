import { useNavigate, useLocation } from "react-router-dom";
import { C } from "../tokens";

export type TabId = "discover" | "vote" | "results";

interface TabBarProps {
  votedSessionCount: number;
  isParticipating: boolean;
  isFlexible: boolean;
}

interface TabBarProps {
  votedSessionCount: number;
  isParticipating: boolean;
  isFlexible: boolean;
  isAdmin?: boolean;
}

export function TabBar({ votedSessionCount, isParticipating, isFlexible, isAdmin }: TabBarProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const isGlobalContext = ["/vote/dashboard", "/vote/admin", "/vote/profile"].includes(pathname);

  let tabs = [];
  if (isGlobalContext) {
    tabs = [
      { id: "dashboard", icon: "🏠", label: "Dashboard", route: "/vote/dashboard" },
      { id: "profile", icon: "👤", label: "Profile", route: "/vote/profile" },
    ];
  } else {
    tabs = [
      ...(isAdmin ? [{ id: "dashboard", icon: "🏠", label: "Home", route: "/vote/dashboard" }] : []),
      { id: "vote",     icon: "✅", label: "Vote",     route: "/vote/vote" },
      { id: "results",  icon: "🏆", label: "Results",  route: "/vote/results" },
    ];
  }

  const activeTab = pathname === "/vote/dashboard" || pathname === "/vote/admin"
    ? "dashboard"
    : pathname === "/vote/profile"
    ? "profile"
    : pathname.includes("results")
    ? "results"
    : "vote";

  const effectiveVoteCount = isFlexible ? -1 : votedSessionCount;
  const badges: Record<string, number | null> = {
    dashboard: null,
    discover: null,
    vote:     effectiveVoteCount,
    results:  null,
  };

  return (
    <div style={{
      display: "flex",
      borderTop: `1px solid ${C.borderLight}`,
      background: "var(--gg-surface-glass)",
      backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(16px)",
      flexShrink: 0,
      paddingBottom: "env(safe-area-inset-bottom, 0)", // iPhone X support
      zIndex: 100,
    }}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        const badge = (badges as any)[tab.id];

        return (
          <div
            key={tab.id}
            onClick={() => navigate(tab.route)}
            style={{
              flex: 1, padding: "12px 0 16px",
              display: "flex", flexDirection: "column",
              alignItems: "center", gap: 4,
              position: "relative",
              cursor: "pointer",
            }}
          >
            {/* Active Highlight Pill Behind Icon */}
            {isActive && (
              <div style={{
                position: "absolute", top: 8, bottom: 8, left: "20%", right: "20%",
                background: C.card, borderRadius: 16, border: `1px solid ${C.border}`,
                boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                zIndex: 0,
              }} />
            )}

            <div style={{ position: "relative", display: "inline-flex", zIndex: 1 }}>
              <span style={{
                 fontSize: isActive ? 26 : 22,
                 transition: "all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
                 transform: isActive ? "translateY(-2px)" : "translateY(0)"
              }}>{tab.icon}</span>
              {badge !== null && (
                <div style={{
                  position: "absolute", top: -8, right: -12,
                  minWidth: 18, height: 18, borderRadius: 99,
                  background: !isParticipating ? C.borderLight : (badge > 0 || badge === -1) ? "linear-gradient(135deg, #F59E0B, #D97706)" : C.borderLight,
                  border: `2px solid ${C.surface}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: "0 4px",
                  opacity: !isParticipating ? 0.65 : 1,
                  boxShadow: (badge > 0 || badge === -1) ? "0 2px 4px rgba(245, 158, 11, 0.3)" : "none",
                }}>
                  <span style={{
                    fontSize: 10, fontWeight: 900, lineHeight: 1,
                    color: !isParticipating ? C.textDim : (badge > 0 || badge === -1) ? "#000" : C.textDim,
                  }}>{badge === -1 ? "✓" : badge}</span>
                </div>
              )}
            </div>
            <span style={{
              fontSize: 11, fontWeight: 900, letterSpacing: "0.08em",
              color: isActive ? C.text : C.textMuted,
              zIndex: 1, marginTop: isActive ? 0 : 2,
              transition: "color 0.2s"
            }}>{tab.label.toUpperCase()}</span>
          </div>
        );
      })}
    </div>
  );
}
