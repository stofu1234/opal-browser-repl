# オートコンプリート 手動検証スニペット (v0.1.13 / Phase 1.1)

実際の REPL パネルでコード補完（メソッド / 変数 / クラス・モジュール名、Tab / 自動）を
手動確認するための Ruby スニペットと手順です。

## 準備

1. 拡張機能を読み込んだ状態で任意の Web ページ（`http://` / `https://`）を開く。
2. DevTools を開き、**Opal REPL** パネルを選択する。
3. `Opal REPL ready` 等が表示されたら、下の **セットアップコード** を貼り付けて実行する。

> 記法: `r.mo<Tab>` は「`r.mo` と入力してから Tab を押す」、`=> ...` は期待される結果。
> `<Tab>` は Tab キー、`<↓><Enter>` はドロップダウンを下移動して Enter で確定。

## セットアップコード（まとめて貼り付け → Enter）

```ruby
class Robot
  def move; "moving"; end
  def move_forward; "fwd"; end
  def move_backward; "back"; end
  def rotate; "rotating"; end
  attr_accessor :name
end

module Navigation
  def self.compass; :north; end
  def self.coordinates; [0, 0]; end
end

class RobotController
  def initialize
    @robots = []
  end

  def register(robot)
    @robots << robot
  end
end

greeting = "hello world"
counter  = 42
robot    = Robot.new
controller = RobotController.new
```

---

## 1. メソッド名補完（レシーバ . の後）

| 入力 | 操作 | 期待結果 |
|------|------|----------|
| `robot.ro` | `<Tab>` | `robot.rotate` に確定（候補が1件なので直接挿入） |
| `robot.move` | `<Tab>` | 候補 `move` / `move_backward` / `move_forward` の3件 → ドロップダウン表示（アルファベット順） |
| `robot.move` | `<Tab>` の後 `<↓><Enter>` | `robot.move_backward` に確定（1つ下を選択） |
| `robot.` | `<Tab>` | フラグメント無し + メソッド文脈 → 全メソッド一覧をドロップダウン表示 |
| `"hello".up` | `<Tab>` | 候補 `upcase` / `upcase!` / `upto` → ドロップダウン表示（String の組み込みメソッド） |
| `[1, 2, 3].ma` | `<Tab>` | `map` / `map!` などの候補 → 共通プレフィックスまで補完しドロップダウン |

ポイント:
- レシーバはチェーンやリテラルでも動作（`"hello"`, `[1,2,3]`, `robot.name` 等）。
- 候補が複数で共通プレフィックスがある場合、Tab はまず共通部分まで補完する。
- Opal のメソッド探索スタブ（`compile_*` など opal-parser 内部名）は候補から除外され、
  実在するメソッドのみが表示される。

## 2. 変数名補完（ローカル変数）

| 入力 | 操作 | 期待結果 |
|------|------|----------|
| `gree` | `<Tab>` | `greeting` に確定 |
| `co` | `<Tab>` | `controller` / `counter` を含む候補（`copy_*` 等の Kernel メソッドも先頭一致で混在）→ ドロップダウン |
| `count` | `<Tab>` | `counter` に確定 |
| `rob` | `<Tab>` | `robot` に確定（ローカル変数） |

ポイント:
- `greeting` / `counter` / `robot` などセットアップで定義したローカル変数が補完対象。
- 短いプレフィックスでは同名前方一致の組み込みメソッドも混じる（Ruby の補完としては自然）。
  より具体的に打つと絞り込める。

## 3. クラス / モジュール名補完（定数）

| 入力 | 操作 | 期待結果 |
|------|------|----------|
| `Rob` | `<Tab>` | `Robot` / `RobotController` の2候補 → ドロップダウン |
| `Robot` | `<Tab>` | `Robot` / `RobotController` → `Robot` で止まらず候補表示（先頭一致） |
| `Nav` | `<Tab>` | `Navigation` に確定 |
| `Navigation.co` | `<Tab>` | `compass` / `coordinates` を含むモジュールメソッド候補（`const_get` / `constants` 等も先頭一致）→ ドロップダウン |

## 4. トリガー: 自動補完（入力中）

| 操作 | 期待結果 |
|------|----------|
| `Rob` までゆっくり入力（Tab を押さない） | 少し待つとドロップダウンが自動表示（2文字以上で発火） |
| 続けて `o`,`t` と入力 | 候補が `Robot` / `RobotController` に絞り込まれて更新 |
| `robot.` まで入力 | レシーバ `robot` を評価しメソッド候補を自動表示 |
| さらに文字を入力 | いったんドロップダウンが閉じ、新しい入力に対して再表示（古い候補の誤確定防止） |
| `<Esc>` | ドロップダウンを閉じる |

## 5. ドロップダウン操作

| 操作 | 期待結果 |
|------|----------|
| `<↓>` / `<↑>` | 選択行が移動（端で循環） |
| `<Enter>` または `<Tab>` | 選択中の候補で確定 |
| 候補をマウスでクリック | その候補で確定 |
| `<Esc>` | 閉じる（入力はそのまま） |

## 6. インデントへのフォールバック

| 入力 | 操作 | 期待結果 |
|------|------|----------|
| （空の行で） | `<Tab>` | 補完対象が無いのでスペース2つ挿入（従来のインデント動作） |
| `puts ` の直後（末尾が空白） | `<Tab>` | スペース2つ挿入 |

## 7. cd コンテキスト連動（応用）

```ruby
cd Robot
```

| 入力 | 操作 | 期待結果 |
|------|------|----------|
| `mo` | `<Tab>` | Robot のメソッド `move` / `move_forward` / `move_backward` を補完（コンテキスト追従） |
| `cd /` で復帰 | — | トップレベルの補完に戻る |

---

## 期待挙動チェックリスト

- [ ] メソッド名補完（インスタンス / クラス / 組み込み型）が動く
- [ ] 変数名補完（ローカル変数）が動く
- [ ] クラス / モジュール名補完が動く
- [ ] Tab で「単一候補は直接挿入」「複数候補はドロップダウン」「共通プレフィックス補完」
- [ ] 入力中の自動補完が発火・絞り込み・再表示される
- [ ] ↑↓ / Enter / Tab / Esc / クリックでドロップダウン操作できる
- [ ] 補完対象が無い場合は Tab がインデント挿入になる
- [ ] cd コンテキスト内でその対象のメソッドが補完される
