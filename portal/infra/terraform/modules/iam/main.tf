# ==============================================================================
# IAM モジュール
# Lambda 実行ロール・API Gateway ロール・S3/SES アクセスポリシーを定義
# ==============================================================================

# ------------------------------------------------------------------------------
# Lambda 実行ロール
# ------------------------------------------------------------------------------
resource "aws_iam_role" "lambda_exec" {
  name               = "${var.prefix}-lambda-exec"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json

  tags = var.tags
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# CloudWatch Logs への書き込み
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# VPC 接続（VPC Lambda 使用時のみ有効化）
resource "aws_iam_role_policy_attachment" "lambda_vpc" {
  count      = var.enable_vpc ? 1 : 0
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# ------------------------------------------------------------------------------
# Lambda カスタムポリシー（S3・SES・Secrets Manager・Cognito）
# ------------------------------------------------------------------------------
resource "aws_iam_policy" "lambda_custom" {
  name   = "${var.prefix}-lambda-custom"
  policy = data.aws_iam_policy_document.lambda_custom.json
}

data "aws_iam_policy_document" "lambda_custom" {

  # S3: 車載動画バケットへの読み取り + presigned URL 生成
  statement {
    sid    = "S3VideoAccess"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:ListBucket",
    ]
    resources = [
      var.video_bucket_arn,
      "${var.video_bucket_arn}/*",
    ]
  }

  # S3: フロントエンドビルド成果物の書き込み（CI/CD 用）
  statement {
    sid    = "S3FrontendDeploy"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket",
    ]
    resources = [
      var.frontend_bucket_arn,
      "${var.frontend_bucket_arn}/*",
    ]
  }

  # SES: メール送信
  statement {
    sid    = "SESSendEmail"
    effect = "Allow"
    actions = [
      "ses:SendEmail",
      "ses:SendRawEmail",
    ]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "ses:FromAddress"
      values   = [var.ses_sender_email]
    }
  }

  # Secrets Manager: Databricks 認証情報の読み取り
  statement {
    sid    = "SecretsManagerRead"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret",
    ]
    resources = [
      var.databricks_secret_arn,
    ]
  }

  # Cognito: データアプリ連携のユーザー管理
  statement {
    sid    = "CognitoUserManagement"
    effect = "Allow"
    actions = [
      "cognito-idp:AdminCreateUser",
      "cognito-idp:AdminDeleteUser",
      "cognito-idp:AdminGetUser",
      "cognito-idp:AdminInitiateAuth",
      "cognito-idp:GetOpenIdToken",
      "cognito-idp:ListUsers",
      "cognito-idp:CreateUserPoolClient",
      "cognito-idp:DescribeUserPool",
    ]
    resources = ["arn:aws:cognito-idp:${var.aws_region}:${var.aws_account_id}:userpool/*"]
  }

  # CloudWatch: カスタムメトリクス送信
  statement {
    sid    = "CloudWatchMetrics"
    effect = "Allow"
    actions = [
      "cloudwatch:PutMetricData",
    ]
    resources = ["*"]
  }

  # X-Ray: トレーシング
  statement {
    sid    = "XRayTracing"
    effect = "Allow"
    actions = [
      "xray:PutTraceSegments",
      "xray:PutTelemetryRecords",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy_attachment" "lambda_custom" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = aws_iam_policy.lambda_custom.arn
}

# ------------------------------------------------------------------------------
# CloudFront → S3 OAC 用ポリシー（S3 モジュールから参照）
# ------------------------------------------------------------------------------
data "aws_iam_policy_document" "s3_cloudfront_oac" {
  statement {
    sid    = "AllowCloudFrontOAC"
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    actions   = ["s3:GetObject"]
    resources = ["${var.frontend_bucket_arn}/*"]
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [var.cloudfront_distribution_arn]
    }
  }
}

# ------------------------------------------------------------------------------
# Outputs
# ------------------------------------------------------------------------------
output "lambda_exec_role_arn" {
  value = aws_iam_role.lambda_exec.arn
}

output "lambda_exec_role_name" {
  value = aws_iam_role.lambda_exec.name
}

output "s3_cloudfront_oac_policy_json" {
  value = data.aws_iam_policy_document.s3_cloudfront_oac.json
}
