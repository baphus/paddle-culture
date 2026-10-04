# CK Grounds — Open Questions (freeze log)

## Round 1 (Q-01–Q-09) — RESOLVED 2026-10-03, frozen in DECISIONS.md.
## Round 2 — RESOLVED 2026-10-03 (ref dropped, proof hard gate, table columns, Gmail holder, admin-create removed).
## Round 3 — RESOLVED 2026-10-03:
- R3-01 invites → per-invite single-use rows, NO expiry, revoke-by-delete. PRD §4.1 24h deviation owner-accepted.
- R3-02 void → REMOVED entirely. 3 statuses only; DB-intervention-only fix path, risk accepted.
- R3-03 Gmail → developer holds password, generates App Password, transfers at acceptance.
- R3-04 same-day → ALLOWED (PRD §9 + acceptance gate #2 inverted by owner). Rule: `slot_start > now()` in UI + server.
- R3-05 blank Q7 → dropped (no content received).
- Owner alert → new-booking email to paddleculture0@gmail.com on every submission (3–4 sends/booking).

## Frontier: EMPTY. Shared understanding reached 2026-10-03 — build may start per DECISIONS.md build order.

## Freeze rule
Anything above answered after schema migration = change request (per PRD §33/§39, billable post-freeze).
