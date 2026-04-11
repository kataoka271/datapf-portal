# ==============================================================================
# Makefile — データ基盤ポータル デプロイ自動化
#
# 使い方:
#   make build                    # Lambda パッケージをビルド
#   make deploy ENV=dev           # dev 環境にデプロイ
#   make deploy ENV=prod          # prod 環境にデプロイ
#   make destroy ENV=dev          # dev 環境を削除
#   make frontend-deploy ENV=dev  # フロントエンドのみ再デプロイ
#   make lambda-update ENV=dev    # Lambda コードのみ更新（Terraform なし）
# ==============================================================================

ENV           ?= dev
TF_DIR        := infra/terraform/environments/$(ENV)
BACKEND_DIR   := backend
FRONTEND_DIR  := frontend
LAMBDA_ZIP    := $(BACKEND_DIR)/lambda.zip
LAYER_ZIP     := $(BACKEND_DIR)/layer.zip

.PHONY: all build build-layer build-lambda build-frontend \
        deploy plan apply destroy \
        frontend-deploy lambda-update \
        tf-init tf-fmt tf-validate \
        clean help

# ── ビルド ────────────────────────────────────────────────────────────────────

## Lambda 依存関係レイヤーのビルド（requirements.txt が変わった時だけ実行）
build-layer:
	@echo ">>> Lambda レイヤーをビルドします..."
	rm -rf $(BACKEND_DIR)/layer_build
	mkdir -p $(BACKEND_DIR)/layer_build/python
	pip install \
		-r $(BACKEND_DIR)/requirements.txt \
		-t $(BACKEND_DIR)/layer_build/python \
		--platform mlinux_2_x86_64 \
		--implementation cp \
		--python-version 3.11 \
		--only-binary=:all: \
		--upgrade
	cd $(BACKEND_DIR)/layer_build && zip -r ../layer.zip python/
	rm -rf $(BACKEND_DIR)/layer_build
	@echo ">>> レイヤー完成: $(LAYER_ZIP)"

## Lambda アプリコードのビルド
build-lambda:
	@echo ">>> Lambda アプリコードをパッケージします..."
	rm -f $(LAMBDA_ZIP)
	cd $(BACKEND_DIR) && zip -r lambda.zip app/ -x "**/__pycache__/*" -x "**/*.pyc"
	@echo ">>> Lambda パッケージ完成: $(LAMBDA_ZIP)"
	@echo ">>> サイズ: $$(du -sh $(LAMBDA_ZIP) | cut -f1)"

## フロントエンドのビルド
build-frontend:
	@echo ">>> フロントエンドをビルドします..."
	cd $(FRONTEND_DIR) && npm ci && npm run build
	@echo ">>> ビルド完成: $(FRONTEND_DIR)/dist/"

## 全ビルド
build: build-layer build-lambda build-frontend

# ── Terraform ─────────────────────────────────────────────────────────────────

## Terraform 初期化
tf-init:
	@echo ">>> Terraform 初期化 (ENV=$(ENV))..."
	cd $(TF_DIR) && terraform init -upgrade

## フォーマットチェック
tf-fmt:
	terraform fmt -recursive infra/terraform/

## バリデーション
tf-validate: tf-init
	cd $(TF_DIR) && terraform validate

## プラン確認
plan: tf-init
	@echo ">>> Terraform plan (ENV=$(ENV))..."
	@test -f $(TF_DIR)/terraform.tfvars || \
		(echo "ERROR: $(TF_DIR)/terraform.tfvars が見つかりません。.example からコピーしてください。" && exit 1)
	cd $(TF_DIR) && terraform plan -var-file="terraform.tfvars" -out=tfplan

## インフラ適用
apply: tf-init
	@echo ">>> Terraform apply (ENV=$(ENV))..."
	cd $(TF_DIR) && terraform apply -var-file="terraform.tfvars" -auto-approve

## フルデプロイ（ビルド → Terraform apply → フロントエンドアップロード → CF無効化）
deploy: build tf-init
	@echo "========================================"
	@echo "  デプロイ開始: ENV=$(ENV)"
	@echo "========================================"
	@test -f $(TF_DIR)/terraform.tfvars || \
		(echo "ERROR: $(TF_DIR)/terraform.tfvars が見つかりません。" && exit 1)
	$(MAKE) apply ENV=$(ENV)
	$(MAKE) frontend-upload ENV=$(ENV)
	$(MAKE) cf-invalidate ENV=$(ENV)
	@echo "========================================"
	@echo "  デプロイ完了!"
	@echo "  URL: $$(cd $(TF_DIR) && terraform output -raw cloudfront_url)"
	@echo "========================================"

## インフラ削除
destroy: tf-init
	@echo ">>> Terraform destroy (ENV=$(ENV))..."
	@read -p "本当に $(ENV) 環境を削除しますか？ [yes/no]: " ans && [ "$$ans" = "yes" ]
	cd $(TF_DIR) && terraform destroy -var-file="terraform.tfvars" -auto-approve

# ── フロントエンド単体デプロイ ─────────────────────────────────────────────────

## フロントエンドのみ S3 にアップロード + CloudFront 無効化
frontend-deploy: build-frontend frontend-upload cf-invalidate
	@echo ">>> フロントエンドデプロイ完了"

frontend-upload:
	@echo ">>> フロントエンドを S3 にアップロードします..."
	$(eval BUCKET := $(shell cd $(TF_DIR) && terraform output -raw frontend_bucket))
	aws s3 sync $(FRONTEND_DIR)/dist/ s3://$(BUCKET)/ \
		--delete \
		--cache-control "public, max-age=31536000, immutable" \
		--exclude "index.html"
	aws s3 cp $(FRONTEND_DIR)/dist/index.html s3://$(BUCKET)/index.html \
		--cache-control "no-cache, no-store, must-revalidate"
	@echo ">>> アップロード完了: s3://$(BUCKET)/"

cf-invalidate:
	@echo ">>> CloudFront キャッシュを無効化します..."
	$(eval DIST_ID := $(shell cd $(TF_DIR) && terraform output -raw cloudfront_distribution_id))
	aws cloudfront create-invalidation \
		--distribution-id $(DIST_ID) \
		--paths "/*"
	@echo ">>> 無効化リクエスト送信完了"

# ── Lambda 単体更新 ───────────────────────────────────────────────────────────

## Lambda コードのみ更新（Terraform を使わず高速デプロイ）
lambda-update: build-lambda
	@echo ">>> Lambda コードのみ更新します..."
	$(eval FUNC_NAME := $(shell cd $(TF_DIR) && terraform output -raw lambda_function_name))
	aws lambda update-function-code \
		--function-name $(FUNC_NAME) \
		--zip-file fileb://$(LAMBDA_ZIP) \
		--region $(shell cd $(TF_DIR) && terraform output -raw aws_region 2>/dev/null || echo "ap-northeast-1")
	@echo ">>> Lambda 更新完了: $(FUNC_NAME)"

# ── ユーティリティ ────────────────────────────────────────────────────────────

## Terraform state から出力値を表示
outputs:
	cd $(TF_DIR) && terraform output

## バックエンドテスト実行
test:
	cd $(BACKEND_DIR) && python -m pytest tests/ -v

## コードフォーマット
fmt:
	cd $(FRONTEND_DIR) && npx prettier --write src/
	cd $(BACKEND_DIR) && python -m black app/ tests/
	$(MAKE) tf-fmt

## ビルド成果物を削除
clean:
	rm -f $(LAMBDA_ZIP) $(LAYER_ZIP)
	rm -rf $(BACKEND_DIR)/layer_build
	rm -rf $(FRONTEND_DIR)/dist
	rm -f $(TF_DIR)/tfplan
	@echo ">>> クリーン完了"

## ヘルプ
help:
	@echo ""
	@echo "使い方:"
	@echo "  make build                    全ビルド（レイヤー + Lambda + フロントエンド）"
	@echo "  make build-layer              Lambda レイヤーのみビルド"
	@echo "  make build-lambda             Lambda コードのみビルド"
	@echo "  make build-frontend           フロントエンドのみビルド"
	@echo "  make deploy ENV=dev           dev 環境にフルデプロイ"
	@echo "  make deploy ENV=prod          prod 環境にフルデプロイ"
	@echo "  make plan ENV=dev             Terraform plan のみ"
	@echo "  make apply ENV=dev            Terraform apply のみ"
	@echo "  make destroy ENV=dev          dev 環境を削除"
	@echo "  make frontend-deploy ENV=dev  フロントエンドのみ再デプロイ"
	@echo "  make lambda-update ENV=dev    Lambda コードのみ高速更新"
	@echo "  make outputs ENV=dev          Terraform outputs を表示"
	@echo "  make test                     バックエンドテスト実行"
	@echo "  make clean                    ビルド成果物を削除"
	@echo ""
