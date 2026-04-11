variable "prefix" { type = string }
variable "aws_account_id" { type = string }
variable "api_gateway_endpoint" { type = string }
variable "cloudfront_oac_policy_json" { type = string }
variable "allowed_origins" { type = list(string) }

variable "custom_domain" {
  type    = string
  default = ""
}

variable "acm_certificate_arn" {
  description = "CloudFront 用 ACM 証明書 ARN（us-east-1 リージョンのもの）"
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  type    = string
  default = ""
}

variable "cloudfront_price_class" {
  description = "PriceClass_100(北米・欧州) / PriceClass_200(+アジア) / PriceClass_All"
  type        = string
  default     = "PriceClass_200"
}

variable "geo_restriction_type" {
  description = "none / whitelist / blacklist"
  type        = string
  default     = "none"
}

variable "geo_restriction_locations" {
  type    = list(string)
  default = []
}

variable "video_retention_days" {
  description = "車載動画の保持期間（日）"
  type        = number
  default     = 365
}

variable "tags" {
  type    = map(string)
  default = {}
}
