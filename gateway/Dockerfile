FROM nginx:1.27-alpine

# Install curl for healthcheck
RUN apk add --no-cache curl

COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80 443

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f -k http://localhost/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
