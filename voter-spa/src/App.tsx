import { useCallback, useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { voterApi, VoterMeResponse } from "./api/voter";
import { votesApi } from "./api/votes";
import { C } from "./tokens";
import {
  AppHeader,
  ProgressBar,
  TabBar,
  Toast,
  ScrollArea,
  DiscoverTab,
  VoteTab,
  ResultsTab,
} from "./components";
import type { SessionVote } from "./components";
import { StatusChip } from "./components/StatusChip";
import { VoteFooter } from "./components/VoteFooter";
import { OptOutModal } from "./components/OptOutModal";

// ─── Full-screen states (outside shell) ───────────────────────────────────────

function LoadingScreen() {
  return (
    <div style={{
      background: C.bg, minHeight: "100dvh",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{ color: C.textMuted, fontSize: 14 }}>Loading…</div>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div style={{
      background: C.bg, minHeight: "100dvh",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{ color: C.red, fontSize: 14, textAlign: "center" }}>{message}</div>
    </div>
  );
}

function NoActivePollScreen() {
  return (
    <div style={{
      background: C.bg, minHeight: "100dvh",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 0, padding: 32,
    }}>
      {/* Brand mark */}
      <div style={{
        fontFamily: "Georgia, serif", fontWeight: 800, fontSize: 15,
        color: C.text, marginBottom: 32, display: "flex", alignItems: "center", gap: 8,
      }}>
        GroupGo
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
          background: C.accent, color: "#000",
          borderRadius: 4, padding: "1px 5px",
        }}>VOTE</span>
      </div>

      <div style={{ fontSize: 52, marginBottom: 20 }}>🍿</div>

      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 20, padding: "28px 24px",
        maxWidth: 320, width: "100%", textAlign: "center",
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: C.text }}>No Active Poll</div>
        <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6 }}>
          There's no movie night vote running right now.
          Check back when your group starts a new poll.
        </div>
        <div style={{
          marginTop: 4,
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 10, padding: "10px 14px",
          fontSize: 11, color: C.textDim, lineHeight: 1.5,
        }}>
          💡 Ask your admin to create and publish a poll to get started.
        </div>
      </div>
    </div>
  );
}

// ─── Central state ────────────────────────────────────────────────────────────

export interface VoterState {
  meData: VoterMeResponse | null;
  votes: Record<string, string>;
  yesMovieCount: number;
  votedSessionCount: number;
  isEditing: boolean;
  showOptOutModal: boolean;
  toast: string | null;
}

// ─── Progress step derived from state ─────────────────────────────────────────

function progressStep(state: VoterState): number {
  const prefs = state.meData?.preferences;
  if (!prefs) return 0;
  if (prefs.has_completed_voting) return 3;
  if (state.votedSessionCount > 0 || prefs.is_flexible) return 2;
  if (prefs.is_participating) return 1;
  return 0;
}

// ─── App root ─────────────────────────────────────────────────────────────────

export default function App() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<VoterState>({
    meData: null,
    votes: {},
    yesMovieCount: 0,
    votedSessionCount: 0,
    isEditing: false,
    showOptOutModal: false,
    toast: null,
  });

  // Bootstrap — fetch /api/voter/me once on mount
  useEffect(() => {
    voterApi.getMe()
      .then((data) => {
        setState((prev) => ({
          ...prev,
          meData: data,
          votes: data.votes ?? {},
          yesMovieCount: data.yes_movie_count ?? 0,
          votedSessionCount: data.voted_session_count ?? 0,
        }));
        setLoading(false);
      })
      .catch((err) => {
        if (err.status === 401) {
          window.location.href = "/no-poll";
        } else {
          setError(err.message ?? "Failed to load voter data");
          setLoading(false);
        }
      });
  }, []);

  // ── Vote actions (stubs — fleshed out in Sessions 3–4) ──────────────────────

  const castSessionVote = async (sessionId: number, vote: SessionVote) => {
    const prevVotes = state.votes;
    const prevCount = state.votedSessionCount;
    const key = `session:${sessionId}`;
    setState((prev) => ({
      ...prev,
      votes: { ...prev.votes, [key]: vote },
      votedSessionCount: Object.entries({ ...prev.votes, [key]: vote })
        .filter(([k, v]) => k.startsWith("session:") && v === "can_do").length,
    }));
    try {
      const result = await votesApi.castSessionVote(sessionId, vote);
      setState((prev) => ({ ...prev, votedSessionCount: result.voted_session_count }));
    } catch {
      setState((prev) => ({ ...prev, votes: prevVotes, votedSessionCount: prevCount, toast: "Failed to save vote — try again" }));
    }
  };

  // ── Participation / submission actions ──────────────────────────────────────

  const handleJoin = async () => {
    await votesApi.setParticipation(true);
    setState((prev) => ({
      ...prev,
      meData: prev.meData ? {
        ...prev.meData,
        preferences: { ...prev.meData.preferences, is_participating: true },
      } : prev.meData,
    }));
  };

  const handleRequestOptOut = () => {
    setState((prev) => ({ ...prev, showOptOutModal: true }));
  };

  const handleConfirmOptOut = async () => {
    await votesApi.setParticipation(false);
    setState((prev) => ({
      ...prev,
      showOptOutModal: false,
      isEditing: false,
      meData: prev.meData ? {
        ...prev.meData,
        preferences: { ...prev.meData.preferences, is_participating: false, has_completed_voting: false },
      } : prev.meData,
    }));
  };

  const handleDismissOptOutModal = () => {
    setState((prev) => ({ ...prev, showOptOutModal: false }));
  };

  const handleSubmit = async () => {
    const prefs = state.meData?.preferences;
    if (!prefs?.is_participating) {
      setState((prev) => ({ ...prev, toast: "Join the poll first before submitting." }));
      return;
    }
    if (state.votedSessionCount === 0 && !prefs.is_flexible) {
      setState((prev) => ({ ...prev, toast: "Confirm at least one showtime before submitting." }));
      return;
    }
    await votesApi.setComplete(true);
    setState((prev) => ({
      ...prev,
      isEditing: false,
      meData: prev.meData ? {
        ...prev.meData,
        preferences: { ...prev.meData.preferences, has_completed_voting: true },
      } : prev.meData,
    }));
    navigate("/vote/results");
  };

  const handleChangeVote = async () => {
    await votesApi.setComplete(false);
    setState((prev) => ({ ...prev, isEditing: true }));
    navigate("/vote/vote");
  };

  const handleCancelEdit = async () => {
    await votesApi.setComplete(true);
    setState((prev) => ({
      ...prev,
      isEditing: false,
      meData: prev.meData ? {
        ...prev.meData,
        preferences: { ...prev.meData.preferences, has_completed_voting: true },
      } : prev.meData,
    }));
  };

  const handleSetFlexible = async (flexible: boolean) => {
    await votesApi.setFlexible(flexible);
    setState((prev) => ({
      ...prev,
      meData: prev.meData ? {
        ...prev.meData,
        preferences: { ...prev.meData.preferences, is_flexible: flexible },
      } : prev.meData,
    }));
  };

  const dismissToast = useCallback(() => {
    setState((prev) => ({ ...prev, toast: null }));
  }, []);

  // ── Render gates ────────────────────────────────────────────────────────────

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} />;

  const { meData } = state;
  if (!meData || meData.state === "no_active_poll") return <NoActivePollScreen />;

  // ── Browse mode (no PIN — viewer only) ─────────────────────────────────────
  if (meData.state === "browse") {
    return (
      <div style={{
        background: C.bg, color: C.text,
        fontFamily: "system-ui, -apple-system, sans-serif",
        height: "100dvh", display: "flex", flexDirection: "column",
      }}>
        <AppHeader
          userName="Viewer"
          pollTitle={meData.poll?.title ?? null}
          votingClosesAt={meData.poll?.voting_closes_at ?? null}
          statusChip={null}
        />
        {/* Join banner */}
        {meData.join_url && (
          <div style={{
            background: C.accentGlow, borderBottom: `1px solid ${C.accentDim}`,
            padding: "10px 16px", display: "flex", alignItems: "center",
            justifyContent: "space-between", gap: 12, flexShrink: 0,
          }}>
            <span style={{ fontSize: 12, color: C.accent, fontWeight: 600 }}>
              🎟️ Enter your PIN to join and vote
            </span>
            <a
              href={meData.join_url}
              style={{
                background: C.accent, color: "#000", fontWeight: 700,
                fontSize: 11, padding: "5px 14px", borderRadius: 99,
                textDecoration: "none", whiteSpace: "nowrap",
              }}
            >
              Join to Vote
            </a>
          </div>
        )}
        <ScrollArea>
          <DiscoverTab
            events={meData.events}
            sessions={meData.sessions}
            isParticipating={false}
            hasCompletedVoting={false}
            joinUrl={meData.join_url}
          />
        </ScrollArea>
      </div>
    );
  }

  const prefs = meData.preferences;
  const step = progressStep(state);

  // ── Shell layout ────────────────────────────────────────────────────────────

  const shell = (
    <div style={{
      background: C.bg,
      color: C.text,
      fontFamily: "system-ui, -apple-system, sans-serif",
      height: "100dvh",
      display: "flex",
      flexDirection: "column",
      position: "relative",
    }}>
      {/* Fixed header region */}
      <AppHeader
        userName={meData.user?.name ?? ""}
        pollTitle={meData.poll?.title ?? null}
        votingClosesAt={meData.poll?.voting_closes_at ?? null}
        statusChip={
          <StatusChip
            prefs={prefs}
            isEditing={state.isEditing}
            onJoin={handleJoin}
            onChangeVote={handleChangeVote}
            onOptOut={handleRequestOptOut}
            onCancelEdit={handleCancelEdit}
          />
        }
      />
      <ProgressBar step={step} />

      {/* Scrollable content area */}
      <ScrollArea>
        <Routes>
          <Route path="/vote/discover" element={
            <DiscoverTab
              events={meData.events}
              sessions={meData.sessions}
              isParticipating={prefs.is_participating}
              hasCompletedVoting={prefs.has_completed_voting}
            />
          } />
          <Route path="/vote/vote"     element={
            <VoteTab
              sessions={meData.sessions ?? []}
              events={meData.events}
              votes={state.votes}
              votedSessionCount={state.votedSessionCount}
              isParticipating={prefs.is_participating}
              hasCompletedVoting={prefs.has_completed_voting}
              isFlexible={prefs.is_flexible}
              isEditing={state.isEditing}
              onSessionVote={castSessionVote}
              onSetFlexible={handleSetFlexible}
              onJoin={handleJoin}
            />
          } />
          <Route path="/vote/results"  element={
            <ResultsTab
              isParticipating={prefs.is_participating}
              hasCompletedVoting={prefs.has_completed_voting}
              onJoin={handleJoin}
            />
          } />
          <Route path="/vote/movies"   element={<Navigate to="/vote/discover" replace />} />
          <Route path="/vote/showtimes" element={<Navigate to="/vote/vote" replace />} />
          <Route path="/vote/*"        element={<Navigate to="/vote/discover" replace />} />
          <Route path="*"              element={<Navigate to="/vote/discover" replace />} />
        </Routes>
      </ScrollArea>

      {/* Vote footer — only on /vote/vote */}
      {pathname.includes("vote/vote") && (
        <VoteFooter
          isParticipating={prefs.is_participating}
          hasCompletedVoting={prefs.has_completed_voting}
          isEditing={state.isEditing}
          isFlexible={prefs.is_flexible}
          votes={state.votes}
          onSubmit={handleSubmit}
          onOptOut={handleRequestOptOut}
          onCancelEdit={handleCancelEdit}
        />
      )}

      {/* Tab bar pinned to bottom */}
      <TabBar
        votedSessionCount={state.votedSessionCount}
        isParticipating={prefs.is_participating}
      />

      {/* Opt-out confirmation modal */}
      {state.showOptOutModal && (
        <OptOutModal
          onConfirm={handleConfirmOptOut}
          onCancel={handleDismissOptOutModal}
        />
      )}

      {/* Toast overlay */}
      <Toast message={state.toast} onDismiss={dismissToast} />
    </div>
  );

  // Expose actions on window in dev so they can be tested from console
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__gg = { castSessionVote, state };
  }

  return shell;
}
