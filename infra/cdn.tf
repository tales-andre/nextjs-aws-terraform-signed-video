# One CloudFront distribution in front of everything:
#   /videos/*  -> private S3 bucket (OAC), only with a valid signed URL (key group)
#   everything else -> the load balancer (the Next.js app), no caching
# It also gives the app HTTPS on the *.cloudfront.net domain without a certificate.

locals {
  # AWS managed policies (stable, documented IDs).
  cache_policy_caching_disabled  = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
  cache_policy_caching_optimized = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  # AllViewer forwards the viewer's Host header, so Next.js sees the CloudFront domain and its
  # server-action origin check passes. The ALB itself ignores the Host header.
  origin_request_policy_all_viewer = "216adef6-5c7f-47e4-b989-5492eafa07d3"
  s3_origin_id                     = "videos-bucket"
  alb_origin_id                    = "app-alb"
}

# Signing key pair. The private key goes to SSM Parameter Store for the app;
# CloudFront only gets the public key. Note: it is also stored in Terraform state.
resource "tls_private_key" "signer" {
  algorithm = "RSA"
  rsa_bits  = 2048
}

resource "aws_cloudfront_public_key" "signer" {
  name        = "${var.name}-signer"
  encoded_key = tls_private_key.signer.public_key_pem
  comment     = "Verifies signed lesson video URLs"
}

resource "aws_cloudfront_key_group" "signer" {
  name  = "${var.name}-signers"
  items = [aws_cloudfront_public_key.signer.id]
}

resource "aws_cloudfront_origin_access_control" "videos" {
  name                              = "${var.name}-videos"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Shared secret header so the load balancer only serves requests that came through CloudFront.
resource "random_password" "origin_verify" {
  length  = 40
  special = false
}

resource "aws_cloudfront_distribution" "main" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${var.name}: app and signed lesson videos"
  price_class     = var.cloudfront_price_class

  origin {
    origin_id                = local.s3_origin_id
    domain_name              = aws_s3_bucket.videos.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.videos.id
  }

  origin {
    origin_id   = local.alb_origin_id
    domain_name = aws_lb.app.dns_name

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only" # no certificate on the ALB in this demo, see README "Limits"
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    custom_header {
      name  = "X-Origin-Verify"
      value = random_password.origin_verify.result
    }
  }

  default_cache_behavior {
    target_origin_id         = local.alb_origin_id
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = local.cache_policy_caching_disabled
    origin_request_policy_id = local.origin_request_policy_all_viewer
    compress                 = true
  }

  ordered_cache_behavior {
    path_pattern           = "/videos/*"
    target_origin_id       = local.s3_origin_id
    viewer_protocol_policy = "https-only"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = local.cache_policy_caching_optimized
    trusted_key_groups     = [aws_cloudfront_key_group.signer.id]
    compress               = false
  }

  ordered_cache_behavior {
    path_pattern           = "/_next/static/*"
    target_origin_id       = local.alb_origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = local.cache_policy_caching_optimized
    compress               = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}
