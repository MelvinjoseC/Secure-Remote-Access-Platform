output "endpoint" {
  value       = aws_db_instance.postgres.endpoint
  description = "Connection endpoint for RDS instance"
}

output "db_host" {
  value       = aws_db_instance.postgres.address
  description = "Host address for RDS instance"
}

output "db_port" {
  value       = aws_db_instance.postgres.port
  description = "Port for RDS instance"
}

output "db_name" {
  value       = aws_db_instance.postgres.db_name
  description = "Database name"
}
