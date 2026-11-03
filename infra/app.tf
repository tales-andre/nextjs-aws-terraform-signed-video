# The Next.js container on ECS Fargate behind an Application Load Balancer.
# The ALB only accepts CloudFront's origin-facing IP ranges and, on top of that,
# only forwards requests carrying the secret X-Origin-Verify header.

data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

# ---------- secrets (SSM Parameter Store, SecureString) ----------

resource "random_password" "nextauth_secret" {
  length  = 48
  special = false
}

resource "random_password" "student" {
  length  = 16
  special = false
}

resource "random_password" "admin" {
  length  = 24
  special = false
}

locals {
  ssm_prefix = "/${var.name}"
  app_secrets = {
    NEXTAUTH_SECRET  = random_password.nextauth_secret.result
    STUDENT_PASSWORD = random_password.student.result
    ADMIN_PASSWORD   = random_password.admin.result
    CF_PRIVATE_KEY   = tls_private_key.signer.private_key_pem
  }
  app_url = "https://${aws_cloudfront_distribution.main.domain_name}"
}

resource "aws_ssm_parameter" "app" {
  # Iterate over the names only: for_each cannot take the (sensitive) values.
  for_each = toset(["NEXTAUTH_SECRET", "STUDENT_PASSWORD", "ADMIN_PASSWORD", "CF_PRIVATE_KEY"])
  name     = "${local.ssm_prefix}/${lower(replace(each.key, "_", "-"))}"
  type     = "SecureString"
  value    = local.app_secrets[each.key]
}

# ---------- container registry ----------

resource "aws_ecr_repository" "app" {
  name                 = var.name
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last 10 images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 10 }
      action       = { type = "expire" }
    }]
  })
}

# ---------- IAM ----------

resource "aws_iam_role" "execution" {
  name = "${var.name}-ecs-execution"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# The execution role reads the app's parameters at container start; nothing else.
resource "aws_iam_role_policy" "execution_secrets" {
  name = "read-app-parameters"
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ssm:GetParameters"]
      Resource = [for p in aws_ssm_parameter.app : p.arn]
    }]
  })
}

resource "aws_iam_role" "task" {
  name = "${var.name}-ecs-task"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

# The app reads and writes lesson videos and the lesson list. It cannot delete objects.
resource "aws_iam_role_policy" "task_bucket" {
  name = "lesson-bucket"
  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # meta/lessons.json is created by Terraform (storage.tf), so no list permission is needed.
        Sid      = "ReadWriteLessons"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject"]
        Resource = ["${aws_s3_bucket.videos.arn}/videos/*", "${aws_s3_bucket.videos.arn}/meta/*"]
      },
    ]
  })
}

# ---------- load balancer ----------

resource "aws_security_group" "alb" {
  name        = "${var.name}-alb"
  description = "Load balancer: HTTP from CloudFront origin-facing ranges only"
  vpc_id      = aws_vpc.main.id
}

resource "aws_vpc_security_group_ingress_rule" "alb_from_cloudfront" {
  security_group_id = aws_security_group.alb.id
  description       = "CloudFront origin-facing"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  prefix_list_id    = data.aws_ec2_managed_prefix_list.cloudfront.id
}

resource "aws_vpc_security_group_egress_rule" "alb_to_app" {
  security_group_id            = aws_security_group.alb.id
  description                  = "To the app containers"
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
  referenced_security_group_id = aws_security_group.app.id
}

resource "aws_lb" "app" {
  name                       = var.name
  load_balancer_type         = "application"
  internal                   = false
  security_groups            = [aws_security_group.alb.id]
  subnets                    = aws_subnet.public[*].id
  drop_invalid_header_fields = true
}

resource "aws_lb_target_group" "app" {
  name        = var.name
  port        = 3000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id

  health_check {
    path                = "/api/health"
    matcher             = "200"
    interval            = 30
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.app.arn
  port              = 80
  protocol          = "HTTP"

  # Anything that did not come through CloudFront (no secret header) gets 403.
  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Forbidden"
      status_code  = "403"
    }
  }
}

resource "aws_lb_listener_rule" "from_cloudfront" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 1

  condition {
    http_header {
      http_header_name = "X-Origin-Verify"
      values           = [random_password.origin_verify.result]
    }
  }

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

# ---------- ECS ----------

resource "aws_security_group" "app" {
  name        = "${var.name}-app"
  description = "App containers: port 3000 from the load balancer only"
  vpc_id      = aws_vpc.main.id
}

resource "aws_vpc_security_group_ingress_rule" "app_from_alb" {
  security_group_id            = aws_security_group.app.id
  description                  = "From the load balancer"
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
  referenced_security_group_id = aws_security_group.alb.id
}

resource "aws_vpc_security_group_egress_rule" "app_https_out" {
  security_group_id = aws_security_group.app.id
  description       = "HTTPS out: ECR image pull, S3, SSM"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${var.name}"
  retention_in_days = 7
}

resource "aws_ecs_cluster" "main" {
  name = var.name
}

resource "aws_ecs_task_definition" "app" {
  family                   = var.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name                   = "app"
    image                  = "${aws_ecr_repository.app.repository_url}:${var.image_tag}"
    essential              = true
    portMappings           = [{ containerPort = 3000, protocol = "tcp" }]
    readonlyRootFilesystem = false
    environment = [
      { name = "NEXTAUTH_URL", value = local.app_url },
      { name = "VIDEO_BASE_URL", value = local.app_url },
      { name = "CF_KEY_PAIR_ID", value = aws_cloudfront_public_key.signer.id },
      { name = "SIGNED_URL_TTL_SECONDS", value = tostring(var.signed_url_ttl_seconds) },
      { name = "STORAGE_DRIVER", value = "s3" },
      { name = "S3_BUCKET", value = aws_s3_bucket.videos.bucket },
      { name = "AWS_REGION", value = var.region },
    ]
    secrets = [for k, p in aws_ssm_parameter.app : { name = k, valueFrom = p.arn }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.app.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "app"
      }
    }
  }])
}

resource "aws_ecs_service" "app" {
  name            = var.name
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = true # no NAT gateway; inbound is still limited to the ALB by the security group
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "app"
    container_port   = 3000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  depends_on = [aws_lb_listener_rule.from_cloudfront]
}
