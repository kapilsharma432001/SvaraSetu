# SvaraSetu

SvaraSetu is a local-first web app for copying your YouTube Music / YouTube liked songs into a normal YouTube playlist that can be shared.

The app uses the official YouTube Data API v3. It does not scrape YouTube.

## What It Does

- Connects your Google account with OAuth 2.0.
- Reads `contentDetails.relatedPlaylists.likes` from `channels.list(part="contentDetails", mine=True)`.
- Fetches liked videos with `playlistItems.list` using `maxResults=50` and pagination.
- Stores liked items and copy progress in SQLite.
- Creates a destination playlist with `playlists.insert`.
- Adds videos one at a time with `playlistItems.insert`.
- Tracks copied, skipped, failed, and pending items so a copy job can resume after app restarts or quota exhaustion.

`playlistItems.insert` costs 50 quota units per video. If YouTube returns quota exhaustion, the app stops the job and shows:

```text
Quota exceeded. Resume tomorrow or use another Google Cloud project.
```

## Project Structure

```text
.
├── backend/app/        # FastAPI backend
├── frontend/           # React + Vite + TypeScript frontend
├── data/               # Local SQLite DB, ignored by Git
├── requirements.txt
├── .env.example
└── README.md
```

## Google Cloud Setup

1. Create a Google Cloud project.
2. Enable **YouTube Data API v3**.
3. Configure the OAuth consent screen for your account.
4. Create an OAuth client:
   - Application type: **Web application**
   - Authorized JavaScript origins: `http://localhost:5173`
   - Authorized redirect URI: `http://localhost:8000/auth/callback`
5. Download the OAuth client JSON.
6. Save it at the repo root as `client_secret.json`.

Do not commit `client_secret.json`.

## Backend Setup

Use your existing virtual environment:

```bash
source venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8001
```

The backend will create `data/svarasetu.db` on startup.

## Frontend Setup

In another terminal:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open:

```text
http://localhost:5173
```

## Local Workflow

1. Open the app and go to **Auth**.
2. Connect your Google account.
3. Go to **Liked Songs** and fetch liked songs.
4. Go to **Playlist**, keep the default title `Kapil's Shared Liked Songs` or enter another title, and create the playlist.
5. Go to **Copy** and start the copy job.
6. If quota is exceeded, come back later and press **Resume**.
7. Go to **Success** to copy the playlist URL.

The share URL format is:

```text
https://www.youtube.com/playlist?list=<PLAYLIST_ID>
```

## API Endpoints

- `GET /health`
- `GET /auth/start`
- `GET /auth/callback`
- `GET /auth/status`
- `POST /liked/fetch`
- `GET /liked/items`
- `POST /playlists/create`
- `POST /copy/start`
- `POST /copy/resume`
- `GET /copy/status`

## Safety Notes

Ignored by Git:

- `.env`
- `client_secret.json`
- `token.json`
- `data/`
- SQLite database files
- `venv/`
- `frontend/node_modules/`
- `frontend/dist/`

OAuth tokens are stored in the local SQLite database for this personal development tool. The database is ignored by Git and the backend attempts to keep the SQLite file permission-limited on startup.

## Optional Future Modules

The MVP is intentionally focused on reliability and resumability. Good follow-up modules include:

- Copy only the last N liked songs.
- Copy only songs liked after a selected date.
- Exclude Shorts.
- Export liked songs to CSV or JSON.
- Generate yearly playlists.
- Artist/channel frequency stats.
- Dry-run quota estimator.
- Backup mode before copying.
- Dark mode.
