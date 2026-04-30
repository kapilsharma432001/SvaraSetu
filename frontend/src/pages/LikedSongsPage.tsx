import { CheckSquare, RefreshCw, Search, Square, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, saveSelectedVideoIds, selectedVideoIds, type LikedItem } from "../lib/api";

const PAGE_SIZE = 50;

export default function LikedSongsPage() {
  const [items, setItems] = useState<LikedItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(selectedVideoIds()));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const visibleSelectedCount = useMemo(
    () => items.filter((item) => selectedIds.has(item.video_id)).length,
    [items, selectedIds],
  );

  async function loadItems(nextOffset = offset) {
    setLoading(true);
    try {
      const response = await api.likedItems({
        search: appliedQuery,
        copied_status: statusFilter,
        limit: PAGE_SIZE,
        offset: nextOffset,
      });
      setItems(response.items);
      setTotal(response.total);
      setOffset(response.offset);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load liked songs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadItems(0);
  }, [appliedQuery, statusFilter]);

  async function fetchLiked() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await api.fetchLiked();
      setMessage(`Fetched ${response.fetched_count} liked items from ${response.source_playlist_id}.`);
      setAppliedQuery("");
      setQuery("");
      await loadItems(0);
    } catch (error) {
      if (error instanceof ApiError) setMessage(error.message);
      else setMessage("Could not fetch liked songs.");
    } finally {
      setLoading(false);
    }
  }

  function search(event: FormEvent) {
    event.preventDefault();
    setOffset(0);
    setAppliedQuery(query.trim());
  }

  function updateSelection(next: Set<string>) {
    setSelectedIds(next);
    saveSelectedVideoIds([...next]);
  }

  function toggleSelected(videoId: string) {
    const next = new Set(selectedIds);
    if (next.has(videoId)) next.delete(videoId);
    else next.add(videoId);
    updateSelection(next);
  }

  function selectVisible() {
    const next = new Set(selectedIds);
    items.forEach((item) => next.add(item.video_id));
    updateSelection(next);
  }

  function clearSelection() {
    updateSelection(new Set());
  }

  const pageEnd = Math.min(offset + PAGE_SIZE, total);

  return (
    <section className="stack">
      <div className="page-heading with-action">
        <div>
          <h1>Liked Songs</h1>
          <p>Fetch, inspect, and search the liked videos saved in local SQLite.</p>
        </div>
        <button className="button primary" onClick={fetchLiked} disabled={loading} title="Fetch liked songs">
          <RefreshCw size={18} />
          Fetch liked songs
        </button>
      </div>

      {message && <div className="notice">{message}</div>}

      <div className="toolbar">
        <form className="search-form" onSubmit={search}>
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title or channel" />
          <button className="button secondary" type="submit">Search</button>
        </form>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by copy status">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="copied">Copied</option>
          <option value="skipped">Skipped</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <div className="count-row">
        <span>{total} liked items</span>
        <span>{selectedIds.size} selected</span>
        <span>{total ? `${offset + 1}-${pageEnd}` : "0-0"}</span>
      </div>

      <div className="selection-bar">
        <div>
          <strong>{selectedIds.size} selected for copy</strong>
          <span>{visibleSelectedCount} selected on this page</span>
        </div>
        <div className="button-row">
          <button className="button secondary" onClick={selectVisible} disabled={!items.length} title="Select all visible rows">
            <CheckSquare size={18} />
            Select page
          </button>
          <button className="button secondary" onClick={clearSelection} disabled={!selectedIds.size} title="Clear selected songs">
            <Trash2 size={18} />
            Clear
          </button>
          <Link className="button primary" to="/copy">
            Use selected
          </Link>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Select</th>
              <th>Video</th>
              <th>Channel / Artist</th>
              <th>Availability</th>
              <th>Copy Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <button
                    className="icon-button"
                    onClick={() => toggleSelected(item.video_id)}
                    title={selectedIds.has(item.video_id) ? "Remove from selected songs" : "Select song"}
                  >
                    {selectedIds.has(item.video_id) ? <CheckSquare size={18} /> : <Square size={18} />}
                  </button>
                </td>
                <td>
                  <div className="video-cell">
                    {item.thumbnail_url ? <img src={item.thumbnail_url} alt="" /> : <div className="thumb-placeholder" />}
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.video_id}</span>
                    </div>
                  </div>
                </td>
                <td>{item.channel_title ?? "Unknown"}</td>
                <td><span className={`pill ${item.availability_status}`}>{item.availability_status}</span></td>
                <td>
                  <span className={`pill ${item.copied_status}`}>{item.copied_status}</span>
                  {item.error_message && <small>{item.error_message}</small>}
                </td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={5} className="empty-cell">No liked songs stored yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <button className="button secondary" onClick={() => void loadItems(Math.max(offset - PAGE_SIZE, 0))} disabled={loading || offset === 0}>
          Previous
        </button>
        <button className="button secondary" onClick={() => void loadItems(offset + PAGE_SIZE)} disabled={loading || pageEnd >= total}>
          Next
        </button>
      </div>
    </section>
  );
}
