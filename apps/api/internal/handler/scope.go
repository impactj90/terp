package handler

import (
	"context"

	"github.com/tolga/terp/internal/access"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
)

func scopeFromContext(ctx context.Context) (access.Scope, error) {
	checker, ok := middleware.PermissionCheckerFromContext(ctx)
	if !ok {
		return access.Scope{Type: model.DataScopeAll}, nil
	}
	return access.ScopeFromUser(checker.User())
}
