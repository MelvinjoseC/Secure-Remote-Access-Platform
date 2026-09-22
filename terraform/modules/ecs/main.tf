resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-${var.environment}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-cluster"
    Environment = var.environment
  }
}

resource "aws_iam_role" "ecs_execution_role" {
  name = "${var.project_name}-${var.environment}-ecs-exec-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "platform" {
  name              = "/ecs/${var.project_name}-${var.environment}"
  retention_in_days = 30
}

# ECS Task: Backend
resource "aws_ecs_task_definition" "backend" {
  family                   = "${var.project_name}-${var.environment}-backend"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn

  container_definitions = jsonencode([
    {
      name      = "backend"
      image     = "ghcr.io/melvinjosec/secure-remote-access-backend:latest"
      essential = true
      portMappings = [
        {
          containerPort = 8000
          hostPort      = 8000
        }
      ]
      environment = [
        { name = "DATABASE_URL", value = var.database_url },
        { name = "JWT_SECRET", value = var.jwt_secret }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.platform.name
          "awslogs-region"        = "us-east-1"
          "awslogs-stream-prefix" = "backend"
        }
      }
    }
  ])
}

# ECS Service: Backend
resource "aws_ecs_service" "backend" {
  name            = "${var.project_name}-${var.environment}-backend-svc"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = 2
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.backend_tg_arn
    container_name   = "backend"
    container_port   = 8000
  }
}

# ECS Task: Signaling
resource "aws_ecs_task_definition" "signaling" {
  family                   = "${var.project_name}-${var.environment}-signaling"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn

  container_definitions = jsonencode([
    {
      name      = "signaling"
      image     = "ghcr.io/melvinjosec/secure-remote-access-signaling:latest"
      essential = true
      portMappings = [
        {
          containerPort = 8443
          hostPort      = 8443
        }
      ]
      environment = [
        { name = "PORT", value = "8443" }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.platform.name
          "awslogs-region"        = "us-east-1"
          "awslogs-stream-prefix" = "signaling"
        }
      }
    }
  ])
}

# ECS Service: Signaling
resource "aws_ecs_service" "signaling" {
  name            = "${var.project_name}-${var.environment}-signaling-svc"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.signaling.arn
  desired_count   = 2
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.signaling_tg_arn
    container_name   = "signaling"
    container_port   = 8443
  }
}
