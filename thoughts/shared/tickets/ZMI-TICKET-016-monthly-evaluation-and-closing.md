# ZMI-TICKET-016: Monthly Evaluation, Closing, and Flextime Carryover

Status: Proposed
Priority: P1
Owner: TBD
Manual references: 5.3.2 Monthly Values; 4.10 Tariff Monthly Evaluation; 10.5 Error Handling

## Goal
Deliver full ZMI monthly evaluation logic, including closing/reopening months, carryover, and warnings.

## Scope
- In scope: Monthly aggregation rules, credit types, caps, monthly close/reopen, OpenAPI coverage.
- Out of scope: Daily calculation details (separate tickets).

## Requirements
### Business rules
- Monthly aggregation sums daily values (gross, net, target, overtime, undertime, break).
- Credit types (Art der Gutschrift):
  - No evaluation (direct transfer)
  - Complete carryover (apply caps)
  - After threshold (credit only above threshold)
  - No carryover (reset to zero)
- Apply caps:
  - Monthly cap
  - Positive and negative balance caps
  - Annual floor (if configured)
- Closing a month freezes results and blocks recalculation until reopened.
- Reopening a month allows recalculation but must be audited.

### API / OpenAPI
- Endpoints:
  - Recalculate month
  - Close month
  - Reopen month
  - Get month summary (with warnings)
- OpenAPI must document credit type semantics and cap fields.

## Acceptance criteria
- Monthly evaluation matches ZMI credit type behavior and caps.
- Closing prevents recalculation; reopening allows it.
- Warnings are returned for caps/threshold effects.

## Tests
### Unit tests
- Credit type behaviors with example values (direct, capped, threshold, no carryover).
- Caps applied correctly (monthly cap, positive/negative caps).
- Annual floor applied at year-end.

### API tests
- Recalculate month returns expected totals.
- Close month blocks recalculation; reopen allows it.
- Month summary includes warnings and is consistent with stored monthly values.

### Integration tests
- Previous month carryover feeds into current month start balance.
- Daily calculation errors reflected in monthly summary error counts.


## Test Case Pack
1) Credit type: complete carryover
   - Input: overtime=600, monthly cap=480
   - Expected: credited=480, forfeited=120
2) Credit type: after threshold
   - Input: overtime=300, threshold=120
   - Expected: credited=180, forfeited=120
3) Close/reopen
   - Input: close month then recalc
   - Expected: recalc blocked; after reopen recalc allowed


## Dependencies
- Daily calculation (ZMI-TICKET-006).
- Tariff definitions (ZMI-TICKET-018).
- Accounts (ZMI-TICKET-009) for monthly account outputs.
