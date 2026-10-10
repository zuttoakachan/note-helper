const ARTICLE = "n39663ca41eb0";
function reply(body, html = false, status = 200) { return new Response(body, { status, headers: { "Content-Type": html ? "text/html; charset=utf-8" : "text/plain; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "same-origin", "Content-Security-Policy": "default-src 'none'; form-action 'self'; frame-ancestors 'none'", "X-Content-Type-Options": "nosniff" } }); }
export default { async fetch(request, env) { const url = new URL(request.url);
if (url.pathname === "/" && request.method === "GET") {
return reply(
  '<!doctype html><html lang="ja">' +
  '<meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>スキのテスト v6</title>' +
  '<h2>スキのテスト v6</h2>' +
  '<p>対象：第3話 おにぎりと、秘密の研究所</p>' +
  '<form method="post" action="/like">' +
  '<p>管理用の鍵（ADMIN_KEY）</p>' +
  '<input type="password" name="key" required autocomplete="off" autocapitalize="none">' +
  '<p><button type="submit">この1記事にスキする</button></p>' +
  '</form><p>自動運転は未開始です。</p></html>',
  true
);
}
if (url.pathname !== "/like" || request.method !== "POST") {
  return reply("Not found", false, 404);
}

if (request.headers.get("Origin") !== url.origin) {
  return reply("操作画面から実行してください。", false, 403);
}

if (!env.ADMIN_KEY || !env.NOTE_SESSION?.trim()) {
  return reply("ADMIN_KEY または NOTE_SESSION が未設定です。");
}

const form = await request.formData();
if (form.get("key") !== env.ADMIN_KEY) {
  return reply("管理用の鍵が違います。", false, 403);
}

const headers = {
  "Accept": "application/json",
  "Cookie": "_note_session_v5=" + env.NOTE_SESSION.trim()
};

const get = (path) => fetch("https://note.com" + path, {
  headers,
  redirect: "manual",
  signal: AbortSignal.timeout(15000)
});

try {
  const auth = await get("/api/v2/current_user");
  const authJson = await auth.json().catch(() => null);
  const user = authJson?.data?.user ?? authJson?.data;

  if (!auth.ok || !user?.id || !user?.urlname) {
    return reply("ログインを確認できないため停止しました。");
  }

  const path = "/api/v3/notes/" + ARTICLE;
  const before = await get(path);
  const beforeJson = await before.json().catch(() => null);

  if (!before.ok || !beforeJson?.data) {
    return reply("記事を確認できないため停止しました。");
  }

  if (beforeJson.data.is_liked === true) {
    return reply("この記事には、すでにスキしています。");
  }

  const res = await fetch("https://note.com" + path + "/likes", {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      "Origin": "https://note.com",
      "Referer": "https://note.com/"
    },
    body: "{}",
    redirect: "manual",
    signal: AbortSignal.timeout(15000)
  });

  if (!res.ok) {
    return reply(
      "スキの送信で停止しました。\n応答コード: " +
      res.status + "\n詳細: " + (await res.text()).slice(0, 1000)
    );
  }

  const after = await get(path);
  const afterJson = await after.json().catch(() => null);
  const confirmed =
    after.ok && afterJson?.data?.is_liked === true;

  return reply(
    "スキのテスト v6\n応答コード: " + res.status +
    (confirmed
      ? "\n記事データでスキ済みを確認しました。"
      : "\n送信は受け付けられました。反映はまだ未確認です。") +
    "\n記事キー: " + ARTICLE +
    "\n自動運転は未開始です。"
  );
} catch {
  return reply(
    "通信エラーで結果を確認できませんでした。\n" +
    "スキが届いた可能性もあるので、再送せず結果を教えてください。"
  );
}
} };
