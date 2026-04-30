from __future__ import annotations

import logging
import threading
from collections.abc import MutableSet
from typing import Any

from fastapi import HTTPException, status
from googleapiclient.errors import HttpError
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from .auth import AuthRequiredError, load_credentials
from .database import SessionLocal
from .models import CopyJob, CopyJobItem, LikedItem, Playlist, utc_now
from .schemas import CopyEstimateResponse, CopyJobStatusResponse
from .youtube import (
    QUOTA_EXCEEDED_MESSAGE,
    create_playlist,
    fetch_liked_playlist_items,
    get_playlist_video_ids,
    insert_video_into_playlist,
    is_duplicate_error,
    is_quota_error,
    make_youtube_service,
    parse_http_error,
)

logger = logging.getLogger(__name__)
INSERT_QUOTA_PER_ITEM = 50
DEFAULT_DAILY_QUOTA = 10_000


def fetch_and_store_liked_items(db: Session) -> tuple[str, int, int]:
    credentials = load_credentials(db)
    youtube = make_youtube_service(credentials)
    source_playlist_id, items = fetch_liked_playlist_items(youtube)
    stored_count = upsert_liked_items(db, items)
    logger.info("liked_items_fetched", extra={"fetched_count": len(items), "stored_count": stored_count})
    return source_playlist_id, len(items), stored_count


def upsert_liked_items(db: Session, items: list[dict[str, Any]]) -> int:
    stored_count = 0
    for data in items:
        existing = db.scalar(
            select(LikedItem).where(
                LikedItem.source_playlist_id == data["source_playlist_id"],
                LikedItem.video_id == data["video_id"],
            )
        )
        if existing is None:
            db.add(LikedItem(**data))
        else:
            existing.title = data["title"]
            existing.channel_title = data["channel_title"]
            existing.thumbnail_url = data["thumbnail_url"]
            existing.position = data["position"]
            existing.published_at = data["published_at"]
            existing.availability_status = data["availability_status"]
        stored_count += 1
    db.commit()
    return stored_count


def list_liked_items(db: Session, search: str | None, copied_status: str | None, limit: int, offset: int) -> tuple[int, list[LikedItem]]:
    statement = select(LikedItem)
    count_statement = select(func.count(LikedItem.id))
    filters = []
    if search:
        pattern = f"%{search}%"
        filters.append((LikedItem.title.ilike(pattern)) | (LikedItem.channel_title.ilike(pattern)))
    if copied_status:
        filters.append(LikedItem.copied_status == copied_status)
    for condition in filters:
        statement = statement.where(condition)
        count_statement = count_statement.where(condition)
    total = db.scalar(count_statement) or 0
    items = db.scalars(statement.order_by(LikedItem.position.asc()).offset(offset).limit(limit)).all()
    return total, list(items)


def create_destination_playlist(db: Session, title: str, privacy_status: str) -> Playlist:
    credentials = load_credentials(db)
    youtube = make_youtube_service(credentials)
    response = create_playlist(youtube, title, privacy_status)
    youtube_playlist_id = response["id"]
    share_url = f"https://www.youtube.com/playlist?list={youtube_playlist_id}"
    playlist = Playlist(
        youtube_playlist_id=youtube_playlist_id,
        title=title,
        privacy_status=privacy_status,
        share_url=share_url,
    )
    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    logger.info("destination_playlist_created", extra={"playlist_id": youtube_playlist_id})
    return playlist


def get_latest_playlist(db: Session) -> Playlist | None:
    return db.scalars(select(Playlist).order_by(Playlist.id.desc()).limit(1)).first()


def get_playlist_or_latest(db: Session, playlist_db_id: int | None) -> Playlist:
    playlist = db.get(Playlist, playlist_db_id) if playlist_db_id is not None else get_latest_playlist(db)
    if playlist is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Create a destination playlist first.")
    return playlist


def selected_liked_items(db: Session, video_ids: list[str] | None = None, last_n: int | None = None) -> list[LikedItem]:
    statement = select(LikedItem).order_by(LikedItem.position.asc())
    all_items = list(db.scalars(statement).all())
    if not all_items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Fetch liked songs before starting a copy job.")

    if video_ids is not None:
        selected_ids = set(video_ids)
        all_items = [item for item in all_items if item.video_id in selected_ids]
    elif last_n:
        all_items = all_items[:last_n]

    deduped_items: list[LikedItem] = []
    seen_video_ids: set[str] = set()
    for liked_item in all_items:
        if liked_item.video_id in seen_video_ids:
            continue
        seen_video_ids.add(liked_item.video_id)
        deduped_items.append(liked_item)
    return deduped_items


def selection_mode(video_ids: list[str] | None = None, last_n: int | None = None) -> str:
    if video_ids is not None:
        return "selected"
    if last_n:
        return f"last_{last_n}"
    return "all"


def estimate_copy_selection(db: Session, video_ids: list[str] | None = None, last_n: int | None = None) -> CopyEstimateResponse:
    items = selected_liked_items(db, video_ids=video_ids, last_n=last_n)
    estimated_quota = len(items) * INSERT_QUOTA_PER_ITEM
    estimated_days = max((estimated_quota + DEFAULT_DAILY_QUOTA - 1) // DEFAULT_DAILY_QUOTA, 1) if estimated_quota else 0
    return CopyEstimateResponse(
        items_selected=len(items),
        estimated_copy_quota=estimated_quota,
        estimated_days=estimated_days,
        daily_quota=DEFAULT_DAILY_QUOTA,
        insert_quota_per_item=INSERT_QUOTA_PER_ITEM,
        mode=selection_mode(video_ids=video_ids, last_n=last_n),
    )


def create_copy_job(db: Session, playlist_db_id: int | None, video_ids: list[str] | None = None, last_n: int | None = None) -> CopyJob:
    playlist = get_playlist_or_latest(db, playlist_db_id)
    liked_items = selected_liked_items(db, video_ids=video_ids, last_n=last_n)
    if not liked_items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No liked songs matched the selected copy filter.")

    mode = selection_mode(video_ids=video_ids, last_n=last_n)
    job = CopyJob(
        destination_playlist_db_id=playlist.id,
        status="pending",
        message=f"Created {mode} copy job.",
    )
    db.add(job)
    db.flush()
    for liked_item in liked_items:
        liked_item.copied_status = "pending"
        liked_item.error_message = None
        db.add(
            CopyJobItem(
                copy_job_id=job.id,
                liked_item_id=liked_item.id,
                video_id=liked_item.video_id,
                status="pending",
            )
        )
    db.commit()
    db.refresh(job)
    recalculate_job_counts(db, job)
    db.commit()
    return job


def sync_copy_job_items(db: Session, job: CopyJob) -> None:
    liked_items = db.scalars(select(LikedItem).order_by(LikedItem.position.asc())).all()
    if not liked_items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Fetch liked songs before starting a copy job.")

    existing_video_ids = set(
        db.scalars(select(CopyJobItem.video_id).where(CopyJobItem.copy_job_id == job.id)).all()
    )
    seen_video_ids: set[str] = set(existing_video_ids)
    for liked_item in liked_items:
        if liked_item.video_id in seen_video_ids:
            continue
        seen_video_ids.add(liked_item.video_id)
        db.add(
            CopyJobItem(
                copy_job_id=job.id,
                liked_item_id=liked_item.id,
                video_id=liked_item.video_id,
                status="pending",
            )
        )
    recalculate_job_counts(db, job)


def get_latest_copy_job(db: Session) -> CopyJob | None:
    return db.scalars(select(CopyJob).order_by(CopyJob.id.desc()).limit(1)).first()


def get_copy_job(db: Session, job_id: int | None) -> CopyJob:
    job = db.get(CopyJob, job_id) if job_id is not None else get_latest_copy_job(db)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No copy job found.")
    return job


def recalculate_job_counts(db: Session, job: CopyJob) -> None:
    rows = db.execute(
        select(CopyJobItem.status, func.count(CopyJobItem.id))
        .where(CopyJobItem.copy_job_id == job.id)
        .group_by(CopyJobItem.status)
    ).all()
    counts = {row[0]: row[1] for row in rows}
    job.total_items = sum(counts.values())
    job.copied_count = counts.get("copied", 0)
    job.failed_count = counts.get("failed", 0)
    job.skipped_count = counts.get("skipped", 0)


def build_copy_status(db: Session, job: CopyJob) -> CopyJobStatusResponse:
    recalculate_job_counts(db, job)
    db.commit()
    db.refresh(job)
    playlist = db.get(Playlist, job.destination_playlist_db_id)
    if playlist is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Destination playlist record missing.")
    pending_count = max(job.total_items - job.copied_count - job.failed_count - job.skipped_count, 0)
    return CopyJobStatusResponse(
        job_id=job.id,
        status=job.status,
        total_items=job.total_items,
        copied_count=job.copied_count,
        failed_count=job.failed_count,
        skipped_count=job.skipped_count,
        pending_count=pending_count,
        message=job.message,
        destination_playlist_id=playlist.youtube_playlist_id,
        destination_playlist_db_id=playlist.id,
        share_url=playlist.share_url,
        started_at=job.started_at,
        finished_at=job.finished_at,
        updated_at=job.updated_at,
    )


def _mark_item(copy_item: CopyJobItem, status_value: str, error_message: str | None = None) -> None:
    copy_item.status = status_value
    copy_item.error_message = error_message
    copy_item.liked_item.copied_status = status_value
    copy_item.liked_item.error_message = error_message


def _pending_copy_items(db: Session, job_id: int) -> list[CopyJobItem]:
    return list(
        db.scalars(
            select(CopyJobItem)
            .options(selectinload(CopyJobItem.liked_item))
            .join(LikedItem, CopyJobItem.liked_item_id == LikedItem.id)
            .where(CopyJobItem.copy_job_id == job_id, CopyJobItem.status.in_(("pending", "failed")))
            .order_by(LikedItem.position.asc())
        ).all()
    )


def _set_job_terminal_error(db: Session, job: CopyJob, status_value: str, message: str) -> None:
    job.status = status_value
    job.message = message
    job.finished_at = utc_now()
    recalculate_job_counts(db, job)
    db.commit()


def run_copy_job(
    job_id: int,
    running_jobs: MutableSet[int] | None = None,
    running_lock: threading.Lock | None = None,
) -> None:
    db = SessionLocal()
    try:
        job = db.get(CopyJob, job_id)
        if job is None:
            logger.error("copy_job_missing", extra={"job_id": job_id})
            return
        playlist = db.get(Playlist, job.destination_playlist_db_id)
        if playlist is None:
            _set_job_terminal_error(db, job, "failed", "Destination playlist record missing.")
            return

        try:
            credentials = load_credentials(db)
            youtube = make_youtube_service(credentials)
        except AuthRequiredError as exc:
            _set_job_terminal_error(db, job, "failed", str(exc))
            return

        job.status = "running"
        job.message = "Copying liked songs one at a time."
        job.started_at = job.started_at or utc_now()
        job.finished_at = None
        db.commit()

        try:
            destination_video_ids = get_playlist_video_ids(youtube, playlist.youtube_playlist_id)
        except HttpError as exc:
            info = parse_http_error(exc)
            message = QUOTA_EXCEEDED_MESSAGE if is_quota_error(info) else info.message
            _set_job_terminal_error(db, job, "quota_exceeded" if is_quota_error(info) else "failed", message)
            return

        for copy_item in _pending_copy_items(db, job.id):
            availability = copy_item.liked_item.availability_status
            if availability in {"private", "deleted", "unavailable"}:
                _mark_item(copy_item, "skipped", f"Skipped because this video is {availability}.")
            elif copy_item.video_id in destination_video_ids:
                _mark_item(copy_item, "skipped", "Skipped duplicate already present in destination playlist.")
            else:
                try:
                    insert_video_into_playlist(youtube, playlist.youtube_playlist_id, copy_item.video_id)
                    destination_video_ids.add(copy_item.video_id)
                    _mark_item(copy_item, "copied")
                except HttpError as exc:
                    info = parse_http_error(exc)
                    if is_quota_error(info):
                        copy_item.error_message = QUOTA_EXCEEDED_MESSAGE
                        job.status = "quota_exceeded"
                        job.message = QUOTA_EXCEEDED_MESSAGE
                        recalculate_job_counts(db, job)
                        db.commit()
                        logger.warning("copy_job_quota_exceeded", extra={"job_id": job.id})
                        return
                    if is_duplicate_error(info):
                        _mark_item(copy_item, "skipped", "Skipped duplicate already present in destination playlist.")
                    else:
                        _mark_item(copy_item, "failed", info.message)
                        logger.warning(
                            "copy_item_failed",
                            extra={"job_id": job.id, "video_id": copy_item.video_id, "reason": info.reason},
                        )
            recalculate_job_counts(db, job)
            db.commit()

        recalculate_job_counts(db, job)
        job.status = "completed"
        job.message = "Copy job completed."
        job.finished_at = utc_now()
        db.commit()
        logger.info("copy_job_completed", extra={"job_id": job.id})
    except Exception as exc:
        logger.exception("copy_job_failed", extra={"job_id": job_id})
        job = db.get(CopyJob, job_id)
        if job is not None:
            job.status = "failed"
            job.message = str(exc)
            job.finished_at = utc_now()
            recalculate_job_counts(db, job)
            db.commit()
    finally:
        db.close()
        if running_jobs is not None and running_lock is not None:
            with running_lock:
                running_jobs.discard(job_id)
