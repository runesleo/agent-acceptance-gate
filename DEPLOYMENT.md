# Deployment

Status: static_demo_public
Provider: Cloudflare Pages
Project: agent-acceptance-gate
Production URL: https://agent-acceptance-gate.pages.dev/
Deployment URL: https://b7df1941.agent-acceptance-gate.pages.dev
Deployment id: b7df1941-d7b8-4215-a0e9-cf9e472ba139
Source commit: f8baa45
Deployed at: 2026-07-02

## What is live

Only the static buyer-facing demo from `demo/index.html` is public.

## What is not live

- No public API endpoint.
- No wallet.
- No payment middleware.
- No OKX.AI ASP listing.
- No API keys, credentials, or account integrations.
- No GitHub remote or push.

## Verification

```text
curl -I https://agent-acceptance-gate.pages.dev/
HTTP/2 200
content-type: text/html; charset=utf-8
```

Cloudflare Pages deployment list shows:

```text
Environment: Production
Branch: main
Source: f8baa45
Deployment: https://b7df1941.agent-acceptance-gate.pages.dev
```

## Rollback

Rollback must be done through Cloudflare Pages dashboard or a new `wrangler pages deploy demo --project-name agent-acceptance-gate` deployment.

Do not delete the Cloudflare project or change visibility without explicit Leo approval.

