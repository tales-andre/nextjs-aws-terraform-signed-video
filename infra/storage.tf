# Private bucket for lesson videos and the lesson list.
# Nothing in it is public: CloudFront reads videos/* through Origin Access
# Control, and the app's task role reads and writes it.

resource "random_id" "suffix" {
  byte_length = 3
}

resource "aws_s3_bucket" "videos" {
  bucket        = "${var.name}-videos-${random_id.suffix.hex}"
  force_destroy = true # demo: `terraform destroy` also deletes uploaded videos
}

resource "aws_s3_bucket_public_access_block" "videos" {
  bucket                  = aws_s3_bucket.videos.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "videos" {
  bucket = aws_s3_bucket.videos.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "videos" {
  bucket = aws_s3_bucket.videos.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Only this CloudFront distribution may read, and only under videos/.
resource "aws_s3_bucket_policy" "videos" {
  bucket = aws_s3_bucket.videos.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "CloudFrontReadsVideosOnly"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.videos.arn}/videos/*"
        Condition = {
          StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.main.arn }
        }
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.videos.arn, "${aws_s3_bucket.videos.arn}/*"]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      },
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.videos]
}

# Sample lessons, so a fresh deploy has something to play.
resource "aws_s3_object" "seed_video" {
  for_each     = fileset(var.seed_videos_dir, "*.webm")
  bucket       = aws_s3_bucket.videos.id
  key          = "videos/${each.value}"
  source       = "${var.seed_videos_dir}/${each.value}"
  etag         = filemd5("${var.seed_videos_dir}/${each.value}")
  content_type = "video/webm"
}
