# Factory

## 概要

オークションテンプレートを管理しオークションをデプロイする

「どんなトークンを売るか」によって利用されるファクトリーが変わる

オークション主催者がオークションを開催するためのエントリーポイントになる

## 共通仕様

### オークションテンプレート

- bytes32（utf8 を変換したもの）に対応するアドレスで管理される
- 上書きはできない

### オークションテンプレートの追加

- オーナーのみ可能
- 引数
  - templateName\_
    - bytes32
    - オークションテンプレートの名前
  - templateAddr\_
    - address
    - オークションテンプレートのアドレス
  - signature\_
    - bytes4
    - オークション初期化用関数シグネチャ

### オークションテンプレートの削除

- オーナーのみ可能
- 引数
  - templateName\_
    - bytes32
    - オークションテンプレートの名前

### オークション立ち上げの申し込み

- 引数
  - templateName\_
    - bytes32
    - オークションテンプレートの名前

### オークション立ち上げ

- テンプレートを minimal proxy パターンでデプロイする
- テンプレートアドレスとナンス（オークションデプロイごとにインクリメント）を salt にした CREATE2 によってアドレスが決まる
- デプロイ時に販売トークンをオークションに転送する