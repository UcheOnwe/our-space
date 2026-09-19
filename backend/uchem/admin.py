from django.contrib import admin

from .models import CoupleWallet, PersonalWallet, UchemTransaction

admin.site.register(PersonalWallet)
admin.site.register(CoupleWallet)
admin.site.register(UchemTransaction)
