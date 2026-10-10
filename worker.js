export default {
  async fetch() {
    const lines = ["記事取得テスト v3"];
    try {
      const res = await fetch(
        "https://note.com/tag/" + encodeURIComponent("小説"),
        { signal: AbortSignal.timeout(15000) }
      );
      lines.push("応答コード: " + res.status);

      const links = new Set();
      const samples = new Set();

      const parsed = new HTMLRewriter()
        .on("*", {
          element(el) {
            for (const [name, value] of el.attributes) {
              if (!value.includes("/n/")) continue;

              if (samples.size < 5) {
                samples.add(
                  name + ": " + value.slice(0, 200)
                );
              }

              try {
                const url = new URL(value, "https://note.com");
                if (
                  url.origin === "https://note.com" &&
                  /^\/[^/]+\/n\/n[a-f0-9]+\/?$/.test(url.pathname)
                ) {
                  links.add(url.origin + url.pathname);
                }
              } catch {}
            }
          }
        })
        .transform(res);

      await parsed.text();
      lines.push("記事リンク数: " + links.size);
      lines.push(...Array.from(links).slice(0, 5));
      if (!links.size) {
        lines.push("調査結果:");
        lines.push(
          ...samples.size
            ? Array.from(samples)
            : ["記事URLを含む属性なし"]
        );
      }
    } catch {
      lines.push("取得中にエラーが発生しました");
    }

    lines.push("ログイン・スキは未実行です。");
    return new Response(lines.join("\n\n"), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  }
};
