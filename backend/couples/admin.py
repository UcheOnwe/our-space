from django.contrib import admin

from .models import Couple, CoupleMembership, PairingInvite

admin.site.register(Couple)
admin.site.register(CoupleMembership)
admin.site.register(PairingInvite)
