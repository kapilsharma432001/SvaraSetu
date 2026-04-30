import { Calculator, Play, RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  api,
  ApiError,
  lastJobId,
  lastPlaylistDbId,
  saveLastJob,
  selectedVideoIds,
  type CopyEstimate,
  type CopyJobStatus,
  type CopySelectionPayload,
} from "../lib/api";

const activeStatuses = new Set(["running"]);
type CopyMode = "all" | "selected" | "last_n";

export default function CopyProgressPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialJobId = Number(searchParams.get("job_id") ?? lastJobId() ?? 0) || undefined;
  const [jobId, setJobId] = useState<number | undefined>(initialJobId);
  const [status, setStatus] = useState<CopyJobStatus | null>(null);
  const [copyMode, setCopyMode] = useState<CopyMode>("all");
  const [lastN, setLastN] = useState(100);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => selectedVideoIds());
  const [estimate, setEstimate] = useState<CopyEstimate | null>(null);
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

  function copyPayload(): CopySelectionPayload {
    const payload: CopySelectionPayload = { playlist_db_id: lastPlaylistDbId() };
    if (copyMode === "selected") payload.video_ids = selectedIds;
    if (copyMode === "last_n") payload.last_n = lastN;
    return payload;
  }

  async function refreshEstimate() {
    if (copyMode === "selected" && !selectedIds.length) {
      setEstimate({
        items_selected: 0,
        estimated_copy_quota: 0,
        estimated_days: 0,
        daily_quota: 10000,
        insert_quota_per_item: 50,
        mode: "selected",
      });
      return;
    }
    try {
      setEstimate(await api.copyEstimate(copyPayload()));
    } catch (error) {
      setEstimate(null);
      if (error instanceof ApiError && error.status === 400) setMessage(error.message);
    }
  }

  useEffect(() => {
    setSelectedIds(selectedVideoIds());
  }, [copyMode]);

  useEffect(() => {
    void refreshEstimate();
  }, [copyMode, lastN, selectedIds.length]);

  async function start() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await api.copyStart(copyPayload());
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
  const cannotStartSelected = copyMode === "selected" && selectedIds.length === 0;

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
          <button className="button primary" onClick={start} disabled={loading || isActive || cannotStartSelected} title="Start copy job">
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

      <div className="tool-panel copy-filter-panel">
        <div className="filter-header">
          <div>
            <h2>Copy Filter</h2>
            <p>Choose what the next new copy job should include.</p>
          </div>
          <button className="icon-button" onClick={refreshEstimate} disabled={loading} title="Refresh quota estimate">
            <Calculator size={18} />
          </button>
        </div>

        <div className="copy-filter-grid">
          <label>
            <span>Copy mode</span>
            <select value={copyMode} onChange={(event) => setCopyMode(event.target.value as CopyMode)}>
              <option value="all">All fetched liked songs</option>
              <option value="selected">Selected songs</option>
              <option value="last_n">Last N songs</option>
            </select>
          </label>

          {copyMode === "last_n" && (
            <label>
              <span>Last N</span>
              <select value={lastN} onChange={(event) => setLastN(Number(event.target.value))}>
                <option value={50}>50 songs</option>
                <option value={100}>100 songs</option>
                <option value={200}>200 songs</option>
                <option value={300}>300 songs</option>
                <option value={500}>500 songs</option>
              </select>
            </label>
          )}

          {copyMode === "selected" && (
            <div className="selected-summary">
              <span>Selected songs</span>
              <strong>{selectedIds.length}</strong>
              <Link to="/liked">Change selection</Link>
            </div>
          )}
        </div>

        <div className="estimate-grid">
          <div>
            <span>Items selected</span>
            <strong>{estimate?.items_selected.toLocaleString() ?? "0"}</strong>
          </div>
          <div>
            <span>Estimated copy quota</span>
            <strong>{estimate?.estimated_copy_quota.toLocaleString() ?? "0"} units</strong>
          </div>
          <div>
            <span>Estimated days</span>
            <strong>{estimate?.estimated_days.toLocaleString() ?? "0"}</strong>
          </div>
        </div>
      </div>

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
