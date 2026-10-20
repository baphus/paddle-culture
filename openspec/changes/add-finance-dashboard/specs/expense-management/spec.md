# Spec Delta

## Purpose

Provide administrators with a simple, auditable ledger for recording and maintaining the venue's cash expenses.

## ADDED Requirements

### Requirement: Admin-only expense ledger access
The system SHALL restrict expense listing and expense mutations to authenticated active administrators.

#### Scenario: Non-admin requests expense data
- **WHEN** a user without active administrator authorization requests expense data or a mutation
- **THEN** the system denies the request without disclosing financial records

### Requirement: Expense data and validation
The system SHALL record a title, paid date, positive PHP amount, and category for every expense; description, vendor or payee, and notes SHALL be optional. Paid dates SHALL not be later than the current Manila calendar date.

#### Scenario: Admin records a valid expense
- **WHEN** an administrator submits all required fields with a positive amount and a paid date of today or earlier in Manila
- **THEN** the expense is saved and becomes available to Finance reporting

#### Scenario: Admin submits an invalid expense
- **WHEN** an administrator submits a missing required field, non-positive amount, or future paid date
- **THEN** the system rejects the expense and identifies the invalid input

### Requirement: Controlled expense categories
The system SHALL categorize expenses as Rent, Payroll/Contractors, Utilities, Maintenance & Repairs, Supplies & Equipment, Marketing, Software/Subscriptions, Taxes & Fees, or Other. An Other expense SHALL include a descriptive title.

#### Scenario: Admin selects an expense category
- **WHEN** an administrator creates or edits an expense
- **THEN** the category control offers the supported category set and persists the selected category

### Requirement: Expense maintenance audit trail
The system SHALL allow administrators to edit and permanently delete expenses, require an explicit confirmation before deletion, and record create, edit, and delete actions with the actor and relevant before/after data in the backend audit record.

#### Scenario: Admin deletes an expense
- **WHEN** an administrator confirms deletion of an expense
- **THEN** the expense is permanently removed from the ledger and a deletion audit event is recorded

#### Scenario: Admin edits an expense
- **WHEN** an administrator saves a valid change to an existing expense
- **THEN** the ledger and Finance reporting use the updated values and an edit audit event is recorded

### Requirement: Searchable filtered expense ledger
The system SHALL show Finance expenses newest paid date first and allow filtering by the active Finance date range, category, and title search term.

#### Scenario: Admin narrows the ledger
- **WHEN** an administrator applies a supported date, category, or title filter
- **THEN** the ledger displays only expenses satisfying all active filters in newest-first order
