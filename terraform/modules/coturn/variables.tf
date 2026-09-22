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

variable "public_subnet_id" {
  type        = string
  description = "Public subnet ID for Coturn instance"
}

variable "security_group_id" {
  type        = string
  description = "Security Group ID for Coturn"
}

variable "instance_type" {
  type        = string
  description = "EC2 instance type for Coturn"
  default     = "t3.micro"
}

variable "turn_username" {
  type        = string
  description = "Username for TURN authentication"
  default     = "turnadmin"
}

variable "turn_password" {
  type        = string
  description = "Password for TURN authentication"
  sensitive   = true
}

variable "realm" {
  type        = string
  description = "Realm domain for TURN server"
  default     = "platform.local"
}
