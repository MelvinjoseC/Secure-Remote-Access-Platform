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

variable "subnet_ids" {
  type        = list(string)
  description = "Subnet IDs for DB subnet group"
}

variable "security_group_id" {
  type        = string
  description = "Security group ID for RDS"
}

variable "db_name" {
  type        = string
  description = "Database name"
  default     = "remote_access"
}

variable "db_username" {
  type        = string
  description = "Master username for database"
  default     = "platform_admin"
}

variable "db_password" {
  type        = string
  description = "Master password for database"
  sensitive   = true
}

variable "instance_class" {
  type        = string
  description = "RDS instance class"
  default     = "db.t4g.micro"
}

variable "allocated_storage" {
  type        = number
  description = "Allocated storage in GB"
  default     = 20
}

variable "multi_az" {
  type        = bool
  description = "Enable Multi-AZ deployment"
  default     = true
}
