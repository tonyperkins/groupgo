import { useNavigate, useLocation } from "react-router-dom";
import { C, FS } from "../tokens";

interface SideNavProps {
  votedSessionCount: number;
  isParticipating: boolean;
  isFlexible: boolean;
  isAdmin?: boolean;
}

export function SideNav({ votedSessionCount, isParticipating, isFlexible, isAdmin }: SideNavProps) {
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
      { id: "vote",     icon: "✅", label: "Vote",      route: "/vote/vote" },
      { id: "results",  icon: "🏆", label: "Results",   route: "/vote/results" },
    ];
  }

  const activeTab = pathname === "/vote/dashboard" || pathname === "/vote/admin"
    ? "dashboard"
    : pathname === "/vote/profile"
    ? "profile"
    : pathname.includes("results")
    ? "results"
    : "vote";

  return (
    <div style={{
      width: 200,
      flexShrink: 0,
      background: C.surface,
      borderRight: `1px solid ${C.border}`,
      display: "flex",
      flexDirection: "column",
      padding: "16px 10px",
      gap: 4,
    }}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        const rawBadge = tab.id === "vote" ? (isFlexible ? -1 : votedSessionCount) : null;

        return (
          <div
            key={tab.id}
            onClick={() => navigate(tab.route)}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 14px",
              borderRadius: 10,
              cursor: "pointer",
              background: isActive ? C.accentGlow : "transparent",
              border: `1px solid ${isActive ? C.accentDim : "transparent"}`,
              transition: "background 0.15s",
              position: "relative",
            }}
          >
            <span style={{ fontSize: 20, lineHeight: 1 }}>{tab.icon}</span>
            <span style={{
              fontSize: FS.base, fontWeight: isActive ? 700 : 500,
              color: isActive ? C.accent : C.textMuted,
              letterSpacing: "0.01em",
            }}>{tab.label}</span>
            {rawBadge !== null && (rawBadge > 0 || rawBadge === -1) && (
              <div style={{
                marginLeft: "auto",
                minWidth: 20, height: 20, borderRadius: 99,
                background: !isParticipating ? C.borderLight : C.accent,
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "0 5px",
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 900, lineHeight: 1,
                  color: !isParticipating ? C.textDim : "#000",
                }}>{rawBadge === -1 ? "✓" : rawBadge}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
