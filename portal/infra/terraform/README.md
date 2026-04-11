# Terraform インフラ

データ基盤ポータルの AWS リソースを管理する Terraform コードです。

## ディレクトリ構成

```
infra/terraform/
├── modules/
│   ├── lambda/           Lambda 関数 + レイヤー
│   ├── api_gateway/      API Gateway v2 (HTTP API)
│   ├── s3_cloudfront/    フロントエンド静的配信
│   ├── iam/              IAM ロール・ポリシー
│   ├── ses/              SES メール送信設定
│   ├── cognito/          Cognito User Pool（データアプリ連携用）
│   └── secrets/          Secrets Manager（Databricks 認証情報）
├── environments/
│   ├── dev/              開発環境
│   └── prod/             本番環境
└── README.md
```

## 使い方

```bash
# 初期化（初回のみ）
cd environments/dev
terraform init

# 計画確認
terraform plan -var-file="terraform.tfvars"

# 適用
terraform apply -var-file="terraform.tfvars"

# 削除
terraform destroy -var-file="terraform.tfvars"
```

## 前提条件

- Terraform >= 1.7
- AWS CLI 設定済み（`aws configure`）
- Lambda デプロイパッケージ (`lambda.zip`) を事前にビルドしておく

```bash
# Lambda デプロイパッケージのビルド
cd ../../backend
pip install -r requirements.txt -t dist/
cp -r app dist/
cd dist && zip -r ../lambda.zip . && cd ..
```

## 環境変数 (terraform.tfvars)

`environments/{env}/terraform.tfvars.example` を参照して作成してください。
