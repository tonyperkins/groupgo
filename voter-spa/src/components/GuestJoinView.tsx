import React, { useState } from "react";
import { useParams } from "react-router-dom";
import { C } from "../tokens";
import { voterApi } from "../api/voter";

interface GuestJoinViewProps {
  pollTitle?: string;
}

export function GuestJoinView({ pollTitle }: GuestJoinViewProps) {
  const { accessUuid } = useParams<{ accessUuid: string }>();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !accessUuid) return;
    setLoading(true);
    setError(null);
    try {
      await voterApi.guestJoin(name, accessUuid);
      // Force a full reload to pick up the new session cookie and refetch state
      window.location.href = `/join/${accessUuid}`;
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
      setLoading(false);
    }
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: C.bg }}>
      <div style={{ padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        
        {/* Placeholder App Logo / Host Image (using Gold aesthetic) */}
        <div style={{ width: 64, height: 64, borderRadius: 16, background: `linear-gradient(135deg, ${C.accent}, ${C.accentDim})`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 28 }}>🍿</span>
        </div>

        <h1 style={{ color: C.text, fontSize: 24, fontWeight: 800, margin: "0 0 10px 0" }}>
          You're invited!
        </h1>
        <p style={{ color: C.textDim, fontSize: 16, margin: "0 0 40px 0" }}>
          Join <strong style={{ color: C.text }}>{pollTitle || "this outing"}</strong>
        </p>

        <form onSubmit={handleSubmit} style={{ width: "100%", maxWidth: 320, display: "flex", flexDirection: "column", gap: 16 }}>
          {error && (
            <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#EF4444", padding: "12px", borderRadius: 12, fontSize: 14 }}>
              {error}
            </div>
          )}
          <input
            type="text"
            placeholder="Your Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              background: C.surface, border: `1px solid ${C.border}`, color: C.text,
              padding: "16px", borderRadius: 12, fontSize: 16, outline: "none",
              transition: "border-color 0.2s"
            }}
            autoFocus
          />
          <button
            type="submit"
            disabled={!name.trim() || loading}
            style={{
              background: C.accent, color: C.bg,
              padding: "16px", borderRadius: 12, fontSize: 16, fontWeight: 700,
              border: "none", cursor: (!name.trim() || loading) ? "not-allowed" : "pointer",
              opacity: (!name.trim() || loading) ? 0.7 : 1, transition: "transform 0.2s, opacity 0.2s"
            }}
            onMouseDown={(e) => e.currentTarget.style.transform = "scale(0.98)"}
            onMouseUp={(e) => e.currentTarget.style.transform = "scale(1)"}
            onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
          >
            {loading ? "Joining..." : "Join Outing"}
          </button>
        </form>

      </div>
    </div>
  );
}
