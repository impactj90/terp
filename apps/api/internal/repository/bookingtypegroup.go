package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var ErrBookingTypeGroupNotFound = errors.New("booking type group not found")

type BookingTypeGroupRepository struct {
	db *DB
}

func NewBookingTypeGroupRepository(db *DB) *BookingTypeGroupRepository {
	return &BookingTypeGroupRepository{db: db}
}

func (r *BookingTypeGroupRepository) Create(ctx context.Context, g *model.BookingTypeGroup) error {
	return r.db.GORM.WithContext(ctx).Create(g).Error
}

func (r *BookingTypeGroupRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.BookingTypeGroup, error) {
	var g model.BookingTypeGroup
	err := r.db.GORM.WithContext(ctx).First(&g, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrBookingTypeGroupNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get booking type group: %w", err)
	}
	return &g, nil
}

func (r *BookingTypeGroupRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.BookingTypeGroup, error) {
	var g model.BookingTypeGroup
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND code = ?", tenantID, code).
		First(&g).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrBookingTypeGroupNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get booking type group by code: %w", err)
	}
	return &g, nil
}

func (r *BookingTypeGroupRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.BookingTypeGroup, error) {
	var groups []model.BookingTypeGroup
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("code ASC").
		Find(&groups).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list booking type groups: %w", err)
	}
	return groups, nil
}

func (r *BookingTypeGroupRepository) Update(ctx context.Context, g *model.BookingTypeGroup) error {
	return r.db.GORM.WithContext(ctx).Save(g).Error
}

func (r *BookingTypeGroupRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.BookingTypeGroup{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete booking type group: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrBookingTypeGroupNotFound
	}
	return nil
}

// --- Group Members ---

func (r *BookingTypeGroupRepository) AddMember(ctx context.Context, member *model.BookingTypeGroupMember) error {
	return r.db.GORM.WithContext(ctx).Create(member).Error
}

func (r *BookingTypeGroupRepository) RemoveMember(ctx context.Context, groupID uuid.UUID, bookingTypeID uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).
		Delete(&model.BookingTypeGroupMember{}, "group_id = ? AND booking_type_id = ?", groupID, bookingTypeID)
	if result.Error != nil {
		return fmt.Errorf("failed to remove group member: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return fmt.Errorf("member not found in group")
	}
	return nil
}

func (r *BookingTypeGroupRepository) ListMembers(ctx context.Context, groupID uuid.UUID) ([]model.BookingTypeGroupMember, error) {
	var members []model.BookingTypeGroupMember
	err := r.db.GORM.WithContext(ctx).
		Where("group_id = ?", groupID).
		Order("sort_order ASC").
		Find(&members).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list group members: %w", err)
	}
	return members, nil
}

func (r *BookingTypeGroupRepository) ListMemberBookingTypes(ctx context.Context, groupID uuid.UUID) ([]model.BookingType, error) {
	var types []model.BookingType
	err := r.db.GORM.WithContext(ctx).
		Table("booking_types").
		Joins("INNER JOIN booking_type_group_members ON booking_type_group_members.booking_type_id = booking_types.id").
		Where("booking_type_group_members.group_id = ?", groupID).
		Order("booking_type_group_members.sort_order ASC").
		Find(&types).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list member booking types: %w", err)
	}
	return types, nil
}

func (r *BookingTypeGroupRepository) SetMembers(ctx context.Context, groupID uuid.UUID, members []model.BookingTypeGroupMember) error {
	// Delete existing members
	if err := r.db.GORM.WithContext(ctx).
		Delete(&model.BookingTypeGroupMember{}, "group_id = ?", groupID).Error; err != nil {
		return fmt.Errorf("failed to clear group members: %w", err)
	}
	// Insert new members
	if len(members) > 0 {
		for i := range members {
			members[i].GroupID = groupID
		}
		if err := r.db.GORM.WithContext(ctx).Create(&members).Error; err != nil {
			return fmt.Errorf("failed to set group members: %w", err)
		}
	}
	return nil
}
