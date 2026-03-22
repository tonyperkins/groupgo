import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { C } from "../tokens";
import { VoterUser, voterApi } from "../api/voter";

interface ProfileTabProps {
  user: VoterUser | null;
  onUpdateUser: (updated: any) => void;
  showToast: (msg: string, type?: "success" | "info" | "warning" | "error") => void;
  onBack?: () => void;
}

export function ProfileTab({ user, onUpdateUser, showToast, onBack }: ProfileTabProps) {
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  async function handleSave() {
    if (!name.trim()) {
      showToast("Name cannot be empty", "error");
      return;
    }
    setSaving(true);
    try {
      const updated = await voterApi.updateMe({
        name: name.trim(),
        email: email.trim(),
        member_pin: pin.trim() || undefined,
      });
      onUpdateUser(updated);
      showToast("Profile updated successfully!", "success");
      setPin(""); // clear pin after success
    } catch (err: any) {
      showToast(err.response?.data?.detail ?? "Failed to update profile", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      padding: "24px 20px",
      display: "flex",
      flexDirection: "column",
      gap: 24,
      maxWidth: 500,
      margin: "0 auto",
      width: "100%",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
        <div 
          onClick={() => onBack ? onBack() : navigate(-1)}
          style={{
            width: 42, height: 42, borderRadius: 12,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <span style={{ fontSize: 20, color: C.textDim }}>←</span>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: C.text, margin: 0 }}>Your Profile</h1>
      </div>

      <div style={{
        background: C.card, border: `1px solid ${C.borderLight}`,
        borderRadius: 20, padding: 24,
        display: "flex", flexDirection: "column", gap: 20,
        boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
      }}>
        {/* Name Field */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 800, color: C.textDim, letterSpacing: "0.05em" }}>DISPLAY NAME</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            style={{
              background: C.surface, border: `1px solid ${C.borderLight}`,
              borderRadius: 12, padding: "14px 16px",
              fontSize: 16, color: C.text, fontWeight: 600,
              outline: "none",
            }}
          />
        </div>

        {/* Email Field */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 800, color: C.textDim, letterSpacing: "0.05em" }}>EMAIL ADDRESS</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            style={{
              background: C.surface, border: `1px solid ${C.borderLight}`,
              borderRadius: 12, padding: "14px 16px",
              fontSize: 16, color: C.text, fontWeight: 600,
              outline: "none",
            }}
          />
        </div>

        {/* PIN Field */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label style={{ fontSize: 13, fontWeight: 800, color: C.textDim, letterSpacing: "0.05em" }}>SECRET PIN</label>
            <span style={{ fontSize: 11, color: C.accent, fontWeight: 700 }}>Optional reset</span>
          </div>
          <input
            type="password"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="••••"
            style={{
              background: C.surface, border: `1px solid ${C.borderLight}`,
              borderRadius: 12, padding: "14px 16px",
              fontSize: 16, color: C.text, fontWeight: 600,
              outline: "none",
              letterSpacing: "0.5em",
            }}
          />
          <p style={{ fontSize: 12, color: C.textMuted, margin: "4px 0 0" }}>
            Leave blank to keep your current 4-digit PIN.
          </p>
        </div>

        {/* Stats / Info */}
        <div style={{
          marginTop: 12, padding: "16px", background: "rgba(232, 160, 32, 0.05)",
          border: `1px dashed ${C.borderLight}`, borderRadius: 12,
          display: "flex", justifyContent: "space-between", alignItems: "center"
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, color: C.textDim, letterSpacing: "0.05em" }}>ACCOUNT TYPE</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.accent }}>{user.role.toUpperCase()}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: C.textDim, letterSpacing: "0.05em" }}>PLAN</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>FREE</div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            marginTop: 8,
            background: saving ? C.surface : "linear-gradient(135deg, #E8A020, #D97706)",
            color: saving ? C.textDim : "#000",
            border: "none",
            borderRadius: 16, padding: "16px",
            fontSize: 16, fontWeight: 900,
            cursor: saving ? "default" : "pointer",
            boxShadow: saving ? "none" : "0 4px 12px rgba(232, 160, 32, 0.3)",
            transition: "all 0.1s active:scale-95",
          }}
        >
          {saving ? "Saving Changes..." : "Save Changes"}
        </button>
      </div>

      <div style={{ textAlign: "center", marginTop: 12 }}>
        <p style={{ fontSize: 13, color: C.textDim }}>
          Member since {new Date(user.id < 1000 ? Date.now() : user.id).getFullYear()}
        </p>
      </div>
    </div>
  );
}
