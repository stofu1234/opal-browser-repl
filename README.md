# Opal Browser REPL

Chrome DevToolsにOpal Ruby REPLパネルを追加するブラウザ拡張機能です。

---

## Build Instructions for Reviewers

### Requirements
- **OS**: Windows, macOS, or Linux
- **Node.js**: v18.0.0 or higher
- **npm**: v8.0.0 or higher

### Build Steps

```bash
# 1. Install dependencies
npm install

# 2. Build the extension for all browsers
npm run build

# 3. Output will be in dist/ folder
#    - dist/chrome/   (Chrome extension)
#    - dist/edge/     (Edge extension)
#    - dist/firefox/  (Firefox extension)
```

### Build Script Details

The `npm run build` command executes `scripts/build.js` which:
1. Copies manifest.json for each browser
2. Copies HTML, CSS files from src/shared/ui/
3. Bundles JavaScript using esbuild (panel.js)
4. Copies Opal library files from src/shared/lib/
5. Copies icon files

### Third-party Libraries

The following open-source libraries are included in `src/shared/lib/`:
- **opal.js** - Opal Ruby runtime (MIT License, https://opalrb.com)
- **opal-parser.js** - Opal parser for runtime compilation (MIT License)
- **native.js** - Opal native module for JS interop (MIT License)

These libraries require `eval()` and `Function()` constructor to compile and execute Ruby code at runtime, which is essential for REPL functionality.

---

## 機能

- DevToolsに「Opal REPL」タブを追加
- ブラウザコンソールでRubyコードを直接実行
- バッククォートでJavaScriptを実行可能（例: `` `console.log("hello")` ``）
- `Native()` ラッパーでJSオブジェクトをRubyライクに操作
- ローカル変数・メソッド定義が保持される（IRBモード）
- ページにOpalがある場合は自動検出、ない場合は自動注入
- コマンド履歴（↑/↓キー）
- 複数ブラウザ対応を前提とした構成

## インストール方法

### 1. ビルド

```bash
# Opalライブラリのビルド、アイコン作成、拡張機能ビルドを一括実行
npm run setup

# または個別に実行
npm run build-opal    # Ruby/Opal環境が必要
npm run create-icons
npm run build
```

**注意**: `npm run build-opal` にはRubyとOpal gemが必要です。
```bash
gem install opal
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

### 基本的なRuby

```ruby
puts "Hello, World!"
[1, 2, 3].map { |x| x * 2 }
```

### バッククォートでJavaScript実行

```ruby
`document.title`
`window.location.href`
`document.querySelector('h1').textContent = 'Changed!'`
```

### Native()でJSオブジェクトをRubyライクに操作

```ruby
# DOMにアクセス
doc = Native(`document`)
doc[:title]                           # => "Page Title"
doc[:location][:href]                 # => "http://..."

# メソッド呼び出し
doc.getElementById('app')[:innerHTML]
doc.querySelector('h1')[:textContent]

# windowオブジェクト
win = Native(`window`)
win[:innerWidth]                      # => 1920

# 複雑な操作
items = Native(`document.querySelectorAll('li')`)
items[:length]
```

### 変数とメソッドの保持

```ruby
# ローカル変数は保持されます
x = 10
x * 2  # => 20

# メソッド定義も保持されます
def greet(name)
  "Hello, #{name}!"
end
greet("Ruby")  # => "Hello, Ruby!"

# インスタンス変数も使えます
@counter = 0
@counter += 1
```

### ページ上のOpalクラスにアクセス（Opalアプリの場合）

```ruby
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
| `npm run setup` | 初回セットアップ（build-opal + create-icons + build） |
| `npm run build` | 全ブラウザ向けビルド |
| `npm run build:chrome` | Chrome向けビルド |
| `npm run build:firefox` | Firefox向けビルド（未実装） |
| `npm run dev` | ウォッチモードでビルド |
| `npm run build-opal` | Opal gemからJSライブラリをビルド（要Ruby） |
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
- Opal 1.8.2使用（gem版ビルド）
- opal-parserによるランタイムコンパイル
- nativeモジュールでJSオブジェクトのRubyラッパー
- IRBモードコンパイルでローカル変数を保持
- chrome.devtools.inspectedWindow.eval APIでページコンテキスト実行

## ライセンス

MIT
