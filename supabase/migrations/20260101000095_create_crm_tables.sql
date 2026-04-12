-- CRM Address Type enum
CREATE TYPE crm_address_type AS ENUM ('CUSTOMER', 'SUPPLIER', 'BOTH');

-- Number Sequences (shared across modules)
CREATE TABLE number_sequences (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key         VARCHAR(50) NOT NULL,
    prefix      VARCHAR(20) NOT NULL DEFAULT '',
    next_value  INT         NOT NULL DEFAULT 1,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_number_sequences_tenant_key UNIQUE (tenant_id, key)
);

CREATE INDEX idx_number_sequences_tenant_id ON number_sequences(tenant_id);

-- CRM Addresses
CREATE TABLE crm_addresses (
    id                UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID            NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    number            VARCHAR(50)     NOT NULL,
    type              crm_address_type NOT NULL DEFAULT 'CUSTOMER',
    company           VARCHAR(255)    NOT NULL,
    street            VARCHAR(255),
    zip               VARCHAR(20),
    city              VARCHAR(100),
    country           VARCHAR(10)     DEFAULT 'DE',
    phone             VARCHAR(50),
    fax               VARCHAR(50),
    email             VARCHAR(255),
    website           VARCHAR(255),
    tax_number        VARCHAR(50),
    vat_id            VARCHAR(50),
    match_code        VARCHAR(100),
    notes             TEXT,
    payment_term_days INT,
    discount_percent  DOUBLE PRECISION,
    discount_days     INT,
    discount_group    VARCHAR(50),
    price_list_id     UUID,
    is_active         BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by_id     UUID            REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT uq_crm_addresses_tenant_number UNIQUE (tenant_id, number)
);

CREATE INDEX idx_crm_addresses_tenant_id ON crm_addresses(tenant_id);
CREATE INDEX idx_crm_addresses_tenant_type ON crm_addresses(tenant_id, type);
CREATE INDEX idx_crm_addresses_tenant_match_code ON crm_addresses(tenant_id, match_code);
CREATE INDEX idx_crm_addresses_tenant_company ON crm_addresses(tenant_id, company);

-- CRM Contacts
CREATE TABLE crm_contacts (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    address_id  UUID        NOT NULL REFERENCES crm_addresses(id) ON DELETE CASCADE,
    first_name  VARCHAR(100) NOT NULL,
    last_name   VARCHAR(100) NOT NULL,
    position    VARCHAR(100),
    department  VARCHAR(100),
    phone       VARCHAR(50),
    email       VARCHAR(255),
    notes       TEXT,
    is_primary  BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_crm_contacts_address_id ON crm_contacts(address_id);
CREATE INDEX idx_crm_contacts_tenant_id ON crm_contacts(tenant_id);

-- CRM Bank Accounts
CREATE TABLE crm_bank_accounts (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    address_id      UUID        NOT NULL REFERENCES crm_addresses(id) ON DELETE CASCADE,
    iban            VARCHAR(34) NOT NULL,
    bic             VARCHAR(11),
    bank_name       VARCHAR(255),
    account_holder  VARCHAR(255),
    is_default      BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_crm_bank_accounts_address_id ON crm_bank_accounts(address_id);
CREATE INDEX idx_crm_bank_accounts_tenant_id ON crm_bank_accounts(tenant_id);
