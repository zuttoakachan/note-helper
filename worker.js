export default {
  async fetch(request) {
    if (new URL(request.url).pathname !== "/") {
      return new Response("Not found", { status: 404 });
    }

    const lines = ["記事取得テスト v2"];
    try {
      const response = await fetch(
        "https://note.com/tag/" + encodeURIComponent("小説"),
        {
          redirect: "manual",
          signal: AbortSignal.timeout(15000)
        }
      );

      lines.push("応答コード: " + response.status);
      const articles = new Set();
      let title = "";

      const parsed = new HTMLRewriter()
        .on("title", {
          text(chunk) {
            title = (title + chunk.text).slice(0, 200);
          }
        })
        .on("a[href]", {
          element(element) {
            const href = element.getAttribute("href");
            try {
              const url = new URL(href, "https://note.com");
              if (
                url.origin === "https://note.com" &&
                /^\/[^/]+\/n\/n[a-f0-9]+$/.test(url.pathname)
              ) {
                articles.add(url.origin + url.pathname);
              }
            } catch {}
          }
        })
        .transform(response);

      await parsed.text();
      lines.push("ページ名: " + title);
      lines.push("記事リンク数: " + articles.size);
      lines.push(...Array.from(articles).slice(0, 5));
    } catch {
      lines.push("取得中にエラーが発生しました。");
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
