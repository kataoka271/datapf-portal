variable "prefix" { type = string }
variable "sender_email" { type = string }
variable "sender_domain" { type = string; default = "" }
variable "route53_zone_id" { type = string; default = "" }
variable "alarm_sns_arn" { type = string; default = "" }
variable "tags" { type = map(string); default = {} }
