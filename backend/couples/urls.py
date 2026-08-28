from django.urls import path

from . import views

urlpatterns = [
    path("", views.CreateCoupleView.as_view(), name="couple-create"),
    path("couple-status/", views.CoupleStatusView.as_view(), name="couple-status"),
    path("join/", views.JoinCoupleView.as_view(), name="couple-join"),
    path(
        "cancel-pending-pairing/",
        views.CancelPendingPairingView.as_view(),
        name="couple-cancel-pending-pairing",
    ),
]
