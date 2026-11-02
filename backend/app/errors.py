from __future__ import annotations

from fastapi import HTTPException, status


class AppError(HTTPException):
    """HTTP error with a stable machine-readable ``code`` for the frontend."""

    def __init__(self, status_code: int, code: str, message: str, **extra):
        super().__init__(status_code=status_code, detail={"code": code, "message": message, **extra})


def not_found(what: str = "Recurso") -> AppError:
    # 404 (not 403) for other users' resources: do not leak existence.
    return AppError(status.HTTP_404_NOT_FOUND, "not_found", f"{what} no encontrado")


def bad_request(message: str, code: str = "bad_request", **extra) -> AppError:
    return AppError(status.HTTP_400_BAD_REQUEST, code, message, **extra)


def conflict(message: str, code: str = "conflict") -> AppError:
    return AppError(status.HTTP_409_CONFLICT, code, message)


def too_many(message: str, code: str = "rate_limited") -> AppError:
    return AppError(status.HTTP_429_TOO_MANY_REQUESTS, code, message)


def unauthorized(message: str = "Sesión no válida o caducada") -> AppError:
    return AppError(status.HTTP_401_UNAUTHORIZED, "unauthorized", message)


def payload_too_large(message: str) -> AppError:
    return AppError(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "too_large", message)
