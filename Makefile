.PHONY: help build up up-prod up-monitoring down test lint backup-db restore-db smoke-test tf-validate k8s-validate clean

SHELL := /bin/bash

help: ## Display this help screen
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build all Docker container images
	docker compose build
	docker compose -f docker-compose.prod.yml build

up: ## Start the development stack with Docker Compose
	docker compose up -d --build

up-prod: ## Start the production stack with Nginx TLS Gateway
	docker compose -f docker-compose.prod.yml up -d --build

up-monitoring: ## Start Prometheus and Grafana monitoring stack
	docker compose -f docker-compose.monitoring.yml up -d

down: ## Stop all running platform containers
	docker compose down
	docker compose -f docker-compose.prod.yml down --remove-orphans
	docker compose -f docker-compose.monitoring.yml down --remove-orphans

test: ## Run test suites across Python backend and Go services
	@echo "==> Testing Python Backend"
	cd dashboard/backend && python -m py_compile main.py
	@echo "==> Testing Go Signaling and Agent"
	cd signaling && go test ./...
	cd agent && go test -tags docker ./...

lint: ## Run linters across backend, frontend, and Go code
	@echo "==> Linting Python Backend"
	cd dashboard/backend && flake8 . --count --exit-zero --max-line-length=127 --statistics
	@echo "==> Linting Frontend"
	cd dashboard/frontend && npm run lint
	@echo "==> Linting Go Services"
	cd signaling && go vet ./...
	cd agent && go vet -tags docker ./...

backup-db: ## Run automated database snapshot with checksum verification
	chmod +x scripts/backup-db.sh && ./scripts/backup-db.sh

restore-db: ## Restore database from snapshot (Usage: make restore-db BACKUP_FILE=path/to/file.sql.gz)
	chmod +x scripts/restore-db.sh && ./scripts/restore-db.sh $(BACKUP_FILE)

smoke-test: ## Run synthetic health and API smoke tests against running platform
	chmod +x scripts/smoke-test.sh && ./scripts/smoke-test.sh

tf-validate: ## Validate Terraform modules and configurations
	cd terraform/environments/prod && terraform init -backend=false && terraform validate
	cd terraform/environments/dev && terraform init -backend=false && terraform validate

k8s-validate: ## Validate Kubernetes Kustomize manifests
	kubectl kustomize k8s/overlays/prod > /dev/null && echo "Prod Kustomize valid."
	kubectl kustomize k8s/overlays/dev > /dev/null && echo "Dev Kustomize valid."

clean: ## Clean local temporary and build files
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	rm -rf dashboard/frontend/dist
