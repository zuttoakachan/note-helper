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
    '<!doctype html><html lang="ja">',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>note-helper v8</title>',
    '<style>',
    'body{font:17px system-ui;max-width:600px;margin:24px auto;padding:0 18px;line-height:1.7}',
    'input,button{font:inherit;padding:12px;box-sizing:border-box}',
    'input{width:100%}',
    'button{margin:12px 8px 0 0}',
    'pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f4f6;padding:16px}',
    '</style>',
    '<h1>note-helper v8</h1>',
    '<p>対象：小説・短編小説・創作・散文<br>毎分、タグを順番に確認。送信は最大1件。</p>',
    '<pre>' + esc(message) + '</pre>',
    '<form method="post" action="/control">',
    '<label>管理用の鍵（ADMIN_KEY）',
    '<input type="password" name="key" required autocomplete="off" autocapitalize="none" spellcheck="false">',
    '</label>',
    '<button name="action" value="status">状態を確認</button>',
    '<button name="action" value="start">自動運転を開始</button>',
    '<button name="action" value="stop">停止</button>',
    '</form>',
    '<p>停止直前に送信済みの1件は取り消されません。エラー時は自動停止します。</p>',
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
    )
  ]);
}

async function api(
  env,
  path,
  post = false,
  referer = "https://note.com/"
) {
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

  const response = await fetch("https://note.com" + path, {
    method: post ? "POST" : "GET",
    headers,
    ...(post ? { body: "{}" } : {}),
    redirect: "manual",
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error("noteの応答コード: " + response.status);
  }

  if (post) {
    await response.body?.cancel();
    return null;
  }

  const json = await response.json();
  return json.data ?? json;
}

async function account(env) {
  const data = await api(env, "/api/v2/current_user");
  const user = data.user ?? data;

  if (!user?.id || !user?.urlname) {
    throw new Error("ログインを確認できません。");
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
    now + 60000,
    now,
    now,
    now
  ).run();

  if (!locked.meta.changes) return;

  let pending = "";

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

    if (state.inflight) {
      throw new Error(
        "前回の送信結果が未確認です。記事キー: " +
        state.inflight
      );
    }

    if (!env.NOTE_SESSION?.trim()) {
      throw new Error("NOTE_SESSIONが未設定です。");
    }

    if (await account(env) !== state.account) {
      throw new Error("ログイン中のアカウントが変わりました。");
    }

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
      return;
    }

    const path = "/api/v3/notes/" + key;
    const article = await api(env, path);

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

    pending = key;

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

    await api(env, path + "/likes", true, referer);

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

    pending = "";
  } catch (error) {
    let message = error instanceof Error
      ? error.message
      : "処理エラー";

    if (
      !/^(noteの応答コード: \d+|ログインを|前回の|NOTE_SESSION|記事一覧の|記事URLを|送信後の)/.test(message)
    ) {
      message = "通信または保存でエラーが発生しました。";
    }

    await sql(
      env,
      "UPDATE nh_control SET enabled=0, message=? " +
      "WHERE id=1 AND token=?",
      "自動停止：" + message +
      (pending ? "\n再送しません。記事キー: " + pending : ""),
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
      return page("ADMIN_KEY または DB の設定を確認してください。");
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

        if (state.inflight) {
          return page(
            "送信結果が未確認のため再開していません。" +
            "記事キー：" + state.inflight +
            "\nこの画面を教えてください。"
          );
        }

        const id = await account(env);

        await sql(
          env,
          "UPDATE nh_control SET enabled=1, account=?, " +
          "message='開始済み。次の定期実行を待っています。' " +
          "WHERE id=1 AND lease<=? AND inflight=''",
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

      return page(
        "状態：" + (s.enabled ? "稼働設定ON" : "停止中") +
        "\nこの版で確認したスキ：" + s.total + "件" +
        "\n最終実行：" + time +
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
    ctx.waitUntil(run(env));
  }
};
