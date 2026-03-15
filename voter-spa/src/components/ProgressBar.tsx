import { C, FS } from "../tokens";

const SEGMENTS = ["Joined", "Selected", "Voted"] as const;

interface ProgressBarProps {
  /** Number of segments filled (0–3). 1=joined, 2=voted (≥1 session or flexible), 3=submitted */
  step: number;
}

export function ProgressBar({ step }: ProgressBarProps) {
  return (
    <div style={{ padding: "8px 16px 6px", flexShrink: 0, background: C.surface }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
        {SEGMENTS.map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 99,
            background: i < step ? C.accent : C.border,
            transition: "background 0.3s",
          }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {SEGMENTS.map((label, i) => (
          <div key={i} style={{
            flex: 1, textAlign: "center",
            fontSize: FS.xs, fontWeight: i < step ? 700 : 400,
            color: i < step ? C.accent : C.textDim,
            letterSpacing: "0.03em",
          }}>{label.toUpperCase()}</div>
        ))}
      </div>
    </div>
  );
}
