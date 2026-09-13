from __future__ import annotations

import base64

import pytest

from app.common.errors import Unauthorized
from app.common.security import (
    create_token,
    decode_token,
    hash_password,
    is_valid_wireguard_key,
    verify_gateway_signature,
    gateway_signature,
    verify_password,
)


def test_password_round_trip():
    stored = hash_password("correct horse battery staple")
    assert verify_password("correct horse battery staple", stored)
    assert not verify_password("wrong", stored)


def test_access_token_round_trip():
    token, ttl = create_token("507f1f77bcf86cd799439011", "access")
    payload = decode_token(token, "access")
    assert payload["sub"] == "507f1f77bcf86cd799439011"
    assert ttl > 0


def test_refresh_token_cannot_be_used_as_access_token():
    token, _ = create_token("507f1f77bcf86cd799439011", "refresh")
    with pytest.raises(Unauthorized):
        decode_token(token, "access")


def test_wireguard_key_validation():
    good = base64.standard_b64encode(b"\x01" * 32).decode()
    assert is_valid_wireguard_key(good)
    assert not is_valid_wireguard_key("not-a-key")
    assert not is_valid_wireguard_key(base64.standard_b64encode(b"\x01" * 16).decode())


def test_gateway_signature_rejects_tampering():
    sig = gateway_signature("s3cret", b'{"a":1}', "1700000000")
    assert verify_gateway_signature("s3cret", b'{"a":1}', "1700000000", sig)
    assert not verify_gateway_signature("s3cret", b'{"a":2}', "1700000000", sig)
