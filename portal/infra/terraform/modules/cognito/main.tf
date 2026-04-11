# ==============================================================================
# Cognito モジュール
# データアプリ連携用 User Pool・IAM Identity Center フェデレーション設定
# ==============================================================================

# ポータル管理の Cognito User Pool（データアプリ連携用）
resource "aws_cognito_user_pool" "portal" {
  name = "${var.prefix}-portal-pool"

  # パスワードポリシー
  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    require_uppercase                = true
    temporary_password_validity_days = 7
  }

  # アカウント復元
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # ユーザー属性
  schema {
    attribute_data_type = "String"
    name                = "email"
    required            = true
    mutable             = true
    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  schema {
    attribute_data_type = "String"
    name                = "iam_user_id"
    required            = false
    mutable             = true
    string_attribute_constraints {
      min_length = 1
      max_length = 128
    }
  }

  # メール検証
  auto_verified_attributes = ["email"]

  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  # 管理者のみユーザー作成可能（セルフサインアップ禁止）
  admin_create_user_config {
    allow_admin_create_user_only = true
    invite_message_template {
      email_subject = "データ基盤ポータル - アプリアクセス情報"
      email_message = "ユーザー名: {username} / 仮パスワード: {####}"
      sms_message   = "{username} / {####}"
    }
  }

  # MFA 設定（任意）
  mfa_configuration = var.enable_mfa ? "OPTIONAL" : "OFF"

  dynamic "software_token_mfa_configuration" {
    for_each = var.enable_mfa ? [1] : []
    content { enabled = true }
  }

  # ユーザープールの削除保護
  deletion_protection = var.deletion_protection ? "ACTIVE" : "INACTIVE"

  tags = var.tags
}

# ドメイン設定（Hosted UI 用）
resource "aws_cognito_user_pool_domain" "portal" {
  domain       = var.cognito_domain_prefix
  user_pool_id = aws_cognito_user_pool.portal.id
}

# OIDC IdP（IAM Identity Center をフェデレーション）
resource "aws_cognito_identity_provider" "idc" {
  user_pool_id  = aws_cognito_user_pool.portal.id
  provider_name = "IAMIdentityCenter"
  provider_type = "OIDC"

  provider_details = {
    client_id                 = var.idc_client_id
    client_secret             = var.idc_client_secret
    attributes_request_method = "GET"
    oidc_issuer               = var.oidc_issuer
    authorize_scopes          = "openid email profile"
  }

  attribute_mapping = {
    email                = "email"
    username             = "sub"
    "custom:iam_user_id" = "sub"
  }

  lifecycle {
    ignore_changes = [provider_details]
  }
}

# ポータル Web アプリ用クライアント
resource "aws_cognito_user_pool_client" "portal_web" {
  name         = "${var.prefix}-web-client"
  user_pool_id = aws_cognito_user_pool.portal.id

  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]

  supported_identity_providers = ["IAMIdentityCenter"]

  callback_urls = var.callback_urls
  logout_urls   = var.logout_urls

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 30

  prevent_user_existence_errors = "ENABLED"

  explicit_auth_flows = [
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
  ]
}

# Lambda → Cognito M2M クライアント（Admin API 呼び出し用）
resource "aws_cognito_user_pool_client" "lambda_m2m" {
  name         = "${var.prefix}-lambda-m2m"
  user_pool_id = aws_cognito_user_pool.portal.id

  generate_secret                      = true
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["client_credentials"]
  allowed_oauth_scopes                 = ["${aws_cognito_resource_server.portal.identifier}/admin"]

  explicit_auth_flows = [
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]
}

# リソースサーバー（M2M スコープ定義）
resource "aws_cognito_resource_server" "portal" {
  identifier   = "https://${var.prefix}.portal.internal"
  name         = "Portal API"
  user_pool_id = aws_cognito_user_pool.portal.id

  scope {
    scope_name        = "admin"
    scope_description = "Lambda からの管理操作"
  }
}

# ------------------------------------------------------------------------------
# Outputs
# ------------------------------------------------------------------------------
output "user_pool_id" {
  value = aws_cognito_user_pool.portal.id
}

output "user_pool_arn" {
  value = aws_cognito_user_pool.portal.arn
}

output "web_client_id" {
  value = aws_cognito_user_pool_client.portal_web.id
}

output "lambda_client_id" {
  value = aws_cognito_user_pool_client.lambda_m2m.id
}

output "lambda_client_secret" {
  value     = aws_cognito_user_pool_client.lambda_m2m.client_secret
  sensitive = true
}

output "hosted_ui_domain" {
  value = "https://${var.cognito_domain_prefix}.auth.${var.aws_region}.amazoncognito.com"
}
