# Build stage
FROM golang:1.24-alpine AS builder

WORKDIR /build

# Install dependencies for CGO (if needed)
RUN apk add --no-cache gcc musl-dev

# Copy go mod files first for caching
COPY apps/api/go.mod apps/api/go.sum ./
RUN go mod download

# Copy source code
COPY apps/api/ ./

# Build binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /app/server ./cmd/server

# Runtime stage
FROM alpine:3.19

WORKDIR /app

# Install ca-certificates for HTTPS
RUN apk --no-cache add ca-certificates tzdata

# Copy binary from builder
COPY --from=builder /app/server .

# Create non-root user
RUN adduser -D -g '' appuser
USER appuser

EXPOSE 8080

CMD ["./server"]
