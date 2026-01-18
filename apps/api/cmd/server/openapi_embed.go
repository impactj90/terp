package main

import (
	_ "embed"
)

// Embed the bundled OpenAPI spec
// Run `make swagger-bundle` to generate the spec, then copy to apps/api/cmd/server/
//
//go:embed openapi.bundled.yaml
var openapiSpec []byte
