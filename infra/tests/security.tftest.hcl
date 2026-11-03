# Offline tests: the AWS provider is mocked, so no account or credentials are needed.
# `command = apply` runs against the mock (nothing is created anywhere) so computed
# values such as ARNs exist and the policies that reference them can be checked.
# Run: terraform -chdir=infra init -backend=false && terraform -chdir=infra test

mock_provider "aws" {
  mock_data "aws_availability_zones" {
    defaults = {
      names = ["us-east-1a", "us-east-1b"]
    }
  }

  mock_data "aws_ec2_managed_prefix_list" {
    defaults = {
      id = "pl-3b927c52"
    }
  }

  mock_resource "aws_cloudfront_distribution" {
    defaults = {
      arn         = "arn:aws:cloudfront::123456789012:distribution/E2EXAMPLE"
      domain_name = "d111111abcdef8.cloudfront.net"
    }
  }

  # The provider validates ARN-shaped arguments, so mocked ARNs must look real.
  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/mock-role"
    }
  }

  mock_resource "aws_lb" {
    defaults = {
      arn      = "arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/mock/50dc6c495c0c9188"
      dns_name = "mock-123456789.us-east-1.elb.amazonaws.com"
    }
  }

  mock_resource "aws_lb_listener" {
    defaults = {
      arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/mock/50dc6c495c0c9188/f2f7dc8efc522ab2"
    }
  }

  mock_resource "aws_lb_target_group" {
    defaults = {
      arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/mock/73e2d6bc24d8a067"
    }
  }

  mock_resource "aws_ecs_task_definition" {
    defaults = {
      arn = "arn:aws:ecs:us-east-1:123456789012:task-definition/mock:1"
    }
  }

  mock_resource "aws_ecs_service" {
    defaults = {
      id = "arn:aws:ecs:us-east-1:123456789012:service/mock/mock"
    }
  }

  mock_resource "aws_iam_openid_connect_provider" {
    defaults = {
      arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
    }
  }
}

variables {
  github_repository = "example-org/nextjs-aws-terraform-signed-video"
}

run "bucket_is_private_and_only_cloudfront_reads_videos" {
  command = apply

  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.videos.block_public_acls,
      aws_s3_bucket_public_access_block.videos.block_public_policy,
      aws_s3_bucket_public_access_block.videos.ignore_public_acls,
      aws_s3_bucket_public_access_block.videos.restrict_public_buckets,
    ])
    error_message = "All four S3 public access block settings must be on."
  }

  assert {
    condition     = jsondecode(aws_s3_bucket_policy.videos.policy).Statement[0].Principal.Service == "cloudfront.amazonaws.com"
    error_message = "Only the CloudFront service principal may read the bucket."
  }

  assert {
    condition     = jsondecode(aws_s3_bucket_policy.videos.policy).Statement[0].Action == "s3:GetObject"
    error_message = "CloudFront gets read access only."
  }

  assert {
    condition     = endswith(jsondecode(aws_s3_bucket_policy.videos.policy).Statement[0].Resource, "/videos/*")
    error_message = "CloudFront must not read outside videos/ (the lesson list lives in meta/)."
  }

  assert {
    condition     = jsondecode(aws_s3_bucket_policy.videos.policy).Statement[0].Condition.StringEquals["AWS:SourceArn"] == aws_cloudfront_distribution.main.arn
    error_message = "The bucket policy must be pinned to this distribution (OAC SourceArn condition)."
  }

  assert {
    condition     = aws_cloudfront_origin_access_control.videos.signing_behavior == "always" && aws_cloudfront_origin_access_control.videos.signing_protocol == "sigv4"
    error_message = "OAC must sign every request with SigV4."
  }

  assert {
    condition     = length(aws_s3_object.seed_video) == 3
    error_message = "The sample lesson videos should be uploaded."
  }
}

run "videos_need_a_signed_url_and_https" {
  command = apply

  assert {
    condition     = one([for b in aws_cloudfront_distribution.main.ordered_cache_behavior : b if b.path_pattern == "/videos/*"]).trusted_key_groups == tolist([aws_cloudfront_key_group.signer.id])
    error_message = "/videos/* must require a signature from the key group."
  }

  assert {
    condition     = one([for b in aws_cloudfront_distribution.main.ordered_cache_behavior : b if b.path_pattern == "/videos/*"]).viewer_protocol_policy == "https-only"
    error_message = "Signed video links must be HTTPS only."
  }

  assert {
    condition     = one([for b in aws_cloudfront_distribution.main.ordered_cache_behavior : b if b.path_pattern == "/videos/*"]).target_origin_id == "videos-bucket"
    error_message = "/videos/* must be served from the private bucket."
  }

  assert {
    condition     = aws_cloudfront_distribution.main.default_cache_behavior[0].viewer_protocol_policy == "redirect-to-https"
    error_message = "The app must redirect HTTP to HTTPS."
  }

  assert {
    condition     = aws_cloudfront_public_key.signer.encoded_key == tls_private_key.signer.public_key_pem
    error_message = "CloudFront must trust the public half of the key the app signs with."
  }
}

run "load_balancer_only_serves_cloudfront" {
  command = apply

  assert {
    condition     = aws_vpc_security_group_ingress_rule.alb_from_cloudfront.prefix_list_id == "pl-3b927c52" && aws_vpc_security_group_ingress_rule.alb_from_cloudfront.cidr_ipv4 == null
    error_message = "The ALB must accept only CloudFront's origin-facing prefix list, never 0.0.0.0/0."
  }

  assert {
    condition     = aws_lb_listener.http.default_action[0].type == "fixed-response" && aws_lb_listener.http.default_action[0].fixed_response[0].status_code == "403"
    error_message = "Requests without the CloudFront secret header must get 403."
  }

  assert {
    condition     = one(one(aws_lb_listener_rule.from_cloudfront.condition).http_header).values == toset([random_password.origin_verify.result])
    error_message = "The forward rule must match the same secret header CloudFront sends."
  }

  assert {
    condition     = aws_vpc_security_group_ingress_rule.app_from_alb.referenced_security_group_id == aws_security_group.alb.id
    error_message = "The containers must accept traffic from the ALB only."
  }
}

run "secrets_are_not_plain_environment_variables" {
  command = apply

  assert {
    condition = length([
      for e in jsondecode(aws_ecs_task_definition.app.container_definitions)[0].environment : e
      if can(regex("PASSWORD|SECRET|PRIVATE", e.name))
    ]) == 0
    error_message = "Passwords, the auth secret and the signing key must not be plain environment variables."
  }

  assert {
    condition = toset([for s in jsondecode(aws_ecs_task_definition.app.container_definitions)[0].secrets : s.name]) == toset([
      "NEXTAUTH_SECRET", "STUDENT_PASSWORD", "ADMIN_PASSWORD", "CF_PRIVATE_KEY",
    ])
    error_message = "The app secrets must come from SSM Parameter Store."
  }

  assert {
    condition     = alltrue([for p in aws_ssm_parameter.app : p.type == "SecureString"])
    error_message = "All app parameters must be SecureString."
  }

  assert {
    condition     = !strcontains(aws_iam_role_policy.task_bucket.policy, "DeleteObject") && !strcontains(aws_iam_role_policy.task_bucket.policy, "s3:*")
    error_message = "The app role must not be able to delete objects or use s3:*."
  }
}

run "github_can_deploy_only_from_this_repo_and_environment" {
  command = apply

  assert {
    condition     = jsondecode(aws_iam_role.github_deploy.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] == "repo:example-org/nextjs-aws-terraform-signed-video:environment:aws-deploy"
    error_message = "The deploy role must trust one repository and one GitHub environment."
  }

  assert {
    condition     = jsondecode(aws_iam_role.github_deploy.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:aud"] == "sts.amazonaws.com"
    error_message = "The OIDC audience must be sts.amazonaws.com."
  }

  assert {
    condition     = length(aws_iam_openid_connect_provider.github) == 1
    error_message = "By default the OIDC provider is created."
  }
}

run "reuses_an_existing_oidc_provider" {
  command = plan

  variables {
    create_github_oidc_provider = false
  }

  assert {
    condition     = length(aws_iam_openid_connect_provider.github) == 0 && length(data.aws_iam_openid_connect_provider.github) == 1
    error_message = "With create_github_oidc_provider = false the existing provider is looked up, not created."
  }
}

run "rejects_a_bad_repository_name" {
  command = plan

  variables {
    github_repository = "not a repo"
  }

  expect_failures = [var.github_repository]
}

run "rejects_a_link_lifetime_out_of_range" {
  command = plan

  variables {
    signed_url_ttl_seconds = 86400
  }

  expect_failures = [var.signed_url_ttl_seconds]
}
