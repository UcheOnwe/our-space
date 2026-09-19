from django.contrib import admin

from .models import CoupleActiveRoom, CoupleRoomOwnership

admin.site.register(CoupleRoomOwnership)
admin.site.register(CoupleActiveRoom)
