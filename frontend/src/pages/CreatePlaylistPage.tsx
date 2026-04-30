import { ListPlus, Lock, Unlock, Users, type LucideIcon } from "lucide-react";
import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, saveLastJob, type Playlist } from "../lib/api";

type Privacy = "unlisted" | "private" | "public";

const privacyOptions: Array<{ value: Privacy; label: string; icon: LucideIcon }> = [
  { value: "unlisted", label: "Unlisted", icon: Unlock },
  { value: "private", label: "Private", icon: Lock },
  { value: "public", label: "Public", icon: Users },
];

export default function CreatePlaylistPage() {
  const [title, setTitle] = useState("Kapil's Shared Liked Songs");
  const [privacy, setPrivacy] = useState<Privacy>("unlisted");
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const navigate = useNavigate();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const response = await api.createPlaylist({ title: title.trim(), privacy_status: privacy });
      setPlaylist(response);
      localStorage.setItem("svarasetu.lastPlaylistDbId", String(response.id));
      localStorage.setItem("svarasetu.lastShareUrl", response.share_url);
      setMessage("Playlist created.");
    } catch (error) {
      if (error instanceof ApiError) setMessage(error.message);
      else setMessage("Could not create playlist.");
    } finally {
      setLoading(false);
    }
  }

  async function startCopy() {
    if (!playlist) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await api.copyStart(playlist.id);
      saveLastJob(response.job);
      navigate(`/copy?job_id=${response.job.job_id}`);
    } catch (error) {
      if (error instanceof ApiError) setMessage(error.message);
      else setMessage("Could not start copy job.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="stack">
      <div className="page-heading">
        <h1>Create Playlist</h1>
        <p>Create a normal YouTube playlist that can be shared after copying finishes.</p>
      </div>

      {message && <div className="notice success">{message}</div>}

      <form className="tool-panel form-panel" onSubmit={submit}>
        <label>
          <span>Playlist title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={150} />
        </label>

        <div className="field-group">
          <span>Privacy</span>
          <div className="segmented">
            {privacyOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={privacy === option.value ? "selected" : ""}
                  onClick={() => setPrivacy(option.value)}
                  title={`${option.label} playlist`}
                >
                  <Icon size={16} />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <button className="button primary" type="submit" disabled={loading}>
          <ListPlus size={18} />
          Create playlist
        </button>
      </form>

      {playlist && (
        <div className="tool-panel compact-panel">
          <div>
            <h2>{playlist.title}</h2>
            <p>{playlist.share_url}</p>
          </div>
          <button className="button primary" onClick={startCopy} disabled={loading}>
            Start copying
          </button>
        </div>
      )}
    </section>
  );
}
