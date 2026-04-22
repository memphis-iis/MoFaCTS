# mofacts:microsoft-oauth

Microsoft OAuth flow implementation for Meteor 2.14+ using the Microsoft Identity Platform v2.0 endpoints.

## Overview

This package provides OAuth 2.0 authentication with Microsoft (Azure AD, Office 365, personal Microsoft accounts) using modern OpenID Connect standards.

## Key Differences from Q42 Package

- Uses **Microsoft Identity Platform v2** endpoints instead of Windows Live
- Uses **OpenID Connect scopes** (`openid`, `email`) instead of legacy Windows Live scopes
- **Async/await** implementation compatible with Meteor 2.14+
- Supports **multi-tenant** authentication (common, organizations, consumers, or specific tenant ID)

## Configuration

Configure in your settings.json:

```json
{
  "microsoft": {
    "clientId": "your-application-client-id",
    "secret": "your-client-secret",
    "tenant": "common"
  }
}
```

### Tenant Options

- `common` - Any Microsoft account (Azure AD or personal)
- `organizations` - Any Azure AD account
- `consumers` - Personal Microsoft accounts only
- `{tenant-id}` - Specific Azure AD tenant

### Azure AD App Registration Requirements

In your Azure AD app registration, you **must** configure both redirect URIs:

1. **Web Redirect URIs:**
   - `https://your-domain.com/_oauth/microsoft` (production)
   - `http://localhost:3000/_oauth/microsoft` (development)

2. **Important Settings:**
   - Enable "Accounts in any organizational directory and personal Microsoft accounts" under Supported account types

### Mobile Login

On mobile devices, popup windows don't work reliably, so the OAuth flow uses redirect mode instead. The package automatically includes `prompt=select_account` to ensure users can choose which Microsoft account to use, even on mobile.

## Endpoints Used

- **Authorization**: `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize`
- **Token**: `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`

## Default Scopes

- `openid` - Required for ID token
- `email` - User email address
- `offline_access` - Refresh token (when `requestOfflineToken: true`)
