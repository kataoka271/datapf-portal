resource "databricks_catalog" "portal" {
  name    = var.portal_catalog
  comment = "データ基盤ポータルのメタデータカタログ"
}

locals {
  schemas = {
    governance    = "カタログ定義・MOU管理"
    apps          = "データアプリ登録・サブスクリプション"
    notifications = "通知インボックス・品質アラート"
    search        = "横断検索履歴・保存ビュー"
    audit         = "操作監査ログ"
  }
}

resource "databricks_schema" "portal" {
  for_each     = local.schemas
  catalog_name = databricks_catalog.portal.name
  name         = each.key
  comment      = each.value
}
