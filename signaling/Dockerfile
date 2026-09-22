# Build stage
FROM golang:1.21-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /app

COPY go.mod ./
COPY *.go ./

RUN go mod tidy
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o signaling .

# Run stage (Hardened, non-root)
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -g 10001 -S appgroup \
    && adduser -u 10001 -S appuser -G appgroup

WORKDIR /app

COPY --from=builder /app/signaling /app/signaling

# Ensure ownership by unprivileged user
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 8443

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --no-check-certificate --spider -q https://localhost:8443/healthz || exit 1

CMD ["./signaling"]
