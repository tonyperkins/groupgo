import { api } from "./client";

export const votesApi = {
  castMovieVote: (eventId: number, vote: "yes" | "no" | "abstain", vetoReason?: string) =>
    api.post<{ status: string; vote: string; yes_movie_count: number }>(
      "/api/voter/votes/movie",
      { event_id: eventId, vote, veto_reason: vetoReason ?? null }
    ),

  castSessionVote: (sessionId: number, vote: "can_do" | "cant_do" | "abstain") =>
    api.post<{ status: string; vote: string; voted_session_count: number }>(
      "/api/voter/votes/session",
      { session_id: sessionId, vote }
    ),

  setFlexible: (isFlexible: boolean) =>
    api.post<{ status: string; is_flexible: boolean }>(
      "/api/voter/votes/flexible",
      { is_flexible: isFlexible }
    ),

  setComplete: (isComplete: boolean) =>
    api.post<{ status: string; is_complete: boolean; preferences: unknown }>(
      "/api/voter/votes/complete",
      { is_complete: isComplete }
    ),

  setParticipation: (isParticipating: boolean) =>
    api.post<{ status: string; is_participating: boolean; preferences: unknown }>(
      "/api/voter/votes/participation",
      { is_participating: isParticipating }
    ),
};
