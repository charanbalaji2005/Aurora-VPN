"""Domain errors that map to actionable client messages.

Every error carries a stable ``code`` so the Android app can render a
specific, useful message instead of "Something went wrong".
"""

from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    status_code = 400
    code = "bad_request"
    message = "The request could not be processed."

    def __init__(self, message: str | None = None, *, code: str | None = None, **extra):
        self.message = message or self.message
        self.code = code or self.code
        self.extra = extra
        super().__init__(self.message)

    def to_response(self) -> JSONResponse:
        body = {"error": {"code": self.code, "message": self.message, **self.extra}}
        return JSONResponse(status_code=self.status_code, content=body)


class ValidationFailed(AppError):
    status_code = 422
    code = "validation_failed"
    message = "Some of the details you entered are not valid."


class Unauthorized(AppError):
    status_code = 401
    code = "unauthorized"
    message = "Sign in again to continue."


class Forbidden(AppError):
    status_code = 403
    code = "forbidden"
    message = "This account cannot perform that action."


class NotFound(AppError):
    status_code = 404
    code = "not_found"
    message = "That resource no longer exists."


class Conflict(AppError):
    status_code = 409
    code = "conflict"
    message = "That action conflicts with the current state."


class RateLimited(AppError):
    status_code = 429
    code = "rate_limited"
    message = "Too many requests. Try again in a moment."


class QuotaExhausted(AppError):
    status_code = 403
    code = "quota_exhausted"
    message = "You have used today's 3 hours of free VPN time."


class NoGatewayAvailable(AppError):
    status_code = 503
    code = "no_gateway_available"
    message = "No VPN server in that location is available right now."


class GatewayUnreachable(AppError):
    status_code = 502
    code = "gateway_unreachable"
    message = "The VPN server did not respond. Another location may work."


async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    return exc.to_response()


async def unhandled_error_handler(_: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "internal_error",
                "message": "The VPN service is temporarily unavailable. Try again shortly.",
            }
        },
    )
