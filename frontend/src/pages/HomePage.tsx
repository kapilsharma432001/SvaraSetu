import { ArrowRight, Database, Link2, ListChecks, Youtube } from "lucide-react";
import { Link } from "react-router-dom";

const steps = [
  {
    title: "Connect Google",
    body: "Authorize YouTube Data API access for your own account with the youtube.force-ssl scope.",
  },
  {
    title: "Fetch likes",
    body: "Read your liked videos playlist through channels.list and playlistItems.list, then save a local copy.",
  },
  {
    title: "Create playlist",
    body: "Create a normal YouTube playlist with your chosen privacy setting, defaulting to Unlisted.",
  },
  {
    title: "Copy safely",
    body: "Insert one video at a time, track progress in SQLite, and resume after quota limits or restarts.",
  },
];

export default function HomePage() {
  return (
    <section className="home-grid">
      <div className="intro-panel">
        <div className="eyebrow">
          <Youtube size={18} />
          YouTube liked songs to shareable playlist
        </div>
        <h1>SvaraSetu</h1>
        <p>
          Copy your YouTube Music or YouTube liked songs into a new normal playlist, make it shareable,
          and keep every local step resumable so quota limits do not force a restart.
        </p>
        <div className="hero-actions">
          <Link to="/auth" className="button primary">
            Connect account
            <ArrowRight size={18} />
          </Link>
          <Link to="/liked" className="button secondary">
            View liked songs
          </Link>
        </div>
      </div>

      <div className="status-strip">
        <div>
          <Database size={20} />
          <span>SQLite state</span>
        </div>
        <div>
          <ListChecks size={20} />
          <span>Resumable copy jobs</span>
        </div>
        <div>
          <Link2 size={20} />
          <span>Final playlist URL</span>
        </div>
      </div>

      <div className="step-grid">
        {steps.map((step, index) => (
          <article className="step-card" key={step.title}>
            <span className="step-number">{index + 1}</span>
            <h2>{step.title}</h2>
            <p>{step.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

