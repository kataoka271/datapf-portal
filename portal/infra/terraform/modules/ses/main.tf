# ==============================================================================
# SES モジュール
# メール送信元ドメイン検証・設定セット・送信レート設定
# ==============================================================================

# メール送信元ドメインの検証
resource "aws_sesv2_email_identity" "sender_domain" {
  count          = var.sender_domain != "" ? 1 : 0
  email_identity = var.sender_domain

  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }

  tags = var.tags
}

# 送信元メールアドレスの検証（ドメイン検証していない場合のフォールバック）
resource "aws_sesv2_email_identity" "sender_email" {
  count          = var.sender_domain == "" ? 1 : 0
  email_identity = var.sender_email

  tags = var.tags
}

# SES 設定セット（送信レート・バウンス・苦情処理）
resource "aws_sesv2_configuration_set" "main" {
  configuration_set_name = "${var.prefix}-config"

  sending_options {
    sending_enabled = true
  }

  reputation_options {
    reputation_metrics_enabled = true
  }

  engagement_metrics {
    engagement_metrics_enabled = false
  }

  suppression_options {
    suppressed_reasons = ["BOUNCE", "COMPLAINT"]
  }

  tags = var.tags
}

# CloudWatch へのイベント通知（バウンス・苦情を監視）
resource "aws_sesv2_configuration_set_event_destination" "cloudwatch" {
  configuration_set_name = aws_sesv2_configuration_set.main.configuration_set_name
  event_destination_name = "cloudwatch"

  event_destination {
    enabled              = true
    matching_event_types = ["BOUNCE", "COMPLAINT", "DELIVERY_DELAY"]

    cloud_watch_destination {
      dimension_configuration {
        default_dimension_value = "unknown"
        dimension_name          = "MessageTag"
        dimension_value_source  = "MESSAGE_TAG"
      }
    }
  }
}

# Route 53 への DKIM レコード追加（ドメイン検証時のみ）
resource "aws_route53_record" "dkim" {
  count   = var.sender_domain != "" && var.route53_zone_id != "" ? 3 : 0
  zone_id = var.route53_zone_id
  name    = "${aws_sesv2_email_identity.sender_domain[0].dkim_signing_attributes[0].tokens[count.index]}._domainkey.${var.sender_domain}"
  type    = "CNAME"
  ttl     = 1800
  records = ["${aws_sesv2_email_identity.sender_domain[0].dkim_signing_attributes[0].tokens[count.index]}.dkim.amazonses.com"]
}

# CloudWatch アラーム（バウンス率 > 5%）
resource "aws_cloudwatch_metric_alarm" "bounce_rate" {
  alarm_name          = "${var.prefix}-ses-bounce-rate"
  alarm_description   = "SES メールバウンス率が閾値を超過"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 5
  namespace           = "AWS/SES"
  metric_name         = "Reputation.BounceRate"
  period              = 3600
  statistic           = "Average"
  alarm_actions       = var.alarm_sns_arn != "" ? [var.alarm_sns_arn] : []
  treat_missing_data  = "notBreaching"

  tags = var.tags
}

output "configuration_set_name" {
  value = aws_sesv2_configuration_set.main.configuration_set_name
}

output "sender_identity_arn" {
  value = var.sender_domain != "" ? aws_sesv2_email_identity.sender_domain[0].identity_policy_arn : (
    length(aws_sesv2_email_identity.sender_email) > 0 ? aws_sesv2_email_identity.sender_email[0].identity_policy_arn : ""
  )
}
