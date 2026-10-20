# Proposal

## Why

The admin Revenue page reports approved booking totals but cannot record operating costs or show whether the venue is profitable. Administrators need one internal Finance workspace that connects approved booking revenue to manually entered cash expenses for a selected Manila-time period.

## What Changes

- Replace the admin-facing Revenue report with a Finance dashboard while preserving `/admin/revenue` as a redirect to `/admin/finance`.
- Add an admin-only expense ledger with manual create, edit, and permanent-delete operations, audit records, validation, categories, and filters.
- Calculate and display filtered booking revenue, expenses, net profit, profit margin, booking count, and average revenue per booking with their definitions available in the UI.
- Add adaptive-granularity revenue and profit trend charts plus an export of filtered revenue, expenses, and daily profit data.
- Update the main admin dashboard to surface a compact Finance summary and link to the Finance workspace.

## Capabilities

### New Capabilities

- `expense-management`: Admin-managed, auditable cash-expense records and a searchable finance ledger.
- `finance-reporting`: Manila-time financial calculations, Finance dashboard reporting, trends, navigation, and CSV export.

### Modified Capabilities

- None.

## Impact

- Affects the existing admin Revenue route, dashboard links/cards, sidebar navigation, revenue aggregation helpers, and export/chart components.
- Adds persisted expense data, corresponding Supabase/Drizzle schema and SQL/RLS support, server-side admin APIs or actions, and audit-log writes.
- Retains approved booking totals as the v1 booking-revenue source; it does not add payment settlement, tax accounting, receipt uploads, recurring expenses, or expense backfill.
