# Tasks

## 1. Finance persistence and mutation contract

- [x] 1.1 Read the relevant Next.js 16 route/server-action guidance and inspect existing admin mutation patterns; verify the chosen route/action pattern remains compatible with the installed Next version.
- [x] 1.2 Add the typed `expenses` schema definition (integer centavos, date, supported category, optional metadata, timestamps, indexes) without editing generated Drizzle migrations; verify `npx tsc --noEmit` passes.
- [x] 1.3 Add idempotent Supabase SQL for the expense table, constraints/indexes, default-deny RLS, and transactional create/update/delete RPCs that append audit records; verify the SQL is documented for manual SQL-editor application and enforces invalid values at the database boundary.
- [x] 1.4 Implement admin-authorized expense mutation endpoints/actions and server-side request validation for required fields, category, integer-centavo amount, and Manila non-future date; verify valid and invalid request tests or focused checks pass.
- [x] 1.5 Implement bounded, server-filtered expense ledger reads ordered by paid date then id; verify category, title, and active-range filters return only matching rows.

## 2. Financial reporting model

- [x] 2.1 Implement shared Finance range normalization and daily aggregation of Approved booking revenue, expenses, profit, and booking count in Manila time; verify tests cover empty ranges, invalid/reversed dates, and negative profit.
- [x] 2.2 Allocate multi-slot booking totals in exact centavos with deterministic remainder handling; verify allocations reconcile to each booking total and the query limits input to Approved bookings.
- [x] 2.3 Derive KPI values, adaptive day/week/month chart buckets, dashboard summary values, and CSV rows from the shared aggregate; verify bucket and CSV tests, reconciled totals, and unavailable zero-denominator ratios.

## 3. Finance interface and compatibility

- [x] 3.1 Create the admin-gated `/admin/finance` page with Manila-range presets/custom filter, formula-aware KPI cards, revenue/profit trends, and loading/error states; verify `npx tsc --noEmit` passes. Visual confirmation is included in 4.2.
- [x] 3.2 Add the in-context Add/Edit Expense form and confirmed permanent-delete interaction; verify mutation refresh paths and actionable validation feedback are implemented. Live mutation confirmation is included in 4.2.
- [x] 3.3 Add the searchable/category-filtered, newest-first expense ledger and filtered CSV export containing booking revenue, expenses, and daily profit; verify CSV fields and date-boundary rows with focused tests.
- [x] 3.4 Replace `/admin/revenue` with a query-preserving redirect to `/admin/finance`; update sidebar/dashboard labels, links, and the compact dashboard Finance summary; verify the redirect preserves all query values and app navigation has no stale Revenue destination.

## 4. Integration and release readiness

- [x] 4.1 Run `npm test` and `npx tsc --noEmit`; fix any regressions and record the results.
- [ ] 4.2 Apply the new Supabase SQL in a live environment following the repository setup order, then have the user manually verify admin access, audit events, charts, formulas, export, and legacy redirect in their browser.
