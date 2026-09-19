from django.urls import path

from . import views

urlpatterns = [
    path("personal/", views.PersonalWalletView.as_view(), name="uchem-personal-wallet"),
    path("couple/", views.CoupleWalletView.as_view(), name="uchem-couple-wallet"),
]
