package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/handler"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
	"github.com/tolga/terp/internal/testutil"
)

func setupTeamHandler(t *testing.T) (*handler.TeamHandler, *service.TeamService, *model.Tenant, *repository.DB) {
	db := testutil.SetupTestDB(t)
	teamRepo := repository.NewTeamRepository(db)
	tenantRepo := repository.NewTenantRepository(db)
	svc := service.NewTeamService(teamRepo)
	h := handler.NewTeamHandler(svc)

	// Create test tenant
	tenant := &model.Tenant{
		Name:     "Test Tenant " + uuid.New().String()[:8],
		Slug:     "test-" + uuid.New().String()[:8],
		IsActive: true,
	}
	err := tenantRepo.Create(context.Background(), tenant)
	require.NoError(t, err)

	return h, svc, tenant, db
}

func createTestEmployeeForTeamHandler(t *testing.T, db *repository.DB, tenantID uuid.UUID) *model.Employee {
	t.Helper()
	empRepo := repository.NewEmployeeRepository(db)
	emp := &model.Employee{
		TenantID:        tenantID,
		PersonnelNumber: "EMP-" + uuid.New().String()[:8],
		PIN:             uuid.New().String()[:6],
		FirstName:       "Test",
		LastName:        "Employee",
		IsActive:        true,
	}
	require.NoError(t, empRepo.Create(context.Background(), emp))
	return emp
}

func withTeamTenantContext(r *http.Request, tenant *model.Tenant) *http.Request {
	ctx := context.WithValue(r.Context(), middleware.TenantContextKey, tenant.ID)
	return r.WithContext(ctx)
}

func TestTeamHandler_Create_Success(t *testing.T) {
	h, _, tenant, _ := setupTeamHandler(t)

	body := `{"name": "Backend Team", "description": "Handles backend development"}`
	req := httptest.NewRequest("POST", "/teams", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withTeamTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result model.Team
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "Backend Team", result.Name)
	assert.Equal(t, "Handles backend development", result.Description)
	assert.Equal(t, tenant.ID, result.TenantID)
	assert.True(t, result.IsActive)
}

func TestTeamHandler_Create_DefaultActive(t *testing.T) {
	h, _, tenant, _ := setupTeamHandler(t)

	body := `{"name": "Backend Team"}`
	req := httptest.NewRequest("POST", "/teams", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withTeamTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result model.Team
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.True(t, result.IsActive)
}

func TestTeamHandler_Create_InvalidBody(t *testing.T) {
	h, _, tenant, _ := setupTeamHandler(t)

	req := httptest.NewRequest("POST", "/teams", bytes.NewBufferString("invalid"))
	req = withTeamTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTeamHandler_Create_EmptyName(t *testing.T) {
	h, _, tenant, _ := setupTeamHandler(t)

	body := `{"name": ""}`
	req := httptest.NewRequest("POST", "/teams", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withTeamTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTeamHandler_Create_NoTenant(t *testing.T) {
	h, _, _, _ := setupTeamHandler(t)

	body := `{"name": "Backend Team"}`
	req := httptest.NewRequest("POST", "/teams", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestTeamHandler_Create_DuplicateName(t *testing.T) {
	h, svc, tenant, _ := setupTeamHandler(t)
	ctx := context.Background()

	// Create first team
	input := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Backend Team",
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Try to create duplicate
	body := `{"name": "Backend Team"}`
	req := httptest.NewRequest("POST", "/teams", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withTeamTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTeamHandler_Get_Success(t *testing.T) {
	h, svc, tenant, _ := setupTeamHandler(t)
	ctx := context.Background()

	input := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Backend Team",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/teams/"+created.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.Team
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, created.ID, result.ID)
	assert.Equal(t, "Backend Team", result.Name)
}

func TestTeamHandler_Get_InvalidID(t *testing.T) {
	h, _, _, _ := setupTeamHandler(t)

	req := httptest.NewRequest("GET", "/teams/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTeamHandler_Get_NotFound(t *testing.T) {
	h, _, _, _ := setupTeamHandler(t)

	req := httptest.NewRequest("GET", "/teams/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestTeamHandler_List_All(t *testing.T) {
	h, svc, tenant, _ := setupTeamHandler(t)
	ctx := context.Background()

	// Create teams
	for _, name := range []string{"Alpha Team", "Beta Team"} {
		input := service.CreateTeamInput{
			TenantID: tenant.ID,
			Name:     name,
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	req := httptest.NewRequest("GET", "/teams", nil)
	req = withTeamTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result handler.TeamList
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Len(t, result.Items, 2)
}

func TestTeamHandler_List_IsActive(t *testing.T) {
	h, svc, tenant, _ := setupTeamHandler(t)
	ctx := context.Background()

	// Create active team
	input1 := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Active Team",
	}
	active, err := svc.Create(ctx, input1)
	require.NoError(t, err)

	// Create and deactivate a team
	input2 := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Inactive Team",
	}
	inactive, err := svc.Create(ctx, input2)
	require.NoError(t, err)

	isActive := false
	_, err = svc.Update(ctx, inactive.ID, service.UpdateTeamInput{IsActive: &isActive})
	require.NoError(t, err)

	// Use is_active query param per OpenAPI spec
	req := httptest.NewRequest("GET", "/teams?is_active=true", nil)
	req = withTeamTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result handler.TeamList
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Len(t, result.Items, 1)
	assert.Equal(t, active.Name, result.Items[0].Name)
}

func TestTeamHandler_List_NoTenant(t *testing.T) {
	h, _, _, _ := setupTeamHandler(t)

	req := httptest.NewRequest("GET", "/teams", nil)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestTeamHandler_Update_Success(t *testing.T) {
	h, svc, tenant, _ := setupTeamHandler(t)
	ctx := context.Background()

	input := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Original",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	body := `{"name": "Updated", "is_active": false}`
	req := httptest.NewRequest("PUT", "/teams/"+created.ID.String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.Team
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "Updated", result.Name)
	assert.False(t, result.IsActive)
}

func TestTeamHandler_Update_InvalidID(t *testing.T) {
	h, _, _, _ := setupTeamHandler(t)

	body := `{"name": "Updated"}`
	req := httptest.NewRequest("PUT", "/teams/invalid", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTeamHandler_Update_NotFound(t *testing.T) {
	h, _, _, _ := setupTeamHandler(t)

	body := `{"name": "Updated"}`
	req := httptest.NewRequest("PUT", "/teams/00000000-0000-0000-0000-000000000000", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestTeamHandler_Update_InvalidBody(t *testing.T) {
	h, svc, tenant, _ := setupTeamHandler(t)
	ctx := context.Background()

	input := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Backend Team",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("PUT", "/teams/"+created.ID.String(), bytes.NewBufferString("invalid"))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTeamHandler_Update_DuplicateName(t *testing.T) {
	h, svc, tenant, _ := setupTeamHandler(t)
	ctx := context.Background()

	// Create first team
	input1 := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Backend Team",
	}
	_, err := svc.Create(ctx, input1)
	require.NoError(t, err)

	// Create second team
	input2 := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Frontend Team",
	}
	created2, err := svc.Create(ctx, input2)
	require.NoError(t, err)

	// Try to update second with first's name
	body := `{"name": "Backend Team"}`
	req := httptest.NewRequest("PUT", "/teams/"+created2.ID.String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created2.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTeamHandler_Delete_Success(t *testing.T) {
	h, svc, tenant, _ := setupTeamHandler(t)
	ctx := context.Background()

	input := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "To Delete",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("DELETE", "/teams/"+created.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusNoContent, rr.Code)

	// Verify deleted
	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrTeamNotFound)
}

func TestTeamHandler_Delete_InvalidID(t *testing.T) {
	h, _, _, _ := setupTeamHandler(t)

	req := httptest.NewRequest("DELETE", "/teams/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTeamHandler_Delete_NotFound(t *testing.T) {
	h, _, _, _ := setupTeamHandler(t)

	req := httptest.NewRequest("DELETE", "/teams/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestTeamHandler_GetMembers_Success(t *testing.T) {
	h, svc, tenant, db := setupTeamHandler(t)
	ctx := context.Background()

	input := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Backend Team",
	}
	team, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Create employees and add as members
	emp1 := createTestEmployeeForTeamHandler(t, db, tenant.ID)
	emp2 := createTestEmployeeForTeamHandler(t, db, tenant.ID)
	_, err = svc.AddMember(ctx, team.ID, emp1.ID, model.TeamMemberRoleMember)
	require.NoError(t, err)
	_, err = svc.AddMember(ctx, team.ID, emp2.ID, model.TeamMemberRoleLead)
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/teams/"+team.ID.String()+"/members", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", team.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.GetMembers(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result handler.TeamMemberList
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Len(t, result.Items, 2)
}

func TestTeamHandler_GetMembers_TeamNotFound(t *testing.T) {
	h, _, _, _ := setupTeamHandler(t)

	req := httptest.NewRequest("GET", "/teams/00000000-0000-0000-0000-000000000000/members", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.GetMembers(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestTeamHandler_AddMember_Success(t *testing.T) {
	h, svc, tenant, db := setupTeamHandler(t)
	ctx := context.Background()

	input := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Backend Team",
	}
	team, err := svc.Create(ctx, input)
	require.NoError(t, err)

	emp := createTestEmployeeForTeamHandler(t, db, tenant.ID)
	body := `{"employee_id": "` + emp.ID.String() + `", "role": "member"}`
	req := httptest.NewRequest("POST", "/teams/"+team.ID.String()+"/members", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", team.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.AddMember(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)

	// Verify response body contains TeamMember
	var result model.TeamMember
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, team.ID, result.TeamID)
	assert.Equal(t, emp.ID, result.EmployeeID)
	assert.Equal(t, model.TeamMemberRoleMember, result.Role)

	// Verify member was added
	members, err := svc.GetMembers(ctx, team.ID)
	require.NoError(t, err)
	assert.Len(t, members, 1)
}

func TestTeamHandler_AddMember_DefaultRole(t *testing.T) {
	h, svc, tenant, db := setupTeamHandler(t)
	ctx := context.Background()

	input := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Backend Team",
	}
	team, err := svc.Create(ctx, input)
	require.NoError(t, err)

	emp := createTestEmployeeForTeamHandler(t, db, tenant.ID)
	body := `{"employee_id": "` + emp.ID.String() + `"}`
	req := httptest.NewRequest("POST", "/teams/"+team.ID.String()+"/members", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", team.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.AddMember(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)

	// Verify default role
	members, err := svc.GetMembers(ctx, team.ID)
	require.NoError(t, err)
	assert.Equal(t, model.TeamMemberRoleMember, members[0].Role)
}

func TestTeamHandler_AddMember_InvalidRole(t *testing.T) {
	h, svc, tenant, _ := setupTeamHandler(t)
	ctx := context.Background()

	input := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Backend Team",
	}
	team, err := svc.Create(ctx, input)
	require.NoError(t, err)

	empID := uuid.New()
	body := `{"employee_id": "` + empID.String() + `", "role": "invalid"}`
	req := httptest.NewRequest("POST", "/teams/"+team.ID.String()+"/members", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", team.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.AddMember(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTeamHandler_AddMember_TeamNotFound(t *testing.T) {
	h, _, _, _ := setupTeamHandler(t)

	empID := uuid.New()
	body := `{"employee_id": "` + empID.String() + `", "role": "member"}`
	req := httptest.NewRequest("POST", "/teams/00000000-0000-0000-0000-000000000000/members", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.AddMember(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestTeamHandler_AddMember_AlreadyMember(t *testing.T) {
	h, svc, tenant, db := setupTeamHandler(t)
	ctx := context.Background()

	input := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Backend Team",
	}
	team, err := svc.Create(ctx, input)
	require.NoError(t, err)

	emp := createTestEmployeeForTeamHandler(t, db, tenant.ID)
	_, err = svc.AddMember(ctx, team.ID, emp.ID, model.TeamMemberRoleMember)
	require.NoError(t, err)

	// Try to add same member again
	body := `{"employee_id": "` + emp.ID.String() + `", "role": "lead"}`
	req := httptest.NewRequest("POST", "/teams/"+team.ID.String()+"/members", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", team.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.AddMember(rr, req)

	// OpenAPI spec defines 409 Conflict for member already in team
	assert.Equal(t, http.StatusConflict, rr.Code)
}

func TestTeamHandler_RemoveMember_Success(t *testing.T) {
	h, svc, tenant, db := setupTeamHandler(t)
	ctx := context.Background()

	input := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Backend Team",
	}
	team, err := svc.Create(ctx, input)
	require.NoError(t, err)

	emp := createTestEmployeeForTeamHandler(t, db, tenant.ID)
	_, err = svc.AddMember(ctx, team.ID, emp.ID, model.TeamMemberRoleMember)
	require.NoError(t, err)

	req := httptest.NewRequest("DELETE", "/teams/"+team.ID.String()+"/members/"+emp.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", team.ID.String())
	rctx.URLParams.Add("employee_id", emp.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.RemoveMember(rr, req)

	assert.Equal(t, http.StatusNoContent, rr.Code)

	// Verify member was removed
	members, err := svc.GetMembers(ctx, team.ID)
	require.NoError(t, err)
	assert.Empty(t, members)
}

func TestTeamHandler_RemoveMember_TeamNotFound(t *testing.T) {
	h, _, _, _ := setupTeamHandler(t)

	empID := uuid.New()
	req := httptest.NewRequest("DELETE", "/teams/00000000-0000-0000-0000-000000000000/members/"+empID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	rctx.URLParams.Add("employee_id", empID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.RemoveMember(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestTeamHandler_RemoveMember_MemberNotFound(t *testing.T) {
	h, svc, tenant, _ := setupTeamHandler(t)
	ctx := context.Background()

	input := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Backend Team",
	}
	team, err := svc.Create(ctx, input)
	require.NoError(t, err)

	empID := uuid.New()
	req := httptest.NewRequest("DELETE", "/teams/"+team.ID.String()+"/members/"+empID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", team.ID.String())
	rctx.URLParams.Add("employee_id", empID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.RemoveMember(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestTeamHandler_UpdateMemberRole_Success(t *testing.T) {
	h, svc, tenant, db := setupTeamHandler(t)
	ctx := context.Background()

	input := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Backend Team",
	}
	team, err := svc.Create(ctx, input)
	require.NoError(t, err)

	emp := createTestEmployeeForTeamHandler(t, db, tenant.ID)
	_, err = svc.AddMember(ctx, team.ID, emp.ID, model.TeamMemberRoleMember)
	require.NoError(t, err)

	body := `{"role": "lead"}`
	req := httptest.NewRequest("PUT", "/teams/"+team.ID.String()+"/members/"+emp.ID.String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", team.ID.String())
	rctx.URLParams.Add("employee_id", emp.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.UpdateMemberRole(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	// Verify response body contains updated TeamMember
	var result model.TeamMember
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, team.ID, result.TeamID)
	assert.Equal(t, emp.ID, result.EmployeeID)
	assert.Equal(t, model.TeamMemberRoleLead, result.Role)

	// Verify role was updated
	members, err := svc.GetMembers(ctx, team.ID)
	require.NoError(t, err)
	assert.Equal(t, model.TeamMemberRoleLead, members[0].Role)
}

func TestTeamHandler_UpdateMemberRole_InvalidRole(t *testing.T) {
	h, svc, tenant, db := setupTeamHandler(t)
	ctx := context.Background()

	input := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Backend Team",
	}
	team, err := svc.Create(ctx, input)
	require.NoError(t, err)

	emp := createTestEmployeeForTeamHandler(t, db, tenant.ID)
	_, err = svc.AddMember(ctx, team.ID, emp.ID, model.TeamMemberRoleMember)
	require.NoError(t, err)

	body := `{"role": "invalid"}`
	req := httptest.NewRequest("PUT", "/teams/"+team.ID.String()+"/members/"+emp.ID.String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", team.ID.String())
	rctx.URLParams.Add("employee_id", emp.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.UpdateMemberRole(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTeamHandler_Get_WithIncludeMembers(t *testing.T) {
	h, svc, tenant, db := setupTeamHandler(t)
	ctx := context.Background()

	input := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Backend Team",
	}
	team, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Create employees and add as members
	emp1 := createTestEmployeeForTeamHandler(t, db, tenant.ID)
	emp2 := createTestEmployeeForTeamHandler(t, db, tenant.ID)
	_, err = svc.AddMember(ctx, team.ID, emp1.ID, model.TeamMemberRoleMember)
	require.NoError(t, err)
	_, err = svc.AddMember(ctx, team.ID, emp2.ID, model.TeamMemberRoleLead)
	require.NoError(t, err)

	// Use include_members query param per OpenAPI spec
	req := httptest.NewRequest("GET", "/teams/"+team.ID.String()+"?include_members=true", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", team.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.Team
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, team.ID, result.ID)
	assert.Len(t, result.Members, 2)
}

func TestTeamHandler_GetEmployeeTeams_Success(t *testing.T) {
	h, svc, tenant, db := setupTeamHandler(t)
	ctx := context.Background()

	// Create teams
	team1, err := svc.Create(ctx, service.CreateTeamInput{TenantID: tenant.ID, Name: "Backend Team"})
	require.NoError(t, err)
	team2, err := svc.Create(ctx, service.CreateTeamInput{TenantID: tenant.ID, Name: "DevOps Team"})
	require.NoError(t, err)

	// Create employee and add to both teams
	emp := createTestEmployeeForTeamHandler(t, db, tenant.ID)
	_, err = svc.AddMember(ctx, team1.ID, emp.ID, model.TeamMemberRoleMember)
	require.NoError(t, err)
	_, err = svc.AddMember(ctx, team2.ID, emp.ID, model.TeamMemberRoleLead)
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/employees/"+emp.ID.String()+"/teams", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("employee_id", emp.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.GetEmployeeTeams(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result handler.TeamList
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Len(t, result.Items, 2)
}

func TestTeamHandler_GetEmployeeTeams_Empty(t *testing.T) {
	h, _, _, _ := setupTeamHandler(t)

	empID := uuid.New()
	req := httptest.NewRequest("GET", "/employees/"+empID.String()+"/teams", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("employee_id", empID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.GetEmployeeTeams(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result handler.TeamList
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Empty(t, result.Items)
}

func TestTeamHandler_GetEmployeeTeams_InvalidID(t *testing.T) {
	h, _, _, _ := setupTeamHandler(t)

	req := httptest.NewRequest("GET", "/employees/invalid/teams", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("employee_id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.GetEmployeeTeams(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}
