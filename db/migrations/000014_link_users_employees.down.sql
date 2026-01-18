ALTER TABLE team_members DROP CONSTRAINT IF EXISTS fk_team_members_employee;
ALTER TABLE teams DROP CONSTRAINT IF EXISTS fk_teams_leader;
ALTER TABLE departments DROP CONSTRAINT IF EXISTS fk_departments_manager;
ALTER TABLE users DROP CONSTRAINT IF EXISTS fk_users_employee;
