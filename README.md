# note-helper
接続テスト

## 回帰テスト

リポジトリのルートで次のコマンドを実行すると、ローカルのSQLite・workerd・Chromiumで機能と読み取り行数を検証します。本番の認証情報は不要です。旧版と比較する試験は過去コミットの `worker.js` を読みます。

```sh
node --test tests/*.mjs tests/*.cjs
```

検証環境はNode.js 24、Miniflare 5.20261119.0-beta、Playwright 1.62.1です。Nodeから両パッケージを読み込めるようにし、PlaywrightのChromiumを用意してください。システムのChromiumを使う場合は `CHROMIUM_EXECUTABLE` に実行ファイルのパスを指定できます。
