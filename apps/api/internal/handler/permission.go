package handler

import (
	"net/http"

	"github.com/go-openapi/strfmt"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/permissions"
)

type PermissionHandler struct{}

type permissionListResponse struct {
	Data []*models.Permission `json:"data"`
}

func NewPermissionHandler() *PermissionHandler {
	return &PermissionHandler{}
}

func (h *PermissionHandler) List(w http.ResponseWriter, _ *http.Request) {
	list := permissions.List()
	results := make([]*models.Permission, 0, len(list))
	for _, p := range list {
		id := strfmt.UUID(p.ID.String())
		resource := p.Resource
		action := p.Action
		desc := p.Description
		results = append(results, &models.Permission{
			ID:          &id,
			Resource:    &resource,
			Action:      &action,
			Description: &desc,
		})
	}

	respondJSON(w, http.StatusOK, &permissionListResponse{Data: results})
}
