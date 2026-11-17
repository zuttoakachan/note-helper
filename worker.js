const VERSION = 'v16.5.1';
const MAX_AUTHOR_HOURS = 365 * 24;
const SLOTS = ['1', '2'];
const DEFAULT_TAGS = ['小説', '短編小説', '創作', '散文', 'エッセイ', '詩', '日記', 'ショートショート', '掌編小説', '詩のようなもの', '自由詩', '独白', '希死念慮', '鬱', '恋愛', '恋愛エッセイ', '人間関係', '恋愛小説', '家族', '孤独', '生き方', '愛', '記憶', '喪失', '文学'];
const HOUR = 3600000, INTERVAL = 240000, LEASE = 300000;
const sql = (env, q, ...a) => env.DB.prepare(q).bind(...a);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time = n => n ? new Date(n).toLocaleString('ja-JP', {timeZone:'Asia/Tokyo'}) : 'まだありません';
const day = (ago=0) => new Date(Date.now() + 9 * HOUR - ago * 24 * HOUR).toISOString().slice(0, 10);
function scoped(original, slot) {
  return {...original, SLOT:slot, NOTE_SESSION:slot === '2' ? original.NOTE_SESSION_2 : original.NOTE_SESSION,
    DB:slot === '1' ? original.DB : {
      prepare:q => original.DB.prepare(q.replace(/\b(nh_control|nh_seen|nh_health)\b/g, '$1_2')),
      batch:items => original.DB.batch(items)
    }};
}
function reply(body, html = false, status = 200) {
  return new Response(body, {status, headers:{
    'Content-Type':html ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control':'no-store', 'Referrer-Policy':'same-origin',
    'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    'X-Content-Type-Options':'nosniff'
  }});
}
function page(message = '管理用の鍵を入力してください。', slot = '1', settings = null, status = 200) {
  return reply(`<!doctype html><html lang="ja"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>note-helper ${VERSION}</title>
<style>body{font:17px system-ui;max-width:700px;margin:24px auto;padding:0 18px;line-height:1.7}input,textarea,select,button{font:inherit;padding:12px;box-sizing:border-box}input,textarea,select{width:100%}button{margin:12px 8px 0 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f4f6;padding:16px}details{margin-top:24px}small{display:block}</style>
<h1>note-helper ${VERSION}</h1><p><a href="/520">520の作品管理・記録</a></p>
<p>通常は各アカウント4分以上の間隔で最大1件。2垢がONの間は処理開始も約2分以上ずらします。間隔は下の設定で変更できます。実行が遅れる場合があります。</p>
<p>送信前の一時的な読み取りエラーは、次の通常間隔で自動再試行します。スキの送信・結果確認のエラー、認証・回数制限などでは原則2時間待機します。noteが指定した待機時間を守ります。</p>
<pre>${esc(message)}</pre>
<form method="post" action="/control">
<label>操作するアカウント<select name="account">
<option value="1"${slot === '1' ? ' selected' : ''}>1：今までのnote</option>
<option value="2"${slot === '2' ? ' selected' : ''}>2：追加したnote</option></select></label>
<label>管理用の鍵（ADMIN_KEY）<input type="password" name="key" required autocomplete="off" autocapitalize="none" spellcheck="false"></label>
<button name="action" value="status">両方の状態を確認</button>
<button name="action" value="check">選択したアカウントの接続確認</button>
<button name="action" value="start">自動運転を開始</button>
<button name="action" value="stop">停止</button>
<details><summary>ログイン情報を更新する</summary>
<p>上で更新するアカウントを選び、Cookie Editorの _note_session_v5 のValueだけを貼ってください。</p>
<label>新しいCookieの値<input type="password" name="cookie" maxlength="16000" autocomplete="off" autocapitalize="none" spellcheck="false"></label>
<button name="action" value="save">本人確認してCookieを保存</button>
<small>登録済みのnote本人と確認できた場合だけ暗号化保存します。失敗時は以前の設定を残します。いいねは送信しません。</small></details>
<details><summary>巡回タグ・間隔・探索件数を変更</summary>
<p>「両方の状態を確認」を押すと現在の設定を読み込みます。タグは1行に1つ、最大35個。保存すると両アカウントに適用し、2番の巡回順をずらします。</p>
<label>タグ一覧<textarea name="tags" rows="13" maxlength="3000" placeholder="状態確認で現在のタグを表示">${settings ? esc(settings.tags.join('\n')) : ''}</textarea></label>
<label>同じ作者への間隔（時間・1〜${MAX_AUTHOR_HOURS}）<input name="author_hours" type="number" min="1" max="${MAX_AUTHOR_HOURS}" step="1" value="${settings ? settings.author_hours : ''}"></label>
<p>720時間で30日、2160時間で90日、8760時間で365日です。同じ作者への待機は2垢で共有します。結果不明の送信も履歴に残し、別の作者を探します。旧版で記録済みの作者履歴を引き継ぎます。</p>
<label>各アカウントの実行間隔（秒・240〜3600、30秒刻み）<input name="interval_seconds" type="number" min="240" max="3600" step="30" value="${settings ? settings.interval_seconds : ''}"></label>
<label>1回に取得するタグ一覧の上限（1〜3）<input name="scan_tags" type="number" min="1" max="3" step="1" value="${settings ? settings.scan_tags : ''}"></label>
<label>1回に確認する記事詳細の上限（1〜5）<input name="scan_notes" type="number" min="1" max="5" step="1" value="${settings ? settings.scan_notes : ''}"></label>
<label>候補が尽きたタグを休ませる時間（分・0〜120）<input name="empty_minutes" type="number" min="0" max="120" step="1" value="${settings ? settings.empty_minutes : ''}"></label>
<small>初期値は4分・最大2タグ・記事詳細3件・候補なし15分待ち。上限内でも送信は最大1件。変更前の休止・次回時刻は短縮しません。</small>
<button name="action" value="settings">両方の設定を保存</button></details>
<details><summary>設定と実績をダウンロード</summary>
<p>設定・累計・直近30日の集計をJSONで保存できます。Cookie・管理用の鍵・Botトークン・通知先・作者IDは含めません。ログイン情報やデータベース全体のバックアップではありません。</p>
<button name="action" value="export">設定と実績を保存</button></details>
<details><summary>Telegram通知を設定・確認</summary>
<p>CloudflareのSecretに TELEGRAM_BOT_TOKEN を設定してから使用します。ログイン・アクセス拒否・暗号化設定のエラーを通知します。同じ問題の通知は原則24時間に1回です。</p>
<button name="action" value="tg_pair">① 連携コードを発行</button>
<button name="action" value="tg_connect">② Telegramとの連携を確認</button>
<button name="action" value="tg_test">通知をテスト</button>
<button name="action" value="tg_off">通知を解除</button></details>
</form>
<p>接続確認・Cookie保存は各アカウント5分に1回まで。回数制限の休止中やnoteが指定した待機中は実行しません。画面は自動更新されません。</p>
<p>接続確認OKは確認日時時点の結果です。いいね送信の制限解除を保証するものではありません。開始やCookie保存では自動運転の休止期限を短縮しません。停止直前の送信は取り消せません。</p></html>`, true, status);
}

const READY = 'v15.2-ready';
function errorText(error) {
  return [error?.message, error?.cause?.message, typeof error?.cause === 'string' ? error.cause : ''].join(' ');
}
function readLimit(error) {
  return /D1_ERROR/i.test(errorText(error)) && /daily row read limit/i.test(errorText(error));
}
const quotaMessage = 'Cloudflare D1の日次読み取り上限に達しました。枠は日本時間9:00に更新されます。状態や操作結果は、更新後に「両方の状態を確認」で確認してください。';
function failure(error) {
  if (readLimit(error)) return quotaMessage;
  if (error instanceof Trouble) return error.message;
  if (/D1_ERROR|D1_EXEC_ERROR/i.test(errorText(error))) return 'Cloudflare D1で読み込みまたは保存に失敗しました。日次読み取り上限かどうかは未確認です。';
  return '接続・保存・内部処理に失敗しました。操作結果を確認できません。';
}
async function prepare(original) {
  // D1に永続化した完了行を主キーで読む。途中失敗ではこの行を書かない。
  try {
    if (await sql(original,'SELECT name FROM nh_migrations WHERE name=?',READY).first()) return;
  } catch (error) {
    if (!/no such table:\s*(?:main\.)?nh_migrations\b/i.test(errorText(error))) throw error;
  }
  const db = original.DB;
  const schema = [];
  for (const slot of SLOTS) {
    const env = scoped(original,slot);
    schema.push(
      env.DB.prepare("CREATE TABLE IF NOT EXISTS nh_control (id INTEGER PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, account TEXT NOT NULL DEFAULT '', cursor INTEGER NOT NULL DEFAULT 0, token TEXT NOT NULL DEFAULT '', lease INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0, inflight TEXT NOT NULL DEFAULT '', total INTEGER NOT NULL DEFAULT 0, message TEXT NOT NULL DEFAULT '未開始', checked INTEGER NOT NULL DEFAULT 0)"),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS nh_seen (key TEXT PRIMARY KEY, status TEXT NOT NULL, created INTEGER NOT NULL)'),
      env.DB.prepare("CREATE TABLE IF NOT EXISTS nh_health (id INTEGER PRIMARY KEY, rate_fail INTEGER NOT NULL DEFAULT 0, errors INTEGER NOT NULL DEFAULT 0, kind TEXT NOT NULL DEFAULT '', success_at INTEGER NOT NULL DEFAULT 0)"),
      env.DB.prepare('INSERT OR IGNORE INTO nh_control (id) VALUES (1)'),
      env.DB.prepare('INSERT OR IGNORE INTO nh_health (id) VALUES (1)')
    );
  }
  for (const query of [
    'CREATE TABLE IF NOT EXISTS nh_shared (key TEXT PRIMARY KEY, slot TEXT NOT NULL, token TEXT NOT NULL, created INTEGER NOT NULL)',
    'CREATE TABLE IF NOT EXISTS nh_migrations (name TEXT PRIMARY KEY)',
    'CREATE TABLE IF NOT EXISTS nh_v13_credentials (slot TEXT PRIMARY KEY, iv TEXT NOT NULL, ciphertext TEXT NOT NULL, updated INTEGER NOT NULL)',
    "CREATE TABLE IF NOT EXISTS nh_v13_connection (slot TEXT PRIMARY KEY, next_check INTEGER NOT NULL DEFAULT 0, hold_until INTEGER NOT NULL DEFAULT 0, checked INTEGER NOT NULL DEFAULT 0, ok INTEGER NOT NULL DEFAULT 0, message TEXT NOT NULL DEFAULT '未確認')",
    "INSERT OR IGNORE INTO nh_v13_connection (slot) VALUES ('1'),('2')",
    'CREATE TABLE IF NOT EXISTS nh_v13_success (slot TEXT NOT NULL, key TEXT NOT NULL, day TEXT NOT NULL, confirmed INTEGER NOT NULL, PRIMARY KEY(slot,key))',
    'CREATE INDEX IF NOT EXISTS nh_v13_success_day ON nh_v13_success(day,slot)',
    'CREATE TABLE IF NOT EXISTS nh_v14_settings (id INTEGER PRIMARY KEY, tags TEXT NOT NULL, author_hours INTEGER NOT NULL DEFAULT 24)',
    'CREATE TABLE IF NOT EXISTS nh_v14_authors (slot TEXT NOT NULL, author TEXT NOT NULL, last_at INTEGER NOT NULL, token TEXT NOT NULL, PRIMARY KEY(slot,author))',
    'CREATE TABLE IF NOT EXISTS nh_v14_stats (slot TEXT NOT NULL, tag TEXT NOT NULL, day TEXT NOT NULL, checks INTEGER NOT NULL DEFAULT 0, sent INTEGER NOT NULL DEFAULT 0, skips INTEGER NOT NULL DEFAULT 0, errors INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(slot,tag,day))',
    "CREATE TABLE IF NOT EXISTS nh_v14_telegram (id INTEGER PRIMARY KEY, chat_id TEXT NOT NULL DEFAULT '', nonce TEXT NOT NULL DEFAULT '', expires INTEGER NOT NULL DEFAULT 0, next_test INTEGER NOT NULL DEFAULT 0, last_sent INTEGER NOT NULL DEFAULT 0, message TEXT NOT NULL DEFAULT '未連携')",
    'INSERT OR IGNORE INTO nh_v14_telegram (id) VALUES (1)',
    "CREATE TABLE IF NOT EXISTS nh_v14_alerts (slot TEXT PRIMARY KEY, fingerprint TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '', pending INTEGER NOT NULL DEFAULT 0, last_sent INTEGER NOT NULL DEFAULT 0, attempt_at INTEGER NOT NULL DEFAULT 0)",
    "INSERT OR IGNORE INTO nh_v14_alerts (slot) VALUES ('1'),('2')",
    "CREATE TABLE IF NOT EXISTS nh_v15_settings (id INTEGER PRIMARY KEY, interval_seconds INTEGER NOT NULL DEFAULT 240, scan_tags INTEGER NOT NULL DEFAULT 2, scan_notes INTEGER NOT NULL DEFAULT 3, empty_minutes INTEGER NOT NULL DEFAULT 15, marker TEXT NOT NULL DEFAULT '')",
    'INSERT OR IGNORE INTO nh_v15_settings (id) VALUES (1)',
    'CREATE TABLE IF NOT EXISTS nh_v15_authors (author TEXT PRIMARY KEY, last_at INTEGER NOT NULL, slot TEXT NOT NULL, token TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS nh_v15_tag_wait (slot TEXT NOT NULL, tag TEXT NOT NULL, until_at INTEGER NOT NULL, PRIMARY KEY(slot,tag))',
    'CREATE TABLE IF NOT EXISTS nh_v15_metrics (slot TEXT NOT NULL, day TEXT NOT NULL, reason TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(slot,day,reason))',
    "CREATE TABLE IF NOT EXISTS nh_v15_runtime (id INTEGER PRIMARY KEY, last_slot TEXT NOT NULL DEFAULT '', last_at INTEGER NOT NULL DEFAULT 0, heartbeat INTEGER NOT NULL DEFAULT 0, alarm_at INTEGER NOT NULL DEFAULT 0)",
    'INSERT OR IGNORE INTO nh_v15_runtime (id) VALUES (1)',
    'CREATE TABLE IF NOT EXISTS nh_v15_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, message TEXT NOT NULL)',
    'CREATE INDEX IF NOT EXISTS nh_v152_author_time ON nh_v14_authors(author,last_at)',
    'CREATE INDEX IF NOT EXISTS nh_v152_stats_day ON nh_v14_stats(day,slot,tag)',
    'CREATE INDEX IF NOT EXISTS nh_v152_metrics_day ON nh_v15_metrics(day,slot,reason)'
  ]) schema.push(db.prepare(query));
  schema.push(sql(original,'INSERT OR IGNORE INTO nh_v14_settings (id,tags,author_hours) VALUES (1,?,168)',JSON.stringify(DEFAULT_TAGS)));
  await db.batch(schema);
  const done = await sql(original,"SELECT name FROM nh_migrations WHERE name IN ('v13-history','v15-authors')").all();
  const names = new Set(done.results.map(row=>row.name));
  const items = [];
  if (!names.has('v13-history')) {
    for (const slot of SLOTS) {
      const env = scoped(original,slot);
      items.push(
        sql(env,"INSERT OR IGNORE INTO nh_shared SELECT key, ?, 'history', created FROM nh_seen WHERE NOT EXISTS (SELECT 1 FROM nh_migrations WHERE name='v13-history')",slot),
        sql(env,"INSERT OR IGNORE INTO nh_shared SELECT inflight, ?, 'history', checked FROM nh_control WHERE inflight<>'' AND NOT EXISTS (SELECT 1 FROM nh_migrations WHERE name='v13-history')",slot)
      );
    }
    items.push(db.prepare("INSERT OR IGNORE INTO nh_migrations VALUES ('v13-history')"));
  }
  if (!names.has('v15-authors')) {
    items.push(db.prepare("INSERT INTO nh_v15_authors (author,last_at,slot,token) SELECT author,MAX(last_at),'history','history' FROM nh_v14_authors WHERE NOT EXISTS (SELECT 1 FROM nh_migrations WHERE name='v15-authors') GROUP BY author ON CONFLICT(author) DO UPDATE SET last_at=MAX(nh_v15_authors.last_at,excluded.last_at)"),
      db.prepare("INSERT OR IGNORE INTO nh_migrations VALUES ('v15-authors')"));
  }
  items.push(sql(original,'INSERT OR IGNORE INTO nh_migrations (name) VALUES (?)',READY));
  await db.batch(items);
}
function orderFor(tags, slot) {
  const offset = slot === '2' ? Math.ceil(tags.length / 2) : 0;
  return tags.slice(offset).concat(tags.slice(0,offset));
}
const REASONS = {
  runs:'自動確認', sent:'送信成功', recovered:'前回送信の成功確認', author_recent:'同じ作者への待機で除外した候補',
  seen:'記事履歴で除外した候補', own_or_liked:'自分たちの記事・スキ済み', missing:'削除済み', no_author:'作者不明',
  no_candidates:'候補なしのタグ', tag_wait:'候補なし待機を省略したタグ', candidate_limit:'探索上限で見送り',
  reserved:'他の処理の予約で見送り', errors:'自動確認エラー', requests:'noteへの通信数'
};
function metricItems(env, counts) {
  return Object.entries(counts).filter(([reason,count])=>REASONS[reason] && count>0).map(([reason,count])=>
    sql(env,'INSERT INTO nh_v15_metrics (slot,day,reason,count) VALUES (?,?,?,?) ON CONFLICT(slot,day,reason) DO UPDATE SET count=count+excluded.count',env.SLOT,day(),reason,count));
}
async function schedulerState(original) {
  const statements = SLOTS.map(slot=>sql(scoped(original,slot),
    'SELECT s.*, c.slot, c.hold_until FROM nh_control s JOIN nh_v13_connection c ON c.slot=? WHERE s.id=1',slot));
  statements.push(sql(original,'SELECT r.*,v.interval_seconds FROM nh_v15_runtime r JOIN nh_v15_settings v ON v.id=r.id WHERE r.id=1'));
  const rows = await original.DB.batch(statements);
  const states = rows.slice(0,2).map(r=>r.results[0]);
  const runtime = rows[2].results[0];
  const active = states.filter(s=>s.enabled);
  const gap = active.length===2 ? runtime.interval_seconds*500 : 0;
  const gate = runtime.last_at ? runtime.last_at+gap : 0;
  for (const s of states) s.eligible = Math.max(s.next_at,s.lease,s.hold_until,gate);
  active.sort((a,b)=>a.eligible-b.eligible || Number(a.slot===runtime.last_slot)-Number(b.slot===runtime.last_slot));
  return {states,active,runtime,gap,gate};
}
async function exportData(env) {
  const settings = await getSettings(env);
  const since = day(29);
  const [first,second,stats,metrics,daily] = await env.DB.batch([
    ...SLOTS.map(slot=>sql(scoped(env,slot),'SELECT enabled,total,checked,next_at FROM nh_control WHERE id=1')),
    sql(env,'SELECT slot,tag,day,checks,sent,skips,errors FROM nh_v14_stats WHERE day>=? ORDER BY day,slot,tag',since),
    sql(env,'SELECT slot,day,reason,count FROM nh_v15_metrics WHERE day>=? ORDER BY day,slot,reason',since),
    sql(env,'SELECT slot,day,COUNT(*) AS confirmed FROM nh_v13_success WHERE day>=? GROUP BY day,slot ORDER BY day,slot',since)
  ]);
  const accounts = [first,second].map((r,i)=>({slot:SLOTS[i],...r.results[0]}));
  return new Response(JSON.stringify({version:VERSION,exported_at:new Date().toISOString(),settings,accounts,tag_stats:stats.results,metrics:metrics.results,daily:daily.results},null,2),{
    headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="note-helper-settings-stats.json"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
  });
}
async function getSettings(env) {
  const row = await sql(env,'SELECT a.tags,a.author_hours,b.interval_seconds,b.scan_tags,b.scan_notes,b.empty_minutes FROM nh_v14_settings a JOIN nh_v15_settings b ON b.id=a.id WHERE a.id=1').first();
  const tags = JSON.parse(row.tags);
  if (!Array.isArray(tags) || !tags.length) throw new Trouble('タグ設定を確認してください','config');
  return {...row,tags};
}
async function saveSettings(env, form) {
  const raw = String(form.get('tags') || '');
  if (raw.length > 3000) throw new Trouble('タグの入力が長すぎます','config');
  const tags = [...new Set(raw.split(/[\s,、・，]+/u).map(t=>t.replace(/^[#＃]+/u,'').trim()).filter(Boolean))];
  const hours = Number(form.get('author_hours'));
  if (!tags.length || tags.length>35 || tags.some(t=>[...t].length>50 || /[\x00-\x1f\x7f<>/#＃]/u.test(t))) throw new Trouble('タグは1〜35個、各50文字以内で入力してください','config');
  if (!Number.isInteger(hours) || hours<1 || hours>MAX_AUTHOR_HOURS) throw new Trouble('作者への間隔は1〜'+MAX_AUTHOR_HOURS+'時間の整数で入力してください','config');
  const current = await getSettings(env);
  const read = (name,min,max,step=1) => {
    const value = form.has(name) ? Number(form.get(name)) : current[name];
    if (!Number.isInteger(value) || value<min || value>max || value%step) throw new Trouble('実行間隔・探索件数・タグ待機時間の範囲を確認してください','config');
    return value;
  };
  const seconds = read('interval_seconds',240,3600,30), tagLimit = read('scan_tags',1,3), noteLimit = read('scan_notes',1,5), empty = read('empty_minutes',0,120);
  const marker = crypto.randomUUID();
  const result = await env.DB.batch([
    sql(env,"UPDATE nh_v15_settings SET interval_seconds=?,scan_tags=?,scan_notes=?,empty_minutes=?,marker=? WHERE id=1 AND NOT EXISTS (SELECT 1 FROM nh_control WHERE id=1 AND lease>?) AND NOT EXISTS (SELECT 1 FROM nh_control_2 WHERE id=1 AND lease>?)",seconds,tagLimit,noteLimit,empty,marker,Date.now(),Date.now()),
    sql(env,'UPDATE nh_v14_settings SET tags=?,author_hours=? WHERE id=1 AND EXISTS (SELECT 1 FROM nh_v15_settings WHERE id=1 AND marker=?)',JSON.stringify(tags),hours,marker),
    sql(env,'INSERT INTO nh_v15_audit (at,message) SELECT ?,? WHERE EXISTS (SELECT 1 FROM nh_v15_settings WHERE id=1 AND marker=?)',Date.now(),tags.length+'タグ／間隔'+seconds+'秒／作者'+hours+'時間／探索'+tagLimit+'タグ・'+noteLimit+'記事／候補なし'+empty+'分',marker)
  ]);
  return result[0].meta.changes ? tags.length+'タグと動作設定を両方に保存しました。2番の巡回順をずらしています。既存の休止期限・次回時刻・履歴は保持します。' : '処理中のため設定を変更しませんでした。少し待って再度保存してください。';
}
function statItems(env, tag, field) {
  if (!tag) return [];
  if (!['checks','sent','skips','errors'].includes(field)) throw new Error('Invalid metric');
  return [sql(env,'INSERT INTO nh_v14_stats (slot,tag,day,'+field+') VALUES (?,?,?,1) ON CONFLICT(slot,tag,day) DO UPDATE SET '+field+'='+field+'+1',env.SLOT,tag,day())];
}
async function telegram(env, method, body) {
  const token = String(env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
    throw new Trouble('Telegram設定エラー：TELEGRAM_BOT_TOKENはBotFatherのトークンだけを保存してください', 'config');
  }
  let response;
  try {
    response = await fetch('https://api.telegram.org/bot'+token+'/'+method, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body), redirect:'manual', signal:AbortSignal.timeout(15000)
    });
  } catch (error) {
    const reason = ['TimeoutError','AbortError'].includes(error?.name)
      ? '15秒以内に応答がありませんでした' : 'CloudflareからTelegramへの通信を開始・完了できませんでした';
    throw new Trouble('Telegram通信エラー：'+reason+'。トークン不正かどうかは未確認です');
  }
  let data;
  try { data = await response.json(); }
  catch {
    throw new Trouble('Telegram応答エラー：HTTP '+response.status+'。JSON形式の応答を取得できませんでした。トークンの正否は未確認です', 'notification', 0, response.status);
  }
  if (!response.ok || data?.ok !== true) {
    const code = Number(data?.error_code) || response.status;
    const seconds = Number(data?.parameters?.retry_after);
    const retry = Number.isFinite(seconds) ? Math.max(0, seconds)*1000 : 0;
    const reason = code === 401 || code === 404
      ? 'Botトークンを確認してください。BotFatherのAPI Tokenをコピーし直してSecretを更新してください'
      : code === 403 ? 'Botがブロックされていないか確認してください'
      : code === 409 ? '同じBotが別の仕組みで使われています。この通知専用のBotを使ってください'
      : code === 429 ? 'Telegramの回数制限です。待ってから再確認してください'
      : 'Telegramが操作を受け付けませんでした。設定を確認してください';
    throw new Trouble('Telegram応答エラー：'+code+'／'+reason, 'notification', retry, code);
  }
  return data.result;
}
async function telegramAction(env, action) {
  if (action === 'tg_off') {
    await env.DB.batch([
      sql(env,"UPDATE nh_v14_telegram SET chat_id='',nonce='',expires=0,message='通知を解除しました' WHERE id=1"),
      sql(env,'UPDATE nh_v14_alerts SET pending=0 WHERE pending<>0')
    ]);
    return 'Telegram通知を解除しました。自動運転は変更していません。';
  }
  if (action === 'tg_pair') {
    const bot = await telegram(env,'getMe',{});
    const nonce = crypto.randomUUID().replaceAll('-','');
    await sql(env,"UPDATE nh_v14_telegram SET nonce=?,expires=?,message='連携コード発行済み（15分以内に確認）' WHERE id=1",nonce,Date.now()+15*60000).run();
    return '① Telegramで次の自分のBotを開いてください。\nhttps://t.me/'+bot.username+'\n\n② そのBotの個人チャットに次の1行を送信してください。\n/start '+nonce+'\n\n③ 15分以内にこの画面の「② Telegramとの連携を確認」を押してください。\nまだ通知先は変更していません。';
  }
  const row = await sql(env,'SELECT * FROM nh_v14_telegram WHERE id=1').first();
  if (action === 'tg_connect') {
    if (!row.nonce || row.expires<Date.now()) return '連携コードを発行し直してください。';
    const updates = await telegram(env,'getUpdates',{timeout:0,limit:100,allowed_updates:['message']});
    const match = updates.find(u=>{
      const m=u.message;
      return m?.chat?.type==='private' && !m.from?.is_bot && String(m.chat.id)===String(m.from?.id) &&
        m.text?.trim()==='/start '+row.nonce && m.date*1000>=row.expires-15*60000;
    });
    if (!match) return '連携コードのメッセージが見つかりません。自分のBotの個人チャットに表示された /start の行を送信してから、再確認してください。';
    const result = await sql(env,"UPDATE nh_v14_telegram SET chat_id=?,nonce='',expires=0,message='連携済み。通知テストを押してください' WHERE id=1 AND nonce=? AND expires>=?",String(match.message.chat.id),row.nonce,Date.now()).run();
    return result.meta.changes ? 'Telegramと連携しました。「通知をテスト」を押してください。' : 'コードが期限切れか更新済みです。連携コードを発行し直してください。';
  }
  if (action === 'tg_test') {
    if (!row.chat_id) return '先にTelegramとの連携を完了してください。';
    const gate = await sql(env,'UPDATE nh_v14_telegram SET next_test=? WHERE id=1 AND next_test<=?',Date.now()+LEASE,Date.now()).run();
    if (!gate.meta.changes) return '通知テストは5分に1回までです。';
    try {
      await telegram(env,'sendMessage',{chat_id:row.chat_id,text:'note-helper '+VERSION+'：通知テスト成功。ログイン情報などの対応が必要な場合、このチャットへ通知します。'});
      await sql(env,"UPDATE nh_v14_telegram SET last_sent=?,message='通知テスト成功' WHERE id=1",Date.now()).run();
      return 'Telegramにテスト通知を送りました。';
    } catch (error) {
      if (readLimit(error)) throw error;
      await sql(env,"UPDATE nh_v14_telegram SET message='通知テスト失敗。トークン・連携・ブロック状態を確認',next_test=MAX(next_test,?) WHERE id=1",Date.now()+(error.retry||0)).run();
      throw error;
    }
  }
  return '操作を選んでください。';
}
async function queueAlert(env, kind, message) {
  const fingerprint = kind+':'+message;
  await sql(env,`UPDATE nh_v14_alerts SET
    pending=CASE WHEN fingerprint<>? OR last_sent<=? THEN 1 ELSE pending END,
    attempt_at=CASE WHEN fingerprint<>? THEN 0 ELSE attempt_at END,
    fingerprint=?,message=? WHERE slot=?`,fingerprint,Date.now()-24*HOUR,fingerprint,fingerprint,message,env.SLOT).run();
}
async function flushAlerts(env) {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  const pending = await sql(env,`SELECT a.*,t.chat_id FROM nh_v14_alerts a
    JOIN nh_v14_telegram t ON t.id=1 WHERE a.pending=1 AND t.chat_id<>''`).all();
  for (const row of pending.results) {
    const slot = row.slot;
    if (!SLOTS.includes(slot)) continue;
    const selected = scoped(env,slot);
    const gate = await sql(selected,`UPDATE nh_v14_alerts SET attempt_at=?
      WHERE slot=? AND pending=1 AND attempt_at<=? AND fingerprint=?
      AND EXISTS (SELECT 1 FROM nh_control s JOIN nh_health h ON h.id=s.id
                  WHERE s.id=1 AND s.enabled=1 AND h.kind IN ('auth','config'))
      AND EXISTS (SELECT 1 FROM nh_v14_telegram WHERE id=1 AND chat_id=?)`,
      Date.now()+15*60000,slot,Date.now(),row.fingerprint,row.chat_id).run();
    if (!gate.meta.changes) {
      await sql(selected,`UPDATE nh_v14_alerts SET pending=0 WHERE slot=? AND pending=1 AND fingerprint=?
        AND NOT EXISTS (SELECT 1 FROM nh_control s JOIN nh_health h ON h.id=s.id
                        WHERE s.id=1 AND s.enabled=1 AND h.kind IN ('auth','config'))`,slot,row.fingerprint).run();
      continue;
    }
    try {
      await telegram(env,'sendMessage',{chat_id:row.chat_id,text:'note-helper：アカウント '+slot+' の確認が必要です。\n'+row.message+'\n管理画面で状態を確認してください。\n401はCookie更新、403はアクセス拒否の確認が必要です。'});
    } catch (error) {
      await env.DB.batch([
        sql(env,'UPDATE nh_v14_alerts SET attempt_at=? WHERE slot=? AND fingerprint=?',Date.now()+Math.max(15*60000,error.retry||0),slot,row.fingerprint),
        sql(env,"UPDATE nh_v14_telegram SET message='通知失敗。設定を確認してください。後で自動再試行します' WHERE id=1")
      ]);
      continue;
    }
    await env.DB.batch([
      sql(env,'UPDATE nh_v14_alerts SET pending=0,last_sent=? WHERE slot=? AND fingerprint=?',Date.now(),slot,row.fingerprint),
      sql(env,"UPDATE nh_v14_telegram SET last_sent=?,message='エラー通知を送信しました' WHERE id=1",Date.now())
    ]);
  }
}
class Trouble extends Error {
  constructor(message, kind = 'network', retry = 0, code = 0) {
    super(message); this.kind = kind; this.retry = retry; this.code = code;
  }
}
async function encryptionKey(env) {
  const hex = (env.COOKIE_ENCRYPTION_KEY || '').trim();
  if (!/^[a-f0-9]{64}$/i.test(hex)) throw new Trouble('COOKIE_ENCRYPTION_KEYの設定を確認してください', 'config');
  return crypto.subtle.importKey('raw', Uint8Array.from(hex.match(/../g), x => parseInt(x,16)), 'AES-GCM', false, ['encrypt','decrypt']);
}
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const aad = (slot, id) => new TextEncoder().encode('note-helper:v13:' + slot + ':' + id);
async function encryptCookie(env, slot, id, value) {
  const key = await encryptionKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({name:'AES-GCM', iv, additionalData:aad(slot,id)}, key, new TextEncoder().encode(value));
  return {iv:b64(iv), ciphertext:b64(encrypted)};
}
async function loadCookie(env, id) {
  const row = await sql(env, 'SELECT * FROM nh_v13_credentials WHERE slot=?', env.SLOT).first();
  if (!row) return env;
  try {
    const key = await encryptionKey(env);
    const data = await crypto.subtle.decrypt({name:'AES-GCM', iv:unb64(row.iv), additionalData:aad(env.SLOT,id)}, key, unb64(row.ciphertext));
    return {...env, NOTE_SESSION:new TextDecoder().decode(data)};
  } catch {
    throw new Trouble('保存済みCookieを復号できません。暗号化キーの変更・削除を確認してください', 'config');
  }
}
function cleanCookie(value) {
  const cookie = String(value || '').trim();
  if (!cookie || cookie.length > 16000 || /[\s;\x00-\x1f\x7f]/.test(cookie) || cookie.startsWith('_note_session_v5=')) {
    throw new Trouble('CookieのValueだけを貼ってください。名前・空白・改行は含めません', 'config');
  }
  return cookie;
}
async function api(env, path, post = false, referer = 'https://note.com/') {
  if (!env.NOTE_SESSION?.trim()) throw new Trouble('ログイン情報が未設定です', 'auth');
  const headers = {'Accept':'application/json','X-Requested-With':'XMLHttpRequest','Cookie':'_note_session_v5=' + env.NOTE_SESSION.trim()};
  if (post) Object.assign(headers, {'Content-Type':'application/json','Origin':'https://note.com','Referer':referer});
  let response;
  try {
    if (env.TRACE) env.TRACE.calls++;
    response = await fetch('https://note.com' + path, {method:post ? 'POST' : 'GET', headers, ...(post ? {body:'{}'} : {}), redirect:'manual', signal:AbortSignal.timeout(15000)});
  } catch { throw new Trouble('通信エラー・タイムアウト'); }
  if (!response.ok) {
    const code = response.status, raw = (response.headers.get('Retry-After') || '').trim();
    const parsed = /^\d+$/.test(raw) ? Number(raw) * 1000 : Date.parse(raw) - Date.now();
    const retry = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    await response.body?.cancel().catch(() => {});
    const kind = code === 429 ? 'rate' : [401,403].includes(code) ? 'auth' : code >= 500 ? 'network' : 'response';
    const reason = code === 401 ? 'ログイン情報の更新が必要' : code === 403 ? 'アクセス拒否。ログイン情報や利用制限を確認' : code === 429 ? '回数制限' : code === 422 ? '送信内容などが受け付けられません' : '応答エラー';
    throw new Trouble('note応答 ' + code + '：' + reason, kind, retry, code);
  }
  if (post) { await response.body?.cancel().catch(() => {}); return; }
  try {
    const json = await response.json(), data = json?.data ?? json;
    if (!data || typeof data !== 'object') throw new Error();
    return data;
  } catch { throw new Trouble('応答形式を確認できません', 'response'); }
}
async function account(env) {
  const data = await api(env, '/api/v2/current_user'), user = data.user ?? data;
  if (!user?.id || !user?.urlname) throw new Trouble('ログイン情報の更新が必要です', 'auth');
  return String(user.id);
}
async function article(env, key) {
  try { return await api(env, '/api/v3/notes/' + key); }
  catch (error) { if (error.code === 404 && !error.retry) return null; throw error; }
}
async function acquire(env, automatic) {
  const now = Date.now(), token = crypto.randomUUID();
  const result = await sql(env,
    'UPDATE nh_control SET token=?, lease=?' + (automatic ? ', checked=?, next_at=?' : '') +
    ' WHERE id=1 AND lease<=?' + (automatic ? ' AND enabled=1 AND next_at<=?' : '') +
    ' AND NOT EXISTS (SELECT 1 FROM nh_v13_connection WHERE slot=? AND hold_until>?)',
    token, now + LEASE, ...(automatic ? [now,now + 2*HOUR] : []), now, ...(automatic ? [now] : []), env.SLOT, now
  ).run();
  return result.meta.changes ? token : null;
}
async function release(env, token) {
  await sql(env, "UPDATE nh_control SET token='', lease=0 WHERE id=1 AND token=?", token).run();
}
async function connection(original, slot, candidate = null) {
  let env = scoped(original, slot);
  if (candidate !== null) { candidate = cleanCookie(candidate); await encryptionKey(original); }
  const token = await acquire(env, false);
  if (!token) return '処理中、またはnoteが指定した待機中です。状態欄を確認してください。';
  try {
    const state = await sql(env, 'SELECT * FROM nh_control WHERE id=1').first();
    const health = await sql(env, 'SELECT * FROM nh_health WHERE id=1').first();
    if (health.kind === 'rate' && state.next_at > Date.now()) return '回数制限のため ' + time(state.next_at) + ' 以降に接続確認してください。';
    if (!state.account) return 'この枠は未登録です。既存のNOTE_SESSION設定で開始し、登録してから利用してください。';
    const gate = await sql(env, 'UPDATE nh_v13_connection SET next_check=? WHERE slot=? AND next_check<=?', Date.now()+LEASE, slot, Date.now()).run();
    if (!gate.meta.changes) {
      const row = await sql(env, 'SELECT next_check FROM nh_v13_connection WHERE slot=?', slot).first();
      return '次の接続確認・Cookie保存は ' + time(row.next_check) + ' 以降にできます。';
    }
    try {
      env = candidate !== null ? {...env, NOTE_SESSION:candidate} : await loadCookie(env, state.account);
      const id = await account(env);
      if (id !== state.account) throw new Trouble('別のnoteです。選んだ枠に登録済みのnoteのCookieを使ってください', 'mismatch');
      const other = await sql(scoped(original, slot === '1' ? '2' : '1'), 'SELECT account FROM nh_control WHERE id=1').first();
      if (other.account === id) throw new Trouble('もう一方と同じnoteが登録されています。設定の確認が必要です', 'mismatch');
      const message = candidate !== null ? '本人確認OK。新しいCookieを暗号化して保存しました。' : '接続確認OK。登録済みのnoteと一致しました。';
      const items = [];
      if (candidate !== null) {
        const encrypted = await encryptCookie(original, slot, id, candidate);
        items.push(sql(original, 'INSERT INTO nh_v13_credentials (slot,iv,ciphertext,updated) VALUES (?,?,?,?) ON CONFLICT(slot) DO UPDATE SET iv=excluded.iv,ciphertext=excluded.ciphertext,updated=excluded.updated', slot, encrypted.iv, encrypted.ciphertext, Date.now()));
      }
      items.push(sql(original, 'UPDATE nh_v13_connection SET checked=?, ok=1, message=? WHERE slot=?', Date.now(), message, slot));
      items.push(sql(original, 'UPDATE nh_v14_alerts SET pending=0 WHERE slot=? AND pending<>0', slot));
      await original.DB.batch(items);
      return 'アカウント ' + slot + '：' + message + '\nいいねは送信していません。自動運転の休止期限は維持します。';
    } catch (error) {
      if (!(error instanceof Trouble)) throw error;
      const message = error.message;
      const wait = Math.max(error.retry, error.code === 429 ? 2*HOUR : 0);
      await sql(original, 'UPDATE nh_v13_connection SET checked=?, ok=0, message=?, hold_until=MAX(hold_until,?), next_check=MAX(next_check,?) WHERE slot=?', Date.now(), (candidate !== null ? '更新用Cookieの確認：' : '') + message, Date.now()+wait, Date.now()+Math.max(LEASE,wait), slot).run();
      return 'アカウント ' + slot + '：' + message + '\n本人確認に失敗したCookieは保存しません。いいねは送信していません。';
    }
  } finally { await release(env, token); }
}
async function run(original,slot) {
  const baseEnv = scoped(original,slot);
  const token = await acquire(baseEnv,true);
  if (!token) return false;
  const trace = {calls:0}, counts = {runs:1};
  let env = {...baseEnv,TRACE:trace}, stage = 'ログイン確認', activeTag = null, settings;
  let checkingSend = false;
  const bump = (reason,n=1) => { counts[reason]=(counts[reason]||0)+n; };
  const metrics = () => metricItems(env,{...counts,requests:trace.calls});
  const finish = async (message,success=false) => {
    await env.DB.batch([
      ...metrics(),
      ...statItems(env,activeTag,success ? 'sent' : 'skips'),
      sql(env,'UPDATE nh_control SET message=?,next_at=? WHERE id=1 AND token=?',message,Date.now()+(settings?.interval_seconds*1000 || INTERVAL),token),
      sql(env,"UPDATE nh_health SET errors=CASE WHEN ? THEN 0 ELSE errors END,kind='',rate_fail=CASE WHEN ? THEN 0 ELSE rate_fail END,success_at=CASE WHEN ? THEN ? ELSE success_at END WHERE id=1",+success,+success,+success,Date.now())
    ]);
  };
  try {
    settings = await getSettings(env);
    const state = await sql(env,'SELECT * FROM nh_control WHERE id=1').first();
    checkingSend = Boolean(state.inflight);
    env = await loadCookie(env,state.account);
    if (await account(env)!==state.account) throw new Trouble('登録済みのnoteとログイン情報が一致しません','auth');
    await sql(env,'UPDATE nh_v14_alerts SET pending=0 WHERE slot=? AND pending<>0',slot).run();
    if (state.inflight) {
      stage='前回送信の確認';
      const data=await article(env,state.inflight), liked=data?.is_liked===true;
      const before=await sql(env,'SELECT status FROM nh_seen WHERE key=?',state.inflight).first();
      const add=liked && before?.status!=='liked';
      const items=[
        sql(env,'INSERT INTO nh_seen VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET status=excluded.status',state.inflight,liked?'liked':'uncertain',Date.now()),
        sql(env,"UPDATE nh_control SET inflight='',total=total+? WHERE id=1 AND token=?",+add,token)
      ];
      if (add) { items.push(sql(env,'INSERT OR IGNORE INTO nh_v13_success VALUES (?,?,?,?)',slot,state.inflight,day(),Date.now())); bump('recovered'); }
      await env.DB.batch(items);
      await finish(liked?'前回の記事のスキを確認しました。次回から候補を確認します':'前回の記事は再送せず除外しました');
      return true;
    }
    const tags=orderFor(settings.tags,slot), started=Date.now();
    const marks = values=>values.map(()=>'?').join(',');
    const [otherRows,waitRows]=await original.DB.batch([
      sql(scoped(original,slot==='1'?'2':'1'),'SELECT account FROM nh_control WHERE id=1'),
      sql(env,'SELECT tag,until_at FROM nh_v15_tag_wait WHERE slot=? AND tag IN ('+marks(tags)+') AND until_at>?',slot,...tags,Date.now())
    ]);
    const ownIds=new Set([state.account,otherRows.results[0].account].filter(Boolean));
    const waits=new Map(waitRows.results.map(row=>[row.tag,row.until_at]));
    let cursor=state.cursor, savedCursor=cursor, lists=0, details=0, limited=false;
    for (let visited=0; visited<tags.length && lists<settings.scan_tags; visited++) {
      if (details>=settings.scan_notes || Date.now()-started>=90000) { limited=true; break; }
      const tag=tags[cursor%tags.length]; cursor++;
      if (waits.get(tag)>Date.now()) { bump('tag_wait'); continue; }
      const live=await sql(env,'UPDATE nh_control SET cursor=? WHERE id=1 AND token=? AND enabled=1 AND lease>?',cursor,token,Date.now()).run();
      if (!live.meta.changes) { await finish('停止または処理期限により探索を終了しました'); return true; }
      savedCursor=cursor;
      stage='記事一覧の取得'; activeTag=tag; lists++;
      await env.DB.batch(statItems(env,tag,'checks'));
      const data=await api(env,'/api/v3/hashtags/'+encodeURIComponent(tag)+'/notes?order=new&page=1');
      if (!Array.isArray(data.notes)) throw new Trouble('記事一覧の形式を確認できません','response');
      const notes=new Map(data.notes.filter(n=>typeof n?.key==='string' && /^n[a-z0-9]+$/.test(n.key)).map(n=>[n.key,n]));
      const keys=[...notes.keys()].slice(0,50);
      let candidates=[];
      const authorOf=n=>String(n?.user?.id ?? n?.user_id ?? '');
      const recent=new Map();
      if (keys.length) {
        const seen=await sql(env,'SELECT key FROM nh_seen WHERE key IN ('+marks(keys)+') UNION ALL SELECT key FROM nh_shared WHERE key IN ('+marks(keys)+')',...keys,...keys).all();
        const done=new Set(seen.results.map(r=>r.key));
        candidates=keys.filter(k=>!done.has(k)); bump('seen',keys.length-candidates.length);
        const ids=[...new Set(candidates.map(k=>authorOf(notes.get(k))).filter(Boolean))];
        if (ids.length) {
          const rows=await sql(env,'SELECT author,last_at FROM nh_v15_authors WHERE author IN ('+marks(ids)+')',...ids).all();
          for (const row of rows.results) recent.set(row.author,row.last_at);
        }
      }
      for (const key of candidates) {
        const listedAuthor=authorOf(notes.get(key));
        if (listedAuthor && ownIds.has(listedAuthor)) { bump('own_or_liked'); continue; }
        if (listedAuthor && (recent.get(listedAuthor)||0)>Date.now()-settings.author_hours*HOUR) { bump('author_recent'); continue; }
        if (details>=settings.scan_notes || Date.now()-started>=90000) { limited=true; break; }
        stage='記事確認'; details++;
        const note=await article(env,key);
        const author=authorOf(note);
        if (!note || note.is_liked===true || ownIds.has(author)) {
          await sql(env,"INSERT OR IGNORE INTO nh_seen VALUES (?,'skip',?)",key,Date.now()).run();
          bump(!note?'missing':'own_or_liked'); continue;
        }
        if (!author || author==='0') { bump('no_author'); continue; }
        if (!listedAuthor || author!==listedAuthor) {
          const last=await sql(env,'SELECT last_at FROM nh_v15_authors WHERE author=?',author).first();
          if (last && last.last_at>Date.now()-settings.author_hours*HOUR) {
            recent.set(author,last.last_at); bump('author_recent'); continue;
          }
        }
        const referer=note.note_url || (note.user?.urlname?'https://note.com/'+note.user.urlname+'/n/'+key:'');
        let valid=false;
        try { const u=new URL(referer); valid=u.origin==='https://note.com' && u.pathname.endsWith('/n/'+key); } catch {}
        if (!valid) throw new Trouble('記事URLを確認できません','response');
        stage='共通予約の保存';
        const now=Date.now(), cutoff=now-settings.author_hours*HOUR;
        // 最後の判定を予約と同じトランザクションで行う。一覧の先読みだけで送信を決めない。
        const reserved=await env.DB.batch([
          sql(env,`INSERT INTO nh_v15_authors (author,last_at,slot,token) SELECT ?,?,?,?
            WHERE EXISTS (SELECT 1 FROM nh_control WHERE id=1 AND token=? AND enabled=1 AND lease>?)
            AND NOT EXISTS (SELECT 1 FROM nh_shared WHERE key=?)
            AND NOT EXISTS (SELECT 1 FROM nh_v14_authors WHERE author=? AND last_at>?)
            ON CONFLICT(author) DO UPDATE SET last_at=excluded.last_at,slot=excluded.slot,token=excluded.token
            WHERE nh_v15_authors.last_at<=?`,author,now,slot,token,token,now,key,author,cutoff,cutoff),
          sql(env,'INSERT OR IGNORE INTO nh_shared (key,slot,token,created) SELECT ?,?,?,? FROM nh_control WHERE id=1 AND token=? AND enabled=1 AND lease>? AND EXISTS (SELECT 1 FROM nh_v15_authors WHERE author=? AND token=?)',key,slot,token,now,token,now,author,token),
          sql(env,"INSERT OR IGNORE INTO nh_seen (key,status,created) SELECT ?,'pending',? WHERE EXISTS (SELECT 1 FROM nh_shared WHERE key=? AND token=?)",key,now,key,token),
          sql(env,'UPDATE nh_control SET inflight=?,lease=? WHERE id=1 AND token=? AND enabled=1 AND lease>? AND EXISTS (SELECT 1 FROM nh_shared WHERE key=? AND token=?)',key,now+LEASE,token,now,key,token),
          sql(env,'INSERT INTO nh_v14_authors (slot,author,last_at,token) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM nh_shared WHERE key=? AND token=?) ON CONFLICT(slot,author) DO UPDATE SET last_at=excluded.last_at,token=excluded.token',slot,author,now,token,key,token)
        ]);
        if (!reserved[0].meta.changes || !reserved[1].meta.changes || !reserved[3].meta.changes) { bump('reserved'); continue; }
        checkingSend=true;
        stage='スキ送信';
        await api(env,'/api/v3/notes/'+key+'/likes',true,referer);
        stage='送信後の確認';
        if ((await article(env,key))?.is_liked!==true) throw new Trouble('送信結果は未確認。再送せず次回に確認します');
        await env.DB.batch([
          sql(env,"UPDATE nh_seen SET status='liked' WHERE key=?",key),
          sql(env,"UPDATE nh_control SET inflight='',total=total+1 WHERE id=1 AND token=?",token),
          sql(env,'INSERT OR IGNORE INTO nh_v13_success VALUES (?,?,?,?)',slot,key,day(),Date.now())
        ]);
        bump('sent');
        await finish('スキ確認済み：'+key+'（#'+tag+'）／探索 '+lists+'タグ・'+details+'記事',true);
        return true;
      }
      if (limited) break;
      bump('no_candidates');
      await env.DB.batch([
        ...statItems(env,tag,'skips'),
        sql(env,'INSERT INTO nh_v15_tag_wait (slot,tag,until_at) VALUES (?,?,?) ON CONFLICT(slot,tag) DO UPDATE SET until_at=excluded.until_at',slot,tag,Date.now()+settings.empty_minutes*60000)
      ]);
      activeTag=null;
    }
    if (cursor!==savedCursor) await sql(env,'UPDATE nh_control SET cursor=? WHERE id=1 AND token=?',cursor,token).run();
    if (limited || lists>=settings.scan_tags) bump('candidate_limit');
    await finish('送信見送り：探索 '+lists+'タグ・'+details+'記事。'+(limited?'探索上限に達しました。':'候補なし・作者待機・タグ待機。')+'次回は巡回の続きから確認します。');
    return true;
  } catch (error) {
    if (readLimit(error)) throw error;
    // 送信前のGET失敗は次の通常枠に回す。予約済みの送信や本人確認の拒否は従来の待機に従う。
    const retryRead = !checkingSend && error instanceof Trouble &&
      (error.kind==='network' || (error.kind==='response' && [0,404,408,410].includes(error.code)));
    const kind = retryRead ? 'read' : (error instanceof Trouble ? error.kind : 'storage');
    const h=await sql(env,'SELECT * FROM nh_health WHERE id=1').first();
    const errors=Number(h.errors)+1, rates=Number(h.rate_fail)+(kind==='rate'?1:0);
    const serverWait=error instanceof Trouble?error.retry:0;
    const wait=Math.max(retryRead ? settings.interval_seconds*1000 : 2*HOUR,serverWait);
    const message=(retryRead ? '今回の巡回を見送りました。次回に自動再試行：' : '自動再確認待ち：')+stage+'／'+failure(error);
    bump('errors');
    await env.DB.batch([
      ...metrics(), ...statItems(env,activeTag,'errors'),
      sql(env,'UPDATE nh_health SET rate_fail=?,errors=?,kind=? WHERE id=1',rates,errors,kind),
      sql(env,'UPDATE nh_control SET next_at=?,message=? WHERE id=1 AND token=?',Date.now()+wait,message,token),
      sql(env,'UPDATE nh_v13_connection SET hold_until=MAX(hold_until,?) WHERE slot=?',Date.now()+serverWait,slot)
    ]);
    if (['auth','config'].includes(kind)) await queueAlert(env,kind,message);
    return true;
  } finally { await release(env,token); }
}
async function dashboard(original, settings, prefix = '') {
  const blocks = [];
  const schedule = await schedulerState(original);
  const summary = await original.DB.batch([
    sql(original,"SELECT (chat_id<>'') AS paired,message,last_sent FROM nh_v14_telegram WHERE id=1"),
    sql(original,'SELECT tag,SUM(checks) AS checks,SUM(sent) AS sent,SUM(skips) AS skips,SUM(errors) AS errors FROM nh_v14_stats WHERE day>=? GROUP BY tag ORDER BY checks DESC',day(6)),
    sql(original,'SELECT slot,reason,SUM(count) AS count FROM nh_v15_metrics WHERE day>=? GROUP BY slot,reason ORDER BY slot,reason',day(6)),
    sql(original,'SELECT at,message FROM nh_v15_audit ORDER BY id DESC LIMIT 10'),
    ...SLOTS.map(slot=>sql(scoped(original,slot),`SELECT h.*,c.checked AS connection_checked,c.ok,c.message AS connection_message,
      k.updated AS cookie_updated,(SELECT COUNT(*) FROM nh_v13_success WHERE day=? AND slot=?) AS today
      FROM nh_health h JOIN nh_v13_connection c ON c.slot=?
      LEFT JOIN nh_v13_credentials k ON k.slot=c.slot WHERE h.id=1`,day(),slot,slot))
  ]);
  const [tg,stats,metrics,audit] = summary;
  const telegram=tg.results[0];
  const warnings=[];
  if (!original.SCHEDULER) warnings.push('SCHEDULERが未設定です。実行予約を作成できません。');
  if (!original.COOKIE_ENCRYPTION_KEY || !/^[a-f0-9]{64}$/i.test(original.COOKIE_ENCRYPTION_KEY.trim())) warnings.push('Cookie暗号化キーの形式を確認してください。');
  if (schedule.active.length && schedule.runtime.heartbeat && Date.now()-schedule.runtime.heartbeat>10*60000) warnings.push('予約処理の記録が10分以上更新されていません。Cloudflareのデプロイ・設定・ログを確認してください。');
  if (!schedule.runtime.heartbeat) warnings.push('v15の予約処理はまだ記録されていません。状態確認後、数分たってから再確認してください。');
  blocks.push('【動作設定】\nタグ：'+settings.tags.length+'個\n各アカウント：'+settings.interval_seconds+'秒以上の間隔\n同じ作者：2垢共通で'+settings.author_hours+'時間\n2垢ON時の処理開始間隔：'+settings.interval_seconds/2+'秒以上\n探索上限：'+settings.scan_tags+'タグ・記事詳細'+settings.scan_notes+'件\n候補なしのタグ：'+settings.empty_minutes+'分待ち\n予約処理の最終確認：'+time(schedule.runtime.heartbeat)+'\n次の予約予定：'+time(schedule.runtime.alarm_at)+(warnings.length?'\n\n【確認事項】\n'+warnings.join('\n'):''));
  blocks.push('Telegram通知：' + (original.TELEGRAM_BOT_TOKEN && telegram.paired ? '連携済み' : '未設定') + '\n' + telegram.message + '\n最終通知成功：' + time(telegram.last_sent)+'\n通知対象はログイン・アクセス拒否・暗号化設定の問題。429の回数制限は通知せず休止します。');
  for (const [i,s] of schedule.states.entries()) {
    const h = summary[4+i].results[0], slot=s.slot, now=Date.now(), next=s.eligible;
    const verified = h.ok === 1 && h.connection_checked >= s.checked;
    let status;
    if (!s.enabled) status = '停止中（開始操作が必要）';
    else if (s.lease > now) status = 'ON・処理中';
    else if (h.kind === 'auth' && !verified) status = s.message.includes('401') ? 'ON・ログイン情報の更新が必要' : 'ON・ログイン情報やアクセス拒否の確認が必要';
    else if (h.kind === 'config') status = 'ON・暗号化キーなどの設定確認が必要';
    else if (h.kind === 'auth' && verified) status = 'ON・接続修復を確認済み／自動実行待ち';
    else if (h.kind === 'read' && next > now) status = 'ON・読み取りエラー後の次回巡回待ち';
    else if (next > now) status = h.kind === 'rate' ? 'ON・回数制限で休止中' : h.kind ? 'ON・エラー後の休止中' : 'ON・次の実行待ち';
    else status = 'ON・実行予約待ち';
    blocks.push('アカウント ' + slot + '\n状態：' + status +
      '\n今日のスキ確認成功：' + h.today + '件（日本時間）' +
      '\n累計：' + s.total + '件\n最終自動実行：' + time(s.checked) + '\n最終送信成功：' + time(h.success_at) +
      (s.enabled ? '\n次回：' + (next > now ? time(next)+'以降の実行予約' : '次の実行予約') : '') +
      '\n失敗回数：' + h.errors + '\n429回数：' + h.rate_fail +
      '\n\n【手動の接続確認・Cookie更新】\n確認日時：' + time(h.connection_checked) + '\n' + h.connection_message +
      '\n※この確認日時時点の結果です。\nCookie保存先：' + (h.cookie_updated!=null ? '暗号化保存済み（管理画面の設定を優先）' : 'CloudflareのSecret') +
      (h.cookie_updated!=null ? '\nCookie更新日時：' + time(h.cookie_updated) : '') +
      '\n\n前回の自動実行記録：' + s.message + '\n巡回順：' + orderFor(settings.tags,slot).join(' → '));
  }
  blocks.push('【タグ別実績・直近7日／2アカウント合算】\n' + (stats.results.length ? stats.results.map(r=>'#'+r.tag+'：巡回 '+r.checks+'／送信成功 '+r.sent+'／見送り '+r.skips+'／エラー '+r.errors).join('\n') : 'v14導入後から記録します。') + '\n見送りには候補なし・スキ済み・作者の間隔待ちなどを含みます。結果未確認の送信を後から確認した分はタグ別成功数には含めません。');
  blocks.push('【見送り理由・直近7日／v15導入後】\n'+(metrics.results.length?metrics.results.map(r=>'アカウント'+r.slot+' '+(REASONS[r.reason]||r.reason)+'：'+r.count).join('\n'):'まだ記録はありません。')+'\n候補の除外件数は人数ではありません。プロフィールのクリック数・相手が読んだかどうかは取得できません。');
  if (audit.results.length) blocks.push('【設定変更履歴】\n'+audit.results.map(r=>time(r.at)+' '+r.message).join('\n'));
  return [prefix,...blocks,'今日の件数はv13導入後に成功を確認した分です。過去の送信結果を後から確認した分も、確認した日に計上します。以前の累計は保持します。予約の遅れやCloudflare全体の停止は、このツールから通知できない場合があります。'].filter(Boolean).join('\n\n──────────\n\n');
}
export default {
  async fetch(request, original) {
    const url = new URL(request.url);
    if (url.pathname === '/520') return deskRoute(request,original);
    if (url.pathname === '/' && request.method === 'GET') return page(undefined,url.searchParams.get('account') === '2' ? '2' : '1');
    if (url.pathname !== '/control' || request.method !== 'POST') return reply('Not found',false,404);
    if (request.headers.get('Origin') !== url.origin) return reply('操作画面を開き直してください。',false,403);
    if (!original.ADMIN_KEY) return page('CloudflareのADMIN_KEYが設定されていません。','1',null,503);
    let slot = '1', action = '', message = '';
    try {
      const body = await request.text();
      if (body.length > 100000) return reply('入力が長すぎます。',false,413);
      const form = new URLSearchParams(body);
      if (form.get('key') !== original.ADMIN_KEY) return reply('管理用の鍵が違います。',false,403);
      slot = form.get('account') || '1';
      action = form.get('action');
      if (!SLOTS.includes(slot) || !['status','start','stop','check','save','settings','export','tg_pair','tg_connect','tg_test','tg_off'].includes(action)) return reply('操作を選んでください。',false,400);
      if (!original.DB) return page('CloudflareのD1バインディング DB を確認してください。',slot,null,503);
      await prepare(original);
      if (action === 'export') return await exportData(original);
      const env = scoped(original,slot);
      if (action === 'settings') message = await saveSettings(original,form);
      else if (action.startsWith('tg_')) message = await telegramAction(original,action);
      else if (action === 'check' || action === 'save') message = await connection(original,slot,action === 'save' ? form.get('cookie') || '' : null);
      else if (action === 'stop') {
        await sql(env,'UPDATE nh_control SET enabled=0 WHERE id=1').run();
        message = 'アカウント ' + slot + ' を停止しました。';
      } else if (action === 'start') {
        const token = await acquire(env,false);
        if (!token) message = '処理中、またはnoteが指定した待機中です。';
        else try {
          const s = await sql(env,'SELECT * FROM nh_control WHERE id=1').first();
          const id = s.account || await account(env);
          const other = await sql(scoped(original,slot === '1' ? '2' : '1'),'SELECT account FROM nh_control WHERE id=1').first();
          if (other.account === id) message = 'もう一方と同じnoteです。ログイン情報を確認してください。';
          else {
            const saved=await sql(env,'UPDATE nh_control SET enabled=1, account=? WHERE id=1 AND token=?',id,token).run();
            message = saved.meta.changes ? 'アカウント ' + slot + ' をONにしました。休止期限は保持します。' : '処理期限のため開始を確認できませんでした。';
          }
        } finally { await release(env,token); }
      }
      try { await wakeScheduler(original); }
      catch { message += '\n実行予約の確認に失敗しました。CloudflareのSCHEDULER設定とログを確認してください。'; }
      const settings=await getSettings(original);
      return page(await dashboard(original,settings,message),slot,settings);
    } catch (error) {
      if (error instanceof Trouble) {
        try {
          const settings = await getSettings(original);
          return page(await dashboard(original,settings,error.message),slot,settings,400);
        } catch (displayError) {
          return page(error.message+'\n\n'+failure(displayError),slot,null,503);
        }
      }
      if (action === 'stop' && !message) message = '停止の保存を確認できません。状態欄に「停止中」と出るまで、停止済みとは判断できません。';
      return page([message,failure(error)].filter(Boolean).join('\n\n'),slot,null,503);
    }
  },
  async scheduled(event, original, ctx) {
    // Cronは予約の復旧専用。
    ctx.waitUntil(wakeScheduler(original));
    ctx.waitUntil(deskTick(original));
  }
};
async function wakeScheduler(env) {
  if (!env.SCHEDULER) throw new Error('Scheduler binding missing');
  const id = env.SCHEDULER.idFromName('note-helper-210-seconds');
  const response = await env.SCHEDULER.get(id).fetch('https://scheduler.internal/wake');
  if (!response.ok) throw new Error('Scheduler unavailable');
}
export class NoteScheduler {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; this.busy = false; }
  async fetch(request) {
    if (request) {
      const path = new URL(typeof request === 'string' ? request : request.url).pathname;
      if (path === '/desk/tick' || path === '/desk/admin') {
        this.desk ||= new Desk520(this.ctx.storage,this.env);
        if (path === '/desk/admin') return this.desk.admin(request,this.ctx);
        if (!this.deskTicking) {
          this.deskTicking = this.desk.tick().finally(() => { this.deskTicking = null; });
        }
        await this.deskTicking;
        return new Response('OK');
      }
    }
    if (!this.busy) {
      const at = await this.ctx.storage.getAlarm();
      if (at === null || at < Date.now() - 300000) {
        await this.ctx.storage.setAlarm(Date.now() + 1000);
      }
    }
    return new Response('OK');
  }
  async alarm() {
    this.busy = true;
    try {
      await this.ctx.storage.setAlarm(Date.now() + 120000);
      await prepare(this.env);
      await sql(this.env,'UPDATE nh_v15_runtime SET heartbeat=? WHERE id=1',Date.now()).run();
      const schedule = await schedulerState(this.env);
      const due = schedule.active.find(s=>s.eligible<=Date.now());
      if (due) {
        await sql(this.env,'UPDATE nh_v15_runtime SET last_slot=?,last_at=? WHERE id=1',due.slot,Date.now()).run();
        try { await run(this.env,due.slot); }
        catch (error) {
          if (readLimit(error)) throw error;
          console.error('note-helper: account ' + due.slot + ' storage/runtime failure');
        }
      }
      try { await flushAlerts(this.env); }
      catch (error) {
        if (readLimit(error)) throw error;
        console.error('note-helper: notification delivery deferred');
      }
      // 処理が状態を変えた場合だけ再取得。次のalarmでは必ず最新状態を取得する。
      const current = due ? await schedulerState(this.env) : schedule;
      let next = Date.now() + 120000;
      for (const state of current.active) next=Math.min(next,Math.max(Date.now()+1000,state.eligible));
      await this.ctx.storage.setAlarm(next);
      await sql(this.env,'UPDATE nh_v15_runtime SET alarm_at=? WHERE id=1',next).run();
    } catch (error) {
      if (!readLimit(error)) throw new Error('note-helper: scheduler storage/runtime failure');
      const nextReset = (Math.floor(Date.now()/(24*HOUR))+1)*24*HOUR;
      // D1に触れず、同じDOの予約を翌UTC日へ。OFF・lease・next_atは次回にも確認する。
      await this.ctx.storage.setAlarm(nextReset + 5000);
      console.warn('note-helper: D1 daily row read limit; alarm deferred to UTC reset');
    } finally { this.busy = false; }
  }
}
// 作品の公開情報は既存DOのSQLiteに記録。設定の確認と、本人の下書きの公開・参加済み共同誌への追加に既存の認証を使う。
const D520 = 86400000, M520 = 60000, WINDOW520 = 15*M520;
const jstDay = t => new Date(t+9*HOUR).toISOString().slice(0,10);
const jstStart = d => Date.parse(d+'T00:00:00+09:00');
const monday520 = t => {
  const midnight = jstStart(jstDay(t));
  return midnight - ((new Date(midnight+9*HOUR).getUTCDay()+6)%7)*D520;
};
const genre520 = ['短編小説','小説','エッセイ','詩','散文','その他'];
const method520 = ['本人執筆','AI補助','AI生成'];
class Input520 extends Error {}
function need520(condition,msg) { if (!condition) throw new Input520(msg); }
function text520(v,max) { return typeof v==='string' && v.trim()!=='' && v.length<=max; }
function date520(s) {
  return typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(jstStart(s)) && jstDay(jstStart(s))===s;
}
function sharedDraftKey(value) {
  let url;
  try { url=new URL(String(value||'').trim()); } catch {}
  const match=url?.origin==='https://note.com' && !url.username && !url.password &&
    /^\/preview\/(n[a-z0-9]{1,64})\/?$/.exec(url.pathname);
  need520(match && url.searchParams.get('prev_access_key'),'noteの下書きの「共有用リンク」を貼ってください。');
  return match[1];
}
// A missing field does not establish that the author selected no image.
function coverId(value) {
  if(value===null || value==='')return '';
  try {
    const u=new URL(value);
    if(u.protocol==='https:' && !u.username && !u.password && !u.port && /^(?:[a-z0-9-]+\.)+st-note\.com$/.test(u.hostname) && u.pathname.length>1)
      return u.origin+u.pathname;
  } catch {}
  return null;
}
function same520(a,b,fields) { return fields.every(k=>a[k]===b[k]); }
function stub520(env) {
  return env.SCHEDULER.get(env.SCHEDULER.idFromName('note-helper-210-seconds'));
}
async function deskTick(env) {
  const r=await stub520(env).fetch('https://scheduler.internal/desk/tick');
  if (!r.ok) throw Error('520 tick unavailable');
}
async function read520body(res, limit) {
  if (Number(res.headers.get('content-length'))>limit) throw new Input520('データが大きすぎます。');
  const reader=res.body?.getReader();
  if (!reader) throw new Input520('データが空です。');
  const decoder=new TextDecoder('utf-8',{fatal:true});
  let size=0, result='';
  try {
    for (;;) {
      const {value,done}=await reader.read();
      if (done) break;
      size+=value.byteLength;
      if (size>limit) { await reader.cancel(); throw new Input520('1回の登録量を減らしてください。'); }
      result+=decoder.decode(value,{stream:true});
    }
    return result+decoder.decode();
  } finally { reader.releaseLock(); }
}
function deskJson(data,status=200) {
  return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
}
async function deskRoute(request,env) {
  if (request.method==='GET') return deskPage();
  if (request.method!=='POST') return deskJson({error:'操作方法を確認してください。'},405);
  const isForm=request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()==='application/x-www-form-urlencoded';
  const failure=(message,status)=>isForm?deskPage(null,message,status):deskJson({error:message},status);
  if(request.headers.get('Origin')!==new URL(request.url).origin)
    return failure('操作元を確認できません。「520 作品管理」を開き直してください。',403);
  if(!env.ADMIN_KEY)return failure('Cloudflareに管理用の鍵が設定されていません。',503);
  try {
    let input,editing='';
    if(isForm){
      const form=new URLSearchParams(await read520body(request,2000000));
      if(form.get('key')!==env.ADMIN_KEY)return failure('管理用の鍵が違います。入力し直してください。',403);
      editing=form.get('edit_target')||'';
      if(['reserve_link','cancel_link','preview_link'].includes(form.get('work_action'))){
        const change=form.get('editing')||'';
        const match=/^(n[a-z0-9]{1,64})@([0-9]+)$/.exec(change);
        if(change && !match)throw new Input520('変更する予約を選び直してください。');
        const raw=(form.get('share')||'').trim(),action=form.get('work_action');
        input={action:match && action==='reserve_link'?'replace_link':action,
          article:raw?sharedDraftKey(raw):match?match[1]:sharedDraftKey(''),d:form.get('link_date'),t:form.get('link_time')};
        if(match){input.original=match[1];input.expected=Number(match[2]);}
        if(match && action==='cancel_link' && input.article!==match[1])throw new Input520('取り消す予約と共有リンクが一致しません。');
      }else if(form.get('work_action')==='clear_reserved'){
        input={action:'clear_reserved',seqs:form.getAll('reserved_seq').map(Number)};
      }else{
        const offset=Number(form.get('offset')??0);
        if(!Number.isSafeInteger(offset) || offset<0)return failure('ページ番号を確認してください。',400);
        input={action:'status',offset};
      }
    }else{
      if(request.headers.get('Authorization')!=='Bearer '+b64(new TextEncoder().encode(env.ADMIN_KEY)))
        return failure('管理用の鍵が違います。入力し直してください。',403);
      input=JSON.parse(await read520body(request,2000000));
    }
    if(!env.SCHEDULER)return failure('作品管理の保存先 SCHEDULER が設定されていません。',503);
    const res=await stub520(env).fetch(new Request('https://scheduler.internal/desk/admin',{method:'POST',body:JSON.stringify(input)}));
    if(!isForm)return res;
    const data=await res.json();
    if(!res.ok){
      if(res.status===400 && ['reserve_link','replace_link','cancel_link','preview_link','clear_reserved'].includes(input.action)){
        const overview=await stub520(env).fetch(new Request('https://scheduler.internal/desk/admin',{method:'POST',body:JSON.stringify({action:'status'})}));
        return overview.ok?deskPage(await overview.json(),data.error,400):failure(data.error,400);
      }
      return failure('作品管理の記録を読み出せませんでした。少し待ってから、もう一度開いてください。',503);
    }
    return deskPage(data,data.correctionMessage||(editing?'選んだ予約の日時を表示しました。':'記録を開きました。'),200,editing);
  } catch(e) {
    const bad=e instanceof Input520 || e instanceof SyntaxError;
    return failure(e instanceof Input520?e.message:bad?'入力または応答の形式を確認できません。':'作品管理の保存先に接続できません。少し待ってから、もう一度開いてください。',bad?400:503);
  }
}
function xmlValue520(raw) {
  return raw.replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|quot);/gi,(_,k)=>{
    if (k[0]!=='#') return ({amp:'&',apos:"'",gt:'>',lt:'<',quot:'"'})[k]??_;
    const n=k[1]==='x'?parseInt(k.slice(2),16):Number(k.slice(1));
    return n>=0 && n<=0x10ffff ? String.fromCodePoint(n) : _;
  });
}
// Only direct RSS item children. CDATA descriptions may themselves contain markup.
function rss520(xml,channelOnly=false) {
  if (!/<rss[\s>]/i.test(xml) || !/<\/rss\s*>/i.test(xml) || /<!DOCTYPE/i.test(xml)) throw Error('RSS');
  const rows=[], stack=[],header={title:'',link:'',description:''};
  let row=null,channel=false;
  const tokens=xml.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/?([\w:.-]+)(?:\s+(?:"[^"]*"|'[^']*'|[^>'"])*)?\s*\/?>|([^<]+)/g);
  for(const m of tokens) {
    const name=m[2]?.toLowerCase();
    if(name) {
      if(m[0].startsWith('</')) {
        if(stack.pop()!==name) throw Error('RSS nesting');
        if(name==='item' && row && stack.join('/')==='rss/channel') { rows.push(row); row=null; }
      } else if(!m[0].endsWith('/>')) {
        stack.push(name);
        if(stack.length===2 && stack[0]==='rss' && name==='channel') channel=true;
        if(stack.join('/')==='rss/channel/item') row={title:'',link:'',pubdate:''};
      }
    } else if(stack.length===3 && stack[0]==='rss' && stack[1]==='channel' && Object.hasOwn(header,stack[2])) {
      header[stack[2]]+=m[1]??xmlValue520(m[3]??'');
    } else if(row && stack.length===4 && Object.hasOwn(row,stack[3])) {
      row[stack[3]]+=m[1]??xmlValue520(m[3]??'');
    }
  }
  if(stack.length || !channel) throw Error('RSS incomplete');
  return channelOnly==='issue'?{header,entries:rows}:channelOnly?header:rows;
}
function publicKey520(link) {
  return /^https:\/\/note\.com\/43__\/n\/(n[a-z0-9]+)\/?$/.exec(link.trim())?.[1] || '';
}
function count520(obj,fields) {
  for(const f of fields) if(Number.isSafeInteger(obj?.[f]) && obj[f]>=0) return obj[f];
  return null;
}
function median520(a) {
  a.sort((x,y)=>x-y);
  const mid=Math.floor(a.length/2);
  return a.length%2?a[mid]:(a[mid-1]+a[mid])/2;
}
const schema520 = [
  'CREATE TABLE IF NOT EXISTS desk_cfg (id INTEGER PRIMARY KEY, enabled INTEGER DEFAULT 0, plan TEXT DEFAULT \'未確認\', started INTEGER, weekly_at INTEGER, rss_at INTEGER DEFAULT 0, rss_ok INTEGER DEFAULT 0, rss_msg TEXT DEFAULT \'未取得\', blocked INTEGER DEFAULT 0, tick_at INTEGER DEFAULT 0)',
  'INSERT OR IGNORE INTO desk_cfg(id) VALUES(1)',
  'CREATE TABLE IF NOT EXISTS desk_work (seq INTEGER PRIMARY KEY,title TEXT NOT NULL, body TEXT NOT NULL, d TEXT NOT NULL,t TEXT NOT NULL, locked INTEGER NOT NULL,draft TEXT NOT NULL, genre TEXT NOT NULL, method TEXT NOT NULL, chars INTEGER NOT NULL, suggested TEXT, article TEXT UNIQUE,pub INTEGER, magazine TEXT, UNIQUE(d,title))',
  'CREATE UNIQUE INDEX IF NOT EXISTS desk_draft ON desk_work(draft) WHERE draft<>\'\'',
  'CREATE INDEX IF NOT EXISTS desk_plan ON desk_work(d,seq)',
  'CREATE INDEX IF NOT EXISTS desk_pub ON desk_work(pub)',
  'CREATE TABLE IF NOT EXISTS desk_sample(seq INTEGER, age INTEGER, due INTEGER NOT NULL, value INTEGER, at INTEGER, state TEXT DEFAULT \'待機\',last_try INTEGER DEFAULT 0,PRIMARY KEY(seq,age))',
  'CREATE INDEX IF NOT EXISTS desk_due ON desk_sample(due) WHERE state=\'待機\'',
  'CREATE TABLE IF NOT EXISTS desk_follower(d TEXT PRIMARY KEY,value INTEGER,at INTEGER,state TEXT)',
  'CREATE TABLE IF NOT EXISTS desk_week(start TEXT PRIMARY KEY, delta INTEGER, avg7 REAL, eligible INTEGER, measured INTEGER, final INTEGER)',
  'CREATE TABLE IF NOT EXISTS desk_mag(url TEXT PRIMARY KEY, name TEXT NOT NULL, rules TEXT NOT NULL, policy TEXT NOT NULL, active INTEGER DEFAULT 0, last_check INTEGER DEFAULT 0, recent INTEGER DEFAULT 0, rss_state TEXT DEFAULT \'未取得\')',
  'CREATE TABLE IF NOT EXISTS desk_placement(seq INTEGER, url TEXT, name TEXT, observed INTEGER, PRIMARY KEY(seq,url))',
  'CREATE TABLE IF NOT EXISTS desk_probe(id INTEGER PRIMARY KEY, at INTEGER DEFAULT 0, rss TEXT, creator TEXT, article TEXT)',
  'INSERT OR IGNORE INTO desk_probe(id) VALUES(1)',
  'CREATE TABLE IF NOT EXISTS desk_photo(hash TEXT PRIMARY KEY, jpeg BLOB NOT NULL, caption TEXT NOT NULL, added INTEGER NOT NULL, shared INTEGER)'
];
// Only fixed, non-sensitive diagnostics are exposed in the private dashboard.
class PublicReadError extends Error {}
function publicReadReason(error){
  return error instanceof PublicReadError?error.message:'内部の読み取り・保存処理を確認できません';
}
// The browser opens only note's account settings. Its host-only cookie lives in this session.
const noteSettingsURL = 'https://note.com/settings/account';
const recommendLabels = [
  '自分の記事の下に他のクリエイターのおすすめ記事を表示する',
  '自分の記事の下部に他のクリエイターの記事を表示する',
  '自分のノートの下部に他のクリエイターのノートを表示する',
  '自分の記事の下に他のクリエイターの記事を表示する',
  '記事の下に他のクリエイターのおすすめ記事を表示する'
];

// Chrome executes this function within the main frame of the settings page.
const recommendationControlJS=String.raw`function recommendationControl(labels, action) {
  if(location.origin==='https://note.com' && /^\/login(?:\/|$)/.test(location.pathname))return 'login';
  if (location.origin !== 'https://note.com' || !/^\/settings\/(?:account|reaction|reactions)\/?$/.test(location.pathname)) return 'outside';
  const clean = text => (text || '').replace(/[\s、。]/gu, '').replace('ほかのクリエイター','他のクリエイター');
  const visible = element => element && element.getClientRects().length > 0;
  const exact = value => labels.includes(clean(value));
  const controls = [...document.querySelectorAll('input[type=checkbox],[role=switch],[role=checkbox]')];
  const hits = [];
  for (const control of controls) {
    const labelsFor = [...(control.labels || [])];
    const labelled = (control.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean)
      .map(id => document.getElementById(id)).filter(Boolean);
    let label = [...labelsFor,...labelled].find(e => visible(e) && exact(e.textContent));
    if (!label && !exact(control.getAttribute('aria-label'))) {
      // Some rows put the title and a single unnamed switch in sibling elements.
      for(let parent=control.parentElement,depth=0;parent && depth<4;parent=parent.parentElement,depth++) {
        if(parent.querySelectorAll('input[type=checkbox],[role=switch],[role=checkbox]').length!==1) break;
        if(visible(parent) && exact(parent.textContent)) {label=parent;break;}
        const caption=[...parent.querySelectorAll('label,legend,dt,span,p,strong,h3,h4')]
          .find(e=>visible(e) && exact(e.textContent));
        if(caption){label=caption;break;}
      }
      if (!label) continue;
    }
    if (!visible(control) && !(labelsFor.includes(label) && visible(label))) continue;
    hits.push({control,label});
  }
  if(hits.length!==1) return hits.length?'ambiguous':'missing';
  const {control,label}=hits[0];
  if(control.disabled || control.closest('[aria-disabled=true],fieldset[disabled]')) return 'disabled';
  const native=control.matches('input[type=checkbox]');
  const state=native ? (control.indeterminate ? null : control.checked) : ({true:true,false:false})[control.getAttribute('aria-checked')];
  if(state===true)return 'on';
  if(state!==false)return 'unknown';
  if(action==='enable') {
    (visible(control)?control:label).click();
    return 'clicked';
  }
  return 'off';
}`;

function pageCommand(socket) {
  let sequence=0;
  return (method,params={})=>new Promise((resolve,reject)=>{
    const id=++sequence;
    const clean=()=>{
      clearTimeout(timer);
      socket.removeEventListener('message',message);
      socket.removeEventListener('close',closed);
      socket.removeEventListener('error',closed);
    };
    const closed=()=>{clean();reject(Error('browser connection'));};
    const message=event=>{
      let data;
      try { data=JSON.parse(event.data); } catch { return; }
      if(data.id!==id)return;
      clean();
      if(data.error)reject(Error('browser command')); else resolve(data.result);
    };
    const timer=setTimeout(closed,5500);
    socket.addEventListener('message',message);
    socket.addEventListener('close',closed);
    socket.addEventListener('error',closed);
    try{socket.send(JSON.stringify({id,method,params}));}catch{closed();}
  });
}
const pause520 = ms => new Promise(resolve=>setTimeout(resolve,ms));
const noteIdentityJS=`(async()=>{if(location.origin!=='https://note.com')return null;
      const r=await fetch('/api/v2/current_user',{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(4500)});
      if(!r.ok)return null;const j=await r.json(),d=j.data??j,u=d.user??d;return {id:String(u.id),name:u.urlname};})()`;
async function inNoteBrowser(binding,cookie,allowEditor,action){
  const session=await binding.acquire({keepAlive:15000,recording:false,
    guardrails:{allowedDomains:['note.com','assets.st-note.com','*.st-note.com','*.note.com']}});
  let socket;
  let retry=0, denied=0;
  try {
    const target=await binding.devtools.newTarget(session.sessionId);
    const link=await binding.connectSession(session.sessionId,{targetId:target.id});
    const upgrade=await link.webSocket.fetch('https://browser-binding.invalid',{headers:{Upgrade:'websocket'}});
    socket=upgrade.webSocket;
    if(!socket)throw Error('browser setup');
    socket.accept();
    socket.addEventListener('message',event=>{
      let data;
      try {data=JSON.parse(event.data);} catch{return;}
      if(data.method!=='Network.responseReceived')return;
      const {type,response}=data.params;
      if(!['Document','XHR','Fetch'].includes(type) || !/^https:\/\/(?:editor\.)?note\.com\//.test(response.url))return;
      const raw=Object.entries(response.headers||{}).find(([k])=>k.toLowerCase()==='retry-after')?.[1];
      if(raw!==undefined){
        const delay=/^\d+$/.test(String(raw))?Number(raw)*1000:Date.parse(raw)-Date.now();
        if(Number.isFinite(delay))retry=Math.max(retry,delay);
      }
      if([401,403,429].includes(response.status) || (allowEditor && response.status>=500))denied=response.status;
    });
    const command=pageCommand(socket);
    const evaluate=async expression=>{
      const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
      if(r.exceptionDetails)throw Error('settings page');
      return r.result.value;
    };
    const blocked=()=>denied || retry>0;
    const blockedResult=()=>({message:denied?'note応答 HTTP '+denied+'・操作結果は未確認':'note指定の待機・操作結果は未確認',hold:Math.max(denied===429?2*HOUR:0,retry)});
    await command('Network.enable');
    await command('Network.setCacheDisabled',{cacheDisabled:true});
    const installed=await command('Network.setCookie',{url:'https://note.com/',name:'_note_session_v5',value:cookie,secure:true,httpOnly:true,sameSite:'Lax'});
    if(installed.success===false)throw Error('session');
    if(allowEditor){
      const installed=await command('Network.setCookie',{url:'https://editor.note.com/',name:'_note_session_v5',value:cookie,secure:true,httpOnly:true,sameSite:'Lax'});
      if(installed.success===false)throw Error('editor session');
    }
    return await action({command,evaluate,blocked,blockedResult});
  } catch {
    return denied || retry>0?{message:'note側で待機・操作結果は未確認',hold:Math.max(2*HOUR,retry)}:{message:'noteの画面との通信を再確認待ち'};
  } finally {
    try {socket?.close();} catch {}
    await binding.closeSession(session.sessionId).catch(()=>{});
  }
}

async function browserRecommendation(binding, accountId, cookie, lastAttempt, tries, markAttempt) {
  return inNoteBrowser(binding,cookie,false,async ({command,evaluate,blocked,blockedResult})=>{
    const waitState=async()=>{
      let stable='';
      for(let i=0;i<14;i++){
        if(blocked())return 'blocked';
        let result;
        try {result=await evaluate('('+recommendationControlJS+')('+JSON.stringify(recommendLabels)+',"read")');}
        catch { /* Execution contexts are briefly replaced during a normal navigation. */ }
        if(['on','off'].includes(result) && stable===result)return result;
        if(['ambiguous','disabled','unknown','login'].includes(result))return result;
        stable=result;
        await pause520(300);
      }
      return 'missing';
    };
    await command('Page.navigate',{url:noteSettingsURL});
    let state=await waitState();
    if(state==='missing' && !blocked()){
      // Follow an actual settings tab only. Never guess a write URL.
      const tab=await evaluate(`(()=>{if(location.origin!=='https://note.com'||location.pathname!=='/settings/account')return null;
        const links=[...document.querySelectorAll('a[href]')].filter(a=>['リアクション','記事設定'].includes(a.textContent.trim()) && a.getClientRects().length);
        const urls=[...new Set(links.map(a=>a.href).filter(h=>{const u=new URL(h);return u.origin===location.origin && /^\\/settings\\/(?:reaction|reactions|account)\\/?$/.test(u.pathname) && h!==location.href;}))];
        return urls.length===1?urls[0]:null;})()`);
      if(tab){await command('Page.navigate',{url:tab});state=await waitState();}
      else {
        const switched=await evaluate(`(()=>{if(location.origin!=='https://note.com'||location.pathname!=='/settings/account')return false;
          const options=[...document.querySelectorAll('button[role=tab]')].filter(b=>b.getClientRects().length && !b.disabled && b.getAttribute('aria-selected')!=='true');
          for(const title of ['記事設定','リアクション','ユーザー設定']){
            const matches=options.filter(b=>b.textContent.trim()===title);
            if(matches.length===1){matches[0].click();return true;}
          }return false;})()`);
        if(switched)state=await waitState();
      }
    }
    if(blocked())return blockedResult();
    if(state==='login')return {message:'noteがログイン画面を表示・設定は未確認'};
    if(!['on','off'].includes(state))return {message:'設定項目を一意に確認できず・変更なし'};
    // Authenticate *inside this isolated session* before trusting either state.
    const identity=await evaluate(noteIdentityJS);
    if(blocked())return blockedResult();
    if(identity?.id!==accountId || identity?.name!=='43__')return {message:'520本人を確認できず・変更なし'};
    if(state==='on')return {message:lastAttempt?'ONを再確認済み':'すでにON・本人の設定で確認済み',done:true};
    const retryAt=lastAttempt+Math.min(7,2**Math.min(3,Math.max(0,tries-1)))*D520;
    if(lastAttempt && Date.now()<retryAt)return {message:'再確認時はOFF・間隔を空けて自動再試行',retryAt};
    if(blocked())return blockedResult();
    // A crash after clicking must never blindly toggle the setting a second time.
    markAttempt();
    const result=await evaluate('('+recommendationControlJS+')('+JSON.stringify(recommendLabels)+',"enable")');
    if(result!=='clicked')return {message:'状態が変わったため再確認待ち'};
    await pause520(1400);
    if(blocked())return blockedResult();
    // Verification is a separate Cron run and a separately acquired browser session.
    return {message:'ON操作済み・別のブラウザー起動で保存結果を確認待ち',verify:true};
  });
}
const nativeScreenJS=String.raw`function noteNativeScreen(step, arg) {
  const visible=e=>!!(e && e.getClientRects().length && getComputedStyle(e).visibility!=='hidden');
  const all=(root,sel)=>[...root.querySelectorAll(sel)].filter(visible);
  const label=e=>(e.getAttribute('aria-label') || e.getAttribute('title') || e.innerText || '').trim();
  const unique=xs=>xs.length===1?xs[0]:null;
  const button=(root,names)=>unique(all(root,'button,[role=button]').filter(e=>!e.disabled && e.getAttribute('aria-disabled')!=='true' && names.includes(label(e))));
  const press=e=>{if(!e)return 'missing';e.click();return 'clicked';};
  const editorLink=url=>{
    try {
      const u=new URL(url,location.href);
      const m=/^\/notes\/(n[a-z0-9]{1,64})\/edit\/?$/.exec(u.pathname);
      return ['https://editor.note.com','https://note.com'].includes(u.origin) && !u.username && !u.password && m ? {key:m[1],url:u.origin+u.pathname} : null;
    }catch{return null;}
  };
  if(location.origin==='https://note.com' && /^\/notes\/?$/.test(location.pathname)){
    if(step==='findDraft'){
      const hits=[];
      for(const a of all(document,'a[href]')){
        const entry=editorLink(a.href);
        if(!entry || (arg.key && arg.key!==entry.key))continue;
        let row=a;
        for(let depth=0;row && depth<7;depth++,row=row.parentElement){
          const hrefs=new Set(all(row,'a[href]').map(el=>editorLink(el.href)?.key).filter(Boolean));hrefs.add(entry.key);
          if(hrefs.size!==1)break;
          const words=(row.innerText||'').split('\n').map(v=>v.trim()).filter(Boolean);
          if((!arg.byLink && !words.includes(arg.title.trim())) || !words.some(t=>t==='下書き'||/予約中|予約済|公開予約|公開予定|公開済|公開中/.test(t)))continue;
          if(words.some(t=>/予約中|予約済|公開予約|公開予定|公開済|公開中/.test(t)))return {state:'reserved'};
          const heading=all(row,'h1,h2,h3,h4,[data-testid="note-title"]').map(el=>el.innerText?.trim()).filter(Boolean);
          const anchorText=(a.innerText||'').trim();
          const name=heading.length===1?heading[0]:anchorText;
          if(name && name.length<=300 && !name.includes('\n') && words.includes(name) && !/^(下書き|編集|編集する|記事を編集|無題|タイトル未設定)$/.test(name))entry.name=name;
          hits.push(entry);break;
        }
      }
      const map=new Map(hits.map(x=>[x.key,x]));
      return map.size===1?{state:'found',...map.values().next().value}:{state:map.size?'ambiguous':'missing'};
    }
    if(step==='draftPage'){
      const a=unique(all(document,'a[href]').filter(e=>['次へ','次のページ','次の30件'].includes(label(e)) || e.rel==='next'));
      if(!a)return null;
      const next=new URL(a.href);
      return next.origin===location.origin && /^\/notes\/?$/.test(next.pathname) && next.href!==location.href ? next.href:null;
    }
  }
  if(['https://editor.note.com','https://note.com'].includes(location.origin) && arg.key &&
     new RegExp('^/notes/'+arg.key+'/(edit|publish|publish_setting|publish_settings)/?$').test(location.pathname)){
    const value=e=>'value' in e?e.value:e.innerText;
    const checkedDraft=()=>{
      const titles=all(document,'textarea,input,[contenteditable=true]').filter(e=>/^(記事)?タイトル(を入力)?$/.test(e.getAttribute('placeholder')||e.getAttribute('aria-label')||e.getAttribute('data-placeholder')||''));
      const title=unique(titles);
      const body=unique(all(document,'[contenteditable=true].ProseMirror,[contenteditable=true][role=textbox],[contenteditable=true][data-placeholder]').filter(e=>e!==title));
      if(!body || !title)return false;
      if(arg.byLink){
        const name=value(title);
        if(!name?.trim() || name.trim()==='521' || name.length>300 || (!body.innerText?.trim() && !body.querySelector('img,figure,iframe,video')))return false;
        if(step==='linkTitle')return name;
        return name===arg.title;
      }
      if(value(title)!==arg.title)return false;
      // Only project ordinary text paragraphs. Preserve whitespace and blank paragraphs.
      const plain=node=>{
        let out='';
        for(const child of node.childNodes){
          if(child.nodeType===3)out+=child.nodeValue;
          else if(child.nodeName==='BR'){if(!child.classList.contains('ProseMirror-trailingBreak'))out+='\n';}
          else if(['SPAN','STRONG','EM','B','I','S','U','A','CODE'].includes(child.nodeName)){const x=plain(child);if(x===null)return null;out+=x;}
          else return null;
        }
        return out;
      };
      const parts=[];
      for(const paragraph of body.childNodes){
        if(!['P','DIV'].includes(paragraph.nodeName))return false;
        let line=plain(paragraph);if(line===null)return false;
        if(paragraph.childNodes.length===1 && paragraph.firstChild.nodeName==='BR')line='';
        parts.push(line);
      }
      return parts.join('\n')===arg.body.replace(/\r\n?/g,'\n');
    };
    if(step==='linkTitle')return checkedDraft()||null;
    if(step==='linkCover'){
      const slots=all(document,'img[alt="見出し画像"],[data-testid="eyecatch"] img,[data-testid="eyecatch-image"] img,[data-testid="header-image"] img').filter(i=>!i.closest('[contenteditable=true]'));
      if(slots.length===1 && slots[0].complete && slots[0].naturalWidth>0)
        return {src:slots[0].currentSrc || slots[0].src};
      // An unlabeled blank editor or a loading image is not evidence of an empty cover.
      if(!slots.length && button(document,['見出し画像を追加','見出し画像を設定']))return {src:null};
      return null;
    }
    if(step==='draft')return checkedDraft()?'ready':'mismatch';
    if(step==='settings')return checkedDraft()?press(button(document,['公開設定'])):'mismatch';
    if(step==='publishReady'||step==='publish'){
      const submit=button(document,['投稿する']);
      if(!submit)return 'missing';
      const scope=submit.closest('[role=dialog],dialog') || document;
      const selected=all(scope,'[aria-checked=true],[aria-selected=true],[aria-pressed=true]').map(label);
      for(const el of scope.querySelectorAll('input:checked')){
        const text=[...(el.labels||[])].map(label).join('').trim();selected.push(text||label(el));
      }
      if(!selected.some(t=>t==='無料') || selected.some(t=>/有料|メンバーシップ|日時指定|予約|Xに|SNSに/.test(t)))return 'unsafe';
      if(all(scope,'input[type="datetime-local"],[name*="schedul"][type=hidden]').some(e=>e.value))return 'unsafe';
      const tag=unique(all(scope,'input,textarea').filter(e=>/ハッシュタグ/.test(e.placeholder||e.getAttribute('aria-label')||'')));
      if(!tag || tag.value.trim())return 'unsafe';
      // Find the tag entry (not the list of suggested tags); unknown chips are not removed.
      const region=tag.closest('[role=combobox],fieldset,[class*=tagInput],[class*=TagInput]') || tag.parentElement;
      if(!region || [...region.querySelectorAll('a,button,[role=button],[data-tag],[class*=chip],[class*=Chip]')].some(e=>visible(e) && (/削除|取り消す|^#|外す/.test(label(e))||e.matches('[data-tag],[class*=chip],[class*=Chip]'))))return 'unsafe';
      if(all(scope,'[aria-label*=ハッシュタグ][aria-label*=削除],[class*=tagChip],[class*=TagChip],[data-selected-tag],input[name="hashtags[]"]').length)return 'unsafe';
      return step==='publish'?press(submit):'ready';
    }
  }
  if(location.origin==='https://note.com' && location.pathname.replace(/\/$/,'')==='/43__/n/'+arg.key){
    const canonical=document.querySelector('link[rel=canonical]')?.href;
    const h=unique(all(document,'h1'));
    if(!h || h.textContent.trim()!==arg.title.trim() || !canonical || new URL(canonical).pathname.replace(/\/$/,'')!=='/43__/n/'+arg.key || new URL(canonical).origin!==location.origin)return 'wrong';
    if(step==='openMag')return press(button(document,['記事を保存','マガジンに追加','記事をマガジンに追加']));
    const modal=unique(all(document,'dialog[open],[role=dialog],[aria-modal=true]'));
    if(!modal)return 'missing';
    const isTarget=e=>{
      if(e.dataset?.magazineKey===arg.mag || e.dataset?.magazineId===arg.mag || (e.tagName==='INPUT' && e.value===arg.mag))return true;
      if(e.tagName!=='A')return false;
      const u=new URL(e.href,location.href);return u.origin==='https://note.com' && new RegExp('^/(?:[\\w-]+/)?m/'+arg.mag+'/?$').test(u.pathname);
    };
    const markerSel='a[href],[data-magazine-key],[data-magazine-id],input[value]';
    const markers=all(modal,markerSel).filter(isTarget);
    const matches=new Set();
    for(const marker of markers){
      for(let row=marker;row && row!==modal;row=row.parentElement){
        if([...row.querySelectorAll(markerSel)].some(e=>{
          const href=e.tagName==='A'?e.getAttribute('href')||'':'';
          return (/\/m\/m[a-z0-9]+/.test(href)||e.dataset?.magazineKey||e.dataset?.magazineId) && !isTarget(e);}))break;
        const controls=all(row,'button,[role=button],input[type=checkbox],[role=checkbox]').filter(e=>
          ['追加','追加済','追加済み','削除','解除'].includes(label(e)) || e.matches('input[type=checkbox],[role=checkbox]'));
        if(controls.length===1){matches.add(controls[0]);break;}
        if(controls.length>1)break;
      }
    }
    const control=unique([...matches]);if(!control)return 'missing';
    const checked=control.matches('input[type=checkbox]')?control.checked:control.getAttribute('aria-checked');
    if(checked===true || checked==='true' || ['追加済','追加済み','解除'].includes(label(control)))return 'already';
    if(control.disabled||control.getAttribute('aria-disabled')==='true' || !(checked===false||checked==='false'||label(control)==='追加'))return 'missing';
    if(step==='magReady')return 'ready';
    if(step==='magAdd')return press(control);
  }
  return 'missing';
}
`;
// Runs inside the authenticated note.com tab. Return only the data needed for comparison.
async function draftBodyHash(body){
  if(typeof body!=='string' || !body.trim() || body.length>2500000)return null;
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body));
  return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
}
async function readDraftCover(key,accountId,hashBody) {
  if(location.origin!=='https://note.com' || !/^n[a-z0-9]{1,64}$/.test(key))return null;
  try {
    const r=await fetch('/api/v3/notes/'+key,{credentials:'same-origin',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(4500)});
    if(!r.ok)return null;
    const n=(await r.json())?.data;
    if(!n || n.key!==key)return null;
    if(n.user?.urlname && n.user.urlname!=='43__' || n.user?.id && String(n.user.id)!==accountId || ['published','reserved','scheduled'].includes(n.status) ||
       [n.scheduledPublishAt,n.scheduled_publish_at,n.publishAt,n.publish_at].some(t=>t && Date.parse(t)>Date.now()))return {unsafe:true};
    if(n.status!=='draft' || n.user?.urlname!=='43__' || String(n.user.id)!==accountId)return null;
    const full=n.is_limited!==true && n.is_paid!==true && !(Number(n.price)>0);
    return {name:n.name,hash:full?await hashBody(n.body):null,...(Object.hasOwn(n,'eyecatch')?{cover:n.eyecatch}:{})};
  }catch{return null;}
}
async function inspectDraftDirectory(binding,cookie,id,queries){
  return inNoteBrowser(binding,cookie,false,async ({command,evaluate,blocked,blockedResult})=>{
    let url='https://note.com/notes';
    const pages=new Set(),found=queries.map(()=>new Map()),uncertain=new Set();
    for(let page=0;url && page<4;page++){
      if(pages.has(url))break;
      pages.add(url);
      await command('Page.navigate',{url});
      let loaded=false;
      for(let n=0;n<6 && !blocked();n++){
        try{loaded=await evaluate('location.href.split("#")[0]==='+JSON.stringify(url)+' && !!document.querySelector(\'a[href*="/notes/"][href*="/edit"]\')');}catch{}
        if(loaded)break;
        await pause520(180);
      }
      if(blocked())return blockedResult();
      if(!loaded)return {};
      const who=await evaluate(noteIdentityJS);
      if(blocked())return blockedResult();
      if(who?.id!==id || who.name!=='43__')return {};
      const batch=await evaluate('('+JSON.stringify(queries)+').map(arg=>('+nativeScreenJS+')("findDraft",arg))');
      if(!Array.isArray(batch) || batch.length!==queries.length)return {};
      for(const [index,row] of batch.entries()){
        if(row?.state==='found' && /^n[a-z0-9]{1,64}$/.test(row.key))found[index].set(row.key,row);
        if(row?.state==='ambiguous'||row?.state==='reserved')uncertain.add(index);
      }
      url=await evaluate('('+nativeScreenJS+')("draftPage",{})');
    }
    if(blocked())return blockedResult();
    const rows=[];
    for(const [i,query] of queries.entries()){
      if(uncertain.has(i)||found[i].size!==1||(!query.key && url))continue;
      const row=[...found[i].values()][0];
      if(query.key && (row.key!==query.key || !text520(row.name,300)))continue;
      rows.push({seq:query.seq,title:query.key?row.name:query.title,article:row.key});
    }
    return {rows};
  });
}
async function browserDelivery(binding, accountId, cookie, job, markAttempt) {
  return inNoteBrowser(binding,cookie,job.kind==='publish',async ({command,evaluate,blocked,blockedResult})=>{
    const end=Date.now()+36000;
    const navigate=url=>command('Page.navigate',{url});
    const frame=async(step,arg)=>evaluate('('+nativeScreenJS+')('+JSON.stringify(step)+','+JSON.stringify(arg)+')');
    const poll=async(read,accept)=>{
      for(let i=0;i<10 && !blocked() && Date.now()<end;i++){
        try{const v=await read();if(accept(v))return v;}catch{}
        await pause520(200);
      }
      return null;
    };
    const state=(step,arg,values)=>poll(()=>frame(step,arg),v=>values.includes(v));
    const arg={key:job.key,title:job.title,byLink:!!job.link};
    let cover=null,hash=null;
    const page=job.kind==='publish'?'https://note.com/notes':'https://note.com/43__/n/'+job.key;
    await navigate(page);
    const identity=await poll(()=>evaluate(noteIdentityJS),v=>!!v);
    if(blocked())return blockedResult();
    if(identity?.id!==accountId || identity.name!=='43__')return {message:'520本人のログインを確認待ち'};
    let finalStep;
    if(job.kind==='publish'){
      let draft, url=page;
      const visited=new Set();
      for(let i=0;i<4 && url && !visited.has(url);i++){
        visited.add(url);
        if(i)await navigate(url);
        // Wait for this exact page's article list to mount before reading its next link.
        const loaded=await poll(()=>evaluate('location.href.split("#")[0]==='+JSON.stringify(url)+' && !!document.querySelector(\'a[href*="/notes/"][href*="/edit"]\')'),v=>v===true);
        if(!loaded)return blocked()?blockedResult():{message:'下書きの一覧を読み込み待ち'};
        const result=await frame('findDraft',arg);
        if(result?.state==='found'){
          if(draft && draft.key!==result.key)return {message:'同名の下書きが複数・公開保留'};
          draft=result;
        }else if(['reserved','ambiguous'].includes(result?.state))return {message:'予約・公開済みまたは同名の候補あり・公開保留'};
        if(draft && job.key)break;
        url=await frame('draftPage',arg);
        if(url && (i===3 || visited.has(url)) && !job.key)return {message:'同名下書きの照合範囲を超過・公開保留'};
      }
      if(blocked())return blockedResult();
      if(!draft)return {message:'本人の記事一覧で一致する下書きを確認待ち'};
      const editor=new URL(draft.url);
      if(!/^n[a-z0-9]{1,64}$/.test(draft.key) || !['https://editor.note.com','https://note.com'].includes(editor.origin) ||
          editor.pathname.replace(/\/$/,'')!=='/notes/'+draft.key+'/edit')return {message:'本人の編集ページを確認待ち'};
      // Read the existing draft's explicit cover field while still on note.com's own domain.
      const metadata=await evaluate('('+readDraftCover.toString()+')('+JSON.stringify(draft.key)+','+JSON.stringify(accountId)+',('+draftBodyHash.toString()+'))');
      if(blocked())return blockedResult();
      if(metadata?.unsafe)return {message:'公開済み・予約済みまたは所有者の不一致を確認・公開保留'};
      await navigate(editor.href);
      Object.assign(arg,{key:draft.key,body:job.body});
      if(job.link){
        const name=await poll(()=>frame('linkTitle',arg),v=>typeof v==='string' && !!v);
        if(!name)return {message:'元の下書きのタイトルと編集画面を確認できず・公開保留'};
        arg.title=name;
      }
      if(metadata?.name && metadata.name!==arg.title)return {message:'下書きのタイトルが一致せず・公開保留'};
      if(!await state('draft',arg,['ready']))return blocked()?blockedResult():{message:'下書きのタイトル・本文・改行の一致を確認待ち'};
      const img=await frame('linkCover',arg);
      const domCover=img?coverId(img.src):null;
      const dataCover=metadata && Object.hasOwn(metadata,'cover')?coverId(metadata.cover):null;
      if(dataCover!==null && domCover!==null && dataCover!==domCover)return {message:'見出し画像の記録と編集画面が一致せず・公開保留'};
      // Only an explicit field in the saved draft can confirm there is no header.
      cover=dataCover??(domCover || null);
      if(cover===null)return {message:'下書きの見出し画像を確認できず・公開保留'};
      hash=metadata?.hash;
      if(!/^[0-9a-f]{64}$/.test(hash||''))return {message:'保存済みの本文全体を取得できず・公開保留'};
      if(job.preview)return {message:'「'+arg.title+'」 ／ '+(cover?'設定済みの見出し画像を確認しました。':'見出し画像は未設定です。')+' 保存済み本文を照合できます。'};
      if(blocked() || await frame('settings',arg)!=='clicked')return blocked()?blockedResult():{message:'公開設定を確認待ち'};
      // Text is no longer needed in the browser commands for the publish screen.
      delete arg.body;
      if(!await state('publishReady',arg,['ready']))return blocked()?blockedResult():{message:'無料・タグなし・通常公開の設定を確認待ち'};
      finalStep='publish';
    }else{
      arg.mag=job.target;
      if(!await state('openMag',arg,['clicked']))return blocked()?blockedResult():{message:'520の記事の保存メニューを確認待ち'};
      const ready=await state('magReady',arg,['ready','already']);
      if(blocked())return blockedResult();
      if(ready==='already')return {seen:true,message:'noteの画面で追加済み・誌面での確認待ち'};
      if(!ready)return {message:'一致する誌面と追加ボタンを確認待ち'};
      finalStep='magAdd';
    }
    if(blocked())return blockedResult();
    if(Date.now()>=end)return {message:'確認時間を超過・操作保留'};
    const gate=await markAttempt(arg.key,job.kind==='publish'?{title:arg.title,cover,hash}:null);
    if(gate!==true)return {message:typeof gate==='string'?gate:'予定・待機・掲載条件を再確認待ち'};
    if(!blocked()){
      await frame(finalStep,arg);
      await pause520(1000);
    }
    return blocked()?blockedResult():{message:'操作記録済み・公開情報で結果を確認待ち'};
  });
}
function publicEntry520(n){return {key:n.key,title:n.name,pub:Date.parse(n.publishAt||n.publish_at||n.publishedAt)};}
function isPublishedBy520(n){
  return n && (n.user?.urlname==='43__' || (!n.user?.urlname && publicKey520(String(n.noteUrl||n.note_url||''))===n.key)) &&
    n.status==='published' && (!n.type || n.type==='TextNote' || n.type==='text');
}
const scoutSeeds=[
  ['https://note.com/kakitsubataayame/m/m32620a9cd50d','共同運営マガジン・note文芸部'],
  ['https://note.com/kknk41/m/md3fff28070f2','えんぴつくるくる'],
  ['https://note.com/mitsuruamano/m/m4d9023d7133b','創作の森 エンターテイナー・ストリート']
];
class Desk520 {
  constructor(storage,env) { this.env=env; this.storage=storage; this.ready=false; this.pendingReads=new Map(); }
  rows(q,...a) { return this.storage.sql.exec(q,...a).toArray(); }
  one(q,...a) { return this.rows(q,...a)[0]; }
  init() {
    if(this.ready) return;
    if(!this.one("SELECT name FROM sqlite_master WHERE type='table' AND name='desk_photo'"))
      this.storage.transactionSync(()=>{ for(const q of schema520) this.rows(q); });
    if(!this.one("SELECT name FROM sqlite_master WHERE type='index' AND name='desk_import_due'"))
      this.storage.transactionSync(()=>{for(const q of importSchema161)this.rows(q);});
    if(!this.one("SELECT name FROM sqlite_master WHERE type='table' AND name='desk_growth'"))this.initGrowth(Date.now());
    if(!this.one("SELECT name FROM sqlite_master WHERE type='table' AND name='desk_recommend'")){
      this.storage.transactionSync(()=>{
        this.rows("CREATE TABLE desk_recommend(id INTEGER PRIMARY KEY, done INTEGER DEFAULT 0, attempted INTEGER DEFAULT 0, tries INTEGER DEFAULT 0, due INTEGER DEFAULT 0, checked INTEGER DEFAULT 0, message TEXT DEFAULT '初回確認待ち', utc_day INTEGER DEFAULT -1, used INTEGER DEFAULT 0, fallback_at INTEGER DEFAULT 0)");
        this.rows('INSERT INTO desk_recommend(id) VALUES(1)');
        this.rows('CREATE INDEX IF NOT EXISTS desk_archive_observed ON desk_archive(at) WHERE prior_at IS NOT NULL');
      });
    }
    this.initDelivery();
    if(!this.one("SELECT name FROM sqlite_master WHERE type='table' AND name='desk_link_plan'")){
      this.storage.transactionSync(()=>{
        this.rows("CREATE TABLE desk_link_plan(article TEXT PRIMARY KEY, scheduled INTEGER NOT NULL, title TEXT, pub INTEGER, cover TEXT, check_at INTEGER, result TEXT)");
        this.rows('CREATE TABLE desk_preview_gate(id INTEGER PRIMARY KEY,next INTEGER NOT NULL)');
        this.rows('INSERT INTO desk_preview_gate(id,next) VALUES(1,0)');
        this.rows('CREATE INDEX desk_link_time ON desk_link_plan(scheduled) WHERE pub IS NULL');
        this.rows('CREATE INDEX desk_link_check ON desk_link_plan(check_at) WHERE check_at IS NOT NULL');
        this.rows("CREATE INDEX desk_published_key ON desk_job(target) WHERE kind='publish' AND phase IN ('sent','seen','confirmed')");
      });
    }
    if(!this.one("SELECT name FROM sqlite_master WHERE type='table' AND name='desk_work_cover'")){
      this.storage.transactionSync(()=>{
        this.rows('CREATE TABLE desk_work_cover(seq INTEGER PRIMARY KEY, article TEXT UNIQUE NOT NULL, scheduled INTEGER NOT NULL, cover TEXT NOT NULL, check_at INTEGER, result TEXT NOT NULL)');
        this.rows('CREATE INDEX desk_work_cover_due ON desk_work_cover(check_at) WHERE check_at IS NOT NULL');
      });
    }
    if(!this.one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='desk_snapshot'")){
      this.storage.transactionSync(()=>{
        this.rows('CREATE TABLE desk_snapshot(article TEXT PRIMARY KEY,title TEXT NOT NULL,body_hash TEXT NOT NULL,confirmed INTEGER)');
        this.rows('ALTER TABLE desk_link_plan ADD COLUMN title_due INTEGER NOT NULL DEFAULT 0');
        this.rows('CREATE INDEX desk_title_missing ON desk_link_plan(title_due,scheduled) WHERE title IS NULL AND pub IS NULL');
        this.rows('CREATE TABLE desk_scout(url TEXT PRIMARY KEY,kind TEXT NOT NULL,due INTEGER NOT NULL)');
        this.rows('CREATE INDEX desk_scout_due ON desk_scout(due,url)');
        this.rows("CREATE TABLE desk_scout_state(id INTEGER PRIMARY KEY,due INTEGER DEFAULT 0,title_due INTEGER DEFAULT 0,older INTEGER DEFAULT 1,message TEXT DEFAULT '文芸誌を確認待ち')");
        this.rows('INSERT INTO desk_scout_state(id) VALUES(1)');
        this.rows('CREATE TABLE desk_scout_mag(id TEXT PRIMARY KEY)');
        this.rows('CREATE INDEX desk_member_mode_due ON desk_member(mode,due,id)');
        for(const [url] of scoutSeeds){
          const link=noteLink161(url);
          this.rows("INSERT INTO desk_scout(url,kind,due) VALUES(?,'feed',0)",url);
          this.rows("INSERT OR IGNORE INTO desk_scout(url,kind,due) VALUES(?,'author',1)",'https://note.com/'+link.owner+'/magazines');
        }
      });
    }
    if(!this.one("SELECT 1 FROM sqlite_master WHERE name='desk_work_schedule'")){
      this.storage.transactionSync(()=>{
        this.rows('CREATE TABLE desk_draft_identity(seq INTEGER PRIMARY KEY, article TEXT UNIQUE NOT NULL, paused INTEGER NOT NULL DEFAULT 0)');
        this.rows('CREATE TABLE desk_draft_directory(id INTEGER PRIMARY KEY, due INTEGER NOT NULL DEFAULT 0)');
        this.rows('INSERT INTO desk_draft_directory(id) VALUES(1)');
        this.rows(`CREATE VIEW desk_work_schedule AS SELECT w.*,COALESCE(NULLIF(w.draft,''),b.article) AS key,
          COALESCE(b.paused,0) AS paused,l.scheduled AS link_at,
          COALESCE(l.scheduled,unixepoch(w.d||'T'||COALESCE(NULLIF(w.t,''),w.suggested)||':00+09:00')*1000) AS scheduled
          FROM desk_work w LEFT JOIN desk_draft_identity b ON b.seq=w.seq
          LEFT JOIN desk_link_plan l ON l.article=COALESCE(NULLIF(w.draft,''),b.article)`);
        this.rows('UPDATE desk_link_plan SET title_due=0 WHERE pub IS NULL AND title IS NULL');
      });
    }
    this.ready=true;
  }
  async admin(req,ctx) {
    try {
      const input=await req.json();
      this.init();
      const now=Date.now();
      let correctionMessage='';
      switch(input.action) {
        case 'plans': return deskJson({publicationLinks:publicationLinks(this.scheduleRecords())});
        case 'status':
          if(typeof ctx?.waitUntil==='function')ctx.waitUntil(this.resolveDraftDirectory(now).catch(()=>{}));
          break;
        case 'archive': {
          need520(Number.isSafeInteger(input.offset) && input.offset>=0,'ページ番号を確認してください。');
          return deskJson(this.archivePage(input.offset,now));
        }
        case 'setup': {
          need520(['未確認','通常（予約なし）','予約ボタンを確認済み'].includes(input.plan),'予約機能の確認結果を選んでください。');
          this.rows('UPDATE desk_cfg SET enabled=1,plan=?,started=COALESCE(started,?),weekly_at=COALESCE(weekly_at,?) WHERE id=1',input.plan,now,monday520(now));
          break;
        }
        case 'works': {
          need520(Array.isArray(input.works) && input.works.length>0 && input.works.length<=100,'一度に1〜100本の完成稿を指定してください。');
          this.storage.transactionSync(()=>{ for(const w of input.works) this.addWork(w); this.planTimes(now); this.match(now); });
          break;
        }
        case 'preview_link':
          correctionMessage=await this.previewDraft(input.article,now);
          break;
        case 'reserve_link':
        case 'cancel_link':
        case 'replace_link':
          correctionMessage=this.storage.transactionSync(()=>this.editLink(input,now));
          if(input.action!=='cancel_link' && typeof ctx?.waitUntil==='function'){
            const refresh=this.lookupDraftTitle(now,input.article).catch(()=>{});
            ctx.waitUntil(refresh);
            await Promise.race([refresh,pause520(700)]);
          }
          break;
        case 'clear_reserved': {
          const ids=input.seqs;
          need520(Array.isArray(ids) && ids.length && ids.every(id=>Number.isSafeInteger(id) && id>0 && id<=999999),'直す作品を一覧から選んでください。');
          const selected=[...new Set(ids)];
          const count=this.storage.transactionSync(()=>{
            let changed=0;
            for(const seq of selected){
              const row=this.one('UPDATE desk_work SET locked=0 WHERE seq=? AND locked=1 AND pub IS NULL AND article IS NULL RETURNING seq',seq);
              if(row)changed++;
            }
            return changed;
          });
          correctionMessage=count+'件の「予約済み」を外しました。';
          if(count<selected.length)correctionMessage+='現在の状態では変更対象外の作品が'+(selected.length-count)+'件あります。';
          break;
        }
        case 'delivery_switch': {
          need520(typeof input.enable==='boolean','運用の指定を確認してください。');
          this.rows('UPDATE desk_delivery SET enabled=? WHERE id=1',Number(input.enable));
          break;
        }
        case 'find_mags': await this.discoverMagazines(now,true); break;
        case 'mag_source': {
          const link=noteLink161(input.url);
          need520(link,'公開マガジンのURLを確認してください。');
          this.rememberMagazine(link,'');break;
        }
        case 'revoke': this.storage.transactionSync(()=>{
          const link=noteLink161(input.url);
          need520(link,'マガジンURLを確認してください。');
          const saved=this.existingMagazine(link);
          const id=link.id, storedUrl=saved?.url||link.url;
          this.rows("INSERT INTO desk_member(id,mode,reason) VALUES(?,'excluded','手動で除外') ON CONFLICT(id) DO UPDATE SET mode='excluded',ticket='',reason=excluded.reason",id);
          if(id)this.rows("UPDATE desk_import SET allowed=0,token='',due=0,state='許可解除',reason='',summary='' WHERE id=?",id);
          this.rows('UPDATE desk_mag SET active=0 WHERE url=?',storedUrl);
          this.rows('UPDATE desk_pick_meta SET rev=rev+1 WHERE id=1');
          this.rows('UPDATE desk_work SET magazine=NULL WHERE magazine=?',storedUrl);
        }); break;
        case 'photo': await this.savePhoto(input,now); break;
        case 'shared':
          need520(input.confirm===true && this.one('SELECT hash FROM desk_photo WHERE hash=?',input.hash),'note側で共有済みを確認してください。');
          this.rows('UPDATE desk_photo SET shared=COALESCE(shared,?) WHERE hash=?',now,input.hash);
          break;
        case 'download': {
          const p=this.one('SELECT jpeg FROM desk_photo WHERE hash=?',input.hash);
          need520(p,'画像がありません。');
          return new Response(p.jpeg,{headers:{'Content-Type':'image/jpeg','Cache-Control':'no-store','Content-Disposition':'attachment; filename="520-gallery.jpg"'}});
        }
        default: throw new Input520('操作を選んでください。');
      }
      const records=this.view(input.action==='status' && Number.isSafeInteger(input.offset) && input.offset>=0?input.offset:0);
      return deskJson({...records,publicationLinks:publicationLinks(records),correctionMessage,recordText:deskRecordText(records)});
    } catch(e) {
      return deskJson({error:e instanceof Input520?e.message:'保存・読み出しを確認できません。管理画面を開き直してください。'},e instanceof Input520?400:503);
    }
  }
  editLink(input,now) {
    const key=input.article;
    need520(typeof key==='string' && /^n[a-z0-9]{1,64}$/.test(key),'下書きの共有用リンクを確認してください。');
    const current=k=>this.one('SELECT scheduled,title,pub FROM desk_link_plan WHERE article=?',k);
    const workFor=k=>this.one('SELECT seq,title,pub,locked,scheduled,paused FROM desk_work_schedule WHERE key=?',k);
    const writable=k=>{
      const w=workFor(k);
      need520(!current(k)?.pub && !w?.pub && !this.publicationSent(k) && !this.one('SELECT 1 FROM desk_archive WHERE article=?',k),'すでに公開済み、または公開操作の結果を確認中です。');
      need520(!w?.locked,'この完成稿は「note側で予約済み」の指定です。訂正する場合は「登録済みの『予約済み』を直す」を開いてください。');
    };
    const remove=k=>{
      const work=workFor(k);
      if(work)this.rows('INSERT INTO desk_draft_identity(seq,article,paused) VALUES(?,?,1) ON CONFLICT(seq) DO UPDATE SET paused=1',work.seq,k);
      this.rows('DELETE FROM desk_link_plan WHERE article=?',k);
      this.rows("DELETE FROM desk_job WHERE kind='publish' AND phase='wait' AND (subject=? OR subject=?)",k,String(work?.seq??''));
    };
    writable(key);
    const previous=k=>{
      const p=current(k);if(p)return p;
      const w=workFor(k);return w && !w.paused && w.scheduled?w:null;
    };
    const old=previous(key);
    if(input.action==='cancel_link'){
      need520(old,'このリンクの予定はありません。');
      need520(workFor(key) || !this.one('SELECT 1 FROM desk_work_schedule WHERE key IS NULL AND pub IS NULL AND scheduled=? LIMIT 1',old.scheduled),'同じ日時の完成稿と下書きを照合中です。照合後に取り消せます。');
      if(input.expected!==undefined)need520(old.scheduled===input.expected,'予定が変更されています。最新の一覧を開いてください。');
      remove(key);
      return 'このリンクの公開予定を取り消しました。noteにある下書きは残っています。';
    }
    if(typeof input.t==='string')input.t=input.t.replace(/^(\d{2}:\d{2}):00$/,'$1');
    need520(date520(input.d) && typeof input.t==='string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(input.t),'公開日と時刻を日本時間で入力してください。');
    const at=Date.parse(input.d+'T'+input.t+':00+09:00');
    need520(at>now,'これからの公開日時を選んでください。');
    let replaced=false;
    if(input.action==='replace_link'){
      const source=input.original;
      need520(/^n[a-z0-9]{1,64}$/.test(source||'') && previous(source)?.scheduled===input.expected,'元の予定が変更されています。「記録を開く」で最新の予約を確認してください。');
      writable(source);
      if(source!==key){
        need520(!old,'新しい下書きにはすでに別の予約があります。その作品の予約から日時を変更してください。');
        const unresolved=this.one("SELECT 1 FROM desk_work_schedule WHERE key IS NULL AND pub IS NULL AND scheduled=? LIMIT 1",input.expected);
        need520(!unresolved || workFor(source),'同じ時刻の完成稿と元の下書きを照合中です。作品名とリンクの確認後に差し替えられます。');
        remove(source);replaced=true;
      }
    }
    const taken=this.one('SELECT article FROM desk_link_plan WHERE scheduled=? AND article<>? AND pub IS NULL LIMIT 1',at,key) ||
      this.one('SELECT 1 FROM desk_work_schedule WHERE scheduled=? AND key<>? AND pub IS NULL AND paused=0 LIMIT 1',at,key);
    need520(!taken || old?.scheduled===at,'この日時には別の下書きの予約があります。予約一覧で元の作品の「この予約を変更」を押すと差し替えられます。');
    const paired=workFor(key);
    this.rows('INSERT INTO desk_link_plan(article,scheduled) VALUES(?,?) ON CONFLICT(article) DO UPDATE SET scheduled=excluded.scheduled',key,at);
    if(paired)this.rows('UPDATE desk_draft_identity SET paused=0 WHERE seq=?',paired.seq);
    if(!old || old.scheduled!==at)this.rows("DELETE FROM desk_job WHERE kind='publish' AND phase='wait' AND (subject=? OR subject=?)",key,String(paired?.seq??''));
    const msg=replaced?'下書きを差し替えました。':!old?'公開予定を保存しました。':old.scheduled===at?'同じ下書き・同じ日時をすでに登録しています。':'公開予定を '+time(old.scheduled)+' から変更しました。';
    return msg+time(at)+'（日本時間） ／ '+(old?.title||paired?.title||'記事ID '+key)+
      (this.one('SELECT enabled FROM desk_delivery WHERE id=1').enabled && this.one('SELECT enabled FROM desk_cfg WHERE id=1').enabled?'':' ／ 現在は休止中です。自動公開の設定を確認してください。');
  }
  publicationSent(key) {
    return !!this.one("SELECT 1 FROM desk_job WHERE kind='publish' AND target=? AND phase IN ('sent','seen','confirmed') LIMIT 1",key);
  }
  addWork(w) {
    need520(w && Number.isSafeInteger(w.seq) && w.seq>0 && w.seq<=999999 && text520(w.title,300) && w.title.trim()!=='521' && text520(w.body,240000),'順番・タイトル・完成稿を確認してください。固定記事「521」は登録できません。');
    need520(date520(w.d) && typeof w.t==='string' && (w.t==='' || /^([01]\d|2[0-3]):[0-5]\d$/.test(w.t)),'公開日と日本時間の時刻を確認してください。');
    need520(typeof w.locked==='boolean' && typeof w.draft==='string' && (!w.draft || /^n[a-z0-9]{1,60}$/.test(w.draft)) && genre520.includes(w.genre) && method520.includes(w.method),'予約済み・記事ID・ジャンル・制作方法を確認してください。');

    const keys=['seq','title','body','d','t','draft','locked','genre','method'];
    const a={...w,locked:Number(w.locked)};
    const old=this.one('SELECT * FROM desk_work WHERE seq=?',w.seq);
    if(old) { need520(same520(old,a,keys),'その順番に別の登録があります。登録済みの完成稿は保持しました。'); return; }
    need520(!this.one("SELECT seq FROM desk_work WHERE (d=? AND title=?) OR (draft<>'' AND draft=?) LIMIT 1",w.d,w.title,w.draft),'同じ作品が登録済みです。');
    if(w.draft)need520(!this.one('SELECT 1 FROM desk_draft_identity WHERE article=? AND seq<>?',w.draft,w.seq),'この下書きは別の完成稿に対応しています。');
    this.rows('INSERT INTO desk_work(seq,title,body,d,t,draft,locked,genre,method,chars) VALUES(?,?,?,?,?,?,?,?,?,?)',...keys.map(k=>a[k]),[...w.body.replace(/\r\n|[\r\n]/g,'')].length);
    this.linkObserved(w);
    this.rows('UPDATE desk_archive SET pick_due=0 WHERE article=(SELECT article FROM desk_work WHERE seq=?)',w.seq);
    // A new fixed time on this date can constrain a previous tentative time.
    if(w.t) this.rows("UPDATE desk_work SET suggested=NULL WHERE d=? AND pub IS NULL AND locked=0 AND ((seq<? AND suggested>?) OR (seq>? AND suggested<?))",w.d,w.seq,w.t,w.seq,w.t);
  }
  planTimes(now) {
    const works=this.rows("SELECT seq,d,genre FROM desk_work WHERE t='' AND locked=0 AND pub IS NULL AND suggested IS NULL AND d>=? ORDER BY seq",jstDay(now));
    const deltas=new Map();
    for(const w of works) {
      const samples=this.rows('SELECT w.pub,s.value FROM desk_entries w JOIN desk_sample s ON s.seq=w.seq AND s.age=7 WHERE w.genre=? AND s.value IS NOT NULL AND w.pub>=? AND w.pub<? ORDER BY w.pub DESC LIMIT 200',w.genre,now-365*D520,now);
      const followers=new Map(), bins=new Map(),dow=t=>new Date(t+9*HOUR).getUTCDay(),weekend=t=>[0,6].includes(dow(t));
      for(const p of samples) {
        if(weekend(p.pub)!==weekend(jstStart(w.d))) continue;
        const h=new Date(p.pub+9*HOUR).getUTCHours();
        if(!bins.has(h)) bins.set(h,[]);
        bins.get(h).push(p.value);

      }
      const scores=[...bins].filter(([,v])=>v.length>=3).map(([h,v])=>[h,median520(v)]).sort((a,b)=>b[1]-a[1]||a[0]-b[0]);
      if(scores.length<2 || scores[0][1]===scores[1][1]) continue;
      const winner=bins.get(scores[0][0]);
      if(median520(winner.slice(0,-1))<=scores[1][1]) continue;
      // A slower follower week can veto a time suggestion only with replicated, comparable observations.
      const hours=new Set(scores.map(x=>x[0]));
      for(const p of samples){
        const h=new Date(p.pub+9*HOUR).getUTCHours();
        if(!hours.has(h) || weekend(p.pub)!==weekend(jstStart(w.d)))continue;
        if(!deltas.has(p.pub))deltas.set(p.pub,this.followerWindow(p.pub));
        const delta=deltas.get(p.pub);
        if(delta!==null){if(!followers.has(h))followers.set(h,[]);followers.get(h).push(delta);}
      }
      const hourlyFollowers=followers.get(scores[0][0])||[];
      if(hourlyFollowers.length>=3 && scores.slice(1).some(([hour])=>{
        const other=followers.get(hour)||[];
        return other.length>=3 && median520(other)>median520(hourlyFollowers);
      }))continue;
      const t=String(scores[0][0]).padStart(2,'0')+':00';
      if(jstStart(w.d)+scores[0][0]*HOUR<=now) continue;
      if(!this.one("SELECT seq FROM desk_work WHERE d=? AND ((seq<? AND COALESCE(NULLIF(t,''),suggested)>?) OR (seq>? AND COALESCE(NULLIF(t,''),suggested)<?)) LIMIT 1",w.d,w.seq,t,w.seq,t))
        this.rows('UPDATE desk_work SET suggested=? WHERE seq=? AND suggested IS NULL',t,w.seq);
    }
  }
  async savePhoto(p,now) {
    need520(p.allowed===true && text520(p.caption,100) && typeof p.jpeg==='string' && p.jpeg.length<=1500000,'自作・共有可の写真と短い説明を確認してください。');
    let bytes;
    try { bytes=Uint8Array.from(atob(p.jpeg),c=>c.charCodeAt(0)); } catch {}
    need520(bytes && bytes.length>20,'JPEGを読み込めません。');
    bytes=cleanJpeg520(bytes);
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
    this.rows('INSERT OR IGNORE INTO desk_photo(hash,jpeg,caption,added) VALUES(?,?,?,?)',digest,bytes.buffer,p.caption,now);
  }
  scheduleRecords(){
    return {linkPlans:this.rows("SELECT l.article,COALESCE(l.title,(SELECT title FROM desk_work WHERE draft=l.article AND draft<>'')) title,l.scheduled,l.pub,l.result,p.confirmed,j.phase,j.message FROM desk_link_plan l LEFT JOIN desk_snapshot p ON p.article=l.article LEFT JOIN desk_job j ON j.kind='publish' AND j.subject=l.article ORDER BY l.scheduled"),
      works:this.rows('SELECT w.seq,w.title,w.d,w.t,w.locked,w.genre,w.chars,w.suggested,w.key AS draft,w.paused,w.link_at,w.article,w.pub,c.article AS attemptedArticle,c.result AS coverResult,p.confirmed,m.url magurl,m.name AS magazine FROM desk_work_schedule w LEFT JOIN desk_work_cover c ON c.seq=w.seq LEFT JOIN desk_snapshot p ON p.article=c.article LEFT JOIN desk_mag m ON m.url=w.magazine ORDER BY w.seq')};
  }
  view(offset=0) {
    const schedules=this.scheduleRecords();
    const cfg=this.one('SELECT enabled,plan,rss_ok,rss_msg,tick_at,started,blocked FROM desk_cfg WHERE id=1');
    const eligible=this.eligibleMags(Date.now());
    const urls=new Set(eligible.map(m=>m.url));
    const now=Date.now();
    const backlist=this.one(`SELECT COUNT(*) sampled,COUNT(CASE WHEN likes>previous THEN 1 END) rising,
      SUM(likes-previous) net FROM desk_archive WHERE prior_at IS NOT NULL AND at>=? AND at<=?
      AND at-prior_at BETWEEN ? AND ? AND pub<=prior_at-? AND likes IS NOT NULL AND previous IS NOT NULL`,
      now-7*D520,now,6*D520,8*D520,30*D520);
    return {cfg,backlist,scout:{total:this.one('SELECT COUNT(*) n FROM desk_import').n,allowed:eligible.length,message:this.one('SELECT message FROM desk_scout_state WHERE id=1').message},linkPlans:schedules.linkPlans,deliveryOn:this.one('SELECT enabled FROM desk_delivery WHERE id=1').enabled,delivery:this.rows('SELECT kind,label,phase,at,message FROM desk_job ORDER BY at DESC LIMIT 24'),recommendation:this.one('SELECT checked,message FROM desk_recommend WHERE id=1'),archive:this.archivePage(offset,Date.now()),growth:this.growthView(),directory:this.one('SELECT message FROM desk_directory WHERE id=1'),
      imports:this.rows(`SELECT i.id,i.url,i.name,i.allowed,i.rules,i.state,i.reason,m.mode,m.reason memberReason FROM desk_import i LEFT JOIN desk_member m ON m.id=i.id WHERE i.allowed=1 OR m.mode='excluded' OR NOT EXISTS(SELECT 1 FROM desk_scout_mag sm WHERE sm.id=i.id)
        OR i.id IN (SELECT id FROM desk_scout_mag ORDER BY id LIMIT 80) ORDER BY i.allowed DESC,i.name,i.id`),probe:this.one('SELECT at,rss,creator,article FROM desk_probe WHERE id=1'),works:schedules.works.map(w=>({...w,magazine:urls.has(w.magurl)?w.magazine:null})),
      placements:this.rows('SELECT seq,name,observed FROM desk_placement ORDER BY seq,name'),
      samples:this.rows('SELECT w.seq,s.age,s.due,s.value,s.at,s.state FROM desk_work w LEFT JOIN desk_release r ON r.article=w.article JOIN desk_sample s ON s.seq=COALESCE(-r.id,w.seq) ORDER BY w.seq,s.age'),
      followers:this.rows('SELECT * FROM desk_follower ORDER BY d DESC LIMIT 60'),
      weeks:this.rows('SELECT * FROM desk_week ORDER BY start DESC LIMIT 104'),
      mags:eligible.map(({url,name,recent})=>({url,name,recent})),
      photos:this.rows('SELECT hash,caption,added,shared FROM desk_photo ORDER BY added DESC').map(p=>({...p,keywords:photoKeywords162(p.caption)}))};
  }
  publicRead(path,format) {
    const pendingKey=format+' '+path;
    const existing=this.pendingReads.get(pendingKey);
    if(existing) return existing;
    const task=this.fetchPublic(path,format).finally(()=>this.pendingReads.delete(pendingKey));
    this.pendingReads.set(pendingKey,task);
    return task;
  }
  async fetchPublic(path,format) {
    const now=Date.now();
    if(this.one('SELECT blocked FROM desk_cfg WHERE id=1').blocked>now) throw new PublicReadError('note指定の待機中');
    const canRedirect=format==='html' || format==='channel' || format==='issue' || (format==='rss' && !!noteLink161(path.replace(/\/rss$/,'')));
    let res,target=path;
    for(let n=0;n<3;n++) {
      try {
        res=await fetch(target,{method:'GET',redirect:'manual',cache:'no-store',headers:{Accept:format==='json'?'application/json':format==='html'?'text/html':'application/rss+xml, application/xml, text/xml'},signal:AbortSignal.timeout(7500)});
      } catch(error) {
        const timeout=['AbortError','TimeoutError'].includes(error?.name);
        throw new PublicReadError(timeout?'noteへの通信がタイムアウト':'noteから応答を受け取れません');
      }
      if(![301,302,303,307,308].includes(res.status))break;
      const location=res.headers.get('Location');
      const next=canRedirect && location && directoryRedirect161(target,location);
      await res.body?.cancel();
      if(!next || next===target || n===2)throw new PublicReadError('転送先を確認できません（HTTP '+res.status+'）');
      target=next;
    }
    if(!res.ok) {
      const raw=res.headers.get('Retry-After');
      let hold=raw && (/^\d+$/.test(raw)?now+Number(raw)*1000:Date.parse(raw));
      if(res.status===429 || hold>now) {
        if(!Number.isSafeInteger(hold) || hold<=now) hold=now+HOUR;
        this.rows('UPDATE desk_cfg SET blocked=MAX(blocked,?) WHERE id=1',hold);
      }
      await res.body?.cancel(); throw new PublicReadError('note応答 HTTP '+res.status);
    }
    let body;
    try {body=await read520body(res,3000000);}
    catch {throw new PublicReadError('応答本文を読み取れません（空・サイズ・通信を確認）');}
    if(format==='html')return body;
    try {return format==='json'?JSON.parse(body):rss520(body,format==='issue'?'issue':format==='channel');}
    catch {throw new PublicReadError(format==='json'?'応答がJSON形式ではありません':'RSSの形式を読み取れません');}
  }
  async probe(now) {
    const old=this.one('SELECT * FROM desk_probe WHERE id=1');
    if(this.one('SELECT blocked FROM desk_cfg WHERE id=1').blocked>now)return;
    const legacy='未確認・公開情報を取得できません';
    const verified=[old.rss,old.creator,old.article];
    if(old.at && (verified.every(x=>x==='取得可') || (!verified.includes(legacy) && now-old.at<HOUR)))return;
    this.rows('UPDATE desk_probe SET at=? WHERE id=1',now);
    const mismatch='対象アカウントまたは数値の項目を確認できません';
    const creator=async()=>{
      try { const d=(await this.publicRead('https://note.com/api/v2/creators/43__','json'))?.data;
        return d?.urlname==='43__' && count520(d,['followerCount','follower_count'])!==null?'取得可':mismatch;
      } catch(error) { return publicReadReason(error); }
    };
    const feed=async()=>{
      let items;
      try { items=await this.publicRead('https://note.com/43__/rss','rss'); } catch(error) { return [publicReadReason(error),'未実施（RSS取得後に確認）']; }
      const e=items.find(v=>v.title.trim()!=='521' && publicKey520(v.link));
      if(!e) return ['取得可','確認用の公開作品なし'];
      const key=publicKey520(e.link);
      try {
        const d=(await this.publicRead('https://note.com/api/v3/notes/'+key,'json'))?.data;
        return ['取得可',d?.key===key && d?.user?.urlname==='43__' && count520(d,['likeCount','like_count'])!==null?'取得可':mismatch];
      } catch(error) { return ['取得可',publicReadReason(error)]; }
    };
    const [c,[rss,a]]=await Promise.all([creator(),feed()]);
    this.rows('UPDATE desk_probe SET rss=?,creator=?,article=? WHERE id=1',rss,c,a);
  }
  registerEntries(entries,now,alreadyStored=false) {
    const since=this.one('SELECT started FROM desk_growth WHERE id=1').started;
    let newDue=false;
    const changedWeeks=new Set();
    if(!alreadyStored)entries=entries.filter(e=>this.rememberPublic(e.key,e.title,e.pub));
    for(const e of entries) {
      this.rows("UPDATE desk_link_plan SET pub=COALESCE(pub,?),title=? WHERE article=? AND (pub IS NULL OR title<>?)",e.pub,e.title,e.key,e.title);
      this.rows("UPDATE desk_job SET phase='confirmed',at=?,message='520の公開記事を確認済み' WHERE kind='publish' AND target=? AND label=? AND phase='sent'",now,e.key,e.title);
      const w=this.one('SELECT w.seq,w.draft FROM desk_work_cover c JOIN desk_work w ON w.seq=c.seq WHERE c.article=? AND w.pub IS NULL',e.key) ||
        this.one("SELECT seq,key AS draft FROM desk_work_schedule WHERE pub IS NULL AND title=? AND (key=? OR (key IS NULL AND d=?)) ORDER BY (key=?) DESC LIMIT 1",e.title,e.key,jstDay(e.pub),e.key);
      const midnight=jstStart(jstDay(e.pub));
      const ambiguous=w && !w.draft && this.one('SELECT 1 FROM desk_archive WHERE title=? AND pub>=? AND pub<? AND article<>? LIMIT 1',e.title,midnight,midnight+D520,e.key);
      const linked=this.one('SELECT seq,pub FROM desk_work WHERE article=?',e.key);
      if(linked)continue;
      const planned=w && !ambiguous;
      let observed=this.one('SELECT id,pub FROM desk_release WHERE article=?',e.key);
      if(!planned && (observed || e.pub<since))continue;
      if(planned)this.rows('UPDATE desk_work SET article=?,pub=? WHERE seq=? AND pub IS NULL',e.key,observed?.pub??e.pub,w.seq);
      else {
        this.rows('INSERT INTO desk_release(article,title,pub) VALUES(?,?,?)',e.key,e.title,e.pub);
        observed=this.one('SELECT id,pub FROM desk_release WHERE article=?',e.key);
      }
      const seq=observed?-observed.id:w.seq, published=observed?.pub??e.pub;
      changedWeeks.add(monday520(published));
      for(const n of [1,7]) {
        const due=published+n*D520;
        this.rows('INSERT OR IGNORE INTO desk_sample(seq,age,due) VALUES(?,?,?)',seq,n,due);
        if(due<=now && now<due+WINDOW520) newDue=true;
      }
    }
    for(const start of changedWeeks) {
      if(this.one('SELECT start FROM desk_week WHERE start=?',jstDay(start))) this.writeWeek(start,Date.now());
    }
    return newDue;
  }
  async feed(now) {
    const cfg=this.one('SELECT rss_at,rss_msg,blocked FROM desk_cfg WHERE id=1');
    if(cfg.blocked>now || (now<cfg.rss_at && cfg.rss_msg!=='取得失敗・再確認待ち')) return;
    this.rows('UPDATE desk_cfg SET rss_at=? WHERE id=1',now+16*M520);
    try {
      let newDue=false;
      const items=await this.publicRead('https://note.com/43__/rss','rss');
      const entries=items.map(r=>({title:r.title,key:publicKey520(r.link),pub:Date.parse(r.pubdate)})).filter(i=>i.key && Number.isFinite(i.pub) && i.pub>0 && i.pub<=Date.now() && i.title.trim()!=='521');
      this.storage.transactionSync(()=>{
        newDue=this.registerEntries(entries,now);
        this.rows("UPDATE desk_cfg SET rss_ok=?,rss_msg='取得済み' WHERE id=1",Date.now());
      });
      return newDue;
    } catch(error) { this.rows('UPDATE desk_cfg SET rss_msg=? WHERE id=1','再確認待ち：'+publicReadReason(error)); }
  }
  async followers(now) {
    const d=jstDay(now), target=jstStart(d)+12*HOUR;
    if(now<target) return;
    const row=this.one('SELECT state FROM desk_follower WHERE d=?',d);
    if(row && row.state!=='再確認待ち') return;
    let value=null,at=null;
    if(now<target+WINDOW520) {
      try {
        const data=(await this.publicRead('https://note.com/api/v2/creators/43__','json'))?.data;
        if(data?.urlname==='43__') value=count520(data,['followerCount','follower_count']);
        at=Date.now();
      } catch {}
    }
    const expired=Date.now()>=target+WINDOW520;
    if(expired) value=null;
    const state=value!==null?'記録済み':expired?'欠測':'再確認待ち';
    this.rows('INSERT INTO desk_follower(d,value,at,state) VALUES(?,?,?,?) ON CONFLICT(d) DO UPDATE SET value=excluded.value,at=excluded.at,state=excluded.state',d,value,value===null?null:at,state);
  }
  async measure(now) {
    this.rows("UPDATE desk_sample SET state='欠測' WHERE state='待機' AND due<=?",now-WINDOW520);
    const due=this.rows("SELECT s.seq,s.age,s.due,w.article FROM desk_sample s JOIN desk_entries w ON w.seq=s.seq WHERE s.state='待機' AND s.due<=? AND s.last_try<=? ORDER BY s.last_try,s.due,s.seq LIMIT 8",now,now-2*M520);
    // Independent public reads in small batches; leave capacity for the existing watchdog.
    for(let i=0;i<due.length;i+=4) {
      await Promise.all(due.slice(i,i+4).map(async s=>{
        this.rows('UPDATE desk_sample SET last_try=? WHERE seq=? AND age=?',now,s.seq,s.age);
        try {
          const data=(await this.publicRead('https://note.com/api/v3/notes/'+s.article,'json'))?.data;
          if(data?.key!==s.article || data?.user?.urlname!=='43__') return;
          this.magazineHints(data);
          const n=count520(data,['likeCount','like_count']),at=Date.now();
          if(n!==null && at<s.due+WINDOW520) this.rows("UPDATE desk_sample SET value=?,at=?,state='記録済み' WHERE seq=? AND age=? AND state='待機'",n,at,s.seq,s.age);
        } catch {}
      }));
    }
  }
  initGrowth(now) {
    this.storage.transactionSync(()=>{
      for(const q of growthSchema162)this.rows(q);
      this.rows('INSERT OR IGNORE INTO desk_growth(id,started) VALUES(1,?)',now);
      this.rows('UPDATE desk_cfg SET enabled=1,started=COALESCE(started,?),weekly_at=COALESCE(weekly_at,?) WHERE id=1',now,monday520(now));
      this.rows('UPDATE desk_directory SET enabled=1 WHERE id=1');
      this.rows(`INSERT OR IGNORE INTO desk_member(id,mode,reason) SELECT id,
        CASE WHEN state='許可解除' THEN 'excluded' WHEN allowed=1 THEN 'legacy' ELSE 'check' END,
        CASE WHEN state='許可解除' THEN '以前の除外を保持' WHEN allowed=1 THEN '以前の参加確認を保持' ELSE '運営資格を確認待ち' END FROM desk_import`);
      for(const m of this.rows('SELECT url,active FROM desk_mag')){
        const link=noteLink161(m.url);
        if(!link)continue;
        this.rows('INSERT OR IGNORE INTO desk_member(id,mode,reason) VALUES(?,?,?)',link.id,m.active?'legacy':'excluded',m.active?'以前の登録を保持':'以前の除外を保持');
        if(!m.active && !this.one('SELECT id FROM desk_import WHERE id=? AND managed=1 AND allowed=1',link.id))
          this.rows("UPDATE desk_member SET mode='excluded',reason='以前の除外を保持' WHERE id=?",link.id);
        if(m.active || this.one("SELECT id FROM desk_member WHERE id=? AND mode='legacy'",link.id)){
          this.rows("INSERT OR IGNORE INTO desk_import(id,url,name) SELECT ?,url,name FROM desk_mag WHERE url=?",link.id,m.url);
        }
      }
      this.rows("UPDATE desk_member SET mode='check',reason='現在の運営資格を確認待ち' WHERE mode='legacy'");
      this.rows("UPDATE desk_import SET allowed=0,token='',due=0 WHERE id IN (SELECT id FROM desk_member WHERE mode='check')");
      this.rows("UPDATE desk_work SET magazine=NULL WHERE magazine IS NOT NULL");
    });
  }
  clearAutoMag(row,reason) {
    this.rows("UPDATE desk_import SET allowed=0,token='',state='自動確認待ち',reason=? WHERE id=?",reason,row.id);
    const old=this.existingMagazine(noteLink161(row.url));
    if(old){
      if(old.active)this.rows('UPDATE desk_pick_meta SET rev=rev+1 WHERE id=1');
      this.rows('UPDATE desk_mag SET active=0 WHERE url=?',old.url);
      this.rows('UPDATE desk_work SET magazine=NULL WHERE magazine=?',old.url);
    }
  }
  async checkEditorial(row,now) {
    const ticket=crypto.randomUUID(),link=noteLink161(row.url);
    this.rows("UPDATE desk_member SET ticket=?,due=? WHERE id=? AND mode IN ('check','auto')",ticket,now+2*M520,row.id);
    let evidence;
    try{
      const [api,page]=await Promise.allSettled([
        this.publicRead('https://note.com/api/v1/magazines/'+link.id,'json'),
        this.publicRead(link.url,'html')
      ]);
      evidence=editorialProof162(link,api.value,page.value||'');
    }catch{evidence={ok:false,reason:'運営資格の読み取りを再試行します'};}
    this.storage.transactionSync(()=>{
      if(!this.one("SELECT id FROM desk_member WHERE id=? AND ticket=? AND mode IN ('check','auto')",row.id,ticket))return;
      this.rows("UPDATE desk_member SET mode=?,due=?,checked=?,reason=?,ticket='' WHERE id=?",evidence.ok?'auto':'check',now+(!evidence.ok && this.one('SELECT id FROM desk_scout_mag WHERE id=?',row.id)?14*D520:D520),now,evidence.reason,row.id);
      if(evidence.ok){
        this.rows("UPDATE desk_import SET allowed=1,state=CASE WHEN allowed=1 THEN state ELSE '募集条件を確認待ち' END,due=CASE WHEN allowed=1 THEN due ELSE 0 END WHERE id=?",row.id);
      }else this.clearAutoMag(row,evidence.reason);
    });
  }
  async readIssue(url) {
    const issue=await this.publicRead(url+'/rss','issue');
    if(noteLink161(issue.header.link)?.id!==noteLink161(url)?.id)throw Error('unverified magazine feed');
    return issue.entries;
  }
  recordReferences(items,link,name,now) {
    for(const e of items) {
      if(e.title.trim()==='521')continue;
      const key=publicKey520(e.link);
      if(!key)continue;
      this.rows('INSERT OR IGNORE INTO desk_ref(article,id,name,url,observed) VALUES(?,?,?,?,?)',key,link.id,name||link.id,link.url,now);
      this.rows("UPDATE desk_job SET phase='confirmed',at=?,message='誌面のRSSで掲載を確認済み' WHERE kind='mag' AND subject=? AND target=? AND phase IN ('sent','seen')",now,key,link.id);
    }
  }
  magazineHints(data) {
    if(!Array.isArray(data.magazines))return;
    for(const m of data.magazines.slice(0,12)){
      const link=noteLink161(m?.magazineUrl||m?.magazine_url||m?.url||
        (/^m[a-z0-9]{1,64}$/.test(m?.key||'')?'https://note.com/m/'+m.key:''));
      if(link)this.rememberMagazine(link,typeof m?.name==='string'?m.name:'');
    }
  }
  async automaticDirectory(now) {
    const expired=this.rows("SELECT i.id,i.url,i.managed FROM desk_member m JOIN desk_import i ON i.id=m.id WHERE m.mode='auto' AND m.checked<=?",now-2*D520);
    if(expired.length)this.storage.transactionSync(()=>{
      for(const row of expired){
        this.rows("UPDATE desk_member SET mode='check',ticket='',due=0,reason='運営資格の再確認待ち' WHERE id=?",row.id);
        this.clearAutoMag(row,'運営資格の再確認待ち');
      }
    });
    if(this.one('SELECT blocked FROM desk_cfg WHERE id=1').blocked>now)return;
    const cfg=this.one('SELECT enabled,due FROM desk_directory WHERE id=1');
    if(cfg.enabled && cfg.due<=now){await this.discoverMagazines(now);return;}
    const inspect=this.one("SELECT i.id,i.url,i.managed,i.name,sc.id AS scouted FROM desk_member m JOIN desk_import i ON i.id=m.id LEFT JOIN desk_scout_mag sc ON sc.id=m.id WHERE m.mode IN ('check','auto') AND m.due<=? ORDER BY (m.mode='auto') DESC,(sc.id IS NOT NULL),m.due,m.id LIMIT 1",now);
    const rule=this.one('SELECT id,due FROM desk_import WHERE allowed=1 AND due<=? ORDER BY due,id LIMIT 1',now);
    // Alternate when both queues are non-empty; large public lists cannot starve rule updates.
    if(inspect && (!rule || (!inspect.scouted && (Math.floor(now/(4*M520))%2)===0))){
      await this.checkEditorial(inspect,now);
      // An observed issue is evidence of publication, independently of 520's editorial rights.
      try{
        const items=await this.readIssue(inspect.url);
        this.recordReferences(items,noteLink161(inspect.url),inspect.name,Date.now());
      }catch{}
    }else if(rule)await this.reviewMagazine(rule.id,now);
  }
  linkObserved(work) {
    const start=jstStart(work.d);
    const matches=work.draft?this.rows('SELECT article,pub FROM desk_release WHERE article=? AND title=?',work.draft,work.title):
      this.rows('SELECT article,pub FROM desk_release WHERE title=? AND pub>=? AND pub<? LIMIT 2',work.title,start,start+D520);
    if(matches.length!==1 || (!work.draft && this.one('SELECT 1 FROM desk_archive WHERE title=? AND pub>=? AND pub<? AND article<>? LIMIT 1',work.title,start,start+D520,matches[0].article)))return;
    const e=matches[0];
    this.rows('UPDATE desk_work SET article=?,pub=? WHERE seq=? AND pub IS NULL AND NOT EXISTS(SELECT 1 FROM desk_work WHERE article=?)',e.article,e.pub,work.seq,e.article);
  }
  followerWindow(pub) {
    const d=jstDay(pub);
    const first=this.one('SELECT d,at,value FROM desk_follower WHERE d BETWEEN ? AND ? AND at<=? AND value IS NOT NULL ORDER BY d DESC LIMIT 1',jstDay(pub-D520),d,pub);
    if(!first)return null;
    const next=this.one('SELECT at,value FROM desk_follower WHERE d=? AND at>? AND value IS NOT NULL',jstDay(jstStart(first.d)+D520),pub);
    if(!next)return null;
    const n=this.one('SELECT COUNT(*) n FROM desk_entries WHERE pub>=? AND pub<?',first.at,next.at).n;
    return n===1?next.value-first.value:null;
  }
  strongestMagazine(valid,genre) {
    if(valid.length<2)return null;
    const scored=[];
    for(const m of valid){
      const id=noteLink161(m.url)?.id;
      if(!id)continue;
      const values=this.rows(`SELECT s.value FROM desk_ref r JOIN desk_entries e ON e.article=r.article JOIN desk_sample s ON s.seq=e.seq AND s.age=7
        WHERE r.id=? AND e.genre=? AND s.value IS NOT NULL AND r.observed<=s.due AND e.pub>=? ORDER BY e.pub DESC LIMIT 40`,id,genre,Date.now()-365*D520).map(r=>r.value);
      if(values.length<3)return null;
      const median=median520(values);scored.push({mag:m,median,withoutTop:median520(values.slice(0,-1))});
    }
    scored.sort((a,b)=>b.median-a.median);
    return scored.length>=2 && scored[0].withoutTop>scored[1].median?scored[0].mag:null;
  }
  growthView() {
    const observed=this.rows(`SELECT e.title,e.pub,e.article,a.value d1,b.value d7,a.state state1,b.state state7 FROM desk_entries e
      LEFT JOIN desk_sample a ON a.seq=e.seq AND a.age=1 LEFT JOIN desk_sample b ON b.seq=e.seq AND b.age=7 ORDER BY e.pub DESC LIMIT 60`);
    const references=this.rows('SELECT e.title,r.name,r.observed FROM desk_ref r JOIN desk_entries e ON e.article=r.article ORDER BY r.observed DESC LIMIT 40');
    return {observed,references};
  }

  existingMagazine(link) {
    return this.one("SELECT * FROM desk_mag WHERE url=? OR url LIKE ? ORDER BY active DESC LIMIT 1",link.url,'%/m/'+link.id);
  }
  rememberPublic(key,title,pub) {
    if(!/^n[a-z0-9]{1,64}$/.test(key) || !text520(title,300) || title.trim()==='521' || !Number.isFinite(pub) || pub<=0 || pub>Date.now())return false;
    this.rows('INSERT OR IGNORE INTO desk_archive(article,title,pub) VALUES(?,?,?)',key,title,pub);
    // Recently published at upgrade: capture a still-open target, never invent a prior count.
    const now=Date.now();
    if(pub+7*D520+WINDOW520>now && pub<this.one('SELECT started FROM desk_growth WHERE id=1').started){
      const linked=this.one('SELECT seq FROM desk_work WHERE article=?',key);
      if(!linked)this.rows('INSERT OR IGNORE INTO desk_release(article,title,pub) VALUES(?,?,?)',key,title,pub);
      const release=this.one('SELECT id FROM desk_release WHERE article=?',key);
      const seq=release?-release.id:linked.seq;
      for(const age of [1,7]){
        const due=pub+age*D520;
        this.rows("INSERT OR IGNORE INTO desk_sample(seq,age,due,state) VALUES(?,?,?,?)",seq,age,due,due+WINDOW520<=now?'欠測':'待機');
      }
    }
    return true;
  }
  async catalogue(now) {
    const cursor=this.one('SELECT * FROM desk_catalog WHERE id=1');
    const oldFailure=cursor.message===cursor.page+'ページ目を取得できません。RSSと公開ページで確認できる作品を引き続き収集します。';
    if((cursor.due>now && !oldFailure) || this.one('SELECT blocked FROM desk_cfg WHERE id=1').blocked>now)return;
    const page=cursor.page;
    try {
      const data=(await this.publicRead('https://note.com/api/v2/creators/43__/contents?kind=note&page='+page,'json'))?.data;
      const items=data?.contents;
      if(!Array.isArray(items) || items.length>100)throw new PublicReadError('記事一覧の項目を確認できません');
      const knownPage=data.page??data.currentPage;
      if(knownPage!=null && Number(knownPage)!==page)throw new PublicReadError('記事一覧のページ番号が一致しません');
      const rawLast=data.isLastPage??data.is_last_page;
      const keys=items.map(n=>n?.key).filter(k=>typeof k==='string');
      const signature=keys.join(',');
      if(page>1 && signature && signature===cursor.signature)throw new PublicReadError('同じページが繰り返されました');
      const confirmedEntries=[];
      let partial=false,newDue=false;
      this.storage.transactionSync(()=>{
        for(const n of items){
          if(!n || (n.user?.urlname ? n.user.urlname!=='43__' : publicKey520(String(n.noteUrl||n.note_url||''))!==n.key)){partial=true;continue;}
          if(n.status && n.status!=='published')continue;
          if(n.type && n.type!=='TextNote' && n.type!=='text')continue;
          if(n.name?.trim()==='521')continue;
          if(!this.rememberPublic(n.key,n.name,Date.parse(n.publishAt||n.publish_at||n.publishedAt)))partial=true;
          else { this.magazineHints(n);if(isPublishedBy520(n)) confirmedEntries.push(publicEntry520(n)); }
        }
        newDue=this.registerEntries(confirmedEntries,now,true);
        const incomplete=!!(page>1 && cursor.partial) || partial;
        const more=rawLast===false && keys.length>0;
        const confirmed=rawLast===true && !incomplete;
        const message=more?page+'ページまで確認・次のページを自動取得':confirmed?'公開一覧の最終ページまで確認':'一部のみ確認・全件か未確認';
        this.rows('UPDATE desk_catalog SET page=?,due=?,signature=?,partial=?,message=? WHERE id=1',more?page+1:1,now+(more?4*M520:confirmed?7*D520:D520),more?signature:'',more?Number(incomplete):0,message);
      });
      if(newDue)await this.measure(Date.now());
      if(partial || typeof rawLast!=='boolean')await this.archiveLinks(now);
    } catch(error) {
      this.rows('UPDATE desk_catalog SET due=?,message=? WHERE id=1',now+HOUR,page+'ページ目を取得できません（'+publicReadReason(error)+'）。RSSと公開ページでも作品を確認します。');
      await this.archiveLinks(now);
    }
  }
  async archiveLinks(now){
    const c=this.one('SELECT page,due FROM desk_public_pages WHERE id=1');
    if(c.due>now)return;
    const profile='https://note.com/43__',url=profile+(c.page===1?'':'?page='+c.page);
    try{
      const html=await this.publicRead(url,'html');
      if(!/<html[\s>]/i.test(html))return;
      const links=anchors161(html),next=profile+'?page='+(c.page+1);
      let more=false;
      this.storage.transactionSync(()=>{
        for(const a of links){
          const l=noteLink161(a.href,url,'note');
          if(l?.owner==='43__')this.rows('INSERT OR IGNORE INTO desk_archive_hint(article) SELECT ? WHERE NOT EXISTS(SELECT 1 FROM desk_archive WHERE article=?)',l.id,l.id);
          try{if(new URL(a.href,url).href===next)more=true;}catch{}
        }
        this.rows('UPDATE desk_public_pages SET page=?,due=? WHERE id=1',more?c.page+1:1,now+(more?HOUR:D520));
      });
    }catch{}
  }
  async observeArchive(now) {
    if(this.one('SELECT blocked FROM desk_cfg WHERE id=1').blocked>now)return;
    const hint=this.one('SELECT article FROM desk_archive_hint WHERE due<=? ORDER BY due,article LIMIT 1',now);
    if(hint && (!this.one('SELECT article FROM desk_archive WHERE due<=? LIMIT 1',now) || Math.floor(now/(4*M520))%2===0)){
      try {
        const n=(await this.publicRead('https://note.com/api/v3/notes/'+hint.article,'json'))?.data;
        if(n?.key!==hint.article || n.user?.urlname!=='43__' || (n.status && n.status!=='published'))throw Error('unverified');
        if(n.name?.trim()!=='521' && !this.rememberPublic(n.key,n.name,Date.parse(n.publishAt||n.publish_at||n.publishedAt)))throw Error('unverified');
        this.rows('DELETE FROM desk_archive_hint WHERE article=?',hint.article);
      }catch{this.rows('UPDATE desk_archive_hint SET due=? WHERE article=?',now+D520,hint.article);}
      return;
    }
    const a=this.one('SELECT article FROM desk_archive WHERE due<=? ORDER BY due,article LIMIT 1',now);
    if(!a)return;
    try{
      const n=(await this.publicRead('https://note.com/api/v3/notes/'+a.article,'json'))?.data;
      if(n?.user?.urlname!=='43__' || n.key!==a.article || n.name?.trim()==='521' || (n.status && n.status!=='published'))throw Error('not verified');
      const value=count520(n,['likeCount','like_count']);
      const tags=Array.isArray(n.hashtags)?n.hashtags.map(t=>String(typeof t==='string'?t:t?.hashtag?.name??t?.name??'').replace(/^#/,'')):[];
      // Use explicit genre metadata if note publishes it; the title alone is ambiguous.
      if(typeof n.genre==='string')tags.push(n.genre);
      const labels=genre520.filter(g=>tags.includes(g) && !(g==='小説' && tags.includes('短編小説')));
      const genre=labels.length===1?labels[0]:null;
      // Do not estimate restricted text or infer how a writer produced it.
      const chars=publishedChars162(n);
      this.magazineHints(n);
      this.rows(`UPDATE desk_archive SET pick_due=0,due=?,verified=?,genre=?,chars=?,previous=CASE WHEN ? IS NOT NULL THEN likes ELSE previous END,
        prior_at=CASE WHEN ? IS NOT NULL THEN at ELSE prior_at END,likes=COALESCE(?,likes),at=CASE WHEN ? IS NULL THEN at ELSE ? END,state=? WHERE article=?`,
        now+(value===null?D520:7*D520),now,genre,chars,value,value,value,value,now,value===null?'スキ数取得待ち':'取得済み',a.article);
    }catch{
      this.rows("UPDATE desk_archive SET due=?,state='詳細取得待ち',verified=0 WHERE article=?",now+D520,a.article);
    }
  }
  archiveFits(article,magazines,now) {
    if(!article.verified || article.verified<now-8*D520)return [];
    const genre=article.work_genre??article.genre,chars=article.work_chars??article.chars;
    return magazines.filter(({p})=>
      (genre?p.genres.includes(genre):genre520.every(g=>p.genres.includes(g))) &&
      (article.method?p.methods.includes(article.method):method520.every(m=>p.methods.includes(m))) &&
      (chars!==null?chars>=p.min && chars<=p.max:p.min===0 && p.max===1000000));
  }
  planArchive(now) {
    const rev=this.one('SELECT rev FROM desk_pick_meta WHERE id=1').rev;
    const keys=this.rows('SELECT article FROM desk_archive WHERE pick_rev<? ORDER BY pick_rev,article LIMIT 8',rev);
    if(keys.length<8)keys.push(...this.rows('SELECT article FROM desk_archive WHERE pick_due<=? AND pick_rev=? ORDER BY pick_due,article LIMIT ?',now,rev,8-keys.length));
    if(!keys.length)return;
    const mags=this.eligibleMags(now);
    for(const {article} of keys){
      const row=this.one(`SELECT a.*,w.genre work_genre,w.chars work_chars,w.method FROM desk_archive a LEFT JOIN desk_work w ON w.article=a.article WHERE a.article=?`,article);
      const placed=this.one('SELECT 1 FROM desk_ref WHERE article=? LIMIT 1',article);
      const fits=placed?[]:this.archiveFits(row,mags,now);
      const genre=row.work_genre||row.genre;
      const pick=fits.find(m=>m.url===row.choice) || (genre && this.strongestMagazine(fits,genre)) || fits[0];
      this.rows('UPDATE desk_archive SET pick_due=?,pick_rev=?,choice=? WHERE article=?',now+D520,rev,pick?.url??null,article);
    }
  }
  archivePage(offset,now) {
    const magazines=this.eligibleMags(now);
    const rows=this.rows(`SELECT a.*,w.genre work_genre,w.method,w.chars work_chars FROM desk_archive a
      LEFT JOIN desk_work w ON w.article=a.article ORDER BY a.pub DESC,a.article LIMIT 31 OFFSET ?`,offset);
    const more=rows.length===31;
    const items=rows.slice(0,30).map(a=>{
      const seen=this.rows('SELECT name,observed FROM desk_ref WHERE article=? ORDER BY observed',a.article);
      const choice=seen.length?null:this.archiveFits(a,magazines,now).find(m=>m.url===a.choice);
      return {article:a.article,title:a.title,pub:a.pub,state:a.state,likes:a.likes,at:a.at,prior_at:a.prior_at,
        change:a.likes!==null && a.previous!==null?a.likes-a.previous:null,seen,choice:choice?.name??null,
        waiting:!magazines.length?'参加・無料・募集条件・最近の活動を確認できた誌がまだありません':
          !a.verified?'公開作品の詳細を確認待ち':!choice?'確認できた字数・ジャンル・制作条件で該当する誌を確認待ち':''};
    });
    return {message:this.one('SELECT message FROM desk_catalog WHERE id=1').message,total:this.one('SELECT COUNT(*) n FROM desk_archive').n,items,offset,more};
  }
  eligibleMags(now) {
    return this.rows(`SELECT m.url,m.name,m.policy,m.recent FROM desk_mag m JOIN desk_import i ON
      (m.url=i.url OR m.url LIKE '%/m/'||i.id) JOIN desk_member role ON role.id=i.id
      WHERE m.active=1 AND m.recent>=? AND i.allowed=1 AND i.managed=1 AND i.state='利用中'
      AND role.mode='auto' AND role.checked>? ORDER BY m.url`,now-60*D520,now-2*D520)
      .map(m=>({...m,p:JSON.parse(m.policy)})).sort((a,b)=>a.p.genres.length-b.p.genres.length ||
        (a.p.max-a.p.min)-(b.p.max-b.p.min) || b.recent-a.recent || a.url.localeCompare(b.url));
  }

  rememberMagazine(link,label) {
    const existing=this.existingMagazine(link);
    if(existing?.active && !this.one('SELECT id FROM desk_import WHERE id=?',link.id)) return false;
    this.rows('INSERT OR IGNORE INTO desk_member(id) VALUES(?)',link.id);
    const name=(label||'').trim().slice(0,100);
    this.rows("INSERT INTO desk_import(id,url,name) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=CASE WHEN desk_import.name=desk_import.id AND excluded.name<>excluded.id THEN excluded.name ELSE desk_import.name END",
      link.id,link.url,name||link.id);
    return true;
  }
  async scoutLiterary(now){
    const cfg=this.one('SELECT c.enabled,c.blocked,d.enabled AS directory FROM desk_cfg c JOIN desk_directory d ON d.id=c.id WHERE c.id=1');
    if(!cfg.enabled || !cfg.directory || cfg.blocked>now || this.one('SELECT due FROM desk_scout_state WHERE id=1').due>now)return;
    const next=this.one('SELECT url,kind FROM desk_scout WHERE due<=? ORDER BY due,url LIMIT 1',now);
    if(!next)return;
    this.rows('UPDATE desk_scout_state SET due=? WHERE id=1',now+30*M520);
    this.rows('UPDATE desk_scout SET due=? WHERE url=?',now+D520,next.url);
    try{
      for(const [url,label] of scoutSeeds){
        const seed=noteLink161(url);
        if(!this.one('SELECT id FROM desk_import WHERE id=?',seed.id) && this.rememberMagazine(seed,label))
          this.rows('INSERT OR IGNORE INTO desk_scout_mag(id) VALUES(?)',seed.id);
      }
      const source=next.url;
      const found=new Map();
      let writers=[];
      if(next.kind==='feed'){
        const edition=await this.readIssue(source);
        const mag=noteLink161(source);
        found.set(mag.id,{link:mag,label:scoutSeeds.find(([url])=>url===source)?.[1]||mag.id});
        writers=[...new Set(edition.map(e=>noteLink161(e.link,source,'article')?.owner).filter(v=>v && v!=='43__'))].slice(0,24);
      }else{
        const html=await this.publicRead(source,'html');
        if(!/<html[\s>]/i.test(html))throw Error();
        const canonical=meta161(html,'og:url');
        if(canonical && canonical.replace(/\/?$/,'')!==source && canonical.replace(/\/?$/,'')!==source.replace(/\/magazines$/,''))throw Error();
        for(const a of anchors161(html)){
          const link=noteLink161(a.href,source);
          if(link && link.owner!=='43__' && /小説|文芸|文学|詩|エッセイ|散文|掌編|創作|物語|短歌|共同運営/.test(a.label))found.set(link.id,{link,label:a.label.split('\n')[0]});
          if(found.size>=50)break;
        }
      }
      this.storage.transactionSync(()=>{
        // Reserve room for independent literary feeds so prolific writers cannot fill the whole directory.
        let spaces=224-this.one("SELECT COUNT(*) n FROM desk_scout WHERE kind='author'").n;
        for(const writer of writers){
          if(spaces<1)break;
          if(this.one("INSERT OR IGNORE INTO desk_scout(url,kind,due) VALUES(?,'author',?) RETURNING url",'https://note.com/'+writer+'/magazines',now))spaces--;
        }
        let room=800-this.one('SELECT COUNT(*) n FROM desk_scout_mag').n,added=0;
        for(const {link,label} of found.values()){
          if(room<=0)break;
          if(this.one('SELECT id FROM desk_import WHERE id=?',link.id))continue;
          if(this.rememberMagazine(link,label)){
            this.rows('INSERT OR IGNORE INTO desk_scout_mag(id) VALUES(?)',link.id);
            added++;room--;
          }
        }
        if(next.kind==='author'){
          let capacity=Math.min(2,32-this.one("SELECT COUNT(*) n FROM desk_scout WHERE kind='feed'").n);
          for(const {link} of found.values()){
            if(capacity<=0)break;
            if(!this.one('SELECT 1 FROM desk_import WHERE id=?',link.id))continue;
            if(this.one("INSERT OR IGNORE INTO desk_scout(url,kind,due) VALUES(?,'feed',?) RETURNING url",link.url,now))capacity--;
          }
        }
        this.rows('UPDATE desk_scout SET due=? WHERE url=?',now+(next.kind==='feed'?D520:7*D520),source);
        this.rows('UPDATE desk_scout_state SET message=? WHERE id=1','直近の探索で新たに'+added+'誌を登録');
      });
    }catch{this.rows("UPDATE desk_scout_state SET message='公開ページの読み取りを再確認待ち' WHERE id=1");}
  }
  async discoverMagazines(now,manual=false) {
    const cfg=this.one('SELECT * FROM desk_directory WHERE id=1');
    if((cfg.token && cfg.due>now) || (!manual && (!cfg.enabled || cfg.due>now))) return;
    if(this.one('SELECT blocked FROM desk_cfg WHERE id=1').blocked>now) {
      this.rows("UPDATE desk_directory SET enabled=1,message='note指定の待機中。終了後に自動で確認します。' WHERE id=1");
      return;
    }
    const token=crypto.randomUUID();
    this.rows("UPDATE desk_directory SET enabled=1,token=?,due=?,message='公開一覧を確認中' WHERE id=1",token,now+2*M520);
    const found=new Map();
    const profile='https://note.com/43__';
    let readable=0,partial=false;
    const collect=async url=>{
      const html=await this.publicRead(url,'html');
      if(!/<html[\s>]|<!doctype\s+html/i.test(html)) throw Error('not a public page');
      const canonical=meta161(html,'og:url');
      if(canonical && !/^https:\/\/note\.com\/43__(?:\/magazines)?\/?(?:\?.*)?$/.test(canonical)) throw Error('unexpected creator page');
      readable++;
      const links=anchors161(html);
      for(const a of links) {
        const v=noteLink161(a.href,url);
        if(v && (found.has(v.id) || found.size<100)) {
          if(!found.get(v.id)?.name) found.set(v.id,{...v,name:a.label.replace(/\n[\s\S]*$/,'').trim()});
        } else if(v) partial=true;
      }
      return links;
    };
    // Follow only pagination actually exposed by the public creator page.
    const results=await Promise.allSettled([collect(profile+'/magazines'),collect(profile)]);
    let links=results[0].status==='fulfilled'?results[0].value:[];
    for(let page=2;page<=3;page++) {
      const next=profile+'/magazines?page='+page;
      if(!links.some(a=>{try{return new URL(a.href,profile+'/magazines').href===next;}catch{return false;}})) break;
      try { links=await collect(next); } catch {partial=true;break;}
      if(page===3 && links.some(a=>a.href.includes('page=4'))) partial=true;
    }
    this.storage.transactionSync(()=>{
      if(this.one('SELECT token FROM desk_directory WHERE id=1').token!==token)return;
      for(const link of found.values()) this.rememberMagazine(link,link.name);
      let message=readable?(found.size?'公開ページにあるマガジン '+found.size+'誌。':'読めた公開ページ内にマガジンのリンクが見つかりません。'):'520の公開一覧を取得できませんでした。';
      if(partial || readable===1) message+=' 公開一覧の一部だけを確認しました。';
      this.rows("UPDATE desk_directory SET due=?,token='',message=? WHERE id=1",now+(readable && found.size?7*D520:D520),message);
    });
  }
  async sourceForMagazine(row) {
    let link=noteLink161(row.url),title='',description='',page='',feed=null;
    // Publisher's channel description and labelled rules may contain the guidelines themselves.
    const sources=await Promise.allSettled([this.publicRead(link.url+'/rss','channel'),this.publicRead(link.url,'html')]);
    if(sources[0].status==='fulfilled') feed=sources[0].value;
    if(sources[1].status==='fulfilled') page=sources[1].value;
    if(!feed && !page) throw Error('unavailable');
    const pageCanonical=meta161(page,'og:url');
    const canon=noteLink161(pageCanonical||feed?.link||'',link.url);
    if(canon && canon.id!==link.id) throw Error('wrong magazine');
    if(canon?.owner)link=canon;
    const feedCanonical=feed?.link && noteLink161(feed.link,link.url);
    if(feedCanonical && feedCanonical.id!==link.id) throw Error('wrong feed');
    title=(feed?.title||meta161(page,'og:title')||row.name).replace(/\s*[|｜]\s*note\s*$/i,'').trim().slice(0,100);
    description=feed?.description||'';
    const teaser=meta161(page,'og:description')||meta161(page,'description');
    // Treat links in editorial descriptions as authoritative, never links from random RSS items.
    let candidates=ruleLinks161(description+'\n'+teaser,link.url);
    if(!candidates.length && link.owner) {
      const sameOwner=anchors161(page).filter(a=>ruleLabel161.test(a.label)).map(a=>noteLink161(a.href,link.url,'article'))
        .filter(v=>v && v.owner===link.owner);
      candidates=[...new Map(sameOwner.map(v=>[v.id,v])).values()];
    }
    const supplied=row.supplied && noteLink161(row.supplied,link.url,'article');
    const rule=supplied || (candidates.length===1?candidates[0]:null);
    const hold=(reason,rules='')=>({title,rules,state:'保留',reason,summary:'',policy:null});
    if(candidates.length>1 && !supplied)return hold('募集記事のリンクを1つに特定できません');
    if(!rule) {
      if(!description || /(?:…|\.\.\.)\s*$/.test(words161(description))) {
        const partial=magazinePolicy161(description||teaser);
        return {...hold('募集要項の全文を確認できません',link.url),draft:partial.draft,summary:partial.summary};
      }
      const parsed=magazinePolicy161(description,teaser);
      return {title,rules:link.url,...parsed};
    }
    let data;
    try {data=(await this.publicRead('https://note.com/api/v3/notes/'+rule.id,'json'))?.data;}
    catch {return hold('募集記事を取得できません。自動で再確認します',rule.url);}
    if(data?.key!==rule.id || data?.user?.urlname!==rule.owner || typeof data.body!=='string' || !data.body.trim()
        || data.is_limited===true || data.is_paid===true || Number(data.price)>0) return hold('公開の募集記事全文を確認できません',rule.url);
    // Outside a magazine's explicit description links, require a verifiable connection in the rule article.
    const linked=ruleLinks161(description+'\n'+teaser,link.url).some(v=>v.id===rule.id);
    const backlink=anchors161(data.body).some(a=>noteLink161(a.href,rule.url)?.id===link.id)
      || (words161(data.body).match(/https:\/\/note\.com\/(?:[\w-]+\/)?m\/m[a-z0-9]+/g)||[]).some(u=>noteLink161(u)?.id===link.id);
    if(!linked && !backlink && !supplied)return hold('募集記事とこの誌の関係を確定できません',rule.url);
    if(!linked && !backlink && supplied && rule.owner!==link.owner)return hold('別の運営者の記事とこの誌の関係を確認できません',rule.url);
    const parsed=magazinePolicy161(data.body,description+'\n'+teaser);
    return {title,rules:rule.url,...parsed};
  }
  async reviewMagazine(id,now) {
    const row=this.one('SELECT * FROM desk_import WHERE id=? AND allowed=1 AND due<=?',id,now);
    if(!row)return;
    if(this.one('SELECT blocked FROM desk_cfg WHERE id=1').blocked>now)return;
    const token=crypto.randomUUID();
    this.rows("UPDATE desk_import SET token=?,due=? WHERE id=?",token,now+2*M520,id);
    let result,interval=D520;
    try { result=await this.sourceForMagazine(row); }
    catch { result={title:row.name,rules:row.rules,state:'保留',reason:'公開ページを取得できません。自動で再確認します。',summary:'',policy:null};interval=HOUR; }
    this.storage.transactionSync(()=>{
      const current=this.one('SELECT * FROM desk_import WHERE id=? AND allowed=1 AND token=?',id,token);
      if(!current)return;
      const old=this.existingMagazine(noteLink161(row.url));
      const dest=old?.url||row.url;
      this.rows("UPDATE desk_import SET name=?,rules=?,state=?,reason=?,summary=?,draft=?,due=?,token='' WHERE id=?",
        result.title||row.name,result.rules||'',result.state,result.reason,result.summary,JSON.stringify(result.draft||{}),now+interval,id);
      if(result.policy) {
        this.rows('INSERT INTO desk_mag(url,name,rules,policy,active) VALUES(?,?,?,?,1) ON CONFLICT(url) DO UPDATE SET name=excluded.name,rules=excluded.rules,policy=excluded.policy,active=1',
          dest,result.title||row.name,result.rules,JSON.stringify(result.policy));
        this.rows('UPDATE desk_import SET managed=1 WHERE id=?',id);
      } else if(old) {
        this.rows('UPDATE desk_mag SET active=0 WHERE url=?',dest);
        this.rows('UPDATE desk_work SET magazine=NULL WHERE magazine=?',dest);
      }
      if((!!result.policy)!==!!old?.active || (result.policy && JSON.stringify(result.policy)!==old?.policy))
        this.rows('UPDATE desk_pick_meta SET rev=rev+1 WHERE id=1');
      this.match(now);
    });
  }
  async magazines(now) {
    const m=this.one('SELECT url FROM desk_mag WHERE active=1 AND last_check<? ORDER BY last_check,url LIMIT 1',now-D520);
    if(!m) return;
    this.rows('UPDATE desk_mag SET last_check=? WHERE url=?',now,m.url);
    try {
      const entries=await this.readIssue(m.url);
      const dates=entries.filter(e=>/^https:\/\/note\.com\/[\w-]+\/n\/n[a-z0-9]+\/?$/.test(e.link.trim())).map(e=>Date.parse(e.pubdate)).filter(t=>t>0 && t<=now);
      this.storage.transactionSync(()=>{
        const oldRecent=this.one('SELECT recent FROM desk_mag WHERE url=?',m.url)?.recent||0;
        if(oldRecent<now-60*D520 && dates.some(t=>t>=now-60*D520))this.rows('UPDATE desk_pick_meta SET rev=rev+1 WHERE id=1');
        this.rows("UPDATE desk_mag SET recent=?,rss_state='取得済み' WHERE url=? AND active=1",dates.length?Math.max(...dates):0,m.url);
        this.recordReferences(entries,noteLink161(m.url),this.one('SELECT name FROM desk_mag WHERE url=?',m.url)?.name,now);
        for(const item of entries) {
          const key=publicKey520(item.link);
          if(key) this.rows('INSERT OR IGNORE INTO desk_placement(seq,url,name,observed) SELECT w.seq,m.url,m.name,? FROM desk_work w,desk_mag m WHERE w.article=? AND m.url=? AND m.active=1',now,key,m.url);
        }
      });
      return true;
    } catch {
      this.rows("UPDATE desk_mag SET rss_state='取得失敗・再確認待ち' WHERE url=? AND active=1",m.url);
    }
  }
  match(now) {
    const mags=this.eligibleMags(now);
    for(const w of this.rows('SELECT seq,chars,genre,method,magazine FROM desk_work WHERE (pub IS NULL OR pub>=?)',now-30*D520)) {
      const valid=mags.filter(({p})=>p.genres.includes(w.genre) && p.methods.includes(w.method) && w.chars>=p.min && w.chars<=p.max);
      if(valid.some(m=>m.url===w.magazine)) continue;
      valid.sort((a,b)=>a.p.genres.length-b.p.genres.length || (a.p.max-a.p.min)-(b.p.max-b.p.min) || b.recent-a.recent || a.url.localeCompare(b.url));
      const picked=this.strongestMagazine(valid,w.genre);
      const url=picked?.url??valid[0]?.url??null;
      if(url!==w.magazine) this.rows('UPDATE desk_work SET magazine=? WHERE seq=?',url,w.seq);
    }
  }
  writeWeek(start,now) {
    const end=start+7*D520;
    const a=this.one('SELECT value FROM desk_follower WHERE d=?',jstDay(start))?.value;
    const b=this.one('SELECT value FROM desk_follower WHERE d=?',jstDay(end))?.value;
    const row=this.one('SELECT COUNT(w.seq) AS eligible,COUNT(s.value) AS measured,AVG(s.value) AS avg7 FROM desk_entries w LEFT JOIN desk_sample s ON s.seq=w.seq AND s.age=7 WHERE w.pub>=? AND w.pub<?',start,end);
    const final=Number(now>=end+7*D520+WINDOW520);
    this.rows('INSERT OR REPLACE INTO desk_week(start,delta,avg7,eligible,measured,final) VALUES(?,?,?,?,?,?)',jstDay(start),Number.isInteger(a)&&Number.isInteger(b)?b-a:null,row.avg7,row.eligible,row.measured,final);
    return final;
  }
  weekly(now) {
    const cfg=this.one('SELECT weekly_at,started FROM desk_cfg WHERE id=1');
    for(let start=cfg.weekly_at,n=0;start && start+7*D520+12*HOUR+WINDOW520<=now && n<6;start+=7*D520,n++) {
      const end=start+7*D520;
      const final=this.storage.transactionSync(()=>{
        const final=this.writeWeek(start,now);
        if(final) this.rows('UPDATE desk_cfg SET weekly_at=? WHERE id=1',end);
        return final;
      });
      if(!final) break;
    }
  }
  initDelivery(){
    if(this.one("SELECT name FROM sqlite_master WHERE type='table' AND name='desk_job'"))return;
    this.storage.transactionSync(()=>{
      this.rows("CREATE TABLE desk_job(kind TEXT NOT NULL,subject TEXT NOT NULL,target TEXT NOT NULL DEFAULT '',label TEXT NOT NULL,phase TEXT NOT NULL DEFAULT 'wait',next INTEGER NOT NULL,at INTEGER NOT NULL,message TEXT NOT NULL,PRIMARY KEY(kind,subject))");
      this.rows('CREATE INDEX desk_job_at ON desk_job(at DESC)');
      this.rows('CREATE INDEX desk_job_target ON desk_job(kind,target) WHERE phase IN (\'sent\',\'seen\')');
      this.rows('CREATE INDEX desk_archive_candidate ON desk_archive(pub,article) WHERE choice IS NOT NULL');
      this.rows('CREATE INDEX desk_open_work ON desk_work(d,seq) WHERE pub IS NULL');
      this.rows('CREATE TABLE desk_delivery(id INTEGER PRIMARY KEY,start INTEGER NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,utc_day INTEGER DEFAULT -1,pubs INTEGER DEFAULT 0,mags INTEGER DEFAULT 0,old_first INTEGER DEFAULT 1,due INTEGER DEFAULT 0)');
      this.rows('INSERT INTO desk_delivery(id,start) VALUES(1,?)',Date.now());
    });
  }
  dueLink(now,key=null){
    const p=this.one('SELECT article,scheduled FROM desk_link_plan l WHERE pub IS NULL AND scheduled BETWEEN ? AND ? '+
      (key?'AND article=? ':'')+
      "AND NOT EXISTS(SELECT 1 FROM desk_archive WHERE article=l.article) AND NOT EXISTS(SELECT 1 FROM desk_work_schedule w WHERE w.key=l.article) AND NOT EXISTS(SELECT 1 FROM desk_job j WHERE kind='publish' AND subject=l.article AND "+
      (key?"phase<>'wait'":"(phase<>'wait' OR next>?)")+") ORDER BY scheduled,article LIMIT 1",now-5*M520,now,...(key?[key]:[now]));
    return p?{kind:'publish',link:true,subject:p.article,key:p.article,target:p.article,title:p.article,scheduled:p.scheduled}:null;
  }
  duePublication(now){
    const w=this.dueManuscript(now);
    if(w && !this.one("SELECT 1 FROM desk_job WHERE kind='publish' AND subject=? AND (phase<>'wait' OR next>?)",w.subject,now))return w;
    return this.dueLink(now);
  }
  dueManuscript(now,subject=null){
    const start=this.one('SELECT start FROM desk_delivery WHERE id=1').start;
    const row=this.one(`SELECT w.* FROM desk_work_schedule w WHERE w.pub IS NULL AND w.locked=0 AND w.paused=0
      AND w.scheduled BETWEEN ? AND ? AND (? IS NULL OR w.seq=?)
      AND NOT EXISTS(SELECT 1 FROM desk_job j WHERE j.kind='publish' AND j.subject=CAST(w.seq AS TEXT)
        AND (j.phase<>'wait' OR (? IS NULL AND j.next>?)))
      AND NOT EXISTS(SELECT 1 FROM desk_archive a WHERE a.title=w.title)
      ORDER BY w.scheduled,w.seq LIMIT 1`,Math.max(now-5*M520,start),now,subject,subject,subject,now);
    if(!row || row.title.trim()==='521')return null;
    return {kind:'publish',subject:String(row.seq),key:row.key||'',target:row.key||'',title:row.title,body:row.body,scheduled:row.scheduled};
  }
  eligiblePlacement(key,now){
    const a=this.one('SELECT a.*,w.genre work_genre,w.chars work_chars,w.method FROM desk_archive a LEFT JOIN desk_work w ON w.article=a.article WHERE a.article=?',key);
    if(!a?.choice || a.title.trim()==='521' || this.one('SELECT 1 FROM desk_ref WHERE article=? LIMIT 1',key))return null;
    const mag=this.archiveFits(a,this.eligibleMags(now),now).find(m=>m.url===a.choice);
    const link=noteLink161(mag?.url);
    if(!link || link.owner==='43__')return null;
    return {kind:'mag',key,subject:key,target:link.id,url:link.url,title:a.title,name:mag.name,old:a.pub<=now-30*D520};
  }
  nextPlacement(now,oldFirst){
    const oldest=this.one('SELECT older FROM desk_scout_state WHERE id=1').older;
    for(const old of [oldFirst,!oldFirst]){
      const order=!old?'a.pub DESC':oldest?'a.pub ASC':
        'CASE WHEN a.at>=? AND a.at-a.prior_at BETWEEN ? AND ? AND a.likes>a.previous THEN a.likes-a.previous ELSE 0 END DESC,a.pub ASC';
      const keys=this.rows('SELECT a.article FROM desk_archive a WHERE a.choice IS NOT NULL AND a.pub '+(old?'<=?':'>?')+
        " AND NOT EXISTS(SELECT 1 FROM desk_job j WHERE j.kind='mag' AND j.subject=a.article AND (j.phase<>'wait' OR j.next>?)) AND NOT EXISTS(SELECT 1 FROM desk_ref r WHERE r.article=a.article) ORDER BY "+order+",a.article LIMIT 4",now-30*D520,now,...(old && !oldest?[now-7*D520,6*D520,8*D520]:[]));
      for(const {article} of keys){
        const job=this.eligiblePlacement(article,now);
        if(job)return job;
        this.rows('UPDATE desk_archive SET choice=NULL WHERE article=?',article);
      }
    }
    return null;
  }
  canDeliver(job,now){
    const cfg=this.one('SELECT enabled,blocked FROM desk_cfg WHERE id=1');
    if(!cfg.enabled || cfg.blocked>now || !this.one('SELECT enabled FROM desk_delivery WHERE id=1').enabled)return false;
    const fresh=job.kind==='mag'?this.eligiblePlacement(job.key,now):job.link?this.dueLink(now,job.key):this.dueManuscript(now,job.subject);
    return !!fresh && fresh.subject===job.subject && fresh.target===job.target && fresh.title===job.title && (job.kind!=='publish' || job.scheduled===fresh.scheduled);
  }
  async deliveryAccount(){
    const numeric=u=>u?.urlname==='43__' && /^[1-9]\d{0,19}$/.test(String(u.id))?String(u.id):'';
    let id='';
    try{id=numeric((await this.publicRead('https://note.com/api/v2/creators/43__','json'))?.data);}catch{}
    if(!id){
      const a=this.one('SELECT article FROM desk_archive ORDER BY pub DESC,article LIMIT 1');
      if(!a)return null;
      const n=(await this.publicRead('https://note.com/api/v3/notes/'+a.article,'json'))?.data;
      if(n?.key===a.article)id=numeric(n.user);
    }
    if(!id)return null;
    const rows=await this.env.DB.batch(SLOTS.map(slot=>sql(scoped(this.env,slot),
      'SELECT c.lease,c.next_at,h.kind,n.hold_until FROM nh_control c JOIN nh_health h ON h.id=c.id JOIN nh_v13_connection n ON n.slot=? WHERE c.id=1 AND c.account=?',slot,id)));
    const matches=SLOTS.filter((_,i)=>rows[i].results.length===1);
    if(matches.length!==1)return null;
    const slot=matches[0],gate=rows[SLOTS.indexOf(slot)].results[0];
    const hold=Math.max(gate.hold_until,gate.kind?gate.next_at:0);
    return {id,slot,hold,until:Math.max(gate.lease,hold)};
  }
  rememberDraftMetadata(n,key){
    this.rows('UPDATE desk_link_plan SET title=? WHERE article=? AND pub IS NULL',n.name,key);
    const at=this.one('SELECT scheduled FROM desk_link_plan WHERE article=? AND pub IS NULL',key)?.scheduled;
    if(!at || this.one('SELECT 1 FROM desk_work_schedule WHERE key=?',key))return;
    const matches=this.rows('SELECT seq,body FROM desk_work_schedule WHERE key IS NULL AND pub IS NULL AND title=? AND scheduled=? LIMIT 2',n.name,at);
    if(matches.length!==1 || this.one("SELECT 1 FROM desk_link_plan WHERE article<>? AND scheduled=? AND pub IS NULL AND (title=? OR title IS NULL) LIMIT 1",key,at,n.name))return;
    // Only compare complete, ordinary saved paragraphs; other formats use the authenticated draft directory.
    if(typeof n.body!=='string' || n.body.length>500000 || !/^(?:<p>(?:[^<>]|<br\s*\/?>)*<\/p>)+$/i.test(n.body))return;
    const lines=[...n.body.matchAll(/<p>([\s\S]*?)<\/p>/gi)].map(m=>/^<br\s*\/?>$/i.test(m[1])?'':xmlValue520(m[1].replace(/<br\s*\/?>/gi,'\n')));
    if(lines.join('\n')===matches[0].body.replace(/\r\n?/g,'\n'))this.rows('INSERT OR IGNORE INTO desk_draft_identity(seq,article) VALUES(?,?)',matches[0].seq,key);
  }
  async lookupDraftTitle(now,key=null){
    const cfg=this.one('SELECT enabled,blocked FROM desk_cfg WHERE id=1');
    if(!cfg.enabled || cfg.blocked>now)return;
    const gate=this.one('SELECT title_due FROM desk_scout_state WHERE id=1').title_due;
    if(gate>now && (!key || gate>now+4*M520))return;
    const pending=key?this.rows('SELECT article FROM desk_link_plan WHERE article=? AND title IS NULL AND pub IS NULL AND title_due<=?',key,now):
      this.rows(`SELECT l.article FROM desk_link_plan l WHERE l.pub IS NULL AND l.scheduled>? AND l.title_due<=?
        AND (l.title IS NULL OR EXISTS (SELECT 1 FROM desk_work_schedule w WHERE w.key IS NULL AND w.pub IS NULL AND w.title=l.title AND w.scheduled=l.scheduled))
        ORDER BY l.title_due,l.scheduled LIMIT 4`,now,now);
    if(!pending.length)return;
    this.rows('UPDATE desk_scout_state SET title_due=? WHERE id=1',now+4*M520);
    for(const p of pending)this.rows('UPDATE desk_link_plan SET title_due=? WHERE article=?',now+12*M520,p.article);
    let slot;
    try{
      const a=await this.deliveryAccount();
      if(!a || a.until>now)return;
      slot=a.slot;
      const env=await loadCookie(scoped(this.env,slot),a.id);
      if(await account(env)!==a.id)return;
      for(const p of pending){
        let n;
        try{n=await api(env,'/api/v3/notes/'+p.article);}catch(e){if(e instanceof Trouble && e.code===404)continue;throw e;}
        if(n.key===p.article && n.status==='draft' && n.user?.urlname==='43__' && String(n.user.id)===a.id && text520(n.name,300))
          this.storage.transactionSync(()=>this.rememberDraftMetadata(n,p.article));
      }
    }catch(error){
      if(slot && error instanceof Trouble && (error.retry || [401,403,429].includes(error.code))){
        const until=now+Math.max(error.retry||0,2*HOUR);
        this.rows('UPDATE desk_scout_state SET title_due=MAX(title_due,?) WHERE id=1',until);
        if(error.retry || error.code===429){
          this.rows('UPDATE desk_cfg SET blocked=MAX(blocked,?) WHERE id=1',until);
          await sql(this.env,'UPDATE nh_v13_connection SET hold_until=MAX(hold_until,?) WHERE slot=?',until,slot).run();
        }
      }
    }
  }
  async resolveDraftDirectory(now){
    if(typeof this.env.BROWSER?.acquire!=='function')return;
    const cfg=this.one('SELECT enabled,blocked FROM desk_cfg WHERE id=1');
    if(!cfg.enabled || cfg.blocked>now || this.one('SELECT due FROM desk_draft_directory WHERE id=1').due>now)return;
    const works=this.rows("SELECT seq,title,'' AS key FROM desk_work_schedule WHERE pub IS NULL AND key IS NULL AND d>=? ORDER BY d,seq LIMIT 40",jstDay(now));
    const links=this.rows("SELECT article AS key,1 AS byLink FROM desk_link_plan WHERE pub IS NULL AND title IS NULL AND scheduled>? ORDER BY scheduled LIMIT 40",now);
    if(!works.length && !links.length)return;
    this.rows('UPDATE desk_draft_directory SET due=? WHERE id=1',now+4*M520);
    const a=await this.deliveryAccount().catch(()=>null);
    if(!a || a.until>now)return;
    const env=await loadCookie(scoped(this.env,a.slot),a.id);
    this.rows('UPDATE desk_draft_directory SET due=? WHERE id=1',now+HOUR);
    const result=await inspectDraftDirectory(this.env.BROWSER,cleanCookie(env.NOTE_SESSION),a.id,[...works,...links]);
    if(result.hold){
      this.rows('UPDATE desk_cfg SET blocked=MAX(blocked,?) WHERE id=1',now+result.hold);
      await sql(this.env,'UPDATE nh_v13_connection SET hold_until=MAX(hold_until,?) WHERE slot=?',now+result.hold,a.slot).run();
    }
    this.storage.transactionSync(()=>{
      for(const row of result.rows||[]){
        if(row.seq){
          const w=this.one('SELECT seq FROM desk_work_schedule WHERE seq=? AND title=? AND pub IS NULL AND key IS NULL',row.seq,row.title);
          if(!w || this.one('SELECT 1 FROM desk_work_schedule WHERE key=? OR (seq<>? AND title=? AND pub IS NULL) LIMIT 1',row.article,row.seq,row.title))continue;
          this.rows('INSERT OR IGNORE INTO desk_draft_identity(seq,article) VALUES(?,?)',row.seq,row.article);
        }
        this.rows('UPDATE desk_link_plan SET title=? WHERE article=? AND title IS NULL AND pub IS NULL',row.title,row.article);
      }
    });
  }
  async previewDraft(key,now){
    need520(typeof key==='string' && /^n[a-z0-9]{1,64}$/.test(key),'下書きの共有用リンクを確認してください。');
    if(typeof this.env.BROWSER?.acquire!=='function')return 'CloudflareのBROWSER設定を確認してください。';
    const cfg=this.one('SELECT blocked FROM desk_cfg WHERE id=1');
    if(cfg.blocked>now)return 'note指定の待機中です。';
    if(!this.one('UPDATE desk_preview_gate SET next=? WHERE id=1 AND next<=? RETURNING id',now+5*M520,now))return '画像の確認テストは5分に1回です。';
    const account=await this.deliveryAccount();
    if(!account || account.until>Date.now())return '520本人の接続または前の処理の終了を確認待ちです。';
    const env=scoped(this.env,account.slot);
    const lease=await acquire(env,false);
    if(!lease)return '520が処理中です。';
    try {
      const credential=await loadCookie(env,account.id);
      const job={kind:'publish',link:true,preview:true,key,title:key};
      const result=await browserDelivery(this.env.BROWSER,account.id,cleanCookie(credential.NOTE_SESSION),job,async()=>false);
      if(result.hold){
        const until=Date.now()+result.hold;
        this.rows('UPDATE desk_cfg SET blocked=MAX(blocked,?) WHERE id=1',until);
        await sql(this.env,'UPDATE nh_v13_connection SET hold_until=MAX(hold_until,?) WHERE slot=?',until,account.slot).run();
      }
      return '公開せずに確認 ／ '+result.message;
    }finally{await release(env,lease);}
  }
  async dispatch(now){
    const cfg=this.one('SELECT enabled,blocked FROM desk_cfg WHERE id=1');
    const state=this.one('SELECT * FROM desk_delivery WHERE id=1');
    if(!cfg.enabled || !state.enabled || cfg.blocked>now || state.due>now || typeof this.env?.BROWSER?.acquire!=='function')return;
    const day=Math.floor(now/D520);
    if(state.utc_day!==day){this.rows('UPDATE desk_delivery SET utc_day=?,pubs=0,mags=0 WHERE id=1',day);state.pubs=0;state.mags=0;}
    let job=state.pubs<4?this.duePublication(now):null;
    if(job && this.one("SELECT 1 FROM desk_job WHERE kind='publish' AND subject=? AND (phase<>'wait' OR next>?)",job.subject,now))job=null;
    if(!job && state.mags<2)job=this.nextPlacement(now,!!state.old_first);
    if(!job)return;
    const label=job.kind==='publish'?job.title:job.title+' → '+job.name;
    this.rows("INSERT INTO desk_job(kind,subject,target,label,at,next,message) VALUES(?,?,?,?,?,?,'本人と条件を照合中') ON CONFLICT(kind,subject) DO UPDATE SET target=excluded.target,label=excluded.label,at=excluded.at,next=excluded.next,message=excluded.message WHERE phase='wait'",job.kind,job.subject,job.target,label,now,now+15*M520);
    this.rows('UPDATE desk_delivery SET due=? WHERE id=1',now+M520);
    let message='通信を確認待ち',slot,lease,env,retry=job.kind==='mag'?D520:15*M520;
    try{
      const account=await this.deliveryAccount();
      if(!account){message='520の登録を確認待ち';return;}
      if(account.until>Date.now()){
        const at=Date.now();
        retry=job.kind==='publish' && account.hold<=at?M520:account.until-at+1000;
        message='520の処理・note指定の待機終了を確認待ち';return;
      }
      slot=account.slot;env=scoped(this.env,slot);
      if(job.kind==='mag'){
        const entry=this.one('SELECT * FROM desk_import WHERE id=?',job.target);
        const [info,page,rules]=await Promise.allSettled([
          this.publicRead('https://note.com/api/v1/magazines/'+job.target,'json'),
          this.publicRead(job.url,'html'),this.sourceForMagazine(entry)
        ]);
        const data=info.value?.data,mag=data?.magazine??data,html=page.value||'';
        const canonical=noteLink161(meta161(html,'og:url'));
        const owner=(mag?.key===job.target && (mag.owner?.urlname||noteLink161(mag.magazineUrl||mag.magazine_url||mag.url)?.owner))
          || (canonical?.id===job.target && canonical.owner);
        if(!owner || owner==='43__' || !editorialProof162(noteLink161(job.url),info.value,html).ok){
          message='他の運営者の誌面・520の編集権限を確認待ち';return;
        }
        const article=this.one('SELECT a.*,w.genre work_genre,w.chars work_chars,w.method FROM desk_archive a LEFT JOIN desk_work w ON w.article=a.article WHERE a.article=?',job.key);
        const policy=rules.value?.policy;
        if(!article || !policy || !this.archiveFits(article,[{p:policy}],Date.now()).length){
          message='現在の募集条件で作品の掲載可否を確認待ち';return;
        }
      }
      lease=await acquire(env,false);
      if(!lease){message='別の処理が終了するのを待機中';retry=job.kind==='publish'?M520:5*M520;return;}
      const credential=await loadCookie(env,account.id);
      const cookie=cleanCookie(credential.NOTE_SESSION);
      if(!this.canDeliver(job,Date.now()))return;
      if(job.kind==='mag')this.rows('UPDATE desk_delivery SET mags=mags+1,old_first=? WHERE id=1',+!job.old);
      else this.rows('UPDATE desk_delivery SET pubs=pubs+1 WHERE id=1');
      const result=await browserDelivery(this.env.BROWSER,account.id,cookie,job,async (key,info)=>{
        // Recheck holds and the leased account just before persisting the irreversible action.
        const live=await sql(env,'SELECT c.account,c.token,c.lease,c.next_at,h.kind,n.hold_until FROM nh_control c JOIN nh_health h ON h.id=c.id JOIN nh_v13_connection n ON n.slot=? WHERE c.id=1',slot).first();
        const at=Date.now();
        if(job.link && info?.title && this.one("SELECT 1 FROM desk_work_schedule WHERE pub IS NULL AND (key=? OR (key IS NULL AND title=?)) LIMIT 1",key,info.title)){
          return '同じ作品が完成稿欄に登録済みです。既存の予定と「予約済み」を確認してください。';
        }
        if(job.kind==='publish' && !job.link){
          const plan=this.one('SELECT scheduled FROM desk_link_plan WHERE article=?',key);
          if(plan && plan.scheduled!==job.scheduled)return '共有リンクの予約日時が異なるため公開保留';
          if(this.one('SELECT 1 FROM desk_work_schedule WHERE key=? AND seq<>? LIMIT 1',key,Number(job.subject)))return '別の完成稿が同じ下書きを指定・公開保留';
        }
        if(!live || live.account!==account.id || live.token!==lease || live.lease<=at || live.hold_until>at || (live.kind && live.next_at>at) || !this.canDeliver(job,at))return false;
        return this.storage.transactionSync(()=>{
          if(job.kind==='publish' && (!info || info.cover===null || !info.title || this.publicationSent(key) || this.one('SELECT 1 FROM desk_archive WHERE article=?',key)))return false;
          const marked=this.one("UPDATE desk_job SET phase='sent',target=?,at=?,message='操作開始を記録・結果は未確認（自動再送なし）' WHERE kind=? AND subject=? AND phase='wait' RETURNING subject",job.kind==='publish'?key:job.target,at,job.kind,job.subject);
          if(!marked)return false;
          if(job.kind==='mag' && job.old)this.rows('UPDATE desk_scout_state SET older=1-older WHERE id=1');
          const pending='操作済み ／ noteの公開状態とタイトル・本文・見出し画像を確認待ち';
          if(job.kind==='publish')this.rows('INSERT INTO desk_snapshot(article,title,body_hash) VALUES(?,?,?)',key,info.title,info.hash);
          if(job.link){
            this.rows('UPDATE desk_link_plan SET cover=?,title=?,check_at=?,result=? WHERE article=?',info.cover,info.title,at+5*M520,pending,key);
            this.rows("UPDATE desk_job SET label=? WHERE kind='publish' AND subject=?",info.title,key);
          }else if(job.kind==='publish'){
            this.rows('INSERT OR IGNORE INTO desk_draft_identity(seq,article) VALUES(?,?)',Number(job.subject),key);
            this.rows('UPDATE desk_link_plan SET title=? WHERE article=?',info.title,key);
            this.rows('INSERT INTO desk_work_cover(seq,article,scheduled,cover,check_at,result) VALUES(?,?,?,?,?,?)',Number(job.subject),key,job.scheduled,info.cover,at+5*M520,pending);
          }
          return true;
        });
      });
      message=result.message;
      if(result.seen)this.rows("UPDATE desk_job SET phase='seen',message=?,at=? WHERE kind=? AND subject=? AND phase='wait'",message,Date.now(),job.kind,job.subject);
      if(result.hold){
        const until=Date.now()+result.hold;
        this.rows('UPDATE desk_cfg SET blocked=MAX(blocked,?) WHERE id=1',until);
        await sql(this.env,'UPDATE nh_v13_connection SET hold_until=MAX(hold_until,?) WHERE slot=?',until,slot).run();
      }
    }catch(error){
      if(readLimit(error)){message='D1の読み取り枠更新後に確認';retry=(day+1)*D520+M520-now;this.rows('UPDATE desk_delivery SET due=? WHERE id=1',now+retry);}
    }finally{
      this.rows("UPDATE desk_job SET message=?,next=?,at=? WHERE kind=? AND subject=? AND phase='wait'",message,Date.now()+retry,Date.now(),job.kind,job.subject);
      if(lease)await release(env,lease);
    }
  }
  async ensureRecommendation(now) {
    const state=this.one('SELECT * FROM desk_recommend WHERE id=1');
    if(state.done || state.due>now)return;
    const cfg=this.one('SELECT enabled,blocked FROM desk_cfg WHERE id=1');
    if(!cfg.enabled || cfg.blocked>now)return;
    const binding=this.env?.BROWSER;
    if(typeof binding?.acquire!=='function'){
      this.rows("UPDATE desk_recommend SET due=?,message='ブラウザー未接続・note設定の確認待ち' WHERE id=1",now+HOUR);
      return;
    }
    // Reserve the work locally before any await; network errors survive restarts.
    this.rows("UPDATE desk_recommend SET due=?,message='520のおすすめ設定を確認中' WHERE id=1",now+HOUR);
    let message='520の登録・接続状態を確認できず・再確認待ち',due=now+6*HOUR,done=0;
    try {
      let profile;
      try {profile=(await this.publicRead('https://note.com/api/v2/creators/43__','json'))?.data;} catch {}
      const numericId=u=>u?.urlname==='43__' && /^[1-9]\d{0,19}$/.test(String(u.id)) ? String(u.id) : '';
      let id=numericId(profile);
      if(!id) {
        const old=this.one('SELECT article FROM desk_archive ORDER BY pub DESC,article LIMIT 1');
        if(!old){message='520の公開作者IDを未確認・次回再確認';return;}
        const n=(await this.publicRead('https://note.com/api/v3/notes/'+old.article,'json'))?.data;
        if(n?.key===old.article)id=numericId(n.user);
        if(!id){message='520の公開作者IDを未確認・次回再確認';return;}
      }
      const slots=await this.env.DB.batch(SLOTS.map(slot=>sql(scoped(this.env,slot),
        'SELECT c.lease,c.next_at,h.kind,n.hold_until FROM nh_control c JOIN nh_health h ON h.id=c.id JOIN nh_v13_connection n ON n.slot=? WHERE c.id=1 AND c.account=?',slot,id)));
      const match=SLOTS.filter((_,i)=>slots[i].results.length===1);
      if(match.length!==1)return;
      const slot=match[0], gate=slots[SLOTS.indexOf(slot)].results[0];
      const after=Math.max(gate.lease,gate.hold_until,gate.kind?gate.next_at:0);
      if(after>now){message='登録済みアカウントの処理・待機の終了後に確認';due=after+1000;return;}
      const credential=await loadCookie(scoped(this.env,slot),id);
      const cookie=cleanCookie(credential.NOTE_SESSION);
      const today=Math.floor(now/D520);
      const used=state.utc_day===today?state.used:0;
      if(used>=2){due=(today+1)*D520+60000;message='本日の設定確認済み・次回確認待ち';return;}
      this.rows('UPDATE desk_recommend SET utc_day=?,used=? WHERE id=1',today,used+1);
      message='Cloudflareのブラウザーを起動できず・再確認待ち';
      const result=await browserRecommendation(binding,id,cookie,state.attempted,state.tries,()=>{
        this.rows("UPDATE desk_recommend SET attempted=?,tries=tries+1,message='ON操作の保存結果を確認待ち' WHERE id=1",Date.now());
      });
      message=result.message;done=Number(!!result.done);
      due=result.retryAt??(now+(result.verify?4*M520:D520));
      if(result.hold>0){
        due=Math.max(due,Date.now()+result.hold);
        this.rows('UPDATE desk_cfg SET blocked=MAX(blocked,?) WHERE id=1',Date.now()+result.hold);
        await sql(this.env,'UPDATE nh_v13_connection SET hold_until=MAX(hold_until,?) WHERE slot=?',Date.now()+result.hold,slot).run();
      }
    } catch(error) {
      if(readLimit(error)){message='D1の読み取り枠更新後に再確認';due=(Math.floor(now/D520)+1)*D520+60000;}
    } finally {
      this.rows('UPDATE desk_recommend SET done=?,due=?,message=?,checked=? WHERE id=1',done,due,message,Date.now());
    }
  }
  async frontPageBackup(now) {
    const row=this.one('SELECT fallback_at FROM desk_recommend WHERE id=1');
    const cfg=this.one('SELECT enabled,rss_ok,blocked FROM desk_cfg WHERE id=1');
    if(!cfg.enabled || cfg.blocked>now || row.fallback_at>now || (cfg.rss_ok && cfg.rss_ok>now-HOUR))return;
    const catalog=this.one('SELECT page,due FROM desk_catalog WHERE id=1');
    if(catalog.page===1 && catalog.due<=now)return;
    this.rows('UPDATE desk_recommend SET fallback_at=? WHERE id=1',now+16*M520);
    try {
      const data=(await this.publicRead('https://note.com/api/v2/creators/43__/contents?kind=note&page=1','json'))?.data;
      if(!Array.isArray(data?.contents) || data.contents.length>100 || Number(data.page??data.currentPage??1)!==1)return;
      const entries=data.contents.filter(isPublishedBy520).map(publicEntry520);
      const newDue=this.storage.transactionSync(()=>this.registerEntries(entries,now));
      if(newDue)await this.measure(Date.now());
    } catch {}
  }
  async verifyLinkCover(now){
    const cfg=this.one('SELECT enabled,blocked FROM desk_cfg WHERE id=1');
    if(!cfg.enabled || cfg.blocked>now)return;
    const p=this.one('SELECT article,cover,scheduled,check_at,1 AS link FROM desk_link_plan WHERE check_at<=? UNION ALL SELECT article,cover,scheduled,check_at,0 AS link FROM desk_work_cover WHERE check_at<=? ORDER BY check_at LIMIT 1',now,now);
    if(!p)return;
    const expired=now>p.scheduled+7*D520;
    const table=p.link?'desk_link_plan':'desk_work_cover';
    this.rows("UPDATE "+table+" SET check_at=?,result=CASE WHEN result LIKE '同じ記事IDでnote公開中%' THEN result ELSE '公開後の状態・本文・見出し画像は未確認' END WHERE article=?",expired?null:now+HOUR,p.article);
    try {
      const n=(await this.publicRead('https://note.com/api/v3/notes/'+p.article,'json'))?.data;
      const pub=Date.parse(n?.publishAt||n?.publish_at||n?.publishedAt);
      if(n?.key!==p.article || n.user?.urlname!=='43__' || !text520(n.name,300) || n.name.trim()==='521' ||
        n.status!=='published' || !Number.isFinite(pub) || pub<=0 || pub>now)return;
      const proof=this.one('SELECT title,body_hash FROM desk_snapshot WHERE article=?',p.article);
      const full=n.is_limited!==true && n.is_paid!==true && !(Number(n.price)>0);
      const actualHash=proof && full?await draftBodyHash(n.body):null;
      const after=Object.hasOwn(n,'eyecatch')?coverId(n.eyecatch):null;
      const title=proof?(proof.title===n.name?'一致':'相違'):'旧版・公開前の記録なし';
      const body=proof?(actualHash?(actualHash===proof.body_hash?'一致':'公開前後のHTMLに差分あり'):'未確認'):'旧版・公開前の記録なし';
      const image=after===null?'公開後の見出し画像は未確認':p.cover!==after?'公開前後で見出し画像が異なります。':
        after?'公開前後で見出し画像の参照先が一致':'公開前後とも見出し画像なし（自動サムネイルの見た目は未確認）';
      const result='同じ記事IDでnote公開中 ／ タイトル '+title+' ／ 本文 '+body+' ／ '+image;
      this.storage.transactionSync(()=>{
        this.registerEntries([{key:p.article,pub,title:n.name}],now);
        this.rows('UPDATE desk_snapshot SET confirmed=COALESCE(confirmed,?) WHERE article=?',now,p.article);
        this.rows("UPDATE desk_job SET phase='confirmed',message='同じ記事IDでnote公開中を確認',at=? WHERE kind='publish' AND target=? AND phase='sent'",now,p.article);
        if(!p.link)this.rows('UPDATE desk_work SET article=?,pub=COALESCE(pub,?) WHERE seq=(SELECT seq FROM desk_work_cover WHERE article=?) AND (article IS NULL OR article=?)',p.article,pub,p.article,p.article);
        this.rows('UPDATE '+table+' SET result=?,check_at=? WHERE article=?',result,!expired && (after===null || (proof && !actualHash))?now+HOUR:null,p.article);
      });
    }catch{ /* A failed read leaves the result unknown; it never queues another publication. */ }
  }
  async tick() {
    this.init();
    const now=Date.now();
    // A publication with a five-minute window gets the first use of this tick.
    const publication=this.duePublication(now);
    if(publication)await this.dispatch(now);
    await Promise.all([this.tickRecords(),this.automaticDirectory(now),this.catalogue(now),this.observeArchive(now),
      this.ensureRecommendation(now),this.frontPageBackup(now)]);
    this.planArchive(Date.now());
    if(!publication)await this.dispatch(Date.now());
    await this.verifyLinkCover(Date.now());
    await this.lookupDraftTitle(Date.now());
    try{await this.resolveDraftDirectory(Date.now());}catch{ /* Metadata can be retried without interrupting other tasks. */ }
    await this.scoutLiterary(Date.now());
  }
  async tickRecords() {
    const cfg=this.one('SELECT * FROM desk_cfg WHERE id=1'), now=Date.now();
    if(!cfg.enabled || now-cfg.tick_at<2*M520) return;
    this.rows('UPDATE desk_cfg SET tick_at=? WHERE id=1',now);
    // Catch up whole missed days without inventing follower values.
    const previous=cfg.tick_at || cfg.started;
    const from=Math.max(jstStart(jstDay(previous)),jstStart(jstDay(now))-90*D520);
    for(let t=from;t<jstStart(jstDay(now));t+=D520) {
      this.rows("INSERT INTO desk_follower(d,state) VALUES(?,'欠測') ON CONFLICT(d) DO UPDATE SET state='欠測' WHERE value IS NULL",jstDay(t));
    }
    const hourly=!cfg.tick_at || Math.floor(cfg.tick_at/HOUR)!==Math.floor(now/HOUR);
    const checkProbe=hourly || !this.probeChecked;
    this.probeChecked=true;
    const [,,newDue,magUpdated]=await Promise.all([this.followers(now),this.measure(now),this.feed(now),this.magazines(now),checkProbe && this.probe(now)]);
    if(newDue) await this.measure(Date.now());
    if(hourly || magUpdated || cfg.rss_at>0 && cfg.rss_at<=now) this.match(now);
    if(hourly) this.weekly(Date.now());
    if(!cfg.tick_at || jstDay(cfg.tick_at)!==jstDay(now)) this.planTimes(now);
  }
}
// Keep only JPEG image-coding segments. Drop APP0–APP15, COM and everything after EOI.
function cleanJpeg520(bytes) {
  const bad=()=>{throw new Input520('写真をJPEGに変換できません。別の写真を選んでください。');};
  if(bytes[0]!==255 || bytes[1]!==216) bad();
  const parts=[bytes.subarray(0,2)]; let at=2,scan=false,frame=false,scans=0;
  while(at<bytes.length) {
    if(scan) {
      const start=at;
      while(at<bytes.length) {
        if(bytes[at]!==255){at++;continue;}
        let next=at+1;
        while(bytes[next]===255) next++;
        if(bytes[next]===0 || (bytes[next]>=208 && bytes[next]<=215)){at=next+1;continue;}
        break;
      }
      parts.push(bytes.subarray(start,at)); scan=false;
    }
    const start=at;
    if(bytes[at++]!==255) bad();
    while(bytes[at]===255) at++;
    const code=bytes[at++];
    if(code===217) {
      if(!frame || !scans) bad();
      parts.push(Uint8Array.of(255,217));
      const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0)); let off=0;
      for(const part of parts){out.set(part,off);off+=part.length;}
      return out;
    }
    const len=bytes[at]*256+bytes[at+1];
    if(!Number.isInteger(len) || len<2 || at+len>bytes.length) bad();
    if(code===192 || code===193 || code===194) {
      if(len<8) bad();
      const h=bytes[at+3]*256+bytes[at+4],w=bytes[at+5]*256+bytes[at+6];
      if(!h||!w||h>2400||w>2400) bad();
      frame=true;
    }
    if(code===218) {scan=true;scans++;}
    const allowed=[192,193,194,196,218,219,221].includes(code);
    if(allowed) parts.push(bytes.subarray(start,at+len));
    else if(!(code>=224 && code<=239) && code!==254) bad();
    at+=len;
  }
  bad();
}
// Public note links are used as identifiers. Never forward cookies, fragments or share parameters.
function noteLink161(input,base='https://note.com',kind='mag') {
  if(typeof input!=='string'||!input.trim()) return null;
  try {
    const u=new URL(xmlValue520(input.trim()),base);
    if(u.origin!=='https://note.com'||u.username||u.password) return null;
    const re=kind==='mag'?/^\/(?:(\w[\w-]{0,79})\/)?m\/(m[a-z0-9]{1,64})\/?$/:/^\/(\w[\w-]{0,79})\/n\/(n[a-z0-9]{1,64})\/?$/;
    const m=re.exec(u.pathname);
    if(m) return {url:u.origin+u.pathname.replace(/\/$/,''),owner:m[1]||'',id:m[2]};
  } catch {}
  return null;
}
function cleanHtml161(s) {
  return s.replace(/<!--[\s\S]*?-->|<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
}
function words161(s) {
  return xmlValue520(cleanHtml161(s).replace(/<(?:br\b[^>]*|\/(?:li|p|div|h[1-6]|tr|section))>/gi,'\n')
    .replace(/<[^>]+>/g,'')).replace(/&nbsp;|\u00a0/gi,' ').trim();
}
function attr161(tag,name) {
  const m=new RegExp('(?:^|\\s)'+name+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))','i').exec(tag);
  return m?xmlValue520(m[1]??m[2]??m[3]):'';
}
function anchors161(html) {
  return Array.from(cleanHtml161(html).matchAll(/<a\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/a\s*>/gi),m=>({href:attr161(m[1],'href'),label:(attr161(m[1],'aria-label')||words161(m[2])).trim().slice(0,180)}));
}
function meta161(html,field) {
  for(const [tag] of cleanHtml161(html).matchAll(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi))
    if((attr161(tag,'property')||attr161(tag,'name')).toLowerCase()===field) return attr161(tag,'content');
  return '';
}
const ruleLabel161=/(?:募集(?:要項|条件|規定|ルール|記事)|投稿(?:要項|条件|規定|ルール|ガイド)|参加(?:要項|方法|条件|規約|ルール)|掲載(?:条件|基準|規定)|運営(?:方針|ルール)|ガイドライン|応募要項)/;
function ruleLinks161(description,base) {
  const found=new Map();
  for(const a of anchors161(description)){
    const v=noteLink161(a.href,base,'article');
    if(v && ruleLabel161.test(a.label))found.set(v.id,v);
  }
  const lines=words161(description).split(/[。\n]+/);
  for(let i=0;i<lines.length;i++) {
    if(!ruleLabel161.test(lines[i]) && !(i>0 && ruleLabel161.test(lines[i-1]) && /^\s*https:/.test(lines[i])))continue;
    for(const m of lines[i].matchAll(/https:\/\/note\.com\/[\w-]+\/n\/n[a-z0-9]+/g)){
      const v=noteLink161(m[0],base,'article');if(v)found.set(v.id,v);
    }
  }
  return [...found.values()];
}
function clauses161(input) {
  return words161(input).normalize('NFKC').replace(/(\d),(?=\d{3}(?:\D|$))/g,'$1')
    .split(/[。；;\n]+/).map(s=>s.trim().replace(/^[\s・●○■※◆▶▷*-]+/,'').replace(/\s+/g,'')).filter(Boolean);
}
// Parse explicit permitted sets only. An unknown restriction keeps the item out of matching.
function magazinePolicy161(source,context='') {
  const clauses=clauses161(source);
  const groups={genres:new Set(),methods:new Set()};
  const denied={genres:new Set(),methods:new Set()};
  const only={},bounds=[],seen={previous:false,tags:false,intro:false};
  const missing=[],unknown=[],excluded=[];
  const methods={本人執筆:'本人執筆',人間執筆:'本人執筆',人力執筆:'本人執筆',AI補助:'AI補助',AI支援:'AI補助',AI生成:'AI生成',生成AIによる執筆:'AI生成'};
  const genres=Object.fromEntries(genre520.map(v=>[v,v]));
  function tokens(line,kind) {
    const dict=kind==='genres'?genres:methods;
    const split=line.split(/[・、,／/と]+/);
    if(!split.length || split.some(v=>!Object.hasOwn(dict,v))) return [];
    return split.map(v=>dict[v]);
  }
  const optional=/^((?:ハッシュタグ|タグ|自己紹介(?:記事)?)(?:(?:・|、|と|および|や|も)(?:ハッシュタグ|タグ|自己紹介(?:記事)?))?)(?:の(?:記入|追加|提出|設定|指定|投稿)|付け)?(?:も|は|が|:)?(?:不要|任意|自由|なし|不要です|任意です|必要ありません|ありません|必須ではありません)$/;
  function prohibition(s) {
    if(optional.test(s))return '';
    if(/(?:ハッシュタグ|タグ|自己紹介)/.test(s) && /必須|必ず|義務|をつけてください|を付けてください|をお願いします|が必要|してください/.test(s)) return 'タグか自己紹介を求める記載';
    if(/未発表(?:の作品)?(?:に限|のみ|限定)|(?:既発表|再掲|過去記事)(?:作品)?(?:は|が)?(?:不可|禁止|NG|お断り)/i.test(s)) return '既発表作品の制限';
    return '';
  }
  for(const s of [...clauses,...clauses161(context)]) {
    const why=prohibition(s); if(why) excluded.push(why);
  }
  for(const line of clauses161(context)){
    if(prohibition(line))continue;
    if(/(必須|に限[るり]|のみ|投稿数|[0-9]+(?:字|文字)|1日.{0,8}(?:本|回)|曜日指定|限定|対象外|要審査|事前承認|休止中|受付停止|不可|禁止|NG|をお願いします|にしてください|をしてください)/i.test(line) && !clauses.includes(line))unknown.push(line);
  }
  for(let line of clauses) {
    if(/^(?:こんにちは|はじめまして|いつも(?:当マガジンを)?(?:お読み|ご覧)いただきありがとうございます|ご参加ありがとうございます|よろしくお願いいたします|以上です|このマガジンの(?:投稿|募集|掲載)条件(?:をご案内します|は以下のとおりです)|https:\/\/note\.com\/(?:[\w-]+\/)?m\/m[a-z0-9]+)[!！]?$/.test(line))continue;
    line=line.replace(/^投稿(?:時|の際)(?:には|に|は)?[、,]?/,'')
      .replace(/^(?:本文|原稿|作品)の(?:長さ|字数|文字数)(?:は|:)/,'字数:')
      .replace(/^(?:過去に公開した|すでに公開した|すでに発表した)(?:作品|記事)(?:も|は)/,'既発表作品も')
      .replace(/(?:を募集しています|を募集します|が対象です|も受け付けています)$/,'を募集します')
      .replace(/^(既発表作品も)(?:掲載できます|投稿できます|受け付けています|受け付けます)$/,'$1可');
    if(/^(?:【?(?:募集要項|投稿ルール|募集条件|掲載条件|応募要項|参加条件|マガジンについて|投稿規定)】?[:：]?|(?:その他の)?条件(?:は)?(?:なし|ありません)|文芸(?:系)?(?:の)?共同運営マガジン(?:です)?|以下の(?:通り|とおり)です)$/.test(line)) continue;
    line=line.replace(/^[【\[]([^】\]]+)[】\]]/,'$1:');
    let s=line.replace(/^(?:(?:作品の)?(?:文字数|字数|長さ))[:は]/,'');
    let m;
    if(/^(?:文字数|字数)?(?:の)?(?:制限|指定)(?:は)?(?:なし|無し|ありません)$|^(?:不問|自由|上限なし|制限なし)$/.test(s) && (s!==line || /字数|文字数/.test(line))) {bounds.push([0,1000000]);continue;}
    if(/^(?:文字数|字数)(?:は不問です|は問いません|を問いません|制限はありません)$/.test(line)) {bounds.push([0,1000000]);continue;}
    if((m=/^(\d+)(?:文字|字)?(?:[~〜～−–-]|以上)(\d+)(?:文字|字)(?:以内|以下|まで)?$/.exec(s))) {bounds.push([+m[1],+m[2]]);continue;}
    if((m=/^(\d+)(?:文字|字)(以内|以下|まで|以上)$/.exec(s))) {bounds.push(m[2]==='以上'?[+m[1],1000000]:[0,+m[1]]);continue;}
    if(/^(?:既発表(?:の)?(?:作品|記事)?|公開済み(?:の)?(?:作品|記事)?|過去(?:作品|記事)|再掲)(?:の掲載|の投稿)?(?:も|は|で)?(?:可|OK|歓迎|可能|可です|可能です)$/.test(line)) {seen.previous=true;continue;}
    if((m=optional.exec(line))) {
      if(/タグ/.test(m[1]))seen.tags=true;
      if(/自己紹介/.test(m[1]))seen.intro=true;
      continue;
    }
    let recognized=false;
    for(const kind of ['genres','methods']) {
      const heading=kind==='genres'?/^(?:対象ジャンル|募集ジャンル|応募ジャンル|ジャンル|募集作品|対象作品)[:は]/:/^(?:制作方法|執筆方法|制作手法|対象の制作方法)[:は]/;
      const raw=line.replace(heading,'');
      const suffix=/(?:の作品)?(?:の投稿)?(?:を|は|も)?(のみ(?:可)?|可|OK|歓迎|を募集します|募集します|不可|禁止|NG)$/i.exec(raw);
      const terms=tokens(suffix?raw.slice(0,suffix.index):raw,kind);
      if(!terms.length || (!suffix && line===raw))continue;
      const target=suffix && /不可|禁止|NG/i.test(suffix[1])?denied[kind]:groups[kind];
      if(suffix?.[1].startsWith('のみ')) {
        const allowed=new Set(terms);
        if(kind==='genres' && allowed.has('小説')) allowed.add('短編小説');
        (only[kind] ||= []).push(allowed);
      }
      for(const term of terms){target.add(term);if(kind==='genres' && term==='小説')target.add('短編小説');}
      recognized=true;break;
    }
    if(!recognized && !prohibition(line)) unknown.push(line);
  }
  const lowers=[...new Set(bounds.map(b=>b[0]).filter(n=>n>0))];
  const uppers=[...new Set(bounds.map(b=>b[1]).filter(n=>n<1000000))];
  const range=bounds.length && lowers.length<=1 && uppers.length<=1?[lowers[0]??0,uppers[0]??1000000]:null;
  if(!range || range[1]<range[0] || range[1]>1000000) missing.push('字数');
  const result={};
  for(const [kind,label] of [['genres','ジャンル'],['methods','制作方法']]) {
    const overlap=[...groups[kind]].some(v=>denied[kind].has(v));
    result[kind]=[...groups[kind]].filter(v=>!denied[kind].has(v));
    if(!result[kind].length || overlap || only[kind]?.some(set=>result[kind].some(v=>!set.has(v))))missing.push(label);
  }
  if(!seen.previous)missing.push('既発表可否');
  if(!seen.tags)missing.push('タグの要否');
  if(!seen.intro)missing.push('自己紹介の要否');
  if(!/(?:文学|文芸|小説|エッセイ|詩|散文)/.test(source+context))missing.push('文芸分野');
  if(unknown.length)missing.push('読み切れない文・追加条件');
  const summary=[range?'字数 '+(range[0]||0)+'〜'+(range[1]===1000000?'上限なし':range[1]):'',result.genres.join('・'),result.methods.join('・')].filter(Boolean).join(' ／ ');
  const state=excluded.length?'対象外':missing.length?'保留':'利用中';
  const reason=excluded.length?[...new Set(excluded)].join('・'):missing.join('・');
  return {state,reason,summary,draft:{min:range?.[0]??null,max:range?.[1]??null,...result},policy:state==='利用中'?{min:range[0],max:range[1],...result}:null};
}
const importSchema161=[
  "CREATE TABLE IF NOT EXISTS desk_directory(id INTEGER PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, due INTEGER NOT NULL DEFAULT 0, token TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '未検索')",
  "INSERT OR IGNORE INTO desk_directory(id) VALUES(1)",
  "CREATE TABLE IF NOT EXISTS desk_import(id TEXT PRIMARY KEY, url TEXT NOT NULL, name TEXT NOT NULL, allowed INTEGER NOT NULL DEFAULT 0, managed INTEGER NOT NULL DEFAULT 0, supplied TEXT NOT NULL DEFAULT '', rules TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT '許可前', reason TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL DEFAULT '', draft TEXT NOT NULL DEFAULT '{}', due INTEGER NOT NULL DEFAULT 0, token TEXT NOT NULL DEFAULT '')",
  "CREATE INDEX IF NOT EXISTS desk_import_due ON desk_import(allowed,due)"
];
function directoryRedirect161(from,to) {
  let a,b;
  try {a=new URL(from);b=new URL(to,a);} catch {return null;}
  if(b.origin!=='https://note.com' || b.username || b.password) return null;
  const isFeed=a.pathname.endsWith('/rss');
  const mag=noteLink161(a.origin+a.pathname.replace(/\/rss$/,''));
  if(mag) {
    const dest=noteLink161(b.origin+b.pathname.replace(/\/rss$/,''));
    if(dest?.id!==mag.id || isFeed!==b.pathname.endsWith('/rss'))return null;
    return dest.url+(isFeed?'/rss':'');
  }
  if(!/^\/43__(?:\/magazines)?\/?$/.test(a.pathname) || !/^\/43__(?:\/magazines)?\/?$/.test(b.pathname))return null;
  if(b.search && !/^\?page=\d+$/.test(b.search))return null;
  return b.origin+b.pathname+b.search;
}
const growthSchema162=[
  "CREATE TABLE IF NOT EXISTS desk_catalog(id INTEGER PRIMARY KEY,page INTEGER DEFAULT 1,due INTEGER DEFAULT 0,signature TEXT DEFAULT '',partial INTEGER DEFAULT 0,message TEXT DEFAULT '公開一覧を確認待ち')",
  'INSERT OR IGNORE INTO desk_catalog(id) VALUES(1)',
  "CREATE TABLE IF NOT EXISTS desk_archive(article TEXT PRIMARY KEY,title TEXT NOT NULL,pub INTEGER NOT NULL,genre TEXT,chars INTEGER,likes INTEGER,at INTEGER,previous INTEGER,prior_at INTEGER,due INTEGER DEFAULT 0,verified INTEGER DEFAULT 0,pick_due INTEGER DEFAULT 0,pick_rev INTEGER DEFAULT 0,choice TEXT,state TEXT DEFAULT '詳細取得待ち')",
  'CREATE TABLE IF NOT EXISTS desk_archive_hint(article TEXT PRIMARY KEY,due INTEGER DEFAULT 0)',
  'CREATE INDEX IF NOT EXISTS desk_archive_hint_due ON desk_archive_hint(due,article)',
  'CREATE TABLE IF NOT EXISTS desk_public_pages(id INTEGER PRIMARY KEY,page INTEGER DEFAULT 1,due INTEGER DEFAULT 0)',
  'INSERT OR IGNORE INTO desk_public_pages(id) VALUES(1)',
  'CREATE INDEX IF NOT EXISTS desk_archive_title ON desk_archive(title,pub)',
  'CREATE TABLE IF NOT EXISTS desk_pick_meta(id INTEGER PRIMARY KEY,rev INTEGER NOT NULL DEFAULT 1)',
  'INSERT OR IGNORE INTO desk_pick_meta(id) VALUES(1)',
  'CREATE INDEX IF NOT EXISTS desk_archive_pick_due ON desk_archive(pick_due,article)',
  'CREATE INDEX IF NOT EXISTS desk_archive_pick_rev ON desk_archive(pick_rev,article)',
  'CREATE INDEX IF NOT EXISTS desk_archive_due ON desk_archive(due,article)',
  'CREATE INDEX IF NOT EXISTS desk_archive_pub ON desk_archive(pub DESC,article)',
  'CREATE INDEX IF NOT EXISTS desk_measured_pub ON desk_sample(age,seq) WHERE value IS NOT NULL',
  'CREATE TABLE IF NOT EXISTS desk_release(id INTEGER PRIMARY KEY,article TEXT NOT NULL UNIQUE,title TEXT NOT NULL,pub INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS desk_release_pub ON desk_release(pub)',
  'CREATE INDEX IF NOT EXISTS desk_release_title ON desk_release(title,pub)',
  "CREATE TABLE IF NOT EXISTS desk_member(id TEXT PRIMARY KEY, mode TEXT NOT NULL DEFAULT 'check', due INTEGER NOT NULL DEFAULT 0, checked INTEGER NOT NULL DEFAULT 0, ticket TEXT NOT NULL DEFAULT '', reason TEXT NOT NULL DEFAULT '運営資格を確認待ち')",
  'CREATE INDEX IF NOT EXISTS desk_member_due ON desk_member(mode,due)',
  'CREATE TABLE IF NOT EXISTS desk_ref(article TEXT NOT NULL,id TEXT NOT NULL,name TEXT NOT NULL,url TEXT NOT NULL,observed INTEGER NOT NULL,PRIMARY KEY(article,id))',
  'CREATE INDEX IF NOT EXISTS desk_ref_by_mag ON desk_ref(id,observed)',
  'CREATE TABLE IF NOT EXISTS desk_growth(id INTEGER PRIMARY KEY,started INTEGER NOT NULL)',
  `CREATE VIEW IF NOT EXISTS desk_entries AS
    SELECT COALESCE(-r.id,w.seq) seq,w.seq workseq,w.article,w.title,w.pub,w.genre FROM desk_work w LEFT JOIN desk_release r ON r.article=w.article WHERE w.pub IS NOT NULL
    UNION ALL SELECT -r.id,NULL,r.article,r.title,r.pub,a.genre FROM desk_release r LEFT JOIN desk_archive a ON a.article=r.article WHERE NOT EXISTS(SELECT 1 FROM desk_work w WHERE w.article=r.article)`
];
function magHeader162(html,link) {
  const canonical=noteLink161(meta161(html,'og:url'));
  const output={member:false,joint:false,free:false,paid:false};
  if(canonical?.id!==link.id)return output;
  const stack=[],ids=new Set();
  // Only native magazine-header/member containers. Descriptions and article lists may quote any account.
  const clean=cleanHtml161(html);
  for(const m of clean.matchAll(/<(\/?)([\w:-]+)\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>|([^<]+)/g)){
    if(m[4]!==undefined){
      const node=stack.at(-1);
      if(!node?.head || node.ignore)continue;
      const t=xmlValue520(m[4]).trim();
      if(node.price){
        if(/^無料(?:マガジン)?$/.test(t))output.free=true;
        if(/有料|定期購読|[¥￥]|\d[\d,]*円/.test(t))output.paid=true;
      }
      if(node.group && /^(?:運営しているクリエイター|共同運営メンバー|運営メンバー)$/.test(t))node.group.label=true;
      continue;
    }
    const tag=m[2].toLowerCase();
    if(m[1]){
      let i=stack.length-1;while(i>=0 && stack[i].tag!==tag)i--;
      if(i>=0)stack.length=i;
      continue;
    }
    const parent=stack.at(-1),cl=attr161(m[3],'class').toLowerCase();
    const head=parent?.head || /magazine[-_]?header|magazine[-_]?(?:editor|operator|member|creator)(?:s|list)/.test(cl);
    const ignore=parent?.ignore || tag==='article'||/description|articlelist|noteitem|bio(?:graphy)?/.test(cl);
    let group=parent?.group;
    if(!group && head && !ignore && /(?:editor|operator|manageuser|member|creator)(?:s|list|area|block)|magazineheader__(?:creator|member)/.test(cl))group={label:false,urls:new Set()};
    if(head && !ignore && group && tag==='a'){
      let path;
      try{const u=new URL(attr161(m[3],'href'),link.url);if(u.origin==='https://note.com')path=u.pathname;}catch{}
      if(path && /^\/[\w-]+\/?$/.test(path))group.urls.add(path.replaceAll('/',''));
    }
    if(group)ids.add(group);
    if(!/^(?:meta|link|img|input|br|hr|path|source|area|wbr|embed|param|track|col|base)$/.test(tag) && !m[3].endsWith('/'))
      stack.push({tag,head,ignore,group,price:head && (parent?.price || /price|pricelabel/.test(cl))});
  }
  for(const group of ids){
    if(group.label && group.urls.has('43__')){output.member=true;if(group.urls.size>=2)output.joint=true;}
  }
  return output;
}
function editorialProof162(link,payload,html){
  const h=magHeader162(html,link),data=payload?.data?.magazine??payload?.data;
  const d=data?.key===link.id?data:null;
  const canonical=d && (d.magazineUrl||d.magazine_url||d.url);
  if(canonical && noteLink161(canonical)?.id!==link.id)return {ok:false,reason:'誌面IDを確認できません'};
  const users=new Set();
  const add=u=>{const id=u?.urlname??u?.user?.urlname;if(typeof id==='string')users.add(id);};
  if(d){
    for(const field of ['editors','operators','manageUsers','manage_users','editorialMembers']){
      if(Array.isArray(d[field]))d[field].forEach(add);
    }
    if(Array.isArray(d.members))d.members.filter(x=>['owner','editor','operator','admin'].includes(x?.role)).forEach(add);
    if(d.owner)add(d.owner);
  }
  const joint=h.joint || users.size>=2 || d?.isJoint===true || d?.is_joint===true;
  const owner=d?.owner?.urlname==='43__';
  const member=h.member || owner || users.has('43__');
  if(!member || !joint)return {ok:false,reason:'共同運営者としての43__を公開情報で確認できません'};
  const paid=h.paid || d?.isPaid===true || d?.is_paid===true || Number(d?.price)>0 ||
    /^(paid|subscription|membership)$/i.test(d?.magazineType??d?.type??'');
  const free=h.free || d?.price===0 || d?.isFree===true || d?.magazineType==='free';
  if(paid||!free)return {ok:false,reason:paid?'有料の誌面は対象外':'無料の誌面か確認できません'};
  return {ok:true,reason:'無料・共同運営者43__を公開情報で確認'};
}
function publishedChars162(note) {
  const declared=count520(note,['characterCount','character_count']);
  if(declared!==null)return declared;
  if(note.price!==0 || typeof note.body!=='string' || !note.body || note.isLimited===true ||
     note.isPaid===true || note.hasPaywall===true || note.isPreview===true || note.hasAvailableCirclePlans===true)return null;
  // Only simple free text; teasers, embeds and complex markup do not establish a count.
  if(!/<p[\s>]/i.test(note.body) || /<(?!\/?(?:p|br|strong|em|b|i|a|span|h[1-6])(?:\s|\/?\s*>))/.test(note.body))return null;
  const plain=note.body.replace(/<[^>]*>/g,'').replace(/&nbsp;/gi,' ').replace(/[\r\n]/g,'');
  if(/&(?!amp;|lt;|gt;|quot;|apos;|#(?:x[0-9a-f]+|[0-9]+);)[a-z0-9]+;/i.test(plain))return null;
  return [...xmlValue520(plain)].length;
}
function photoKeywords162(caption) {
  const terms=[],parts=String(caption).split('。').filter(Boolean);
  if(parts.length>=2 && parts[0].length<=40)terms.push(parts[0]);
  for(const [pattern,word] of [[/青み/,'青'],[/赤み/,'赤'],[/緑み/,'緑'],[/明るめ/,'明るい'],[/暗め/,'暗め'],[/横長/,'横長'],[/縦長/,'縦長'],[/正方形/,'正方形']]){
    if(pattern.test(parts.at(-1)||''))terms.push(word);
  }
  return [...new Set(terms)].join('、');
}

function deskRecordText(s) {
  const tm=t=>t?time(t):'未記録';
  const val=v=>v===null || v===undefined?'欠測':String(v);
  const lines=['自動記録 '+(s.cfg.enabled?'ON':'開始前')+' ／ 最終起動 '+tm(s.cfg.tick_at),
    '520のRSS '+s.cfg.rss_msg+' ／ 最終成功 '+tm(s.cfg.rss_ok)];
  if(s.scout)lines.push('掲載先探索 ／ 発見 '+s.scout.total+'誌 ／ 現在の掲載条件・編集権限を確認済み '+s.scout.allowed+'誌 ／ '+s.scout.message);
  const checkedPlans=(s.linkPlans||[]).filter(p=>p.result || p.message);
  if(checkedPlans.length){
    lines.push('【予約作品の確認記録】');
    for(const p of checkedPlans)lines.push(tm(p.scheduled)+'　'+(p.title||'登録した下書き')+' ／ '+(p.result||p.message));
  }
  if(s.delivery){
    lines.push('【自動公開・共同誌への追加　'+(s.deliveryOn?'ON':'休止中')+'】');
    if(s.mags)lines.push('無料・共同運営と募集条件を確認済みの候補誌　'+s.mags.length+'誌');
    if(!s.delivery.length)lines.push('操作記録はまだありません。公開時刻が来た登録稿と、掲載条件・編集権限を確認できた作品が対象です。');
    for(const item of s.delivery)lines.push((item.kind==='publish'?'公開':'共同誌')+' ／ '+item.label+' ／ '+item.message+' ／ '+tm(item.at));
  }
  if(s.recommendation)lines.push('記事下の相互おすすめ　'+s.recommendation.message+(s.recommendation.checked?' ／ '+tm(s.recommendation.checked):''));
  if(s.backlist){const b=s.backlist;lines.push('既刊（公開30日以上）のスキ　'+(b.sampled?
    '比較できた'+b.sampled+'本のうち増加'+b.rising+'本 ／ 合計増減 '+b.net:'約1週間隔の計測が2回そろうのを待っています。')+'　直近7日に取得した比較。流入元は未計測。');}
  if(s.probe.at) lines.push('取得テスト '+tm(s.probe.at)+' ／ RSS '+(s.probe.rss||'確認中')+' ／ フォロワー '+(s.probe.creator||'確認中')+' ／ スキ '+(s.probe.article||'確認中'));
  if(s.cfg.blocked>Date.now()) lines.push('note指定の待機 '+tm(s.cfg.blocked)+'まで');
  lines.push('','【登録作品】');
  for(const w of [...s.works].map(w=>{
    if(!w.link_at)return w;
    const stamp=new Date(w.link_at+9*HOUR).toISOString();
    return {...w,d:stamp.slice(0,10),t:stamp.slice(11,16)};
  }).sort((a,b)=>a.d.localeCompare(b.d)||a.t.localeCompare(b.t)||a.seq-b.seq)) {
    lines.push(w.seq+'　'+w.title+'　'+w.chars+'字',w.d+'　'+(w.t||w.suggested||'時刻未定')+(w.locked?'（note予約済み・本人登録）':w.suggested?'（比較データからの時刻）':''),
      w.pub?'公開確認 '+tm(w.pub):w.paused?'予約取り消し済み':!w.locked && (w.t||w.suggested) && Date.now()>Date.parse(w.d+'T'+(w.t||w.suggested)+':00+09:00')+5*M520?'自動公開の時間枠終了・公開結果は確認待ち':'RSSでの公開確認待ち',
      w.magazine?'条件に合う1誌 '+w.magazine+' ／ 誌面での掲載は確認待ち':s.mags.length?'確認済みの条件で該当する誌なし':'条件を確認できた掲載先なし');
    if(w.coverResult)lines.push('見出し画像 ／ '+w.coverResult);
    for(const m of s.placements.filter(m=>m.seq===w.seq)) lines.push('誌面RSSで掲載確認 '+m.name+' ／ '+tm(m.observed));
    for(const p of s.samples.filter(p=>p.seq===w.seq)) lines.push((p.age===1?'24時間':'7日')+'後 '+(p.value===null?p.state:p.value+'スキ')+' ／ '+(p.at?'観測 '+tm(p.at):'予定 '+tm(p.due)));
    lines.push('');
  }
  lines.push('【週次・日本時間の月〜日公開分】','フォロワーは月曜正午から翌月曜正午。平均は公開7日後に測れた作品だけ。');
  for(const w of s.weeks) lines.push(w.start+'週　純増 '+val(w.delta)+' ／ 平均スキ '+(w.avg7===null?'欠測':w.avg7.toFixed(1))+' ／ 計測 '+w.measured+'本・対象 '+w.eligible+'本　'+(w.final?'確定':'7日後の計測中'));
  lines.push('','【520の新作・同じ経過時間で比較】');
  for(const w of s.growth.observed)lines.push(w.title+'　24時間 '+(w.d1??w.state1??'未計測')+' ／ 7日 '+(w.d7??w.state7??'未計測')+' ／ その間の増減 '+(w.d1!==null && w.d7!==null?w.d7-w.d1:'—'));
  lines.push('','【誌面RSSで掲載を確認した作品】');
  for(const r of s.growth.references)lines.push(r.title+'　'+r.name+' ／ 初回確認 '+tm(r.observed));
  lines.push('','【フォロワー数・毎日12:00から15分以内】');
  for(const f of s.followers) lines.push(f.d+'　'+(f.value===null?f.state:f.value+'人　'+tm(f.at)));
  return lines.join('\n');
}
function publicationLinks(records){
  if(!records)return [];
  const works=records.works||[],plans=records.linkPlans||[],byArticle=new Map();
  for(const w of works){
    const key=w.article||w.attemptedArticle||w.draft;
    if(key)byArticle.set(key,w);
  }
  const included=new Set(),rows=[];
  const add=(key,title,at,fallback,published,state,detail='',editable=false)=>{
    const safe=typeof key==='string' && /^n[a-z0-9]{1,64}$/.test(key);
    rows.push({when:at?time(at):fallback,order:at||Date.parse(fallback.slice(0,10)+'T00:00:00+09:00'),label:title||'タイトル確認中の下書き',
      state,detail:detail||'',url:safe?(published?'https://note.com/43__/n/'+key:'https://editor.note.com/notes/'+key+'/edit/'):null,
      edit:editable?key+'@'+at:null});
  };
  for(const p of plans){
    const w=byArticle.get(p.article);
    if(w)included.add(w.seq);
    const published=!!(p.pub||w?.pub),sent=['sent','seen','confirmed'].includes(p.phase)||!!w?.attemptedArticle;
    const state=p.confirmed||w?.confirmed?'noteで公開中を確認':published?'公開一覧で確認':sent?'公開操作済み・確認中':w?.locked?'note側で予約済み（本人登録）':Date.now()>p.scheduled+5*M520?'時間枠終了・保留':'公開予定';
    add(p.article,p.title||w?.title,p.scheduled,'',published,state,w?.coverResult||p.result||p.message,!sent&&!published&&!w?.locked);
  }
  for(const w of works){
    if(included.has(w.seq))continue;
    const clock=w.t||w.suggested,at=clock?Date.parse(w.d+'T'+clock+':00+09:00'):null;
    const state=w.confirmed?'noteで公開中を確認':w.pub?'公開一覧で確認':w.paused?'予約取り消し済み':w.locked?'note予約済み（登録時の指定）':w.attemptedArticle?'公開操作済み・確認中':at&&at+5*M520<Date.now()?'時間枠終了・保留':'登録済み';
    const key=w.article||w.attemptedArticle||w.draft;
    add(key,w.title,at,w.d+' 時刻未定',!!w.pub,state,w.coverResult||(!key?'本人の下書き一覧からリンクを確認中':''),!!key&&!!at&&!w.pub&&!w.locked&&!w.attemptedArticle&&!w.paused);
  }
  return rows.sort((a,b)=>a.order-b.order);
}
function planEditorOptions(plans,selected){
  return plans.filter(p=>p.edit).map(p=>'<option value="'+esc(p.edit)+'"'+(p.edit===selected?' selected':'')+'>'+esc(p.when+'　'+p.label)+'</option>').join('');
}
function deskMagazineList(records) {
  if(!records)return '';
  const lines=records.imports.map(m=>m.name+' ／ '+(m.mode==='excluded'?'除外済み':m.allowed?m.state:m.memberReason||'運営資格を確認待ち'));
  return lines.map(line=>'<p>'+esc(line)+'</p>').join('');
}
function deskArchiveList(archive) {
  if(!archive)return '';
  return archive.items.map(w=>{
    const where=w.seen.length?'誌面で掲載を確認：'+w.seen.map(x=>x.name).join('、'):w.choice?'条件に合う1誌：'+w.choice+'（掲載未確認）':w.waiting;
    const likes=w.at?' ／ '+time(w.at)+'時点 '+w.likes+'スキ':'';
    const change=w.change===null?'':' ／ '+time(w.prior_at)+'からの増減 '+w.change;
    return '<p>'+esc(w.title+' ／ '+where+' ／ '+w.state+likes+change)+' <a href="https://note.com/43__/n/'+encodeURIComponent(w.article)+'" target="_blank" rel="noopener noreferrer">作品を開く</a></p>';
  }).join('');
}
function deskPage(records=null,message='',status=200,editing='') {
  const archive=records?.archive;
  const plans=publicationLinks(records);
  const selected=editing && plans.find(p=>p.edit===editing);
  const stamp=selected?new Date(selected.order+9*HOUR).toISOString():'';
  const catalogue=archive?archive.message+' ／ 確認できた作品 '+archive.total+'本（固定記事を除く）':'';
  const reserved=records?.works.filter(w=>w.locked && w.pub==null && w.article==null);
  const reservedList=reserved?.length?reserved.map(w=>'<label><input type="checkbox" name="reserved_seq" value="'+w.seq+'"> '+esc(w.d+' '+(w.t||w.suggested||'時刻未定')+'　'+w.title)+'</label>').join(''):
    reserved?'「予約済み」の未公開作品はありません。':'上の「記録を開く」を押してください。';
  const nonce=crypto.randomUUID().replaceAll('-','');
  const html=`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>520 作品管理 v16.5.1</title><style>body{font:16px system-ui;max-width:740px;margin:24px auto;padding:0 16px;color:#232629;line-height:1.6}label,fieldset,details,section{display:block;margin:12px 0}input:not([type=checkbox]),textarea,select{width:100%;box-sizing:border-box;font:inherit;padding:8px}button,summary{font:inherit;padding:9px;cursor:pointer}button{margin:6px 5px 6px 0}p{overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f4f6;padding:12px}#msg{font-weight:600}img{max-width:100%;max-height:190px}small{display:block}</style></head><body>
<a href="/">スキ回りの管理画面へ</a><h1>520 作品管理</h1><small>v16.5.1</small><p>43__ 専用・日本時間。公開確認と計測には公開情報を使います。</p>
<form method="post" action="/520" id="readform"><label>管理用の鍵<input id="key" name="key" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" required></label>
<button id="load" type="submit">記録を開く</button><button id="basic" type="submit" hidden>簡易表示で開く</button>
<details id="planform"${selected?' open':''}><summary>下書きの共有リンクで予約</summary>
<label>新規登録・変更する予約<select id="editing" name="editing"><option value="">新しい予約</option>${planEditorOptions(plans,editing)}</select></label>
<label>下書きの共有用リンク<input type="text" inputmode="url" id="share" name="share" autocomplete="off" autocapitalize="none" spellcheck="false"></label>
<label>公開日（日本時間）<input type="date" id="link_date" name="link_date" value="${stamp.slice(0,10)}"></label>
<label>公開時刻（日本時間）<input type="time" id="link_time" name="link_time" value="${stamp.slice(11,16)}"></label>
<button type="submit" name="work_action" value="preview_link">公開せずに画像を確認</button>
<button type="submit" name="work_action" value="reserve_link">この下書きの公開予定を保存</button>
<p>指定時刻に520の下書きを開きます。登録後に編集した場合は最新の保存内容が対象です。本文・タイトル・画像は転記しません。すでにnoteで予約した記事は対象外です。</p>
<small>日時だけを直すときは、変更する予約を選び、リンク欄は空欄で保存してください。下書きを差し替えるときは、新しい共有リンクを貼って保存してください。</small>
<button type="submit" name="work_action" value="cancel_link">このリンクの予定を取り消す</button></details>
<details id="corrections"><summary>登録済みの「予約済み」を直す</summary>
<p>noteに下書きだけがある作品を選んでください。チェックを外すと、登録日時にツールの自動公開の対象になります。</p>
<div id="reservedlist">${reservedList}</div>
<button id="unreserve" type="submit" name="work_action" value="clear_reserved"${reserved?.length?'':' disabled'}>選んだ作品の「予約済み」を外す</button>
</details></form>
<p id="msg" role="status" aria-live="polite">${esc(message)}</p><p><a href="#schedules">予約した作品を見る</a></p>
<p>登録時刻から5分以内の定期起動で、520の下書きと完成稿が一致すれば公開します。時間を過ぎた稿は保留します。手動で公開した新作も計測します。条件と編集権限を確認できた共同誌には、新作と既刊を1作品につき1誌まで追加します。「記録を開く」で結果が見られます。</p>
<details><summary>自動公開・共同誌への追加を休止／再開</summary><button type="button" id="autopause">休止</button><button type="button" id="autoresume">再開</button></details>
<details><summary>完成稿と公開予定を登録</summary><p>年をまたぐ予約や、登録済みの日付の間への追加もできます。公開日時の順に表示します。公開済みの新作は自動で計測されます。事前に完成稿と日時を登録すると、空欄の時刻について比較できるデータがあれば候補を1つ記録します。</p>
<label>公開する順番<input id="seq" type="number" min="1" step="1"></label><label>タイトル（原文）<input id="title"></label>
<label>本文（原文）<textarea id="body" rows="6"></textarea></label><label>または完成稿のUTF-8テキストファイル<input id="manuscript" type="file" accept=".txt,text/plain"></label>
<label>公開日<input id="d" type="date"></label><label>指定済みの時刻（任意）<input id="t" type="time"></label>
<label><input type="checkbox" id="locked"> note側ですでに予約済み（下書きだけならチェック不要）</label>
<label>記事ID（任意・既存の下書きの n で始まるID）<input id="draft" autocapitalize="none" spellcheck="false"></label>
<label>ジャンル<select id="genre">${genre520.map(v=>'<option>'+v+'</option>').join('')}</select></label>
<label>制作方法<select id="method"><option value="">選択してください</option>${method520.map(v=>'<option>'+v+'</option>').join('')}</select></label>
<button id="add">完成稿を登録</button>
<details><summary>複数の完成稿を1回で登録（JSON）</summary><p>配列の各行に seq（順番）, title, body, d（YYYY-MM-DD）, t（HH:MM または空文字）, locked（予約済み true / false）, draft（記事IDまたは空文字）, genre, method を入れます。どれか1本に誤りがあれば一括登録全体を戻します。</p><label>JSONファイル<input id="batch" type="file" accept=".json,application/json"></label><button id="import">一括登録</button></details></details>
<details id="magsection"><summary>マガジンの自動確認</summary>
<p>520の公開ページなどから誌面を探し、無料・共同運営者・募集条件を確認します。以前の除外は保持します。</p>
<p id="directory">${esc(records?.directory?.message)}</p><div id="imports">${deskMagazineList(records)}</div><div id="mags"></div>
<details><summary>公開一覧にない誌のURLを補う（任意）</summary><label>マガジンURL<input id="oneurl" type="url"></label><button id="sourcemag">次回の確認に追加</button></details></details>
<details><summary>共有可の写真を準備</summary><p>「共有可」に入れた自分の写真をまとめて選べます。画素からJPEGと短い説明を作ります。被写体を一言添えることもできます。画面に保存されるのは加工したJPEGです。実際の共有は、noteアプリの「アカウント」→「アップロードした画像」で加工済みの画像を選び、「共有」を押します。</p>
<label>被写体（任意・場所や氏名は不要）<input id="subject" maxlength="40"></label>
<label>共有可に入れる自作写真を選ぶ（複数可・作品のサムネを除く）<input id="photo" type="file" multiple accept="image/*"></label>
<button id="prep">選んだ写真の準備を再試行</button><div id="photos"></div></details>
<details open><summary>既刊と新作の掲載先</summary><p id="catalogue">${esc(catalogue)}</p><div id="archive">${deskArchiveList(archive)}</div>
<button id="prevarchive" form="readform" type="submit" name="offset" value="${Math.max(0,(archive?.offset||0)-30)}"${archive?.offset?'':' disabled'}>前の30本</button><button id="nextarchive" form="readform" type="submit" name="offset" value="${(archive?.offset||0)+30}"${archive?.more?'':' disabled'}>次の30本</button></details>
<h2 id="schedules">予約した作品</h2><div id="planlinks">${records?plans.map(p=>'<p>'+esc(p.when+' ／ '+p.state)+'<br>'+(p.url?'<a href="'+esc(p.url)+'" target="_blank" rel="noopener noreferrer">'+esc(p.label)+'</a>':esc(p.label))+(p.detail?'<small>'+esc(p.detail)+'</small>':'')+(p.edit?'<button type="submit" form="readform" formaction="/520#planform" name="edit_target" value="'+esc(p.edit)+'" data-plan="'+esc(p.edit)+'">この予約を変更</button>':'')+'</p>').join('')||'登録された予定はありません。':'「記録を開く」を押してください。'}</div><h2>作品と計測</h2><pre id="result">${esc(records?.recordText??'管理用の鍵を入力し「記録を開く」を押してください。')}</pre>
<script nonce="${nonce}">${DESK_BROWSER_SCRIPT}</script></body></html>`;
  return new Response(html,{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'same-origin','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'unsafe-inline'; connect-src 'self'; img-src blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"}});
}
const DESK_BROWSER_SCRIPT=String.raw`(function deskBrowser() {
  const $=id=>document.getElementById(id);
  const tm=t=>t?new Date(t).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'未記録';
  const msg=s=>{$('msg').textContent=s;};
  async function send(action,extra={}) {
    const key=$('key').value;
    if(!key)throw Error('画面上部の「管理用の鍵」を入力してください。');
    const controller=action==='status'?new AbortController():null;
    const timer=controller?setTimeout(()=>controller.abort(),20000):null;
    try {
      const r=await fetch('/520',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+btoa(Array.from(new TextEncoder().encode(key),x=>String.fromCharCode(x)).join(''))},body:JSON.stringify({action,...extra}),signal:controller?.signal});
      if(r.ok && action==='download') return r.blob();
      if(!r.headers.get('Content-Type')?.includes('application/json'))throw Error('作品管理から記録を受け取れませんでした（HTTP '+r.status+'）。もう一度開いてください。');
      const s=await r.json();
      if(!r.ok) throw Error(s.error || '操作を確認できません。');
      if(action==='archive'){showArchive(s);return;}
      if(action==='plans'){showPlans(s);return;}
      show(s);if(['reserve_link','replace_link','cancel_link','preview_link'].includes(action))return s;
    }catch(error){
      if(controller?.signal.aborted)throw Error('20秒以内に応答がありませんでした。「簡易表示で開く」を押してください。');
      if(error instanceof TypeError)throw Error('作品管理に接続できませんでした。通信を確認して、もう一度開いてください。');
      throw error;
    }finally{if(timer!==null)clearTimeout(timer);}
  }
  let busy=false;
  function wrap(f){return async()=>{
    if(busy) return;
    busy=true;msg('処理中…');
    try {const s=await f();msg(s || '読み込みました。');}
    catch(e){msg(e.message || '操作を確認できません。');}
    finally{busy=false;}
  };}
  function button(parent,label,fn){
    const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=wrap(fn);parent.append(b);
  }
  function line(parent,s){const p=document.createElement('p');p.textContent=s;parent.append(p);return p;}
  function showArchive(a) {
    $('catalogue').textContent=a.message+' ／ 確認できた作品 '+a.total+'本（固定記事を除く）';
    $('archive').replaceChildren();
    for(const w of a.items){
      const where=w.seen.length?'誌面で掲載を確認：'+w.seen.map(x=>x.name).join('、'):w.choice?'条件に合う1誌：'+w.choice+'（掲載未確認）':w.waiting;
      const el=line($('archive'),w.title+' ／ '+where+' ／ '+w.state+(w.at?' ／ '+tm(w.at)+'時点 '+w.likes+'スキ':'')+
        (w.change!==null?' ／ '+tm(w.prior_at)+'からの増減 '+w.change:''));
      external(el,'作品を開く','https://note.com/43__/n/'+w.article);
    }
    $('prevarchive').value=Math.max(0,a.offset-30);$('nextarchive').value=a.offset+30;
    $('prevarchive').disabled=a.offset===0;$('nextarchive').disabled=!a.more;
  }
  let planTimer=null;
  function showPlans(s){
    if(planTimer!==null){clearTimeout(planTimer);planTimer=null;}
    const plans=$('planlinks');
    if(plans){
      plans.replaceChildren();
      const selector=$('editing'),chosen=selector?.value;
      if(selector){const option=document.createElement('option');option.value='';option.textContent='新しい予約';selector.replaceChildren(option);}
      for(const p of s.publicationLinks||[]){
        const el=line(plans,p.when+' ／ '+p.state);
        if(p.url)external(el,p.label,p.url);
        else el.append(' '+p.label);
        if(p.detail){const detail=document.createElement('small');detail.textContent=p.detail;el.append(detail);}
        if(p.edit && selector){
          const opt=document.createElement('option');opt.value=p.edit;opt.textContent=p.when+'　'+p.label;selector.append(opt);
          const edit=document.createElement('button');edit.type='button';edit.dataset.plan=p.edit;edit.textContent='この予約を変更';el.append(' ',edit);
        }
      }
      if(chosen && selector)selector.value=chosen;
      if(!s.publicationLinks?.length)plans.textContent='登録された予定はありません。';
    }
    if($('key').value && (s.publicationLinks||[]).some(p=>p.label==='タイトル確認中の下書き'||(!p.url && p.detail.includes('確認中')))){
      const poll=async()=>{
        if(!$('key').value)return;
        if(!document.hidden && !busy){try{await send('plans');return;}catch{}}
        planTimer=setTimeout(poll,60000);
      };
      planTimer=setTimeout(poll,60000);
    }
  }
  function show(s){
    showArchive(s.archive);showPlans(s);
    const reserved=s.works.filter(w=>w.locked && w.pub==null && w.article==null);
    const list=$('reservedlist');
    list.replaceChildren();
    for(const w of reserved){
      const label=document.createElement('label'), box=document.createElement('input');
      box.type='checkbox';box.name='reserved_seq';box.value=String(w.seq);
      label.append(box,' '+w.d+' '+(w.t||w.suggested||'時刻未定')+'　'+w.title);
      list.append(label);
    }
    if(!reserved.length)list.textContent='「予約済み」の未公開作品はありません。';
    $('unreserve').disabled=reserved.length===0;

    if(!$('seq').value) $('seq').value=(s.works.at(-1)?.seq??0)+1;
    $('result').textContent=s.recordText;
    $('directory').textContent=s.directory.message;
    $('imports').replaceChildren();$('mags').replaceChildren();
    for(const m of s.imports){
      const label=m.mode==='excluded'?'除外済み':m.allowed?m.state:(m.memberReason||'運営資格を確認待ち');
      const p=line($('imports'),m.name+' ／ '+label+(m.allowed && m.reason?'　'+m.reason:''));
      external(p,'誌面',m.url);if(m.rules)external(p,'募集条件',m.rules);
      if(m.mode!=='excluded')button(p,'この誌を除外',()=>send('revoke',{url:m.url}));
    }
    for(const m of s.mags.filter(x=>!s.imports.some(i=>i.id===x.url.split('/').at(-1)))){
      const p=line($('mags'),m.name+' ／ 登録済み');button(p,'この誌を除外',()=>send('revoke',{url:m.url}));
    }
    $('photos').replaceChildren();
    for(const p of s.photos){
      const el=line($('photos'),p.caption+' 検索キーワード：'+p.keywords+' ／ '+(p.shared?'共有済み（本人確認 '+tm(p.shared)+'）':'準備済み・未共有'));
      button(el,'JPEGを保存',async()=>{
        const blob=await send('download',{hash:p.hash}),u=URL.createObjectURL(blob);
        const a=document.createElement('a');a.href=u;a.download='520-'+p.hash.slice(0,12)+'.jpg';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000);
        return 'JPEGを用意しました。';
      });
      if(!p.shared) button(el,'noteでの共有済みを記録',async()=>{
        if(!window.confirm('520のnoteで、この写真の「共有済み」を確認しましたか？')) return '記録を保留しました。';
        await send('shared',{hash:p.hash,confirm:true});return '本人確認として記録しました。';
      });
    }
  }
  function external(parent,label,url) {
    const a=document.createElement('a');a.href=url;a.textContent=label;a.target='_blank';a.rel='noopener noreferrer';parent.append(' ',a);
  }
  if($('autopause'))$('autopause').onclick=wrap(()=>send('delivery_switch',{enable:false}));
  if($('autoresume'))$('autoresume').onclick=wrap(()=>send('delivery_switch',{enable:true}));
  $('sourcemag').onclick=wrap(()=>send('mag_source',{url:$('oneurl').value.trim()}));
  function setPlan(value){
    const selector=$('editing');selector.value=value;
    const [,at]=value.split('@');$('share').value='';
    if(!at){$('link_date').value='';$('link_time').value='';return;}
    const stamp=new Date(Number(at)+9*3600000).toISOString();
    $('link_date').value=stamp.slice(0,10);$('link_time').value=stamp.slice(11,16);
    $('planform').open=true;
  }
  if($('editing'))$('editing').onchange=()=>setPlan($('editing').value);
  if($('planlinks'))$('planlinks').onclick=e=>{
    const edit=e.target.closest('[data-plan]');if(!edit)return;
    e.preventDefault();setPlan(edit.dataset.plan);$('planform').scrollIntoView();
  };
  $('readform').onsubmit=event=>{
    if(event.submitter===$('basic'))return;
    const action=event.submitter?.value;
    if(['reserve_link','cancel_link','preview_link'].includes(action)){
      event.preventDefault();
      return wrap(async()=>{
        const raw=$('share').value.trim(),editing=$('editing').value,[original,expected]=editing.split('@');
        let key=original;
        if(raw){
          let u;try{u=new URL(raw);}catch{}
          const match=u?.origin==='https://note.com' && !u.username && !u.password && /^\/preview\/(n[a-z0-9]{1,64})\/?$/.exec(u.pathname);
          if(!match || !u.searchParams.get('prev_access_key'))throw Error('noteの下書きの「共有用リンク」を貼ってください。');
          key=match[1];
        }
        if(!key)throw Error('下書きの共有リンクを貼るか、変更する予約を選んでください。');
        if(original && action==='cancel_link' && original!==key)throw Error('取り消す予約と共有リンクが一致しません。');
        const s=await send(editing && action==='reserve_link'?'replace_link':action,{article:key,d:$('link_date').value,t:$('link_time').value,...(editing?{original,expected:Number(expected)}:{})});
        if(action!=='preview_link')setPlan('');
        return s.correctionMessage;
      })();
    }
    if(event.submitter===$('unreserve')){
      if(!event.currentTarget.querySelector('input[name="reserved_seq"]:checked')){
        event.preventDefault();msg('直す作品を一覧から選んでください。');
      }
      return;
    }
    event.preventDefault();
    if(busy)return;
    if(event.submitter?.name==='offset')return wrap(()=>send('archive',{offset:Number(event.submitter.value)}))();
    return wrap(async()=>{
      $('basic').hidden=true;
      try {
        await send('status');
        return '記録を開きました。「既刊と新作の掲載先」に結果を表示しました。';
      }catch(error){
        $('basic').hidden=false;
        throw error;
      }
    })();
  };
  $('add').onclick=wrap(async()=>{
    const f=$('manuscript').files[0];
    if(f && $('body').value) throw Error('本文とファイルのどちらか1つを入力してください。');
    const w={seq:Number($('seq').value),title:$('title').value,body:f?await fileText(f):$('body').value,d:$('d').value,t:$('t').value,locked:$('locked').checked,
      draft:$('draft').value.trim(),genre:$('genre').value,method:$('method').value};
    await send('works',{works:[w]});
    for(const k of ['body','title','manuscript','draft','d','t','method']) $(k).value='';
    $('locked').checked=false;$('seq').value=w.seq+1;
    return '完成稿を登録しました。';
  });
  async function fileText(f){
    if(f.size>1800000) throw Error('ファイルが大きすぎます。分けて登録してください。');
    return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await f.arrayBuffer());
  }
  $('import').onclick=wrap(async()=>{
    const f=$('batch').files[0];if(!f) throw Error('JSONを選んでください。');
    const works=JSON.parse((await fileText(f)).replace(/^\uFEFF/,''));
    await send('works',{works});return '一括登録しました。';
  });
  $('photo').onchange=$('prep').onclick=wrap(async()=>{
    const files=Array.from($('photo').files);
    if(!files.length) throw Error('共有可の写真を選んでください。');
    if(files.length>1 && $('subject').value.trim()) throw Error('複数の写真では被写体欄を空にしてください。各写真の色と明るさから説明を作ります。');
    let done=0;
    for(const f of files){
      try {await prepareImage(f);done++;}
      catch(e){throw Error(done+'枚準備済み。'+e.message);}
    }
    $('photo').value='';$('subject').value='';
    return done+'枚を準備しました。写真欄からJPEGを保存できます。';
  });
  async function prepareImage(f) {
    if(f.type && !/^image\/(jpeg|png|webp|avif|heic|heif|gif|tiff|bmp)$/i.test(f.type)) throw Error('JPEGまたはPNGの写真を選んでください。');
    if(f.size>32*1024*1024) throw Error('32MB以内の読み込める写真を選んでください。');
    const u=URL.createObjectURL(f);
    try {
      const im=new Image();im.src=u;
      try{await im.decode();}catch{throw Error('この端末で開けるJPEGまたはPNGの写真を選んでください。');}
      const scale=Math.min(1,1600/Math.max(im.naturalWidth,im.naturalHeight));
      const c=document.createElement('canvas');c.width=Math.max(1,Math.round(im.naturalWidth*scale));c.height=Math.max(1,Math.round(im.naturalHeight*scale));
      const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(im,0,0,c.width,c.height);
      const sample=document.createElement('canvas');sample.width=24;sample.height=24;
      const sc=sample.getContext('2d');sc.drawImage(c,0,0,24,24);
      const px=sc.getImageData(0,0,24,24).data;let r=0,g=0,b=0;
      for(let i=0;i<px.length;i+=4){r+=px[i];g+=px[i+1];b+=px[i+2];}
      const N=24*24,lum=(0.2126*r+0.7152*g+0.0722*b)/N;
      const light=lum<85?'暗め':lum>175?'明るめ':'落ち着いた明るさ';
      const hue=Math.max(r,g,b)-Math.min(r,g,b)<12*N?'色差の小さい':r===Math.max(r,g,b)?'赤みのある':b===Math.max(r,g,b)?'青みのある':'緑みのある';
      const subject=$('subject').value.trim();
      const caption=(subject?subject+'。':'')+light+'で'+hue+(c.width>c.height?'横長':c.width<c.height?'縦長':'正方形')+'の写真。';
      let jpeg=c.toDataURL('image/jpeg',0.87).split(',')[1];
      if(jpeg.length>1450000) jpeg=c.toDataURL('image/jpeg',0.65).split(',')[1];
      await send('photo',{jpeg,caption,allowed:true});
    }finally{URL.revokeObjectURL(u);}
  }
})();`;
