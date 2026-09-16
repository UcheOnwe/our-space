from django.urls import path

from . import views

urlpatterns = [
    path("profile/", views.CompanionProfileView.as_view(), name="companion-profile"),
]
