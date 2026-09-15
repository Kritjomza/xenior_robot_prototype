from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt
import pytest
from app.auth import Principal, SupabaseJwtVerifier, TokenVerificationError, require_principal
from app.main import create_app
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import WebSocketDisconnect
from fastapi.testclient import TestClient


class AcceptingVerifier:
    async def verify(self, token: str) -> Principal:
        assert token == "verified-token"
        return Principal(
            user_id=UUID("11111111-1111-4111-8111-111111111111"),
            email="operator@example.com",
        )


class RejectingVerifier:
    async def verify(self, token: str) -> Principal:
        raise TokenVerificationError("rejected")


class StaticJwksClient:
    def __init__(self, public_key: object) -> None:
        self.public_key = public_key

    def get_signing_key_from_jwt(self, token: str) -> object:
        return type("SigningKey", (), {"key": self.public_key})()


@pytest.fixture
def client():
    app = create_app()
    with TestClient(app) as connection:
        yield connection


async def test_protected_state_rejects_missing_token(client):
    assert client.get('/api/v1/state').status_code == 401


def test_unconfigured_production_auth_rejects_an_unverifiable_bearer(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    with TestClient(create_app()) as connection:
        response = connection.get(
            "/api/v1/state", headers={"Authorization": "Bearer caller-supplied"}
        )
    assert response.status_code == 401


def test_protected_state_websocket_rejects_missing_token(client):
    with pytest.raises(WebSocketDisconnect) as rejection:
        with client.websocket_connect("/api/v1/ws/state"):
            pass
    assert rejection.value.code == 4401


def test_protected_state_rejects_malformed_and_unverified_tokens(client):
    assert client.get("/api/v1/state", headers={"Authorization": "Basic abc"}).status_code == 401
    client.app.state.principal_verifier = RejectingVerifier()
    response = client.get("/api/v1/state", headers={"Authorization": "Bearer invalid"})
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_verified_principal_can_use_protected_state_route(client):
    client.app.state.principal_verifier = AcceptingVerifier()
    response = client.get(
        "/api/v1/state", headers={"Authorization": "Bearer verified-token"}
    )
    assert response.status_code == 200
    assert response.json()["status"] == "idle"


def test_tests_can_inject_a_verified_principal_without_a_test_header():
    principal = Principal(
        user_id=UUID("22222222-2222-4222-8222-222222222222"),
        email="test@example.com",
    )
    app = create_app()
    app.dependency_overrides[require_principal] = lambda: principal
    with TestClient(app) as connection:
        assert connection.get("/api/v1/state").status_code == 200


@pytest.mark.parametrize(
    ("claims", "lifetime_seconds"),
    [
        ({"aud": "wrong"}, 300),
        ({"iss": "https://other.supabase.co/auth/v1"}, 300),
        ({}, -1),
        ({"sub": "not-a-uuid"}, 300),
    ],
)
async def test_supabase_verifier_rejects_untrusted_claims(claims, lifetime_seconds):
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    now = datetime.now(timezone.utc)
    payload = {
        "sub": "33333333-3333-4333-8333-333333333333",
        "email": "owner@example.com",
        "aud": "authenticated",
        "iss": "https://project.supabase.co/auth/v1",
        "iat": now,
        "exp": now + timedelta(seconds=lifetime_seconds),
        **claims,
    }
    token = jwt.encode(payload, private_key, algorithm="RS256", headers={"kid": "test"})
    verifier = SupabaseJwtVerifier(
        "https://project.supabase.co", jwks_client=StaticJwksClient(private_key.public_key())
    )
    with pytest.raises(TokenVerificationError):
        await verifier.verify(token)


async def test_supabase_verifier_derives_principal_from_verified_claims():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "sub": "44444444-4444-4444-8444-444444444444",
            "email": "verified@example.com",
            "aud": "authenticated",
            "iss": "https://project.supabase.co/auth/v1",
            "iat": now,
            "exp": now + timedelta(minutes=5),
        },
        private_key,
        algorithm="RS256",
        headers={"kid": "test"},
    )
    verifier = SupabaseJwtVerifier(
        "https://project.supabase.co", jwks_client=StaticJwksClient(private_key.public_key())
    )
    assert await verifier.verify(token) == Principal(
        user_id=UUID("44444444-4444-4444-8444-444444444444"),
        email="verified@example.com",
    )
