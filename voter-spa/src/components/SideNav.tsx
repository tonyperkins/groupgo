import { useNavigate, useLocation } from "react-router-dom";
import { C, FS } from "../tokens";
import type { TabId } from "./TabBar";

interface SideNavProps {
  votedSessionCount: number;
  isParticipating: boolean;
  isFlexible: boolean;
}

const TABS: { id: TabId; icon: string; label: string; route: string }[] = [
  { id: "discover", icon: "🔍", label: "Discover",  route: "/vote/discover" },
  { id: "vote",     icon: "✅", label: "Vote",      route: "/vote/vote" },
  { id: "results",  icon: "🏆", label: "Results",   route: "/vote/results" },
];

export function SideNav({ votedSessionCount, isParticipating, isFlexible }: SideNavProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const activeTab: TabId = pathname.includes("results")
    ? "results"
    : pathname.includes("vote/vote")
    ? "vote"
    : "discover";

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
      {TABS.map((tab) => {
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
