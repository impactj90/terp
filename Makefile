.PHONY: dev dev-down dev-reset dev-clean dev-logs dev-ps demo demo-down demo-logs build test test-coverage lint fmt tidy db-start db-stop db-reset db-status db-migrate-new swagger-bundle generate generate-web generate-all clean install-tools help prod-setup prod-deploy prod-migrate prod-logs prod-ssh

# Variables
DOCKER_COMPOSE = docker compose -p terp -f docker/docker-compose.yml
DOCKER_COMPOSE_DEMO = docker compose -p terp --env-file .env -f docker/docker-compose.yml -f docker/docker-compose.demo.yml
GOBIN = $(shell go env GOPATH)/bin
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
dev: ## Start Supabase + Docker services and run migrations
	@npx supabase start
	$(DOCKER_COMPOSE) up --build -d
	@echo "Development environment ready!"

## dev-down: Stop development environment
dev-down: ## Stop Docker services (Supabase keeps running)
	$(DOCKER_COMPOSE) down --remove-orphans

## dev-reset: Wipe database and reinitialize
dev-reset: ## Reset Supabase DB and restart API
	@npx supabase db reset
	$(DOCKER_COMPOSE) restart api
	@echo "Database reset complete!"

## dev-clean: Force remove all containers and volumes
dev-clean: ## Force clean all terp containers and volumes, stop Supabase
	$(DOCKER_COMPOSE) down -v --remove-orphans 2>/dev/null || true
	docker rm -f terp-api terp-web 2>/dev/null || true
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
	@docker rm -f terp-api terp-web terp-caddy terp-ngrok 2>/dev/null || true

## demo-logs: Show demo logs
demo-logs: ## Follow logs from demo services
	$(DOCKER_COMPOSE_DEMO) logs -f

## build: Build production Docker images
build: ## Build production images
	docker build -f docker/api.Dockerfile -t terp-api:latest .

## test: Run all tests
test: ## Run Go tests
	cd apps/api && go test -p 1 -v -race -cover ./...

## test-coverage: Run tests with coverage report
test-coverage: ## Run tests with HTML coverage report
	cd apps/api && go test -p 1 -coverprofile=coverage.out ./...
	cd apps/api && go tool cover -html=coverage.out -o coverage.html

## lint: Run all linters
lint: ## Run golangci-lint
	cd apps/api && golangci-lint run ./...

## fmt: Format Go code
fmt: ## Format Go code with gofmt
	cd apps/api && gofmt -s -w .
	cd apps/api && goimports -w .

## tidy: Tidy Go modules
tidy: ## Run go mod tidy
	cd apps/api && go mod tidy

## swagger-bundle: Bundle OpenAPI spec into single file
swagger-bundle: ## Bundle multi-file OpenAPI spec into single file
	@echo "Bundling OpenAPI spec..."
	@which swagger-cli > /dev/null 2>&1 || (echo "Installing swagger-cli..." && npm install -g @apidevtools/swagger-cli)
	swagger-cli bundle api/openapi.yaml -o api/openapi.bundled.yaml -t yaml
	@echo "Copying to apps/api/cmd/server for embedding..."
	cp api/openapi.bundled.yaml apps/api/cmd/server/openapi.bundled.yaml
	@echo "Done! Bundled spec at api/openapi.bundled.yaml"

## generate: Generate code from OpenAPI spec
generate: swagger-bundle ## Generate Go server models from OpenAPI
	@echo "Validating OpenAPI spec..."
	swagger validate api/openapi.bundled.yaml
	@echo "Generating Go server models..."
	mkdir -p apps/api/gen/models
	swagger generate model -f api/openapi.bundled.yaml -t apps/api/gen --model-package=models
	@echo "Done! Models generated in apps/api/gen/models/"

## generate-web: Generate TypeScript API types for frontend
generate-web: swagger-bundle ## Generate TypeScript types for frontend from OpenAPI
	@echo "Converting Swagger 2.0 to OpenAPI 3.0..."
	@which swagger2openapi > /dev/null 2>&1 || (echo "Installing swagger2openapi..." && npm install -g swagger2openapi)
	swagger2openapi api/openapi.bundled.yaml -o api/openapi.bundled.v3.yaml
	@echo "Generating TypeScript API types..."
	cd apps/web && pnpm run generate:api
	@echo "Done! Types generated in apps/web/src/lib/api/types.ts"

## generate-all: Generate all code from OpenAPI spec
generate-all: generate generate-web ## Generate Go models and TypeScript types

## clean: Clean build artifacts
clean: ## Remove build artifacts and temp files
	rm -rf apps/api/tmp
	rm -rf apps/api/coverage.out
	rm -rf apps/api/coverage.html
	rm -rf bin/

## install-tools: Install development tools
install-tools: ## Install required development tools
	@echo "Installing golangci-lint..."
	go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
	@echo "Installing goimports..."
	go install golang.org/x/tools/cmd/goimports@latest
	@echo "Installing air (hot reload)..."
	go install github.com/air-verse/air@v1.52.3
	@echo "Installing go-swagger..."
	go install github.com/go-swagger/go-swagger/cmd/swagger@latest
	@echo "Installing swagger-cli (for bundling OpenAPI specs)..."
	npm install -g @apidevtools/swagger-cli
	@echo "All tools installed!"

# === Production Deployment (Hetzner VPS) ===

prod-setup: ## Initial server setup (SERVER=<ip> required)
	@test -n "$(SERVER)" || (echo "SERVER required: make prod-setup SERVER=<ip>" && exit 1)
	scp deploy/setup.sh root@$(SERVER):/tmp/setup.sh
	ssh root@$(SERVER) 'chmod +x /tmp/setup.sh && /tmp/setup.sh'

prod-deploy: ## Build and deploy API to server (SERVER=<ip> required)
	@test -n "$(SERVER)" || (echo "SERVER required: make prod-deploy SERVER=<ip>" && exit 1)
	bash deploy/deploy.sh $(SERVER)

prod-migrate: ## Run migrations on production Supabase (requires SUPABASE_DB_URL)
	@test -n "$(SUPABASE_DB_URL)" || (echo "SUPABASE_DB_URL required" && exit 1)
	npx supabase db push --db-url "$(SUPABASE_DB_URL)"

prod-logs: ## Tail logs from server (SERVER=<ip> required)
	@test -n "$(SERVER)" || (echo "SERVER required: make prod-logs SERVER=<ip>" && exit 1)
	ssh root@$(SERVER) 'cd /opt/terp && docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f'

prod-ssh: ## SSH into server (SERVER=<ip> required)
	@test -n "$(SERVER)" || (echo "SERVER required: make prod-ssh SERVER=<ip>" && exit 1)
	ssh root@$(SERVER)
