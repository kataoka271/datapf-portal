# Databricks notebook source

# COMMAND ----------

dbutils.widgets.text("portal_catalog", "portal")
catalog = dbutils.widgets.get("portal_catalog")

# COMMAND ----------

spark.sql(f"""
  CREATE CATALOG IF NOT EXISTS `{catalog}`
  COMMENT 'データ基盤ポータルのメタデータカタログ'
""")
print(f"Catalog ready: {catalog}")

# COMMAND ----------

SCHEMAS = {
    "governance":    "カタログ定義・MOU管理",
    "apps":          "データアプリ登録・サブスクリプション",
    "notifications": "通知インボックス・品質アラート",
    "search":        "横断検索履歴・保存ビュー",
    "audit":         "操作監査ログ",
}

for schema, comment in SCHEMAS.items():
    spark.sql(f"""
      CREATE SCHEMA IF NOT EXISTS `{catalog}`.`{schema}`
      COMMENT '{comment}'
    """)
    print(f"  schema ready: {catalog}.{schema}")
