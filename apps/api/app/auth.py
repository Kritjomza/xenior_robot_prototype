import asyncio
import os
from dataclasses import dataclass
from typing import Any, Protocol
from urllib.parse import urljoin
from uuid import UUID

import jwt
from fastapi import HTTPException, Request, WebSocket, status
from jwt import PyJWKClient


@dataclass(frozen=True)
class Principal:
    user_id: UUID
    email: str | None


class TokenVerificationError(Exception):
    """A bearer token could not be proven to be a trusted Supabase access token."""


class PrincipalVerifier(Protocol):
    async def verify(self, token: str) -> Principal: ...


class SigningKey(Protocol):
    key: Any


class JwksClient(Protocol):
    def get_signing_key_from_jwt(self, token: str) -> SigningKey: ...


class UnavailablePrincipalVerifier:
    async def verify(self, token: str) -> Principal:
        raise TokenVerificationError("Supabase authentication is not configured")


class StaticTestPrincipalVerifier:
    def __init__(self, token: str) -> None:
        self.token = token

    async def verify(self, token: str) -> Principal:
        if token != self.token:
            raise TokenVerificationError("test token mismatch")
        return Principal(
            user_id=UUID("00000000-0000-0000-0000-000000000001"), email="e2e@local.test"
        )


class SupabaseJwtVerifier:
    def __init__(
        self,
        supabase_url: str,
        *,
        audience: str = "authenticated",
        jwt_secret: str | None = None,
        jwks_client: JwksClient | None = None,
    ) -> None:
        base_url = supabase_url.rstrip("/") + "/"
        self._issuer = urljoin(base_url, "auth/v1")
        self._audience = audience
        self._jwt_secret = jwt_secret
        self._jwks_client = jwks_client or PyJWKClient(
            urljoin(base_url, "auth/v1/.well-known/jwks.json"),
            cache_keys=False,
            lifespan=300,
        )

    async def verify(self, token: str) -> Principal:
        try:
            unverified_header = jwt.get_unverified_header(token)
            alg = unverified_header.get("alg")

            if alg == "HS256":
                if not self._jwt_secret:
                    raise TokenVerificationError(
                        "Symmetric token verification requires SUPABASE_JWT_SECRET"
                    )
                claims = jwt.decode(
                    token,
                    self._jwt_secret,
                    algorithms=["HS256"],
                    audience=self._audience,
                    issuer=self._issuer,
                    options={"require": ["sub", "aud", "iss", "iat", "exp"]},
                )
            elif alg in ("RS256", "ES256"):
                signing_key = await asyncio.to_thread(
                    self._jwks_client.get_signing_key_from_jwt, token
                )
                claims = jwt.decode(
                    token,
                    signing_key.key,
                    algorithms=["RS256", "ES256"],
                    audience=self._audience,
                    issuer=self._issuer,
                    options={"require": ["sub", "aud", "iss", "iat", "exp"]},
                )
            else:
                raise TokenVerificationError(f"Unsupported signing algorithm: {alg}")

            user_id = UUID(claims["sub"])
            email = claims.get("email")
            if email is not None and not isinstance(email, str):
                raise ValueError("email must be a string")
            return Principal(user_id=user_id, email=email)
        except TokenVerificationError:
            raise
        except (jwt.PyJWTError, KeyError, TypeError, ValueError, OSError, AttributeError) as error:
            raise TokenVerificationError("Bearer token verification failed") from error


def principal_verifier_from_environment() -> PrincipalVerifier:
    from dotenv import find_dotenv, load_dotenv

    load_dotenv(find_dotenv())
    test_token = os.getenv("DELTA_TEST_TOKEN", "")
    if os.getenv("DELTA_ENV") == "test" and test_token:
        return StaticTestPrincipalVerifier(test_token)
    supabase_url = os.getenv("SUPABASE_URL", "").strip()
    if not supabase_url:
        return UnavailablePrincipalVerifier()
    audience = os.getenv("SUPABASE_JWT_AUDIENCE", "authenticated").strip() or "authenticated"
    jwt_secret = os.getenv("SUPABASE_JWT_SECRET", "").strip() or None
    return SupabaseJwtVerifier(supabase_url, audience=audience, jwt_secret=jwt_secret)


def _bearer_token(value: str | None) -> str | None:
    if value is None:
        return None
    scheme, separator, token = value.partition(" ")
    if (
        separator
        and scheme.lower() == "bearer"
        and token
        and not any(char.isspace() for char in token)
    ):
        return token
    return None


async def require_principal(request: Request) -> Principal:
    token = _bearer_token(request.headers.get("Authorization"))
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bearer authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    verifier: PrincipalVerifier = request.app.state.principal_verifier
    try:
        return await verifier.verify(token)
    except TokenVerificationError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None


async def require_websocket_principal(websocket: WebSocket) -> Principal:
    token = _bearer_token(websocket.headers.get("Authorization"))
    if token is None:
        token = websocket.query_params.get("access_token")
    if not token or any(char.isspace() for char in token):
        raise TokenVerificationError("Bearer authentication required")
    verifier: PrincipalVerifier = websocket.app.state.principal_verifier
    return await verifier.verify(token)
