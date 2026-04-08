# Google OAuth Setup Guide

This guide explains how to set up Google OAuth authentication for the AI Tools Directory.

## Prerequisites

1. Google Cloud Console account
2. Your domain name (for production)

## Step 1: Create Google OAuth Client

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Configure OAuth consent screen (if not already done):
   - Go to "APIs & Services" → "OAuth consent screen"
   - Choose "External" and click "Create"
   - Fill in required fields (app name, user support email, developer contact)
   - Add scopes if needed (basic profile info is usually sufficient)
   - Add test users (your email) for testing
   - Click "Save and Continue"

4. Create OAuth 2.0 Client ID:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth 2.0 Client ID"
   - Select "Web application" as application type
   - Add authorized JavaScript origins:
     - `http://localhost:3000` (for development)
     - `https://your-domain.com` (for production)
   - Add authorized redirect URIs (if needed):
     - `http://localhost:3000` (for development)
     - `https://your-domain.com` (for production)
   - Click "Create"

5. Copy the Client ID from the credentials page

**Note**: The Google Identity Services API is now integrated into the OAuth 2.0 flow and doesn't require separate API enabling. The JavaScript library handles everything automatically.

## Step 2: Configure Environment Variables

Update your `.env` file with your Google Client ID:

```env
ENABLE_VOTING=true
CF_SITEKEY=1x00000000000000000000AA
GOOGLE_CLIENT_ID=your-actual-google-client-id-here
```

## Step 3: Build and Run

1. Install dependencies:
   ```bash
   bun install
   ```

2. Build the project:
   ```bash
   bun run build
   ```

3. Start the development server:
   ```bash
   bun run dev:js
   ```

4. Open your browser and navigate to `http://localhost:3000`

## Features

The Google OAuth integration provides:

- **Sign In with Google**: Users can authenticate using their Google account
- **Session Management**: Automatic session restoration on page reload
- **User Profile Display**: Shows user avatar, name, and email when signed in
- **Sign Out**: Clean sign out with session clearing
- **Secure Token Handling**: JWT tokens are parsed and validated client-side

## Security Notes

- Tokens are stored in localStorage and expire after 24 hours
- The Google Client ID is public and safe to expose in frontend code
- No sensitive information is stored permanently
- Sessions are automatically cleared when expired

## Troubleshooting

### "Invalid Client ID" Error
- Ensure your Google Client ID is correctly set in `.env`
- Check that your domain is added to authorized JavaScript origins
- Verify the API is enabled in Google Cloud Console

### Button Not Showing
- Check browser console for JavaScript errors
- Ensure Google Identity Services script loads correctly
- Verify the `#googleSignInBtn` element exists in DOM

### Session Not Persisting
- Check localStorage is enabled in browser
- Verify no browser extensions are blocking localStorage
- Check console for any session-related errors

## Next Steps

After authentication is working, you can implement:
- User favorites/bookmarks
- Personalized recommendations
- User contributions tracking
- Tool submission with user attribution
