import logging
import threading
from urllib.parse import urlencode

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from googleapiclient.errors import HttpError
from sqlalchemy.orm import Session

from .auth import AuthRequiredError, complete_authorization, create_authorization_url, get_auth_status
from .config import get_settings
from .database import get_db, init_db
from .logging_config import configure_logging
from .schemas import (
    AuthStartResponse,
    AuthStatusResponse,
    CopyJobStatusResponse,
    CopyResumeRequest,
    CopyStartRequest,
    CopyStartResponse,
    HealthResponse,
    LikedFetchResponse,
    LikedItemsResponse,
    PlaylistCreateRequest,
    PlaylistOut,
)
from .services import (
    build_copy_status,
    create_destination_playlist,
    fetch_and_store_liked_items,
    get_copy_job,
    get_or_create_copy_job,
    list_liked_items,
    run_copy_job,
    sync_copy_job_items,
)
from .youtube import QUOTA_EXCEEDED_MESSAGE, is_quota_error, parse_http_error

settings = get_settings()
configure_logging(settings.log_level)
logger = logging.getLogger(__name__)

app = FastAPI(title=settings.app_name)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.backend_cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

running_jobs: set[int] = set()
running_lock = threading.Lock()


@app.on_event("startup")
def startup() -> None:
    init_db()
    logger.info("app_started")


def _frontend_redirect(path: str, **query: str) -> RedirectResponse:
    url = f"{settings.frontend_url.rstrip('/')}{path}"
    if query:
        url = f"{url}?{urlencode(query)}"
    return RedirectResponse(url)


def _http_error_from_youtube(exc: HttpError) -> HTTPException:
    info = parse_http_error(exc)
    detail = QUOTA_EXCEEDED_MESSAGE if is_quota_error(info) else info.message
    code = status.HTTP_429_TOO_MANY_REQUESTS if is_quota_error(info) else status.HTTP_400_BAD_REQUEST
    return HTTPException(status_code=code, detail=detail)


def _enqueue_copy_job(background_tasks: BackgroundTasks, job_id: int) -> bool:
    with running_lock:
        if job_id in running_jobs:
            return False
        running_jobs.add(job_id)
    background_tasks.add_task(run_copy_job, job_id, running_jobs, running_lock)
    return True


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@app.get("/auth/start", response_model=AuthStartResponse)
def auth_start(db: Session = Depends(get_db)) -> AuthStartResponse:
    return AuthStartResponse(auth_url=create_authorization_url(db))


@app.get("/auth/callback")
def auth_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
) -> RedirectResponse:
    if error:
        logger.warning("oauth_callback_error", extra={"error": error})
        return _frontend_redirect("/auth", error=error)
    if not code or not state:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OAuth callback missing code or state.")
    complete_authorization(db, code=code, state=state)
    logger.info("oauth_callback_completed", extra={"client": request.client.host if request.client else None})
    return _frontend_redirect("/auth", connected="1")


@app.get("/auth/status", response_model=AuthStatusResponse)
def auth_status(db: Session = Depends(get_db)) -> AuthStatusResponse:
    return AuthStatusResponse(**get_auth_status(db))


@app.post("/liked/fetch", response_model=LikedFetchResponse)
def liked_fetch(db: Session = Depends(get_db)) -> LikedFetchResponse:
    try:
        source_playlist_id, fetched_count, stored_count = fetch_and_store_liked_items(db)
    except AuthRequiredError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    except HttpError as exc:
        raise _http_error_from_youtube(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return LikedFetchResponse(
        source_playlist_id=source_playlist_id,
        fetched_count=fetched_count,
        stored_count=stored_count,
    )


@app.get("/liked/items", response_model=LikedItemsResponse)
def liked_items(
    search: str | None = None,
    copied_status: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> LikedItemsResponse:
    total, items = list_liked_items(db, search, copied_status, limit, offset)
    return LikedItemsResponse(total=total, limit=limit, offset=offset, items=items)


@app.post("/playlists/create", response_model=PlaylistOut)
def playlists_create(payload: PlaylistCreateRequest, db: Session = Depends(get_db)) -> PlaylistOut:
    try:
        playlist = create_destination_playlist(db, payload.title, payload.privacy_status)
    except AuthRequiredError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    except HttpError as exc:
        raise _http_error_from_youtube(exc) from exc
    return PlaylistOut.model_validate(playlist)


@app.post("/copy/start", response_model=CopyStartResponse)
def copy_start(
    background_tasks: BackgroundTasks,
    payload: CopyStartRequest | None = None,
    db: Session = Depends(get_db),
) -> CopyStartResponse:
    job = get_or_create_copy_job(db, payload.playlist_db_id if payload else None)
    started = _enqueue_copy_job(background_tasks, job.id)
    response = build_copy_status(db, job)
    return CopyStartResponse(
        job=response,
        started=started,
        message="Copy job started." if started else "Copy job is already running.",
    )


@app.post("/copy/resume", response_model=CopyStartResponse)
def copy_resume(
    background_tasks: BackgroundTasks,
    payload: CopyResumeRequest | None = None,
    db: Session = Depends(get_db),
) -> CopyStartResponse:
    job = get_copy_job(db, payload.job_id if payload else None)
    sync_copy_job_items(db, job)
    db.commit()
    started = _enqueue_copy_job(background_tasks, job.id)
    response = build_copy_status(db, job)
    return CopyStartResponse(
        job=response,
        started=started,
        message="Copy job resumed." if started else "Copy job is already running.",
    )


@app.get("/copy/status", response_model=CopyJobStatusResponse)
def copy_status(job_id: int | None = None, db: Session = Depends(get_db)) -> CopyJobStatusResponse:
    job = get_copy_job(db, job_id)
    return build_copy_status(db, job)
