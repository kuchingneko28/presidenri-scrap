# Security Analysis — presidenri-scrap

## Overview

This document covers the security analysis of the presidenri-scrap project, a WordPress REST API scraper for presidenri.go.id.

---

## API Information Disclosure

The target WordPress REST API exposes several pieces of information that could aid reconnaissance:

| Endpoint/Field | Data Exposed | Risk |
|---|---|---|
| `X-WP-Total` header | Total article count | Low — enables content volume estimation |
| `_embed` parameter | Full media objects with internal paths, original filenames, filesystem structure | Medium — leaks server-side details |
| `yoast_head_json` | Yoast SEO configuration, plugin version | Low — enables plugin fingerprinting |
| `media_details.file` | Server filesystem path structure | Medium — aids path traversal research |

**Mitigation:** These are standard WordPress REST API behaviors. The scraper stores this data locally but does not expose it to external parties. No action required unless the scraper output is shared publicly.

---

## Credential Handling

### browser-request.curl

- **Location:** `storage/browser-request.curl`
- **Contents:** Browser cookies, CSRF tokens, session data in plaintext
- **Git status:** Excluded via `.gitignore`
- **Permission warning:** The application warns if the file is world-readable (mode `0o004` set)

**Best practice:** Run `chmod 600 storage/browser-request.curl` after pasting your cURL command.

---

## Input Validation

### SQL LIKE Patterns

- `searchArticles()` escapes `%` and `_` wildcards in user input before LIKE queries
- All queries use parameterized statements (no raw SQL interpolation)

### curl Parser

- Parses curl commands without sanitization
- Warns on suspicious headers (`Authorization`, `X-Forwarded-For`, `X-Real-IP`, `X-Api-Key`, `X-CSRF-Token`)
- Risk is low since the file is user-controlled and local-only

---

## Network Security

### Cloudflare Bypass

- Uses `impit` with Chrome browser emulation to bypass Cloudflare protection
- Hot-reloads `browser-request.curl` on 403 blocks
- No external credential storage beyond the local curl file

### Rate Limiting

- Concurrency-limited downloads via `p-limit`
- `--page-delay <ms>` option for per-page rate limiting
- Backpressure mechanism prevents overwhelming the server

---

## Recommendations

1. **Keep browser-request.curl out of version control** (already done)
2. **Set restrictive file permissions** on credential files
3. **Use `--page-delay`** when scraping large datasets to avoid IP bans
4. **Rotate browser sessions** periodically — cookies expire and Cloudflare blocks stale sessions
