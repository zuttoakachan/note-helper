const ARTICLE = "n39663ca41eb0";

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
        "default-src 'none'; form-action 'self'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/" && request.method === "GET") {
      const html = [
        '<!doctype html>',
        '<html lang="ja">',
        '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width,initial-scale=1">',
        '<title>スキのテスト v7</title>',
        '</head>',
        '<body>',
        '<h2>スキのテスト v7</h2>',
        '<p>対象：第3話 おにぎりと、秘密の研究所</p>',
        '<p>この1記事へのスキをテストします。</p>',
        '<form method="post" action="/like">',
        '<label for="key">管理用の鍵（ADMIN_KEY）</label>',
        '<p><input id="key" type="password" name="key" required autocomplete="off" autocapitalize="none" spellcheck="false"></p>',
        '<button type="submit">この1記事にスキする</button>',
        '</form>',
        '<p>ボタンは1回だけ押してください。</p>',
        '<p>自動運転は未開始です。</p>',
        '</body>',
        '</html>'
      ].join("\n");

      return reply(html, true);
    }

    if (url.pathname !== "/like" || request.method !== "POST") {
      return reply("Not found", false, 404);
    }

    if (request.headers.get("Origin") !== url.origin) {
      return reply(
        "操作画面を開き直して実行してください。",
        false,
        403
      );
    }

    if (!env.ADMIN_KEY || !env.NOTE_SESSION?.trim()) {
      return reply(
        "ADMIN_KEY または NOTE_SESSION が未設定です。"
      );
    }

    const form = await request.formData();

    if (form.get("key") !== env.ADMIN_KEY) {
      return reply("管理用の鍵が違います。", false, 403);
    }

    const headers = {
      "Accept": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "Cookie": "_note_session_v5=" + env.NOTE_SESSION.trim()
    };

    const get = (path) => {
      return fetch("https://note.com" + path, {
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(15000)
      });
    };

    let sendAttempted = false;

    try {
      const auth = await get("/api/v2/current_user");
      const authJson = await auth.json().catch(() => null);
      const user = authJson?.data?.user ?? authJson?.data;

      if (!auth.ok || !user?.id || !user?.urlname) {
        return reply(
          "ログインを確認できないため停止しました。\n" +
          "応答コード: " + auth.status
        );
      }

      const path = "/api/v3/notes/" + ARTICLE;
      const before = await get(path);
      const beforeJson = await before.json().catch(() => null);

      if (!before.ok || !beforeJson?.data) {
        return reply(
          "記事を確認できないため停止しました。\n" +
          "応答コード: " + before.status
        );
      }

      if (beforeJson.data.is_liked === true) {
        return reply(
          "この記事には、すでにスキしています。\n" +
          "追加の送信はしていません。"
        );
      }

      sendAttempted = true;

      const res = await fetch(
        "https://note.com" + path + "/likes",
        {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
            "Origin": "https://note.com",
            "Referer":
              "https://note.com/clear_cedum2764/n/" + ARTICLE
          },
          body: "{}",
          redirect: "manual",
          signal: AbortSignal.timeout(15000)
        }
      );

      if (!res.ok) {
        let detail = await res.text();

        for (const secret of [
          env.ADMIN_KEY,
          env.NOTE_SESSION,
          env.NOTE_SESSION.trim()
        ]) {
          if (secret) {
            detail = detail.split(secret).join("[非表示]");
          }
        }

        return reply(
          "スキのテスト v7\n" +
          "スキの送信で停止しました。\n" +
          "応答コード: " + res.status + "\n" +
          "詳細: " + detail.slice(0, 1000) + "\n" +
          "再送せず、この結果を教えてください。"
        );
      }

      const after = await get(path);
      const afterJson = await after.json().catch(() => null);
      const confirmed =
        after.ok && afterJson?.data?.is_liked === true;

      return reply(
        "スキのテスト v7\n" +
        "応答コード: " + res.status + "\n" +
        (
          confirmed
            ? "記事データでスキ済みを確認しました。"
            : "送信は受け付けられました。反映はまだ未確認です。"
        ) +
        "\n記事キー: " + ARTICLE +
        "\n自動運転は未開始です。" +
        "\nこの結果を教えてください。"
      );
    } catch {
      return reply(
        sendAttempted
          ? "通信エラーで結果を確認できませんでした。\nスキが届いた可能性があるので、再送せず結果を教えてください。"
          : "送信前の確認で通信エラーになりました。\nスキは送信していません。"
      );
    }
  }
};
