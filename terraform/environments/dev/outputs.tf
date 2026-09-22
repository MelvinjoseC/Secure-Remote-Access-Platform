output "alb_dns_name" {
  value       = module.alb.alb_dns_name
  description = "Entrypoint ALB DNS hostname"
}

output "database_endpoint" {
  value       = module.rds.endpoint
  description = "PostgreSQL RDS connection endpoint"
}

output "turn_server_ip" {
  value       = module.coturn.public_ip
  description = "Public IP address of STUN/TURN server"
}
