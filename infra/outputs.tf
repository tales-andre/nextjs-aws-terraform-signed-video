output "app_url" {
  description = "Open this in a browser once the first image is pushed."
  value       = local.app_url
}

output "ecr_repository_url" {
  value = aws_ecr_repository.app.repository_url
}

output "ecs_cluster" {
  value = aws_ecs_cluster.main.name
}

output "ecs_service" {
  value = aws_ecs_service.app.name
}

output "video_bucket" {
  value = aws_s3_bucket.videos.bucket
}

output "github_deploy_role_arn" {
  description = "Put this in the GitHub repository variable AWS_DEPLOY_ROLE_ARN."
  value       = aws_iam_role.github_deploy.arn
}

output "demo_password_parameters" {
  description = "Read with: aws ssm get-parameter --with-decryption --name <name>"
  value = {
    student = aws_ssm_parameter.app["STUDENT_PASSWORD"].name
    admin   = aws_ssm_parameter.app["ADMIN_PASSWORD"].name
  }
}
