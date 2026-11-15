# AGENTS.md for parcel-tracker

How a coding agent works on parcel-tracker, a Go service that tracks parcels.

## Overview

parcel-tracker is one Go module. The service starts from `cmd/parcel-tracker/`.

## Commands

```bash
go build ./...         # build every package
go test ./...          # run every test
golangci-lint run      # lint; must report no problems
```

## Layout

- `cmd/parcel-tracker/`: the entry point.
- `internal/`: all service code.
- `api/openapi.yaml`: the public API contract.

## Rules

- Never run `make deploy`. A person does every deploy.
- Never commit directly to `main`. Work on a branch.
- Every change under `internal/` comes with a test in the same package.

## Ask first

Stop and get a person's yes before you:

- change `api/openapi.yaml`;
- add a dependency to `go.mod`.

## Done means

1. `go build ./...` succeeds.
2. `go test ./...` passes.
3. `golangci-lint run` reports no problems.
4. Each changed package under `internal/` has a new or updated test.
