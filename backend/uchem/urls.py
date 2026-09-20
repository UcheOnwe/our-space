from django.conf import settings
from django.urls import path

from . import views

urlpatterns = [
    path("personal/", views.PersonalWalletView.as_view(), name="uchem-personal-wallet"),
    path("couple/", views.CoupleWalletView.as_view(), name="uchem-couple-wallet"),
]

# Registered only in development — in a real deployment (DEBUG=False) this
# route is never added to urlpatterns at all, so it doesn't exist, not
# merely reject requests. See DevRestoreCoupleWalletView's own doc comment
# for the defensive second-layer check inside the view itself.
if settings.DEBUG:
    urlpatterns.append(
        path("dev/restore/", views.DevRestoreCoupleWalletView.as_view(), name="uchem-dev-restore")
    )
