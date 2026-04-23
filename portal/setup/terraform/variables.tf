variable "databricks_host" {
  description = "Databricks workspace URL. Omit to use DATABRICKS_HOST env var or ~/.databrickscfg."
  type        = string
  default     = null
}

variable "databricks_token" {
  description = "Databricks personal access token. Omit to use DATABRICKS_TOKEN env var or ~/.databrickscfg."
  type        = string
  sensitive   = true
  default     = null
}

variable "databricks_profile" {
  description = "~/.databrickscfg profile name (alternative to host/token)."
  type        = string
  default     = null
}

variable "portal_catalog" {
  description = "Unity Catalog name for all portal governance tables."
  type        = string
  default     = "portal"
}

variable "warehouse_id" {
  description = "SQL Warehouse ID used by the portal backend (DATABRICKS_SQL_WAREHOUSE_ID in .env)."
  type        = string
  default     = ""
}

variable "sp_app_id" {
  description = "Service principal application (client) ID (DATABRICKS_SP_CLIENT_ID in .env)."
  type        = string
  default     = ""
}
