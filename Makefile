.PHONY: dev dev-down dev-logs dev-ps build test test-coverage lint fmt tidy migrate-up migrate-down migrate-create migrate-status swagger-bundle generate clean install-tools help

# Variables
DOCKER_COMPOSE = docker compose -f docker/docker-compose.yml
MIGRATE = migrate
LOCAL_DB = postgres://dev:dev@localhost:5432/terp?sslmode=disable

# Colors for help
CYAN := \033[36m
RESET := \033[0m

## help: Show this help message
help:
	@echo "Available commands:"
	@echo ""
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  $(CYAN)%-15s$(RESET) %s\n", $$1, $$2}' $(MAKEFILE_LIST)

## dev: Start development environment
dev: ## Start all services with Docker Compose
	$(DOCKER_COMPOSE) up --build -d

## dev-down: Stop development environment
dev-down: ## Stop all services
	$(DOCKER_COMPOSE) down

## dev-logs: Show logs from all services
dev-logs: ## Follow logs from all services
	$(DOCKER_COMPOSE) logs -f

## dev-ps: Show status of services
dev-ps: ## Show running services
	$(DOCKER_COMPOSE) ps

## build: Build production Docker images
build: ## Build production images
	docker build -f docker/api.Dockerfile -t terp-api:latest .

## test: Run all tests
test: ## Run Go tests
	cd apps/api && go test -v -race -cover ./...

## test-coverage: Run tests with coverage report
test-coverage: ## Run tests with HTML coverage report
	cd apps/api && go test -coverprofile=coverage.out ./...
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

## migrate-up: Run database migrations (local)
migrate-up: ## Apply all pending migrations locally
	$(MIGRATE) -path db/migrations -database "$(LOCAL_DB)" up

## migrate-down: Rollback last migration (local)
migrate-down: ## Rollback last migration locally
	$(MIGRATE) -path db/migrations -database "$(LOCAL_DB)" down 1

## migrate-status: Check migration status (local)
migrate-status: ## Show current migration version locally
	$(MIGRATE) -path db/migrations -database "$(LOCAL_DB)" version

## migrate-create: Create new migration file
migrate-create: ## Create a new migration (usage: make migrate-create name=migration_name)
	$(MIGRATE) create -ext sql -dir db/migrations -seq $(name)

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
	@echo "Installing migrate..."
	go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@v4.17.1
	@echo "Installing go-swagger..."
	go install github.com/go-swagger/go-swagger/cmd/swagger@latest
	@echo "Installing swagger-cli (for bundling OpenAPI specs)..."
	npm install -g @apidevtools/swagger-cli
	@echo "All tools installed!"
