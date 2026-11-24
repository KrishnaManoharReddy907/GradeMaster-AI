import hmac

from fastapi import APIRouter, Depends, status

from app.core.config import settings
from app.core.deps import get_current_user  # re-exported for legacy imports
from app.core.errors import Forbidden
from app.core.security import create_access_token
from app.schemas.user_schema import (
    AdminBootstrap,
    ChangePassword,
    MessageResponse,
    TokenResponse,
    UserCreate,
    UserLogin,
    UserResponse,
)
from app.services.audit_service import record_audit
from app.services.auth_service import (
    authenticate_user,
    change_password,
    create_bootstrap_admin,
    create_user,
    serialize_user,
)

router = APIRouter()


@router.post("/signup", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def signup(user_data: UserCreate):
    user = await create_user(user_data)
    await record_audit(user, "user.signup", "user", str(user["_id"]), {"role": user["role"]})
    if user.get("is_approved"):
        return MessageResponse(message="Account created. You can sign in now.")
    return MessageResponse(message="Account created. An administrator must approve it before you can sign in.")


@router.post("/bootstrap-admin", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def bootstrap_admin(data: AdminBootstrap):
    """Create the first administrator. Disabled once an admin exists; requires
    BOOTSTRAP_TOKEN when the server has one configured."""
    expected = settings.bootstrap_token
    if expected and not hmac.compare_digest((data.setup_token or "").encode(), expected.encode()):
        raise Forbidden("A valid setup token is required to create the administrator.", code="setup_token_invalid")
    user = await create_bootstrap_admin(data)
    await record_audit(user, "admin.bootstrap", "user", str(user["_id"]))
    return MessageResponse(message="Administrator account created. You can sign in now.")


@router.post("/login", response_model=TokenResponse)
async def login(user_data: UserLogin):
    user = await authenticate_user(user_data.email, user_data.password)
    token = create_access_token(str(user["_id"]), user["role"], int(user.get("token_version", 0)))
    return TokenResponse(
        access_token=token,
        role=user["role"],
        user_id=str(user["_id"]),
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(**serialize_user(current_user))


@router.post("/change-password", response_model=MessageResponse)
async def change_password_route(data: ChangePassword, current_user: dict = Depends(get_current_user)):
    await change_password(current_user, data.current_password, data.password)
    await record_audit(current_user, "user.change_password", "user", str(current_user["_id"]))
    return MessageResponse(message="Password updated. Please sign in again.")
