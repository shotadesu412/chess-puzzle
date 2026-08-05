# iOS 版

Web版（リポジトリ直下の `index.html` / `src/`）を WKWebView でそのまま表示するラッパーアプリ。
ゲームのロジックは1か所（Web版）にしかない。iOS 側は表示するだけ。

## 構成

```
project.yml                     XcodeGen の定義。設定を変えるならここ
Sources/ChessPuzzleApp.swift    エントリポイント
Sources/GameWebView.swift       WKWebView の設定
Sources/BundleSchemeHandler.swift  app:// でバンドル内のファイルを配信する
ChessPuzzle.xcodeproj           生成物。直接編集しない
```

`ChessPuzzle.xcodeproj` は `xcodegen generate` で作り直せる生成物。
プロジェクト設定を変えたいときは `project.yml` を編集して再生成する。

## なぜ独自スキーム（app://）なのか

ゲーム本体は ES modules（`<script type="module">`）を使っている。
`file://` はオリジンが null 扱いになるため CORS で module の読み込みが弾かれる。
独自スキームなら通常のオリジンとして扱われるので、Web版のコードを一切変えずに動く。

## Web資産の同期

`project.yml` の postBuildScript が、ビルドのたびに以下をアプリバンドルの `Web/` にコピーする。

- `../index.html`
- `../style.css`
- `../src/`

ファイルを複製せず1か所に保つため。Web版を編集したら、iOSアプリを再ビルドすれば反映される。

## ビルド

```sh
cd ios

# プロジェクトの再生成（project.yml を変えたとき）
xcodegen generate

# シミュレータ
xcodebuild -project ChessPuzzle.xcodeproj -scheme ChessPuzzle \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath build CODE_SIGNING_ALLOWED=NO build

xcrun simctl install booted build/Build/Products/Debug-iphonesimulator/ChessPuzzle.app
xcrun simctl launch booted com.shota.chesspuzzle

# 実機（要: Xcode に Apple ID を登録済みであること）
xcrun devicectl list devices          # デバイスIDを確認
xcodebuild -project ChessPuzzle.xcodeproj -scheme ChessPuzzle \
  -destination 'id=<デバイスID>' -allowProvisioningUpdates \
  -derivedDataPath build build

xcrun devicectl device install app --device <デバイスID> \
  build/Build/Products/Debug-iphoneos/ChessPuzzle.app
xcrun devicectl device process launch --device <デバイスID> com.shota.chesspuzzle
```

## 実機ビルドの前提

Bundle ID は `com.shota.chesspuzzle`。既存のプロビジョニングプロファイルが無いので、
**Xcode に Apple ID が登録されていないと署名できない**
（`No Accounts: Add a new account in Accounts settings.` で失敗する）。

Xcode → Settings → Accounts で Apple ID を追加すれば、
`-allowProvisioningUpdates` が自動でプロファイルを作成する。
