# Opal Browser REPL

Chrome DevToolsにOpal Ruby REPLパネルを追加するブラウザ拡張機能です。

## 機能

- DevToolsに「Opal REPL」タブを追加
- ブラウザコンソールでRubyコードを直接実行
- バッククォートでJavaScriptを実行可能（例: `` `console.log("hello")` ``）
- ページにOpalがある場合は自動検出、ない場合は自動注入
- コマンド履歴（↑/↓キー）
- 複数ブラウザ対応を前提とした構成

## インストール方法

### 1. ビルド

```bash
# Opalライブラリのフェッチ、アイコン作成、ビルドを一括実行
npm run setup

# または個別に実行
npm run fetch-opal
npm run create-icons
npm run build
```

### 2. Chromeにインストール

1. Chromeで `chrome://extensions/` を開く
2. 右上の「デベロッパーモード」をオンにする
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. `dist/chrome` フォルダを選択

### 3. 使い方

1. 任意のWebページでDevToolsを開く（F12またはCtrl+Shift+I）
2. 「Opal REPL」タブをクリック
3. Rubyコードを入力してEnterで実行

## 使用例

```ruby
# 基本的なRuby
puts "Hello, World!"
[1, 2, 3].map { |x| x * 2 }

# バッククォートでJavaScript実行
`document.title`
`window.location.href`

# DOMの操作
`document.querySelector('h1').textContent = 'Changed!'`

# ページ上のOpalクラスにアクセス（Opalアプリの場合）
TodoController.new
```

## プロジェクト構成

```
opal-browser-repl/
├── src/
│   ├── shared/           # ブラウザ共通コード
│   │   ├── repl/         # REPLコアロジック
│   │   ├── ui/           # パネルUI（HTML/CSS）
│   │   └── lib/          # Opalライブラリ
│   ├── chrome/           # Chrome固有コード
│   └── firefox/          # Firefox固有コード（将来）
├── dist/
│   ├── chrome/           # Chromeビルド出力
│   └── firefox/          # Firefoxビルド出力
├── icons/                # 拡張機能アイコン
└── scripts/              # ビルドスクリプト
```

## スクリプト

| コマンド | 説明 |
|----------|------|
| `npm run setup` | 初回セットアップ（fetch-opal + create-icons + build） |
| `npm run build` | 全ブラウザ向けビルド |
| `npm run build:chrome` | Chrome向けビルド |
| `npm run build:firefox` | Firefox向けビルド（未実装） |
| `npm run dev` | ウォッチモードでビルド |
| `npm run fetch-opal` | OpalライブラリをCDNから取得 |
| `npm run create-icons` | アイコンを生成 |

## ショートカット

| キー | 動作 |
|------|------|
| Enter | コード実行 |
| Shift+Enter | 改行挿入 |
| ↑/↓ | 履歴ナビゲーション |
| Ctrl+L | コンソールクリア |
| Tab | インデント挿入 |

## 技術詳細

- Manifest V3対応
- Opal 1.8.2使用
- opal-parserによるランタイムコンパイル
- chrome.devtools.inspectedWindow.eval APIでページコンテキスト実行

## ライセンス

MIT
