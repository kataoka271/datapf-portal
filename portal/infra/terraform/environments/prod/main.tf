# ==============================================================================
# prod 環境
# dev との主な差異:
#   - DEV_MODE = false（実際の Databricks/AWS を使用）
#   - プロビジョニング済み同時実行（コールドスタート対策）
#   - X-Ray トレーシング有効
#   - スロットリング上限を高く設定
#   - CloudFront 料金クラス All（全リージョン配信）
#   - Cognito MFA 有効
#   - Secrets Manager 削除保護（recovery_window_days = 30）
# ==============================================================================

terraform {
  required_version = ">= 1.7"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
  }

  backend "s3" {
    bucket         = "portal-terraform-state-prod"
    key            = "portal/prod/terraform.tfstate"
    region         = "ap-northeast-1"
    encrypt        = true
    dynamodb_table = "portal-terraform-lock"
  }
}

provider "aws" {
  region = var.aws_region
  default_tags { tags = local.tags }
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

locals {
  env    = "prod"
  prefix = "${var.project}-${local.env}"

  tags = {
    Project     = var.project
    Environment = local.env
    ManagedBy   = "Terraform"
    Owner       = var.owner
  }

  allowed_origins = concat(
    ["https://${var.custom_domain}"],
    var.additional_allowed_origins
  )
}

data "aws_caller_identity" "current" {}

# ------------------------------------------------------------------------------
# 1. Secrets Manager
# ------------------------------------------------------------------------------
module "secrets" {
  source = "../../modules/secrets"

  prefix                      = local.prefix
  recovery_window_days        = 30  # prod: 30日間の削除保護
  databricks_host             = var.databricks_host
  databricks_sp_client_id     = var.databricks_sp_client_id
  databricks_sp_client_secret = var.databricks_sp_client_secret
  databricks_sql_warehouse_id = var.databricks_sql_warehouse_id
  oidc_jwks_uri               = var.oidc_jwks_uri
  oidc_audience               = var.oidc_audience
  tags                        = local.tags
}

# ------------------------------------------------------------------------------
# 2. S3 + CloudFront
# ------------------------------------------------------------------------------
module "s3_cloudfront" {
  source = "../../modules/s3_cloudfront"

  prefix               = local.prefix
  aws_account_id       = data.aws_caller_identity.current.account_id
  api_gateway_endpoint = module.api_gateway.api_endpoint
  allowed_origins      = local.allowed_origins
  custom_domain        = var.custom_domain
  acm_certificate_arn  = var.acm_certificate_arn
  route53_zone_id      = var.route53_zone_id

  cloudfront_oac_policy_json = module.iam.s3_cloudfront_oac_policy_json
  cloudfront_price_class     = "PriceClass_All"   # prod: 全リージョン
  video_retention_days       = 730                # prod: 2年保持

  tags = local.tags
}

# ------------------------------------------------------------------------------
# 3. IAM
# ------------------------------------------------------------------------------
module "iam" {
  source = "../../modules/iam"

  prefix                      = local.prefix
  aws_region                  = var.aws_region
  aws_account_id              = data.aws_caller_identity.current.account_id
  video_bucket_arn            = module.s3_cloudfront.video_bucket_arn
  frontend_bucket_arn         = module.s3_cloudfront.frontend_bucket_arn
  databricks_secret_arn       = module.secrets.databricks_secret_arn
  cloudfront_distribution_arn = module.s3_cloudfront.cloudfront_distribution_arn
  ses_sender_email            = var.ses_sender_email
  enable_vpc                  = var.enable_vpc
  vpc_id                      = var.vpc_id
  tags                        = local.tags
}

# ------------------------------------------------------------------------------
# 4. API Gateway
# ------------------------------------------------------------------------------
module "api_gateway" {
  source = "../../modules/api_gateway"

  prefix            = local.prefix
  lambda_invoke_arn = module.lambda.invoke_arn
  allowed_origins   = local.allowed_origins
  oidc_audience     = var.oidc_audience
  oidc_issuer       = var.oidc_issuer

  throttle_burst_limit    = 1000  # prod: 本番スループット
  throttle_rate_limit     = 500
  enable_detailed_metrics = true
  log_retention_days      = 90
  custom_domain           = var.api_custom_domain
  acm_certificate_arn     = var.acm_certificate_arn
  route53_zone_id         = var.route53_zone_id
  alarm_sns_arn           = var.alarm_sns_arn
  alarm_5xx_threshold     = 5
  alarm_latency_threshold = 3000
  tags                    = local.tags
}

# ------------------------------------------------------------------------------
# 5. Lambda
# ------------------------------------------------------------------------------
module "lambda" {
  source = "../../modules/lambda"

  prefix                    = local.prefix
  aws_region                = var.aws_region
  lambda_exec_role_arn      = module.iam.lambda_exec_role_arn
  lambda_zip_path           = var.lambda_zip_path
  layer_zip_path            = var.layer_zip_path
  api_gateway_execution_arn = module.api_gateway.execution_arn

  portal_catalog         = "portal"
  ses_sender_email       = var.ses_sender_email
  video_bucket_name      = module.s3_cloudfront.video_bucket_id
  databricks_secret_name = module.secrets.databricks_secret_name

  dev_mode        = false  # prod: 本番モード
  allowed_origins = local.allowed_origins

  timeout                 = 30
  memory_size             = 1024  # prod: メモリ増量
  log_level               = "WARNING"
  enable_xray             = true  # prod: トレーシング有効
  provisioned_concurrency = var.provisioned_concurrency
  log_retention_days      = 90
  error_rate_threshold    = 5
  p99_duration_threshold  = 5000
  alarm_sns_arn           = var.alarm_sns_arn

  enable_vpc     = var.enable_vpc
  vpc_id         = var.vpc_id
  vpc_subnet_ids = var.vpc_subnet_ids

  tags = local.tags
}

# ------------------------------------------------------------------------------
# 6. SES
# ------------------------------------------------------------------------------
module "ses" {
  source = "../../modules/ses"

  prefix          = local.prefix
  sender_email    = var.ses_sender_email
  sender_domain   = var.ses_sender_domain
  route53_zone_id = var.route53_zone_id
  alarm_sns_arn   = var.alarm_sns_arn
  tags            = local.tags
}

# ------------------------------------------------------------------------------
# 7. Cognito
# ------------------------------------------------------------------------------
module "cognito" {
  source = "../../modules/cognito"

  prefix                = local.prefix
  aws_region            = var.aws_region
  cognito_domain_prefix = "${local.prefix}-portal"
  idc_client_id         = var.idc_client_id
  idc_client_secret     = var.idc_client_secret
  oidc_issuer           = var.oidc_issuer
  callback_urls         = ["https://${var.custom_domain}/callback"]
  logout_urls           = ["https://${var.custom_domain}"]
  enable_mfa            = true   # prod: MFA 有効
  deletion_protection   = true
  tags                  = local.tags
}

# ------------------------------------------------------------------------------
# prod 追加リソース
# ------------------------------------------------------------------------------

# ── WAF（CloudFront 前段）─────────────────────────────────────────────────────
# CloudFront 用 WAF は us-east-1 プロバイダーで作成する必要がある
resource "aws_wafv2_web_acl" "cloudfront" {
  provider    = aws.us_east_1
  name        = "${local.prefix}-waf"
  description = "Portal CloudFront WAF"
  scope       = "CLOUDFRONT"

  default_action { allow {} }

  # AWS マネージドルール: 一般的な脅威対策
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 10
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
        # 大きなリクエストボディは API で必要なためカウントのみ
        rule_action_override {
          name          = "SizeRestrictions_BODY"
          action_to_use { count {} }
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.prefix}-common-ruleset"
      sampled_requests_enabled   = true
    }
  }

  # AWS マネージドルール: SQL インジェクション対策
  rule {
    name     = "AWSManagedRulesSQLiRuleSet"
    priority = 20
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.prefix}-sqli-ruleset"
      sampled_requests_enabled   = true
    }
  }

  # レートリミット: IP ごとに 5 分間 2000 リクエストまで
  rule {
    name     = "RateLimitPerIP"
    priority = 30
    action {
      block {
        custom_response {
          response_code = 429
          response_header {
            name  = "Retry-After"
            value = "60"
          }
        }
      }
    }
    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.prefix}-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  # 地理ブロック（var.waf_blocked_countries が空でない場合のみ有効）
  dynamic "rule" {
    for_each = length(var.waf_blocked_countries) > 0 ? [1] : []
    content {
      name     = "GeoBlock"
      priority = 40
      action { block {} }
      statement {
        geo_match_statement {
          country_codes = var.waf_blocked_countries
        }
      }
      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${local.prefix}-geo-block"
        sampled_requests_enabled   = false
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.prefix}-waf"
    sampled_requests_enabled   = true
  }

  tags = local.tags
}

# WAF アクセスログ → S3
resource "aws_s3_bucket" "waf_logs" {
  # WAF ログバケット名は aws-waf-logs- プレフィックスが必須
  bucket   = "aws-waf-logs-${local.prefix}-${data.aws_caller_identity.current.account_id}"
  provider = aws.us_east_1

  tags = local.tags
}

resource "aws_s3_bucket_lifecycle_configuration" "waf_logs" {
  provider = aws.us_east_1
  bucket   = aws_s3_bucket.waf_logs.id

  rule {
    id     = "expire-waf-logs"
    status = "Enabled"
    filter { prefix = "" }
    expiration { days = 90 }
  }
}

resource "aws_wafv2_web_acl_logging_configuration" "cloudfront" {
  provider                = aws.us_east_1
  log_destination_configs = [aws_s3_bucket.waf_logs.arn]
  resource_arn            = aws_wafv2_web_acl.cloudfront.arn
}

# ── Lambda DLQ（処理失敗メッセージ保全）──────────────────────────────────────
resource "aws_sqs_queue" "lambda_dlq" {
  name                      = "${local.prefix}-lambda-dlq"
  message_retention_seconds = 1209600  # 14日
  kms_master_key_id         = "alias/aws/sqs"

  tags = local.tags
}

# Lambda から DLQ への送信許可
resource "aws_sqs_queue_policy" "lambda_dlq" {
  queue_url = aws_sqs_queue.lambda_dlq.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.lambda_dlq.arn
      Condition = {
        ArnEquals = {
          "aws:SourceArn" = module.lambda.function_arn
        }
      }
    }]
  })
}

# DLQ アラーム（メッセージが入ったら即通知）
resource "aws_cloudwatch_metric_alarm" "dlq_messages" {
  alarm_name          = "${local.prefix}-dlq-messages"
  alarm_description   = "Lambda DLQ にメッセージが入っています（処理失敗）"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 0
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = aws_sqs_queue.lambda_dlq.name }
  period              = 60
  statistic           = "Sum"
  alarm_actions       = var.alarm_sns_arn != "" ? [var.alarm_sns_arn] : []
  treat_missing_data  = "notBreaching"

  tags = local.tags
}

# ── CloudWatch ダッシュボード ─────────────────────────────────────────────────
resource "aws_cloudwatch_dashboard" "portal" {
  dashboard_name = local.prefix

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric"; x = 0; y = 0; width = 12; height = 6
        properties = {
          title   = "Lambda — 呼び出し数 / エラー数"
          period  = 300
          stat    = "Sum"
          view    = "timeSeries"
          metrics = [
            ["AWS/Lambda", "Invocations", "FunctionName", module.lambda.function_name, { label = "呼び出し" }],
            ["AWS/Lambda", "Errors",      "FunctionName", module.lambda.function_name, { label = "エラー", color = "#d13212" }],
            ["AWS/Lambda", "Throttles",   "FunctionName", module.lambda.function_name, { label = "スロットル", color = "#ff9900" }],
          ]
        }
      },
      {
        type = "metric"; x = 12; y = 0; width = 12; height = 6
        properties = {
          title   = "Lambda — レイテンシ（P50 / P99）"
          period  = 300
          view    = "timeSeries"
          metrics = [
            ["AWS/Lambda", "Duration", "FunctionName", module.lambda.function_name, { stat = "p50", label = "P50" }],
            ["AWS/Lambda", "Duration", "FunctionName", module.lambda.function_name, { stat = "p99", label = "P99", color = "#d13212" }],
          ]
        }
      },
      {
        type = "metric"; x = 0; y = 6; width = 12; height = 6
        properties = {
          title   = "API Gateway — リクエスト数 / エラー率"
          period  = 300
          stat    = "Sum"
          view    = "timeSeries"
          metrics = [
            ["AWS/ApiGateway", "Count",    "ApiId", module.api_gateway.api_id, { label = "リクエスト" }],
            ["AWS/ApiGateway", "4XXError", "ApiId", module.api_gateway.api_id, { label = "4xx", color = "#ff9900" }],
            ["AWS/ApiGateway", "5XXError", "ApiId", module.api_gateway.api_id, { label = "5xx", color = "#d13212" }],
          ]
        }
      },
      {
        type = "metric"; x = 12; y = 6; width = 12; height = 6
        properties = {
          title   = "API Gateway — P99 統合レイテンシ"
          period  = 300
          view    = "timeSeries"
          metrics = [
            ["AWS/ApiGateway", "IntegrationLatency", "ApiId", module.api_gateway.api_id, { stat = "p99", label = "P99" }],
            ["AWS/ApiGateway", "Latency",            "ApiId", module.api_gateway.api_id, { stat = "p99", label = "P99(全体)", color = "#aab7b8" }],
          ]
        }
      },
      {
        type = "metric"; x = 0; y = 12; width = 12; height = 6
        properties = {
          title   = "CloudFront — リクエスト数 / エラー率"
          period  = 300
          view    = "timeSeries"
          metrics = [
            ["AWS/CloudFront", "Requests",     "DistributionId", module.s3_cloudfront.cloudfront_distribution_id, { stat = "Sum", label = "リクエスト" }],
            ["AWS/CloudFront", "5xxErrorRate", "DistributionId", module.s3_cloudfront.cloudfront_distribution_id, { stat = "Average", label = "5xxエラー率(%)", color = "#d13212" }],
          ]
        }
      },
      {
        type = "metric"; x = 12; y = 12; width = 12; height = 6
        properties = {
          title   = "CloudFront — キャッシュヒット率"
          period  = 300
          view    = "timeSeries"
          metrics = [
            ["AWS/CloudFront", "CacheHitRate", "DistributionId", module.s3_cloudfront.cloudfront_distribution_id, { stat = "Average", label = "キャッシュヒット率(%)" }],
          ]
        }
      },
      {
        type = "metric"; x = 0; y = 18; width = 8; height = 6
        properties = {
          title   = "WAF — ブロック数"
          period  = 300
          stat    = "Sum"
          view    = "timeSeries"
          metrics = [
            ["AWS/WAFV2", "BlockedRequests", "WebACL", "${local.prefix}-waf", "Region", "us-east-1", "Rule", "ALL", { label = "ブロック合計", color = "#d13212" }],
          ]
        }
      },
      {
        type = "metric"; x = 8; y = 18; width = 8; height = 6
        properties = {
          title   = "SQS DLQ — 未処理メッセージ数"
          period  = 60
          stat    = "Maximum"
          view    = "timeSeries"
          metrics = [
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", aws_sqs_queue.lambda_dlq.name, { label = "DLQ メッセージ数", color = "#d13212" }],
          ]
        }
      },
      {
        type = "alarm"; x = 16; y = 18; width = 8; height = 6
        properties = {
          title  = "アラーム状態"
          alarms = [
            "arn:aws:cloudwatch:${var.aws_region}:${data.aws_caller_identity.current.account_id}:alarm:${local.prefix}-lambda-error-rate",
            "arn:aws:cloudwatch:${var.aws_region}:${data.aws_caller_identity.current.account_id}:alarm:${local.prefix}-lambda-p99-duration",
            "arn:aws:cloudwatch:${var.aws_region}:${data.aws_caller_identity.current.account_id}:alarm:${local.prefix}-lambda-throttles",
            "arn:aws:cloudwatch:${var.aws_region}:${data.aws_caller_identity.current.account_id}:alarm:${local.prefix}-apigw-5xx-rate",
            "arn:aws:cloudwatch:${var.aws_region}:${data.aws_caller_identity.current.account_id}:alarm:${local.prefix}-dlq-messages",
          ]
        }
      }
    ]
  })
}

# ── GitHub Actions 用 OIDC IAM ロール ──────────────────────────────────────────
# GitHub Actions が AWS に認証するための OIDC IdP + IAM ロール
data "aws_iam_openid_connect_provider" "github" {
  # GitHub Actions OIDC IdP が既に存在する場合は data source で参照
  # 存在しない場合は以下のリソースをアンコメントして作成する
  url = "https://token.actions.githubusercontent.com"
}

# 未作成の場合はこちらをアンコメント:
# resource "aws_iam_openid_connect_provider" "github" {
#   url             = "https://token.actions.githubusercontent.com"
#   client_id_list  = ["sts.amazonaws.com"]
#   thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1",
#                      "1c58a3a8518e8759bf075b76b750d4f2df264fcd"]
# }

resource "aws_iam_role" "github_actions" {
  name               = "${local.prefix}-github-actions"
  description        = "GitHub Actions CI/CD 用 IAM ロール（OIDC）"
  assume_role_policy = data.aws_iam_policy_document.github_actions_assume.json
  tags               = local.tags
}

data "aws_iam_policy_document" "github_actions_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      # リポジトリを限定（セキュリティ上重要）
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_org}/${var.github_repo}:*"]
    }
  }
}

resource "aws_iam_policy" "github_actions" {
  name   = "${local.prefix}-github-actions"
  policy = data.aws_iam_policy_document.github_actions_perms.json
}

data "aws_iam_policy_document" "github_actions_perms" {
  # Lambda コード更新
  statement {
    sid     = "LambdaDeploy"
    effect  = "Allow"
    actions = [
      "lambda:UpdateFunctionCode",
      "lambda:UpdateFunctionConfiguration",
      "lambda:GetFunction",
      "lambda:PublishVersion",
      "lambda:UpdateAlias",
      "lambda:WaitForFunction",
    ]
    resources = [module.lambda.function_arn]
  }

  # Lambda レイヤー更新
  statement {
    sid     = "LambdaLayer"
    effect  = "Allow"
    actions = [
      "lambda:PublishLayerVersion",
      "lambda:GetLayerVersion",
    ]
    resources = ["arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:layer:${local.prefix}-deps:*"]
  }

  # S3 フロントエンドデプロイ
  statement {
    sid     = "S3FrontendDeploy"
    effect  = "Allow"
    actions = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
    resources = [
      module.s3_cloudfront.frontend_bucket_arn,
      "${module.s3_cloudfront.frontend_bucket_arn}/*",
    ]
  }

  # CloudFront キャッシュ無効化
  statement {
    sid     = "CloudFrontInvalidate"
    effect  = "Allow"
    actions = [
      "cloudfront:CreateInvalidation",
      "cloudfront:GetInvalidation",
    ]
    resources = ["arn:aws:cloudfront::${data.aws_caller_identity.current.account_id}:distribution/${module.s3_cloudfront.cloudfront_distribution_id}"]
  }

  # Terraform state 読み書き
  statement {
    sid     = "TerraformState"
    effect  = "Allow"
    actions = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
    resources = [
      "arn:aws:s3:::portal-terraform-state-prod",
      "arn:aws:s3:::portal-terraform-state-prod/*",
    ]
  }

  # Terraform DynamoDB ロック
  statement {
    sid     = "TerraformLock"
    effect  = "Allow"
    actions = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"]
    resources = ["arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/portal-terraform-lock"]
  }

  # Terraform が管理するリソースへのフル権限
  # （より細かい制限が必要な場合は各サービスを個別に列挙する）
  statement {
    sid    = "TerraformManaged"
    effect = "Allow"
    actions = [
      "apigateway:*",
      "cloudfront:*",
      "cloudwatch:*",
      "cognito-idp:*",
      "iam:GetRole", "iam:GetPolicy", "iam:GetRolePolicy",
      "iam:ListRolePolicies", "iam:ListAttachedRolePolicies",
      "lambda:*",
      "logs:*",
      "s3:*",
      "secretsmanager:DescribeSecret", "secretsmanager:GetSecretValue",
      "ses:*",
      "sqs:*",
      "wafv2:*",
      "xray:*",
    ]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Project"
      values   = [var.project]
    }
  }
}

resource "aws_iam_role_policy_attachment" "github_actions" {
  role       = aws_iam_role.github_actions.name
  policy_arn = aws_iam_policy.github_actions.arn
}

# ------------------------------------------------------------------------------
# Outputs
# ------------------------------------------------------------------------------
output "cloudfront_url"              { value = "https://${var.custom_domain}" }
output "api_endpoint"                { value = module.api_gateway.api_endpoint }
output "frontend_bucket"             { value = module.s3_cloudfront.frontend_bucket_id }
output "video_bucket"                { value = module.s3_cloudfront.video_bucket_id }
output "lambda_function_name"        { value = module.lambda.function_name }
output "cloudfront_distribution_id"  { value = module.s3_cloudfront.cloudfront_distribution_id }
output "cognito_user_pool_id"        { value = module.cognito.user_pool_id }
output "cognito_web_client_id"       { value = module.cognito.web_client_id }
output "waf_arn"                     { value = aws_wafv2_web_acl.cloudfront.arn }
output "lambda_dlq_url"              { value = aws_sqs_queue.lambda_dlq.url }
output "dashboard_url" {
  value = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${local.prefix}"
}
output "github_actions_role_arn" {
  value       = aws_iam_role.github_actions.arn
  description = "GitHub Actions シークレット AWS_DEPLOY_ROLE_ARN_PROD に設定する"
}
