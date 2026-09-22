variable "aws_region" {
  type        = string
  description = "AWS deployment region"
  default     = "us-east-1"
}

variable "environment" {
  type        = string
  description = "Target deployment environment"
  default     = "prod"
}

variable "project_name" {
  type        = string
  description = "Project name"
  default     = "secure-remote-access"
}

variable "db_password" {
  type        = string
  description = "RDS master password"
  sensitive   = true
}

variable "jwt_secret" {
  type        = string
  description = "Production JWT signing secret"
  sensitive   = true
}

variable "turn_password" {
  type        = string
  description = "Password for Coturn STUN/TURN"
  sensitive   = true
}

variable "certificate_arn" {
  type        = string
  description = "ACM certificate ARN for HTTPS ALB"
  default     = ""
}
