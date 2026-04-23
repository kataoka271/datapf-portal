# All tables are MANAGED Delta tables in Unity Catalog.
# DEFAULT values and PRIMARY KEY constraints are omitted — Delta enforces neither

# defaults are applied by the application layer (routers.py).

# ── governance.catalog_definitions ───────────────────────────────────────────
resource "databricks_sql_table" "catalog_definitions" {

  catalog_name       = databricks_schema.portal["governance"].catalog_name
  schema_name        = databricks_schema.portal["governance"].name
  name               = "catalog_definitions"
  table_type         = "MANAGED"
  data_source_format = "DELTA"

  column {
    name     = "catalog_name"
    type     = "STRING"
    nullable = false
  }
  column {
    name     = "display_name"
    type     = "STRING"
    nullable = false
  }
  column {
    name = "description"
    type = "STRING"
  }
  column {
    name     = "owner_user_id"
    type     = "STRING"
    nullable = false
  }
  column {
    name     = "requires_approval"
    type     = "BOOLEAN"
    nullable = false
  }
  column {
    name     = "status"
    type     = "STRING"
    nullable = false
  }
  column {
    name     = "created_at"
    type     = "TIMESTAMP"
    nullable = false
  }
  column {
    name     = "updated_at"
    type     = "TIMESTAMP"
    nullable = false
  }

}

# ── governance.mou_definitions ───────────────────────────────────────────────
resource "databricks_sql_table" "mou_definitions" {

  catalog_name       = databricks_schema.portal["governance"].catalog_name
  schema_name        = databricks_schema.portal["governance"].name
  name               = "mou_definitions"
  table_type         = "MANAGED"
  data_source_format = "DELTA"

  column {
    name     = "mou_id"
    type     = "STRING"
    nullable = false
  }
  column {
    name     = "catalog_name"
    type     = "STRING"
    nullable = false
  }
  column {
    name     = "version"
    type     = "STRING"
    nullable = false
  }
  column {
    name = "mou_text"
    type = "STRING"
  }
  column {
    name = "checklist_json"
    type = "STRING"
  }
  column {
    name     = "is_current"
    type     = "BOOLEAN"
    nullable = false
  }
  column {
    name = "updated_by"
    type = "STRING"
  }
  column {
    name     = "updated_at"
    type     = "TIMESTAMP"
    nullable = false
  }

}

# ── governance.mou_agreements (Delta CDF enabled) ────────────────────────────
resource "databricks_sql_table" "mou_agreements" {

  catalog_name       = databricks_schema.portal["governance"].catalog_name
  schema_name        = databricks_schema.portal["governance"].name
  name               = "mou_agreements"
  table_type         = "MANAGED"
  data_source_format = "DELTA"

  column {
    name     = "agreement_id"
    type     = "STRING"
    nullable = false
  }
  column {
    name     = "catalog_name"
    type     = "STRING"
    nullable = false
  }
  column {
    name     = "user_id"
    type     = "STRING"
    nullable = false
  }
  column {
    name     = "agreed_mou_version"
    type     = "STRING"
    nullable = false
  }
  column {
    name     = "current_mou_version"
    type     = "STRING"
    nullable = false
  }
  column {
    name = "checklist_responses"
    type = "STRING"
  }
  column {
    name     = "status"
    type     = "STRING"
    nullable = false
  }
  column {
    name     = "agreed_at"
    type     = "TIMESTAMP"
    nullable = false
  }
  column {
    name = "decided_at"
    type = "TIMESTAMP"
  }
  column {
    name = "decided_by"
    type = "STRING"
  }
  column {
    name = "notes"
    type = "STRING"
  }
  column {
    name = "revoked_at"
    type = "TIMESTAMP"
  }

  properties = {

    "delta.enableChangeDataFeed" = "true"

  }

}

# ── apps.app_registry ────────────────────────────────────────────────────────
resource "databricks_sql_table" "app_registry" {

  catalog_name       = databricks_schema.portal["apps"].catalog_name
  schema_name        = databricks_schema.portal["apps"].name
  name               = "app_registry"
  table_type         = "MANAGED"
  data_source_format = "DELTA"

  column {
    name     = "app_id"
    type     = "STRING"
    nullable = false
  }
  column {
    name     = "name"
    type     = "STRING"
    nullable = false
  }
  column {
    name = "description"
    type = "STRING"
  }
  column {
    name     = "owner_user_id"
    type     = "STRING"
    nullable = false
  }
  column {
    name = "redirect_url"
    type = "STRING"
  }
  column {
    name = "used_catalog_names"
    type = "STRING"
  }
  column {
    name = "published_catalog_names"
    type = "STRING"
  }
  column {
    name = "cognito_client_id"
    type = "STRING"
  }
  column {
    name = "cognito_user_pool_id"
    type = "STRING"
  }
  column {
    name     = "status"
    type     = "STRING"
    nullable = false
  }
  column {
    name     = "created_at"
    type     = "TIMESTAMP"
    nullable = false
  }
  column {
    name     = "updated_at"
    type     = "TIMESTAMP"
    nullable = false
  }

}

# ── apps.app_subscriptions ───────────────────────────────────────────────────
resource "databricks_sql_table" "app_subscriptions" {

  catalog_name       = databricks_schema.portal["apps"].catalog_name
  schema_name        = databricks_schema.portal["apps"].name
  name               = "app_subscriptions"
  table_type         = "MANAGED"
  data_source_format = "DELTA"

  column {
    name     = "subscription_id"
    type     = "STRING"
    nullable = false
  }
  column {
    name     = "app_id"
    type     = "STRING"
    nullable = false
  }
  column {
    name     = "user_id"
    type     = "STRING"
    nullable = false
  }
  column {
    name     = "status"
    type     = "STRING"
    nullable = false
  }
  column {
    name     = "email_opt_in"
    type     = "BOOLEAN"
    nullable = false
  }
  column {
    name = "cognito_provisioned"
    type = "BOOLEAN"
  }
  column {
    name     = "subscribed_at"
    type     = "TIMESTAMP"
    nullable = false
  }
  column {
    name = "revoked_at"
    type = "TIMESTAMP"
  }

}

# ── notifications.inbox ──────────────────────────────────────────────────────
resource "databricks_sql_table" "notifications_inbox" {

  catalog_name       = databricks_schema.portal["notifications"].catalog_name
  schema_name        = databricks_schema.portal["notifications"].name
  name               = "inbox"
  table_type         = "MANAGED"
  data_source_format = "DELTA"

  column {
    name     = "notification_id"
    type     = "STRING"
    nullable = false
  }
  column {
    name     = "recipient_user_id"
    type     = "STRING"
    nullable = false
  }
  column {
    name     = "type"
    type     = "STRING"
    nullable = false
  }
  column {
    name     = "title"
    type     = "STRING"
    nullable = false
  }
  column {
    name = "body"
    type = "STRING"
  }
  column {
    name = "related_catalog"
    type = "STRING"
  }
  column {
    name = "related_entity_id"
    type = "STRING"
  }
  column {
    name     = "is_read"
    type     = "BOOLEAN"
    nullable = false
  }
  column {
    name     = "created_at"
    type     = "TIMESTAMP"
    nullable = false
  }
  column {
    name = "read_at"
    type = "TIMESTAMP"
  }

}

# ── notifications.quality_alerts ─────────────────────────────────────────────
resource "databricks_sql_table" "quality_alerts" {

  catalog_name       = databricks_schema.portal["notifications"].catalog_name
  schema_name        = databricks_schema.portal["notifications"].name
  name               = "quality_alerts"
  table_type         = "MANAGED"
  data_source_format = "DELTA"

  column {
    name     = "alert_id"
    type     = "STRING"
    nullable = false
  }
  column {
    name     = "catalog_name"
    type     = "STRING"
    nullable = false
  }
  column {
    name     = "table_full_name"
    type     = "STRING"
    nullable = false
  }
  column {
    name     = "metric_name"
    type     = "STRING"
    nullable = false
  }
  column {
    name     = "severity"
    type     = "STRING"
    nullable = false
  }
  column {
    name     = "status"
    type     = "STRING"
    nullable = false
  }
  column {
    name = "threshold"
    type = "DOUBLE"
  }
  column {
    name = "actual_value"
    type = "DOUBLE"
  }
  column {
    name = "detail_message"
    type = "STRING"
  }
  column {
    name = "monitoring_run_id"
    type = "STRING"
  }
  column {
    name     = "triggered_at"
    type     = "TIMESTAMP"
    nullable = false
  }
  column {
    name = "resolved_at"
    type = "TIMESTAMP"
  }

}

# ── search.search_history ────────────────────────────────────────────────────
resource "databricks_sql_table" "search_history" {

  catalog_name       = databricks_schema.portal["search"].catalog_name
  schema_name        = databricks_schema.portal["search"].name
  name               = "search_history"
  table_type         = "MANAGED"
  data_source_format = "DELTA"

  column {
    name     = "search_id"
    type     = "STRING"
    nullable = false
  }
  column {
    name     = "user_id"
    type     = "STRING"
    nullable = false
  }
  column {
    name     = "query"
    type     = "STRING"
    nullable = false
  }
  column {
    name = "result_count"
    type = "INT"
  }
  column {
    name     = "searched_at"
    type     = "TIMESTAMP"
    nullable = false
  }

}

# ── search.saved_views ───────────────────────────────────────────────────────
resource "databricks_sql_table" "saved_views" {

  catalog_name       = databricks_schema.portal["search"].catalog_name
  schema_name        = databricks_schema.portal["search"].name
  name               = "saved_views"
  table_type         = "MANAGED"
  data_source_format = "DELTA"

  column {
    name     = "view_id"
    type     = "STRING"
    nullable = false
  }
  column {
    name     = "user_id"
    type     = "STRING"
    nullable = false
  }
  column {
    name     = "view_full_name"
    type     = "STRING"
    nullable = false
  }
  column {
    name = "description"
    type = "STRING"
  }
  column {
    name = "ddl_sql"
    type = "STRING"
  }
  column {
    name     = "status"
    type     = "STRING"
    nullable = false
  }
  column {
    name     = "created_at"
    type     = "TIMESTAMP"
    nullable = false
  }
  column {
    name = "deleted_at"
    type = "TIMESTAMP"
  }

}

# ── audit.operation_log (Delta CDF enabled) ───────────────────────────────────
resource "databricks_sql_table" "operation_log" {

  catalog_name       = databricks_schema.portal["audit"].catalog_name
  schema_name        = databricks_schema.portal["audit"].name
  name               = "operation_log"
  table_type         = "MANAGED"
  data_source_format = "DELTA"

  column {
    name     = "operation_id"
    type     = "STRING"
    nullable = false
  }
  column {
    name     = "user_id"
    type     = "STRING"
    nullable = false
  }
  column {
    name     = "method"
    type     = "STRING"
    nullable = false
  }
  column {
    name     = "endpoint"
    type     = "STRING"
    nullable = false
  }
  column {
    name = "catalog_name"
    type = "STRING"
  }
  column {
    name = "request_json"
    type = "STRING"
  }
  column {
    name = "response_status"
    type = "INT"
  }
  column {
    name     = "created_at"
    type     = "TIMESTAMP"
    nullable = false
  }

  properties = {

    "delta.enableChangeDataFeed" = "true"

  }

}
