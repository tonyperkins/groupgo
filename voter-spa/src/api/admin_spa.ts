import { api } from "./client";

export interface TMDBResult {
  id: number; // Added to match TMDB API and frontend usage
  tmdb_id: number;
  title: string;
  year: string | null;
  release_date?: string; // Added to match frontend usage
  poster_path: string | null;
  rating: number | null;
  synopsis: string | null;
}

export interface TheaterResult {
  name: string;
  address: string;
  lat: string | null;
  lon: string | null;
}

export interface AdminPollState {
  poll: {
    id: number;
    title: string;
    status: string;
    access_uuid: string | null;
    target_dates: string[];
    is_single_vote: boolean;
  };
  events: {
    id: number;
    tmdb_id: number | null;
    title: string;
    year: number | null;
    synopsis: string | null;
    poster_path: string | null;
    image_url: string | null;
    rating: string | null;
    is_custom_event: boolean;
    event_type: string;
    runtime_mins: number | null;
  }[];
  sessions: {
    id: number;
    event_id: number;
    theater_id: number | null;
    session_date: string;
    session_time: string;
    format: string;
    is_custom: boolean;
  }[];
  theaters: {
    id: number;
    name: string;
    address: string | null;
  }[];
}

export const adminSpaApi = {
  getPollState: (pollId: number) => 
    api.get<AdminPollState>(`/api/spa/polls/${pollId}`),

  searchMovies: (q: string) => 
    api.get<{ results: TMDBResult[] }>(`/api/spa/movies/search?q=${encodeURIComponent(q)}`),

  addTmdbEvent: (pollId: number, tmdb_id: number) =>
    api.post<{ status: string }>(`/api/spa/polls/${pollId}/events/tmdb`, { tmdb_id }),

  removeEventFromPoll: (pollId: number, eventId: number) =>
    api.delete<{ status: string }>(`/api/spa/polls/${pollId}/events/${eventId}`, {}),

  searchTheaters: (q: string) =>
    api.get<{ results: TheaterResult[] }>(`/api/spa/theaters/search?q=${encodeURIComponent(q)}`),

  addTheater: (name: string, address: string | null) =>
    api.post<{ id: number, name: string, address: string | null }>(`/api/spa/theaters`, { name, address }),

  addSessionToPoll: (pollId: number, data: { event_id: number; session_date: string; session_time: string; theater_id?: number; venue_name?: string; format?: string }) =>
    api.post<{ status: string }>(`/api/spa/polls/${pollId}/sessions`, { 
      event_id: data.event_id, 
      session_date: data.session_date, 
      session_time: data.session_time, 
      theater_id: data.theater_id, 
      venue_name: data.venue_name,
      format: data.format || "Standard"
    }),

  removeSessionFromPoll: (sessionId: number) =>
    api.delete<{ status: string }>(`/api/spa/sessions/${sessionId}`, {}),

  addCustomEvent: (poll_id: number, data: { title: string; event_type: string; venue_name?: string; description?: string }) =>
    api.post<{ status: string, event_id: number }>(`/api/spa/polls/${poll_id}/events/custom`, data),

  updatePollTitle: (pollId: number, title: string) => api.patch<{ status: string; title: string }>(`/api/spa/polls/${pollId}/title`, { title }),
  updatePollSingleVote: (pollId: number, is_single_vote: boolean) => api.patch<{ status: string; is_single_vote: boolean }>(`/api/spa/polls/${pollId}/is_single_vote`, { is_single_vote }),
  deletePoll: (pollId: number) => api.delete<{ status: string }>(`/api/spa/polls/${pollId}`),

  publishPoll: (pollId: number) =>
    api.post<{ status: string, access_uuid: string }>(`/api/spa/polls/${pollId}/publish`, {}),
};
