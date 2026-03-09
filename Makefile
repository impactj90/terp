.PHONY: dev dev-down dev-reset dev-clean dev-logs dev-ps demo demo-down demo-logs build test lint typecheck db-start db-stop db-reset db-status db-migrate-new db-generate clean install prod-migrate help

# Variables
DOCKER_COMPOSE = docker compose -p terp -f docker/docker-compose.yml
DOCKER_COMPOSE_DEMO = docker compose -p terp --env-file .env -f docker/docker-compose.yml -f docker/docker-compose.demo.yml
LOCAL_DB = postgresql://postgres:postgres@localhost:54322/postgres

# Colors for help
CYAN := \033[36m
RESET := \033[0m

## help: Show this help message
help:
	@echo "Available commands:"
	@echo ""
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  $(CYAN)%-15s$(RESET) %s\n", $$1, $$2}' $(MAKEFILE_LIST)

## dev: Start development environment
dev: ## Start Supabase + Docker services
	@npx supabase start
	$(DOCKER_COMPOSE) up --build -d
	@echo "Development environment ready!"

## dev-down: Stop development environment
dev-down: ## Stop Docker services (Supabase keeps running)
	$(DOCKER_COMPOSE) down --remove-orphans

## dev-reset: Wipe database and reinitialize
dev-reset: ## Reset Supabase DB
	@npx supabase db reset
	@echo "Database reset complete!"

## dev-clean: Force remove all containers and volumes
dev-clean: ## Force clean all terp containers and volumes, stop Supabase
	$(DOCKER_COMPOSE) down -v --remove-orphans 2>/dev/null || true
	docker rm -f terp-web 2>/dev/null || true
	docker volume rm terp_web_node_modules 2>/dev/null || true
	@npx supabase stop 2>/dev/null || true

## dev-logs: Show logs from all services
dev-logs: ## Follow logs from all services
	$(DOCKER_COMPOSE) logs -f

## dev-ps: Show status of services
dev-ps: ## Show running services
	$(DOCKER_COMPOSE) ps

## db-start: Start Supabase (local Postgres + Studio)
db-start: ## Start Supabase local development stack
	npx supabase start

## db-stop: Stop Supabase
db-stop: ## Stop Supabase local development stack
	npx supabase stop

## db-reset: Reset database
db-reset: ## Reset Supabase DB (drops all data, reruns migrations + seed)
	npx supabase db reset

## db-status: Check Supabase status
db-status: ## Show Supabase service status and connection info
	npx supabase status

## db-migrate-new: Create a new migration
db-migrate-new: ## Create a new Supabase migration (usage: make db-migrate-new name=migration_name)
	npx supabase migration new $(name)

## db-generate: Generate Prisma client
db-generate: ## Regenerate Prisma client from schema
	pnpm db:generate

## demo: Start demo environment with public tunnel
demo: ## Start demo with public URL and password protection
	@npx supabase start
	$(DOCKER_COMPOSE_DEMO) up --build -d
	@echo ""
	@echo "========================================="
	@echo "  Demo environment ready!"
	@echo "  URL: https://$$(grep NGROK_DOMAIN .env | cut -d= -f2)"
	@echo "  User: $$(grep DEMO_USER .env | cut -d= -f2)"
	@echo "  Password: $$(grep DEMO_PASSWORD .env | cut -d= -f2)"
	@echo "========================================="

## demo-down: Stop demo environment
demo-down: ## Stop demo environment
	$(DOCKER_COMPOSE_DEMO) down -v --remove-orphans
	@docker rm -f terp-web terp-caddy terp-ngrok 2>/dev/null || true

## demo-logs: Show demo logs
demo-logs: ## Follow logs from demo services
	$(DOCKER_COMPOSE_DEMO) logs -f

## test: Run tests
test: ## Run web app tests
	pnpm test

## typecheck: Run TypeScript type checking
typecheck: ## Type-check the web app
	pnpm typecheck

## lint: Run ESLint
lint: ## Lint the web app
	pnpm lint

## build: Build the web app
build: ## Build the Next.js app
	pnpm build

## clean: Remove build artifacts
clean: ## Remove build artifacts and temp files
	rm -rf .next
	rm -rf out

## install: Install dependencies
install: ## Install all dependencies
	pnpm install

## prod-migrate: Run migrations on production Supabase
prod-migrate: ## Run migrations on production Supabase (requires SUPABASE_DB_URL)
	@test -n "$(SUPABASE_DB_URL)" || (echo "SUPABASE_DB_URL required" && exit 1)
	npx supabase db push --db-url "$(SUPABASE_DB_URL)"
