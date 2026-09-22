output "alb_dns_name" {
  value       = aws_lb.main.dns_name
  description = "DNS name of the ALB"
}

output "alb_arn" {
  value       = aws_lb.main.arn
  description = "ARN of the ALB"
}

output "frontend_target_group_arn" {
  value       = aws_lb_target_group.frontend.arn
  description = "ARN of the frontend target group"
}

output "backend_target_group_arn" {
  value       = aws_lb_target_group.backend.arn
  description = "ARN of the backend target group"
}

output "signaling_target_group_arn" {
  value       = aws_lb_target_group.signaling.arn
  description = "ARN of the signaling target group"
}
