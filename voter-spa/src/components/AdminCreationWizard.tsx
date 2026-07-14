import { useState } from "react";
import { C } from "../tokens";
import { adminSpaApi } from "../api/admin_spa";

export function AdminCreationWizard() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [dates, setDates] = useState<string[]>([]);
  
  const today = new Date();
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [calYear, setCalYear] = useState(today.getFullYear());

  const handleNext = () => {
    if (step === 1 && !title.trim()) {
      setError("Please enter a title.");
      return;
    }
    setError(null);
    setStep((s) => s + 1);
  };

  const handlePrev = () => {
    setError(null);
    setStep((s) => s - 1);
  };

  const toggleDate = (iso: string) => {
    setDates((prev) => 
      prev.includes(iso) ? prev.filter((d) => d !== iso) : [...prev, iso].sort()
    );
  };

  const submitWizard = async () => {
    if (dates.length === 0) {
      setError("Please select at least one date.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await adminSpaApi.createPoll({ title, target_dates: dates, group_ids: [] });
      window.location.href = `/vote/admin?poll_id=${res.id}`;
    } catch (err: any) {
      setError(err.message || "Failed to create poll");
      setLoading(false);
    }
  };

  const renderCalendar = () => {
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const todayIso = new Date().toISOString().slice(0, 10);
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    const grid = [];
    for (let i = 0; i < firstDay; i++) {
        grid.push(<div key={`empty-${i}`} />);
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const iso = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isSelected = dates.includes(iso);
        const isPast = iso < todayIso;
        const isToday = iso === todayIso;

        grid.push(
            <button
                key={iso}
                type="button"
                disabled={isPast && !isSelected}
                onClick={() => toggleDate(iso)}
                style={{
                    width: "100%", aspectRatio: "1", fontSize: 13, fontWeight: 700,
                    borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: (isPast && !isSelected) ? "not-allowed" : "pointer",
                    transition: "all 0.15s",
                    background: isSelected ? C.accent : (isToday ? C.surface : "rgba(0,0,0,0.2)"),
                    color: isSelected ? "#000" : (isPast ? C.textMuted : C.text),
                    border: isToday && !isSelected ? `1px solid ${C.accent}` : "none",
                    boxShadow: isSelected ? `0 0 10px ${C.accent}88` : "none",
                    transform: isSelected ? "scale(1.05)" : "none"
                }}
            >
                {d}
            </button>
        );
    }

    return (
        <div style={{ background: "rgba(0,0,0,0.4)", border: `1px solid ${C.border}`, borderRadius: 16, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <button type="button" onClick={() => {
                    let m = calMonth - 1; let y = calYear;
                    if (m < 0) { m = 11; y--; }
                    setCalMonth(m); setCalYear(y);
                }} style={{ background: "transparent", color: C.textDim, border: "none", cursor: "pointer", padding: 8, fontSize: 16 }}>&larr;</button>
                <div style={{ fontWeight: 800, color: C.text, letterSpacing: 0.5 }}>{months[calMonth]} {calYear}</div>
                <button type="button" onClick={() => {
                    let m = calMonth + 1; let y = calYear;
                    if (m > 11) { m = 0; y++; }
                    setCalMonth(m); setCalYear(y);
                }} style={{ background: "transparent", color: C.textDim, border: "none", cursor: "pointer", padding: 8, fontSize: 16 }}>&rarr;</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, textAlign: "center", marginBottom: 8 }}>
                {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                    <div key={d} style={{ fontSize: 11, fontWeight: 800, color: C.textDim }}>{d}</div>
                ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
                {grid}
            </div>
        </div>
    );
  };

  return (
    <div style={{ padding: "40px 24px 100px", maxWidth: 600, margin: "0 auto", height: "100%", overflowY: "auto" }}>
      <div style={{ marginBottom: 32, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: C.text, margin: 0, letterSpacing: "-0.5px" }}>Plan an Outing</h1>
          <p style={{ color: C.textMuted, marginTop: 4, fontSize: 13 }}>Create a beautiful event in just a few taps.</p>
        </div>
        <button onClick={() => window.location.href = "/vote/dashboard"} style={{ background: "transparent", color: C.textDim, border: "none", fontSize: 13, cursor: "pointer" }}>
          ✕ Cancel
        </button>
      </div>

      <div style={{ background: "rgba(20, 25, 35, 0.8)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: `1px solid ${C.borderLight}`, borderRadius: 24, padding: 24, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
        
        {/* Progress dots */}
        <div style={{ display: "flex", gap: 8, marginBottom: 32 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ 
              flex: 1, height: 6, borderRadius: 3, transition: "all 0.3s",
              background: i === step ? C.accent : (i < step ? `${C.accent}55` : C.border),
              boxShadow: i === step ? `0 0 10px ${C.accent}88` : "none"
            }} />
          ))}
        </div>

        {/* STEP 1 */}
        {step === 1 && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: "0 0 24px" }}>What are we doing?</h2>
            <div style={{ marginBottom: 32 }}>
              <label style={{ display: "block", fontSize: 11, textTransform: "uppercase", fontWeight: 800, color: C.textMuted, marginBottom: 8, letterSpacing: 0.5 }}>Event Title</label>
              <input 
                autoFocus
                type="text" 
                placeholder="e.g. Dune: Part Two Premiere" 
                value={title}
                onChange={e => setTitle(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleNext()}
                style={{
                  width: "100%", background: "rgba(0,0,0,0.4)", border: `1px solid ${C.border}`, borderRadius: 12,
                  padding: "16px", color: C.text, fontSize: 16, outline: "none", boxSizing: "border-box"
                }}
              />
            </div>
            {error && <div style={{ color: C.red, fontSize: 13, marginBottom: 16 }}>{error}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={handleNext} style={{ background: C.accent, color: "#000", border: "none", padding: "14px 24px", borderRadius: 12, fontWeight: 800, cursor: "pointer", transition: "transform 0.1s" }}>
                Next: Who's invited? &rarr;
              </button>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <button onClick={handlePrev} style={{ background: "transparent", border: "none", color: C.textMuted, fontSize: 12, cursor: "pointer", padding: 0, marginBottom: 16 }}>
              &larr; Back
            </button>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: "0 0 8px" }}>Who's invited?</h2>
            <p style={{ color: C.textMuted, fontSize: 13, marginBottom: 24 }}>In GroupGo, polls are scoped to groups. Leaving this default uses your primary group automatically.</p>
            
            <div style={{ border: `1px dashed ${C.border}`, borderRadius: 16, padding: 24, textAlign: "center", marginBottom: 32, background: "rgba(0,0,0,0.2)" }}>
              <div style={{ fontSize: 14, color: C.textDim, fontWeight: 600 }}>Default Group Selected</div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={handleNext} style={{ background: C.accent, color: "#000", border: "none", padding: "14px 24px", borderRadius: 12, fontWeight: 800, cursor: "pointer" }}>
                Next: When is it? &rarr;
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <button onClick={handlePrev} style={{ background: "transparent", border: "none", color: C.textMuted, fontSize: 12, cursor: "pointer", padding: 0, marginBottom: 16 }}>
              &larr; Back
            </button>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: "0 0 8px" }}>When is it?</h2>
            <p style={{ color: C.textMuted, fontSize: 13, marginBottom: 24 }}>Select one or more target dates. You'll pick specific showtimes next.</p>
            
            {renderCalendar()}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16, minHeight: 32 }}>
              {dates.map(d => (
                <div key={d} style={{ background: "rgba(0,0,0,0.5)", border: `1px solid ${C.accent}44`, color: C.accent, padding: "4px 12px", borderRadius: 16, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                  {d}
                  <button onClick={() => toggleDate(d)} style={{ background: "transparent", border: "none", color: C.accent, cursor: "pointer", padding: 0, fontSize: 14 }}>&times;</button>
                </div>
              ))}
            </div>

            {error && <div style={{ color: C.red, fontSize: 13, marginTop: 16, padding: 12, background: "rgba(255,0,0,0.1)", borderRadius: 8 }}>{error}</div>}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 32 }}>
              <button onClick={submitWizard} disabled={loading} style={{ background: "#22c55e", color: "#000", border: "none", padding: "14px 24px", borderRadius: 12, fontWeight: 800, cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                {loading ? "Creating..." : "Create Outing & Curate"}
                {!loading && <span style={{ fontSize: 16 }}>&rarr;</span>}
              </button>
            </div>
          </div>
        )}

      </div>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateX(10px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
