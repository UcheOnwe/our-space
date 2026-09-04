"""
Django settings for config project.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def _env_bool(name, default):
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "django-insecure-dev-only-change-me")

DEBUG = _env_bool("DJANGO_DEBUG", True)

ALLOWED_HOSTS = [
    host.strip()
    for host in os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
    if host.strip()
]


# Application definition

INSTALLED_APPS = [
    # "daphne" must be first: this is what makes `manage.py runserver` serve
    # ASGI/WebSockets automatically in local dev (Channels swaps in its own
    # runserver command when daphne is installed as an app), instead of
    # needing a separate process for HTTP vs WebSocket traffic.
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "channels",
    "accounts",
    "couples",
    "watch",
    "presence",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# Django Channels needs to know which ASGI callable routes HTTP vs
# WebSocket traffic (see config/asgi.py). WSGI_APPLICATION is left in place
# — Django still uses it for tooling like `manage.py test` — but the real
# server process (Daphne, in dev and prod alike) uses this one.
ASGI_APPLICATION = "config.asgi.application"

# Channels needs a "channel layer" to pass messages between WebSocket
# connections (e.g. broadcasting one partner's move to the other). The
# in-memory backend only works within a single process, which is fine for
# V1 (Daphne runs as one process). Kept as its own isolated block so
# swapping to channels_redis.core.RedisChannelLayer later — needed once
# this runs as more than one process/machine — is a one-block change, not
# a redesign of the presence feature.
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    }
}


# Database
# PostgreSQL only, per project architecture (see CLAUDE.md). Configured via
# environment variables so credentials never live in source.

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("POSTGRES_DB", "our_space"),
        "USER": os.environ.get("POSTGRES_USER", "our_space"),
        "PASSWORD": os.environ.get("POSTGRES_PASSWORD", "our_space"),
        "HOST": os.environ.get("POSTGRES_HOST", "localhost"),
        "PORT": os.environ.get("POSTGRES_PORT", "5432"),
    }
}


# Custom user model (accounts app), configured before any other app's
# migrations depend on it.
AUTH_USER_MODEL = "accounts.User"


# Password validation

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


# Internationalization

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True


# Static files

STATIC_URL = "static/"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# Django REST Framework
# Session-based authentication only, per the approved plan. Permissions are
# set explicitly per view rather than defaulting to IsAuthenticated, since
# register/login must remain open to unauthenticated requests.

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
}

# The frontend runs on a different origin during local development and
# authenticates via the session cookie, so each origin it can be reached at
# must be trusted for CSRF-protected requests (e.g. login, logout, any
# POST). Comma-separated — local dev commonly needs more than one trusted
# origin at once (e.g. http://localhost:5173 for a desktop browser and
# http://<lan-ip>:5173 for a phone on the same network), unlike production,
# which has exactly one real frontend origin. Unset stays an empty list
# (nothing trusted) rather than defaulting to a dev origin, so a
# misconfigured deployment fails closed instead of silently trusting
# localhost.
FRONTEND_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("FRONTEND_ORIGINS", "").split(",")
    if origin.strip()
]
CSRF_TRUSTED_ORIGINS = FRONTEND_ORIGINS
