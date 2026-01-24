package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrVacationBalanceNotFound = errors.New("vacation balance not found")
)

type VacationBalanceRepository struct {
	db *DB
}

func NewVacationBalanceRepository(db *DB) *VacationBalanceRepository {
	return &VacationBalanceRepository{db: db}
}

func (r *VacationBalanceRepository) Create(ctx context.Context, balance *model.VacationBalance) error {
	return r.db.GORM.WithContext(ctx).Create(balance).Error
}

func (r *VacationBalanceRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.VacationBalance, error) {
	var balance model.VacationBalance
	err := r.db.GORM.WithContext(ctx).
		First(&balance, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrVacationBalanceNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get vacation balance: %w", err)
	}
	return &balance, nil
}

func (r *VacationBalanceRepository) GetByEmployeeYear(ctx context.Context, employeeID uuid.UUID, year int) (*model.VacationBalance, error) {
	var balance model.VacationBalance
	err := r.db.GORM.WithContext(ctx).
		Where("employee_id = ? AND year = ?", employeeID, year).
		First(&balance).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get vacation balance by employee year: %w", err)
	}
	return &balance, nil
}

func (r *VacationBalanceRepository) Update(ctx context.Context, balance *model.VacationBalance) error {
	return r.db.GORM.WithContext(ctx).Save(balance).Error
}

func (r *VacationBalanceRepository) Upsert(ctx context.Context, balance *model.VacationBalance) error {
	return r.db.GORM.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "employee_id"}, {Name: "year"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"entitlement", "carryover", "adjustments", "taken", "updated_at",
			}),
		}).
		Create(balance).Error
}

func (r *VacationBalanceRepository) UpdateTaken(ctx context.Context, employeeID uuid.UUID, year int, taken decimal.Decimal) error {
	result := r.db.GORM.WithContext(ctx).
		Model(&model.VacationBalance{}).
		Where("employee_id = ? AND year = ?", employeeID, year).
		Update("taken", taken)

	if result.Error != nil {
		return fmt.Errorf("failed to update taken: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrVacationBalanceNotFound
	}
	return nil
}

func (r *VacationBalanceRepository) IncrementTaken(ctx context.Context, employeeID uuid.UUID, year int, amount decimal.Decimal) error {
	result := r.db.GORM.WithContext(ctx).
		Model(&model.VacationBalance{}).
		Where("employee_id = ? AND year = ?", employeeID, year).
		Update("taken", gorm.Expr("taken + ?", amount))

	if result.Error != nil {
		return fmt.Errorf("failed to increment taken: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrVacationBalanceNotFound
	}
	return nil
}

func (r *VacationBalanceRepository) ListByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.VacationBalance, error) {
	var balances []model.VacationBalance
	err := r.db.GORM.WithContext(ctx).
		Where("employee_id = ?", employeeID).
		Order("year ASC").
		Find(&balances).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list vacation balances: %w", err)
	}
	return balances, nil
}
