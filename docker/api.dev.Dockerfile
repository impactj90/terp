FROM golang:1.24-alpine

WORKDIR /app

# Install air for hot reload
RUN go install github.com/air-verse/air@v1.52.3

# Install migrate CLI
RUN go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@v4.17.1

# Copy go mod files
COPY apps/api/go.mod apps/api/go.sum ./
RUN go mod download

# Air config will be mounted
CMD ["air", "-c", ".air.toml"]
