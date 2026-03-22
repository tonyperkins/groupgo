import { useEffect, useState, useRef } from "react";
import { C } from "../tokens";
import { adminSpaApi, AdminPollState, TMDBResult } from "../api/admin_spa";
import { ConfirmModal } from "./ConfirmModal";

function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
      <div style={{
        width: 24, height: 24, borderRadius: "50%",
        border: `2px solid ${C.border}`, borderTopColor: C.accent,
        animation: "spin 1s linear infinite"
      }} />
      <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
    </div>
  );
}

export function AdminCurationTab({ pollId, onPublish }: { pollId: number; onPublish: () => void }) {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<AdminPollState | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<TMDBResult[]>([]);
  
  // Drawer/Logistics State
  const [activeEventId, setActiveEventId] = useState<number | null>(null);
  
  // Form for manual session
  const [formDate, setFormDate] = useState("");
  const [formTime, setFormTime] = useState("");
  const [formTheater, setFormTheater] = useState(""); 
  
  // Custom Event State
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customType, setCustomType] = useState("other");
  const [customVenue, setCustomVenue] = useState("");
  
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeEventId && pickerRef.current) {
      pickerRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeEventId]);

  // Title editing
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState("");

  // Confirmation state
  const [confirmDeleteEventId, setConfirmDeleteEventId] = useState<number | null>(null);
  const [confirmDeleteSessionId, setConfirmDeleteSessionId] = useState<number | null>(null);

  const fetchState = async () => {
    try {
      const data = await adminSpaApi.getPollState(pollId);
      setState(data);
      if (!formDate && data.poll.target_dates.length > 0) {
        setFormDate(data.poll.target_dates[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchState();
  }, [pollId]);

  // Handle Search
  useEffect(() => {
    if (searchQuery.length < 3) {
      setSearchResults([]);
      return;
    }
    const delayDebounceFn = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await adminSpaApi.searchMovies(searchQuery);
        setSearchResults(res.results);
      } finally {
        setIsSearching(false);
      }
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const handleAddMovie = async (tmdbId: number) => {
    await adminSpaApi.addTmdbEvent(pollId, tmdbId);
    setSearchQuery("");
    setSearchResults([]);
    await fetchState();
  };

  const handleRemoveEvent = async (id: number) => {
    await adminSpaApi.removeEventFromPoll(pollId, id);
    if (activeEventId === id) setActiveEventId(null);
    await fetchState();
  };

  const handleAddSession = async () => {
    if (!activeEventId || !formDate || !formTime) return;
    await adminSpaApi.addSessionToPoll(pollId, {
      event_id: activeEventId,
      session_date: formDate,
      session_time: formTime,
      venue_name: formTheater,
    });
    setFormTime("");
    setFormTheater("");
    await fetchState();
  };

  const handleRemoveSession = async (id: number) => {
    await adminSpaApi.removeSessionFromPoll(id);
    await fetchState();
  };

  const handleAddCustom = async () => {
    if (!customTitle) return;
    await adminSpaApi.addCustomEvent(pollId, {
      title: customTitle,
      event_type: customType,
      venue_name: customVenue,
    });
    setCustomTitle("");
    setCustomVenue("");
    setShowCustomForm(false);
    await fetchState();
  };

  const handleSaveTitle = async () => {
    if (!tempTitle.trim()) {
      setIsEditingTitle(false);
      return;
    }
    await adminSpaApi.updatePollTitle(pollId, tempTitle);
    setIsEditingTitle(false);
    await fetchState();
  };

  const handleToggleSingleVote = async (isSingleVote: boolean) => {
    await adminSpaApi.updatePollSingleVote(pollId, isSingleVote);
    await fetchState();
  };

  const handlePublish = async () => {
    if (state?.poll.status === "OPEN") {
      window.location.href = "/vote";
      return;
    }
    await adminSpaApi.publishPoll(pollId);
    onPublish();
  };

  const handleCancel = async () => {
    if (state && state.events.length === 0) {
      try {
        await adminSpaApi.deletePoll(pollId);
      } catch (err) {
        console.error("Failed to delete empty poll on cancel", err);
      }
    }
    window.location.replace("/vote/dashboard");
  };


  if (loading) return <Spinner />;
  if (!state) return <div style={{ padding: 24, textAlign: "center", color: C.red }}>Failed to load poll.</div>;

  return (
    <div style={{ paddingBottom: 100 }}>
      {/* HEADER -> "Curation Canvas" */}
      <div style={{ padding: "20px 24px 10px", marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {isEditingTitle ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <input
                autoFocus
                value={tempTitle}
                onChange={(e) => setTempTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveTitle()}
                onBlur={handleSaveTitle}
                style={{
                  background: C.surface, color: C.text, border: `1px solid ${C.accent}`,
                  borderRadius: 8, padding: "4px 12px", fontSize: 20, fontWeight: 800,
                  width: "100%", maxWidth: 300, outline: "none"
                }}
              />
            </div>
          ) : (
            <h2 
              onClick={() => { setTempTitle(state.poll.title || ""); setIsEditingTitle(true); }}
              style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
            >
              {state.poll.title || "Build your Poll"}
              <span style={{ fontSize: 14, opacity: 0.5 }}>✏️</span>
            </h2>
          )}
          <p style={{ fontSize: 13, color: C.textDim, margin: 0, lineHeight: 1.4 }}>
            Search for movies, add them to your block, and tap on them to assign times.
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, background: C.card, padding: "8px 12px", borderRadius: 8, border: `1px dashed ${C.borderLight}`, width: "max-content", cursor: "pointer" }} onClick={() => handleToggleSingleVote(!state.poll.is_single_vote)}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: state.poll.is_single_vote ? C.accent : C.text }}>Strict Single-Vote</span>
              <span style={{ fontSize: 11, color: C.textDim }}>Voters can only select 1 option.</span>
            </div>
            <div 
              style={{
                width: 44, height: 24, borderRadius: 12, background: state.poll.is_single_vote ? C.accent : C.surface,
                display: "flex", alignItems: "center", padding: 2, boxSizing: "border-box",
                transition: "background 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
              }}
            >
              <div style={{
                width: 20, height: 20, borderRadius: 10, background: state.poll.is_single_vote ? "#000" : C.textMuted,
                transform: `translateX(${state.poll.is_single_vote ? 20 : 0}px)`,
                transition: "transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
              }} />
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button 
            onClick={handleCancel}
            style={{ background: "#322", color: C.red, border: "1px solid #533", borderRadius: 99, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
          >
            Cancel
          </button>
          <button 
            onClick={() => window.location.href = "/vote"}
            style={{ background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderRadius: 99, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
          >
            Dashboard
          </button>
        </div>
      </div>

      {state.poll.status === "OPEN" && (
        <div style={{ margin: "12px 24px", padding: 12, background: "#332200", border: `1px solid ${C.accent}`, borderRadius: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.accent }}>
            Live Editing: Changes made here are visible to voters immediately.
          </div>
        </div>
      )}

      {/* SEARCH BLOCK */}
      <div style={{ padding: "0 24px" }}>
        <div style={{ position: "relative", marginBottom: 20 }}>
          <input
            type="text"
            placeholder="Search TMDB for movies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%", height: 48, background: C.surface, color: C.text, border: `1px solid ${C.border}`,
              borderRadius: 16, padding: "0 16px 0 44px", fontSize: 15, fontWeight: 600, outline: "none", boxSizing: "border-box"
            }}
          />
          <span style={{ position: "absolute", left: 16, top: 14, fontSize: 18, opacity: 0.5 }}>🔍</span>
          
          {isSearching && (
            <div style={{ position: "absolute", right: 16, top: 12 }}>
              <Spinner />
            </div>
          )}

          {searchResults.length > 0 && (
            <div style={{
              position: "absolute", top: 56, left: 0, right: 0, zIndex: 100,
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 16,
              maxHeight: 300, overflowY: "auto", boxShadow: "0 20px 40px rgba(0,0,0,0.4)"
            }}>
              {searchResults.map(m => (
                <div 
                  key={m.tmdb_id || m.id}
                  onClick={() => handleAddMovie(m.tmdb_id || m.id)}
                  style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
                >
                  <img src={`https://image.tmdb.org/t/p/w92${m.poster_path}`} style={{ width: 40, borderRadius: 4 }} alt="" />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{m.title}</div>
                    <div style={{ fontSize: 12, color: C.textDim }}>{(m.release_date || m.year)?.substring(0,4)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CUSTOM EVENT BUTTON */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
          <button 
            onClick={() => setShowCustomForm(!showCustomForm)}
            style={{ 
              background: showCustomForm ? "#322" : C.surface, 
              color: showCustomForm ? C.red : C.text, border: `1px solid ${C.border}`,
              borderRadius: 12, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer"
            }}
          >
            {showCustomForm ? "Close" : "Add Any Event +"}
          </button>
        </div>

        {showCustomForm && (
          <div style={{
            marginTop: 12, padding: 16, background: C.card, 
            border: `1px solid ${C.accent}44`, borderRadius: 16,
            display: "flex", flexDirection: "column", gap: 12, marginBottom: 24
          }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.accent, textTransform: "uppercase", letterSpacing: 1 }}>
              Add Bar, Restaurant, or Custom Event
            </div>
            <input 
              placeholder="Event Title (e.g. Dinner at Resy's)" 
              value={customTitle}
              onChange={e => setCustomTitle(e.target.value)}
              style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, padding: "10px 12px", borderRadius: 8, outline: "none" }} 
            />
            <div style={{ display: "flex", gap: 8 }}>
              <select 
                value={customType}
                onChange={e => setCustomType(e.target.value)}
                style={{ flex: 1, background: C.bg, border: `1px solid ${C.border}`, color: C.text, padding: "10px 12px", borderRadius: 8, outline: "none" }}
              >
                <option value="movie">🎬 Movie</option>
                <option value="restaurant">🍴 Restaurant</option>
                <option value="bar">🍹 Bar / Nightlife</option>
                <option value="concert">🎸 Concert / Show</option>
                <option value="other">✨ Other Event</option>
              </select>
              <input 
                placeholder="Venue / Location (Optional)" 
                value={customVenue}
                onChange={e => setCustomVenue(e.target.value)}
                style={{ flex: 2, background: C.bg, border: `1px solid ${C.border}`, color: C.text, padding: "10px 12px", borderRadius: 8, outline: "none" }} 
              />
            </div>
            <button 
              onClick={handleAddCustom}
              style={{ background: C.accent, color: "#000", border: "none", padding: 12, borderRadius: 8, fontWeight: 800, cursor: "pointer" }}
            >
              Add to Itinerary
            </button>
          </div>
        )}
      </div>

      {/* HORIZONTAL MOVIES GRID */}
      <div style={{ padding: "0 0 20px" }}>
        <div style={{ display: "flex", overflowX: "auto", padding: "0 24px", gap: 16 }}>
          {state.events.map(ev => {
            const isActive = ev.id === activeEventId;
            return (
              <div 
                key={ev.id} 
                onClick={() => setActiveEventId(ev.id)}
                style={{ 
                  flexShrink: 0, width: 100, cursor: "pointer", position: "relative",
                  transition: "transform 0.2s", transform: isActive ? "scale(1.05)" : "none"
                }}
              >
                <div style={{ 
                  borderRadius: 12, overflow: "hidden", border: `2px solid ${isActive ? C.accent : "transparent"}`,
                  boxShadow: isActive ? `0 0 20px ${C.accent}44` : "none", aspectRatio: "2/3", background: C.card
                }}>
                  {(ev.image_url || ev.poster_path) ? (
                    <img 
                      src={ev.image_url || `https://image.tmdb.org/t/p/w342${ev.poster_path}`} 
                      style={{ width: "100%", height: "100%", objectFit: "cover" }} 
                      alt="" 
                    />
                  ) : (
                    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>✨</div>
                  )}
                </div>
                <div style={{ marginTop: 8, textAlign: "center" }}>
                   <div style={{ fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ev.title}</div>
                </div>
                {/* Remove Trash Handle */}
                <button 
                  onClick={(e) => { e.stopPropagation(); setConfirmDeleteEventId(ev.id); }}
                  style={{ 
                    position: "absolute", top: -8, right: -8, width: 24, height: 24, borderRadius: "50%",
                    background: "#522", color: C.red, border: "2px solid #000", fontSize: 14, 
                    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer"
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* SELECTED MOVIE SESSIONS DRAWER */}
      {activeEventId && (
        <div ref={pickerRef} style={{ margin: "20px 24px", padding: 24, background: C.card, borderRadius: 24, border: `1px solid ${C.border}` }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 800 }}>Showtimes for {state.events.find(e => e.id === activeEventId)?.title}</h3>
          
          <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <select 
                value={formDate}
                onChange={e => setFormDate(e.target.value)}
                style={{ flex: 1, background: C.bg, border: `1px solid ${C.border}`, color: C.text, padding: "10px 12px", borderRadius: 8, outline: "none" }}
              >
                {state.poll.target_dates.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <input 
                type="time" 
                value={formTime}
                onChange={e => setFormTime(e.target.value)}
                style={{ flex: 1, background: C.bg, border: `1px solid ${C.border}`, color: C.text, padding: "10px 12px", borderRadius: 8, outline: "none" }}
              />
            </div>
            <input 
              placeholder="Theater or Venue Name" 
              value={formTheater}
              onChange={e => setFormTheater(e.target.value)}
              style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, padding: "10px 12px", borderRadius: 8, outline: "none" }} 
            />
            <button 
              onClick={handleAddSession}
              style={{ background: C.accent, color: "#000", border: "none", padding: 12, borderRadius: 12, fontWeight: 800, cursor: "pointer" }}
            >
              Add Showtime
            </button>
          </div>

          <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 8 }}>
            {state.sessions.filter(s => s.event_id === activeEventId).map(s => {
              const theater = state.theaters.find(t => t.id === s.theater_id);
              return (
                <div key={s.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: C.surface, padding: "10px 14px", borderRadius: 8, border: `1px solid ${C.border}`
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{s.session_date} @ {s.session_time}</div>
                    <div style={{ fontSize: 12, color: C.textMuted }}>{theater?.name || "No location specified"}</div>
                  </div>
                  <button
                    onClick={() => setConfirmDeleteSessionId(s.id)}
                    style={{ background: "transparent", border: "none", color: C.red, fontSize: 18, cursor: "pointer", padding: "0 8px" }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* FOOTER */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: C.card, borderTop: `1px solid ${C.border}`,
        padding: `16px 24px calc(16px + env(safe-area-inset-bottom, 8px))`,
        zIndex: 1000,
        display: "flex", justifyContent: "center",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}>
        <button
          onClick={handlePublish}
          disabled={state.events.length === 0 || state.sessions.length === 0}
          style={{
            background: (state.events.length > 0 && state.sessions.length > 0) ? C.accent : C.border,
            color: (state.events.length > 0 && state.sessions.length > 0) ? "#000" : C.textDim,
            border: "none", padding: "14px 24px", borderRadius: 99,
            fontWeight: 800, fontSize: 16, width: "100%", maxWidth: 320,
            cursor: "pointer", transition: "all 0.2s"
          }}
        >
          {state.poll.status === "OPEN" ? "Save & Return to Dashboard" : "Publish & Get Link"}
        </button>
      </div>

      <ConfirmModal
        isOpen={confirmDeleteEventId !== null}
        title="Remove Event?"
        message="This will remove the event and all its assigned showtimes from the poll."
        confirmLabel="Remove"
        onConfirm={async () => {
          if (confirmDeleteEventId) {
            await handleRemoveEvent(confirmDeleteEventId);
            setConfirmDeleteEventId(null);
          }
        }}
        onCancel={() => setConfirmDeleteEventId(null)}
        isDestructive
      />

      <ConfirmModal
        isOpen={confirmDeleteSessionId !== null}
        title="Remove Showtime?"
        message="Are you sure you want to remove this specific showtime?"
        confirmLabel="Remove"
        onConfirm={async () => {
          if (confirmDeleteSessionId) {
            await handleRemoveSession(confirmDeleteSessionId);
            setConfirmDeleteSessionId(null);
          }
        }}
        onCancel={() => setConfirmDeleteSessionId(null)}
        isDestructive
      />
    </div>
  );
}
