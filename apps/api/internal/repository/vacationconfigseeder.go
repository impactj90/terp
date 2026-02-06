package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/tolga/terp/internal/auth"
	"github.com/tolga/terp/internal/model"
)

// VacationConfigSeeder seeds dev vacation configuration data idempotently.
type VacationConfigSeeder struct {
	db *DB
}

// NewVacationConfigSeeder creates a new VacationConfigSeeder.
func NewVacationConfigSeeder(db *DB) *VacationConfigSeeder {
	return &VacationConfigSeeder{db: db}
}

// SeedAll seeds all vacation config entities for the given tenant. Idempotent via ON CONFLICT.
func (s *VacationConfigSeeder) SeedAll(ctx context.Context, tenantID uuid.UUID) error {
	return s.db.GORM.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := s.seedSpecialCalcs(tx, tenantID); err != nil {
			return fmt.Errorf("seed special calcs: %w", err)
		}
		if err := s.seedCalcGroups(tx, tenantID); err != nil {
			return fmt.Errorf("seed calc groups: %w", err)
		}
		if err := s.seedCappingRules(tx, tenantID); err != nil {
			return fmt.Errorf("seed capping rules: %w", err)
		}
		if err := s.seedCappingRuleGroups(tx, tenantID); err != nil {
			return fmt.Errorf("seed capping rule groups: %w", err)
		}
		if err := s.seedEmployeeCappingExceptions(tx, tenantID); err != nil {
			return fmt.Errorf("seed employee capping exceptions: %w", err)
		}
		return nil
	})
}

func (s *VacationConfigSeeder) seedSpecialCalcs(tx *gorm.DB, tenantID uuid.UUID) error {
	for _, sc := range auth.GetDevSpecialCalcs() {
		desc := sc.Desc
		record := &model.VacationSpecialCalculation{
			ID:          sc.ID,
			TenantID:    tenantID,
			Type:        model.VacationSpecialCalcType(sc.Type),
			Threshold:   sc.Threshold,
			BonusDays:   decimal.NewFromFloat(sc.BonusDays),
			Description: &desc,
			IsActive:    sc.IsActive,
		}
		if err := tx.Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "id"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"type", "threshold", "bonus_days", "description", "is_active", "updated_at",
			}),
		}).Create(record).Error; err != nil {
			return err
		}
	}
	return nil
}

func (s *VacationConfigSeeder) seedCalcGroups(tx *gorm.DB, tenantID uuid.UUID) error {
	for _, cg := range auth.GetDevCalcGroups() {
		desc := cg.Desc
		record := &model.VacationCalculationGroup{
			ID:          cg.ID,
			TenantID:    tenantID,
			Code:        cg.Code,
			Name:        cg.Name,
			Description: &desc,
			Basis:       model.VacationBasis(cg.Basis),
			IsActive:    cg.IsActive,
		}
		if err := tx.Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "id"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"code", "name", "description", "basis", "is_active", "updated_at",
			}),
		}).Create(record).Error; err != nil {
			return err
		}

		// Seed junction table: delete existing + insert fresh
		if err := tx.Where("group_id = ?", cg.ID).Delete(&model.VacationCalcGroupSpecialCalc{}).Error; err != nil {
			return err
		}
		for _, scID := range cg.SpecialCalcIDs {
			link := &model.VacationCalcGroupSpecialCalc{
				GroupID:              cg.ID,
				SpecialCalculationID: scID,
			}
			if err := tx.Create(link).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *VacationConfigSeeder) seedCappingRules(tx *gorm.DB, tenantID uuid.UUID) error {
	for _, cr := range auth.GetDevCappingRules() {
		desc := cr.Desc
		record := &model.VacationCappingRule{
			ID:          cr.ID,
			TenantID:    tenantID,
			Code:        cr.Code,
			Name:        cr.Name,
			Description: &desc,
			RuleType:    model.CappingRuleType(cr.RuleType),
			CutoffMonth: cr.CutoffMonth,
			CutoffDay:   cr.CutoffDay,
			CapValue:    decimal.NewFromFloat(cr.CapValue),
			IsActive:    cr.IsActive,
		}
		if err := tx.Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "id"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"code", "name", "description", "rule_type", "cutoff_month", "cutoff_day", "cap_value", "is_active", "updated_at",
			}),
		}).Create(record).Error; err != nil {
			return err
		}
	}
	return nil
}

func (s *VacationConfigSeeder) seedCappingRuleGroups(tx *gorm.DB, tenantID uuid.UUID) error {
	for _, crg := range auth.GetDevCappingRuleGroups() {
		desc := crg.Desc
		record := &model.VacationCappingRuleGroup{
			ID:          crg.ID,
			TenantID:    tenantID,
			Code:        crg.Code,
			Name:        crg.Name,
			Description: &desc,
			IsActive:    crg.IsActive,
		}
		if err := tx.Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "id"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"code", "name", "description", "is_active", "updated_at",
			}),
		}).Create(record).Error; err != nil {
			return err
		}

		// Seed junction table: delete existing + insert fresh
		if err := tx.Where("group_id = ?", crg.ID).Delete(&model.VacationCappingRuleGroupRule{}).Error; err != nil {
			return err
		}
		for _, ruleID := range crg.CappingRuleIDs {
			link := &model.VacationCappingRuleGroupRule{
				GroupID:       crg.ID,
				CappingRuleID: ruleID,
			}
			if err := tx.Create(link).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *VacationConfigSeeder) seedEmployeeCappingExceptions(tx *gorm.DB, tenantID uuid.UUID) error {
	for _, exc := range auth.GetDevEmployeeCappingExceptions() {
		var retainDays *decimal.Decimal
		if exc.RetainDays != nil {
			d := decimal.NewFromFloat(*exc.RetainDays)
			retainDays = &d
		}
		var notes *string
		if exc.Notes != "" {
			notes = &exc.Notes
		}
		record := &model.EmployeeCappingException{
			ID:            exc.ID,
			TenantID:      tenantID,
			EmployeeID:    exc.EmployeeID,
			CappingRuleID: exc.CappingRuleID,
			ExemptionType: model.ExemptionType(exc.ExemptionType),
			RetainDays:    retainDays,
			Year:          exc.Year,
			Notes:         notes,
			IsActive:      exc.IsActive,
		}
		if err := tx.Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "id"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"employee_id", "capping_rule_id", "exemption_type", "retain_days", "year", "notes", "is_active", "updated_at",
			}),
		}).Create(record).Error; err != nil {
			return err
		}
	}
	return nil
}
