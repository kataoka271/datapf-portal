# ==============================================================================
# Lambda モジュール
# FastAPI (Mangum) ハンドラ・依存関係レイヤー・CloudWatch Logs を管理
# ==============================================================================

# ------------------------------------------------------------------------------
# Lambda レイヤー（Python 依存関係）
# backend/requirements.txt の内容を別レイヤーとして管理し、
# デプロイパッケージを軽量に保つ
# ------------------------------------------------------------------------------
resource "aws_lambda_layer_version" "deps" {
  layer_name          = "${var.prefix}-deps"
  filename            = var.layer_zip_path
  source_code_hash    = filebase64sha256(var.layer_zip_path)
  compatible_runtimes = ["python3.11"]
  description         = "Portal backend Python dependencies"
}

# ------------------------------------------------------------------------------
# Lambda 関数本体
# ------------------------------------------------------------------------------
resource "aws_lambda_function" "api" {
  function_name    = "${var.prefix}-api"
  description      = "データ基盤ポータル API (FastAPI/Mangum)"
  role             = var.lambda_exec_role_arn
  filename         = var.lambda_zip_path
  source_code_hash = filebase64sha256(var.lambda_zip_path)
  handler          = "app.main.handler"
  runtime          = "python3.11"
  timeout          = var.timeout
  memory_size      = var.memory_size

  # 依存関係レイヤー
  layers = [aws_lambda_layer_version.deps.arn]

  # 環境変数（機密情報は Secrets Manager から取得し、起動時にロード）
  environment {
    variables = {
      # アプリ設定
      PORTAL_CATALOG  = var.portal_catalog
      AWS_SES_SENDER  = var.ses_sender_email
      S3_VIDEO_BUCKET = var.video_bucket_name
      AWS_REGION_NAME = var.aws_region # boto3 用（AWS_REGION は予約済み）

      # Secrets Manager シークレット名（起動時に参照）
      SECRET_NAME = var.databricks_secret_name

      # モード
      DEV_MODE = tostring(var.dev_mode)

      # CORS 許可オリジン
      ALLOWED_ORIGINS = join(",", var.allowed_origins)

      # PowerTools（ログ・トレーシング）
      POWERTOOLS_SERVICE_NAME     = "${var.prefix}-api"
      POWERTOOLS_LOG_LEVEL        = var.log_level
      POWERTOOLS_LOGGER_LOG_EVENT = "false"
    }
  }

  # X-Ray アクティブトレーシング
  tracing_config {
    mode = var.enable_xray ? "Active" : "PassThrough"
  }

  # VPC 設定（オプション）
  dynamic "vpc_config" {
    for_each = var.enable_vpc ? [1] : []
    content {
      subnet_ids         = var.vpc_subnet_ids
      security_group_ids = [aws_security_group.lambda[0].id]
    }
  }

  # デッドレターキュー（SQS）
  dynamic "dead_letter_config" {
    for_each = var.dlq_arn != "" ? [1] : []
    content {
      target_arn = var.dlq_arn
    }
  }

  tags = var.tags

  depends_on = [
    aws_cloudwatch_log_group.api,
    aws_lambda_layer_version.deps,
  ]
}

# ------------------------------------------------------------------------------
# プロビジョニングされた同時実行（コールドスタート対策）
# ------------------------------------------------------------------------------
resource "aws_lambda_provisioned_concurrency_config" "api" {
  count                             = var.provisioned_concurrency > 0 ? 1 : 0
  function_name                     = aws_lambda_function.api.function_name
  qualifier                         = aws_lambda_alias.live.name
  provisioned_concurrent_executions = var.provisioned_concurrency
}

# Lambda エイリアス（Blue/Green デプロイ対応）
resource "aws_lambda_alias" "live" {
  name             = "live"
  description      = "本番トラフィック向けエイリアス"
  function_name    = aws_lambda_function.api.function_name
  function_version = "$LATEST"
}

# ------------------------------------------------------------------------------
# CloudWatch Logs
# ------------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${var.prefix}-api"
  retention_in_days = var.log_retention_days

  tags = var.tags
}

# ------------------------------------------------------------------------------
# CloudWatch アラーム
# ------------------------------------------------------------------------------

# エラー率アラーム（5 分間のエラー率が 5% 超）
resource "aws_cloudwatch_metric_alarm" "error_rate" {
  alarm_name          = "${var.prefix}-lambda-error-rate"
  alarm_description   = "Lambda エラー率が閾値を超過"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = var.error_rate_threshold

  metric_query {
    id          = "error_rate"
    expression  = "errors / MAX([errors, invocations]) * 100"
    label       = "Error Rate (%)"
    return_data = true
  }

  metric_query {
    id = "errors"
    metric {
      namespace   = "AWS/Lambda"
      metric_name = "Errors"
      dimensions  = { FunctionName = aws_lambda_function.api.function_name }
      period      = 300
      stat        = "Sum"
    }
  }

  metric_query {
    id = "invocations"
    metric {
      namespace   = "AWS/Lambda"
      metric_name = "Invocations"
      dimensions  = { FunctionName = aws_lambda_function.api.function_name }
      period      = 300
      stat        = "Sum"
    }
  }

  alarm_actions      = var.alarm_sns_arn != "" ? [var.alarm_sns_arn] : []
  ok_actions         = var.alarm_sns_arn != "" ? [var.alarm_sns_arn] : []
  treat_missing_data = "notBreaching"

  tags = var.tags
}

# P99 レイテンシアラーム（5000ms 超）
resource "aws_cloudwatch_metric_alarm" "p99_duration" {
  alarm_name          = "${var.prefix}-lambda-p99-duration"
  alarm_description   = "Lambda P99 レイテンシが閾値を超過"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  threshold           = var.p99_duration_threshold
  namespace           = "AWS/Lambda"
  metric_name         = "Duration"
  dimensions          = { FunctionName = aws_lambda_function.api.function_name }
  period              = 300
  statistic           = "p99"
  alarm_actions       = var.alarm_sns_arn != "" ? [var.alarm_sns_arn] : []
  treat_missing_data  = "notBreaching"

  tags = var.tags
}

# 同時実行数アラーム（スロットリング検知）
resource "aws_cloudwatch_metric_alarm" "throttles" {
  alarm_name          = "${var.prefix}-lambda-throttles"
  alarm_description   = "Lambda スロットリングが発生"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 0
  namespace           = "AWS/Lambda"
  metric_name         = "Throttles"
  dimensions          = { FunctionName = aws_lambda_function.api.function_name }
  period              = 60
  statistic           = "Sum"
  alarm_actions       = var.alarm_sns_arn != "" ? [var.alarm_sns_arn] : []
  treat_missing_data  = "notBreaching"

  tags = var.tags
}

# ------------------------------------------------------------------------------
# VPC セキュリティグループ（VPC 使用時のみ）
# ------------------------------------------------------------------------------
resource "aws_security_group" "lambda" {
  count       = var.enable_vpc ? 1 : 0
  name        = "${var.prefix}-lambda-sg"
  description = "Portal Lambda セキュリティグループ"
  vpc_id      = var.vpc_id

  # アウトバウンド: Databricks/AWS エンドポイントへの HTTPS
  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS outbound (Databricks, AWS APIs)"
  }

  tags = merge(var.tags, { Name = "${var.prefix}-lambda-sg" })
}

# API Gateway → Lambda 呼び出し許可
resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${var.api_gateway_execution_arn}/*/*"
}

# ------------------------------------------------------------------------------
# Outputs
# ------------------------------------------------------------------------------
output "function_arn" {
  value = aws_lambda_function.api.arn
}

output "function_name" {
  value = aws_lambda_function.api.function_name
}

output "invoke_arn" {
  value = aws_lambda_function.api.invoke_arn
}

output "alias_arn" {
  value = aws_lambda_alias.live.arn
}

output "alias_invoke_arn" {
  value = aws_lambda_alias.live.invoke_arn
}

output "log_group_name" {
  value = aws_cloudwatch_log_group.api.name
}
