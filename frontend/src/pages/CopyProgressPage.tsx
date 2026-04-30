import { Play, RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, lastJobId, lastPlaylistDbId, saveLastJob, type CopyJobStatus } from "../lib/api";

const activeStatuses = new Set(["running"]);

export default function CopyProgressPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialJobId = Number(searchParams.get("job_id") ?? lastJobId() ?? 0) || undefined;
  const [jobId, setJobId] = useState<number | undefined>(initialJobId);
  const [status, setStatus] = useState<CopyJobStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const navigate = useNavigate();

  async function loadStatus(id = jobId) {
    try {
      const response = await api.copyStatus(id);
      setStatus(response);
      setJobId(response.job_id);
      saveLastJob(response);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return;
      setMessage(error instanceof Error ? error.message : "Could not load copy status.");
    }
  }

  useEffect(() => {
    void loadStatus(initialJobId);
    const interval = window.setInterval(() => void loadStatus(jobId), 3000);
    return () => window.clearInterval(interval);
  }, [jobId]);

  useEffect(() => {
    if (jobId) setSearchParams({ job_id: String(jobId) }, { replace: true });
  }, [jobId, setSearchParams]);

  async function start() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await api.copyStart(lastPlaylistDbId());
      setStatus(response.job);
      setJobId(response.job.job_id);
      saveLastJob(response.job);
      setMessage(response.message);
    } catch (error) {
      if (error instanceof ApiError) setMessage(error.message);
      else setMessage("Could not start copy job.");
    } finally {
      setLoading(false);
    }
  }

  async function resume() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await api.copyResume(jobId);
      setStatus(response.job);
      setJobId(response.job.job_id);
      saveLastJob(response.job);
      setMessage(response.message);
    } catch (error) {
      if (error instanceof ApiError) setMessage(error.message);
      else setMessage("Could not resume copy job.");
    } finally {
      setLoading(false);
    }
  }

  const completeCount = (status?.copied_count ?? 0) + (status?.failed_count ?? 0) + (status?.skipped_count ?? 0);
  const progress = status?.total_items ? Math.round((completeCount / status.total_items) * 100) : 0;
  const isQuota = status?.status === "quota_exceeded";
  const isActive = status ? activeStatuses.has(status.status) : false;

  const headline = useMemo(() => {
    if (!status) return "No copy job yet";
    if (isQuota) return "Quota exceeded";
    if (status.status === "completed") return "Copy finished";
    if (status.status === "failed") return "Copy stopped";
    return "Copy in progress";
  }, [isQuota, status]);

  return (
    <section className="stack">
      <div className="page-heading with-action">
        <div>
          <h1>Copy Progress</h1>
          <p>Each playlist insert costs 50 quota units, so this job advances one video at a time.</p>
        </div>
        <div className="button-row">
          <button className="button primary" onClick={start} disabled={loading || isActive} title="Start copy job">
            <Play size={18} />
            Start
          </button>
          <button className="button secondary" onClick={resume} disabled={loading || isActive || !status} title="Resume copy job">
            <RotateCcw size={18} />
            Resume
          </button>
        </div>
      </div>

      {message && <div className="notice">{message}</div>}
      {isQuota && (
        <div className="notice warning">
          <TriangleAlert size={18} />
          Quota exceeded. Resume tomorrow or use another Google Cloud project.
        </div>
      )}

      <div className="tool-panel progress-panel">
        <div className="progress-header">
          <div>
            <h2>{headline}</h2>
            <p>{status?.message ?? "Create a playlist and start the copy job when ready."}</p>
          </div>
          <strong>{progress}%</strong>
        </div>

        <div className="progress-track" aria-label="Copy progress">
          <div style={{ width: `${progress}%` }} />
        </div>

        <div className="metric-grid">
          <div>
            <span>Copied</span>
            <strong>{status?.copied_count ?? 0}</strong>
          </div>
          <div>
            <span>Pending</span>
            <strong>{status?.pending_count ?? 0}</strong>
          </div>
          <div>
            <span>Skipped</span>
            <strong>{status?.skipped_count ?? 0}</strong>
          </div>
          <div>
            <span>Failed</span>
            <strong>{status?.failed_count ?? 0}</strong>
          </div>
          <div>
            <span>Total</span>
            <strong>{status?.total_items ?? 0}</strong>
          </div>
        </div>

        {status?.share_url && (
          <div className="button-row">
            <a className="button secondary" href={status.share_url} target="_blank" rel="noreferrer">
              Open playlist
            </a>
            {status.status === "completed" && (
              <button className="button primary" onClick={() => navigate("/success")}>
                Final link
              </button>
            )}
          </div>
        )}
      </div>

      {!status && (
        <p className="inline-help">
          No job was found. Create a playlist first from <Link to="/playlist">Create Playlist</Link>.
        </p>
      )}
    </section>
  );
}
