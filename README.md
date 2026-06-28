# Club Auto Log (拓殖大学 自動車部)

**Club Auto Log** は、大学自動車部の活動を効率化するために設計された、モバイルファーストのWebアプリケーションです。部車の整備記録、活動日程の管理、部員への情報共有、およびGPSを利用した出退勤打刻機能を備えています。

## 主な機能

このアプリケーションは以下の5つの主要モジュールで構成されています。

### 1\. 整備管理 (Vehicle Management)

部車のコンディション維持に必要なすべての情報を管理します。

  * **車両リスト**: 保有車両の基本情報（車台番号、型式など）の管理。
  * **整備履歴**: 日付、作業内容、メモの記録。完了したタスクからの自動反映機能あり。
  * **カスタマイズ記録**: 取り付けたパーツや仕様の記録。
  * **カンバンボード (タスク管理)**: 「未着手」「作業中」「部品待ち」「完了」のステータス管理。
  * **セッティングログ**: サーキットごとの足回り（減衰、バネレート、キャンバー）やタイヤ内圧の記録。
  * **予備部品管理**: 部室にあるストック部品と保管場所の管理。

### 2\. 部活日程 (Schedule / Practice)

  * **カレンダー表示**: 日本の祝日データ（API連携）を反映した月間カレンダー。
  * **イベント管理**: 練習会、ミーティング、大会などの予定作成・編集。

### 3\. 情報共有 (Wiki)

  * **整備マニュアル**: `Quill.js` を導入したリッチテキストエディタによるナレッジベース。
  * **タグ付け・難易度**: 作業の難易度や所要時間を記録し、技術継承を支援。
  * **画像挿入**: Cloudinaryを利用した本文への画像挿入。

### 4\. 便利ツール (Tools)

  * **ツールリンク集**: 部品検索サイト（EPC-data, PartsFan）や各サーキットの予約ページへのショートカット。
  * **帳票エクスポート**: 活動日程や整備記録を、月次・年次で CSV および PDF 形式で出力（`export.js`）。
## 使用技術

  * **Frontend**: HTML5, CSS3, JavaScript (ES Modules)
      * フレームワークなしのVanilla JS構成
      * Dynamic Importsによるモジュールの遅延読み込み
  * **Backend / Database**: Firebase
      * **Authentication**: メール/パスワード認証
      * **Firestore**: リアルタイムデータベース
  * **Image Storage**: Cloudinary
      * 写真のアップロードとホスティング
  * **Library**:
      * `marked.js`: WikiのMarkdownレンダリング用

## セットアップとインストール

このプロジェクトを実行するには、ローカルサーバー環境が必要です（ES Modulesを使用しているため、`file://` プロトコルでは動作しません）。

### 1\. 前提条件

  * Git
  * VS Code (推奨) + Live Server 拡張機能 など

### 2\. インストール手順

```bash
# リポジトリのクローン
git clone https://github.com/your-username/tuac-club-auto-log.git
cd tuac-club-auto-log

# VS Codeなどで開き、Live Serverで index.html を起動
```

### 3\. 環境設定 (Configuration)

本番環境で使用する場合、以下のファイル内の設定値を自身のアカウント情報に変更する必要があります。

#### Firebase設定 (`firebase-init.js`)

Firebaseコンソールでプロジェクトを作成し、ウェブアプリのConfigを取得して書き換えてください。

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  // ...
};
```

## 📂 ディレクトリ構成

```
.
├── index.html          # エントリーポイント (レイアウト、ツールリンク、モーダル定義)
├── style.css           # スタイルシート (レスポンシブ対応)
├── main.js             # メインロジック (ナビゲーション、PWAインストール制御)
├── auth.js             # 認証ロジック (ログイン/登録)
├── firebase-init.js    # Firebase初期化
├── vehicle.js          # 車両管理モジュール (整備記録、カンバン、セッティング等)
├── practice.js         # 部活日程モジュール (カレンダー制御)
├── info.js             # Wikiモジュール (Quill.js連携、Cloudinary画像UP)
├── export.js           # レポート出力モジュール (CSV/PDF生成)
├── sw.js               # Service Worker (オフラインキャッシュ・PWA対応)
├── manifest.json       # PWA マニフェストファイル
├── icon-192.png        # PWA用アプリアイコン (小)
└── icon-512.png        # PWA用アプリアイコン (大)
```

## 注意事項

  * **Firestoreのインデックス**: データのソートや複合クエリ（例: 日付順かつフィルター済み）を使用している箇所で、Firestoreのインデックス作成が必要になる場合があります。コンソールのエラーログに従ってリンクをクリックし、インデックスを作成してください。
  * **セキュリティ**: ソースコード内にAPIキーが含まれています。パブリックリポジトリで公開する場合は、Firebase Security Rulesを設定し、CloudinaryのUpload Presetを適切に制限（Unsigned uploadの許可範囲など）してください。

## © ライセンス

© 2026 Takushoku Univ. Auto Club
