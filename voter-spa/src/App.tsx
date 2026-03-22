import { useCallback, useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { voterApi, VoterMeResponse } from "./api/voter";
import { votesApi } from "./api/votes";
import { adminSpaApi } from "./api/admin_spa";
import { C } from "./tokens";
import {
  AppHeader,
  ProgressBar,
  TabBar,
  SideNav,
  Toast,
  ScrollArea,
  VoteTab,
  ResultsTab,
  AdminCurationTab,
  ProfileTab,
  LoginView,
  SignupView,
  ConfirmModal,
} from "./components";
import type { SessionVote } from "./components";
import { StatusChip } from "./components/StatusChip";
import { VoteFooter } from "./components/VoteFooter";
import { OptOutModal } from "./components/OptOutModal";
import { useIsDesktop } from "./hooks/useIsDesktop";

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

interface NoActivePollScreenProps {
  meData: VoterMeResponse;
}

function NoActivePollScreen({ meData }: NoActivePollScreenProps) {
  const isAdmin = meData.user?.role === "platform_admin";
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const ownedPolls = meData.owned_polls ?? [];

  return (
    <div style={{
      background: C.bg, minHeight: "100dvh",
      display: "flex", flexDirection: "column",
      alignItems: "center", padding: "40px 24px",
      gap: 0,
    }}>
      {/* Removed redundant branding */}

      {isAdmin && (
        <div style={{ width: "100%", maxWidth: 480 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>Your Polls</h2>
            <button 
              onClick={() => window.location.href = "/admin/polls/new"}
              style={{
                background: C.accent, color: "#000", border: "none", 
                borderRadius: 99, padding: "8px 16px", fontSize: 12, fontWeight: 800, cursor: "pointer"
              }}
            >
              New Poll +
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {ownedPolls.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", background: C.card, borderRadius: 20, border: `1px dashed ${C.border}` }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>✨</div>
                <div style={{ fontSize: 14, color: C.textMuted }}>You haven't created any polls yet.</div>
              </div>
            ) : (
              ownedPolls.map(p => (
                <div key={p.id} style={{ 
                  background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16,
                  display: "flex", justifyContent: "space-between", alignItems: "center"
                }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{p.title}</div>
                    <div style={{ fontSize: 11, color: C.accent, textTransform: "uppercase", fontWeight: 800, marginTop: 4 }}>
                       {p.status}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button 
                      onClick={() => window.location.href = `/vote/admin?poll_id=${p.id}`}
                      style={{ background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => setConfirmDeleteId(p.id)}
                      style={{ background: "#300", color: "#f55", border: "1px solid #522", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmDeleteId !== null}
        title="Delete Poll?"
        message="This will permanently remove the poll and all associated votes. This action cannot be undone."
        confirmLabel="Delete Poll"
        onConfirm={async () => {
          if (confirmDeleteId) {
            await adminSpaApi.deletePoll(confirmDeleteId);
            setConfirmDeleteId(null);
            window.location.reload();
          }
        }}
        onCancel={() => setConfirmDeleteId(null)}
        isDestructive
      />

      {!isAdmin && (
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 20, padding: "28px 24px",
          maxWidth: 320, width: "100%", textAlign: "center",
          display: "flex", flexDirection: "column", gap: 12,
        }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>🍿</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: C.text }}>No Active Poll</div>
          <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6 }}>
            There's no movie night vote running right now.
            Check back when your group starts a new poll.
          </div>
        </div>
      )}
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
  toastType: "success" | "info" | "warning" | "error";
}

// ─── Progress step derived from state ─────────────────────────────────────────

function progressStep(state: VoterState): number {
  const prefs = state.meData?.preferences;
  if (!prefs) return 0;
  if (!prefs.is_participating) return 1;
  if (prefs.has_completed_voting) return 3;
  if (state.votedSessionCount > 0 || prefs.is_flexible) return 2;
  return 1;
}

// ─── App root ─────────────────────────────────────────────────────────────────

export default function App() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isDesktop = useIsDesktop();
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
    toastType: "info",
  });

  // Bootstrap — fetch /api/voter/me once on mount or when poll_id changes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pollId = params.get("poll_id") ? parseInt(params.get("poll_id")!, 10) : undefined;

    setLoading(true); // Show loading when switching polls
    voterApi.getMe(pollId)
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
          if (window.location.pathname === "/signup" || window.location.pathname === "/login") {
            setLoading(false);
          } else {
            window.location.href = "/login";
          }
        } else {
          setError(err.message ?? "Failed to load voter data");
          setLoading(false);
        }
      });
  }, [window.location.search]);

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

  const handleClearSelections = async () => {
    const confirmed = Object.entries(state.votes)
      .filter(([k, v]) => k.startsWith("session:") && v === "can_do")
      .map(([k]) => parseInt(k.replace("session:", ""), 10));
    const cleared = { ...state.votes };
    for (const id of confirmed) {
      cleared[`session:${id}`] = "cant_do";
    }
    setState((prev) => ({ ...prev, votes: cleared, votedSessionCount: 0 }));
    await Promise.all(confirmed.map((id) => votesApi.castSessionVote(id, "cant_do")));
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

  const handleUpdateUser = (updated: any) => {
    setState((prev) => ({
      ...prev,
      meData: prev.meData ? { ...prev.meData, user: updated } : prev.meData,
    }));
  };

  const showToast = (msg: string, type: "success" | "info" | "warning" | "error" = "success") => {
    setState((prev) => ({ ...prev, toast: msg, toastType: type }));
  };

  const dismissToast = useCallback(() => {
    setState((prev) => ({ ...prev, toast: null }));
  }, []);

  // ── Render gates ────────────────────────────────────────────────────────────

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} />;

  // Allow unauthenticated users to see Login / Signup
  const { meData } = state;

  if (!meData) {
    return (
      <Routes>
        <Route path="/login" element={<LoginView />} />
        <Route path="/signup" element={<SignupView />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // ── Browse mode (no PIN — viewer only) ─────────────────────────────────────
  if (meData.state === "browse") {
    const joinBanner = meData.join_url ? (
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
    ) : null;

    if (isDesktop) {
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
            isAdmin={false}
            isManagement={false}
          />
          {joinBanner}
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            <SideNav votedSessionCount={0} isParticipating={false} isFlexible={false} />
            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              overflow: "hidden", alignItems: "center",
              background: C.bg,
            }}>
              <ScrollArea style={{ width: "100%", maxWidth: 720 }}>
                {/* We pass the VoteTab as the primary viewer in browse mode, 
                    but with interactions disabled */}
                 <VoteTab
                   sessions={meData.sessions ?? []}
                   events={meData.events}
                   votes={{}}
                   votedSessionCount={0}
                   isParticipating={false}
                   hasCompletedVoting={false}
                   isFlexible={false}
                   isEditing={false}
                   pollId={state.meData?.poll?.id ?? 0}
                   onSessionVote={() => {}}
                   onSetFlexible={() => {}}
                   onJoin={() => {}}
                 />
              </ScrollArea>
            </div>
          </div>
        </div>
      );
    }

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
          isAdmin={false}
          isManagement={false}
        />
        {joinBanner}
        <ScrollArea>
            <VoteTab
              sessions={meData.sessions ?? []}
              events={meData.events}
              votes={{}}
              votedSessionCount={0}
              isParticipating={false}
              hasCompletedVoting={false}
              isFlexible={false}
              isEditing={false}
              pollId={state.meData?.poll?.id ?? 0}
              onSessionVote={() => {}}
              onSetFlexible={() => {}}
              onJoin={() => {}}
            />
        </ScrollArea>
      </div>
    );
  }

  const prefs = meData.preferences;
  const step = progressStep(state);

  const refetchMe = () => {
    const params = new URLSearchParams(window.location.search);
    const pollId = params.get("poll_id") ? parseInt(params.get("poll_id")!, 10) : undefined;
    setLoading(true);
    voterApi.getMe(pollId).then(data => {
      setState(prev => ({ 
        ...prev, 
        meData: data, 
        votes: data.votes ?? {}, 
        yesMovieCount: data.yes_movie_count ?? 0, 
        votedSessionCount: data.voted_session_count ?? 0 
      }));
      setLoading(false);
    });
  };

  // ── Shared route content ────────────────────────────────────────────────────

  const routeContent = (
    <Routes>
      <Route path="/vote/dashboard" element={<NoActivePollScreen meData={meData} />} />
      <Route path="/vote/admin" element={
        (meData.poll?.id && (meData.poll?.status?.toUpperCase() === "DRAFT" || meData.poll?.status?.toUpperCase() === "OPEN")) ? (
          <AdminCurationTab 
            pollId={meData.poll.id} 
            onPublish={() => {
              // Reload the app to resync state to OPEN mode
              window.location.href = "/vote";
            }} 
          />
        ) : (
          meData.user?.role === "platform_admin" ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 20 }}>
               <div className="gg-spinner" style={{ width: 40, height: 40, border: `4px solid ${C.accentDim}`, borderTop: `4px solid ${C.accent}`, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
               <p style={{ color: C.textDim, fontSize: 14, fontWeight: 600 }}>Preparing Curation Canvas...</p>
               <button 
                 onClick={refetchMe} 
                 style={{ background: C.surface, color: C.text, border: `1px solid ${C.border}`, padding: "8px 16px", borderRadius: 8, fontSize: 12, cursor: "pointer" }}
               >
                 Retry
               </button>
               <style>{`
                 @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
               `}</style>
            </div>
          ) : (
            <Navigate to="/vote/vote" replace />
          )
        )
      } />
      <Route path="/vote/vote" element={
        <VoteTab
          sessions={meData.sessions ?? []}
          events={meData.events}
          votes={state.votes}
          votedSessionCount={state.votedSessionCount}
          isParticipating={prefs.is_participating}
          hasCompletedVoting={prefs.has_completed_voting}
          isFlexible={prefs.is_flexible}
          isEditing={state.isEditing}
          pollId={state.meData?.poll?.id ?? 0}
          onSessionVote={castSessionVote}
          onSetFlexible={handleSetFlexible}
          onJoin={handleJoin}
        />
      } />
      <Route path="/vote/results" element={
        <ResultsTab
          isParticipating={prefs.is_participating}
          hasCompletedVoting={prefs.has_completed_voting}
          isEditing={state.isEditing}
          onJoin={handleJoin}
          onSubmitVote={handleSubmit}
          onCancelEdit={handleCancelEdit}
          sessions={state.meData?.sessions ?? []}
          events={state.meData?.events ?? []}
        />
      } />
          <Route
            path="/vote/profile"
            element={
              <ProfileTab
                user={state.meData?.user ?? null}
                onUpdateUser={handleUpdateUser}
                showToast={showToast}
                onBack={() => navigate(-1)}
              />
            }
          />
      <Route path="/vote"           element={<Navigate to={meData.user?.role === "platform_admin" ? "/vote/dashboard" : "/vote/vote"} replace />} />
      <Route path="/vote/movies"    element={<Navigate to="/vote/vote" replace />} />
      <Route path="/vote/discover"  element={<Navigate to="/vote/vote" replace />} />
      <Route path="/vote/showtimes" element={<Navigate to="/vote/vote" replace />} />
      <Route path="/vote/*"         element={<Navigate to={meData.poll?.status?.toUpperCase() === "DRAFT" ? "/vote/admin" : (meData.user?.role === "platform_admin" ? "/vote/dashboard" : "/vote/vote")} replace />} />
      <Route path="*"               element={<Navigate to={meData.poll?.status?.toUpperCase() === "DRAFT" ? "/vote/admin" : (meData.user?.role === "platform_admin" ? "/vote/dashboard" : "/vote/vote")} replace />} />
    </Routes>
  );

  const statusChip = (
    <StatusChip
      prefs={prefs}
      isEditing={state.isEditing}
      onJoin={handleJoin}
      onChangeVote={handleChangeVote}
      onOptOut={handleRequestOptOut}
      onCancelEdit={handleCancelEdit}
      onClearSelections={handleClearSelections}
    />
  );

  // ── Shell layout ────────────────────────────────────────────────────────────
  const isManagementPage = pathname.includes("/dashboard") || pathname.includes("/admin");

  const shell = isDesktop ? (
    // ── Desktop layout ────────────────────────────────────────────────────────
    <div style={{
      background: C.bg, color: C.text,
      fontFamily: "system-ui, -apple-system, sans-serif",
      height: "100dvh", display: "flex", flexDirection: "column",
    }}>
      {/* Top header bar — full width */}
      <AppHeader
        userName={meData.user?.name ?? ""}
        pollTitle={isManagementPage ? null : (meData.poll?.title ?? null)}
        votingClosesAt={isManagementPage ? null : (meData.poll?.voting_closes_at ?? null)}
        statusChip={isManagementPage ? null : statusChip}
        isAdmin={meData.user?.role === "platform_admin"}
        isManagement={isManagementPage}
      />
      {!isManagementPage && (
        <ProgressBar step={step} />
      )}

      {/* Body: sidebar + content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left sidebar nav */}
        <SideNav
          votedSessionCount={state.votedSessionCount}
          isParticipating={prefs.is_participating}
          isFlexible={prefs.is_flexible}
          isAdmin={meData.user?.role === "platform_admin"}
        />

        {/* Center content column */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          overflow: "hidden", alignItems: "center",
          background: C.bg,
        }}>
          <ScrollArea style={{ width: "100%", maxWidth: 720 }}>
            {routeContent}
          </ScrollArea>

          {/* Vote footer — only on /vote/vote */}
          {pathname.includes("vote/vote") && (
            <div style={{ width: "100%", maxWidth: 720 }}>
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
            </div>
          )}
        </div>
      </div>

      {state.showOptOutModal && (
        <OptOutModal onConfirm={handleConfirmOptOut} onCancel={handleDismissOptOutModal} />
      )}
      <Toast message={state.toast} onDismiss={dismissToast} />
    </div>
  ) : (
    // ── Mobile layout ─────────────────────────────────────────────────────────
    <div style={{
      background: C.bg, color: C.text,
      fontFamily: "system-ui, -apple-system, sans-serif",
      height: "100dvh", display: "flex", flexDirection: "column",
      position: "relative",
    }}>
      <AppHeader
        userName={meData.user?.name ?? ""}
        pollTitle={isManagementPage ? null : (meData.poll?.title ?? null)}
        votingClosesAt={isManagementPage ? null : (meData.poll?.voting_closes_at ?? null)}
        statusChip={isManagementPage ? null : statusChip}
        isAdmin={meData.user?.role === "platform_admin"}
        isManagement={isManagementPage}
      />
      {!isManagementPage && (
        <ProgressBar step={step} />
      )}

      <ScrollArea>
        {routeContent}
      </ScrollArea>

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

      {!pathname.includes("vote/admin") && !pathname.includes("vote/profile") && (
        <TabBar
          votedSessionCount={state.votedSessionCount}
          isParticipating={prefs.is_participating}
          isFlexible={prefs.is_flexible}
          isAdmin={meData.user?.role === "platform_admin"}
        />
      )}

      {state.showOptOutModal && (
        <OptOutModal onConfirm={handleConfirmOptOut} onCancel={handleDismissOptOutModal} />
      )}
      <Toast message={state.toast} type={state.toastType} onDismiss={dismissToast} />
    </div>
  );

  // Expose actions on window in dev so they can be tested from console
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__gg = { castSessionVote, state };
  }

  return shell;
}
