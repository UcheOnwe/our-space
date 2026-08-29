from django.urls import path

from . import views

urlpatterns = [
    path(
        "watch-session-status/",
        views.WatchSessionStatusView.as_view(),
        name="watch-session-status",
    ),
    path("load-video/", views.LoadVideoView.as_view(), name="watch-load-video"),
    path(
        "set-playback-state/",
        views.SetPlaybackStateView.as_view(),
        name="watch-set-playback-state",
    ),
]
