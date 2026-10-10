export default {
  async fetch(request) {
    if (new URL(request.url).pathname !== "/") {
      return new Response("Not found", { status: 404 });
    }

    const lines = ["タグ記事取得 v5"];
    const tags = ["小説", "短編小説", "創作", "散文"];

    for (const tag of tags) {
      lines.push("\n#" + tag);

      try {
        const url =
          "https://note.com/api/v3/hashtags/" +
          encodeURIComponent(tag) +
          "/notes?order=new&page=1";

        const res = await fetch(url, {
          headers: { Accept: "application/json" },
          redirect: "manual",
          signal: AbortSignal.timeout(15000)
        });

        lines.push("応答コード: " + res.status);

        if (!res.ok) {
          lines.push("取得できませんでした");
          break;
        }

        const json = await res.json();
        const data = json.data ?? json;
        const notes = data.notes;

        if (!Array.isArray(notes)) {
          lines.push("記事一覧の形式が想定と異なります");
          lines.push(
            "項目名: " + Object.keys(data).join(", ")
          );
          break;
        }

        lines.push("記事数: " + notes.length);

        for (const note of notes.slice(0, 3)) {
          lines.push(
            "・" + String(note.name ?? "題名なし")
          );
          lines.push(
            "記事キー: " + String(note.key ?? "なし")
          );
        }
      } catch {
        lines.push("通信またはデータ読み取りエラー");
        break;
      }
    }

    lines.push("\nスキは未実行です");

    return new Response(lines.join("\n"), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  }
};
