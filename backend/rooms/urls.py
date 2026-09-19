from django.urls import path

from . import views

urlpatterns = [
    path("gallery/", views.RoomGalleryView.as_view(), name="room-gallery"),
    path("purchase/", views.PurchaseRoomView.as_view(), name="room-purchase"),
    path("select-active/", views.SelectActiveRoomView.as_view(), name="room-select-active"),
]
