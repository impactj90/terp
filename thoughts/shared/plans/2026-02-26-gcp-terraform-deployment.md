# GCP Terraform Deployment - Implementation Plan

## Context

The terp project (Go API + Next.js frontend) has no infrastructure-as-code. It needs a Terraform-based GCP deployment supporting staging and production environments. The noktasol project provides a proven reference architecture for a similar stack (Cloud Run + Cloud SQL). This plan adapts that architecture for terp with proper environment separation.

**Decisions:**
- Single GCP project, environments separated by naming
- Separate `.tfvars` files (staging.tfvars / production.tfvars)
- Cloud Run for both API and Web
- Manual deployment via Makefile first, CI/CD later

## What We're NOT Doing

- CI/CD pipelines (GitHub Actions / Cloud Build) — add later
- Cloud CDN — not needed initially
- Storage buckets (app_data, photos, backups) — add when needed
- Custom domain / managed SSL — configure after initial deploy works
- Automatic database migration on deploy — manual via Cloud SQL proxy

---

## Phase 1: Prerequisites & Web Dockerfile

### Overview
Prepare the web app for containerization and document the manual GCP setup steps.

### Changes Required:

#### 1. Next.js standalone output
**File**: `apps/web/next.config.ts`
**Change**: Add `output: "standalone"` to the Next.js config

```typescript
const nextConfig: NextConfig = {
  output: "standalone",
}
```

Note: The file uses `next-intl` plugin wrapper (`withNextIntl`), keep that intact.

#### 2. Web production Dockerfile
**File**: `docker/web.Dockerfile` (new)

Build context is `apps/web/` (pnpm-lock.yaml lives there, not at repo root).

```dockerfile
FROM node:22-alpine AS base
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
```

**Note**: `NEXT_PUBLIC_API_URL` must be a build arg because Next.js inlines `NEXT_PUBLIC_*` vars at build time. Build context is `apps/web/`, not repo root.

#### 3. Manual GCP prerequisites (documented in README, not automated)

Before Terraform runs, these must exist:
```bash
# 1. Create GCS bucket for Terraform state
gcloud storage buckets create gs://<PROJECT_ID>-terraform-state \
  --location=europe-west3 --uniform-bucket-level-access

# 2. Enable required GCP APIs
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  compute.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  servicenetworking.googleapis.com \
  monitoring.googleapis.com \
  cloudresourcemanager.googleapis.com

# 3. Install Cloud SQL Auth Proxy (for migrations)
# https://cloud.google.com/sql/docs/postgres/sql-proxy
```

### Success Criteria:

#### Automated Verification:
- [ ] `cd apps/web && pnpm build` succeeds with standalone output
- [ ] `docker build -f docker/web.Dockerfile -t terp-web:test --build-arg NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1 apps/web` succeeds (run from repo root)
- [ ] `.next/standalone/` directory is created during build

#### Manual Verification:
- [ ] GCS state bucket created
- [ ] GCP APIs enabled

---

## Phase 2: Terraform Foundation

### Overview
Create the core Terraform files: provider config, variables, networking (VPC + connector), and state backend.

### Changes Required:

#### 1. Terraform gitignore
**File**: `terraform/.gitignore` (new)

```
*.tfstate
*.tfstate.backup
.terraform/
.terraform.lock.hcl
*.tfvars
!*.tfvars.example
```

#### 2. Provider configuration
**File**: `terraform/providers.tf` (new)

```hcl
terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.4"
    }
  }

  backend "gcs" {
    # bucket and prefix set via -backend-config at init time
    # terraform init -backend-config="bucket=<PROJECT_ID>-terraform-state" -backend-config="prefix=terp/staging"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}
```

**Key**: Backend bucket/prefix are set at `terraform init` time, not in tfvars. This allows the same .tf files to work for both environments with completely separate state.

#### 3. Variables
**File**: `terraform/variables.tf` (new)

```hcl
# Project
variable "project_id" { type = string }
variable "region" { default = "europe-west3" }
variable "zone" { default = "europe-west3-a" }
variable "environment" { type = string } # "staging" or "production"

# Cloud Run - API
variable "api_min_instances" { default = 0 }
variable "api_max_instances" { default = 2 }
variable "api_cpu" { default = "1000m" }
variable "api_memory" { default = "512Mi" }

# Cloud Run - Web
variable "web_min_instances" { default = 0 }
variable "web_max_instances" { default = 2 }
variable "web_cpu" { default = "1000m" }
variable "web_memory" { default = "512Mi" }

# Database
variable "db_tier" { default = "db-f1-micro" }
variable "db_disk_size" { default = 10 }
variable "db_deletion_protection" { default = false }
variable "db_backup_count" { default = 3 }

# Application
variable "log_level" { default = "debug" }
variable "jwt_expiry" { default = "24h" }
variable "api_base_url" { type = string }      # e.g. https://api-staging.terp.de
variable "frontend_url" { type = string }       # e.g. https://staging.terp.de
variable "api_image_tag" { default = "latest" }
variable "web_image_tag" { default = "latest" }
```

#### 4. Data sources
**File**: `terraform/data.tf` (new)

```hcl
data "google_project" "project" {}
data "google_client_config" "current" {}
```

#### 5. Networking (VPC + connector + peering)
**File**: `terraform/networking.tf` (new)

```hcl
# Default VPC data source
data "google_compute_network" "default" {
  name = "default"
}

# Reserved IP range for Cloud SQL private access
resource "google_compute_global_address" "private_ip_range" {
  name          = "terp-${var.environment}-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = data.google_compute_network.default.id
}

# VPC peering connection for Cloud SQL
resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = data.google_compute_network.default.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_range.name]
}

# Serverless VPC connector for Cloud Run → Cloud SQL
resource "google_vpc_access_connector" "connector" {
  name          = "terp-${var.environment}-vpc"
  region        = var.region
  ip_cidr_range = var.environment == "staging" ? "10.8.0.0/28" : "10.9.0.0/28"
  network       = data.google_compute_network.default.name
  machine_type  = "e2-micro"
  min_instances = 2
  max_instances = 3
}
```

#### 6. Example tfvars
**File**: `terraform/terraform.tfvars.example` (new)

```hcl
# Copy to staging.tfvars or production.tfvars and fill in values
project_id    = "your-gcp-project-id"
environment   = "staging"  # or "production"
api_base_url  = "https://api-staging.terp.example.com"
frontend_url  = "https://staging.terp.example.com"

# Staging defaults (uncomment for production overrides)
# api_min_instances      = 1
# api_max_instances      = 5
# api_memory             = "2Gi"
# web_min_instances      = 1
# web_max_instances      = 5
# db_tier                = "db-custom-1-3840"
# db_disk_size           = 20
# db_deletion_protection = true
# db_backup_count        = 7
# log_level              = "info"
```

### Success Criteria:

#### Automated Verification:
- [ ] `cd terraform && terraform init -backend-config="bucket=<PROJECT_ID>-terraform-state" -backend-config="prefix=terp/staging"` succeeds
- [ ] `terraform validate` passes
- [ ] `terraform plan -var-file=staging.tfvars` shows expected resources

---

## Phase 3: Database & Secrets

### Overview
Cloud SQL PostgreSQL 16 with private IP, auto-generated passwords stored in Secret Manager.

### Changes Required:

#### 1. Database
**File**: `terraform/database.tf` (new)

```hcl
resource "random_password" "db_password" {
  length  = 32
  special = false
}

resource "google_sql_database_instance" "postgres" {
  name             = "terp-${var.environment}-db"
  database_version = "POSTGRES_16"
  region           = var.region

  deletion_protection = var.db_deletion_protection

  depends_on = [google_service_networking_connection.private_vpc_connection]

  settings {
    tier              = var.db_tier
    availability_type = "ZONAL"
    disk_type         = "PD_SSD"
    disk_size         = var.db_disk_size
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = data.google_compute_network.default.id
      enable_private_path_for_google_cloud_services = true
    }

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      point_in_time_recovery_enabled = false
      backup_retention_settings {
        retained_backups = var.db_backup_count
      }
    }

    maintenance_window {
      day  = 7 # Sunday
      hour = 4
    }

    database_flags {
      name  = "max_connections"
      value = "100"
    }

    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = true
    }
  }
}

resource "google_sql_database" "terp" {
  name     = "terp_${var.environment}"
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "terp" {
  name     = "terp"
  instance = google_sql_database_instance.postgres.name
  password = random_password.db_password.result
}
```

#### 2. Secrets
**File**: `terraform/secrets.tf` (new)

```hcl
# Database password secret
resource "google_secret_manager_secret" "db_password" {
  secret_id = "terp-${var.environment}-db-password"
  replication { auto {} }
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = random_password.db_password.result
}

# JWT secret (auto-generated)
resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

resource "google_secret_manager_secret" "jwt_secret" {
  secret_id = "terp-${var.environment}-jwt-secret"
  replication { auto {} }
}

resource "google_secret_manager_secret_version" "jwt_secret" {
  secret      = google_secret_manager_secret.jwt_secret.id
  secret_data = random_password.jwt_secret.result
}

# IAM: Allow Cloud Run service account to access secrets
resource "google_secret_manager_secret_iam_member" "db_password_access" {
  secret_id = google_secret_manager_secret.db_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloudrun.email}"
}

resource "google_secret_manager_secret_iam_member" "jwt_secret_access" {
  secret_id = google_secret_manager_secret.jwt_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloudrun.email}"
}
```

### Success Criteria:

#### Automated Verification:
- [ ] `terraform plan -var-file=staging.tfvars` shows Cloud SQL + Secret Manager resources
- [ ] `terraform apply -var-file=staging.tfvars` creates DB instance (takes ~10 min)
- [ ] Cloud SQL instance visible in GCP console with private IP

#### Manual Verification:
- [ ] Connect via Cloud SQL Auth Proxy: `cloud-sql-proxy <INSTANCE_CONNECTION_NAME>`
- [ ] `psql -h 127.0.0.1 -U terp -d terp_staging` connects successfully

---

## Phase 4: API Deployment to Cloud Run

### Overview
Artifact Registry for Docker images, dedicated service account, Cloud Run v2 service for the Go API.

### Changes Required:

#### 1. Storage (Artifact Registry)
**File**: `terraform/storage.tf` (new)

```hcl
resource "google_artifact_registry_repository" "docker" {
  location      = var.region
  repository_id = "terp-docker"
  format        = "DOCKER"
  description   = "Docker images for terp ${var.environment}"
}
```

**Note**: Artifact Registry is shared across environments (same images, different tags).

#### 2. Cloud Run API service
**File**: `terraform/cloud-run-api.tf` (new)

```hcl
# Service account for Cloud Run
resource "google_service_account" "cloudrun" {
  account_id   = "terp-${var.environment}-cloudrun"
  display_name = "Terp ${var.environment} Cloud Run SA"
}

# IAM roles for service account
resource "google_project_iam_member" "cloudrun_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloudrun.email}"
}

resource "google_project_iam_member" "cloudrun_registry" {
  project = var.project_id
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${google_service_account.cloudrun.email}"
}

locals {
  api_image = "${var.region}-docker.pkg.dev/${var.project_id}/terp-docker/api:${var.api_image_tag}"
  db_url    = "postgres://terp:${random_password.db_password.result}@${google_sql_database_instance.postgres.private_ip_address}:5432/terp_${var.environment}?sslmode=disable"
}

resource "google_cloud_run_v2_service" "api" {
  name     = "terp-${var.environment}-api"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.cloudrun.email

    scaling {
      min_instance_count = var.api_min_instances
      max_instance_count = var.api_max_instances
    }

    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = local.api_image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = var.api_cpu
          memory = var.api_memory
        }
      }

      # Plain env vars
      env { name = "ENV";          value = var.environment == "production" ? "production" : "development" }
      env { name = "PORT";         value = "8080" }
      env { name = "DATABASE_URL"; value = local.db_url }
      env { name = "JWT_EXPIRY";   value = var.jwt_expiry }
      env { name = "LOG_LEVEL";    value = var.log_level }
      env { name = "BASE_URL";     value = var.api_base_url }
      env { name = "FRONTEND_URL"; value = var.frontend_url }

      # Secret env vars
      env {
        name = "JWT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.jwt_secret.secret_id
            version = "latest"
          }
        }
      }

      startup_probe {
        tcp_socket { port = 8080 }
        initial_delay_seconds = 5
        timeout_seconds       = 3
        period_seconds        = 10
        failure_threshold     = 10
      }
    }

    execution_environment = "EXECUTION_ENVIRONMENT_GEN2"
    max_instance_request_concurrency = 80
    timeout = "300s"
  }

  depends_on = [
    google_secret_manager_secret_version.jwt_secret,
    google_sql_database.terp,
  ]
}

# Public access (unauthenticated)
resource "google_cloud_run_v2_service_iam_member" "api_public" {
  name     = google_cloud_run_v2_service.api.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}
```

#### 3. Makefile deploy targets
**File**: `Makefile` (append)

```makefile
# === Deployment ===
REGION := europe-west3
REGISTRY := $(REGION)-docker.pkg.dev/$(GCP_PROJECT)/terp-docker

deploy-infra: ## Deploy infrastructure (ENV=staging|production required)
	@test -n "$(ENV)" || (echo "ENV required: make deploy-infra ENV=staging" && exit 1)
	cd terraform && terraform init \
		-backend-config="bucket=$(GCP_PROJECT)-terraform-state" \
		-backend-config="prefix=terp/$(ENV)" && \
	terraform apply -var-file=$(ENV).tfvars

deploy-api: ## Build and deploy API (ENV=staging|production required)
	@test -n "$(ENV)" || (echo "ENV required: make deploy-api ENV=staging" && exit 1)
	docker build -f docker/api.Dockerfile -t $(REGISTRY)/api:$(ENV) .
	docker push $(REGISTRY)/api:$(ENV)
	gcloud run deploy terp-$(ENV)-api \
		--image=$(REGISTRY)/api:$(ENV) \
		--region=$(REGION)

deploy-web: ## Build and deploy Web (ENV=staging|production required)
	@test -n "$(ENV)" || (echo "ENV required: make deploy-web ENV=staging" && exit 1)
	$(eval API_URL := $(shell cd terraform && terraform output -raw api_url))
	docker build -f docker/web.Dockerfile \
		--build-arg NEXT_PUBLIC_API_URL=$(API_URL)/api/v1 \
		-t $(REGISTRY)/web:$(ENV) apps/web
	docker push $(REGISTRY)/web:$(ENV)
	gcloud run deploy terp-$(ENV)-web \
		--image=$(REGISTRY)/web:$(ENV) \
		--region=$(REGION)

deploy-all: deploy-infra deploy-api deploy-web ## Deploy everything

migrate-cloud: ## Run migrations against Cloud SQL (ENV=staging|production required)
	@test -n "$(ENV)" || (echo "ENV required: make migrate-cloud ENV=staging" && exit 1)
	@echo "Start Cloud SQL proxy in another terminal first:"
	@echo "  cloud-sql-proxy $(shell cd terraform && terraform output -raw db_connection_name)"
	migrate -path db/migrations -database "postgres://terp:$(DB_PASSWORD)@localhost:5432/terp_$(ENV)?sslmode=disable" up

cloud-logs: ## Tail Cloud Run logs (ENV=staging|production, SVC=api|web)
	@test -n "$(ENV)" || (echo "ENV required" && exit 1)
	@test -n "$(SVC)" || (echo "SVC required: make cloud-logs ENV=staging SVC=api" && exit 1)
	gcloud run services logs tail terp-$(ENV)-$(SVC) --region=$(REGION)
```

### Success Criteria:

#### Automated Verification:
- [ ] `terraform apply -var-file=staging.tfvars` creates Cloud Run API service
- [ ] `make deploy-api ENV=staging GCP_PROJECT=<id>` builds and pushes image
- [ ] Cloud Run service URL returns response

#### Manual Verification:
- [ ] API health check endpoint responds
- [ ] Run migrations via Cloud SQL proxy, then test API endpoints

---

## Phase 5: Web Deployment to Cloud Run

### Overview
Deploy Next.js frontend to Cloud Run, wired to the API URL.

### Changes Required:

#### 1. Cloud Run Web service
**File**: `terraform/cloud-run-web.tf` (new)

```hcl
locals {
  web_image = "${var.region}-docker.pkg.dev/${var.project_id}/terp-docker/web:${var.web_image_tag}"
}

resource "google_cloud_run_v2_service" "web" {
  name     = "terp-${var.environment}-web"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.cloudrun.email

    scaling {
      min_instance_count = var.web_min_instances
      max_instance_count = var.web_max_instances
    }

    containers {
      image = local.web_image

      ports {
        container_port = 3000
      }

      resources {
        limits = {
          cpu    = var.web_cpu
          memory = var.web_memory
        }
      }

      startup_probe {
        tcp_socket { port = 3000 }
        initial_delay_seconds = 5
        timeout_seconds       = 3
        period_seconds        = 10
        failure_threshold     = 10
      }
    }

    execution_environment = "EXECUTION_ENVIRONMENT_GEN2"
    timeout = "60s"
  }
}

# Public access
resource "google_cloud_run_v2_service_iam_member" "web_public" {
  name     = google_cloud_run_v2_service.web.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}
```

#### 2. Outputs
**File**: `terraform/outputs.tf` (new)

```hcl
output "api_url" {
  value = google_cloud_run_v2_service.api.uri
}

output "web_url" {
  value = google_cloud_run_v2_service.web.uri
}

output "db_connection_name" {
  value = google_sql_database_instance.postgres.connection_name
}

output "db_private_ip" {
  value     = google_sql_database_instance.postgres.private_ip_address
  sensitive = true
}

output "artifact_registry" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker.repository_id}"
}
```

### Success Criteria:

#### Automated Verification:
- [ ] `terraform apply -var-file=staging.tfvars` creates both Cloud Run services
- [ ] `make deploy-web ENV=staging GCP_PROJECT=<id>` builds and deploys

#### Manual Verification:
- [ ] Web app loads in browser at Cloud Run URL
- [ ] Web app successfully calls API endpoints
- [ ] CORS works correctly between web and API Cloud Run URLs

---

## Phase 6: Monitoring

### Overview
Basic Cloud Monitoring dashboard and alert policies.

### Changes Required:

#### 1. Monitoring
**File**: `terraform/monitoring.tf` (new)

Dashboard with tiles for:
- Cloud Run API CPU/memory utilization
- Cloud Run Web CPU/memory utilization
- Cloud SQL CPU/memory utilization
- Request count and latency (p95)

Alert policies:
- High CPU (>80% for 5 min) on Cloud Run
- High memory (>90% for 5 min) on Cloud Run
- High latency (p95 >1s for 5 min) on Cloud Run

Pattern: Follow noktasol's `monitoring.tf` structure with updated resource references.

### Success Criteria:

#### Manual Verification:
- [ ] Dashboard visible in GCP Monitoring console
- [ ] Alert policies created and active

---

## File Summary

### New Files (12)
| File | Description |
|------|-------------|
| `docker/web.Dockerfile` | Production Next.js multi-stage build |
| `terraform/.gitignore` | Ignore state, .terraform, tfvars |
| `terraform/providers.tf` | GCP provider, GCS backend |
| `terraform/variables.tf` | All configurable variables |
| `terraform/data.tf` | Project data sources |
| `terraform/networking.tf` | VPC peering, VPC connector |
| `terraform/database.tf` | Cloud SQL PostgreSQL 16 |
| `terraform/secrets.tf` | Secret Manager (JWT, DB password) |
| `terraform/storage.tf` | Artifact Registry |
| `terraform/cloud-run-api.tf` | API Cloud Run service + IAM |
| `terraform/cloud-run-web.tf` | Web Cloud Run service + IAM |
| `terraform/outputs.tf` | URLs, connection info |
| `terraform/monitoring.tf` | Dashboard + alerts |
| `terraform/terraform.tfvars.example` | Example configuration |

### Modified Files (2)
| File | Change |
|------|--------|
| `apps/web/next.config.ts` | Add `output: "standalone"` |
| `Makefile` | Add deploy-infra, deploy-api, deploy-web, migrate-cloud, cloud-logs targets |

## Deployment Workflow

```bash
# First time setup (once per environment)
make deploy-infra ENV=staging GCP_PROJECT=<id>

# Run migrations
cloud-sql-proxy <connection-name> &
make migrate-cloud ENV=staging DB_PASSWORD=<from-secret-manager>

# Deploy services
make deploy-api ENV=staging GCP_PROJECT=<id>
make deploy-web ENV=staging GCP_PROJECT=<id>

# Check logs
make cloud-logs ENV=staging SVC=api
```

## Verification

After full deployment:
1. `terraform output` shows API and Web URLs
2. API URL `/api/v1/health` responds 200
3. Web URL loads the frontend
4. Frontend can authenticate and make API calls
5. Cloud Monitoring dashboard shows metrics
6. `create-tenant.sh` works via Cloud SQL proxy

## References

- Research document: `thoughts/shared/research/2026-02-26-gcp-terraform-deployment-research.md`
- Noktasol reference: `~/projects/noktasol/terraform/`
- Existing API Dockerfile: `docker/api.Dockerfile`
- Config loading: `apps/api/internal/config/config.go`
