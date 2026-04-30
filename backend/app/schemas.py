from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


PrivacyStatus = Literal["private", "public", "unlisted"]


class HealthResponse(BaseModel):
    status: str


class AuthStartResponse(BaseModel):
    auth_url: str


class AuthStatusResponse(BaseModel):
    connected: bool
    valid: bool
    expired: bool
    scopes: list[str]
    account_email: str | None = None
    message: str | None = None


class LikedFetchResponse(BaseModel):
    source_playlist_id: str
    fetched_count: int
    stored_count: int


class LikedItemOut(BaseModel):
    id: int
    video_id: str
    title: str
    channel_title: str | None
    thumbnail_url: str | None
    position: int | None
    published_at: str | None
    source_playlist_id: str
    availability_status: str
    copied_status: str
    error_message: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LikedItemsResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[LikedItemOut]


class PlaylistCreateRequest(BaseModel):
    title: str = Field(default="Kapil's Shared Liked Songs", min_length=1, max_length=150)
    privacy_status: PrivacyStatus = "unlisted"


class PlaylistOut(BaseModel):
    id: int
    youtube_playlist_id: str
    title: str
    privacy_status: str
    share_url: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CopySelectionRequest(BaseModel):
    playlist_db_id: int | None = None
    video_ids: list[str] | None = None
    last_n: int | None = Field(default=None, ge=1, le=5000)


class CopyStartRequest(CopySelectionRequest):
    pass


class CopyEstimateRequest(CopySelectionRequest):
    pass


class CopyEstimateResponse(BaseModel):
    items_selected: int
    estimated_copy_quota: int
    estimated_days: int
    daily_quota: int
    insert_quota_per_item: int
    mode: str


class CopyResumeRequest(BaseModel):
    job_id: int | None = None


class CopyJobStatusResponse(BaseModel):
    job_id: int
    status: str
    total_items: int
    copied_count: int
    failed_count: int
    skipped_count: int
    pending_count: int
    message: str | None
    destination_playlist_id: str
    destination_playlist_db_id: int
    share_url: str
    started_at: datetime | None
    finished_at: datetime | None
    updated_at: datetime


class CopyStartResponse(BaseModel):
    job: CopyJobStatusResponse
    started: bool
    message: str
