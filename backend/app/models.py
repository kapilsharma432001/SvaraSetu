from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )


class OAuthToken(TimestampMixin, Base):
    __tablename__ = "oauth_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token_json: Mapped[str] = mapped_column(Text, nullable=False)
    scopes: Mapped[str] = mapped_column(Text, nullable=False)
    account_email: Mapped[str | None] = mapped_column(String(320), nullable=True)


class OAuthState(TimestampMixin, Base):
    __tablename__ = "oauth_states"

    state: Mapped[str] = mapped_column(String(255), primary_key=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class LikedItem(TimestampMixin, Base):
    __tablename__ = "liked_items"
    __table_args__ = (UniqueConstraint("source_playlist_id", "video_id", name="uq_liked_source_video"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    video_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    channel_title: Mapped[str | None] = mapped_column(Text, nullable=True)
    thumbnail_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    position: Mapped[int | None] = mapped_column(Integer, nullable=True)
    published_at: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source_playlist_id: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    availability_status: Mapped[str] = mapped_column(String(64), default="unknown", nullable=False)
    copied_status: Mapped[str] = mapped_column(String(32), default="pending", index=True, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    copy_job_items: Mapped[list["CopyJobItem"]] = relationship(back_populates="liked_item")


class Playlist(TimestampMixin, Base):
    __tablename__ = "playlists"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    youtube_playlist_id: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    privacy_status: Mapped[str] = mapped_column(String(32), default="unlisted", nullable=False)
    share_url: Mapped[str] = mapped_column(Text, nullable=False)

    copy_jobs: Mapped[list["CopyJob"]] = relationship(back_populates="playlist")


class CopyJob(TimestampMixin, Base):
    __tablename__ = "copy_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    destination_playlist_db_id: Mapped[int] = mapped_column(ForeignKey("playlists.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True, nullable=False)
    total_items: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    copied_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    skipped_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    playlist: Mapped[Playlist] = relationship(back_populates="copy_jobs")
    items: Mapped[list["CopyJobItem"]] = relationship(back_populates="copy_job")


class CopyJobItem(TimestampMixin, Base):
    __tablename__ = "copy_job_items"
    __table_args__ = (UniqueConstraint("copy_job_id", "video_id", name="uq_copy_job_video"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    copy_job_id: Mapped[int] = mapped_column(ForeignKey("copy_jobs.id"), index=True, nullable=False)
    liked_item_id: Mapped[int] = mapped_column(ForeignKey("liked_items.id"), nullable=False)
    video_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    copy_job: Mapped[CopyJob] = relationship(back_populates="items")
    liked_item: Mapped[LikedItem] = relationship(back_populates="copy_job_items")

