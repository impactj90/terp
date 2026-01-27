-- Add ZMI-compliant fields to tariffs table
-- ZMI Reference: Tarif (Section 14), Gleitzeitbewertung (Section 5)

-- =====================================================
-- VACATION FIELDS (ZMI Section 14)
-- =====================================================

ALTER TABLE tariffs
    -- Base annual vacation days for this tariff
    -- ZMI: Jahresurlaub
    ADD COLUMN annual_vacation_days DECIMAL(5,2),

    -- Work days per week (for pro-rating)
    -- ZMI: AT pro Woche (Arbeitstage pro Woche)
    ADD COLUMN work_days_per_week INT DEFAULT 5,

    -- Vacation calculation basis
    -- ZMI: Urlaubsberechnung Basis
    -- 'calendar_year' = Jan 1 - Dec 31
    -- 'entry_date' = Anniversary-based
    ADD COLUMN vacation_basis VARCHAR(20) DEFAULT 'calendar_year';

-- =====================================================
-- TARGET HOURS FIELDS (ZMI Section 14)
-- =====================================================

ALTER TABLE tariffs
    -- Daily target hours
    -- ZMI: Tagessollstunden
    ADD COLUMN daily_target_hours DECIMAL(5,2),

    -- Weekly target hours
    -- ZMI: Wochensollstunden
    ADD COLUMN weekly_target_hours DECIMAL(5,2),

    -- Monthly target hours
    -- ZMI: Monatssollstunden
    ADD COLUMN monthly_target_hours DECIMAL(6,2),

    -- Annual target hours
    -- ZMI: Jahressollstunden
    ADD COLUMN annual_target_hours DECIMAL(7,2);

-- =====================================================
-- FLEXTIME/MONTHLY EVALUATION FIELDS (ZMI Section 5)
-- =====================================================

ALTER TABLE tariffs
    -- Maximum monthly flextime credit (in minutes)
    -- ZMI: Maximale Gleitzeit im Monat
    ADD COLUMN max_flextime_per_month INT,

    -- Upper limit for annual flextime account (in minutes)
    -- ZMI: Obergrenze Jahreszeitkonto
    ADD COLUMN upper_limit_annual INT,

    -- Lower limit for annual flextime account (in minutes, can be negative)
    -- ZMI: Untergrenze Jahreszeitkonto
    ADD COLUMN lower_limit_annual INT,

    -- Minimum overtime threshold to qualify for flextime credit (in minutes)
    -- ZMI: Gleitzeitschwelle
    ADD COLUMN flextime_threshold INT,

    -- How flextime is credited at month end
    -- ZMI: Art der Gutschrift
    -- 'no_evaluation' = Keine Bewertung (1:1 transfer)
    -- 'complete' = Gleitzeitübertrag komplett (with limits)
    -- 'after_threshold' = Gleitzeitübertrag nach Schwelle
    -- 'no_carryover' = Kein Übertrag (reset to 0)
    ADD COLUMN credit_type VARCHAR(20) DEFAULT 'no_evaluation';

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON COLUMN tariffs.annual_vacation_days IS 'ZMI: Jahresurlaub - base vacation days per year';
COMMENT ON COLUMN tariffs.work_days_per_week IS 'ZMI: AT pro Woche - work days per week (default 5)';
COMMENT ON COLUMN tariffs.vacation_basis IS 'ZMI: Urlaubsberechnung - calendar_year or entry_date';
COMMENT ON COLUMN tariffs.daily_target_hours IS 'ZMI: Tagessollstunden - daily target hours';
COMMENT ON COLUMN tariffs.weekly_target_hours IS 'ZMI: Wochensollstunden - weekly target hours';
COMMENT ON COLUMN tariffs.monthly_target_hours IS 'ZMI: Monatssollstunden - monthly target hours';
COMMENT ON COLUMN tariffs.annual_target_hours IS 'ZMI: Jahressollstunden - annual target hours';
COMMENT ON COLUMN tariffs.max_flextime_per_month IS 'ZMI: Max Gleitzeit im Monat - max monthly flextime in minutes';
COMMENT ON COLUMN tariffs.upper_limit_annual IS 'ZMI: Obergrenze Jahreszeitkonto - annual flextime cap in minutes';
COMMENT ON COLUMN tariffs.lower_limit_annual IS 'ZMI: Untergrenze Jahreszeitkonto - annual flextime floor in minutes';
COMMENT ON COLUMN tariffs.flextime_threshold IS 'ZMI: Gleitzeitschwelle - overtime threshold in minutes';
COMMENT ON COLUMN tariffs.credit_type IS 'ZMI: Art der Gutschrift - how flextime is credited';

-- =====================================================
-- CONSTRAINTS
-- =====================================================

ALTER TABLE tariffs
    ADD CONSTRAINT chk_vacation_basis
    CHECK (vacation_basis IN ('calendar_year', 'entry_date'));

ALTER TABLE tariffs
    ADD CONSTRAINT chk_credit_type
    CHECK (credit_type IN ('no_evaluation', 'complete', 'after_threshold', 'no_carryover'));

ALTER TABLE tariffs
    ADD CONSTRAINT chk_work_days_per_week
    CHECK (work_days_per_week IS NULL OR (work_days_per_week >= 1 AND work_days_per_week <= 7));
