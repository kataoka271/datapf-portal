# ==============================================================================
# S3 + CloudFront モジュール
# フロントエンド静的サイト配信・車載動画ストレージを管理
# ==============================================================================

# ------------------------------------------------------------------------------
# フロントエンド S3 バケット
# ------------------------------------------------------------------------------
resource "aws_s3_bucket" "frontend" {
  bucket = "${var.prefix}-frontend-${var.aws_account_id}"

  tags = var.tags
}

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# パブリックアクセスは完全ブロック（CloudFront OAC 経由のみ許可）
resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  # 古いバージョンの自動削除
  rule {
    id     = "delete-old-versions"
    status = "Enabled"
    filter { prefix = "" }
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

# CloudFront OAC バケットポリシー（IAM モジュールから取得）
resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = var.cloudfront_oac_policy_json

  depends_on = [aws_s3_bucket_public_access_block.frontend]
}

# ------------------------------------------------------------------------------
# 車載動画 S3 バケット
# ------------------------------------------------------------------------------
resource "aws_s3_bucket" "video" {
  bucket = "${var.prefix}-video-${var.aws_account_id}"

  tags = var.tags
}

resource "aws_s3_bucket_versioning" "video" {
  bucket = aws_s3_bucket.video.id
  versioning_configuration { status = "Suspended" } # 大容量のため無効化
}

resource "aws_s3_bucket_server_side_encryption_configuration" "video" {
  bucket = aws_s3_bucket.video.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "video" {
  bucket                  = aws_s3_bucket.video.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "video" {
  bucket = aws_s3_bucket.video.id

  # 長期保管: 90日後 S3 Glacier Instant Retrieval へ移行
  rule {
    id     = "archive-old-videos"
    status = "Enabled"
    filter { prefix = "videos/" }

    transition {
      days          = 90
      storage_class = "GLACIER_IR"
    }

    expiration {
      days = var.video_retention_days
    }
  }
}

# CORS（presigned URL で直接ダウンロード可能にする）
resource "aws_s3_bucket_cors_configuration" "video" {
  bucket = aws_s3_bucket.video.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = var.allowed_origins
    expose_headers  = ["ETag", "Content-Length", "Content-Type"]
    max_age_seconds = 3600
  }
}

# ------------------------------------------------------------------------------
# CloudFront OAC (Origin Access Control)
# ------------------------------------------------------------------------------
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.prefix}-frontend-oac"
  description                       = "OAC for Portal frontend S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ------------------------------------------------------------------------------
# CloudFront ディストリビューション
# ------------------------------------------------------------------------------
resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "データ基盤ポータル フロントエンド"
  default_root_object = "index.html"
  price_class         = var.cloudfront_price_class
  aliases             = var.custom_domain != "" ? [var.custom_domain] : []
  http_version        = "http2and3"

  # S3 オリジン
  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "S3-frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  # API Gateway オリジン
  origin {
    domain_name = replace(var.api_gateway_endpoint, "https://", "")
    origin_id   = "APIGateway"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # デフォルトキャッシュビヘイビア（フロントエンド静的ファイル）
  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-frontend"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    cache_policy_id            = aws_cloudfront_cache_policy.static.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.cors_s3.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_rewrite.arn
    }
  }

  # API キャッシュビヘイビア（キャッシュ無効・認証ヘッダー転送）
  ordered_cache_behavior {
    path_pattern           = "/v1/*"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "APIGateway"
    viewer_protocol_policy = "https-only"
    compress               = true

    cache_policy_id          = data.aws_cloudfront_cache_policy.no_cache.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
  }

  # /health エンドポイントも API にルーティング
  ordered_cache_behavior {
    path_pattern             = "/health"
    allowed_methods          = ["GET", "HEAD"]
    cached_methods           = ["GET", "HEAD"]
    target_origin_id         = "APIGateway"
    viewer_protocol_policy   = "https-only"
    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.no_cache.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
  }

  # カスタムエラーレスポンス（SPA のクライアントサイドルーティング対応）
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  # SSL 証明書
  viewer_certificate {
    cloudfront_default_certificate = var.custom_domain == "" ? true : false
    acm_certificate_arn            = var.custom_domain != "" ? var.acm_certificate_arn : null
    ssl_support_method             = var.custom_domain != "" ? "sni-only" : null
    minimum_protocol_version       = var.custom_domain != "" ? "TLSv1.2_2021" : null
  }

  restrictions {
    geo_restriction {
      restriction_type = var.geo_restriction_type
      locations        = var.geo_restriction_locations
    }
  }

  tags = var.tags
}

# ------------------------------------------------------------------------------
# CloudFront キャッシュポリシー
# ------------------------------------------------------------------------------
resource "aws_cloudfront_cache_policy" "static" {
  name        = "${var.prefix}-static-assets"
  comment     = "静的アセット用キャッシュポリシー（1日キャッシュ）"
  default_ttl = 86400
  max_ttl     = 31536000
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config { cookie_behavior = "none" }
    headers_config { header_behavior = "none" }
    query_strings_config { query_string_behavior = "none" }
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

# マネージドポリシー参照
data "aws_cloudfront_cache_policy" "no_cache" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "cors_s3" {
  name = "Managed-CORS-S3Origin"
}

data "aws_cloudfront_origin_request_policy" "all_viewer" {
  name = "Managed-AllViewerExceptHostHeader"
}

# ------------------------------------------------------------------------------
# CloudFront レスポンスヘッダーポリシー（セキュリティヘッダー）
# ------------------------------------------------------------------------------
resource "aws_cloudfront_response_headers_policy" "security" {
  name    = "${var.prefix}-security-headers"
  comment = "セキュリティヘッダーポリシー"

  security_headers_config {
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
    xss_protection {
      mode_block = true
      protection = true
      override   = true
    }
    content_security_policy {
      # フロントエンドの実際の CSP に合わせて調整すること
      content_security_policy = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https:;"
      override                = true
    }
  }
}

# ------------------------------------------------------------------------------
# CloudFront Function（SPA ルーティング: /path → /index.html）
# ------------------------------------------------------------------------------
resource "aws_cloudfront_function" "spa_rewrite" {
  name    = "${var.prefix}-spa-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "SPA クライアントサイドルーティング対応"
  publish = true

  code = <<-EOF
    async function handler(event) {
      const request = event.request;
      const uri = request.uri;

      // ファイル拡張子がある場合はそのまま
      if (uri.match(/\.[a-zA-Z0-9]+$/)) {
        return request;
      }

      // /v1/ など API パスはそのまま
      if (uri.startsWith('/v1/') || uri === '/health') {
        return request;
      }

      // それ以外は index.html に書き換え（SPA ルーティング）
      request.uri = '/index.html';
      return request;
    }
  EOF
}

# ------------------------------------------------------------------------------
# Route 53 レコード（カスタムドメイン使用時）
# ------------------------------------------------------------------------------
resource "aws_route53_record" "frontend" {
  count   = var.custom_domain != "" && var.route53_zone_id != "" ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.custom_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}

# ------------------------------------------------------------------------------
# Outputs
# ------------------------------------------------------------------------------
output "frontend_bucket_id" {
  value = aws_s3_bucket.frontend.id
}

output "frontend_bucket_arn" {
  value = aws_s3_bucket.frontend.arn
}

output "video_bucket_id" {
  value = aws_s3_bucket.video.id
}

output "video_bucket_arn" {
  value = aws_s3_bucket.video.arn
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.frontend.id
}

output "cloudfront_distribution_arn" {
  value = aws_cloudfront_distribution.frontend.arn
}

output "cloudfront_domain_name" {
  value       = aws_cloudfront_distribution.frontend.domain_name
  description = "フロントエンドの CloudFront ドメイン名"
}

output "cloudfront_distribution_url" {
  value = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}
