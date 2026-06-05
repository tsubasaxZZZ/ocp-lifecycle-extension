# Lifecycle Highlighter for OpenShift — 仕様・開発ドキュメント

OpenShift Container Platform のライフサイクルページにある「Life Cycle Dates」表を、
期限の近さに応じて視覚的にハイライトするブラウザ拡張。

ユーザー向けの説明は [README.md](README.md)(英語)/ [README.jp.md](README.jp.md)(日本語)を参照。

## 対象

- URL:
  - `https://access.redhat.com/support/policy/updates/openshift`(OpenShift単体ページ)
  - `https://access.redhat.com/product-life-cycles*`(全製品ページ。RHEL等、表示中の全製品の表を装飾)
  - 言語切替は `rh_locale` Cookie で行われURLは不変。英語・日本語表示の両方に対応
    (日本語はヘッダー・`data-label`・日付形式がローカライズされる)
- ブラウザ: Chrome (Manifest V3)。Edge は同一コードで動作見込み。Firefox は将来対応

## コア機能

### 1. セル単位の期限ハイライト

日付が入った各セルを、今日からの残日数で色分けする。

| 状態 | デフォルト閾値 | 色 |
|---|---|---|
| 期限切れ | 過去日付 | グレー(背景) + 取り消し線 |
| 危険 | 90日以内 | 赤系背景 |
| 警告 | 180日以内 | 橙系背景 |
| 余裕 | 181日以上 | 緑系背景(薄め) |

- **GA列は色分け対象外**(期限ではなく開始日のため)
- `N/A`・`該当なし`・`GA of 4.22 + 3 Months` などパース不能セルはスキップ
- 色はWCAGコントラストを意識し、文字色も背景に合わせて調整

### 2. 残日数表示

- **セル内バッジ**: 日付の横に「あと45日」/「終了済み(33日前)」を常時表示
- ツールチップは採用しない(日付・フェーズ名・残日数すべて表に表示済みで重複するため)

### 3. 凡例の挿入

表の直上に色の意味と現在の閾値を示す凡例を挿入する。
拡張による装飾であることが分かる表記(拡張名)を含める。

### 4. 設定 (options ページ)

- 閾値(危険/警告の日数)をスライダーでカスタム可能(警告 > 危険のバリデーションあり)
- バッジ / 凡例 / 取り消し線の ON/OFF
- 相対日付で動的生成されるサンプルによるライブプレビュー
- 設定は `chrome.storage.sync` に保存し、変更時は開いているタブに即反映
- UI言語は `chrome.i18n` でブラウザUI言語に追従(en / ja)

## アーキテクチャ

- 表は **Lit製Web Component `<plcc-table>` の Shadow DOM 内に動的描画される**。
  内部はヘッダー専用テーブル+フェーズごとの複数テーブルという構成
- コンテンツスクリプトは **Shadow Root を再帰探索**して表を発見する
- 列の特定はセルの **`data-label` / `headers` 属性**(例: `data-label="full-support"`、
  日本語表示では `フルサポート`)で行う。cellIndexやサイトのクラス名に依存しない
- 通常のCSSは Shadow DOM に届かないため、**スタイルは各 Shadow Root に
  `<style data-ocp-lh>` を注入**する
- `MutationObserver` を document と各 Shadow Root の両方に張り、Litの再描画後に再適用
- **期限の抽出は2段構え**: セル内に `<pfe-datetime datetime="...">`(全製品ページ)が
  あれば `.end-date` コンテナ内の datetime 属性(ISO、言語非依存)を使う。
  期間の終了側が `Ongoing`(datetime なし)のセルはスキップ。
  なければテキストをパース(OpenShift単体ページ)。対応形式:
  `March 17, 2026` / `Mar 17, 2026` / `2026-03-17` / `2026年3月17日`。
  テキスト内に複数の日付がある場合は最後尾=終了日を採用。
  判定はユーザーのローカルタイムゾーンの「今日」基準
- フォールバックとして、Shadow DOM を使わない素の table(ヘッダーテキスト判定)にも対応
- 描画元データは Red Hat lifecycle API:
  `https://access.redhat.com/product-life-cycles/api/v1/products?name=OpenShift Container Platform 4`
  (拡張自体はAPIを呼ばずDOMのみ参照。CIの構造チェックがAPIとDOMの両方を監視)

## エッジケース

- 表が複数ある場合: ライフサイクルのヘッダー構成を持つ表のみ対象
- SPA的な再描画で装飾が消える場合: Observer を維持して再適用(自前DOM変更による
  無限ループはノード判定で防止)
- ページ構造変更でパース不能: 何もしない(エラーでページを壊さない)

## 開発

```bash
npm test            # ユニットテスト (node:test)
npm run build       # dist/ に Web Store 用 zip を生成
npm run check:structure            # 実ページ構造の検証 (要 playwright)
node scripts/check-structure.mjs --api-only   # API 部分のみ検証
```

ローカルで試す: `chrome://extensions` → デベロッパーモード → 「パッケージ化されていない拡張機能を読み込む」でリポジトリルートを選択。

### ファイル構成

```
manifest.json            MV3 マニフェスト
src/lib.js               純粋ロジック(日付パース・分類・表検知)— content/options/CI で共用
src/content.js           コンテンツスクリプト(Shadow DOM探索・装飾・スタイル注入・Observer)
src/options.html/.js     設定画面(閾値スライダー・プレビュー付き)
_locales/en,ja           i18n メッセージ(キーは両言語で完全一致、CIで強制)
scripts/check-structure.mjs  構造検証(API + Playwright DOM、英日両方)
scripts/build.sh         zip ビルド
test/lib.test.js         ユニットテスト
```

## CI / CD

| ワークフロー | トリガー | 内容 |
|---|---|---|
| `ci.yml` | push / PR | テスト → manifest・ロケール検証 → zip ビルド → artifact |
| `release.yml` | `v*` タグ push | テスト → タグとmanifestのバージョン一致検証 → Chrome Web Store へアップロード&公開 → GitHub Release 作成 |
| `structure-check.yml` | 毎日 21:00 UTC (06:00 JST) / 手動 | Red Hat の API スキーマと、Playwright で描画した実ページ(**英語・日本語の両方**)の表構造が拡張の想定と一致するか検証。**不一致なら fail し、Issue を自動起票** |

## リリース手順

1. `manifest.json` と `package.json` の `version` を上げる
2. コミットして `v0.1.0` 形式のタグを push → `release.yml` が自動でストアに公開

### 必要な GitHub Secrets

Chrome Web Store API のクレデンシャル([取得手順](https://github.com/fregante/chrome-webstore-upload/blob/main/How%20to%20generate%20Google%20API%20keys.md)):

| Secret | 内容 |
|---|---|
| `CHROME_EXTENSION_ID` | ストアの拡張 ID(初回手動アップロード後に発行) |
| `CHROME_CLIENT_ID` | Google Cloud OAuth クライアント ID |
| `CHROME_CLIENT_SECRET` | OAuth クライアントシークレット |
| `CHROME_REFRESH_TOKEN` | リフレッシュトークン |

注意: **初回のストア登録(デベロッパー登録 $5・最初の zip アップロード・ストア掲載情報の入力)は手動**。
2回目以降のバージョン更新からこのワークフローで自動化される。
ストア掲載文には README と同じ非公式・商標の免責事項を入れること。

## スコープ外(将来候補)

- ライフサイクル表のヘッダー構成が大きく異なる製品への対応
  (現状は General availability / Full support / Maintenance support 列を持つ表のみ検知)
- 「自社のEUS契約有無」を設定し、実質EOL列を強調する機能
- 期限接近時の通知(アイコンバッジ / 定期チェック)
- Firefox 対応
