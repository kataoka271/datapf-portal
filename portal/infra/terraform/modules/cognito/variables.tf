variable "prefix" { type = string }
variable "aws_region" { type = string }
variable "cognito_domain_prefix" { type = string }
variable "idc_client_id" {
  type      = string
  sensitive = true
}
variable "idc_client_secret" {
  type      = string
  sensitive = true
}
variable "oidc_issuer" { type = string }
variable "callback_urls" { type = list(string) }
variable "logout_urls" { type = list(string) }
variable "enable_mfa" {
  type    = bool
  default = false
}
variable "deletion_protection" {
  type    = bool
  default = true
}
variable "tags" {
  type    = map(string)
  default = {}
}
