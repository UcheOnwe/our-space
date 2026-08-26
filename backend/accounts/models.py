from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    """Our Space's user identity model.

    Intentionally holds no additional fields yet. Couple membership and
    other domain concerns live in the `couples` app, not here.
    """
