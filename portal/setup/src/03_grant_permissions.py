# Databricks notebook source
# Grants the portal service principal the privileges it needs, and creates
# the Databricks workspace groups used for per-catalog access control.
#
# Group naming convention (must match databricks.py):
#   catalog-owner-{catalog_name}
#   catalog-editor-{catalog_name}
#   catalog-viewer-{catalog_name}
#
# Groups are created here for the *portal* catalog itself. Per-data-catalog
# groups are created dynamically by create_unity_catalog() when users register
# a new catalog through the portal. Make sure the SP has CREATE_GROUP permission.

# COMMAND ----------

dbutils.widgets.text("portal_catalog", "portal")
dbutils.widgets.text("sp_app_id", "")
dbutils.widgets.text("warehouse_id", "")

portal_catalog = dbutils.widgets.get("portal_catalog")
sp_app_id      = dbutils.widgets.get("sp_app_id")
warehouse_id   = dbutils.widgets.get("warehouse_id")

# COMMAND ----------

from databricks.sdk import WorkspaceClient
from databricks.sdk.service.catalog import (
    PermissionsChange,
    Privilege,
    SecurableType,
)
from databricks.sdk.service.sql import SetRequest

w = WorkspaceClient()

# COMMAND ----------
# ── 1. Metastore-level: SP can CREATE CATALOG (needed by create_unity_catalog) ─

if sp_app_id:
    metastore_id = w.metastores.current().metastore_id
    w.grants.update(
        full_name=metastore_id,
        securable_type=SecurableType.METASTORE,
        changes=[
            PermissionsChange(
                add=[Privilege.CREATE_CATALOG],
                principal=sp_app_id,
            )
        ],
    )
    print(f"Granted CREATE_CATALOG on metastore to SP: {sp_app_id}")
else:
    print("sp_app_id not set — skipping metastore grant (set it as a job parameter)")

# COMMAND ----------
# ── 2. Portal catalog: SP has full control over governance tables ─────────────

if sp_app_id:
    w.grants.update(
        full_name=portal_catalog,
        securable_type=SecurableType.CATALOG,
        changes=[
            PermissionsChange(
                add=[Privilege.ALL_PRIVILEGES],
                principal=sp_app_id,
            )
        ],
    )
    print(f"Granted ALL_PRIVILEGES on catalog '{portal_catalog}' to SP: {sp_app_id}")

# COMMAND ----------
# ── 3. SQL Warehouse: SP can use the warehouse ───────────────────────────────

if sp_app_id and warehouse_id:
    from databricks.sdk.service.sql import PermissionLevel
    from databricks.sdk.service import sql as sdk_sql

    w.warehouses.set_permissions(
        warehouse_id=warehouse_id,
        access_control_list=[
            sdk_sql.PermissionLevelItem(
                user_name=sp_app_id,
                permission_level=PermissionLevel.CAN_USE,
            )
        ],
    )
    print(f"Granted CAN_USE on warehouse '{warehouse_id}' to SP: {sp_app_id}")
elif not warehouse_id:
    print("warehouse_id not set — skipping warehouse grant")

# COMMAND ----------
# ── 4. Create portal-level workspace groups ──────────────────────────────────
# These groups control access to the portal catalog itself.
# Per-data-catalog groups (e.g. catalog-viewer-vehicle_timeseries) are created
# by create_unity_catalog() at runtime when a catalog is registered.

PORTAL_GROUPS = [
    f"catalog-owner-{portal_catalog}",
    f"catalog-editor-{portal_catalog}",
    f"catalog-viewer-{portal_catalog}",
]

for group_name in PORTAL_GROUPS:
    existing = list(w.groups.list(filter=f'displayName eq "{group_name}"'))
    if existing:
        print(f"  group already exists: {group_name}")
    else:
        w.groups.create(display_name=group_name)
        print(f"  group created: {group_name}")

# COMMAND ----------
# ── 5. Bind group privileges to portal catalog ────────────────────────────────

ROLE_PRIVILEGES = {
    f"catalog-owner-{portal_catalog}":  [Privilege.ALL_PRIVILEGES],
    f"catalog-editor-{portal_catalog}": [Privilege.USE_CATALOG, Privilege.USE_SCHEMA,
                                         Privilege.SELECT, Privilege.MODIFY],
    f"catalog-viewer-{portal_catalog}": [Privilege.USE_CATALOG, Privilege.USE_SCHEMA,
                                         Privilege.SELECT],
}

for group_name, privileges in ROLE_PRIVILEGES.items():
    w.grants.update(
        full_name=portal_catalog,
        securable_type=SecurableType.CATALOG,
        changes=[
            PermissionsChange(add=privileges, principal=group_name)
        ],
    )
    print(f"  privileges set on catalog '{portal_catalog}' for group: {group_name}")

# COMMAND ----------

print("\nSetup complete. Next steps:")
print("  1. Add the SP to 'catalog-owner-portal' group so it can self-manage.")
print("  2. For each new data catalog registered through the portal, the SP will")
print("     automatically create catalog-owner/editor/viewer-{catalog_name} groups.")
print("  3. Set DEV_MODE=false and provide DATABRICKS_SP_CLIENT_ID/SECRET in .env.")
