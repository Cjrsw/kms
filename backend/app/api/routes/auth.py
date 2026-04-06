from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import CurrentUserResponse, LoginRequest, TokenResponse
from app.services.auth import login_with_database_user, serialize_current_user
from app.services.audit import record_auth_audit
from app.services.token_revocation import parse_jwt_exp, revoke_token_jti

router = APIRouter()
optional_bearer = HTTPBearer(auto_error=False)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Annotated[Session, Depends(get_db)]) -> TokenResponse:
    result = login_with_database_user(db, payload.username, payload.password, request)
    if result.token is None:
        response_status = status.HTTP_423_LOCKED if result.error_code == "locked" else status.HTTP_401_UNAUTHORIZED
        raise HTTPException(
            status_code=response_status,
            detail={
                "code": result.error_code or "invalid",
                "message": result.detail or "Invalid username or password.",
                "remaining_attempts": result.remaining_attempts,
                "locked_until": result.locked_until,
            },
        )

    return result.token


@router.get("/me", response_model=CurrentUserResponse)
def current_user(user: Annotated[User, Depends(get_current_user)]) -> CurrentUserResponse:
    return serialize_current_user(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(optional_bearer)],
) -> Response:
    if credentials is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    settings = get_settings()
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.secret_key,
            algorithms=["HS256"],
            options={"verify_exp": False},
        )
    except JWTError:
        record_auth_audit(db, event_type="logout", status="failed", request=request, detail="invalid_jwt")
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    username = str(payload.get("sub") or "").strip()
    jti = str(payload.get("jti") or "").strip()
    exp = parse_jwt_exp(payload.get("exp"))
    user = db.query(User).filter(User.username == username).first() if username else None

    if jti:
        revoke_token_jti(
            db,
            jti=jti,
            user_id=user.id if user else None,
            reason="logout",
            expires_at=exp,
        )
        record_auth_audit(
            db,
            event_type="logout",
            status="success",
            request=request,
            user=user,
            username=username or None,
            detail="logout_revoked",
        )
    else:
        record_auth_audit(
            db,
            event_type="logout",
            status="failed",
            request=request,
            user=user,
            username=username or None,
            detail="missing_jti",
        )

    return Response(status_code=status.HTTP_204_NO_CONTENT)
