# Build stage
FROM golang:1.21-alpine AS builder

RUN apk add --no-cache git

WORKDIR /app

COPY go.mod ./
COPY *.go ./

RUN go mod tidy
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -tags docker -o agent .

# Run stage
FROM alpine:latest

RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY --from=builder /app/agent .
COPY config.yaml ./

# Run binary
CMD ["./agent"]
