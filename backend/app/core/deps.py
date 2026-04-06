from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.models.user import User
from app.services.audit import record_auth_audit
from app.services.token_revocation import is_token_revoked

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
    request: Request,
) -> User:
    if credentials is None:
        record_auth_audit(db, event_type="auth_bearer", status="failed", request=request, detail="missing_token")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token.")

    settings = get_settings()

    try:
        payload = jwt.decode(credentials.credentials, settings.secret_key, algorithms=["HS256"])
    except JWTError as exc:
        record_auth_audit(db, event_type="auth_bearer", status="failed", request=request, detail="invalid_jwt")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token.") from exc

    username = payload.get("sub")
    if not username:
        record_auth_audit(db, event_type="auth_bearer", status="failed", request=request, detail="missing_subject")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject.")

    user = db.query(User).filter(User.username == username, User.is_active.is_(True)).first()
    if user is None:
        record_auth_audit(db, event_type="auth_bearer", status="failed", request=request, username=str(username), detail="user_not_found_or_inactive")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found.")

    try:
        token_version = int(payload.get("ver", -1))
    except (TypeError, ValueError):
        record_auth_audit(db, event_type="auth_bearer", status="failed", request=request, user=user, detail="invalid_token_version")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token.")
    if token_version != user.token_version:
        record_auth_audit(db, event_type="auth_bearer", status="failed", request=request, user=user, detail="token_version_mismatch")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked.")

    jti = str(payload.get("jti", "")).strip()
    if not jti:
        record_auth_audit(db, event_type="auth_bearer", status="failed", request=request, user=user, detail="missing_jti")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token.")
    if is_token_revoked(db, jti=jti):
        record_auth_audit(db, event_type="auth_bearer", status="failed", request=request, user=user, detail="jti_revoked")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked.")

    return user


def require_role(*role_codes: str):
    def _checker(
        user: Annotated[User, Depends(get_current_user)],
        db: Annotated[Session, Depends(get_db)],
        request: Request,
    ) -> User:
        user_role_codes = {user_role.role.code for user_role in user.roles}
        if not user_role_codes.intersection(role_codes):
            record_auth_audit(
                db,
                event_type="authz_role",
                status="failed",
                request=request,
                user=user,
                detail=f"required={','.join(role_codes)}",
            )
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role.")
        return user

    return _checker
