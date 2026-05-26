# Reverse Proxy and HTTPS

Use Caddy as the first supported public HTTPS proxy. Set `ROOT_URL` in both `.env.self-hosted` and the private settings JSON to the HTTPS origin users will visit.

For same-host Caddy, bind MoFaCTS to localhost:

```dotenv
MOFACTS_HTTP_BIND=127.0.0.1:3000
ROOT_URL=https://mofacts.example.org
```

Use `deploy/Caddyfile.self-hosted.example` as the starting point. Caddy's `reverse_proxy` supports Meteor WebSocket upgrades by default. Keep `Host`, `X-Forwarded-For`, and `X-Forwarded-Proto` headers so Meteor sees the correct public request context.

Cases:

- Local HTTP: `http://localhost:3000`, no public learners.
- LAN HTTPS: local certificate ownership is the operator's responsibility.
- Public HTTPS: use a real DNS name, Caddy-managed certificates, and matching `ROOT_URL`.

Troubleshooting:

- Mixed content usually means `ROOT_URL` is HTTP while the proxy is HTTPS.
- Login redirect mismatch usually means settings `ROOT_URL`, env `ROOT_URL`, and the Caddy site name differ.
- WebSocket failures usually mean an intermediary stripped upgrade headers.
- Wrong host errors usually mean the proxy targets the wrong app port or the app is not bound where Caddy expects.
