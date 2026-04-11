# ==============================================================================
# API Gateway v2 (HTTP API) モジュール
# JWT オーソライザー（IAM Identity Center）・全ルート定義・カスタムドメインを管理
# ==============================================================================

# ------------------------------------------------------------------------------
# HTTP API
# ------------------------------------------------------------------------------
resource "aws_apigatewayv2_api" "main" {
  name          = "${var.prefix}-api"
  protocol_type = "HTTP"
  description   = "データ基盤ポータル API Gateway"

  cors_configuration {
    allow_origins     = var.allowed_origins
    allow_methods     = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers     = ["Content-Type", "Authorization", "X-Amz-Date", "X-Api-Key"]
    expose_headers    = ["Content-Length", "X-Request-Id"]
    max_age           = 300
    allow_credentials = true
  }

  tags = var.tags
}

# ------------------------------------------------------------------------------
# JWT オーソライザー（AWS IAM Identity Center / OIDC）
# ------------------------------------------------------------------------------
resource "aws_apigatewayv2_authorizer" "jwt" {
  api_id           = aws_apigatewayv2_api.main.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "${var.prefix}-jwt-authorizer"

  jwt_configuration {
    audience = [var.oidc_audience]
    issuer   = var.oidc_issuer
  }
}

# ------------------------------------------------------------------------------
# Lambda 統合
# ------------------------------------------------------------------------------
resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = var.lambda_invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
  timeout_milliseconds   = var.integration_timeout_ms

  # レスポンスパラメータはプロキシ統合では不要
}

# ------------------------------------------------------------------------------
# ルート定義
#
# 全リクエストを Lambda に委譲するキャッチオールルートを使用する。
# FastAPI (Mangum) 側でルーティングを処理するため、
# API Gateway レベルではパスごとに個別ルートを定義しない。
# 認証が不要なルート（health・docs）のみ個別に定義して authorizer を外す。
# ------------------------------------------------------------------------------

# ── 認証不要ルート ─────────────────────────────────────────────────────────────

resource "aws_apigatewayv2_route" "health" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /health"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  # authorizer なし（ヘルスチェックは認証不要）
}

resource "aws_apigatewayv2_route" "docs" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /docs"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "openapi_json" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /openapi.json"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

# ── 認証必須: キャッチオール ───────────────────────────────────────────────────
# /v1/** および /v1/** への全メソッドを JWT 認証付きで Lambda に転送

resource "aws_apigatewayv2_route" "catch_all" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "$default"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

# ------------------------------------------------------------------------------
# ステージ（$default = 自動デプロイ）
# ------------------------------------------------------------------------------
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true

  # アクセスログ
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access_log.arn
    format = jsonencode({
      requestId        = "$context.requestId"
      sourceIp         = "$context.identity.sourceIp"
      requestTime      = "$context.requestTime"
      httpMethod       = "$context.httpMethod"
      routeKey         = "$context.routeKey"
      status           = "$context.status"
      responseLength   = "$context.responseLength"
      integrationError = "$context.integration.error"
      authorizerError  = "$context.authorizer.error"
      userAgent        = "$context.identity.userAgent"
    })
  }

  # デフォルトルートスロットリング
  default_route_settings {
    throttling_burst_limit   = var.throttle_burst_limit
    throttling_rate_limit    = var.throttle_rate_limit
    detailed_metrics_enabled = var.enable_detailed_metrics
    logging_level            = "OFF" # HTTP API は ERROR のみ対応
  }

  tags = var.tags
}

# ------------------------------------------------------------------------------
# CloudWatch Logs（アクセスログ）
# ------------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "access_log" {
  name              = "/aws/apigateway/${var.prefix}-api"
  retention_in_days = var.log_retention_days

  tags = var.tags
}

# API Gateway → CloudWatch Logs への書き込みロール
resource "aws_iam_role" "apigw_logs" {
  name               = "${var.prefix}-apigw-logs"
  assume_role_policy = data.aws_iam_policy_document.apigw_assume.json
  tags               = var.tags
}

data "aws_iam_policy_document" "apigw_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["apigateway.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy_attachment" "apigw_logs" {
  role       = aws_iam_role.apigw_logs.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs"
}

# ------------------------------------------------------------------------------
# カスタムドメイン（オプション）
# ------------------------------------------------------------------------------
resource "aws_apigatewayv2_domain_name" "main" {
  count       = var.custom_domain != "" ? 1 : 0
  domain_name = var.custom_domain

  domain_name_configuration {
    certificate_arn = var.acm_certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }

  tags = var.tags
}

resource "aws_apigatewayv2_api_mapping" "main" {
  count       = var.custom_domain != "" ? 1 : 0
  api_id      = aws_apigatewayv2_api.main.id
  domain_name = aws_apigatewayv2_domain_name.main[0].id
  stage       = aws_apigatewayv2_stage.default.id
}

# Route 53 レコード（カスタムドメイン使用時）
resource "aws_route53_record" "api" {
  count   = var.custom_domain != "" && var.route53_zone_id != "" ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.custom_domain
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.main[0].domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.main[0].domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}

# ------------------------------------------------------------------------------
# CloudWatch アラーム
# ------------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "rate_5xx" {
  alarm_name          = "${var.prefix}-apigw-5xx-rate"
  alarm_description   = "API Gateway 5xx エラー率が閾値を超過"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = var.alarm_5xx_threshold
  namespace           = "AWS/ApiGateway"
  metric_name         = "5XXError"
  dimensions = {
    ApiId = aws_apigatewayv2_api.main.id
  }
  period             = 300
  statistic          = "Sum"
  alarm_actions      = var.alarm_sns_arn != "" ? [var.alarm_sns_arn] : []
  treat_missing_data = "notBreaching"

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "latency_p99" {
  alarm_name          = "${var.prefix}-apigw-latency-p99"
  alarm_description   = "API Gateway P99 レイテンシが閾値を超過"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  threshold           = var.alarm_latency_threshold
  namespace           = "AWS/ApiGateway"
  metric_name         = "IntegrationLatency"
  dimensions = {
    ApiId = aws_apigatewayv2_api.main.id
  }
  period             = 300
  extended_statistic = "p99"
  alarm_actions      = var.alarm_sns_arn != "" ? [var.alarm_sns_arn] : []
  treat_missing_data = "notBreaching"

  tags = var.tags
}

# ------------------------------------------------------------------------------
# Outputs
# ------------------------------------------------------------------------------
output "api_id" {
  value = aws_apigatewayv2_api.main.id
}

output "api_endpoint" {
  value       = aws_apigatewayv2_api.main.api_endpoint
  description = "API Gateway のデフォルトエンドポイント URL"
}

output "execution_arn" {
  value = aws_apigatewayv2_api.main.execution_arn
}

output "custom_domain_target" {
  value = var.custom_domain != "" ? aws_apigatewayv2_domain_name.main[0].domain_name_configuration[0].target_domain_name : ""
}

output "access_log_group_name" {
  value = aws_cloudwatch_log_group.access_log.name
}
