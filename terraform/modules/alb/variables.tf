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

variable "public_subnet_ids" {
  type        = list(string)
  description = "Public subnet IDs for ALB placement"
}

variable "security_group_id" {
  type        = string
  description = "ALB security group ID"
}

variable "certificate_arn" {
  type        = string
  description = "ACM certificate ARN for HTTPS listener"
  default     = ""
}
