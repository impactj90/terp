# ZMI Time Clone - PRD Part 3: Business Logic & Calculation Rules

## 1. Time Calculation Engine

### 1.1 Daily Calculation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    DAILY CALCULATION FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. GET INPUTS                                                   │
│     ├── Employee's day plan for date                            │
│     ├── All bookings for date                                   │
│     ├── Absence day (if any)                                    │
│     └── Holiday (if any)                                        │
│                                                                  │
│  2. CHECK ABSENCE/HOLIDAY                                        │
│     ├── If absence → credit configured hours, skip booking calc │
│     ├── If holiday → credit holiday hours based on category     │
│     └── If both → use priority rules                            │
│                                                                  │
│  3. PAIR BOOKINGS                                                │
│     ├── Match A1 (come) with A2 (go)                            │
│     ├── Match PA (break start) with PE (break end)              │
│     └── Flag unpaired as errors                                 │
│                                                                  │
│  4. APPLY TOLERANCE                                              │
│     ├── Check come time vs. plan window                         │
│     ├── Check go time vs. plan window                           │
│     └── Flag core time violations                               │
│                                                                  │
│  5. APPLY ROUNDING                                               │
│     ├── Round come time per plan rules                          │
│     ├── Round go time per plan rules                            │
│     └── Optionally round all bookings                           │
│                                                                  │
│  6. CALCULATE GROSS TIME                                         │
│     └── Sum of all (go - come) pairs                            │
│                                                                  │
│  7. DEDUCT BREAKS                                                │
│     ├── Apply fixed breaks                                      │
│     ├── Apply variable breaks (if no break booked)              │
│     └── Apply minimum breaks (if threshold met)                 │
│                                                                  │
│  8. CALCULATE NET TIME                                           │
│     └── Gross time - break time                                 │
│                                                                  │
│  9. APPLY CAPS                                                   │
│     └── Limit to max_net_work_time if configured                │
│                                                                  │
│  10. CALCULATE OVERTIME/UNDERTIME                                │
│      └── Net time - target time                                 │
│                                                                  │
│  11. UPDATE ACCOUNTS                                             │
│      ├── Bonus accounts (time-based)                            │
│      └── Tracking accounts                                      │
│                                                                  │
│  12. RUN DAY MACRO (if configured)                               │
│                                                                  │
│  13. GENERATE ERRORS/WARNINGS                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Booking Pairing Algorithm

```python
def pair_bookings(bookings: List[Booking]) -> List[BookingPair]:
    """
    Pair come/go bookings for a single day.
    
    Rules:
    1. A1 (come) pairs with next A2 (go)
    2. PA (break start) pairs with next PE (break end)
    3. DA (business trip start) pairs with next DE (business trip end)
    4. Unpaired bookings generate errors
    """
    
    pairs = []
    pending = {}  # type -> booking
    
    for booking in sorted(bookings, key=lambda b: b.edited_time):
        booking_type = booking.type.behavior
        
        if booking_type in ['come', 'break_start', 'trip_start']:
            # Start of a pair
            pair_key = {
                'come': 'main',
                'break_start': 'break',
                'trip_start': 'trip'
            }[booking_type]
            
            if pair_key in pending:
                # Previous start wasn't closed - error
                generate_error('UNPAIRED_BOOKING', pending[pair_key])
            
            pending[pair_key] = booking
            
        elif booking_type in ['go', 'break_end', 'trip_end']:
            # End of a pair
            pair_key = {
                'go': 'main',
                'break_end': 'break',
                'trip_end': 'trip'
            }[booking_type]
            
            if pair_key in pending:
                pairs.append(BookingPair(
                    start=pending[pair_key],
                    end=booking,
                    type=pair_key
                ))
                del pending[pair_key]
            else:
                # End without start - error
                generate_error('UNPAIRED_BOOKING', booking)
    
    # Any remaining pending are unpaired starts
    for booking in pending.values():
        generate_error('MISSING_END_BOOKING', booking)
    
    return pairs
```

### 1.3 Tolerance Rules

```python
def apply_tolerance(booking_time: int, day_plan: DayPlan, is_come: bool) -> Tuple[int, bool]:
    """
    Apply tolerance rules to a booking time.
    
    Returns: (adjusted_time, is_core_time_violation)
    
    For FLEXTIME:
    - come_from/come_to define the allowed arrival window
    - Booking before come_from: cap at come_from (or extend by tolerance_come_minus)
    - Booking after come_to: core time violation
    
    For FIXED TIME:
    - tolerance_come_plus: early arrivals rounded in this interval
    - tolerance_come_minus: grace period for late arrivals
    - tolerance_go_minus: grace period for early departures  
    - tolerance_go_plus: late departures rounded in this interval
    """
    
    violation = False
    adjusted = booking_time
    
    if day_plan.plan_type == 'flextime':
        if is_come:
            window_start = day_plan.come_from - day_plan.tolerance_come_minus
            window_end = day_plan.come_to
            
            if booking_time < window_start:
                adjusted = window_start
            elif booking_time > window_end:
                violation = True
        else:  # go
            window_start = day_plan.go_from
            window_end = day_plan.go_to + day_plan.tolerance_go_plus
            
            if booking_time < window_start:
                violation = True
            elif booking_time > window_end:
                adjusted = window_end
                
    else:  # fixed time
        if is_come:
            target = day_plan.come_from
            
            if booking_time < target - day_plan.tolerance_come_plus:
                # Early - round to interval
                adjusted = round_to_interval(
                    booking_time, 
                    day_plan.tolerance_come_plus,
                    'up'
                )
            elif booking_time <= target + day_plan.tolerance_come_minus:
                # Within grace period
                adjusted = target
            else:
                # Late
                violation = True
                
        else:  # go
            target = day_plan.go_from
            
            if booking_time < target - day_plan.tolerance_go_minus:
                # Early departure
                violation = True
            elif booking_time <= target + day_plan.tolerance_go_plus:
                # Within grace period
                adjusted = target
            else:
                # Late - round to interval
                adjusted = round_to_interval(
                    booking_time,
                    day_plan.tolerance_go_plus,
                    'down'
                )
    
    return (adjusted, violation)
```

### 1.4 Rounding Rules

```python
def apply_rounding(time: int, interval: int, rounding_type: str) -> int:
    """
    Apply rounding to a booking time.
    
    Args:
        time: minutes from midnight
        interval: rounding interval in minutes
        rounding_type: 'up', 'down', 'math', 'add', 'subtract'
    
    Returns:
        Rounded time in minutes from midnight
    """
    
    if interval <= 0:
        return time
    
    if rounding_type == 'up':
        # Round up to next interval
        # 8:03 with 15min interval -> 8:15
        return ((time + interval - 1) // interval) * interval
    
    elif rounding_type == 'down':
        # Round down to previous interval
        # 16:18 with 10min interval -> 16:10
        return (time // interval) * interval
    
    elif rounding_type == 'math':
        # Standard mathematical rounding
        # 15:02 with 5min -> 15:00, 15:03 with 5min -> 15:05
        return round(time / interval) * interval
    
    elif rounding_type == 'add':
        # Add fixed time
        return time + interval
    
    elif rounding_type == 'subtract':
        # Subtract fixed time
        return max(0, time - interval)
    
    return time
```

### 1.5 Break Calculation

```python
def calculate_breaks(
    gross_time: int,
    booked_breaks: List[BookingPair],
    day_plan: DayPlan
) -> int:
    """
    Calculate total break time to deduct.
    
    Break types:
    1. Fixed breaks (fixed_1, fixed_2, fixed_3): Always deducted
    2. Variable break: Only if no break was booked
    3. Minimum breaks: After X hours presence
    """
    
    total_break = 0
    has_booked_break = len(booked_breaks) > 0
    
    for break_def in day_plan.breaks:
        
        if break_def.type in ['fixed_1', 'fixed_2', 'fixed_3']:
            # Always deduct
            total_break += break_def.duration
            
        elif break_def.type == 'variable':
            # Only if no break booked
            if not has_booked_break:
                total_break += break_def.duration
                
        elif break_def.type in ['minimum_1', 'minimum_2']:
            # Only if presence exceeds threshold
            if gross_time > break_def.after_hours:
                if break_def.minutes_difference:
                    # Only deduct the overage, up to full break
                    overage = gross_time - break_def.after_hours
                    total_break += min(overage, break_def.duration)
                else:
                    # Deduct full break amount
                    total_break += break_def.duration
    
    # If breaks were booked, sum those instead of variable
    if has_booked_break:
        booked_duration = sum(
            (pair.end.calculated_time - pair.start.calculated_time)
            for pair in booked_breaks
        )
        # Variable break is replaced by booked breaks
        # Fixed breaks are still added on top
    
    return total_break
```

### 1.6 Overtime Calculation

```python
def calculate_overtime(
    net_time: int,
    target_time: int,
    day_plan: DayPlan
) -> Tuple[int, int]:
    """
    Calculate overtime and undertime.
    
    Returns: (overtime_minutes, undertime_minutes)
    
    - Overtime: positive difference when worked > target
    - Undertime: positive difference when worked < target
    """
    
    difference = net_time - target_time
    
    if difference > 0:
        overtime = difference
        undertime = 0
    else:
        overtime = 0
        undertime = abs(difference)
    
    return (overtime, undertime)
```

---

## 2. Monthly Calculation

### 2.1 Monthly Aggregation

```python
def calculate_month(employee_id: UUID, year: int, month: int) -> MonthlyValue:
    """
    Calculate monthly totals and apply month-end rules.
    """
    
    # Get all daily values for the month
    daily_values = get_daily_values(employee_id, year, month)
    
    # Aggregate
    monthly = MonthlyValue(
        employee_id=employee_id,
        year=year,
        month=month,
        total_gross_time=sum(d.gross_time for d in daily_values),
        total_net_time=sum(d.net_time for d in daily_values),
        total_target_time=sum(d.target_time for d in daily_values),
        total_overtime=sum(d.overtime for d in daily_values),
        total_undertime=sum(d.undertime for d in daily_values),
        total_break_time=sum(d.break_time for d in daily_values),
    )
    
    # Count absences
    absences = get_absences(employee_id, year, month)
    monthly.vacation_days = count_by_category(absences, 'vacation')
    monthly.sick_days = count_by_category(absences, 'illness')
    monthly.special_days = count_by_category(absences, 'special')
    
    # Get previous month's carryover
    prev_month = get_monthly_value(employee_id, year, month - 1)
    monthly.flextime_start = prev_month.flextime_carryover if prev_month else 0
    
    # Calculate flextime change
    monthly.flextime_change = monthly.total_overtime - monthly.total_undertime
    monthly.flextime_end = monthly.flextime_start + monthly.flextime_change
    
    # Apply monthly evaluation rules
    tariff = get_active_tariff(employee_id, year, month)
    if tariff.monthly_evaluation:
        monthly.flextime_carryover = apply_monthly_evaluation(
            monthly.flextime_end,
            monthly.flextime_change,
            tariff.monthly_evaluation
        )
    else:
        monthly.flextime_carryover = monthly.flextime_end
    
    # Vacation balance
    monthly.vacation_start = prev_month.vacation_end if prev_month else calculate_initial_vacation(employee_id, year)
    monthly.vacation_taken = monthly.vacation_days
    monthly.vacation_end = monthly.vacation_start - monthly.vacation_taken
    
    # Run monthly macro if configured
    if tariff.monthly_macro_id and is_macro_day(tariff.monthly_macro_day, year, month):
        run_macro(tariff.monthly_macro_id, employee_id, year, month)
    
    return monthly
```

### 2.2 Monthly Evaluation Rules

```python
def apply_monthly_evaluation(
    flextime_end: int,
    flextime_change: int,
    rules: MonthlyEvaluation
) -> int:
    """
    Apply month-end flextime processing rules.
    
    Returns: flextime amount to carry to next month
    """
    
    carryover = flextime_end
    
    # Apply credit type rules
    if rules.credit_type == 'none':
        # No processing, straight carryover
        pass
        
    elif rules.credit_type == 'complete':
        # Full carryover with limits
        
        # Cap monthly gain
        if rules.max_monthly_flextime and flextime_change > rules.max_monthly_flextime:
            carryover = carryover - (flextime_change - rules.max_monthly_flextime)
        
        # Cap annual total (upper)
        if rules.upper_annual_limit and carryover > rules.upper_annual_limit:
            carryover = rules.upper_annual_limit
        
        # Cap annual total (lower) 
        if rules.lower_annual_limit and carryover < rules.lower_annual_limit:
            carryover = rules.lower_annual_limit
            
    elif rules.credit_type == 'after_threshold':
        # Only credit if threshold met
        
        if rules.flextime_threshold and flextime_change < rules.flextime_threshold:
            # Didn't meet threshold - no credit
            carryover = carryover - flextime_change
        else:
            # Met threshold - apply complete rules
            if rules.max_monthly_flextime and flextime_change > rules.max_monthly_flextime:
                carryover = carryover - (flextime_change - rules.max_monthly_flextime)
            
            if rules.upper_annual_limit and carryover > rules.upper_annual_limit:
                carryover = rules.upper_annual_limit
                
    elif rules.credit_type == 'no_transfer':
        # Reset to zero each month
        carryover = 0
    
    return carryover
```

---

## 3. Vacation Calculation

### 3.1 Annual Entitlement

```python
def calculate_annual_vacation(employee_id: UUID, year: int) -> Decimal:
    """
    Calculate vacation entitlement for a year.
    
    Components:
    1. Base entitlement from tariff
    2. Special entitlements (age, tenure, disability)
    3. Proration for partial year
    4. Carryover from previous year
    5. Capping rules
    """
    
    employee = get_employee(employee_id)
    tariff = get_active_tariff(employee_id, year, 1)
    employment_type = tariff.employment_type
    
    # 1. Base entitlement
    base = tariff.annual_vacation
    
    # 2. Special entitlements
    specials = Decimal(0)
    
    for calc in employment_type.special_calculations:
        if calc.type == 'age':
            age = calculate_age(employee.birth_date, date(year, 1, 1))
            if age >= calc.threshold:
                specials += calc.value
                
        elif calc.type == 'tenure':
            tenure = calculate_tenure_years(employee.entry_date, date(year, 1, 1))
            if tenure >= calc.threshold:
                specials += calc.value
                
        elif calc.type == 'disability':
            if employee.has_disability:
                specials += calc.value
    
    total_entitlement = base + specials
    
    # 3. Proration for entry/exit
    if employee.entry_date.year == year:
        # Prorate for partial year entry
        months_worked = 12 - employee.entry_date.month + 1
        total_entitlement = (total_entitlement / 12) * months_worked
    
    if employee.exit_date and employee.exit_date.year == year:
        # Prorate for exit
        months_worked = employee.exit_date.month
        total_entitlement = (total_entitlement / 12) * months_worked
    
    # 4. Carryover from previous year
    prev_year = get_year_end_vacation(employee_id, year - 1)
    carryover = prev_year.vacation_end if prev_year else Decimal(0)
    
    # 5. Apply capping rules
    capping_rules = employment_type.capping_rules
    for rule in capping_rules:
        if rule.at_year_end and rule.type == 'forfeit_all':
            carryover = Decimal(0)
        elif rule.at_date:
            # Will be applied when that date is reached
            pass
    
    return total_entitlement + carryover
```

### 3.2 Vacation Deduction

```python
def deduct_vacation(employee_id: UUID, date: date, absence_type: AbsenceType) -> Decimal:
    """
    Calculate vacation to deduct for an absence day.
    
    Returns: number of vacation days to deduct
    """
    
    day_plan = get_employee_day_plan(employee_id, date)
    
    # Get deduction amount from day plan (usually 1.0)
    deduction = day_plan.vacation_deduction
    
    # Apply portion from absence type (0=none, 1=full, 2=half)
    if absence_type.portion == 0:
        return Decimal(0)
    elif absence_type.portion == 2:
        return deduction / 2
    else:
        return deduction
```

---

## 4. Shift Detection

### 4.1 Auto-Detect Shift

```python
def detect_shift(
    employee_id: UUID,
    date: date,
    first_booking_time: int
) -> Optional[DayPlan]:
    """
    Automatically detect which day plan to use based on first booking.
    
    Process:
    1. Get base day plan from employee's schedule
    2. Check if booking falls in detection window
    3. If not, check alternative plans
    4. Return matching plan or None (error)
    """
    
    base_plan = get_scheduled_day_plan(employee_id, date)
    
    if not base_plan.shift_detection_enabled:
        return base_plan
    
    # Check base plan's window
    if is_in_window(
        first_booking_time,
        base_plan.shift_come_from,
        base_plan.shift_come_to
    ):
        return base_plan
    
    # Check alternative plans
    for alt_plan in base_plan.alternative_plans:
        if is_in_window(
            first_booking_time,
            alt_plan.shift_come_from,
            alt_plan.shift_come_to
        ):
            return alt_plan
    
    # No matching plan found
    generate_error('NO_MATCHING_SHIFT', employee_id, date)
    return None


def is_in_window(time: int, window_from: int, window_to: int) -> bool:
    """Check if time falls within a window."""
    
    if window_from <= window_to:
        # Normal window (e.g., 06:00 - 09:00)
        return window_from <= time <= window_to
    else:
        # Overnight window (e.g., 22:00 - 06:00)
        return time >= window_from or time <= window_to
```

---

## 5. Error Detection

### 5.1 Error Types and Detection

```python
ERROR_TYPES = {
    'MISSING_COME': {
        'code': '001',
        'severity': 'error',
        'message': 'Missing arrival booking'
    },
    'MISSING_GO': {
        'code': '002', 
        'severity': 'error',
        'message': 'Missing departure booking'
    },
    'UNPAIRED_BOOKING': {
        'code': '003',
        'severity': 'error',
        'message': 'Booking without matching pair'
    },
    'CORE_TIME_VIOLATION': {
        'code': '004',
        'severity': 'warning',
        'message': 'Booking outside core time window'
    },
    'NO_MATCHING_SHIFT': {
        'code': '005',
        'severity': 'error',
        'message': 'Could not determine shift from booking time'
    },
    'NO_DAY_PLAN': {
        'code': '006',
        'severity': 'error',
        'message': 'No day plan assigned for date'
    },
    'MAX_HOURS_EXCEEDED': {
        'code': '007',
        'severity': 'warning',
        'message': 'Maximum daily hours exceeded'
    },
    'BOOKING_OUTSIDE_WINDOW': {
        'code': '008',
        'severity': 'warning',
        'message': 'Booking outside allowed time window'
    }
}


def detect_errors(employee_id: UUID, date: date, bookings: List[Booking], day_plan: DayPlan) -> List[Error]:
    """
    Detect all errors for a given day.
    """
    
    errors = []
    
    # No day plan
    if not day_plan:
        errors.append(Error('NO_DAY_PLAN', employee_id, date))
        return errors
    
    # Pair bookings and collect pairing errors
    pairs, pairing_errors = pair_bookings_with_errors(bookings)
    errors.extend(pairing_errors)
    
    # Check for missing main pair
    main_pairs = [p for p in pairs if p.type == 'main']
    if len(main_pairs) == 0 and not has_absence(employee_id, date):
        if has_any_booking(bookings):
            # Has some bookings but no complete come/go pair
            if not has_come_booking(bookings):
                errors.append(Error('MISSING_COME', employee_id, date))
            if not has_go_booking(bookings):
                errors.append(Error('MISSING_GO', employee_id, date))
    
    # Check core time violations
    for pair in main_pairs:
        _, come_violation = apply_tolerance(pair.start.edited_time, day_plan, True)
        _, go_violation = apply_tolerance(pair.end.edited_time, day_plan, False)
        
        if come_violation or go_violation:
            errors.append(Error('CORE_TIME_VIOLATION', employee_id, date))
    
    return errors
```

---

## 6. Time Zone Handling

```python
# All times stored as minutes from midnight in LOCAL time
# Server should be configured for company's primary timezone
# Multi-timezone companies need per-location handling

def booking_to_minutes(booking_datetime: datetime, timezone: str) -> int:
    """Convert booking datetime to minutes from midnight in local timezone."""
    
    local_dt = booking_datetime.astimezone(pytz.timezone(timezone))
    return local_dt.hour * 60 + local_dt.minute


def minutes_to_time_string(minutes: int) -> str:
    """Convert minutes from midnight to HH:MM string."""
    
    hours = minutes // 60
    mins = minutes % 60
    return f"{hours:02d}:{mins:02d}"
```

---

## 7. Day Change (Night Shift) Handling

```python
def handle_day_change(
    bookings: List[Booking],
    day_plan: DayPlan
) -> Tuple[date, List[Booking]]:
    """
    Handle bookings that span midnight.
    
    Options:
    - 'none': Normal day processing (no overnight)
    - 'evaluate_come': Credit all time to arrival day
    - 'evaluate_go': Credit all time to departure day
    - 'auto_complete': Insert 00:00 bookings to split
    """
    
    if day_plan.day_change_behavior == 'none':
        return bookings
    
    elif day_plan.day_change_behavior == 'evaluate_come':
        # All bookings credited to the come date
        come_booking = find_first_come(bookings)
        return (come_booking.date, bookings)
    
    elif day_plan.day_change_behavior == 'evaluate_go':
        # All bookings credited to the go date
        go_booking = find_last_go(bookings)
        return (go_booking.date, bookings)
    
    elif day_plan.day_change_behavior == 'auto_complete':
        # Insert 00:00 bookings to split at midnight
        result = []
        for booking in bookings:
            result.append(booking)
            
            # If this is a come and next is go on different day
            if is_overnight_pair(booking, bookings):
                # Insert go at 00:00 on first day
                result.append(create_system_booking(
                    employee_id=booking.employee_id,
                    date=booking.date,
                    type='go',
                    time=1440  # 24:00 = 00:00 next day
                ))
                # Insert come at 00:00 on second day
                result.append(create_system_booking(
                    employee_id=booking.employee_id,
                    date=booking.date + timedelta(days=1),
                    type='come',
                    time=0  # 00:00
                ))
        
        return result
```
