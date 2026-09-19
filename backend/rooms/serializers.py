from rest_framework import serializers

from .models import RoomType


class RoomGalleryItemSerializer(serializers.Serializer):
    """One entry in the merged gallery view — see services.get_room_gallery.
    A plain Serializer, not ModelSerializer: a gallery item isn't one
    Django model, it's a catalog entry merged with this couple's own
    ownership/active state."""

    room_type = serializers.CharField()
    display_name = serializers.CharField()
    order = serializers.IntegerField()
    price = serializers.IntegerField()
    is_owned = serializers.BooleanField()
    is_active = serializers.BooleanField()


class RoomActionSerializer(serializers.Serializer):
    """Validates the body of both POST /purchase/ and POST /select-active/
    — both only ever need a recognized room_type. ChoiceField rejects any
    unrecognized value here, so services.py can trust it's one of
    RoomType's real values without checking again."""

    room_type = serializers.ChoiceField(choices=RoomType.choices)
