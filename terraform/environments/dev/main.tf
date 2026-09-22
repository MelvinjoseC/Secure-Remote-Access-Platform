terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

module "vpc" {
  source       = "../../modules/vpc"
  project_name = var.project_name
  environment  = var.environment
}

module "security" {
  source       = "../../modules/security"
  project_name = var.project_name
  environment  = var.environment
  vpc_id       = module.vpc.vpc_id
}

module "rds" {
  source            = "../../modules/rds"
  project_name      = var.project_name
  environment       = var.environment
  subnet_ids        = module.vpc.private_db_subnet_ids
  security_group_id = module.security.db_security_group_id
  db_password       = var.db_password
  multi_az          = false
  instance_class    = "db.t4g.micro"
}

module "alb" {
  source            = "../../modules/alb"
  project_name      = var.project_name
  environment       = var.environment
  vpc_id            = module.vpc.vpc_id
  public_subnet_ids = module.vpc.public_subnet_ids
  security_group_id = module.security.alb_security_group_id
}

module "coturn" {
  source            = "../../modules/coturn"
  project_name      = var.project_name
  environment       = var.environment
  vpc_id            = module.vpc.vpc_id
  public_subnet_id  = module.vpc.public_subnet_ids[0]
  security_group_id = module.security.coturn_security_group_id
  turn_password     = var.turn_password
}

module "ecs" {
  source             = "../../modules/ecs"
  project_name       = var.project_name
  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_app_subnet_ids
  security_group_id  = module.security.compute_security_group_id
  frontend_tg_arn    = module.alb.frontend_target_group_arn
  backend_tg_arn     = module.alb.backend_target_group_arn
  signaling_tg_arn   = module.alb.signaling_target_group_arn
  database_url       = "postgresql://platform_admin:${var.db_password}@${module.rds.endpoint}/${module.rds.db_name}"
  jwt_secret         = var.jwt_secret
}
