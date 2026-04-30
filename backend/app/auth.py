import json
import logging
import os
from datetime import timedelta, timezone

from fastapi import HTTPException, status
from google.auth.exceptions import GoogleAuthError, RefreshError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from sqlalchemy.orm import Session

from .config import get_settings
from .models import OAuthState, OAuthToken, utc_now

logger = logging.getLogger(__name__)
settings = get_settings()


class AuthRequiredError(RuntimeError):
    pass


def _allow_local_http_oauth() -> None:
    if settings.oauth_redirect_uri.startswith("http://localhost") or settings.oauth_redirect_uri.startswith(
        "http://127.0.0.1"
    ):
        os.environ.setdefault("OAUTHLIB_INSECURE_TRANSPORT", "1")


def build_flow(state: str | None = None) -> Flow:
    _allow_local_http_oauth()
    if not settings.google_client_secrets_file.exists():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Google OAuth client secret file not found: {settings.google_client_secrets_file}",
        )
    flow = Flow.from_client_secrets_file(
        str(settings.google_client_secrets_file),
        scopes=[settings.youtube_scope],
        state=state,
        redirect_uri=settings.oauth_redirect_uri,
        autogenerate_code_verifier=False,
    )
    return flow


def create_authorization_url(db: Session) -> str:
    flow = build_flow()
    authorization_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    db.add(OAuthState(state=state))
    db.commit()
    logger.info("created_oauth_authorization_url")
    return authorization_url


def complete_authorization(db: Session, code: str, state: str) -> None:
    stored_state = db.get(OAuthState, state)
    if stored_state is None or stored_state.used_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or already-used OAuth state.")
    created_at = stored_state.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    if utc_now() - created_at > timedelta(minutes=15):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OAuth state expired. Start login again.")

    flow = build_flow(state=state)
    try:
        flow.fetch_token(code=code)
    except Exception as exc:  # requests-oauthlib surfaces several concrete exception types.
        logger.exception("oauth_token_exchange_failed")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OAuth token exchange failed.") from exc

    credentials = flow.credentials
    token = db.get(OAuthToken, 1)
    if token is None:
        token = OAuthToken(id=1, token_json=credentials.to_json(), scopes=settings.youtube_scope)
        db.add(token)
    else:
        token.token_json = credentials.to_json()
        token.scopes = settings.youtube_scope
    stored_state.used_at = utc_now()
    db.commit()
    logger.info("oauth_authorization_completed")


def load_credentials(db: Session) -> Credentials:
    token = db.get(OAuthToken, 1)
    if token is None:
        raise AuthRequiredError("Google account is not connected.")
    info = json.loads(token.token_json)
    credentials = Credentials.from_authorized_user_info(info, scopes=[settings.youtube_scope])
    if credentials.valid:
        return credentials
    if credentials.expired and credentials.refresh_token:
        try:
            credentials.refresh(Request())
        except (RefreshError, GoogleAuthError) as exc:
            logger.exception("oauth_token_refresh_failed")
            raise AuthRequiredError("Google token refresh failed. Connect Google again.") from exc
        token.token_json = credentials.to_json()
        token.updated_at = utc_now()
        db.commit()
        logger.info("oauth_token_refreshed")
        return credentials
    raise AuthRequiredError("Google token is invalid. Connect Google again.")


def get_auth_status(db: Session) -> dict[str, object]:
    token = db.get(OAuthToken, 1)
    if token is None:
        return {
            "connected": False,
            "valid": False,
            "expired": False,
            "scopes": [],
            "account_email": None,
            "message": "Google account is not connected.",
        }
    info = json.loads(token.token_json)
    credentials = Credentials.from_authorized_user_info(info, scopes=[settings.youtube_scope])
    message = None
    if credentials.expired and credentials.refresh_token:
        try:
            credentials.refresh(Request())
            token.token_json = credentials.to_json()
            token.updated_at = utc_now()
            db.commit()
        except (RefreshError, GoogleAuthError):
            logger.exception("oauth_status_refresh_failed")
            message = "Google token refresh failed. Connect Google again."
    scopes = credentials.scopes or info.get("scopes") or [settings.youtube_scope]
    return {
        "connected": True,
        "valid": credentials.valid,
        "expired": bool(credentials.expired),
        "scopes": list(scopes),
        "account_email": token.account_email,
        "message": message,
    }
