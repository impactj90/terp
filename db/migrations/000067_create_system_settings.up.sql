-- =============================================================
-- Create system_settings table
-- ZMI-TICKET-023: System-wide settings per tenant
-- =============================================================
CREATE TABLE system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Options: Rounding
    rounding_relative_to_plan BOOLEAN NOT NULL DEFAULT false,

    -- Options: Error list
    error_list_enabled BOOLEAN NOT NULL DEFAULT true,
    tracked_error_codes TEXT[] DEFAULT '{}',

    -- Options: Auto-fill end bookings for order changes
    auto_fill_order_end_bookings BOOLEAN NOT NULL DEFAULT false,

    -- Program start: Birthday list
    birthday_window_days_before INT NOT NULL DEFAULT 7,
    birthday_window_days_after INT NOT NULL DEFAULT 7,

    -- Program start: Follow-up entries
    follow_up_entries_enabled BOOLEAN NOT NULL DEFAULT false,

    -- Proxy settings (deferred - schema only)
    proxy_host VARCHAR(255),
    proxy_port INT,
    proxy_username VARCHAR(255),
    proxy_password VARCHAR(255),
    proxy_enabled BOOLEAN NOT NULL DEFAULT false,

    -- Server Alive
    server_alive_enabled BOOLEAN NOT NULL DEFAULT false,
    server_alive_expected_completion_time INT,  -- minutes from midnight (e.g. 300 = 05:00)
    server_alive_threshold_minutes INT DEFAULT 30,
    server_alive_notify_admins BOOLEAN NOT NULL DEFAULT true,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One settings row per tenant
    UNIQUE(tenant_id)
);

CREATE INDEX idx_system_settings_tenant ON system_settings(tenant_id);

CREATE TRIGGER update_system_settings_updated_at
    BEFORE UPDATE ON system_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE system_settings IS 'System-wide settings per tenant. One row per tenant.';
COMMENT ON COLUMN system_settings.rounding_relative_to_plan IS 'When true, rounding grid anchors at planned start time instead of midnight (ZMI Section 7.8).';
COMMENT ON COLUMN system_settings.server_alive_expected_completion_time IS 'Expected daily calculation completion time in minutes from midnight.';
COMMENT ON COLUMN system_settings.server_alive_threshold_minutes IS 'Minutes past expected completion before alerting.';
