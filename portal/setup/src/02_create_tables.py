# Databricks notebook source
# All CREATE TABLE statements are idempotent (IF NOT EXISTS).
# Column order matches the positional INSERT calls in routers.py exactly.

# COMMAND ----------

dbutils.widgets.text("portal_catalog", "portal")
c = dbutils.widgets.get("portal_catalog")  # short alias used throughout

# COMMAND ----------

# ── governance.catalog_definitions ──────────────────────────────────────────
# INSERT order (routers.py create_catalog):
#   catalog_name, display_name, description, owner_user_id,
#   requires_approval, status, created_at, updated_at
spark.sql(f"""
  CREATE TABLE IF NOT EXISTS `{c}`.governance.catalog_definitions (
    catalog_name      STRING  NOT NULL,
    display_name      STRING  NOT NULL,
    description       STRING,
    owner_user_id     STRING  NOT NULL,
    requires_approval BOOLEAN NOT NULL DEFAULT false,
    status            STRING  NOT NULL DEFAULT 'ACTIVE',
    created_at        TIMESTAMP NOT NULL,
    updated_at        TIMESTAMP NOT NULL,
    CONSTRAINT pk_catalog_definitions PRIMARY KEY (catalog_name)
  ) USING DELTA
""")
print(f"Table ready: {c}.governance.catalog_definitions")

# COMMAND ----------

# ── governance.mou_definitions ───────────────────────────────────────────────
# INSERT order (routers.py update_mou):
#   uuid(), catalog_name, version, mou_text, checklist_json,
#   is_current, updated_by, updated_at
spark.sql(f"""
  CREATE TABLE IF NOT EXISTS `{c}`.governance.mou_definitions (
    mou_id         STRING    NOT NULL,
    catalog_name   STRING    NOT NULL,
    version        STRING    NOT NULL,
    mou_text       STRING,
    checklist_json STRING,
    is_current     BOOLEAN   NOT NULL DEFAULT false,
    updated_by     STRING,
    updated_at     TIMESTAMP NOT NULL,
    CONSTRAINT pk_mou_definitions PRIMARY KEY (mou_id)
  ) USING DELTA
""")
print(f"Table ready: {c}.governance.mou_definitions")

# COMMAND ----------

# ── governance.mou_agreements ────────────────────────────────────────────────
# INSERT order (routers.py create_access_request):
#   agreement_id, catalog_name, user_id,
#   agreed_mou_version, current_mou_version,
#   checklist_responses, status,
#   agreed_at (current_timestamp()), decided_at (NULL), decided_by (NULL),
#   notes (NULL), revoked_at (NULL)
# Delta CDF required: audit.operation_log reads change feed.
spark.sql(f"""
  CREATE TABLE IF NOT EXISTS `{c}`.governance.mou_agreements (
    agreement_id          STRING    NOT NULL,
    catalog_name          STRING    NOT NULL,
    user_id               STRING    NOT NULL,
    agreed_mou_version    STRING    NOT NULL,
    current_mou_version   STRING    NOT NULL,
    checklist_responses   STRING,
    status                STRING    NOT NULL,
    agreed_at             TIMESTAMP NOT NULL,
    decided_at            TIMESTAMP,
    decided_by            STRING,
    notes                 STRING,
    revoked_at            TIMESTAMP,
    CONSTRAINT pk_mou_agreements PRIMARY KEY (agreement_id)
  ) USING DELTA
  TBLPROPERTIES ('delta.enableChangeDataFeed' = 'true')
""")
print(f"Table ready: {c}.governance.mou_agreements (CDF enabled)")

# COMMAND ----------

# ── apps.app_registry ────────────────────────────────────────────────────────
# INSERT order (routers.py create_app):
#   app_id, name, description, owner_user_id, redirect_url,
#   used_catalog_names (JSON), published_catalog_names (JSON),
#   cognito_client_id (NULL), cognito_user_pool_id (NULL),
#   status, created_at, updated_at
spark.sql(f"""
  CREATE TABLE IF NOT EXISTS `{c}`.apps.app_registry (
    app_id                  STRING    NOT NULL,
    name                    STRING    NOT NULL,
    description             STRING,
    owner_user_id           STRING    NOT NULL,
    redirect_url            STRING,
    used_catalog_names      STRING,
    published_catalog_names STRING,
    cognito_client_id       STRING,
    cognito_user_pool_id    STRING,
    status                  STRING    NOT NULL DEFAULT 'ACTIVE',
    created_at              TIMESTAMP NOT NULL,
    updated_at              TIMESTAMP NOT NULL,
    CONSTRAINT pk_app_registry PRIMARY KEY (app_id)
  ) USING DELTA
""")
print(f"Table ready: {c}.apps.app_registry")

# COMMAND ----------

# ── apps.app_subscriptions ───────────────────────────────────────────────────
# INSERT order (routers.py subscribe_app MERGE … NOT MATCHED):
#   subscription_id, app_id, user_id, status ('ACTIVE'),
#   email_opt_in (false), cognito_provisioned (NULL),
#   subscribed_at (current_timestamp()), revoked_at (NULL)
spark.sql(f"""
  CREATE TABLE IF NOT EXISTS `{c}`.apps.app_subscriptions (
    subscription_id     STRING    NOT NULL,
    app_id              STRING    NOT NULL,
    user_id             STRING    NOT NULL,
    status              STRING    NOT NULL DEFAULT 'ACTIVE',
    email_opt_in        BOOLEAN   NOT NULL DEFAULT false,
    cognito_provisioned BOOLEAN,
    subscribed_at       TIMESTAMP NOT NULL,
    revoked_at          TIMESTAMP,
    CONSTRAINT pk_app_subscriptions PRIMARY KEY (subscription_id)
  ) USING DELTA
""")
print(f"Table ready: {c}.apps.app_subscriptions")

# COMMAND ----------

# ── notifications.inbox ──────────────────────────────────────────────────────
# Columns from SELECT / MERGE / INSERT in routers.py
spark.sql(f"""
  CREATE TABLE IF NOT EXISTS `{c}`.notifications.inbox (
    notification_id   STRING    NOT NULL,
    recipient_user_id STRING    NOT NULL,
    type              STRING    NOT NULL,
    title             STRING    NOT NULL,
    body              STRING,
    related_catalog   STRING,
    related_entity_id STRING,
    is_read           BOOLEAN   NOT NULL DEFAULT false,
    created_at        TIMESTAMP NOT NULL,
    read_at           TIMESTAMP,
    CONSTRAINT pk_notifications_inbox PRIMARY KEY (notification_id)
  ) USING DELTA
""")
print(f"Table ready: {c}.notifications.inbox")

# COMMAND ----------

# ── notifications.quality_alerts ─────────────────────────────────────────────
# Written by Databricks Jobs (monitoring pipeline), read by list_alerts / get_alert.
# Columns from mock_alerts() in mock_data.py.
spark.sql(f"""
  CREATE TABLE IF NOT EXISTS `{c}`.notifications.quality_alerts (
    alert_id          STRING    NOT NULL,
    catalog_name      STRING    NOT NULL,
    table_full_name   STRING    NOT NULL,
    metric_name       STRING    NOT NULL,
    severity          STRING    NOT NULL,
    status            STRING    NOT NULL DEFAULT 'OPEN',
    threshold         DOUBLE,
    actual_value      DOUBLE,
    detail_message    STRING,
    monitoring_run_id STRING,
    triggered_at      TIMESTAMP NOT NULL,
    resolved_at       TIMESTAMP,
    CONSTRAINT pk_quality_alerts PRIMARY KEY (alert_id)
  ) USING DELTA
""")
print(f"Table ready: {c}.notifications.quality_alerts")

# COMMAND ----------

# ── search.search_history ────────────────────────────────────────────────────
spark.sql(f"""
  CREATE TABLE IF NOT EXISTS `{c}`.search.search_history (
    search_id    STRING    NOT NULL,
    user_id      STRING    NOT NULL,
    query        STRING    NOT NULL,
    result_count INT,
    searched_at  TIMESTAMP NOT NULL,
    CONSTRAINT pk_search_history PRIMARY KEY (search_id)
  ) USING DELTA
""")
print(f"Table ready: {c}.search.search_history")

# COMMAND ----------

# ── search.saved_views ───────────────────────────────────────────────────────
# INSERT order (routers.py save_view):
#   view_id, user_id, view_full_name, description (NULL),
#   ddl_sql, status ('ACTIVE'), created_at, deleted_at (NULL)
spark.sql(f"""
  CREATE TABLE IF NOT EXISTS `{c}`.search.saved_views (
    view_id        STRING    NOT NULL,
    user_id        STRING    NOT NULL,
    view_full_name STRING    NOT NULL,
    description    STRING,
    ddl_sql        STRING,
    status         STRING    NOT NULL DEFAULT 'ACTIVE',
    created_at     TIMESTAMP NOT NULL,
    deleted_at     TIMESTAMP,
    CONSTRAINT pk_saved_views PRIMARY KEY (view_id)
  ) USING DELTA
""")
print(f"Table ready: {c}.search.saved_views")

# COMMAND ----------

# ── audit.operation_log ──────────────────────────────────────────────────────
# Planned: FastAPI middleware writes one row per request.
# Delta CDF required for downstream compliance pipelines.
spark.sql(f"""
  CREATE TABLE IF NOT EXISTS `{c}`.audit.operation_log (
    operation_id    STRING    NOT NULL,
    user_id         STRING    NOT NULL,
    method          STRING    NOT NULL,
    endpoint        STRING    NOT NULL,
    catalog_name    STRING,
    request_json    STRING,
    response_status INT,
    created_at      TIMESTAMP NOT NULL,
    CONSTRAINT pk_operation_log PRIMARY KEY (operation_id)
  ) USING DELTA
  TBLPROPERTIES ('delta.enableChangeDataFeed' = 'true')
""")
print(f"Table ready: {c}.audit.operation_log (CDF enabled)")

# COMMAND ----------

print("All tables created successfully.")
