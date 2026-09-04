from django.urls import re_path

from . import consumers

# Lives under /ws/, entirely separate from the /api/ REST prefix — this
# path space is routed by the WebSocket half of ProtocolTypeRouter (see
# config/asgi.py), never by Django's normal ROOT_URLCONF. No couple ID
# here: PresenceConsumer resolves "your couple" from the authenticated
# connection itself, the same rule every REST endpoint in this app follows.
#
# The <feature> segment is NOT trusted as-is — PresenceConsumer validates
# it against ALLOWED_FEATURES before using it for anything. This is what
# gives Couple Home and Watch Together their own isolated presence rooms
# (see consumers.py's _group_name), which is what makes the sleeping/
# grayed-out "partner left this feature" behavior correct.
websocket_urlpatterns = [
    re_path(r"^ws/presence/(?P<feature>[a-z]+)/$", consumers.PresenceConsumer.as_asgi()),
]
