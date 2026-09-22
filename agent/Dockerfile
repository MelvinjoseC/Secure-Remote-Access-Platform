# Build stage
FROM golang:1.21-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /app

COPY go.mod ./
COPY *.go ./

RUN go mod tidy
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -tags docker -o agent .

# Run stage (Hardened, non-root)
FROM alpine:3.20

RUN apk add --no-cache ffmpeg ca-certificates tzdata \
    && addgroup -g 10001 -S appgroup \
    && adduser -u 10001 -S appuser -G appgroup

WORKDIR /app

COPY --from=builder /app/agent /app/agent
COPY config.yaml ./

RUN chown -R appuser:appgroup /app

USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ps aux | grep "[a]gent" || exit 1

CMD ["./agent"]
