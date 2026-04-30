import json
from dataclasses import dataclass
from typing import Any

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

QUOTA_EXCEEDED_MESSAGE = "Quota exceeded. Resume tomorrow or use another Google Cloud project."


@dataclass(frozen=True)
class YouTubeErrorInfo:
    status_code: int | None
    reason: str
    message: str


def make_youtube_service(credentials: Credentials) -> Any:
    return build("youtube", "v3", credentials=credentials, cache_discovery=False)


def parse_http_error(error: HttpError) -> YouTubeErrorInfo:
    status_code = getattr(error.resp, "status", None)
    reason = "unknown"
    message = str(error)
    try:
        payload = json.loads(error.content.decode("utf-8"))
        error_payload = payload.get("error", {})
        message = error_payload.get("message") or message
        errors = error_payload.get("errors") or []
        if errors:
            reason = errors[0].get("reason") or reason
    except Exception:
        pass
    return YouTubeErrorInfo(status_code=status_code, reason=reason, message=message)


def is_quota_error(info: YouTubeErrorInfo) -> bool:
    return info.reason in {"quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded"} and info.status_code == 403


def is_duplicate_error(info: YouTubeErrorInfo) -> bool:
    text = f"{info.reason} {info.message}".lower()
    return "duplicate" in text or "already" in text


def get_liked_playlist_id(youtube: Any) -> str:
    response = youtube.channels().list(part="contentDetails", mine=True, maxResults=1).execute()
    items = response.get("items") or []
    if not items:
        raise ValueError("No YouTube channel was found for the connected account.")
    liked_playlist_id = (
        items[0]
        .get("contentDetails", {})
        .get("relatedPlaylists", {})
        .get("likes")
    )
    if not liked_playlist_id:
        raise ValueError("The connected YouTube channel did not expose a liked videos playlist.")
    return liked_playlist_id


def _thumbnail_url(thumbnails: dict[str, Any]) -> str | None:
    for key in ("maxres", "standard", "high", "medium", "default"):
        value = thumbnails.get(key)
        if value and value.get("url"):
            return value["url"]
    return None


def _availability_status(snippet: dict[str, Any], status: dict[str, Any]) -> str:
    title = (snippet.get("title") or "").strip().lower()
    if title == "private video":
        return "private"
    if title == "deleted video":
        return "deleted"
    privacy = status.get("privacyStatus")
    if privacy == "private":
        return "private"
    return "available"


def normalize_playlist_item(item: dict[str, Any], source_playlist_id: str) -> dict[str, Any]:
    snippet = item.get("snippet", {})
    content_details = item.get("contentDetails", {})
    status = item.get("status", {})
    video_id = content_details.get("videoId") or snippet.get("resourceId", {}).get("videoId")
    title = snippet.get("title") or "(untitled)"
    return {
        "video_id": video_id,
        "title": title,
        "channel_title": snippet.get("videoOwnerChannelTitle") or snippet.get("channelTitle"),
        "thumbnail_url": _thumbnail_url(snippet.get("thumbnails", {})),
        "position": snippet.get("position"),
        "published_at": content_details.get("videoPublishedAt") or snippet.get("publishedAt"),
        "source_playlist_id": source_playlist_id,
        "availability_status": _availability_status(snippet, status),
    }


def fetch_liked_playlist_items(youtube: Any) -> tuple[str, list[dict[str, Any]]]:
    liked_playlist_id = get_liked_playlist_id(youtube)
    all_items: list[dict[str, Any]] = []
    page_token: str | None = None
    while True:
        request = youtube.playlistItems().list(
            part="snippet,contentDetails,status",
            playlistId=liked_playlist_id,
            maxResults=50,
            pageToken=page_token,
        )
        response = request.execute()
        for raw_item in response.get("items", []):
            item = normalize_playlist_item(raw_item, liked_playlist_id)
            if item["video_id"]:
                all_items.append(item)
        page_token = response.get("nextPageToken")
        if not page_token:
            break
    return liked_playlist_id, all_items


def create_playlist(youtube: Any, title: str, privacy_status: str) -> dict[str, Any]:
    response = (
        youtube.playlists()
        .insert(
            part="snippet,status",
            body={
                "snippet": {
                    "title": title,
                    "description": "Created locally by SvaraSetu from YouTube liked songs/videos.",
                },
                "status": {"privacyStatus": privacy_status},
            },
        )
        .execute()
    )
    return response


def get_playlist_video_ids(youtube: Any, playlist_id: str) -> set[str]:
    video_ids: set[str] = set()
    page_token: str | None = None
    while True:
        response = (
            youtube.playlistItems()
            .list(
                part="contentDetails",
                playlistId=playlist_id,
                maxResults=50,
                pageToken=page_token,
            )
            .execute()
        )
        for item in response.get("items", []):
            video_id = item.get("contentDetails", {}).get("videoId")
            if video_id:
                video_ids.add(video_id)
        page_token = response.get("nextPageToken")
        if not page_token:
            break
    return video_ids


def insert_video_into_playlist(youtube: Any, playlist_id: str, video_id: str) -> None:
    (
        youtube.playlistItems()
        .insert(
            part="snippet",
            body={
                "snippet": {
                    "playlistId": playlist_id,
                    "resourceId": {
                        "kind": "youtube#video",
                        "videoId": video_id,
                    },
                }
            },
        )
        .execute()
    )

