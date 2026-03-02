---
date: 2026-02-26T12:00:00+01:00
researcher: tolga
git_commit: 4afc1559a46e112a98609ee2e6fba2c36d97b2eb
branch: master
repository: terp
topic: "GCP Terraform Deployment for Staging and Production - Research from noktasol reference"
tags: [research, codebase, terraform, gcp, deployment, cloud-run, cloud-sql, infrastructure]
status: complete
last_updated: 2026-02-26
last_updated_by: tolga
---

# Research: GCP Terraform Deployment for Staging and Production

**Date**: 2026-02-26T12:00:00+01:00
**Researcher**: tolga
**Git Commit**: 4afc1559a46e112a98609ee2e6fba2c36d97b2eb
**Branch**: master
**Repository**: terp

## Research Question
How was GCP deployment done in the noktasol project, and what does the terp project need for a Terraform-based GCP deployment with staging and production environments?

## Summary

The noktasol project (`~/projects/noktasol/`) has a complete Terraform setup for GCP deploying a Go+Next.js stack to Cloud Run + Vercel. The terp project has **no infrastructure-as-code yet** but already has a production-ready Dockerfile for the Go API and a demo Docker Compose with Caddy/ngrok. This document maps the noktasol reference architecture and identifies what needs to be adapted for terp's staging+production setup.

## Detailed Findings

### 1. Noktasol Reference Architecture

**GCP Services Used:**
| Service | Purpose | Cost |
|---------|---------|------|
| Cloud Run (v2) | Go backend API (serverless, auto-scaling 0-5) | ~$20/mo |
| Cloud SQL PostgreSQL 15 | Database (private IP only, VPC-peered) | ~$25/mo |
| Artifact Registry | Docker image storage | included |
| Secret Manager | JWT, Clerk keys, DB password | ~$5/mo |
| VPC Connector | Cloud Run → Cloud SQL private networking | ~$8/mo |
| Cloud CDN + Storage | Static assets with managed SSL | ~$5/mo |
| Cloud Monitoring | Dashboard + alert policies | free tier |
| Vercel | Next.js frontend (separate provider) | $0 (hobby) |
| **Total** | | **~$75/mo** |

**Terraform File Structure (12 files):**
```
terraform/
├── providers.tf          # GCP provider v5.0, GCS backend state
├── variables.tf          # 14 variables (project, region, Cloud Run specs, DB tier)
├── terraform.tfvars.example  # Example values
├── data.tf               # google_project + google_client_config data sources
├── cloud-run.tf          # Cloud Run v2 service, VPC connector, service account + IAM
├── database.tf           # Cloud SQL instance, DB, user, random password, VPC peering
├── storage.tf            # 3 buckets (app_data, photos, backups) + Artifact Registry
├── secrets.tf            # Secret Manager resources (clerk, jwt) + auto-generated passwords
├── cdn.tf                # Cloud CDN, backend bucket, URL map, SSL cert, forwarding rules
├── monitoring.tf         # Dashboard, 3 alert policies (CPU/memory/latency), uptime check
├── cicd.tf               # Cloud Build service account + IAM (trigger template commented out)
├── outputs.tf            # 20+ outputs including URLs, cost estimates, setup instructions
└── .gitignore            # *.tfstate, .terraform/
```

**Key Design Decisions:**
- **Region**: `europe-west3` (Frankfurt) for GDPR/EU data residency
- **State backend**: GCS bucket (`project-rufus-11-terraform-state`)
- **Database**: Private IP only (no public), VPC-peered via `google_service_networking_connection`
- **Scaling**: Cloud Run Gen2, min=1, max=5, 80 concurrent requests, session affinity
- **Secrets**: Auto-generated DB password + JWT secret via `random_password`, Clerk keys as placeholders
- **Single environment**: noktasol only had a `prod` environment variable but no staging separation

### 2. Terp Project Current State

**What exists today:**
- `docker/api.Dockerfile` — Production multi-stage Go build (golang:1.24-alpine → alpine:3.19), non-root user, ~10MB binary
- `docker/docker-compose.yml` — Dev stack (PostgreSQL 16 + API + Web)
- `docker/docker-compose.demo.yml` — Demo with Caddy reverse proxy + ngrok tunnel
- `apps/api/internal/config/config.go` — Env var loading with production validation
- `scripts/create-tenant.sh` — Tenant provisioning script (works with any DATABASE_URL)
- **No Terraform, no Kubernetes, no CI/CD pipeline**

**Required Environment Variables (from config.go):**
```
ENV=production                    # Triggers security validations
PORT=8080                         # Server listen port
DATABASE_URL=postgres://...       # PostgreSQL connection string
JWT_SECRET=<min 32 chars>         # MUST differ from default in production
JWT_EXPIRY=24h                    # Token lifetime
LOG_LEVEL=info                    # Zerolog level
BASE_URL=https://api.example.com  # API public URL
FRONTEND_URL=https://example.com  # CORS origins + OAuth redirects
```

**Frontend (apps/web/) needs:**
```
NEXT_PUBLIC_API_URL=https://api.example.com/api/v1  # Browser-accessible API
```

**Database:**
- PostgreSQL 16 (89 migrations, golang-migrate)
- Connection pooling: pgx min=5, max=25; GORM max=100
- Multi-tenant schema with `tenant_id` foreign keys

### 3. Noktasol → Terp Adaptation Map

**Direct reuse (same pattern):**
- `providers.tf` — Same GCP provider config, different state prefix
- `database.tf` — Same Cloud SQL PostgreSQL, bump to v16, adjust tier
- `secrets.tf` — Remove Clerk-specific secrets, keep JWT + DB password
- `storage.tf` — Artifact Registry needed, storage buckets optional initially
- `cloud-run.tf` — Same pattern, different env vars (remove Clerk/Cache/CDN vars)
- `monitoring.tf` — Reuse dashboard + alert policies as-is

**Must change:**
- **Environment separation**: noktasol had none. Terp needs `staging` + `production` workspaces or separate state files
- **Env vars on Cloud Run**: Terp uses `ENV`, `JWT_SECRET`, `JWT_EXPIRY`, `LOG_LEVEL`, `BASE_URL`, `FRONTEND_URL` (no Clerk, no cache config)
- **Database name**: `terp_staging` / `terp_production` instead of `noktasol_prod`
- **Frontend**: noktasol used Vercel. Terp can use Cloud Run for Next.js too (needs a web Dockerfile)
- **No CDN needed initially**: Terp doesn't serve static assets from GCS

**Not needed from noktasol:**
- `cdn.tf` — Not required for initial deployment
- Clerk secret management — Terp uses its own JWT auth
- Cache configuration env vars — Terp doesn't have a cache layer

### 4. Key Terraform Patterns from Noktasol

**Provider + State Backend:**
```hcl
backend "gcs" {
  bucket = "project-rufus-11-terraform-state"
  prefix = "noktasol/cloud-run"  # → "terp/staging" or "terp/production"
}
```

**VPC Peering for Private DB Access:**
```hcl
google_compute_global_address → google_service_networking_connection → database private IP
google_vpc_access_connector → Cloud Run vpc_access block
```

**Secret Manager Integration:**
```hcl
random_password → google_secret_manager_secret_version → Cloud Run env value_source.secret_key_ref
```

**Cloud Run v2 Service Pattern:**
```hcl
google_cloud_run_v2_service with:
  - service_account (dedicated, not default)
  - vpc_access connector for DB
  - env vars (plain + secret refs)
  - scaling (min/max instances)
  - execution_environment = "EXECUTION_ENVIRONMENT_GEN2"
  - startup_probe on tcp:8080
  - IAM: allUsers → roles/run.invoker (public API)
```

**Database Pattern:**
```hcl
google_sql_database_instance (PostgreSQL, private IP, backup config)
google_sql_database (the actual DB)
google_sql_user (with random_password)
```

### 5. Environment Separation Strategy

Noktasol had no environment separation. For terp, two approaches exist:

**Option A: Terraform Workspaces**
```bash
terraform workspace new staging
terraform workspace new production
# Use terraform.workspace in resource naming
```
- Pros: Single codebase, easy switching
- Cons: Shared state backend, harder to restrict access

**Option B: Separate Directories (recommended)**
```
terraform/
├── modules/           # Shared modules
│   ├── cloud-run/
│   ├── database/
│   └── networking/
├── staging/
│   ├── main.tf        # Calls modules with staging vars
│   ├── terraform.tfvars
│   └── backend.tf     # prefix = "terp/staging"
└── production/
    ├── main.tf        # Calls modules with prod vars
    ├── terraform.tfvars
    └── backend.tf     # prefix = "terp/production"
```
- Pros: Complete isolation, different permissions per env
- Cons: More files, must keep in sync

**Option C: Separate .tfvars files (simplest)**
```
terraform/
├── *.tf               # All resource definitions
├── staging.tfvars     # environment = "staging", smaller instances
└── production.tfvars  # environment = "production", larger instances
# terraform apply -var-file=staging.tfvars
```
- Pros: Simplest, minimal duplication
- Cons: Shared state unless prefix is parameterized

### 6. Staging vs Production Differences

| Setting | Staging | Production |
|---------|---------|------------|
| Cloud Run min instances | 0 (scale to zero) | 1 (always warm) |
| Cloud Run max instances | 2 | 5 |
| Cloud Run CPU | 1000m | 1000m |
| Cloud Run memory | 512Mi | 2Gi |
| DB tier | db-f1-micro | db-custom-1-3840 |
| DB disk | 10GB | 20GB |
| DB backup retention | 3 | 7 |
| DB deletion_protection | false | true |
| Domain | staging.terp.example.com | app.terp.example.com |
| ENV variable | staging | production |
| Log level | debug | info |

### 7. Missing: Web (Next.js) Production Dockerfile

Terp currently has no production Dockerfile for the web app. For Cloud Run deployment, it needs:
```dockerfile
# Build stage
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Runtime stage
FROM node:22-alpine
RUN corepack enable
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
```
Requires `output: "standalone"` in `next.config.ts`.

### 8. Deployment Flow (from noktasol Makefile)

```
make deploy-infra     → terraform init + plan + apply
make deploy-backend   → docker build + push to Artifact Registry + gcloud run deploy
make deploy-frontend  → vercel --prod (or Cloud Run for terp)
make deploy-all       → infra + backend + frontend sequentially
make migrate-prod     → Run migrations via Cloud SQL proxy
make prod-logs        → gcloud run services logs tail
```

### 9. Database Migration Strategy

Noktasol had a `/migrate` endpoint concept but it was incomplete. For terp:
- Migrations must run **before** new code deploys (89 SQL migrations, golang-migrate)
- Options: (a) Cloud Build step with Cloud SQL proxy, (b) Init container, (c) Manual via `make migrate-prod`
- `create-tenant.sh` script needs DATABASE_URL pointed to Cloud SQL

## Code References

### Noktasol Terraform
- `~/projects/noktasol/terraform/providers.tf` — GCP provider, GCS state backend
- `~/projects/noktasol/terraform/variables.tf` — 14 variables, Cloud Run + DB + VPC config
- `~/projects/noktasol/terraform/cloud-run.tf` — Cloud Run v2 service + VPC connector + IAM
- `~/projects/noktasol/terraform/database.tf` — Cloud SQL PostgreSQL 15, private IP, VPC peering
- `~/projects/noktasol/terraform/secrets.tf` — Secret Manager (JWT, Clerk, DB password)
- `~/projects/noktasol/terraform/storage.tf` — 3 storage buckets + Artifact Registry
- `~/projects/noktasol/terraform/cdn.tf` — Cloud CDN, backend bucket, managed SSL
- `~/projects/noktasol/terraform/monitoring.tf` — Dashboard, CPU/memory/latency alerts, uptime check
- `~/projects/noktasol/terraform/cicd.tf` — Cloud Build service account + IAM roles
- `~/projects/noktasol/terraform/outputs.tf` — 20+ outputs, cost estimates, setup instructions
- `~/projects/noktasol/Makefile` — deploy-infra, deploy-backend, deploy-frontend, deploy-all targets
- `~/projects/noktasol/cloudbuild.yaml` — Docker build → push → deploy to Compute Engine
- `~/projects/noktasol/backend/Dockerfile` — Multi-stage Go build for Cloud Run

### Terp Current State
- `docker/api.Dockerfile` — Production Go build (multi-stage, non-root user)
- `docker/docker-compose.yml` — Dev stack
- `docker/docker-compose.demo.yml` — Demo with Caddy + ngrok
- `apps/api/internal/config/config.go` — Env var loading, production JWT validation
- `apps/api/cmd/server/main.go` — Server entry point, 40+ route groups, scheduler
- `apps/web/next.config.ts` — Next.js config with next-intl
- `apps/web/package.json` — Next.js 16.1, React 19.2, pnpm
- `db/migrations/` — 89 SQL migration files (golang-migrate)
- `scripts/create-tenant.sh` — Tenant provisioning

## Architecture Documentation

### Target Deployment Architecture for Terp
```
                    ┌──────────────────────┐
                    │   DNS / Domain       │
                    │   app.terp.de        │
                    │   api.terp.de        │
                    └──────┬───────────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
    ┌─────────▼─────────┐   ┌──────────▼──────────┐
    │  Cloud Run (Web)  │   │  Cloud Run (API)    │
    │  Next.js 16       │   │  Go 1.24            │
    │  Port 3000        │   │  Port 8080          │
    │  0-2 (staging)    │   │  0-5 instances      │
    │  1-5 (prod)       │   │  VPC connector      │
    └───────────────────┘   └──────────┬──────────┘
                                       │ Private IP
                            ┌──────────▼──────────┐
                            │  Cloud SQL          │
                            │  PostgreSQL 16      │
                            │  Private IP only    │
                            │  VPC peered         │
                            └─────────────────────┘

    ┌─────────────────────────────────────────────┐
    │  Supporting Services                        │
    │  • Secret Manager (JWT, DB password)        │
    │  • Artifact Registry (Docker images)        │
    │  • Cloud Monitoring (dashboard + alerts)    │
    │  • Cloud Build (CI/CD - future)             │
    └─────────────────────────────────────────────┘
```

### State Management
```
GCS Bucket: <project-id>-terraform-state/
├── terp/staging/default.tfstate
└── terp/production/default.tfstate
```

## Open Questions

1. **GCP Project**: Will staging and production share a GCP project or use separate projects?
2. **Domain names**: What domains will be used? (e.g., `staging.terp.de`, `app.terp.de`)
3. **Frontend hosting**: Cloud Run for Next.js, or Vercel like noktasol?
4. **CI/CD**: GitHub Actions, Cloud Build, or manual deployment initially?
5. **Database migration strategy**: Cloud Build step, init container, or manual?
6. **Budget target**: noktasol was ~$75/mo for one env. Staging could be ~$30/mo (scale-to-zero, smaller DB).
