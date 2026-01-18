-- Add FK constraint for users.employee_id
ALTER TABLE users
    ADD CONSTRAINT fk_users_employee
    FOREIGN KEY (employee_id)
    REFERENCES employees(id)
    ON DELETE SET NULL;

-- Add FK for departments.manager_employee_id
ALTER TABLE departments
    ADD CONSTRAINT fk_departments_manager
    FOREIGN KEY (manager_employee_id)
    REFERENCES employees(id)
    ON DELETE SET NULL;

-- Add FK for teams.leader_employee_id
ALTER TABLE teams
    ADD CONSTRAINT fk_teams_leader
    FOREIGN KEY (leader_employee_id)
    REFERENCES employees(id)
    ON DELETE SET NULL;

-- Add FK for team_members.employee_id
ALTER TABLE team_members
    ADD CONSTRAINT fk_team_members_employee
    FOREIGN KEY (employee_id)
    REFERENCES employees(id)
    ON DELETE CASCADE;
