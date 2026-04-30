import { CheckCircle2, KeyRound, RefreshCw, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { api, ApiError, type AuthStatus } from "../lib/api";

export default function AuthPage() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  async function loadStatus() {
    setLoading(true);
    setMessage(null);
    try {
      setStatus(await api.authStatus());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load auth status.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected")) setMessage("Google account connected.");
    if (params.get("error")) setMessage(params.get("error"));
    void loadStatus();
  }, []);

  async function connect() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await api.authStart();
      window.location.href = response.auth_url;
    } catch (error) {
      if (error instanceof ApiError) setMessage(error.message);
      else setMessage("Could not start Google OAuth.");
      setLoading(false);
    }
  }

  const connected = Boolean(status?.connected && status.valid);

  return (
    <section className="stack">
      <div className="page-heading">
        <h1>Google Account</h1>
        <p>Authorize the local backend to read liked videos and create a playlist through the official API.</p>
      </div>

      {message && <div className={connected ? "notice success" : "notice"}>{message}</div>}

      <div className="tool-panel">
        <div className="auth-state">
          {connected ? <CheckCircle2 className="ok" size={34} /> : <ShieldAlert className="warn" size={34} />}
          <div>
            <h2>{connected ? "Connected" : "Not connected"}</h2>
            <p>{status?.message ?? "Token refresh is handled automatically when Google provides a refresh token."}</p>
          </div>
        </div>

        <div className="button-row">
          <button className="button primary" onClick={connect} disabled={loading} title="Connect Google account">
            <KeyRound size={18} />
            Connect Google
          </button>
          <button className="icon-button" onClick={loadStatus} disabled={loading} title="Refresh auth status">
            <RefreshCw size={18} />
          </button>
        </div>

        <dl className="meta-grid">
          <div>
            <dt>Connected</dt>
            <dd>{status?.connected ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt>Valid token</dt>
            <dd>{status?.valid ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt>Scope</dt>
            <dd>{status?.scopes?.[0] ?? "None"}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

