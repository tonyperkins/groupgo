import { ReactNode, useState, useRef, useEffect } from "react";
import { createPortal, flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import { C, applyTheme } from "../tokens";
import { voterApi } from "../api/voter";

interface AppHeaderProps {
  userName: string;
  pollTitle: string | null;
  votingClosesAt: string | null;
  statusChip?: ReactNode;
  isAdmin?: boolean;
  isManagement?: boolean;
}

function formatCountdown(closesAt: string | null): { label: string; urgent: boolean } | null {
  if (!closesAt) return null;
  const diff = new Date(closesAt).getTime() - Date.now();
  if (diff <= 0) return { label: "Voting closed", urgent: true };
  const hours = Math.floor(diff / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (hours >= 24) return null;
  const urgent = hours < 2;
  const label = hours > 0 ? `${hours}h ${mins}m left` : `${mins}m left`;
  return { label, urgent };
}

export function AppHeader({ userName, pollTitle, votingClosesAt, statusChip, isAdmin, isManagement }: AppHeaderProps) {
  const navigate = useNavigate();
  const countdown = isManagement ? null : formatCountdown(votingClosesAt);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  
  const [currentTheme, setCurrentTheme] = useState<"dark" | "light">(
    () => (localStorage.getItem("gg_theme") as "dark" | "light") ?? "dark"
  );

  useEffect(() => {
    if (userMenuOpen && avatarRef.current) {
      const rect = avatarRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, [userMenuOpen]);

  const handleLogout = async () => {
    try { await voterApi.logout(); } catch { /* best effort */ }
    window.location.href = "/";
  };

  const toggleTheme = () => {
    const next = currentTheme === "dark" ? "light" : "dark";
    localStorage.setItem("gg_theme", next);
    flushSync(() => { setCurrentTheme(next); setUserMenuOpen(false); });
    applyTheme(next);
  };

  // Extract a 1-2 letter initial for the avatar
  const initials = userName.substring(0, 2).toUpperCase();

  return (
    <div style={{
      padding: "16px 20px 14px",
      borderBottom: `1px solid ${C.borderLight}`,
      background: "var(--gg-surface-glass)",
      backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(16px)",
      flexShrink: 0,
      position: "relative", zIndex: 50,
    }}>
      {/* Row 1: branding + user avatar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", color: C.text, display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {/* Elegant minimalist diamond logo icon */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: 2 }}>
              <path d="M12 2L2 12L12 22L22 12L12 2Z" fill={C.blue} opacity="0.8"/>
              <path d="M12 2L2 12L12 22L22 12L12 2Z" fill="url(#paint0_linear_10_2)" />
              <defs>
                <linearGradient id="paint0_linear_10_2" x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse">
                  <stop stopColor={C.accent} />
                  <stop offset="1" stopColor={C.accentDim} stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
            GroupGo
          </span>
          {countdown && (
            <span style={{
              fontSize: 12, fontWeight: countdown.urgent ? 800 : 700,
              color: countdown.urgent ? C.red : C.textDim,
              whiteSpace: "nowrap", flexShrink: 0,
            }}>⏱ {countdown.label}</span>
          )}
        </div>

        {/* User Avatar Circle */}
        <div 
          ref={avatarRef}
          onClick={() => setUserMenuOpen(!userMenuOpen)}
          style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "linear-gradient(135deg, #E8A020, #D97706)",
            color: "#000", fontSize: 13, fontWeight: 800,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", flexShrink: 0,
            border: `2px solid ${C.surface}`,
            boxShadow: "0 2px 8px rgba(232, 160, 32, 0.4)",
          }}
        >
          {initials}
        </div>
      </div>

      {/* Row 2: Poll title & Poll Actions (StatusChip) */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 12 }}>
        {!isManagement && pollTitle && (
          <div style={{
            fontSize: 15, fontWeight: 700, color: C.text,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0
          }}>{pollTitle}</div>
        )}
        <div style={{ flexShrink: 0 }}>
          {!isManagement && statusChip}
        </div>
      </div>

      {/* User Dropdown Portal */}
      {userMenuOpen && menuPos && createPortal(
        <>
          <div onClick={() => setUserMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 9998 }} />
          <div style={{
            position: "fixed", top: menuPos.top, right: menuPos.right, zIndex: 9999,
            background: C.card, border: `1px solid ${C.borderLight}`, borderRadius: 12,
            minWidth: 160, padding: "6px 0", boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}>
            <div 
              onClick={() => { navigate("/vote/profile"); setUserMenuOpen(false); }}
              style={{ padding: "12px 20px", fontSize: 15, fontWeight: 700, color: C.text, borderBottom: `1px solid ${C.borderLight}`, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
            >
              <span style={{ fontSize: 16 }}>👤</span> Profile
            </div>
            {isAdmin && (
              <div 
                onClick={() => { navigate("/vote"); setUserMenuOpen(false); }}
                style={{ padding: "12px 20px", fontSize: 15, fontWeight: 700, color: C.accent, borderBottom: `1px solid ${C.borderLight}`, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
              >
                <span style={{ fontSize: 16 }}>🏠</span> My Dashboard
              </div>
            )}
            {isAdmin && (
              <a href="/admin" style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 20px", fontSize: 15, fontWeight: 700, color: C.accent, textDecoration: "none" }}>
                <span style={{ fontSize: 16 }}>⚙️</span> Admin
              </a>
            )}
            <div onClick={toggleTheme} style={{ padding: "12px 20px", fontSize: 15, fontWeight: 700, color: C.text, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>{currentTheme === "dark" ? "☀️" : "🌙"}</span> {currentTheme === "dark" ? "Light Mode" : "Dark Mode"}
            </div>
            <div onClick={handleLogout} style={{ padding: "12px 20px", fontSize: 15, fontWeight: 700, color: C.red, cursor: "pointer", borderTop: `1px solid ${C.borderLight}`, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>🚪</span> Log Out
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
