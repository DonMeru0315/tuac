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

  * **整備マニュアル**: Markdown記法に対応したナレッジベース。
  * **タグ付け・難易度**: 作業の難易度や所要時間を記録し、技術継承を支援。

### 4\. 出退勤 (Attendance)

  * **GPS打刻**: 部室（ガレージ）の特定範囲内（デフォルト1000m）にいる場合のみ出席・退席が可能。
  * **写真記録**: Cloudinaryと連携し、活動終了時に使用した工具や現場の写真をアップロードして記録。
  * **履歴確認**: 過去1ヶ月分の活動履歴表示。

### 5\. 便利ツール (Tools)

  * **工具使用記録**: 工具の紛失防止のための写真ログ機能。
  * **リンク集**: 部品検索サイト（EPC-data, PartsFan）や各サーキットの予約ページへのショートカット。

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

#### Cloudinary設定 (`attendance.js`, `tools.js`)

画像の保存先としてCloudinaryを使用しています。自身のCloud NameとUnsigned Upload Presetを設定してください。

```javascript
const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/YOUR_CLOUD_NAME/image/upload";
const UPLOAD_PRESET = "YOUR_UNSIGNED_PRESET";
```

#### GPS設定 (`attendance.js`)

ガレージの位置情報を設定します。

```javascript
const CLUB_LAT = 35.XXXXXX; // 緯度
const CLUB_LON = 139.XXXXXX; // 経度
const ALLOWED_RADIUS = 1000; // 許容半径(メートル)
```

## 📂 ディレクトリ構成

```
.
├── index.html          # エントリーポイント (レイアウト、モーダル定義)
├── style.css           # スタイルシート (レスポンシブ対応)
├── main.js             # メインロジック (モジュール読み込み、ナビゲーション)
├── auth.js             # 認証ロジック (ログイン/登録)
├── firebase-init.js    # Firebase初期化
├── vehicle.js          # 車両管理モジュール
├── practice.js         # カレンダー・予定モジュール
├── info.js             # Wikiモジュール
├── attendance.js       # 出退勤モジュール
└── tools.js            # 便利ツールモジュール
```

## 注意事項

  * **Firestoreのインデックス**: データのソートや複合クエリ（例: 日付順かつフィルター済み）を使用している箇所で、Firestoreのインデックス作成が必要になる場合があります。コンソールのエラーログに従ってリンクをクリックし、インデックスを作成してください。
  * **セキュリティ**: ソースコード内にAPIキーが含まれています。パブリックリポジトリで公開する場合は、Firebase Security Rulesを設定し、CloudinaryのUpload Presetを適切に制限（Unsigned uploadの許可範囲など）してください。

## © ライセンス

© 2025 Takushoku Univ. Auto Club
