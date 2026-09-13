.DEFAULT_GOAL := help
SHELL := /bin/bash

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

up: ## Start the local stack (control plane, Mongo, Redis, admin, monitoring)
	docker compose up -d --build

down: ## Stop the local stack
	docker compose down

logs: ## Follow control-plane logs
	docker compose logs -f api

seed: ## Create an admin account (ADMIN=you@example.com PASSWORD=...)
	cd backend && python -m scripts.seed --admin $(ADMIN) --password '$(PASSWORD)' --with-placeholder-servers

test: test-backend test-mobile ## Run every test suite (no emulator needed)

test-backend: ## Backend unit tests
	cd backend && python -m pytest -q

test-mobile: ## Mobile logic tests (Node, no emulator)
	cd mobile && npm test

admin-build: ## Typecheck, lint and build the operations console
	cd admin && npm run typecheck && npm run lint && npm run build

lint: ## Lint backend, admin and mobile
	cd backend && ruff check app tests && black --check app tests
	cd admin && npm run lint && npm run typecheck
	cd mobile && npm run lint && npm run typecheck

mobile-debug: ## Build a debug APK
	cd mobile/android && ./gradlew assembleDebug

gateway-install: ## Provision the current host as a gateway (run on the gateway)
	sudo GATEWAY_ID=$(GATEWAY_ID) VPN_SUBNET=$(VPN_SUBNET) gateway/scripts/install-gateway.sh

.PHONY: help up down logs seed test test-backend test-mobile lint admin-build mobile-debug gateway-install
