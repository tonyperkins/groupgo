import { api } from "./client";

export interface VoterUser {
  id: number;
  name: string;
  email: string;
  role: string;
  group_id: number | null;
}

export interface VoterPoll {
  id: number;
  title: string;
  status: string;
  access_uuid: string | null;
  voting_closes_at: string | null;
  description: string | null;
  group_id: number | null;
}

export interface VoterPreferences {
  is_flexible: boolean;
  has_completed_voting: boolean;
  is_participating: boolean;
  is_editing: boolean;
  opt_out_reason: string | null;
}

export interface VoterEvent {
  id: number;
  title: string;
  year: number | null;
  synopsis: string | null;
  poster_path: string | null;
  trailer_key: string | null;
  tmdb_rating: number | null;
  runtime_mins: number | null;
  rating: string | null;
  genres: string[];
  poster_url: string | null;
  event_type: string;
  is_movie: boolean;
  image_url: string | null;
  external_url: string | null;
  booking_url: string | null;
  venue_name: string | null;
}

export interface VoterSession {
  id: number;
  event_id: number;
  theater_id: number;
  theater_name: string;
  session_date: string;   // YYYY-MM-DD
  session_time: string;   // HH:MM 24h
  format: string;
  booking_url: string | null;
}

export interface VoterMeResponse {
  user: VoterUser | null;
  poll: VoterPoll | null;
  state: "active" | "no_active_poll" | "browse";
  preferences: VoterPreferences;
  votes: Record<string, string>;
  yes_movie_count: number;
  voted_session_count: number;
  events: VoterEvent[];
  sessions: VoterSession[];
  is_secure_entry: boolean;
  is_browse: boolean;
  join_url: string | null;
}

export interface ResultsEntry {
  rank: number;
  score: number;
  voter_count: number;
  voter_names: string[];
  event: { id: number; title: string; is_movie: boolean; venue_name: string | null; booking_url: string | null; event_type: string };
  session: {
    id: number;
    session_date: string;
    session_time: string;
    format: string;
    theater_id: number;
    theater_name: string;
    booking_url: string | null;
  };
}

export interface ResultsVoter {
  name: string;
  fully_voted: boolean;
}

export interface ResultsResponse {
  poll_id: number;
  poll_status: string;
  participation: {
    total_voters: number;
    fully_voted: number;
    voters: ResultsVoter[];
  };
  results: ResultsEntry[];
  no_valid_options: boolean;
  has_any_votes: boolean;
  /** "event_id:session_id" strings for the current user's personal picks */
  personal_pick_keys: string[];
  is_participating: boolean;
}

export interface EventReview {
  author: string;
  rating: number | null;
  excerpt: string;
}

export const voterApi = {
  getMe: () => api.get<VoterMeResponse>("/api/voter/me"),

  getResultsJson: () => api.get<ResultsResponse>("/api/results/json"),

  getEventReviews: (eventId: number) =>
    api.get<{ reviews: EventReview[] }>(`/api/voter/events/${eventId}/reviews`),

  logout: () => api.post<{ ok: boolean }>("/api/voter/logout", {}),
};
