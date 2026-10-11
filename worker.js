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
const INTERVAL = 120000;

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
  message = "管理用の鍵を入力して、状態を確認してください。",
  slot = "1"
) {
  return reply(`<!doctype html>
<html lang="ja">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>note-helper v11</title>
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
<h1>note-helper v11</h1>
<p>
対象：小説・短編小説・創作・散文・エッセイ・詩・日記<br>
2分ごとの定期実行で各アカウント最大1件。
制限・エラー中は待機して自動確認します。
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
状態確認は2アカウント分を表示。
開始・停止は選択した方だけに適用します。
</p>
<label>
管理用の鍵（ADMIN_KEY）
<input type="password" name="key" required
 autocomplete="off" autocapitalize="none" spellcheck="false">
</label>
<button name="action" value="status">両方の状態を確認</button>
<button name="action" value="start">自動運転を開始</button>
<button name="action" value="stop">停止</button>
</form>
<p>
同じ記事は両アカウントで共有する履歴により除外します。
送信結果が不明な記事も再送しません。
停止直前の送信は取り消せません。
</p>
<p>
表示は自動更新されません。
ログイン期限切れや設定不備は手動での修正が必要です。
</p>
</html>`, true);
}

function scoped(env, slot) {
  return {
    ...env,
    SLOT: slot,
    NOTE_SESSION: slot === "2"
      ? env.NOTE_SESSION_2
      : env.NOTE_SESSION,
    DB: slot === "1" ? env.DB : {
      prepare: query => env.DB.prepare(
        query.replace(
          /\b(nh_control|nh_seen|nh_retry)\b/g,
          "$1_2"
        )
      ),
      batch: statements => env.DB.batch(statements)
    }
  };
}

async function init(env) {
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
      "INSERT OR IGNORE INTO nh_control (id) VALUES (1)"
    ),
    env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS nh_retry (" +
      "id INTEGER PRIMARY KEY, " +
      "failures INTEGER NOT NULL DEFAULT 0)"
    ),
    env.DB.prepare(
      "INSERT OR IGNORE INTO nh_retry (id) VALUES (1)"
    )
  ]);
}

async function prepare(original) {
  for (const slot of SLOTS) {
    await init(scoped(original, slot));
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
    )
  ]);

  // 旧版の履歴・結果未確認の記事も、両アカウントで除外する。
  await original.DB.batch([
    original.DB.prepare(
      "INSERT OR IGNORE INTO nh_shared " +
      "SELECT key, '1', 'history', created FROM nh_seen " +
      "WHERE NOT EXISTS (" +
      "SELECT 1 FROM nh_migrations WHERE name='v11-shared')"
    ),
    original.DB.prepare(
      "INSERT OR IGNORE INTO nh_shared " +
      "SELECT key, '2', 'history', created FROM nh_seen_2 " +
      "WHERE NOT EXISTS (" +
      "SELECT 1 FROM nh_migrations WHERE name='v11-shared')"
    ),
    original.DB.prepare(
      "INSERT OR IGNORE INTO nh_shared " +
      "SELECT inflight, '1', 'history', checked FROM nh_control " +
      "WHERE inflight<>'' AND NOT EXISTS (" +
      "SELECT 1 FROM nh_migrations WHERE name='v11-shared')"
    ),
    original.DB.prepare(
      "INSERT OR IGNORE INTO nh_shared " +
      "SELECT inflight, '2', 'history', checked FROM nh_control_2 " +
      "WHERE inflight<>'' AND NOT EXISTS (" +
      "SELECT 1 FROM nh_migrations WHERE name='v11-shared')"
    ),
    original.DB.prepare(
      "INSERT OR IGNORE INTO nh_migrations VALUES ('v11-shared')"
    )
  ]);
}

class Trouble extends Error {
  constructor(message, wait = 300000) {
    super(message);
    this.wait = wait;
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
      "要対応：ログイン情報が未設定です",
      21600000
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
    const retry = response.headers.get("Retry-After") || "";

    const parsed = /^\d+$/.test(retry)
      ? Number(retry) * 1000
      : Date.parse(retry) - Date.now();

    const wait = Number.isFinite(parsed)
      ? Math.max(0, parsed)
      : 0;

    await response.body?.cancel().catch(() => {});

    const base = [401, 403].includes(code)
      ? 21600000
      : code >= 500
        ? 300000
        : 3600000;

    const detail = code === 401
      ? "：要対応・ログイン情報を確認"
      : code === 403
        ? "：アクセス拒否・ログイン情報や利用制限を確認"
        : code === 429
          ? "：回数制限の解除待ち"
          : code === 422
            ? "：送信内容などを受け付けられません"
            : "";

    const error = new Trouble(
      "note応答 " + code + detail,
      Math.max(base, wait)
    );

    error.code = code;
    throw error;
  }

  if (post) {
    await response.body?.cancel().catch(() => {});
    return;
  }

  try {
    const json = await response.json();

    if (!json || typeof json !== "object") {
      throw new Error();
    }

    return json.data ?? json;
  } catch {
    throw new Trouble("応答形式を確認できません");
  }
}

async function account(env) {
  const data = await api(env, "/api/v2/current_user");
  const user = data.user ?? data;

  if (!user?.id || !user?.urlname) {
    throw new Trouble(
      "要対応：ログイン情報を更新してください",
      21600000
    );
  }

  return String(user.id);
}

async function detail(env, key) {
  try {
    return await api(env, "/api/v3/notes/" + key);
  } catch (error) {
    if (error.code === 404) return null;
    throw error;
  }
}

async function run(env) {
  const token = crypto.randomUUID();
  const now = Date.now();

  const locked = await sql(
    env,
    "UPDATE nh_control " +
    "SET token=?, lease=?, next_at=?, checked=? " +
    "WHERE id=1 AND enabled=1 AND lease<? AND next_at<=?",
    token,
    now + 300000,
    Math.floor(now / INTERVAL) * INTERVAL + INTERVAL,
    now,
    now,
    now
  ).run();

  if (!locked.meta.changes) return;

  let stage = "準備";

  const note = message => sql(
    env,
    "UPDATE nh_control SET message=? WHERE id=1 AND token=?",
    message,
    token
  ).run();

  const reset = () => sql(
    env,
    "UPDATE nh_retry SET failures=0 WHERE id=1"
  ).run();

  try {
    const state = await sql(
      env,
      "SELECT * FROM nh_control WHERE id=1"
    ).first();

    stage = "ログイン確認";

    if (await account(env) !== state.account) {
      throw new Trouble(
        "要対応：元のアカウントのログイン情報に戻してください",
        21600000
      );
    }

    if (state.inflight) {
      stage = "前回送信の確認";

      const article = await detail(env, state.inflight);
      const liked = article?.is_liked === true;

      const previous = await sql(
        env,
        "SELECT status FROM nh_seen WHERE key=?",
        state.inflight
      ).first();

      await env.DB.batch([
        sql(
          env,
          "INSERT INTO nh_seen VALUES (?, ?, ?) " +
          "ON CONFLICT(key) DO UPDATE SET status=excluded.status",
          state.inflight,
          liked ? "liked" : "uncertain",
          Date.now()
        ),
        sql(
          env,
          "UPDATE nh_control " +
          "SET inflight='', total=total+?, message=? " +
          "WHERE id=1 AND token=?",
          liked && previous?.status !== "liked" ? 1 : 0,
          liked
            ? "前回の記事のスキを確認しました"
            : "前回の記事は再送せず除外しました",
          token
        )
      ]);

      await reset();
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
      throw new Trouble("記事一覧の形式を確認できません");
    }

    const keys = [...new Set(
      data.notes
        .map(n => n.key)
        .filter(k =>
          typeof k === "string" &&
          /^n[a-z0-9]+$/.test(k)
        )
    )].slice(0, 50);

    if (!keys.length) {
      await note("#" + tag + "：記事なし");
      await reset();
      return;
    }

    const placeholders = keys.map(() => "?").join(",");

    const seen = await sql(
      env,
      "SELECT key FROM nh_seen WHERE key IN (" +
      placeholders +
      ") UNION SELECT key FROM nh_shared WHERE key IN (" +
      placeholders + ")",
      ...keys,
      ...keys
    ).all();

    const done = new Set(seen.results.map(row => row.key));
    const key = keys.find(k => !done.has(k));

    if (!key) {
      await note("#" + tag + "：履歴・共通予約を除く候補なし");
      await reset();
      return;
    }

    stage = "記事確認";

    const article = await detail(env, key);

    if (
      !article ||
      article.is_liked === true ||
      String(article.user?.id ?? article.user_id) === state.account
    ) {
      await sql(
        env,
        "INSERT OR IGNORE INTO nh_seen VALUES (?, 'skip', ?)",
        key,
        Date.now()
      ).run();

      await note(
        "#" + tag + "：削除済み・スキ済み・自分の記事を除外"
      );

      await reset();
      return;
    }

    const referer = article.note_url || (
      article.user?.urlname
        ? "https://note.com/" + article.user.urlname + "/n/" + key
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
      throw new Trouble("記事URLを確認できません", 3600000);
    }

    stage = "共通送信予約の保存";

    // 共通予約と未確認送信の記録を、送信前に一括保存する。
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
      await note(
        "共通予約済みの記事、または停止操作により送信を見送りました"
      );
      await reset();
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

    const after = await detail(env, key);

    if (after?.is_liked !== true) {
      throw new Trouble(
        "送信結果が未確認です。再送せず確認します"
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
        "UPDATE nh_control " +
        "SET inflight='', total=total+1, message=? " +
        "WHERE id=1 AND token=?",
        "スキ確認済み：" + key + "（#" + tag + "）",
        token
      )
    ]);

    await reset();
  } catch (error) {
    const count = await sql(
      env,
      "UPDATE nh_retry SET failures=failures+1 " +
      "WHERE id=1 RETURNING failures"
    ).first();

    const backoff = [300000, 900000, 3600000][
      Math.min(2, count.failures - 1)
    ];

    const wait = Math.max(
      backoff,
      error instanceof Trouble ? error.wait : 3600000
    );

    await sql(
      env,
      "UPDATE nh_control SET next_at=?, message=? " +
      "WHERE id=1 AND token=?",
      Date.now() + wait,
      "自動再確認待ち：" + stage + "／" +
      (
        error instanceof Trouble
          ? error.message
          : "通信・保存・応答内容のエラー"
      ),
      token
    ).run();
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

    const now = Date.now();

    const status = !s.enabled
      ? "停止中（開始操作が必要）"
      : s.lease > now
        ? "ON・処理中"
        : s.next_at > now
          ? s.message.startsWith("自動再確認待ち")
            ? "ON・エラー後の待機中"
            : "ON・次の実行待ち"
          : "ON・定期実行待ち";

    const eligible = Math.max(s.next_at, s.lease);

    blocks.push(
      "アカウント " + slot +
      "\n状態：" + status +
      "\n確認済みスキ累計：" + s.total + "件" +
      "\n最終実行：" + time(s.checked) +
      (
        s.enabled
          ? "\n次回：" + (
              eligible > now
                ? time(eligible) + "以降の定期実行"
                : "次の定期実行"
            )
          : ""
      ) +
      "\nログイン設定：" + (
        env.NOTE_SESSION?.trim()
          ? "設定あり（有効性は実行時に確認）"
          : "未設定・要対応"
      ) +
      "\n" + s.message +
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
        !["status", "start", "stop"].includes(action)
      ) {
        return reply("操作を選んでください。", false, 400);
      }

      await prepare(original);

      const env = scoped(original, slot);
      let message = "";

      if (action === "stop") {
        await sql(
          env,
          "UPDATE nh_control SET enabled=0 WHERE id=1"
        ).run();

        message = "アカウント " + slot + " を停止しました。";
      } else if (action === "start") {
        const state = await sql(
          env,
          "SELECT * FROM nh_control WHERE id=1"
        ).first();

        if (state.lease > Date.now()) {
          message =
            "処理中です。少し待って状態を確認してください。";
        } else {
          const id = await account(env);

          const other = await sql(
            scoped(original, slot === "1" ? "2" : "1"),
            "SELECT account FROM nh_control WHERE id=1"
          ).first();

          if (other.account === id) {
            message =
              "もう一方と同じnoteです。別のログイン情報を設定してください。";
          } else if (state.account && state.account !== id) {
            message =
              "元のアカウントのログイン情報に戻してください。";
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
                " をONにしました。待機期限は保持します。"
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
        ? error.message +
          "。アカウント " + slot + " の " +
          (slot === "2" ? "NOTE_SESSION_2" : "NOTE_SESSION") +
          " を確認してください。"
        : "接続・データベースの確認でエラーになりました。状態を再確認してください。";

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
          "note-helper: storage initialization failed; retry next cron"
        );
        return;
      }

      // 一方の通信待ちやエラーで、もう一方を待たせない。
      await Promise.all(SLOTS.map(async slot => {
        try {
          await run(scoped(original, slot));
        } catch {
          console.error(
            "note-helper: account " + slot +
            " storage/runtime failure; retry next cron"
          );
        }
      }));
    })());
  }
};
