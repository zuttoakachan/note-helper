export default {
  async fetch(request, env) {
    const reply = (text) => new Response(text, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });

    if (new URL(request.url).pathname !== "/") {
      return new Response("Not found", { status: 404 });
    }

    const lines = ["ログイン確認 v4"];
    const session = env.NOTE_SESSION?.trim();

    if (!session) {
      return reply("ログイン確認 v4\nNOTE_SESSIONが未設定です");
    }

    if (/[\s;]/.test(session) || session.startsWith("_note_session")) {
      return reply("ログイン確認 v4\nCookieの値だけを保存してください");
    }

    try {
      const res = await fetch(
        "https://note.com/api/v2/current_user",
        {
          headers: {
            "Accept": "application/json",
            "Cookie": "_note_session_v5=" + session
          },
          redirect: "manual",
          signal: AbortSignal.timeout(15000)
        }
      );

      lines.push("応答コード: " + res.status);
      const json = await res.json().catch(() => null);
      const user = json?.data?.user ?? json?.data;

      if (res.ok && user?.id && user?.urlname) {
        lines.push("ログイン確認: 成功");
      } else {
        lines.push("ログイン確認: 未確認");
        lines.push(
          "応答形式: " + (json ? "JSON" : "JSON以外")
        );
      }
    } catch {
      lines.push("通信エラー。ログインは確認できませんでした");
    }

    lines.push("スキは未実行です");
    return reply(lines.join("\n\n"));
  }
};
