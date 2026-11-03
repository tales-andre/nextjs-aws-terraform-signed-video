variable "name" {
  description = "Prefix for every resource name."
  type        = string
  default     = "northwind-academy"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,24}$", var.name))
    error_message = "name must be 3-25 lowercase letters, digits or dashes, starting with a letter."
  }
}

variable "region" {
  description = "AWS region for the app, the bucket and the container service. CloudFront is global."
  type        = string
  default     = "us-east-1"
}

variable "github_repository" {
  description = "owner/name of the GitHub repository allowed to deploy through OIDC."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "github_repository must look like owner/name."
  }
}

variable "github_environment" {
  description = "GitHub Actions environment the deploy job runs in. Only jobs in this environment can assume the deploy role."
  type        = string
  default     = "aws-deploy"
}

variable "create_github_oidc_provider" {
  description = "Set to false if the AWS account already has the token.actions.githubusercontent.com OIDC provider."
  type        = bool
  default     = true
}

variable "image_tag" {
  description = "Container image tag the service runs."
  type        = string
  default     = "latest"
}

variable "desired_count" {
  description = "Number of app containers. 0 stops the containers (the load balancer still bills by the hour)."
  type        = number
  default     = 1

  validation {
    condition     = var.desired_count >= 0 && var.desired_count <= 4
    error_message = "desired_count must be between 0 and 4 for this demo."
  }
}

variable "signed_url_ttl_seconds" {
  description = "How long a signed video link works."
  type        = number
  default     = 300

  validation {
    condition     = var.signed_url_ttl_seconds >= 30 && var.signed_url_ttl_seconds <= 3600
    error_message = "signed_url_ttl_seconds must be between 30 and 3600."
  }
}

variable "cloudfront_price_class" {
  description = "CloudFront price class (which edge locations serve the site)."
  type        = string
  default     = "PriceClass_100"

  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.cloudfront_price_class)
    error_message = "Use PriceClass_100, PriceClass_200 or PriceClass_All."
  }
}

variable "seed_videos_dir" {
  description = "Folder with the sample lesson videos uploaded to the bucket on first apply."
  type        = string
  default     = "../storage/seed"
}
