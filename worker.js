const TAGS = ["小説", "短編小説", "創作", "散文"];

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

function page(message = "管理用の鍵を入力してください。") {
  return reply([
    '<!doctype html><html lang="ja"><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>note-helper v9</title>',
    '<style>',
    'body{font:17px system-ui;max-width:600px;margin:24px auto;padding:0 18px;line-height:1.7}',
    'input,button{font:inherit;padding:12px;box-sizing:border-box}',
    'input{width:100%}button{margin:12px 8px 0 0}',
    'pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f4f6;padding:16px}',
    '</style>',
    '<h1>note-helper v9</h1>',
    '<p>対象：小説・短編小説・創作・散文<br>通常は毎分確認、最大1件送信。制限・エラー中は待機。</p>',
    '<pre>' + esc(message) + '</pre>',
    '<form method="post" action="/control">',
    '<label>管理用の鍵（ADMIN_KEY）',
    '<input type="password" name="key" required autocomplete="off" autocapitalize="none" spellcheck="false">',
    '</label>',
    '<button name="action" value="status">状態を確認</button>',
    '<button name="action" value="start">自動運転を開始</button>',
    '<button name="action" value="stop">停止</button>',
    '</form>',
    '<p>停止直前に送信済みの1件は取り消されません。エラー時は待機して自動再確認します。</p>',
    '</html>'
  ].join("\n"), true);
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
    throw new Trouble("NOTE_SESSIONの更新待ち", 21600000);
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
    const retry = response.headers.get("Retry-After");

    const wait = retry && /^\d+$/.test(retry)
      ? Number(retry) * 1000
      : Math.max(
          0,
          Date.parse(retry || "") - Date.now()
        ) || 0;

    await response.body?.cancel().catch(() => {});

    const base = [401, 403].includes(code)
      ? 21600000
      : [429, 422].includes(code)
        ? 3600000
        : code >= 500
          ? 300000
          : 3600000;

    throw new Trouble(
      "note応答 " + code,
      Math.max(base, wait)
    );
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
    throw new Trouble("ログイン情報の更新待ち", 21600000);
  }

  return String(user.id);
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
    Math.floor(now / 60000) * 60000 + 60000,
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

  try {
    const state = await sql(
      env,
      "SELECT * FROM nh_control WHERE id=1"
    ).first();

    stage = "ログイン確認";

    if (await account(env) !== state.account) {
      throw new Trouble(
        "アカウントが違います。元のNOTE_SESSIONに戻してください",
        21600000
      );
    }

    const reset = () => sql(
      env,
      "UPDATE nh_retry SET failures=0 WHERE id=1"
    ).run();

    if (state.inflight) {
      stage = "前回送信の確認";
      let article;

      try {
        article = await api(
          env,
          "/api/v3/notes/" + state.inflight
        );
      } catch (error) {
        if (
          error instanceof Trouble &&
          error.message === "note応答 404"
        ) {
          article = {};
        } else {
          throw error;
        }
      }

      const liked = article.is_liked === true;

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

    const tag = TAGS[state.cursor % TAGS.length];

    await sql(
      env,
      "UPDATE nh_control SET cursor=cursor+1 WHERE id=1 AND token=?",
      token
    ).run();

    const data = await api(
      env,
      "/api/v3/hashtags/" +
      encodeURIComponent(tag) +
      "/notes?order=new&page=1"
    );

    if (!Array.isArray(data.notes)) {
      throw new Error("記事一覧の形式を確認できません。");
    }

    const keys = [...new Set(
      data.notes
        .map(n => n.key)
        .filter(k => /^n[a-z0-9]+$/.test(k))
    )].slice(0, 50);

    if (!keys.length) {
      await note("#" + tag + "：記事なし");
      await reset();
      return;
    }

    const seen = await sql(
      env,
      "SELECT key FROM nh_seen WHERE key IN (" +
      keys.map(() => "?").join(",") +
      ")",
      ...keys
    ).all();

    const done = new Set(seen.results.map(row => row.key));
    const key = keys.find(k => !done.has(k));

    if (!key) {
      await note("#" + tag + "：取得した記事は確認済み");
      await reset();
      return;
    }

    const path = "/api/v3/notes/" + key;

    stage = "記事確認";
    let article;

    try {
      article = await api(env, path);
    } catch (error) {
      if (
        error instanceof Trouble &&
        error.message === "note応答 404"
      ) {
        await sql(
          env,
          "INSERT OR IGNORE INTO nh_seen VALUES (?, 'missing', ?)",
          key,
          Date.now()
        ).run();

        await note("削除された記事を除外しました");
        await reset();
        return;
      }

      throw error;
    }

    if (
      article.is_liked === true ||
      String(article.user?.id ?? article.user_id) === state.account
    ) {
      await sql(
        env,
        "INSERT OR IGNORE INTO nh_seen VALUES (?, 'skip', ?)",
        key,
        Date.now()
      ).run();

      await note("#" + tag + "：スキ済み・自分の記事を除外");
      await reset();
      return;
    }

    const referer = article.note_url || (
      article.user?.urlname
        ? "https://note.com/" + article.user.urlname + "/n/" + key
        : ""
    );

    if (
      !referer.startsWith("https://note.com/") ||
      !referer.includes("/n/" + key)
    ) {
      throw new Error(
        "記事URLを確認できません。記事キー: " + key
      );
    }

    const gate = await sql(
      env,
      "UPDATE nh_control SET inflight=?, lease=? " +
      "WHERE id=1 AND token=? AND enabled=1 AND lease>?",
      key,
      Date.now() + 300000,
      token,
      Date.now()
    ).run();

    if (!gate.meta.changes) return;

    stage = "送信予約の保存";

    const claimed = await sql(
      env,
      "INSERT OR IGNORE INTO nh_seen VALUES (?, 'pending', ?)",
      key,
      Date.now()
    ).run();

    if (!claimed.meta.changes) {
      await sql(
        env,
        "UPDATE nh_control SET inflight='' WHERE id=1 AND token=?",
        token
      ).run();

      return;
    }

    stage = "スキ送信";

    await api(env, path + "/likes", true, referer);

    stage = "送信後の確認";

    const after = await api(env, path);

    if (after.is_liked !== true) {
      throw new Error(
        "送信後のスキを確認できません。記事キー: " + key
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

    const backoff = [
      300000,
      900000,
      3600000
    ][Math.min(2, count.failures - 1)];

    const wait = Math.max(
      backoff,
      error instanceof Trouble ? error.wait : 3600000
    );

    const detail = error instanceof Trouble
      ? error.message
      : "通信・保存・応答内容のエラー";

    await sql(
      env,
      "UPDATE nh_control SET next_at=?, message=? " +
      "WHERE id=1 AND token=?",
      Date.now() + wait,
      "自動再確認待ち：" + stage + "／" + detail,
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/" && request.method === "GET") {
      return page();
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

    if (!env.ADMIN_KEY || !env.DB) {
      return page(
        "ADMIN_KEY または DB の設定を確認してください。"
      );
    }

    const form = await request.formData();

    if (form.get("key") !== env.ADMIN_KEY) {
      return reply("管理用の鍵が違います。", false, 403);
    }

    try {
      await init(env);

      const action = form.get("action");

      if (action === "stop") {
        await sql(
          env,
          "UPDATE nh_control SET enabled=0 WHERE id=1"
        ).run();
      } else if (action === "start") {
        if (!env.NOTE_SESSION?.trim()) {
          return page("NOTE_SESSIONが未設定です。");
        }

        const state = await sql(
          env,
          "SELECT * FROM nh_control WHERE id=1"
        ).first();

        if (state.lease > Date.now()) {
          return page(
            "前の処理中です。少し待って状態を確認してください。"
          );
        }

        const id = await account(env);

        if (state.account && state.account !== id) {
          return page(
            "アカウントが違います。元のNOTE_SESSIONに戻してください。"
          );
        }

        await sql(
          env,
          "UPDATE nh_control SET enabled=1, account=? " +
          "WHERE id=1 AND lease<=?",
          id,
          Date.now()
        ).run();
      }

      const s = await sql(
        env,
        "SELECT * FROM nh_control WHERE id=1"
      ).first();

      const time = s.checked
        ? new Date(s.checked).toLocaleString(
            "ja-JP",
            { timeZone: "Asia/Tokyo" }
          )
        : "まだありません";

      const next = new Date(
        Math.max(s.next_at, s.lease, Date.now())
      ).toLocaleString(
        "ja-JP",
        { timeZone: "Asia/Tokyo" }
      );

      const status = s.enabled
        ? s.next_at > Date.now()
          ? "ON・待機中"
          : "稼働設定ON"
        : "手動停止中";

      return page(
        "状態：" + status +
        "\n確認済みスキ累計：" + s.total + "件" +
        "\n最終実行：" + time +
        (s.enabled ? "\n次回確認の目安：" + next : "") +
        "\n" + s.message
      );
    } catch {
      return page(
        "接続・ログイン・データベースの確認でエラーになりました。" +
        "状態を再確認してください。"
      );
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      try {
        await init(env);
        await run(env);
      } catch {
        console.error(
          "note-helper: storage/runtime failure; retry on next cron"
        );
      }
    })());
  }
};
