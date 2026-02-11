

## Issue 1: robertogaunaj@gmail.com cannot login with email/password

This account was created through Google Sign-In, so it has no password. Email/password login will always fail for this account.

**Fix options (pick one):**
- **Option A (Recommended)**: Always use Google Sign-In for this account -- no code changes needed.
- **Option B**: Add a "Forgot password" / "Set password" flow so Google-created accounts can also set a password for email login.

I will not make changes for this unless you want Option B.

---

## Issue 2: Google consent screen shows "Lovable" instead of your app name

The default managed Google OAuth uses Lovable's credentials, so the consent screen says "Lovable." To show your own brand name (e.g., "Connecta Creators"), you need to set up your own Google OAuth credentials:

### Steps (you do this in Google Cloud Console):

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a project (or use an existing one).
2. Go to **APIs & Services > OAuth consent screen** and configure it with your app name, logo, and authorized domains (e.g., `lovable.app` and any custom domain).
3. Go to **APIs & Services > Credentials**, click **Create Credentials > OAuth Client ID**, choose **Web application**.
4. Under **Authorized redirect URIs**, add the callback URL from Lovable Cloud's Authentication Settings for Google.
5. Copy the **Client ID** and **Client Secret**.
6. In Lovable, open the **Cloud tab > Users > Authentication Settings > Sign In Methods > Google** and paste your Client ID and Secret there.

No code changes are needed -- the existing `lovable.auth.signInWithOAuth("google")` call will automatically use your custom credentials once configured.

---

### Summary

| Issue | Root Cause | Action |
|---|---|---|
| Admin email login fails | Account created via Google, no password exists | Use Google login, or I can add a password-reset flow |
| Consent screen says "Lovable" | Using Lovable's managed Google OAuth credentials | Configure your own Google OAuth credentials in Cloud settings |

