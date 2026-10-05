# Reverse Proxy and HTTPS

Use Caddy as the first supported public HTTPS proxy. Set `ROOT_URL` in both `.env.self-hosted` and the private settings JSON to the HTTPS origin users will visit.

For same-host Caddy, bind MoFaCTS to localhost:

```dotenv
MOFACTS_HTTP_BIND=127.0.0.1:3000
ROOT_URL=https://mofacts.example.org
```

Use `deploy/Caddyfile.self-hosted.example` as the starting point. Caddy's `reverse_proxy` supports Meteor WebSocket upgrades by default. Keep `Host`, `X-Forwarded-For`, and `X-Forwarded-Proto` headers so Meteor sees the correct public request context.

Replace both occurrences of `mofacts.example.org`: the site address and the explicit WSS source in the Content Security Policy. The example enforces CSP on responses without an application-owned policy; Caddy's deferred `?Content-Security-Policy` operation preserves stricter policies on protected report/export endpoints instead of adding a second policy or overwriting them.

The policy permits same-origin application resources and reviewed HTTPS dependencies for fonts, instructional media, YouTube/Plyr, Wikipedia/Wikimedia, OpenRouter and voice previews. WebAssembly compilation is allowed for Anki import; ordinary JavaScript evaluation, inline scripts and inline style blocks are prohibited. The reviewed dynamic style-attribute exception is limited to `style-src-attr`. New external resource destinations require a policy review; do not add wildcard hosts or relax script restrictions to silence browser errors.

Before applying a policy change, validate the candidate with `caddy validate --config <candidate> --adapter caddyfile` and retain the active configuration privately. Reload the validated configuration, check the served CSP and existing headers, and verify WSS, login, synthetic lesson reload/resume, fonts, media and imports. If functionality fails, restore the saved configuration and retain the failure evidence. Do not claim configured provider execution passed when its credentials are unavailable.

For a public hostname that is permanently HTTPS-only, send HSTS on HTTPS responses:

```caddyfile
header Strict-Transport-Security "max-age=31536000"
```

Validate and reload Caddy after changing the active host configuration. Do not add `includeSubDomains` or `preload` unless every subdomain is covered by permanent HTTPS and the operator has intentionally accepted those wider commitments.

Cases:

- Local HTTP: `http://localhost:3200`, no public learners.
- LAN HTTPS exception: `https://localhost:3000` proxies to
  `http://localhost:3200`; local certificate ownership is the operator's
  responsibility.
- Public HTTPS: use a real DNS name, Caddy-managed certificates, and matching `ROOT_URL`.

Troubleshooting:

- Mixed content usually means `ROOT_URL` is HTTP while the proxy is HTTPS.
- Login redirect mismatch usually means settings `ROOT_URL`, env `ROOT_URL`, and the Caddy site name differ.
- WebSocket failures usually mean an intermediary stripped upgrade headers.
- Wrong host errors usually mean the proxy targets the wrong app port or the app is not bound where Caddy expects.
