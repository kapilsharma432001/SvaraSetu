import { Link, NavLink } from "react-router-dom";
import { ListMusic, PlaySquare, ShieldCheck } from "lucide-react";
import type { PropsWithChildren } from "react";

const navItems = [
  { to: "/auth", label: "Auth" },
  { to: "/liked", label: "Liked Songs" },
  { to: "/playlist", label: "Playlist" },
  { to: "/copy", label: "Copy" },
  { to: "/success", label: "Success" },
];

export default function Layout({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand" aria-label="SvaraSetu home">
          <span className="brand-mark">
            <ListMusic size={20} />
          </span>
          <span>SvaraSetu</span>
        </Link>
        <nav className="nav-links" aria-label="Primary">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "active" : "")}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="topbar-note" title="Local-first personal tool">
          <ShieldCheck size={16} />
          <span>Local</span>
        </div>
      </header>
      <main className="page">{children}</main>
      <footer className="footer">
        <PlaySquare size={16} />
        <span>Uses the official YouTube Data API v3.</span>
      </footer>
    </div>
  );
}

