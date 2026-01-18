package testutil

import (
	"os"
	"sync"
	"testing"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/tolga/terp/internal/repository"
)

var (
	sharedDB   *gorm.DB
	setupOnce  sync.Once
	setupError error
)

// getSharedDB returns a shared database connection, initializing it once.
func getSharedDB() (*gorm.DB, error) {
	setupOnce.Do(func() {
		databaseURL := os.Getenv("TEST_DATABASE_URL")
		if databaseURL == "" {
			databaseURL = "postgres://dev:dev@localhost:5432/terp?sslmode=disable"
		}

		sharedDB, setupError = gorm.Open(postgres.Open(databaseURL), &gorm.Config{
			Logger: logger.Default.LogMode(logger.Silent),
		})
		if setupError != nil {
			return
		}

		// Clean database once at startup
		sharedDB.Exec("TRUNCATE TABLE day_plan_bonuses, day_plan_breaks, day_plans, accounts, cost_centers, holidays, user_groups, tenants CASCADE")
	})
	return sharedDB, setupError
}

// SetupTestDB creates a test database connection with transaction-based isolation.
// Each test runs in its own transaction that gets rolled back after the test.
func SetupTestDB(t *testing.T) *repository.DB {
	t.Helper()

	baseDB, err := getSharedDB()
	if err != nil {
		t.Fatalf("failed to connect to test database: %v", err)
	}

	// Start a transaction for this test
	tx := baseDB.Begin()
	if tx.Error != nil {
		t.Fatalf("failed to begin transaction: %v", tx.Error)
	}

	db := &repository.DB{GORM: tx}

	t.Cleanup(func() {
		// Rollback the transaction to clean up test data
		tx.Rollback()
	})

	return db
}
