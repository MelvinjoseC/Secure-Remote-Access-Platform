variable "project_name" {
  type        = string
  description = "Project name"
  default     = "secure-remote-access"
}

variable "environment" {
  type        = string
  description = "Deployment environment"
  default     = "prod"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID"
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "Private Subnet IDs for ECS tasks"
}

variable "security_group_id" {
  type        = string
  description = "Security Group ID for ECS tasks"
}

variable "frontend_tg_arn" {
  type        = string
  description = "Frontend target group ARN"
}

variable "backend_tg_arn" {
  type        = string
  description = "Backend target group ARN"
}

variable "signaling_tg_arn" {
  type        = string
  description = "Signaling target group ARN"
}

variable "database_url" {
  type        = string
  description = "PostgreSQL connection string"
  sensitive   = true
}

variable "jwt_secret" {
  type        = string
  description = "JWT secret key"
  sensitive   = true
}
