export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export type AuthStatus = {
  connected: boolean;
  valid: boolean;
  expired: boolean;
  scopes: string[];
  account_email: string | null;
  message: string | null;
};

export type LikedItem = {
  id: number;
  video_id: string;
  title: string;
  channel_title: string | null;
  thumbnail_url: string | null;
  position: number | null;
  published_at: string | null;
  source_playlist_id: string;
  availability_status: string;
  copied_status: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type LikedItemsResponse = {
  total: number;
  limit: number;
  offset: number;
  items: LikedItem[];
};

export type Playlist = {
  id: number;
  youtube_playlist_id: string;
  title: string;
  privacy_status: string;
  share_url: string;
  created_at: string;
  updated_at: string;
};

export type CopyJobStatus = {
  job_id: number;
  status: string;
  total_items: number;
  copied_count: number;
  failed_count: number;
  skipped_count: number;
  pending_count: number;
  message: string | null;
  destination_playlist_id: string;
  destination_playlist_db_id: number;
  share_url: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
};

export type CopyStartResponse = {
  job: CopyJobStatus;
  started: boolean;
  message: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const detail = payload?.detail;
    throw new ApiError(typeof detail === "string" ? detail : "Request failed.", response.status);
  }
  return payload as T;
}

export const api = {
  authStart: () => request<{ auth_url: string }>("/auth/start"),
  authStatus: () => request<AuthStatus>("/auth/status"),
  fetchLiked: () => request<{ source_playlist_id: string; fetched_count: number; stored_count: number }>("/liked/fetch", { method: "POST" }),
  likedItems: (params: { search?: string; copied_status?: string; limit?: number; offset?: number }) => {
    const search = new URLSearchParams();
    if (params.search) search.set("search", params.search);
    if (params.copied_status) search.set("copied_status", params.copied_status);
    search.set("limit", String(params.limit ?? 50));
    search.set("offset", String(params.offset ?? 0));
    return request<LikedItemsResponse>(`/liked/items?${search.toString()}`);
  },
  createPlaylist: (payload: { title: string; privacy_status: "private" | "public" | "unlisted" }) =>
    request<Playlist>("/playlists/create", { method: "POST", body: JSON.stringify(payload) }),
  copyStart: (playlistDbId?: number) =>
    request<CopyStartResponse>("/copy/start", {
      method: "POST",
      body: JSON.stringify(playlistDbId ? { playlist_db_id: playlistDbId } : {}),
    }),
  copyResume: (jobId?: number) =>
    request<CopyStartResponse>("/copy/resume", {
      method: "POST",
      body: JSON.stringify(jobId ? { job_id: jobId } : {}),
    }),
  copyStatus: (jobId?: number) => request<CopyJobStatus>(`/copy/status${jobId ? `?job_id=${jobId}` : ""}`),
};

export function saveLastJob(job: CopyJobStatus): void {
  localStorage.setItem("svarasetu.lastJobId", String(job.job_id));
  localStorage.setItem("svarasetu.lastPlaylistDbId", String(job.destination_playlist_db_id));
  localStorage.setItem("svarasetu.lastShareUrl", job.share_url);
}

export function lastPlaylistDbId(): number | undefined {
  const value = localStorage.getItem("svarasetu.lastPlaylistDbId");
  return value ? Number(value) : undefined;
}

export function lastJobId(): number | undefined {
  const value = localStorage.getItem("svarasetu.lastJobId");
  return value ? Number(value) : undefined;
}

