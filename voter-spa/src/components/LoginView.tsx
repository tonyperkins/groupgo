import { useState } from "react";
import { voterApi } from "../api/voter";
import { C } from "../tokens";

export function LoginView() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) return;

    setStatus("loading");
    try {
      const res = await voterApi.authLogin(email);
      setStatus("success");
      setMessage(res.message || "Check your email for the login link!");
    } catch (err: any) {
      setStatus("error");
      setMessage(err.message || "Failed to send login link.");
    }
  };

  if (status === "success") {
    return (
      <div style={{
        background: C.bg, minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}>
        <div style={{ background: C.card, padding: 32, borderRadius: 24, border: `1px solid ${C.border}`, maxWidth: 400, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📧</div>
          <h1 style={{ color: C.text, fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Check your email</h1>
          <p style={{ color: C.textDim, fontSize: 15, lineHeight: 1.5 }}>
            {message} You can safely close this window.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: C.bg, minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{ marginBottom: 40, display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ color: C.text, fontFamily: "Georgia, serif", fontSize: 24, fontWeight: 800, margin: 0 }}>GroupGo</h1>
      </div>

      <div style={{ background: C.card, padding: 32, borderRadius: 24, border: `1px solid ${C.border}`, width: "100%", maxWidth: 400 }}>
        <h2 style={{ color: C.text, fontSize: 20, fontWeight: 800, marginBottom: 8, marginTop: 0 }}>Log in via Magic Link</h2>
        <p style={{ color: C.textDim, fontSize: 14, marginBottom: 24, marginTop: 0 }}>No passwords needed. We'll email you a secure link to sign in instantly.</p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ display: "block", color: C.textMuted, fontSize: 12, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              disabled={status === "loading"}
              style={{
                width: "100%", padding: "12px 16px", background: C.surface, color: C.text,
                border: `1px solid ${C.border}`, borderRadius: 12, fontSize: 16, outline: "none", boxSizing: "border-box"
              }}
            />
          </div>

          {status === "error" && (
            <div style={{ background: "rgba(220, 38, 38, 0.1)", color: C.red, padding: 12, borderRadius: 8, fontSize: 13 }}>
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={status === "loading" || !email.trim()}
            style={{
              width: "100%", padding: "14px", background: C.accent, color: "#000",
              border: "none", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: "pointer",
              opacity: status === "loading" || !email.trim() ? 0.7 : 1, transition: "opacity 0.2s"
            }}
          >
            {status === "loading" ? "Sending..." : "Send Login Link"}
          </button>
        </form>

        <div style={{ marginTop: 24, textAlign: "center", paddingTop: 24, borderTop: `1px solid ${C.border}` }}>
          <p style={{ color: C.textMuted, fontSize: 14, margin: 0 }}>
            Don't have an account? <a href="/signup" style={{ color: C.accent, textDecoration: "none", fontWeight: 600 }}>Sign up</a>
          </p>
        </div>
      </div>
    </div>
  );
}
