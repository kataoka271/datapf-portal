# ==============================================================================
# dev 環境
# ==============================================================================

terraform {
  required_version = ">= 1.7"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
  }

  # リモートステート（S3 バックエンド）
  # 初回適用前に手動でバケットとテーブルを作成しておくこと
  backend "s3" {
    bucket         = "portal-terraform-state-dev"
    key            = "portal/dev/terraform.tfstate"
    region         = "ap-northeast-1"
    encrypt        = true
    dynamodb_table = "portal-terraform-lock"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.tags
  }
}

# us-east-1 プロバイダー（CloudFront 用 ACM 証明書）
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

# ------------------------------------------------------------------------------
# Locals
# ------------------------------------------------------------------------------
locals {
  env    = "dev"
  prefix = "${var.project}-${local.env}"

  tags = {
    Project     = var.project
    Environment = local.env
    ManagedBy   = "Terraform"
    Owner       = var.owner
  }

  # フロントエンドが許可するオリジン
  allowed_origins = concat(
    [
      "https://${module.s3_cloudfront.cloudfront_domain_name}",
      "http://localhost:5173",
      "http://localhost:4173",
    ],
    var.custom_domain != "" ? ["https://${var.custom_domain}"] : []
  )
}

# ------------------------------------------------------------------------------
# データソース
# ------------------------------------------------------------------------------
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ------------------------------------------------------------------------------
# 1. Secrets Manager（Databricks 認証情報）
# ------------------------------------------------------------------------------
module "secrets" {
  source = "../../modules/secrets"

  prefix                      = local.prefix
  recovery_window_days        = 0  # dev: 即時削除可能
  databricks_host             = var.databricks_host
  databricks_sp_client_id     = var.databricks_sp_client_id
  databricks_sp_client_secret = var.databricks_sp_client_secret
  databricks_sql_warehouse_id = var.databricks_sql_warehouse_id
  oidc_jwks_uri               = var.oidc_jwks_uri
  oidc_audience               = var.oidc_audience
  tags                        = local.tags
}

# ------------------------------------------------------------------------------
# 2. S3 + CloudFront（フロントエンド配信・動画ストレージ）
#    ※ IAM モジュールより先に作成し ARN を取得する必要がある
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
  video_retention_days = 180  # dev: 180日で自動削除

  # IAM ポリシーは IAM モジュールから注入（循環参照を避けるため後続で更新）
  cloudfront_oac_policy_json = module.iam.s3_cloudfront_oac_policy_json

  tags = local.tags
}

# ------------------------------------------------------------------------------
# 3. IAM（Lambda 実行ロール・各種ポリシー）
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
  enable_vpc                  = false
  tags                        = local.tags
}

# ------------------------------------------------------------------------------
# 4. API Gateway v2（JWT オーソライザー付き HTTP API）
#    ※ Lambda より先に実行してから execution_arn を Lambda モジュールへ渡す
# ------------------------------------------------------------------------------
module "api_gateway" {
  source = "../../modules/api_gateway"

  prefix             = local.prefix
  lambda_invoke_arn  = module.lambda.invoke_arn
  allowed_origins    = local.allowed_origins
  oidc_audience      = var.oidc_audience
  oidc_issuer        = var.oidc_issuer

  throttle_burst_limit    = 200   # dev: 低めに設定
  throttle_rate_limit     = 50
  log_retention_days      = 14
  alarm_sns_arn           = var.alarm_sns_arn
  tags                    = local.tags
}

# ------------------------------------------------------------------------------
# 5. Lambda（FastAPI / Mangum）
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

  dev_mode        = true   # dev 環境は常に dev モード
  allowed_origins = local.allowed_origins

  timeout     = 30
  memory_size = 512
  log_level   = "DEBUG"
  enable_xray = false  # dev: コスト削減のため無効

  log_retention_days      = 14
  error_rate_threshold    = 10   # dev: 緩め
  p99_duration_threshold  = 8000
  alarm_sns_arn           = var.alarm_sns_arn
  tags                    = local.tags
}

# ------------------------------------------------------------------------------
# 6. SES（メール送信）
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
# 7. Cognito（データアプリ連携）
# ------------------------------------------------------------------------------
module "cognito" {
  source = "../../modules/cognito"

  prefix                = local.prefix
  aws_region            = var.aws_region
  cognito_domain_prefix = "${local.prefix}-portal"
  idc_client_id         = var.idc_client_id
  idc_client_secret     = var.idc_client_secret
  oidc_issuer           = var.oidc_issuer
  callback_urls         = ["https://${module.s3_cloudfront.cloudfront_domain_name}/callback", "http://localhost:5173/callback"]
  logout_urls           = ["https://${module.s3_cloudfront.cloudfront_domain_name}", "http://localhost:5173"]
  enable_mfa            = false
  deletion_protection   = false  # dev: 削除可能
  tags                  = local.tags
}

# ------------------------------------------------------------------------------
# Outputs
# ------------------------------------------------------------------------------
output "cloudfront_url" {
  value       = module.s3_cloudfront.cloudfront_distribution_url
  description = "フロントエンド URL"
}

output "api_endpoint" {
  value       = module.api_gateway.api_endpoint
  description = "API Gateway エンドポイント"
}

output "frontend_bucket" {
  value       = module.s3_cloudfront.frontend_bucket_id
  description = "フロントエンドデプロイ先 S3 バケット名"
}

output "video_bucket" {
  value       = module.s3_cloudfront.video_bucket_id
  description = "車載動画 S3 バケット名"
}

output "lambda_function_name" {
  value = module.lambda.function_name
}

output "cloudfront_distribution_id" {
  value       = module.s3_cloudfront.cloudfront_distribution_id
  description = "デプロイ後の CloudFront キャッシュ無効化に使用"
}

output "cognito_user_pool_id" {
  value = module.cognito.user_pool_id
}

output "cognito_web_client_id" {
  value = module.cognito.web_client_id
}

# ------------------------------------------------------------------------------
# GitHub Actions 用 OIDC IAM ロール（dev）
# ------------------------------------------------------------------------------
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_role" "github_actions" {
  name        = "${local.prefix}-github-actions"
  description = "GitHub Actions CI/CD 用 IAM ロール（OIDC）"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRoleWithWebIdentity"
      Principal = { Federated = data.aws_iam_openid_connect_provider.github.arn }
      Condition = {
        StringEquals = { "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com" }
        StringLike   = { "token.actions.githubusercontent.com:sub" = "repo:${var.github_org}/${var.github_repo}:*" }
      }
    }]
  })

  tags = local.tags
}

# dev: Lambda + S3 + CloudFront の操作権限のみ（Terraform は除く）
resource "aws_iam_role_policy" "github_actions_dev" {
  name = "deploy-permissions"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "LambdaDeploy"
        Effect = "Allow"
        Action = [
          "lambda:UpdateFunctionCode", "lambda:UpdateFunctionConfiguration",
          "lambda:GetFunction", "lambda:PublishLayerVersion",
        ]
        Resource = [module.lambda.function_arn,
          "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:layer:${local.prefix}-deps:*"]
      },
      {
        Sid    = "S3Deploy"
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
        Resource = [module.s3_cloudfront.frontend_bucket_arn, "${module.s3_cloudfront.frontend_bucket_arn}/*"]
      },
      {
        Sid    = "CloudFrontInvalidate"
        Effect = "Allow"
        Action = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"]
        Resource = ["arn:aws:cloudfront::${data.aws_caller_identity.current.account_id}:distribution/${module.s3_cloudfront.cloudfront_distribution_id}"]
      },
      {
        Sid    = "TerraformState"
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject", "s3:ListBucket", "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"]
        Resource = [
          "arn:aws:s3:::portal-terraform-state-dev",
          "arn:aws:s3:::portal-terraform-state-dev/*",
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/portal-terraform-lock",
        ]
      }
    ]
  })
}

output "github_actions_role_arn" {
  value       = aws_iam_role.github_actions.arn
  description = "GitHub Actions シークレット AWS_DEPLOY_ROLE_ARN_DEV に設定する"
}
