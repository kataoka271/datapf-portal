# ── Workspace groups ──────────────────────────────────────────────────────────
# These three groups are created for the portal catalog itself.
# Per-data-catalog groups (catalog-owner/editor/viewer-{name}) are created
# dynamically at runtime by create_unity_catalog() in routers.py.

resource "databricks_group" "catalog_owner" {
  display_name = "catalog-owner-${var.portal_catalog}"
}

resource "databricks_group" "catalog_editor" {
  display_name = "catalog-editor-${var.portal_catalog}"
}

resource "databricks_group" "catalog_viewer" {
  display_name = "catalog-viewer-${var.portal_catalog}"
}

# ── Metastore: SP can CREATE CATALOG ─────────────────────────────────────────
# WARNING: databricks_grants is declarative — it REPLACES all grants on the
# securable. Only enable if you manage metastore grants fully via Terraform.

data "databricks_current_metastore" "this" {}

resource "databricks_grants" "metastore" {
  count     = var.sp_app_id != "" ? 1 : 0
  metastore = data.databricks_current_metastore.this.id

  grant {
    principal  = var.sp_app_id
    privileges = ["CREATE_CATALOG"]
  }
}

# ── Portal catalog: SP full control + group role grants ───────────────────────

resource "databricks_grants" "portal_catalog" {
  catalog = databricks_catalog.portal.name

  dynamic "grant" {
    for_each = var.sp_app_id != "" ? [var.sp_app_id] : []
    content {
      principal  = grant.value
      privileges = ["ALL_PRIVILEGES"]
    }
  }

  grant {
    principal  = databricks_group.catalog_owner.display_name
    privileges = ["ALL_PRIVILEGES"]
  }

  grant {
    principal  = databricks_group.catalog_editor.display_name
    privileges = ["USE_CATALOG", "USE_SCHEMA", "SELECT", "MODIFY"]
  }

  grant {
    principal  = databricks_group.catalog_viewer.display_name
    privileges = ["USE_CATALOG", "USE_SCHEMA", "SELECT"]
  }
}

# ── SQL Warehouse: SP CAN_USE ─────────────────────────────────────────────────

resource "databricks_permissions" "warehouse" {
  count           = var.sp_app_id != "" && var.warehouse_id != "" ? 1 : 0
  sql_endpoint_id = var.warehouse_id

  access_control {
    service_principal_name = var.sp_app_id
    permission_level       = "CAN_USE"
  }
}
