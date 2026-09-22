output "alb_security_group_id" {
  value       = aws_security_group.alb.id
  description = "Security Group ID for the ALB"
}

output "compute_security_group_id" {
  value       = aws_security_group.compute.id
  description = "Security Group ID for compute instances/containers"
}

output "db_security_group_id" {
  value       = aws_security_group.db.id
  description = "Security Group ID for PostgreSQL RDS"
}

output "coturn_security_group_id" {
  value       = aws_security_group.coturn.id
  description = "Security Group ID for STUN/TURN server"
}
