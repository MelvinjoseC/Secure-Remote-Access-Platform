variable "project_name" {
  type        = string
  description = "Project name"
  default     = "secure-remote-access"
}

variable "environment" {
  type        = string
  description = "Environment name"
  default     = "prod"
}

variable "vpc_id" {
  type        = string
  description = "ID of the VPC"
}
