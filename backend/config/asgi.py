"""
ASGI config for config project.

Routes HTTP requests to Django as usual, and WebSocket connections to
Channels' presence routing — see presence/routing.py and presence/consumers.py.
"""

import os

import django
from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

# Imported after django.setup() — presence.routing imports presence.consumers,
# which imports Django models, and those aren't ready until setup() has run.
import presence.routing  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": get_asgi_application(),
        "websocket": AllowedHostsOriginValidator(
            AuthMiddlewareStack(URLRouter(presence.routing.websocket_urlpatterns))
        ),
    }
)
