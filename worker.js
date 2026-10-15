const VERSION = "v12.2";

const ORDERS = {
  "1": [
    "小説", "短編小説", "創作", "散文",
    "エッセイ", "詩", "日記"
  ],
  "2": [
    "エッセイ", "詩", "日記", "小説",
    "短編小説", "創作", "散文"
  ]
};

const SLOTS = ["1", "2"];
const INTERVAL = 240000;
const HOUR = 3600000;
const CHECK_INTERVAL = 300000;

const sql = (env, query, ...args) =>
  env.DB.prepare(query).bind(...args);

const esc = value => String(value ?? "").replace(
  /[&<>"']/g,
  c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c])
);

const time = value => value
  ? new Date(value).toLocaleString(
      "ja-JP",
      { timeZone: "Asia/Tokyo" }
    )
  : "まだありません";

const nextTick = () =>
  Math.floor(Date.now() / INTERVAL) * INTERVAL + INTERVAL;

function reply(body, html = false, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": html
        ? "text/html; charset=utf-8"
        : "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "same-origin",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function page(
  message = "管理用の鍵を入力してください。",
  slot = "1"
) {
  return reply(`<!doctype html>
<html lang="ja">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>note-helper ${VERSION}</title>
<style>
body {
  font:17px system-ui;
  max-width:680px;
  margin:24px auto;
  padding:0 18px;
  line-height:1.7
}
input,button,select {
  font:inherit;
  padding:12px;
  box-sizing:border-box
}
input,select {width:100%}
button {margin:12px 8px 0 0}
pre {
  white-space:pre-wrap;
  overflow-wrap:anywhere;
  background:#f3f4f6;
  padding:16px
}
</style>
<h1>note-helper ${VERSION}</h1>
<p>
対象：小説・短編小説・創作・散文・エッセイ・詩・日記<br>
通常は約4分ごとに各アカウント最大1件。
</p>
<p>
エラー後は初回2時間、再び失敗したら以後3時間休止。
noteから長い待機時間を指定された場合は、その時間を守ります。
新しい送信の成功を確認すると失敗回数をリセットします。
</p>
<pre>${esc(message)}</pre>
<form method="post" action="/control">
<label>
操作するアカウント
<select name="account">
<option value="1"${slot === "1" ? " selected" : ""}>1：今までのnote</option>
<option value="2"${slot === "2" ? " selected" : ""}>2：追加したnote</option>
</select>
</label>
<p>
開始・停止・接続確認は選んだアカウントだけに適用します。
状態は両方を表示します。
</p>
<label>
管理用の鍵（ADMIN_KEY）
<input type="password" name="key" required
 autocomplete="off" autocapitalize="none" spellcheck="false">
</label>
<button name="action" value="status">両方の状態を確認</button>
<button name="action" value="check_login">選択したアカウントの接続確認</button>
<button name="action" value="start">自動運転を開始</button>
<button name="action" value="stop">停止</button>
</form>
<p>
接続確認はログイン情報と登録済みアカウントの一致を調べます。
いいねは送らず、自動運転の休止期限も変更しません。
各アカウントにつき5分に1回までです。
noteが長い待機時間を指定した場合は、その期限を守ります。
</p>
<p>
接続確認の結果は、表示された確認日時のものです。
Cookieを変更したら対象のアカウントで再確認してください。
接続確認OKでも、いいね送信が許可されるとは限りません。
</p>
<p>
開始を押しても休止期限は短縮しません。
同じ記事は両アカウントで除外し、結果不明の記事も再送しません。
ログイン切れ・設定不備は手動対応が必要です。
画面は自動更新されません。
停止直前の送信は取り消せません。
</p>
</html>`, true);
}

function scoped(original, slot) {
  return {
    ...original,
    SLOT: slot,
    NOTE_SESSION: slot === "2"
      ? original.NOTE_SESSION_2
      : original.NOTE_SESSION,
    DB: slot === "1" ? original.DB : {
      prepare: q => original.DB.prepare(
        q.replace(
          /\b(nh_control|nh_seen|nh_retry|nh_health)\b/g,
          "$1_2"
        )
      ),
      batch: items => original.DB.batch(items)
    }
  };
}

async function prepare(original) {
  for (const slot of SLOTS) {
    const env = scoped(original, slot);

    await env.DB.batch([
      env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS nh_control (" +
        "id INTEGER PRIMARY KEY, " +
        "enabled INTEGER NOT NULL DEFAULT 0, " +
        "account TEXT NOT NULL DEFAULT '', " +
        "cursor INTEGER NOT NULL DEFAULT 0, " +
        "token TEXT NOT NULL DEFAULT '', " +
        "lease INTEGER NOT NULL DEFAULT 0, " +
        "next_at INTEGER NOT NULL DEFAULT 0, " +
        "inflight TEXT NOT NULL DEFAULT '', " +
        "total INTEGER NOT NULL DEFAULT 0, " +
        "message TEXT NOT NULL DEFAULT '未開始', " +
        "checked INTEGER NOT NULL DEFAULT 0)"
      ),
      env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS nh_seen (" +
        "key TEXT PRIMARY KEY, " +
        "status TEXT NOT NULL, " +
        "created INTEGER NOT NULL)"
      ),
      env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS nh_retry (" +
        "id INTEGER PRIMARY KEY, " +
        "failures INTEGER NOT NULL DEFAULT 0)"
      ),
      env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS nh_health (" +
        "id INTEGER PRIMARY KEY, " +
        "rate_fail INTEGER NOT NULL DEFAULT 0, " +
        "errors INTEGER NOT NULL DEFAULT 0, " +
        "kind TEXT NOT NULL DEFAULT '', " +
        "success_at INTEGER NOT NULL DEFAULT 0)"
      ),
      env.DB.prepare(
        "INSERT OR IGNORE INTO nh_control (id) VALUES (1)"
      ),
      env.DB.prepare(
        "INSERT OR IGNORE INTO nh_retry (id) VALUES (1)"
      ),
      env.DB.prepare(
        "INSERT OR IGNORE INTO nh_health (id) VALUES (1)"
      )
    ]);
  }

  await original.DB.batch([
    original.DB.prepare(
      "CREATE TABLE IF NOT EXISTS nh_shared (" +
      "key TEXT PRIMARY KEY, " +
      "slot TEXT NOT NULL, " +
      "token TEXT NOT NULL, " +
      "created INTEGER NOT NULL)"
    ),
    original.DB.prepare(
      "CREATE TABLE IF NOT EXISTS nh_migrations (" +
      "name TEXT PRIMARY KEY)"
    ),
    original.DB.prepare(
      "CREATE TABLE IF NOT EXISTS nh_connection_checks (" +
      "slot TEXT PRIMARY KEY, " +
      "next_at INTEGER NOT NULL DEFAULT 0, " +
      "checked INTEGER NOT NULL DEFAULT 0, " +
      "result TEXT NOT NULL DEFAULT '未確認', " +
      "message TEXT NOT NULL DEFAULT '', " +
      "token TEXT NOT NULL DEFAULT '')"
    ),
    original.DB.prepare(
      "INSERT OR IGNORE INTO nh_connection_checks (slot) VALUES ('1')"
    ),
    original.DB.prepare(
      "INSERT OR IGNORE INTO nh_connection_checks (slot) VALUES ('2')"
    )
  ]);

  // 既存のv12移行済みデータと休止期限は維持する。
  if (await sql(
    original,
    "SELECT name FROM nh_migrations WHERE name='v12'"
  ).first()) {
    return;
  }

  const items = [];

  for (const slot of SLOTS) {
    const env = scoped(original, slot);

    items.push(
      sql(
        env,
        "INSERT OR IGNORE INTO nh_shared " +
        "SELECT key, ?, 'history', created FROM nh_seen " +
        "WHERE NOT EXISTS (" +
        "SELECT 1 FROM nh_migrations WHERE name='v12')",
        slot
      ),
      sql(
        env,
        "INSERT OR IGNORE INTO nh_shared " +
        "SELECT inflight, ?, 'history', checked FROM nh_control " +
        "WHERE inflight<>'' AND NOT EXISTS (" +
        "SELECT 1 FROM nh_migrations WHERE name='v12')",
        slot
      ),
      sql(
        env,
        "UPDATE nh_health SET rate_fail=1, kind='rate' " +
        "WHERE id=1 AND EXISTS (" +
        "SELECT 1 FROM nh_control WHERE message LIKE '%429%') " +
        "AND NOT EXISTS (" +
        "SELECT 1 FROM nh_migrations WHERE name='v12')"
      ),
      sql(
        env,
        "UPDATE nh_control " +
        "SET next_at=MAX(next_at, ?), " +
        "message='429の履歴を引継ぎ、最低2時間休止してから自動確認します' " +
        "WHERE id=1 AND message LIKE '%429%' " +
        "AND NOT EXISTS (" +
        "SELECT 1 FROM nh_migrations WHERE name='v12')",
        Date.now() + 2 * HOUR
      )
    );
  }

  items.push(
    original.DB.prepare(
      "INSERT OR IGNORE INTO nh_migrations VALUES ('v12')"
    )
  );

  await original.DB.batch(items);
}

class Trouble extends Error {
  constructor(
    message,
    kind = "network",
    retry = 0,
    code = 0
  ) {
    super(message);
    this.kind = kind;
    this.retry = retry;
    this.code = code;
  }
}

async function api(
  env,
  path,
  post = false,
  referer = "https://note.com/"
) {
  if (!env.NOTE_SESSION?.trim()) {
    throw new Trouble(
      "ログイン情報が未設定です",
      "auth"
    );
  }

  const headers = {
    "Accept": "application/json",
    "X-Requested-With": "XMLHttpRequest",
    "Cookie": "_note_session_v5=" + env.NOTE_SESSION.trim()
  };

  if (post) {
    Object.assign(headers, {
      "Content-Type": "application/json",
      "Origin": "https://note.com",
      "Referer": referer
    });
  }

  let response;

  try {
    response = await fetch("https://note.com" + path, {
      method: post ? "POST" : "GET",
      headers,
      ...(post ? { body: "{}" } : {}),
      redirect: "manual",
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    throw new Trouble("通信エラー・タイムアウト");
  }

  if (!response.ok) {
    const code = response.status;
    const raw = (
      response.headers.get("Retry-After") || ""
    ).trim();

    const parsed = /^\d+$/.test(raw)
      ? Number(raw) * 1000
      : Date.parse(raw) - Date.now();

    const retry = Number.isFinite(parsed)
      ? Math.max(0, parsed)
      : 0;

    await response.body?.cancel().catch(() => {});

    const kind = code === 429
      ? "rate"
      : [401, 403].includes(code)
        ? "auth"
        : code >= 500
          ? "network"
          : "response";

    const reason = code === 429
      ? "回数制限"
      : code === 401
        ? "ログイン情報の確認が必要"
        : code === 403
          ? "アクセス拒否。ログイン情報や利用制限の確認が必要"
          : code === 422
            ? "送信内容などが受け付けられません"
            : "応答エラー";

    throw new Trouble(
      "note応答 " + code + "：" + reason,
      kind,
      retry,
      code
    );
  }

  if (post) {
    await response.body?.cancel().catch(() => {});
    return;
  }

  try {
    const json = await response.json();
    const data = json?.data ?? json;

    if (!data || typeof data !== "object") {
      throw new Error();
    }

    return data;
  } catch {
    throw new Trouble(
      "応答形式を確認できません",
      "response"
    );
  }
}

async function account(env) {
  const data = await api(env, "/api/v2/current_user");
  const user = data.user ?? data;

  if (!user?.id || !user?.urlname) {
    throw new Trouble(
      "ログイン情報の更新が必要です",
      "auth"
    );
  }

  return String(user.id);
}

async function article(env, key) {
  try {
    return await api(env, "/api/v3/notes/" + key);
  } catch (error) {
    if (error.code === 404) return null;
    throw error;
  }
}

async function checkConnection(original, slot) {
  const env = scoped(original, slot);
  const now = Date.now();

  const state = await sql(
    env,
    "SELECT * FROM nh_control WHERE id=1"
  ).first();

  const health = await sql(
    env,
    "SELECT * FROM nh_health WHERE id=1"
  ).first();

  if (state.lease > now) {
    return "アカウント " + slot +
      " は自動処理中です。少し待って接続確認してください。";
  }

  // 429による休止中は、手動確認でも追加アクセスしない。
  if (health.kind === "rate" && state.next_at > now) {
    return "アカウント " + slot +
      " は回数制限による休止中です。" +
      "\n接続確認は " + time(state.next_at) +
      " 以降に行ってください。";
  }

  const token = crypto.randomUUID();

  const allowed = await sql(
    original,
    "UPDATE nh_connection_checks " +
    "SET next_at=?, token=? " +
    "WHERE slot=? AND next_at<=?",
    now + CHECK_INTERVAL,
    token,
    slot,
    now
  ).run();

  if (!allowed.meta.changes) {
    const previous = await sql(
      original,
      "SELECT next_at FROM nh_connection_checks WHERE slot=?",
      slot
    ).first();

    return "アカウント " + slot +
      " の接続確認は " + time(previous.next_at) +
      " 以降にもう一度できます。";
  }

  let result;
  let message;
  let wait = CHECK_INTERVAL;

  try {
    // ログイン情報の読み取りだけ。いいねは送らない。
    const id = await account(env);

    if (!state.account) {
      result = "ログインOK・登録先未確認";
      message =
        "ログインできました。" +
        "この枠は未登録のため、登録済みアカウントとの一致は未確認です。";
    } else if (id !== state.account) {
      result = "別アカウント・要修正";
      message =
        "Cookieが登録済みのnoteと一致しません。" +
        (slot === "2" ? "NOTE_SESSION_2" : "NOTE_SESSION") +
        " に、元のnoteのCookieを設定してください。";
    } else {
      result = "接続確認OK";
      message =
        "ログインでき、登録済みのnoteと一致しました。" +
        "いいね送信の制限解除までは確認していません。";
    }
  } catch (error) {
    result = "接続確認失敗";
    message = error instanceof Trouble
      ? error.message
      : "通信・内部処理のエラー";

    if (error instanceof Trouble) {
      wait = Math.max(
        CHECK_INTERVAL,
        error.retry,
        error.code === 429 ? 2 * HOUR : 0
      );
    }
  }

  await sql(
    original,
    "UPDATE nh_connection_checks " +
    "SET checked=?, result=?, message=?, " +
    "next_at=MAX(next_at, ?), token='' " +
    "WHERE slot=? AND token=?",
    Date.now(),
    result,
    message,
    Date.now() + wait,
    slot,
    token
  ).run();

  return "アカウント " + slot + "：" + result +
    "\n" + message +
    "\nいいねは送信していません。" +
    "\n自動運転の休止期限は変更していません。" +
    "\n下の自動実行欄のエラーは前回実行の記録です。";
}

async function run(env) {
  const token = crypto.randomUUID();
  const now = Date.now();

  const lock = await sql(
    env,
    "UPDATE nh_control " +
    "SET token=?, lease=?, next_at=?, checked=? " +
    "WHERE id=1 AND enabled=1 AND lease<? AND next_at<=?",
    token,
    now + 300000,
    now + 2 * HOUR,
    now,
    now,
    now
  ).run();

  if (!lock.meta.changes) return;

  let stage = "ログイン確認";

  const finish = async (message, successfulSend = false) => {
    await env.DB.batch([
      sql(
        env,
        "UPDATE nh_control SET message=?, next_at=? " +
        "WHERE id=1 AND token=?",
        message,
        nextTick(),
        token
      ),
      sql(
        env,
        "UPDATE nh_health SET " +
        "errors=CASE WHEN ? THEN 0 ELSE errors END, " +
        "kind='', " +
        "rate_fail=CASE WHEN ? THEN 0 ELSE rate_fail END, " +
        "success_at=CASE WHEN ? THEN ? ELSE success_at END " +
        "WHERE id=1",
        successfulSend ? 1 : 0,
        successfulSend ? 1 : 0,
        successfulSend ? 1 : 0,
        Date.now()
      )
    ]);
  };

  try {
    const state = await sql(
      env,
      "SELECT * FROM nh_control WHERE id=1"
    ).first();

    if (await account(env) !== state.account) {
      throw new Trouble(
        "元のアカウントのログイン情報に戻してください",
        "auth"
      );
    }

    if (state.inflight) {
      stage = "前回送信の確認";

      const data = await article(env, state.inflight);
      const liked = data?.is_liked === true;

      const before = await sql(
        env,
        "SELECT status FROM nh_seen WHERE key=?",
        state.inflight
      ).first();

      await env.DB.batch([
        sql(
          env,
          "INSERT INTO nh_seen VALUES (?,?,?) " +
          "ON CONFLICT(key) DO UPDATE SET status=excluded.status",
          state.inflight,
          liked ? "liked" : "uncertain",
          Date.now()
        ),
        sql(
          env,
          "UPDATE nh_control " +
          "SET inflight='', total=total+? " +
          "WHERE id=1 AND token=?",
          liked && before?.status !== "liked" ? 1 : 0,
          token
        )
      ]);

      await finish(
        liked
          ? "前回の記事のスキを確認。次回から候補を確認します"
          : "前回の記事は結果未確認のため再送せず除外しました"
      );
      return;
    }

    stage = "記事一覧の取得";

    const tags = ORDERS[env.SLOT];
    const tag = tags[state.cursor % tags.length];

    await sql(
      env,
      "UPDATE nh_control SET cursor=cursor+1 " +
      "WHERE id=1 AND token=?",
      token
    ).run();

    const data = await api(
      env,
      "/api/v3/hashtags/" +
      encodeURIComponent(tag) +
      "/notes?order=new&page=1"
    );

    if (!Array.isArray(data.notes)) {
      throw new Trouble(
        "記事一覧の形式を確認できません",
        "response"
      );
    }

    const keys = [...new Set(
      data.notes
        .map(n => n?.key)
        .filter(k =>
          typeof k === "string" &&
          /^n[a-z0-9]+$/.test(k)
        )
    )].slice(0, 50);

    if (!keys.length) {
      await finish("#" + tag + "：記事なし");
      return;
    }

    const marks = keys.map(() => "?").join(",");

    const seen = await sql(
      env,
      "SELECT key FROM nh_seen WHERE key IN (" +
      marks +
      ") UNION SELECT key FROM nh_shared WHERE key IN (" +
      marks + ")",
      ...keys,
      ...keys
    ).all();

    const done = new Set(seen.results.map(r => r.key));
    const key = keys.find(k => !done.has(k));

    if (!key) {
      await finish(
        "#" + tag + "：履歴・共通予約を除く候補なし"
      );
      return;
    }

    stage = "記事確認";

    const dataNote = await article(env, key);

    if (
      !dataNote ||
      dataNote.is_liked === true ||
      String(dataNote.user?.id ?? dataNote.user_id) === state.account
    ) {
      await sql(
        env,
        "INSERT OR IGNORE INTO nh_seen VALUES (?, 'skip', ?)",
        key,
        Date.now()
      ).run();

      await finish(
        "#" + tag + "：削除済み・スキ済み・自分の記事を除外"
      );
      return;
    }

    const referer = dataNote.note_url || (
      dataNote.user?.urlname
        ? "https://note.com/" +
          dataNote.user.urlname + "/n/" + key
        : ""
    );

    let valid = false;

    try {
      const u = new URL(referer);
      valid =
        u.origin === "https://note.com" &&
        u.pathname.endsWith("/n/" + key);
    } catch {}

    if (!valid) {
      throw new Trouble(
        "記事URLを確認できません",
        "response"
      );
    }

    stage = "共通予約の保存";

    const reserved = await env.DB.batch([
      sql(
        env,
        "INSERT OR IGNORE INTO nh_shared " +
        "(key,slot,token,created) " +
        "SELECT ?,?,?,? FROM nh_control " +
        "WHERE id=1 AND token=? AND enabled=1 AND lease>?",
        key,
        env.SLOT,
        token,
        Date.now(),
        token,
        Date.now()
      ),
      sql(
        env,
        "INSERT OR IGNORE INTO nh_seen (key,status,created) " +
        "SELECT ?, 'pending', ? WHERE EXISTS (" +
        "SELECT 1 FROM nh_shared WHERE key=? AND token=?)",
        key,
        Date.now(),
        key,
        token
      ),
      sql(
        env,
        "UPDATE nh_control SET inflight=?, lease=? " +
        "WHERE id=1 AND token=? AND enabled=1 AND lease>? " +
        "AND EXISTS (" +
        "SELECT 1 FROM nh_shared WHERE key=? AND token=?)",
        key,
        Date.now() + 300000,
        token,
        Date.now(),
        key,
        token
      )
    ]);

    if (
      !reserved[0].meta.changes ||
      !reserved[2].meta.changes
    ) {
      await finish(
        "共通予約済み、または停止操作により送信を見送りました"
      );
      return;
    }

    stage = "スキ送信";

    await api(
      env,
      "/api/v3/notes/" + key + "/likes",
      true,
      referer
    );

    stage = "送信後の確認";

    const after = await article(env, key);

    if (after?.is_liked !== true) {
      throw new Trouble(
        "送信結果は未確認。再送せず次回に確認します"
      );
    }

    await env.DB.batch([
      sql(
        env,
        "UPDATE nh_seen SET status='liked' WHERE key=?",
        key
      ),
      sql(
        env,
        "UPDATE nh_control SET inflight='', total=total+1 " +
        "WHERE id=1 AND token=?",
        token
      )
    ]);

    await finish(
      "スキ確認済み：" + key + "（#" + tag + "）",
      true
    );
  } catch (error) {
    const kind = error instanceof Trouble
      ? error.kind
      : "storage";

    const h = await sql(
      env,
      "SELECT * FROM nh_health WHERE id=1"
    ).first();

    const rates = Number(h.rate_fail) +
      (kind === "rate" ? 1 : 0);
    const errors = Number(h.errors) + 1;

    const base = (errors === 1 ? 2 : 3) * HOUR;
    const serverWait = error instanceof Trouble
      ? error.retry
      : 0;
    const wait = Math.max(base, serverWait);

    const message =
      "自動再確認待ち：" + stage + "／" +
      (
        error instanceof Trouble
          ? error.message
          : "保存・内部処理のエラー"
      ) +
      "\n今回の休止：" +
      (
        serverWait > base
          ? "noteが指定した待機時間を優先"
          : errors === 1
            ? "2時間"
            : "3時間"
      );

    await env.DB.batch([
      sql(
        env,
        "UPDATE nh_health SET rate_fail=?, errors=?, kind=? " +
        "WHERE id=1",
        rates,
        errors,
        kind
      ),
      sql(
        env,
        "UPDATE nh_control SET next_at=?, message=? " +
        "WHERE id=1 AND token=?",
        Date.now() + wait,
        message,
        token
      )
    ]);
  } finally {
    await sql(
      env,
      "UPDATE nh_control SET token='', lease=0 " +
      "WHERE id=1 AND token=?",
      token
    ).run();
  }
}

async function dashboard(original, prefix = "") {
  const blocks = [];

  for (const slot of SLOTS) {
    const env = scoped(original, slot);

    const s = await sql(
      env,
      "SELECT * FROM nh_control WHERE id=1"
    ).first();

    const h = await sql(
      env,
      "SELECT * FROM nh_health WHERE id=1"
    ).first();

    const check = await sql(
      original,
      "SELECT * FROM nh_connection_checks WHERE slot=?",
      slot
    ).first();

    const now = Date.now();

    const status = !s.enabled
      ? "停止中（開始操作が必要）"
      : s.lease > now
        ? "ON・処理中"
        : h.kind === "auth"
          ? "ON・要対応（前回の自動実行で認証エラー）"
          : s.next_at > now
            ? h.kind
              ? "ON・エラー後の休止中"
              : "ON・次の実行待ち"
            : "ON・定期実行待ち";

    const next = Math.max(s.next_at, s.lease);

    blocks.push(
      "アカウント " + slot +
      "\n\n【手動の接続確認】" +
      "\n結果：" + (check?.result || "未確認") +
      "\n確認日時：" + time(check?.checked) +
      (check?.message ? "\n" + check.message : "") +
      "\n※確認日時時点の結果です。Cookie更新後は再確認してください。" +
      "\n\n【自動運転】" +
      "\n状態：" + status +
      "\n確認済みスキ累計：" + s.total + "件" +
      "\n最終実行：" + time(s.checked) +
      "\n最終送信成功：" + time(h.success_at) +
      (
        s.enabled
          ? "\n次回：" + (
              next > now
                ? time(next) + "以降の定期実行"
                : "次の定期実行"
            )
          : ""
      ) +
      "\n送信成功まで保持する失敗回数：" + h.errors +
      "\n送信成功まで保持する429回数：" + h.rate_fail +
      "\nログイン設定：" + (
        env.NOTE_SESSION?.trim()
          ? "設定あり（有効性は接続確認・実行時に確認）"
          : "未設定・要対応"
      ) +
      "\n前回の自動実行結果：" + s.message +
      "\n巡回順：" + ORDERS[slot].join(" → ")
    );
  }

  return [prefix, ...blocks]
    .filter(Boolean)
    .join("\n\n──────────\n\n");
}

export default {
  async fetch(request, original) {
    const url = new URL(request.url);

    if (url.pathname === "/" && request.method === "GET") {
      return page(
        undefined,
        url.searchParams.get("account") === "2" ? "2" : "1"
      );
    }

    if (
      url.pathname !== "/control" ||
      request.method !== "POST"
    ) {
      return reply("Not found", false, 404);
    }

    if (request.headers.get("Origin") !== url.origin) {
      return reply(
        "操作画面を開き直してください。",
        false,
        403
      );
    }

    if (!original.ADMIN_KEY || !original.DB) {
      return page(
        "ADMIN_KEY または DB の設定を確認してください。"
      );
    }

    let slot = "1";

    try {
      const form = await request.formData();

      if (form.get("key") !== original.ADMIN_KEY) {
        return reply("管理用の鍵が違います。", false, 403);
      }

      slot = form.get("account") || "1";
      const action = form.get("action");

      if (
        !SLOTS.includes(slot) ||
        !["status", "start", "stop", "check_login"].includes(action)
      ) {
        return reply("操作を選んでください。", false, 400);
      }

      await prepare(original);

      if (action === "check_login") {
        const message = await checkConnection(original, slot);

        return page(
          await dashboard(original, message),
          slot
        );
      }

      const env = scoped(original, slot);

      const s = await sql(
        env,
        "SELECT * FROM nh_control WHERE id=1"
      ).first();

      let message = "";

      if (action === "stop") {
        await sql(
          env,
          "UPDATE nh_control SET enabled=0 WHERE id=1"
        ).run();

        message = "アカウント " + slot + " を停止しました。";
      } else if (action === "start") {
        if (s.lease > Date.now()) {
          message = "処理中です。少し待って確認してください。";
        } else {
          const id = s.account || await account(env);

          const other = await sql(
            scoped(original, slot === "1" ? "2" : "1"),
            "SELECT account FROM nh_control WHERE id=1"
          ).first();

          if (other.account === id) {
            message =
              "もう一方と同じnoteです。ログイン情報を確認してください。";
          } else {
            const result = await sql(
              env,
              "UPDATE nh_control SET enabled=1, account=? " +
              "WHERE id=1 AND lease<=?",
              id,
              Date.now()
            ).run();

            message = result.meta.changes
              ? "アカウント " + slot +
                " をONにしました。休止期限を守って自動確認します。"
              : "処理中のため変更しませんでした。";
          }
        }
      }

      return page(
        await dashboard(original, message),
        slot
      );
    } catch (error) {
      const message = error instanceof Trouble
        ? error.message
        : "接続・DB設定の確認に失敗しました。";

      try {
        return page(
          await dashboard(original, message),
          slot
        );
      } catch {
        return page(message, slot);
      }
    }
  },

  async scheduled(event, original, ctx) {
    ctx.waitUntil((async () => {
      try {
        await prepare(original);
      } catch {
        console.error(
          "note-helper: database initialization failed"
        );
        return;
      }

      await Promise.all(SLOTS.map(async slot => {
        try {
          await run(scoped(original, slot));
        } catch {
          console.error(
            "note-helper: account " + slot +
            " storage/runtime failure; retry later"
          );
        }
      }));
    })());
  }
};
