# Build stage
FROM golang:1.21-alpine AS builder

RUN apk add --no-cache git

WORKDIR /app

COPY go.mod ./
COPY main.go ./

RUN go mod tidy
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -o signaling .

# Run stage
FROM alpine:latest

WORKDIR /app

COPY --from=builder /app/signaling .

# Expose port
EXPOSE 8443

# Run binary
CMD ["./signaling"]
