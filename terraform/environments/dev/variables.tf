variable "aws_region" {
  type        = string
  description = "AWS deployment region"
  default     = "us-east-1"
}

variable "environment" {
  type        = string
  description = "Target deployment environment"
  default     = "dev"
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
  description = "Dev JWT signing secret"
  sensitive   = true
}

variable "turn_password" {
  type        = string
  description = "Password for Coturn STUN/TURN"
  sensitive   = true
}
