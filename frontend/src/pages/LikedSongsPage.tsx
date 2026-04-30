import { RefreshCw, Search } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { api, ApiError, type LikedItem } from "../lib/api";

const PAGE_SIZE = 50;

export default function LikedSongsPage() {
  const [items, setItems] = useState<LikedItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
        <span>{total ? `${offset + 1}-${pageEnd}` : "0-0"}</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
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
                <td colSpan={4} className="empty-cell">No liked songs stored yet.</td>
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

