# Spec Delta

## Purpose

Give administrators a Manila-time Finance dashboard that turns approved booking revenue and recorded expenses into understandable profitability reporting.

## ADDED Requirements

### Requirement: Finance route and Revenue compatibility
The system SHALL provide the Finance workspace at `/admin/finance` and SHALL redirect `/admin/revenue` to that workspace. Admin navigation and the main dashboard SHALL label and link the destination as Finance.

#### Scenario: Admin opens a legacy Revenue bookmark
- **WHEN** an authorized administrator navigates to `/admin/revenue`
- **THEN** the system redirects the administrator to `/admin/finance`

### Requirement: Manila-time booking revenue allocation
The system SHALL count only Approved bookings as booking revenue and SHALL assign each booking total across its scheduled court-slot dates in Manila time. A multi-date booking SHALL contribute its total proportionally across its booked slots.

#### Scenario: Approved multi-date booking is reported
- **WHEN** an Approved booking contains slots on more than one Manila date within a selected range
- **THEN** each included date receives its proportional share of the booking total

#### Scenario: Non-approved booking is reported
- **WHEN** a booking is Pending or Rejected
- **THEN** it contributes neither booking revenue nor booking count to Finance reporting

### Requirement: Filter-aware Finance KPIs
For the selected Manila-time date range, the system SHALL show Booking Revenue, Expenses, Net Profit, Profit Margin, Booking Count, and Average Revenue per Booking. Net Profit SHALL equal Booking Revenue minus Expenses; Profit Margin SHALL equal Net Profit divided by Booking Revenue times 100; Average Revenue per Booking SHALL equal Booking Revenue divided by Booking Count. A zero denominator SHALL display an unavailable value rather than an invalid number.

#### Scenario: Finance range contains revenue and expenses
- **WHEN** an administrator selects a range containing Approved booking revenue and paid expenses
- **THEN** each KPI reflects only that range and its stated formula

#### Scenario: Finance range contains no approved booking revenue
- **WHEN** an administrator selects a range with zero booking revenue or zero approved bookings
- **THEN** the ratio KPI requiring that denominator displays an unavailable value

### Requirement: Revenue and profit trends
The system SHALL chart booking revenue and net profit for the selected range. Trend aggregation SHALL use daily points for short ranges, weekly points for medium ranges, and monthly points for long ranges without changing the corresponding selected-range totals.

#### Scenario: Administrator selects a long range
- **WHEN** an administrator selects a range that requires monthly aggregation
- **THEN** the trend charts show monthly points whose totals reconcile to the Finance KPIs

### Requirement: Finance filtering and export
The Finance workspace SHALL offer current-period presets and a custom date range. It SHALL export the active range's approved-booking revenue by date, individual expenses, and daily profit summary in CSV format.

#### Scenario: Administrator exports a filtered report
- **WHEN** an administrator exports Finance data after selecting a date range
- **THEN** the CSV contains only data in that range and includes revenue, expense, and daily-profit records

### Requirement: Dashboard Finance summary
The main admin dashboard SHALL provide a compact Finance summary for its current reporting period, including booking revenue, expenses, and net profit, with a link to the Finance workspace.

#### Scenario: Administrator opens the admin dashboard
- **WHEN** an authorized administrator views the main admin dashboard
- **THEN** the dashboard displays the compact Finance summary and a Finance link
