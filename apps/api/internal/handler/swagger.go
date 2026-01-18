package handler

import (
	"embed"
	"io/fs"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
)

//go:embed swagger-ui/*
var swaggerUI embed.FS

// RegisterSwaggerRoutes registers Swagger UI routes.
func RegisterSwaggerRoutes(r chi.Router, specContent []byte) {
	// Serve the OpenAPI spec from memory
	r.Get("/openapi.yaml", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/x-yaml")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		_, _ = w.Write(specContent)
	})

	// Serve Swagger UI from embedded files
	r.Get("/swagger/*", func(w http.ResponseWriter, r *http.Request) {
		// Get the path after /swagger/
		path := strings.TrimPrefix(r.URL.Path, "/swagger")
		if path == "" || path == "/" {
			path = "/index.html"
		}

		// Try to serve from embedded FS
		subFS, err := fs.Sub(swaggerUI, "swagger-ui")
		if err != nil {
			http.Error(w, "Swagger UI not found", http.StatusNotFound)
			return
		}

		// Set content type based on file extension
		ext := filepath.Ext(path)
		switch ext {
		case ".html":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
		case ".css":
			w.Header().Set("Content-Type", "text/css; charset=utf-8")
		case ".js":
			w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
		case ".png":
			w.Header().Set("Content-Type", "image/png")
		}

		http.StripPrefix("/swagger", http.FileServer(http.FS(subFS))).ServeHTTP(w, r)
	})
}
