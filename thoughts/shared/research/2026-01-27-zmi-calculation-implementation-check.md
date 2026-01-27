---
date: 2026-01-27T14:35:30+01:00
researcher: Claude
git_commit: 7467879c158132365d0762639ebd876d7cf6237b
branch: master
repository: terp
topic: "Check implementation vs zmi-calculation-manual-reference"
tags: [research, zmi, calculation, day-plans, breaks, tolerance, rounding, vacation, monthly-evaluation]
status: complete
last_updated: 2026-01-27
last_updated_by: Claude
---

# Research: Check implementation vs zmi-calculation-manual-reference

**Date**: 2026-01-27T14:35:30+01:00  
**Researcher**: Claude  
**Git Commit**: 7467879c158132365d0762639ebd876d7cf6237b  
**Branch**: master  
**Repository**: terp

## Research Question
Check if the current implementation matches `thoughts/shared/reference/zmi-calculation-manual-reference.md`.

## Summary
The current implementation covers many of the calculation behaviors referenced in the ZMI manual (day plan fields, tolerance/rounding hooks, booking pairing, break deduction modes, capping structures, vacation special calculations, and monthly evaluation rules). These behaviors are implemented in `apps/api/internal/calculation/` and wired through the daily calculation service. The comparison below lists where explicit logic exists (with code references) and where the manual describes behavior that is not currently found in the main calculation path or API models/wiring.

## Detailed Findings

### Day Plan Model Coverage
- Day plan fields for time windows, regular hours (including alternative regular hours and “from employee master”), tolerance fields, rounding options, variable work time, holiday credits, vacation deduction, no-booking behavior, day change behavior, and shift detection windows are modeled on `DayPlan`. `DayPlanBreak` includes break configuration and a `MinutesDifference` flag. (`[apps/api/internal/model/dayplan.go:51](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/model/dayplan.go#L51)`)
- The model exposes helpers for effective regular hours (employee master or absence-day alternative) and holiday credits. (`[apps/api/internal/model/dayplan.go:139](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/model/dayplan.go#L139)`)

### Booking Values (Original/Edited/Calculated)
- Bookings store `OriginalTime`, `EditedTime`, and `CalculatedTime`, with a helper that uses `CalculatedTime` if present. This mirrors the “Original/Edited/Calculated” value split described in the reference. (`[apps/api/internal/model/booking.go:20](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/model/booking.go#L20)`)
- The daily calculation service updates calculated times after running the calculator. (`[apps/api/internal/service/daily_calc.go:334](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/service/daily_calc.go#L334)`)

### Booking Pairing and Gross/Break Time
- Booking pairing is implemented in `PairBookings` with category-based pairing (work vs break), pairing by `PairID` where present, chronological pairing otherwise, and cross‑midnight handling. (`[apps/api/internal/calculation/pairing.go:18](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/calculation/pairing.go#L18)`)
- Gross work time is computed from work pairs; manual breaks are computed from break pairs. (`[apps/api/internal/calculation/pairing.go:221](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/calculation/pairing.go#L221)`)

### Tolerance and Core Time
- Arrival/departure tolerance normalizes times to an “expected time” if within plus/minus thresholds. (`[apps/api/internal/calculation/tolerance.go:3](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/calculation/tolerance.go#L3)`)
- Time-window validation flags early/late arrivals/departures, and core hours validation checks first come/last go against core window fields. (`[apps/api/internal/calculation/tolerance.go:55](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/calculation/tolerance.go#L55)`)
- In the daily calculator, arrival tolerance uses `ComeTo` as the expected time and departure tolerance uses `GoFrom`. (This is the only expected time used in tolerance normalization.) (`[[apps/api/internal/calculation/calculator.go:15](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/calculation/calculator.go#L15)0](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/calculation/calculator.go#L150)`)

### Rounding
- Rounding modes include up/down/nearest and fixed add/subtract, applied independently to come/go times. (`[apps/api/internal/calculation/rounding.go:3](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/calculation/rounding.go#L3)`)
- Rounding configuration is built from day plan rounding fields in the daily calc service. (`[apps/api/internal/service/daily_calc.go:377](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/service/daily_calc.go#L377)`)

### Breaks (Fixed, Variable, Minimum)
- Break deduction supports fixed, variable, and minimum break types. Fixed breaks are always deducted based on overlap; variable breaks apply only when no manual break is recorded; minimum breaks apply after a threshold, with a proportional mode when `MinutesDifference` is true. (`[apps/api/internal/calculation/breaks.go:9](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/calculation/breaks.go#L9)`)
- `DayPlanBreak` includes `MinutesDifference`, but the daily calculation input mapping does not pass it into `BreakConfig`. (`[apps/api/internal/model/dayplan.go:212](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/model/dayplan.go#L212)`, `[apps/api/internal/service/daily_calc.go:411](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/service/daily_calc.go#L411)`)

### Capping and Net Time
- Net time is calculated from gross time minus break deductions and capped by `MaxNetWorkTime`. (`[apps/api/internal/calculation/calculator.go:80](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/calculation/calculator.go#L80)`)
- Capping structures include early-arrival capping (ComeFrom with optional variable work time), late-departure capping (GoTo + tolerance), and max-net-time capping. These are aggregated into a `CappingResult` alongside total capped minutes. (`[apps/api/internal/calculation/capping.go:3](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/calculation/capping.go#L3)`, `[apps/api/internal/calculation/calculator.go:93](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/calculation/calculator.go#L93)`)

### Monthly Evaluation Rules (Flextime)
- Monthly aggregation supports four credit types (no evaluation, complete carryover, after-threshold, no carryover) with monthly caps and positive/negative balance caps. (`[apps/api/internal/calculation/monthly.go:5](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/calculation/monthly.go#L5)`)
- Annual carryover with a negative floor is implemented. (`[apps/api/internal/calculation/monthly.go:238](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/calculation/monthly.go#L238)`)

### Vacation Calculation and Special Rules
- Vacation entitlement uses calendar-year or entry-date basis, prorates by months employed, adjusts by part-time factor, and supports special calculations (age, tenure, disability). (`[apps/api/internal/calculation/vacation.go:9](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/calculation/vacation.go#L9)`)
- Carryover capping for vacation is supported via `CalculateCarryover`, and vacation balance deduction uses a configurable deduction value. (`[apps/api/internal/calculation/vacation.go:135](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/calculation/vacation.go#L135)`)

### Shift Detection
- Shift detection logic exists as a reusable calculator with arrival/departure window matching and alternative plan fallback. (`[apps/api/internal/calculation/shift.go:7](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/calculation/shift.go#L7)`)
- Day plan fields for shift detection windows and alternative plan IDs exist in the model. (`[apps/api/internal/model/dayplan.go:112](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/model/dayplan.go#L112)`)
- No usage of the shift detector appears in the daily calculation service or other runtime paths scanned in `apps/api/internal`. (Search showed usage only in tests.)

### Day Plan Code Restrictions
- The manual reference states certain day plan codes are reserved (U, K, S). In the day plan service, code validation checks for required/unique codes but does not include a reserved-code rule. (`[apps/api/internal/service/dayplan.go:78](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/service/dayplan.go#L78)`)

## Code References
- `[apps/api/internal/model/dayplan.go:51](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/model/dayplan.go#L51)` - Day plan fields and ZMI-specific settings (tolerances, rounding, variable work time, shifts, breaks).
- `[apps/api/internal/model/booking.go:20](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/model/booking.go#L20)` - Booking original/edited/calculated time representation.
- `[apps/api/internal/service/daily_calc.go:344](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/service/daily_calc.go#L344)` - Mapping from day plan to calculation input and booking conversion.
- `[apps/api/internal/calculation/calculator.go:15](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/calculation/calculator.go#L15)` - End-to-end daily calculation pipeline.
- `[apps/api/internal/calculation/tolerance.go:3](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/calculation/tolerance.go#L3)` - Tolerance normalization and core/time window validation.
- `[apps/api/internal/calculation/rounding.go:3](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/calculation/rounding.go#L3)` - Rounding modes and rounding application.
- `[apps/api/internal/calculation/breaks.go:9](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/calculation/breaks.go#L9)` - Fixed/variable/minimum break deduction logic.
- `[apps/api/internal/calculation/capping.go:3](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/calculation/capping.go#L3)` - Capping logic for early/late windows and max net time.
- `[apps/api/internal/calculation/monthly.go:5](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/calculation/monthly.go#L5)` - Monthly evaluation credit types and caps.
- `[apps/api/internal/calculation/vacation.go:9](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/calculation/vacation.go#L9)` - Vacation entitlement, special calculations, carryover.
- `[apps/api/internal/calculation/shift.go:7](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/calculation/shift.go#L7)` - Shift detection logic.
- `[apps/api/internal/service/dayplan.go:78](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/service/dayplan.go#L78)` - Day plan creation/validation (no reserved code rule).

## Architecture Documentation
- Daily calculations are centered in `calculation.Calculator.Calculate`, which applies tolerance/rounding to bookings, pairs them, computes gross and break time, applies net time caps, tracks capping items, validates minimum time, and computes overtime/undertime. (`[apps/api/internal/calculation/calculator.go:15](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/calculation/calculator.go#L15)`)
- Runtime wiring happens in `DailyCalcService.buildCalcInput`, which converts day plan and bookings into calculation inputs and later updates booking calculated times. (`[apps/api/internal/service/daily_calc.go:344](https://github.com/impactj90/terp/blob/7467879c158132365d0762639ebd876d7cf6237b/apps/api/internal/service/daily_calc.go#L344)`)
- Calculation modules are split by concern: pairing (`pairing.go`), breaks (`breaks.go`), rounding (`rounding.go`), tolerance (`tolerance.go`), capping (`capping.go`), monthly evaluation (`monthly.go`), and vacation (`vacation.go`).

## Historical Context (from thoughts/)
- `thoughts/shared/research/2026-01-22-TICKET-062-create-tolerance-logic.md` - Prior research on tolerance logic implementation.
- `thoughts/shared/research/2026-01-22-TICKET-063-create-rounding-logic.md` - Rounding logic design notes.
- `thoughts/shared/research/2026-01-22-TICKET-064-create-fixed-break-deduction.md` - Fixed break deduction notes.
- `thoughts/shared/research/2026-01-22-TICKET-061-create-booking-pairing-logic.md` - Booking pairing logic reference.
- `thoughts/shared/research/2026-01-22-TICKET-060-create-calculation-types.md` - Calculation types and structures.

## Related Research
- `thoughts/shared/research/2026-01-22-TICKET-062-create-tolerance-logic.md`
- `thoughts/shared/research/2026-01-22-TICKET-063-create-rounding-logic.md`
- `thoughts/shared/research/2026-01-22-TICKET-064-create-fixed-break-deduction.md`
- `thoughts/shared/research/2026-01-22-TICKET-061-create-booking-pairing-logic.md`
- `thoughts/shared/research/2026-01-22-TICKET-060-create-calculation-types.md`

## Open Questions
- Should shift detection be invoked as part of daily calculation flow (no current wiring found outside tests)?
- Is the day plan code restriction (U/K/S reserved) intended to be enforced in the day plan service?
- Should `MinutesDifference` and `VariableWorkTime` be wired into the calculation input mapping for production use?

