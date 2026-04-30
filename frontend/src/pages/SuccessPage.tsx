import { CheckCircle2, Clipboard, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { api, lastJobId, type CopyJobStatus } from "../lib/api";

export default function SuccessPage() {
  const [status, setStatus] = useState<CopyJobStatus | null>(null);
  const [copied, setCopied] = useState(false);
  const fallbackUrl = localStorage.getItem("svarasetu.lastShareUrl") ?? "";
  const shareUrl = status?.share_url ?? fallbackUrl;

  useEffect(() => {
    async function load() {
      try {
        setStatus(await api.copyStatus(lastJobId()));
      } catch {
        setStatus(null);
      }
    }
    void load();
  }, []);

  async function copyLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
  }

  return (
    <section className="stack success-page">
      <div className="page-heading">
        <h1>Final Playlist</h1>
        <p>Your shareable YouTube playlist link is ready when the destination playlist exists.</p>
      </div>

      <div className="tool-panel">
        <div className="auth-state">
          <CheckCircle2 className="ok" size={34} />
          <div>
            <h2>{status?.status === "completed" ? "Copy completed" : "Playlist link"}</h2>
            <p>{shareUrl || "No playlist URL has been created yet."}</p>
          </div>
        </div>

        <div className="button-row">
          <button className="button primary" onClick={copyLink} disabled={!shareUrl} title="Copy playlist link">
            <Clipboard size={18} />
            {copied ? "Copied" : "Copy link"}
          </button>
          <a className="button secondary" href={shareUrl || undefined} target="_blank" rel="noreferrer" aria-disabled={!shareUrl}>
            <ExternalLink size={18} />
            Open playlist
          </a>
        </div>
      </div>
    </section>
  );
}

