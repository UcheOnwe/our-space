from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

User = get_user_model()


class RegisterTests(APITestCase):
    def test_register_creates_user_and_establishes_session(self):
        response = self.client.post(
            "/api/auth/register/",
            {"username": "alice", "email": "alice@example.com", "password": "a-strong-password-1"},
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["username"], "alice")
        self.assertTrue(User.objects.filter(username="alice").exists())

        # Registration should log the user in immediately.
        me_response = self.client.get("/api/auth/user-profile/")
        self.assertEqual(me_response.status_code, status.HTTP_200_OK)
        self.assertEqual(me_response.data["username"], "alice")

    def test_register_rejects_duplicate_username(self):
        User.objects.create_user(username="alice", password="a-strong-password-1")

        response = self.client.post(
            "/api/auth/register/",
            {"username": "alice", "password": "another-strong-password"},
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_rejects_weak_password(self):
        response = self.client.post(
            "/api/auth/register/",
            {"username": "bob", "password": "12345"},
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(username="bob").exists())


class LoginTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="alice", password="a-strong-password-1")

    def test_login_with_correct_credentials_establishes_session(self):
        response = self.client.post(
            "/api/auth/login/",
            {"username": "alice", "password": "a-strong-password-1"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "alice")

        me_response = self.client.get("/api/auth/user-profile/")
        self.assertEqual(me_response.status_code, status.HTTP_200_OK)

    def test_login_with_wrong_password_is_rejected(self):
        response = self.client.post(
            "/api/auth/login/",
            {"username": "alice", "password": "wrong-password"},
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        # DRF's SessionAuthentication has no WWW-Authenticate scheme, so an
        # unauthenticated request is a 403, not a 401.
        me_response = self.client.get("/api/auth/user-profile/")
        self.assertEqual(me_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_login_with_unknown_username_is_rejected(self):
        response = self.client.post(
            "/api/auth/login/",
            {"username": "nobody", "password": "whatever-1234"},
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class LogoutTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="alice", password="a-strong-password-1")

    def test_logout_ends_the_session(self):
        self.client.login(username="alice", password="a-strong-password-1")

        response = self.client.post("/api/auth/logout/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        me_response = self.client.get("/api/auth/user-profile/")
        self.assertEqual(me_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_logout_requires_authentication(self):
        response = self.client.post("/api/auth/logout/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class UserProfileTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="alice", email="alice@example.com", password="a-strong-password-1"
        )

    def test_me_requires_authentication(self):
        response = self.client.get("/api/auth/user-profile/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_me_returns_current_user(self):
        self.client.login(username="alice", password="a-strong-password-1")

        response = self.client.get("/api/auth/user-profile/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "alice")
        self.assertEqual(response.data["email"], "alice@example.com")
