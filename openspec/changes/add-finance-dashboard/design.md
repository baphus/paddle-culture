# Design

## Context

See [proposal.md](./proposal.md) for motivation and the accompanying capability specs for behavior. The current `/admin/revenue` server page reads Approved bookings through service-role Supabase HTTP queries, groups revenue around booking slot dates, and feeds client chart/table/export components. The main admin dashboard reuses those revenue helpers. There is no expense table or finance API.

This project treats `src/db/schema.ts` as a type/schema definition only. Supabase SQL files contain database behavior not represented by generated Drizzle migrations, and service-role application access must retain per-route admin checks. All finance dates must use `Asia/Manila`; amounts must avoid JavaScript floating-point arithmetic.

## Goals / Non-Goals

**Goals:**

- Add a durable expense record and constrained admin CRUD surface.
- Produce a single filtered financial data model that drives KPIs, charts, ledger, dashboard summary, and CSV export.
- Preserve old Revenue URLs while moving the user-facing destination to Finance.
- Maintain auditability after edits and permanent deletes.

**Non-Goals:**

- Payment settlement/reconciliation, invoices, refunds, tax filing, budgets, receipt storage, recurring expenses, or historical expense import.
- A general ledger or accounting-system replacement.
- Changing booking approval or customer-facing booking flows.

## Decisions

### Persist one cash-expense table with integer centavos

Add an `expenses` relation containing an immutable id, required title/category/paid date, positive integer amount in centavos, optional description/vendor/notes, and created/updated timestamps. Store paid date as a date (not a timestamp), since reporting is defined by the Manila calendar date.

Use integer centavos for expense values and convert booking numeric totals to centavos at the reporting boundary. This matches existing revenue formatting and makes KPI/extract arithmetic exact. Using decimal strings throughout application aggregation was considered, but it creates repeated conversion and comparison complexity in client and server code.

### Keep database enforcement and audit writes in a transactional RPC

Add a Supabase SQL source-of-truth RPC for expense create, update, and delete. It will validate the actor, values, allowed category, and non-future Manila paid date; mutate the row; and append the appropriate `audit_log` snapshot in the same transaction. The server route/action validates the request shape and calls the RPC after `requireAdmin()`.

The project already uses PostgREST RPCs for transactional writes, so this avoids a read-modify-write split and ensures permanent deletes remain auditable. Separate direct table writes plus app-side audit inserts were considered but could leave mutations without audit records on partial failure.

The migration must be represented in both `src/db/schema.ts` and a new hand-run Supabase SQL file or the established matching SQL source, with RLS explicitly default-deny and service-role access retained. Generated `drizzle/*.sql` files are not edited.

### Build a shared Finance reporting aggregate

Create server-side finance query helpers that accept a normalized inclusive Manila date range and return daily base rows containing revenue cents, expense cents, profit cents, and approved booking count. Expense rows group by `paid_date`. Approved booking totals are divided across their booked slots and then summed by each slot's Manila date; allocation must deterministically reconcile total booking cents, assigning any remainder by stable slot order.

Derive weekly/monthly chart buckets, KPI totals, dashboard summary, and CSV rows from that common daily base. This prevents the existing divergence where a monthly series can ignore the selected filter range. Running independent page-specific queries was considered but risks inconsistent totals and formulas.

### Make Finance a server page with focused client controls

Implement `/admin/finance` as the dynamic, admin-gated server page. It parses the range and launches reporting/ledger reads; client components handle the range/category/title controls, chart interaction, CSV download, and add/edit/delete expense modal with refresh after successful mutation. Keep the page's default range and compatible presets from Revenue, expanding custom selection as required by the spec.

Replace `/admin/revenue` with a server redirect that retains query parameters so old bookmarks preserve their selected range. Update navigation and the admin dashboard to use `/admin/finance` directly. Keeping two independently rendered reports was rejected because it would invite divergent profit/revenue definitions.

### Use explicit financial UI formulas and unavailable ratios

Present formula help alongside KPI labels. The report provides Booking Revenue, Expenses, Net Profit, Profit Margin, Booking Count, and Average Revenue per Booking. Division-based values render `—` when their denominator is zero. Profit can be negative; currency formatting and charts must preserve the sign.

### Support bounded, server-filtered ledger reads

The ledger query accepts range, category, title search, and page/cursor constraints, orders by paid date descending then id, and returns only the filtered page. The default page uses the active Finance range. Newest-first unbounded reads were considered but would eventually make the report slow and increase PostgREST response risk.

## Risks / Trade-offs

- [Approved is used as a cash proxy] → Label revenue as Booking Revenue and exclude payment-settlement claims from the UI.
- [Multi-slot centavo allocation can create remainder discrepancies] → Allocate remainders deterministically and test that daily totals always reconcile to the booking total.
- [Permanent deletion changes historical displayed profit] → Require confirmation and persist full audit snapshots.
- [Existing databases require manual SQL application] → Document the required SQL file in the change and ensure the migration is idempotent.
- [Client filters can become inconsistent with exports] → Keep range normalization and data aggregation server-side and generate CSV from the same report result.

## Migration Plan

1. Add the typed expense schema and hand-run Supabase SQL (table, constraints/indexes, RLS, and transactional RPC) without touching generated Drizzle SQL.
2. Apply the Supabase SQL in the documented setup order before deploying app code.
3. Deploy the Finance route, expense mutation endpoints/actions, reporting helpers, and UI; redirect legacy Revenue requests while retaining query parameters.
4. Verify admin-only reads/mutations, Manila date boundaries, audit events, formula reconciliation, CSV filtering, and legacy redirect against a live Supabase environment.

Rollback consists of reverting application code to the prior Revenue UI while leaving the additive expense table and audit history intact. Do not drop persisted expense data during rollback.
