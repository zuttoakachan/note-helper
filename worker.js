const VERSION = 'v16.9.4';
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
<h1>note-helper ${VERSION}</h1><p><a href="/tuta" style="display:block;padding:16px;background:#eef2ff;font-weight:bold">Tuta接続・招待メールの自動確認</a></p><p><a href="/520">520の作品管理・記録</a></p>
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
  async email(message,env) { await receiveNoteInvite520(message,env); },
  async fetch(request, original) {
    const url = new URL(request.url);
    if (url.pathname === '/tuta' || url.pathname === '/tuta/') return tutaRoute520(request,original);
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
      if (path === '/desk/tick' || path === '/desk/admin' || path === '/desk/invitation') {
        this.desk ||= new Desk520(this.ctx.storage,this.env);
        if (path === '/desk/admin') return this.desk.admin(request,this.ctx);
        if (path === '/desk/invitation') {
          const input=await request.json();
          this.desk.init();
          try {
            if(typeof input.mail==='string')await this.desk.saveInvitationMail520(input.mail);
            else {
              if(!this.desk.joinTarget520(input.id))return deskJson({error:'Unexpected invitation'},400);
              await this.desk.saveInvitation520(input.url,true,input.id);
            }
          } catch(error) {
            if(error instanceof Input520)return deskJson({error:'Invitation target could not be verified'},400);
            throw error;
          }
          return deskJson({saved:true});
        }
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
      }else if(['tuta_connect','tuta_check','tuta_off'].includes(form.get('work_action'))){
        input={action:form.get('work_action')};
        if(input.action==='tuta_connect')Object.assign(input,{email:form.get('tuta_email'),password:form.get('tuta_password'),totp:form.get('tuta_totp')||''});
      }else if(['join_on','join_off','join_invite'].includes(form.get('work_action'))){
        input=form.get('work_action')==='join_invite'?{action:'join_invite',url:(form.get('invite_url')||'').trim()}:
          {action:'join_switch',enable:form.get('work_action')==='join_on'};
      }else if(form.get('work_action')==='scout'){
        input={action:'scout'};
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
      if(res.status===400 && ['reserve_link','replace_link','cancel_link','preview_link','clear_reserved','join_invite','join_switch','tuta_connect','tuta_check','tuta_off'].includes(input.action)){
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
  let session, socket, stage='ブラウザーの起動';
  let retry=0, denied=0;
  try {
    session=await binding.acquire({keepAlive:15000,recording:false,
      guardrails:{allowedDomains:['note.com','assets.st-note.com','*.st-note.com','*.note.com']}});
    stage='ブラウザーへの接続';
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
    stage='noteの画面との通信';
    return await action({command,evaluate,blocked,blockedResult});
  } catch {
    return denied || retry>0?{message:'note側で待機・操作結果は未確認',hold:Math.max(2*HOUR,retry)}:{message:stage+'を完了できず・再確認待ち'};
  } finally {
    try {socket?.close();} catch {}
    if(session?.sessionId)await binding.closeSession(session.sessionId).catch(()=>{});
  }
}

// note chooses one reaction per like. This Worker only maintains the account-wide pool.
const articleReactionURL = 'https://note.com/settings/reactions/like/note';
function reactionTitles(works, now, limit) {
  const titles = [...new Set(works.map(w => w.title))].filter(title =>
    typeof title === 'string' && title.trim() && title.trim() !== '521' &&
    !/[\r\n\u0000-\u001f]/u.test(title) && title.length <= limit);
  if (titles.length <= 10) return titles;
  const backlist = titles.slice(2);
  const week = Math.floor((now + 9*HOUR + 3*D520) / (7*D520));
  const start = week * 8 % backlist.length;
  return titles.slice(0, 2).concat(Array.from({length:8}, (_, i) => backlist[(start+i) % backlist.length]));
}

// Runs inside note's own article-like settings page, with no access to the Worker environment.
function articleReactionForm(step, titles) {
  if (location.origin !== 'https://note.com' || location.pathname.replace(/\/$/,'') !== '/settings/reactions/like/note') return {state:'page'};
  const visible = el => el.getClientRects().length > 0 && !el.closest('[hidden],[aria-hidden="true"]');
  const name = el => (el.getAttribute('aria-label') || el.textContent || el.value || el.title || '').trim();
  const root = document.querySelector('[role="dialog"]') || document.querySelector('main,[role="main"]') || document.body;
  if (!root || !/スキのお礼/.test(root.innerText) || !/記事にスキ/.test(root.innerText)) return {state:'page'};
  const controls = el => [...el.querySelectorAll('button,[role="button"],input[type="submit"],a[href="#"]')].filter(visible);
  const selected = [...root.querySelectorAll('[role="tab"][aria-selected="true"],a[aria-current="page"]')].filter(visible);
  if (selected.some(el => /コメントにスキ|掲示板.*スキ/.test(name(el)))) return {state:'page'};
  const pane = [...root.querySelectorAll('[role="tabpanel"]')].filter(visible);
  if (pane.length > 1) return {state:'page'};
  const scope = pane[0] || root;
  const saves = controls(root).filter(el=>/^保存(する)?$/.test(name(el)));
  if (saves.length !== 1) return {state:'page'};
  const fields = [...scope.querySelectorAll('textarea,input[type="text"],input:not([type])')].filter(el =>
    visible(el) && !el.closest('header,nav,[role="search"]') && !el.readOnly && !el.disabled);
  if (fields.length > 10 || fields.some(el => !/お礼|リアクション|メッセージ|ありがとう|スキ/.test(
    [el.placeholder,el.getAttribute('aria-label'),el.name,...Array.from(el.labels || [],name)].join(' ')) &&
    !(el.maxLength > 0 && el.maxLength <= 50) && el.tagName !== 'TEXTAREA')) return {state:'page'};
  const add = controls(scope).filter(el => /^(?:[+＋]\s*)?(?:(?:新し[いく]|他の|別の|もう1つの)?(?:スキの)?(?:お礼(?:メッセージ)?|メッセージ|リアクション)(?:を|の)?)?追加(?:する)?(?:[（(][^()（）]*[）)])?$/.test(name(el)));
  if (!fields.length && add.length !== 1) return {state:'page'};
  // Look for a selected reaction image inside each message card. Ignore site navigation and stock illustrations.
  const media = [];
  for (const field of fields) {
    for (let row=field.parentElement; row && row!==root.parentElement; row=row.parentElement) {
      if (fields.filter(f=>row.contains(f)).length !== 1) break;
      const remove = controls(row).filter(b=>/^(?:設定した|登録した)?(?:画像|お礼画像)(?:を|の)?(?:削除|解除)(?:する)?$/.test(name(b)));
      if (remove.length === 1) {media.push(remove[0]);break;}
      const image = [...row.querySelectorAll('img[src]')].some(img=>visible(img) &&
        (/^blob:|\/uploads\/|\/production\/uploads\//.test(img.currentSrc || img.src)) &&
        !img.closest('header,nav,a') && !/アイコン|サンプル|アバター/.test(img.alt));
      if (image) {media.push(null);break;}
      if (row===scope || row===root) break;
    }
  }
  const limits = fields.map(el=>el.maxLength).filter(n=>n>0);
  const lengthHint = (scope.innerText || '').match(/(\d{1,3})\s*(?:文字|字)以内/);
  if(lengthHint && Number(lengthHint[1])>0)limits.push(Number(lengthHint[1]));
  const limit = limits.length ? Math.min(...limits) : 35;
  const values = fields.map(el=>el.value);
  const active = values.filter(Boolean);
  const sorted = [...titles].sort();
  const same = active.length===titles.length && [...active].sort().every((v,i)=>v===sorted[i]);
  if (step==='read') return {state:'ready',same:same && !media.length,limit,signature:JSON.stringify([values,media.length])};
  if (titles.some(v=>v.length>limit)) return {state:'limit',limit};
  if (media.length) {
    if (!media[0] || step!=='edit') return {state:'image'};
    media[0].click();return {state:'more'};
  }
  const filled = titles.every((v,i)=>values[i]===v) && values.slice(titles.length).every(v=>!v);
  if (step==='save') {
    if (!filled || saves[0].disabled || saves[0].getAttribute('aria-disabled')==='true') return {state:'page'};
    saves[0].click();return {state:'sent'};
  }
  if (step!=='edit') return {state:'page'};
  // Fill existing slots before adding another. Some screens enable Add only after text input.
  for (const [i,el] of fields.entries()) {
    const next = titles[i] || '';
    if (el.value === next) continue;
    const proto = el.tagName==='TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value').set.call(el,next);
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
  }
  if (fields.length < titles.length) {
    if (add.length!==1) return {state:'page'};
    if (!add[0].disabled && add[0].getAttribute('aria-disabled')!=='true') add[0].click();
    return {state:'more'};
  }
  return {state:'filled'};
}

async function syncArticleReactionSettings(binding, accountId, cookie, titles, maySave, reserve) {
  return inNoteBrowser(binding,cookie,false,async ({command,evaluate,blocked,blockedResult})=>{
    const form = step => evaluate('('+articleReactionForm.toString()+')('+JSON.stringify(step)+','+JSON.stringify(titles)+')');
    await command('Page.navigate',{url:articleReactionURL});
    let state, previous, stable=false;
    for (let i=0;i<16 && !blocked();i++) {
      try { state=await form('read'); } catch { state=null; }
      if (state?.state==='ready' && previous===state.signature) {stable=true;break;}
      previous=state?.signature;
      await pause520(250);
    }
    if (blocked()) return blockedResult();
    if (!stable) return {message:'記事にスキのお礼欄を識別できず・次回再確認'};
    const identity=await evaluate(noteIdentityJS);
    if (blocked()) return blockedResult();
    if (identity?.id!==accountId || identity?.name!=='43__') return {message:'520の本人確認待ち'};
    if (state.limit>0 && titles.some(t=>t.length>state.limit)) return {limit:state.limit,message:'noteの文字数上限に合わせて選び直します'};
    if (state.same) return {verified:true,limit:state.limit,message:'noteで確認済み'};
    if (!maySave()) return {message:'設定の再確認待ち'};
    for (let i=0;i<24;i++) {
      if (blocked()) return blockedResult();
      state=await form('edit');
      if(state.state==='filled')break;
      if(state.state==='image')return {message:'お礼の画像を識別できず・タイトルのみの保存は保留'};
      if(state.state!=='more')return {message:'お礼欄の追加・編集方法を確認できず・保存は保留'};
      await pause520(200);
    }
    await pause520(300);
    if (blocked()) return blockedResult();
    if (state?.state!=='filled' || !maySave())return {message:'入力内容の確認待ち'};
    reserve();
    if ((await form('save')).state!=='sent')return {message:'保存ボタンの確認待ち'};
    await pause520(1000);
    if (blocked()) return blockedResult();
    return {sent:true,limit:state.limit,message:'保存操作済み・noteで再確認待ち'};
  });
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
    if(!await markAttempt())return {message:'停止・待機または本人の処理期限により設定変更を保留'};
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
      const result=await frame(finalStep,arg);
      if(job.kind==='mag' && result==='already')return {seen:true,message:'noteの画面で追加済み・誌面での確認待ち'};
      if(['missing','unsafe','mismatch','wrong'].includes(result))return {
        notClicked:true,message:'操作直前に画面または条件が変わりました。ボタンは押していません。次回に確認します'};
      if(result!=='clicked')return {message:'操作結果を確認できず・自動再送なし'};
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
  ['https://note.com/mitsuruamano/m/m4d9023d7133b','創作の森 エンターテイナー・ストリート'],
  ['https://note.com/wise_rat6355/m/md3a807653baf','綴り灯']
];
const scoutProfiles=['https://note.com/azoworks','https://note.com/studio_yoizuki','https://note.com/shitosatashimaya'];
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
    if(!this.one("SELECT 1 FROM sqlite_master WHERE name='desk_scout_budget'")){
      this.storage.transactionSync(()=>{
        this.rows("CREATE TABLE desk_scout_budget(id INTEGER PRIMARY KEY, day TEXT NOT NULL DEFAULT '', used INTEGER NOT NULL DEFAULT 0, seeded INTEGER NOT NULL DEFAULT 0)");
        this.rows('INSERT INTO desk_scout_budget(id) VALUES(1)');
        this.rows('CREATE TABLE desk_owner_source(id TEXT PRIMARY KEY)');
        for(const [url] of scoutSeeds){
          this.rows("INSERT OR IGNORE INTO desk_scout(url,kind,due) VALUES(?,'feed',0)",url);
        }
        for(const url of scoutProfiles)this.rows("INSERT OR IGNORE INTO desk_scout(url,kind,due) VALUES(?,'profile',0)",url);
        this.rows('UPDATE desk_scout_state SET due=0 WHERE id=1');
        this.rows("UPDATE desk_directory SET due=0 WHERE id=1 AND enabled=1 AND token=''");
      });
    }
    if(!this.one("SELECT 1 FROM sqlite_master WHERE name='desk_reactions'")) {
      this.storage.transactionSync(()=>{
        this.rows("CREATE TABLE desk_reactions(id INTEGER PRIMARY KEY, due INTEGER DEFAULT 0, checked INTEGER DEFAULT 0, char_limit INTEGER DEFAULT 35, confirmed TEXT DEFAULT '[]', desired TEXT DEFAULT '[]', pending TEXT DEFAULT '', sent INTEGER DEFAULT 0, utc_day INTEGER DEFAULT -1, used INTEGER DEFAULT 0, message TEXT DEFAULT '初回確認待ち')");
        this.rows('INSERT INTO desk_reactions(id) VALUES(1)');
        this.rows('CREATE TABLE desk_reaction_work(article TEXT PRIMARY KEY, title TEXT NOT NULL, pub INTEGER NOT NULL, seen INTEGER NOT NULL)');
        this.rows('CREATE INDEX desk_reaction_recent ON desk_reaction_work(seen)');
        // Bring the public feed check forward once so upgrades can learn current titles.
        this.rows('UPDATE desk_cfg SET rss_at=0 WHERE id=1');
      });
    }
    if(!this.one("SELECT 1 FROM sqlite_master WHERE name='desk_task_health'")) {
      this.storage.transactionSync(()=>{
        this.rows("CREATE TABLE desk_task_health(task TEXT PRIMARY KEY,at INTEGER NOT NULL,failed INTEGER NOT NULL DEFAULT 0,message TEXT NOT NULL DEFAULT '')");
        this.rows("UPDATE desk_import SET due=0 WHERE allowed=1 AND state='保留' AND token=''");
      });
    }
    this.initJoin520();
    this.initTuta520();
    this.initShelf520();
    this.initJoinPolicy520();
    this.initExpansion520();
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
        case 'tuta_status':
          return deskJson({tuta:this.tutaDashboard520()});
        case 'tuta_resume':
          correctionMessage=this.resumeTuta520(now);
          if(typeof ctx?.waitUntil==='function')ctx.waitUntil(this.tutaTick520(Date.now()).catch(()=>{}));
          break;
        case 'tuta_connect':
          correctionMessage=await this.connectTuta520(input);
          if(typeof ctx?.waitUntil==='function')ctx.waitUntil(this.tutaTick520(Date.now()).catch(()=>{}));
          break;
        case 'tuta_check':
          correctionMessage=this.requestTutaCheck520(now);
          if(typeof ctx?.waitUntil==='function')ctx.waitUntil(this.tutaTick520(Date.now()).catch(()=>{}));
          break;
        case 'tuta_off':
          correctionMessage=this.disconnectTuta520();
          break;
        case 'join_switch':
          need520(typeof input.enable==='boolean','自動申請の指定を確認してください。');
          this.rows('UPDATE desk_join_cfg SET enabled=?,due=0 WHERE id=1',+input.enable);
          correctionMessage=input.enable?'参加申請と招待の自動確認を再開しました。':'参加申請と招待の自動確認を休止しました。';
          break;
        case 'join_invite':
          correctionMessage=await this.saveInvitation520(input.url);
          break;
        case 'find_mags': await this.discoverMagazines(now,true); break;
        case 'scout': correctionMessage=await this.scoutLiterary(now); break;
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
          this.rows("UPDATE desk_invite SET phase='excluded',iv='',ciphertext='' WHERE id=? AND phase IN ('wait','opened')",id);
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
      if(input.tuta_only===true && ['tuta_connect','tuta_check','tuta_off','tuta_resume'].includes(input.action))return deskJson({tuta:this.tutaDashboard520(),correctionMessage});
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
  magazineProgress(now,eligible) {
    const counts=this.one(`SELECT COUNT(*) found,
      SUM(CASE WHEN m.mode='excluded' THEN 1 ELSE 0 END) excluded,
      SUM(CASE WHEN m.mode='auto' AND m.checked>? AND i.allowed=1 THEN 1 ELSE 0 END) rights,
      SUM(CASE WHEN m.mode='auto' AND m.checked>? AND i.allowed=1 AND i.state='利用中' AND i.managed=1 THEN 1 ELSE 0 END) policy
      FROM desk_import i LEFT JOIN desk_member m ON m.id=i.id`,now-2*D520,now-2*D520);
    const jobs=this.one(`SELECT COUNT(*) attempts,
      SUM(CASE WHEN phase='confirmed' THEN 1 ELSE 0 END) confirmed,
      SUM(CASE WHEN phase IN ('sent','seen') THEN 1 ELSE 0 END) uncertain
      FROM desk_job WHERE kind='mag' AND phase IN ('sent','seen','confirmed')`);
    const browser=typeof this.env.BROWSER?.acquire==='function';
    const enabled=!!this.one('SELECT enabled FROM desk_cfg WHERE id=1').enabled && !!this.one('SELECT enabled FROM desk_delivery WHERE id=1').enabled;
    const blocked=this.one('SELECT blocked FROM desk_cfg WHERE id=1').blocked;
    let message=!enabled?'共同誌への自動追加は休止中です。':blocked>now?'note指定の待機が終わるまで追加しません。':!browser?'CloudflareのBROWSERが未設定か利用できないため、追加操作を開始できません。':
      !counts.rights?'共同運営者としての編集権限・無料の誌面を確認できた掲載先が0誌のため、追加に進んでいません。':
      !counts.policy?'編集権限を確認した誌の募集条件を照合中です。各誌の保留理由を確認してください。':
      !eligible.length?'募集条件を確認した誌の、最近の更新などを再確認しています。':'条件に合う作品を順に照合しています。';
    return {found:counts.found,excluded:counts.excluded||0,rights:counts.rights||0,policy:counts.policy||0,eligible:eligible.length,
      attempts:jobs.attempts,confirmed:jobs.confirmed||0,uncertain:jobs.uncertain||0,browser,enabled,message};
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
    const scoutBudget=this.one('SELECT day,used FROM desk_scout_budget WHERE id=1');
    const magazineProgress=this.magazineProgress(now,eligible);
    return {cfg,backlist,join:this.joinView520(),shelf:this.shelfView520(),popular:this.one('SELECT message,checked FROM desk_popular WHERE id=1'),magazineProgress,magazineProgressText:magazineProgressText520(magazineProgress),taskFailures:this.rows('SELECT task,at,message FROM desk_task_health WHERE failed=1 ORDER BY at DESC'),reactions:this.one('SELECT confirmed,desired,checked,message FROM desk_reactions WHERE id=1'),scout:{total:this.one('SELECT COUNT(*) n FROM desk_import').n,allowed:eligible.length,used:scoutBudget.day===jstDay(now)?scoutBudget.used:0,message:this.one('SELECT message FROM desk_scout_state WHERE id=1').message},linkPlans:schedules.linkPlans,deliveryOn:this.one('SELECT enabled FROM desk_delivery WHERE id=1').enabled,delivery:this.rows('SELECT kind,label,phase,at,message FROM desk_job ORDER BY at DESC LIMIT 24'),recommendation:this.one('SELECT checked,message FROM desk_recommend WHERE id=1'),archive:this.archivePage(offset,Date.now()),growth:this.growthView(),directory:this.one('SELECT message FROM desk_directory WHERE id=1'),
      imports:this.rows(`SELECT i.id,i.url,i.name,i.allowed,i.rules,i.state,i.reason,m.mode,m.reason memberReason,m.checked memberChecked,m.due memberDue,i.due ruleDue FROM desk_import i LEFT JOIN desk_member m ON m.id=i.id WHERE i.allowed=1 OR m.mode='excluded' OR NOT EXISTS(SELECT 1 FROM desk_scout_mag sm WHERE sm.id=i.id)
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
      this.recordReactionTitle(e.key,e.title,e.pub,now);
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
      if(!evidence.ok && this.joinProof520(link.id,now) && joinFree520(api.value,page.value||'',this.joinTarget520(link.id)))
        evidence={ok:true,reason:'本人の認証済み接続で共同運営参加を確認・無料を再確認'};
    }catch{evidence={ok:false,reason:'運営資格の読み取りを再試行します'};}
    this.storage.transactionSync(()=>{
      if(!this.one("SELECT id FROM desk_member WHERE id=? AND ticket=? AND mode IN ('check','auto')",row.id,ticket))return;
      const publicLead=!evidence.ok && this.one('SELECT id FROM desk_scout_mag WHERE id=? AND NOT EXISTS (SELECT 1 FROM desk_owner_source WHERE id=?)',row.id,row.id);
      this.rows("UPDATE desk_member SET mode=?,due=?,checked=?,reason=?,ticket='' WHERE id=?",evidence.ok?'auto':'check',now+(publicLead?14*D520:D520),now,evidence.reason,row.id);
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
    const inspect=this.one(`SELECT i.id,i.url,i.managed,i.name,CASE WHEN o.id IS NULL THEN sc.id END AS scouted
      FROM desk_member m JOIN desk_import i ON i.id=m.id LEFT JOIN desk_scout_mag sc ON sc.id=m.id
      LEFT JOIN desk_owner_source o ON o.id=m.id WHERE m.mode IN ('check','auto') AND m.due<=?
      ORDER BY (m.mode='auto') DESC,(o.id IS NULL),(sc.id IS NOT NULL),m.due,m.id LIMIT 1`,now);
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
    const a=this.one('SELECT article,pub FROM desk_archive WHERE due<=? ORDER BY due,article LIMIT 1',now);
    if(!a)return;
    try{
      const n=(await this.publicRead('https://note.com/api/v3/notes/'+a.article,'json'))?.data;
      if(n?.key===a.article && (n.name?.trim()==='521' || (n.status && n.status!=='published') || (n.user?.urlname && n.user.urlname!=='43__')))
        this.rows('DELETE FROM desk_reaction_work WHERE article=?',a.article);
      if(n?.user?.urlname!=='43__' || n.key!==a.article || n.name?.trim()==='521' || (n.status && n.status!=='published'))throw Error('not verified');
      if(isPublishedBy520(n))this.recordReactionTitle(a.article,n.name,a.pub,now);
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
    }catch(error){
      if(error instanceof PublicReadError && /HTTP (404|410)$/.test(error.message)) this.rows('DELETE FROM desk_reaction_work WHERE article=?',a.article);
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
      const pick=this.chooseMagazine520(fits,genre,now);
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
  async sourceForMagazine(row) {
    const reviewed=this.joinTarget520(row.id);
    if(reviewed && !reviewed.restricted)return this.reviewedMagazine520(row,reviewed);
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
      const picked=this.chooseMagazine520(valid,w.genre,now);
      const url=picked?.url??null;
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
    const mag=this.chooseMagazine520(this.archiveFits(a,this.eligibleMags(now),now),a.work_genre||a.genre,now);
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
    let message='通信を確認待ち',slot,lease,env,attemptAt=0,retry=job.kind==='mag'?D520:M520;
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
        if(!owner || owner==='43__' || (!editorialProof162(noteLink161(job.url),info.value,html).ok && !(this.joinProof520(job.target,Date.now()) && joinFree520(info.value,html,this.joinTarget520(job.target))))){
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
          if(job.kind==='mag' && !this.magazineRoom520(job.target,at))return false;
          const marked=this.one("UPDATE desk_job SET phase='sent',target=?,at=?,message='操作開始を記録・結果は未確認（自動再送なし）' WHERE kind=? AND subject=? AND phase='wait' RETURNING subject",job.kind==='publish'?key:job.target,at,job.kind,job.subject);
          if(!marked)return false;
          attemptAt=at;
          if(job.kind==='mag')this.rows('INSERT OR IGNORE INTO desk_mag_send(article,id,at,day) VALUES(?,?,?,?)',job.key,job.target,at,jstDay(at));
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
      if(result.notClicked && attemptAt)this.storage.transactionSync(()=>{
        const undone=this.one("UPDATE desk_job SET phase='wait',message=? WHERE kind=? AND subject=? AND phase='sent' AND at=? RETURNING target",message,job.kind,job.subject,attemptAt);
        if(undone && job.kind==='mag')this.rows('DELETE FROM desk_mag_send WHERE article=? AND id=? AND at=?',job.key,job.target,attemptAt);
        if(undone && job.kind==='publish'){
          this.rows('DELETE FROM desk_snapshot WHERE article=? AND confirmed IS NULL',undone.target);
          if(job.link)this.rows('UPDATE desk_link_plan SET cover=NULL,check_at=NULL,result=? WHERE article=? AND pub IS NULL',message,undone.target);
          else this.rows('DELETE FROM desk_work_cover WHERE article=? AND seq=?',undone.target,Number(job.subject));
        }
      });
      if(result.seen)this.rows("UPDATE desk_job SET phase='seen',message=?,at=? WHERE kind=? AND subject=? AND (phase='wait' OR (phase='sent' AND at=?))",message,Date.now(),job.kind,job.subject,attemptAt);
      else if(attemptAt)this.rows("UPDATE desk_job SET message=? WHERE kind=? AND subject=? AND phase='sent' AND at=?",message,job.kind,job.subject,attemptAt);
      if(result.hold){
        const until=Date.now()+result.hold;
        this.rows('UPDATE desk_cfg SET blocked=MAX(blocked,?) WHERE id=1',until);
        await sql(this.env,'UPDATE nh_v13_connection SET hold_until=MAX(hold_until,?) WHERE slot=?',until,slot).run();
      }
    }catch(error){
      message=readLimit(error)?'D1の読み取り枠更新後に確認':error instanceof Trouble?failure(error):'接続・保存処理を完了できず・結果の再確認待ち';
      if(readLimit(error)){retry=(day+1)*D520+M520-now;this.rows('UPDATE desk_delivery SET due=? WHERE id=1',now+retry);}
      if(attemptAt)this.rows("UPDATE desk_job SET message=? WHERE kind=? AND subject=? AND phase='sent' AND at=?",message,job.kind,job.subject,attemptAt);
    }finally{
      this.rows("UPDATE desk_job SET message=?,next=?,at=? WHERE kind=? AND subject=? AND phase='wait'",message,Date.now()+retry,Date.now(),job.kind,job.subject);
      if(lease)await release(env,lease);
    }
  }
  recordReactionTitle(key,title,pub,now) {
    if (!/^n[a-z0-9]{1,64}$/.test(key) || !text520(title,300) || !Number.isFinite(pub) || pub<=0 || pub>now) return;
    if (title.trim()==='521') {
      this.rows('DELETE FROM desk_reaction_work WHERE article=?',key);
      return;
    }
    this.rows(`INSERT INTO desk_reaction_work(article,title,pub,seen) VALUES(?,?,?,?)
      ON CONFLICT(article) DO UPDATE SET title=excluded.title,pub=excluded.pub,seen=excluded.seen
      WHERE title<>excluded.title OR pub<>excluded.pub OR seen<=excluded.seen-86400000`,key,title,pub,now);
  }
  async syncReactions(now) {
    const state=this.one('SELECT * FROM desk_reactions WHERE id=1');
    if (state.due>now) return;
    const active=()=>this.one('SELECT 1 FROM desk_cfg c JOIN desk_delivery d ON d.id=c.id WHERE c.id=1 AND c.enabled=1 AND d.enabled=1 AND c.blocked<=?',Date.now());
    if (!active()) return;
    // Leave the account lease available just before a scheduled publication.
    const soon=now+6*M520;
    if(this.one('SELECT 1 FROM desk_link_plan WHERE pub IS NULL AND scheduled BETWEEN ? AND ? LIMIT 1',now-5*M520,soon) ||
       this.one('SELECT 1 FROM desk_work_schedule WHERE pub IS NULL AND scheduled BETWEEN ? AND ? LIMIT 1',now-5*M520,soon)) {
      this.rows('UPDATE desk_reactions SET due=? WHERE id=1',now+6*M520);
      return;
    }
    const works=this.rows('SELECT title FROM desk_reaction_work WHERE seen>=? ORDER BY pub DESC,article',now-9*D520);
    const titles=reactionTitles(works,now,state.char_limit);
    const desired=JSON.stringify(titles);
    // A short local poll discovers new releases without opening note or querying D1.
    let due=now+30*M520, message=state.message, token, env;
    this.rows('UPDATE desk_reactions SET desired=?,due=? WHERE id=1',desired,due);
    if (!titles.length) {
      this.rows("UPDATE desk_reactions SET message='公開を確認できた対象タイトル待ち' WHERE id=1");
      return;
    }
    if (state.confirmed===desired && !state.pending && state.checked>now-7*D520) return;
    const day=Math.floor(now/D520);
    if (state.utc_day===day && state.used>=4) {
      this.rows("UPDATE desk_reactions SET due=?,message='本日の確認回数に達したため翌日再確認' WHERE id=1",(day+1)*D520+M520);
      return;
    }
    try {
      if (typeof this.env.BROWSER?.acquire!=='function') {message='Cloudflareのブラウザー接続待ち';due=now+6*HOUR;return;}
      const account=await this.deliveryAccount();
      if (!account) {message='520の接続を確認待ち';due=now+2*HOUR;return;}
      if (account.until>now) {message='520の処理・待機の終了後に再確認';due=account.until+M520;return;}
      env=scoped(this.env,account.slot);
      token=await acquire(env,false);
      if (!token) {message='520の使用中・次回再確認';due=now+4*M520;return;}
      const cookie=cleanCookie((await loadCookie(env,account.id)).NOTE_SESSION);
      this.rows('UPDATE desk_reactions SET used=CASE WHEN utc_day=? THEN used+1 ELSE 1 END,utc_day=? WHERE id=1',day,day);
      const maySave=()=>!!active() && !(state.pending===desired && now-state.sent<2*HOUR);
      const reserve=()=>this.rows('UPDATE desk_reactions SET pending=?,sent=? WHERE id=1',desired,Date.now());
      const result=await syncArticleReactionSettings(this.env.BROWSER,account.id,cookie,titles,maySave,reserve);
      message=result.message;
      if (Number.isSafeInteger(result.limit) && result.limit>0) this.rows('UPDATE desk_reactions SET char_limit=? WHERE id=1',Math.min(result.limit,300));
      if (result.verified) {
        this.rows("UPDATE desk_reactions SET confirmed=?,checked=?,pending='' WHERE id=1",desired,Date.now());
      } else if (result.sent || (result.limit && result.limit<state.char_limit)) {
        due=now+4*M520;
      } else {
        due=now+2*HOUR;
      }
      if (result.hold>0) {
        const until=Date.now()+result.hold;
        due=Math.max(until,due);
        this.rows('UPDATE desk_cfg SET blocked=MAX(blocked,?) WHERE id=1',until);
        await sql(this.env,'UPDATE nh_v13_connection SET hold_until=MAX(hold_until,?) WHERE slot=?',until,account.slot).run();
      }
    } catch(error) {
      message=readLimit(error)?'D1の読み取り枠更新後に再確認':'note設定を読み戻せず・次回再確認';
      due=readLimit(error)?(day+1)*D520+M520:now+2*HOUR;
    } finally {
      this.rows('UPDATE desk_reactions SET message=?,due=? WHERE id=1',message,due);
      if (token) await release(env,token);
    }
  }
  async ensureRecommendation(now) {
    const state=this.one('SELECT * FROM desk_recommend WHERE id=1');
    if(state.done || state.due>now)return;
    const cfg=this.one('SELECT enabled,blocked FROM desk_cfg WHERE id=1');
    if(!cfg.enabled || cfg.blocked>now || !this.one('SELECT enabled FROM desk_delivery WHERE id=1').enabled)return;
    const binding=this.env?.BROWSER;
    if(typeof binding?.acquire!=='function'){
      this.rows("UPDATE desk_recommend SET due=?,message='ブラウザー未接続・note設定の確認待ち' WHERE id=1",now+HOUR);
      return;
    }
    // Reserve the work locally before any await; network errors survive restarts.
    this.rows("UPDATE desk_recommend SET due=?,message='520のおすすめ設定を確認中' WHERE id=1",now+HOUR);
    let message='520の登録・接続状態を確認できず・再確認待ち',due=now+6*HOUR,done=0,recommendEnv,recommendLease;
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
      recommendEnv=scoped(this.env,slot);recommendLease=await acquire(recommendEnv,false);
      if(!recommendLease){message='520の処理終了を確認待ち';due=now+4*M520;return;}
      const credential=await loadCookie(recommendEnv,id);
      const cookie=cleanCookie(credential.NOTE_SESSION);
      const today=Math.floor(now/D520);
      const used=state.utc_day===today?state.used:0;
      if(used>=2){due=(today+1)*D520+60000;message='本日の設定確認済み・次回確認待ち';return;}
      this.rows('UPDATE desk_recommend SET utc_day=?,used=? WHERE id=1',today,used+1);
      message='Cloudflareのブラウザーを起動できず・再確認待ち';
      const result=await browserRecommendation(binding,id,cookie,state.attempted,state.tries,async()=>{
        if(!this.shelfActive520())return false;
        const live=await sql(recommendEnv,'SELECT c.token,c.lease,c.account,c.next_at,h.kind,n.hold_until FROM nh_control c JOIN nh_health h ON h.id=c.id JOIN nh_v13_connection n ON n.slot=? WHERE c.id=1',slot).first(),at=Date.now();
        if(!live || live.token!==recommendLease || live.account!==id || live.lease<=at || live.hold_until>at || (live.kind && live.next_at>at))return false;
        this.rows("UPDATE desk_recommend SET attempted=?,tries=tries+1,message='ON操作の保存結果を確認待ち' WHERE id=1",at);
        return true;
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
      if(recommendLease)await release(recommendEnv,recommendLease);
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
  async task520(name, work) {
    try {
      const result=await work();
      this.rows("UPDATE desk_task_health SET failed=0,at=?,message='' WHERE task=? AND failed<>0",Date.now(),name);
      return result;
    } catch(error) {
      const message=readLimit(error)?'D1の読み取り枠更新待ち':error instanceof PublicReadError?publicReadReason(error):'読み取り・保存・接続の途中で失敗しました。次回に再確認します';
      this.rows('INSERT INTO desk_task_health(task,at,failed,message) VALUES(?,?,1,?) ON CONFLICT(task) DO UPDATE SET at=excluded.at,failed=1,message=excluded.message',name,Date.now(),message);
      return null;
    }
  }
  async tick() {
    this.init();
    const now=Date.now();
    const publication=this.duePublication(now);
    const task=(name,work)=>this.task520(name,work);
    if(publication)await task('予約作品の公開',()=>this.dispatch(now));
    await Promise.allSettled([
      task('作品とフォロワーの記録',()=>this.tickRecords()),
      task('共同誌の編集権限・募集条件',()=>this.automaticDirectory(now)),
      task('公開作品の一覧',()=>this.catalogue(now)),
      task('既刊の詳細',()=>this.observeArchive(now)),
      task('記事下のおすすめ設定',()=>this.ensureRecommendation(now)),
      task('新作の補助確認',()=>this.frontPageBackup(now))
    ]);
    await task('作品と掲載先の照合',()=>this.planArchive(Date.now()));
    if(!publication)await task('公開・共同誌への追加',()=>this.dispatch(Date.now()));
    await task('公開後の本文・見出し画像',()=>this.verifyLinkCover(Date.now()));
    await task('下書きタイトル',()=>this.lookupDraftTitle(Date.now()));
    await task('下書き一覧',()=>this.resolveDraftDirectory(Date.now()));
    await task('文芸誌の探索',()=>this.scoutLiterary(Date.now()));
    if(!publication)await task('参加先の募集確認',()=>this.expandJoin520(Date.now()));
    if(!publication)await task('Tutaの招待確認',()=>this.tutaTick520(Date.now()));
    if(!publication)await task('参加申請・招待の承認',()=>this.joinTick520(Date.now()));
    if(!publication)await task('人気記事の入口',()=>this.popularTick520(Date.now()));
    if(!publication)await task('520の作品棚',()=>this.shelfTick520(Date.now()));
    if(!publication)await task('スキのお礼設定',()=>this.syncReactions(Date.now()));
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
    const [,,newDue,magUpdated]=await Promise.all([
      this.task520('フォロワー数の計測',()=>this.followers(now)),
      this.task520('24時間・7日後の計測',()=>this.measure(now)),
      this.task520('520のRSS',()=>this.feed(now)),
      this.task520('共同誌の掲載確認',()=>this.magazines(now)),
      checkProbe && this.task520('公開情報の取得確認',()=>this.probe(now))
    ]);
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
const ruleLabel161=/(?:募集(?:要項|条件|規定|ルール|記事)|投稿(?:要項|条件|規定|ルール|ガイド)|参加(?:要項|方法|条件|規約|ルール|申請)|メンバー募集|掲載(?:条件|基準|規定)|運営(?:方針|ルール)|ガイドライン|応募要項)/;
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
    if(/(必須|に限[るり]|のみ|投稿数|[0-9]+(?:字|文字)|1日.{0,8}(?:本|回)|曜日指定|限定|対象外|要審査|事前(?:承認|審査|確認|申請)|が必要|必要です|休止中|受付停止|不可|禁止|NG|をお願いします|にしてください|をしてください)/i.test(line) && !clauses.includes(line))unknown.push(line);
  }
  for(let line of clauses) {
    if(/^(?:ご覧(?:いただき|頂き)|お読み(?:いただき|頂き))ありがとうございます[!！]?$/.test(line) ||
       /^(?:いつも)?(?:ご参加|ご投稿|ご訪問|応援|ご協力)ありがとうございます[!！]?$/.test(line) ||
       /^(?:どうぞ|今後とも|引き続き)?よろしく(?:お願い(?:いたします|致します|します))?[!！]?$/.test(line))continue;
    if(/^(?:対象|募集)?ジャンル(?:は|:)?(?:不問(?:です)?|自由(?:です)?|問いません|制限なし|制限はありません)$/.test(line)) {
      genre520.forEach(v=>groups.genres.add(v));continue;
    }
    if(/^(?:制作方法|執筆方法|制作手法)(?:は|:)?(?:不問(?:です)?|自由(?:です)?|問いません|制限なし|制限はありません)$/.test(line) ||
       /^(?:生成)?AI(?:の)?(?:使用|利用)(?:の有無)?(?:は|を)?(?:問いません|不問(?:です)?)$/.test(line)) {
      method520.forEach(v=>groups.methods.add(v));continue;
    }
    // Normalize politeness on complete permission clauses, never on embedded restrictions.
    line=line.replace(/(?:掲載|投稿)(?:すること)?ができます$/,'可')
      .replace(/(?:は)?(?:必要はありません|必要ありません)$/,'は不要')
      .replace(/(?:も|は)(?:掲載|投稿)(?:して)?(?:いただけます|頂けます)$/,'も可')
      .replace(/(?:可|OK|歓迎|可能)です$/,m=>m.slice(0,-2));
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
  const reason=excluded.length?[...new Set(excluded)].join('・'):missing.join('・')+
    (unknown.length?' ／ 確認できない記載：'+[...new Set(unknown)].slice(0,2).map(v=>v.slice(0,90)).join(' ／ '):'');
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
  const owner=/^\/(\w[\w-]{0,79})(?:\/magazines)?\/?$/;
  const fromOwner=owner.exec(a.pathname)?.[1];
  if(!fromOwner || owner.exec(b.pathname)?.[1]!==fromOwner)return null;
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
  if(s.join)lines.push(joinRecord520(s.join));
  if(s.shelf)lines.push(shelfRecord520(s.shelf));
  if(s.popular)lines.push('【人気記事の入口】'+s.popular.message+(s.popular.checked?' ／ '+time(s.popular.checked):''));
  if(s.reactions) {
    const r=s.reactions;
    lines.push('【記事にスキした読者へのお礼】'+(s.deliveryOn && s.cfg.enabled?'':'（自動更新は休止中）'),
      r.message,'更新候補　'+(JSON.parse(r.desired).join(' ／ ')||'公開作品の取得待ち'));
    if(r.checked)lines.push('noteで最後に確認したタイトル（'+tm(r.checked)+'）　'+JSON.parse(r.confirmed).join(' ／ '));
  }
  if(s.magazineProgress){
    const p=s.magazineProgress;
    lines.push('【共同誌への追加の進み具合】',p.message,
      '発見 '+p.found+'誌 ／ 編集権限・無料を確認 '+p.rights+'誌 ／ 募集条件を確認 '+p.policy+'誌 ／ 最近の更新も確認 '+p.eligible+'誌',
      '追加の操作開始・追加済み確認 '+p.attempts+'作品 ／ 誌面RSSで掲載を確認 '+p.confirmed+'作品 ／ 操作後の掲載確認待ち '+p.uncertain+'作品',
      '参加申請・招待の承認の状態は専用欄に表示します。公開情報で編集権限を確認できない場合も保留します。');
  }
  if(s.taskFailures?.length){
    lines.push('【途中で失敗した処理】');
    for(const f of s.taskFailures)lines.push(f.task+' ／ '+f.message+' ／ '+tm(f.at));
  }
  if(s.scout)lines.push('掲載先探索 ／ 発見 '+s.scout.total+'誌 ／ 現在の掲載条件・編集権限を確認済み '+s.scout.allowed+'誌 ／ 本日探索を試みたページ '+s.scout.used+'か所（最大64） ／ '+s.scout.message);
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
function magazineProgressText520(p){
  return p?p.message+'\n発見 '+p.found+'誌 ／ 編集権限・無料を確認 '+p.rights+'誌 ／ 募集条件を確認 '+p.policy+'誌 ／ 最近の更新も確認 '+p.eligible+'誌'+
    '\n追加の操作開始・追加済み確認 '+p.attempts+'作品 ／ 誌面RSSで掲載を確認 '+p.confirmed+'作品 ／ 操作後の掲載確認待ち '+p.uncertain+'作品':'記録を開くと、追加がどの段階まで進んでいるか表示します。';
}
function deskMagazineList(records) {
  if(!records)return '';
  const lines=records.imports.map(m=>m.name+' ／ '+(m.mode==='excluded'?'除外済み':m.allowed?m.state+(m.reason?'：'+m.reason:''):m.memberReason||'運営資格を確認待ち'));
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
<title>520 作品管理 ${VERSION}</title><style>body{font:16px system-ui;max-width:740px;margin:24px auto;padding:0 16px;color:#232629;line-height:1.6}label,fieldset,details,section{display:block;margin:12px 0}input:not([type=checkbox]),textarea,select{width:100%;box-sizing:border-box;font:inherit;padding:8px}button,summary{font:inherit;padding:9px;cursor:pointer}button{margin:6px 5px 6px 0}p{overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f4f6;padding:12px}#msg{font-weight:600}img{max-width:100%;max-height:190px}small{display:block}</style></head><body>
<p><a href="/tuta" style="display:block;padding:16px;background:#eef2ff;font-weight:bold">Tuta接続・招待メールの自動確認</a></p><a href="/">スキ回りの管理画面へ</a><h1>520 作品管理</h1><small>${VERSION}</small><p>43__ 専用・日本時間。公開確認と計測には公開情報を使います。</p>
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
<details><summary>自動公開・共同誌・参加申請・作品棚・お礼更新を休止／再開</summary><button type="button" id="autopause">休止</button><button type="button" id="autoresume">再開</button></details>
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
<details open id="joinsection"><summary>参加申請・招待の自動承認</summary>
<pre id="joinstatus">${esc(records?.join?joinRecord520(records.join):'「記録を開く」で申請・招待の状態を確認できます。')}</pre>
<p>公開ページから新しい文芸誌を継続して探します。誌数・探索元数に固定の累計上限はありません。無料で参加方法を確認できた誌へ520として参加希望を1回送ります。フォローは増やしません。フォロー必須の誌は既にフォロー済みと確認できた場合だけ申請します。招待の到着後に承認し、掲載条件を別に確認します。</p>
<button type="submit" form="readform" name="work_action" value="join_off">自動申請・承認を休止</button>
<button type="submit" form="readform" name="work_action" value="join_on">自動申請・承認を再開</button>
<details><summary>届いた招待リンクを登録する（受信未接続の場合）</summary>
<label>noteから届いた招待の承認リンク<input name="invite_url" form="readform" type="password" autocomplete="off" autocapitalize="none" spellcheck="false"></label>
<small>登録済みの申請先マガジンIDを含むnote公式の招待リンクに対応します。共有用下書きリンクやマガジンの公開URLではありません。</small>
<button type="submit" form="readform" name="work_action" value="join_invite">招待を保存して自動承認を待つ</button></details>
<details open id="tutaconnect"><summary>Tutaを接続（最初の1回）</summary>
<p>今のTutaのまま、noteの共同運営招待を自動で確認します。独自ドメイン・転送設定・noteの登録メール変更は不要です。</p>
<p>上の管理用の鍵を入力し、下にTutaのログイン情報を入力してください。Cloudflare上のブラウザーが受信箱を確認します。接続情報は暗号化保存し、画面やログには出しません。対象の招待メールは既読になる場合があります。</p>
<label>Tutaのメールアドレス<input name="tuta_email" form="readform" type="email" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="254"></label>
<label>Tutaのパスワード<input name="tuta_password" form="readform" type="password" autocomplete="new-password" maxlength="1024"></label>
<details><summary>認証アプリの2段階認証を使っている場合</summary><p>本人のTOTP設定キー（6桁のコードではありません）を指定できます。空欄で追加認証が必要になった場合は保留します。セキュリティキーや別端末での承認は自動で通過できません。</p><label>TOTP設定キー（任意）<input name="tuta_totp" form="readform" type="password" autocomplete="new-password" maxlength="128" autocapitalize="none" spellcheck="false"></label></details>
<button type="submit" form="readform" name="work_action" value="tuta_connect">Tutaを接続して自動確認</button>
<button type="submit" form="readform" name="work_action" value="tuta_check">Tutaの接続を再確認</button>
<button type="submit" form="readform" name="work_action" value="tuta_off">Tutaの接続情報を削除して停止</button>
<small>設定保存だけでは接続成功ではありません。「記録を開く」で確認結果を見られます。通常は1時間ごと、1日最大24回。直近7日の受信箱を1回最大4ページ・招待8件まで確認し、確認範囲も記録します。参加申請・自動運転の休止中は受信箱も確認しません。</small>
</details>
<details><summary>独自ドメインで受信する従来の設定（Tuta接続には不要）</summary>
<p>note専用の受信アドレスをCloudflare Email Routingで作り、このWorkerへ送る設定にします。受信アドレスをNOTE_INVITE_TOに指定します。</p>
<p>今読めるメール（Tutaなど）をCloudflareの転送先として確認し、NOTE_MAIL_FORWARD_TOに指定します。専用受信先に届くメールをそこへ転送し、note本人からの対象誌の招待だけを自動処理します。メール変更の確認やパスワード再設定も今の受信箱で読めます。</p>
<p>登録メールを変更する前に、専用受信先へテストメールを送り、元の受信箱への到着を確認してください。その後、noteの設定で専用受信先へ変更し、届いた確認メールを開きます。このプログラム自体は登録メールを変更しません。「クリエイターからの招待・プレゼント」の通知は自動でONを確認します。</p>
<small>受信先や転送先の指定だけでは、実際の到着は未確認です。自分のドメインと転送先の確認が必要です。自動処理の対象にできない招待も転送先で読めます。手動で承認する場合は、520でログインして招待メールのリンクを開けます。</small></details></details>
<details open><summary>520の作品棚・回遊</summary>
<pre id="shelfstatus">${esc(records?.shelf?shelfRecord520(records.shelf):'「記録を開く」で作品棚の状態を確認できます。')}</pre>
<p>無料の「520 作品案内」を本人のマガジンに作り、新作と既刊を少しずつ集めます。公開7日後のスキが計測できた作品と、まだ紹介していない作品を選びます。記事下の相互おすすめとスキのお礼も引き続き確認します。プロフィールの「人気記事」表示もONを確認し、読者が過去作を探せる入口を増やします。人気表示はnote側で16記事以上の公開が必要です。</p></details>
<details id="magsection"><summary>マガジンの自動確認</summary>
<p>520の公開一覧、ほかの作者の一覧、文芸誌の最新号から継続して探します。1回に処理しきれない一覧と次ページは続きから確認します。累計誌数の上限は設けません。通信量と申請間隔は抑えます。</p>
<p>発見しただけの誌には追加しません。共同運営者としての編集権限・無料・募集条件を確認できた誌が対象です。参加申請・招待の承認は上の専用欄に表示します。</p>
<button type="submit" form="readform" name="work_action" value="scout">掲載先を今探す</button>
<pre id="magprogress">${esc(magazineProgressText520(records?.magazineProgress))}</pre>
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
      show(s);if(['reserve_link','replace_link','cancel_link','preview_link','scout'].includes(action))return s;
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
    if($('joinstatus') && s.join)$('joinstatus').textContent='【参加申請・招待の承認】'+(s.recordText.split('【参加申請・招待の承認】')[1]?.split('【')[0]||'');
    if($('shelfstatus') && s.shelf)$('shelfstatus').textContent='【520の作品棚】'+(s.recordText.split('【520の作品棚】')[1]?.split('【')[0]||'');
    $('directory').textContent=s.directory.message;
    $('magprogress').textContent=s.magazineProgressText;
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
    if(['join_on','join_off','join_invite','tuta_connect','tuta_check','tuta_off'].includes(action))return;
    if(action==='scout'){
      event.preventDefault();
      return wrap(async()=>(await send('scout')).correctionMessage)();
    }
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


// Reviewed application routes. Each issue has its own durable request/invitation state.
const JOIN_TARGETS520 = Object.freeze([
  {id:'m4d9023d7133b',owner:'mitsuruamano',article:'n27b0a1eb95ff',name:'創作の森 エンターテイナー・ストリート',match:'創作の森',follow:false,perDay:2,genres:['短編小説','小説','詩']},
  {id:'m32620a9cd50d',owner:'kakitsubataayame',article:'ndeca84d9c7ea',name:'共同運営マガジンnote文芸部',match:'note文芸部',follow:true,perDay:5,genres:['短編小説','小説','詩','エッセイ','散文']},
  {id:'md3a807653baf',owner:'wise_rat6355',article:'nb26aa7f77676',name:'綴り灯',match:'綴り灯',follow:true,perDay:1,genres:genre520},
  {id:'md3fff28070f2',owner:'kknk41',article:'n315aba6a1972',name:'えんぴつくるくる',match:'えんぴつくるくる',follow:false,perDay:1,genres:['短編小説','小説'],restricted:true}
].map(j=>Object.freeze({...j,url:'https://note.com/'+j.owner+'/m/'+j.id,rule:'https://note.com/'+j.owner+'/n/'+j.article,
  comment:'はじめまして。520（43__）です。'+(j.match==='綴り灯'?'綴り灯、':'')+'参加希望です。よろしくお願いいたします。'})));
const JOIN520=JOIN_TARGETS520[0]; // Retain the old migration's identity.
const joinTarget520=id=>JOIN_TARGETS520.find(j=>j.id===id);
function joinFree520(data,html='',target=JOIN520) {
  const d=data?.data?.magazine??data?.data,h=magHeader162(html,{id:target.id});
  if(d?.key!==target.id || d.owner?.urlname!==target.owner)return false;
  return !(h.paid || d.isPaid===true || d.is_paid===true || Number(d.price)>0 || /^(paid|subscription|membership)$/i.test(d.magazineType??d.type??'')) &&
    (h.free || d.price===0 || d.isFree===true || d.magazineType==='free');
}
function joinRecruitment520(n,html='',target=JOIN520) {
  if(target?.dynamic)return genericJoinRoute520(n,html,target);
  if(n?.key!==target.article || n.user?.urlname!==target.owner || n.status!=='published' ||
    n.is_limited===true || n.is_paid===true || n.isLimited===true || n.isPaid===true || Number(n.price)>0 ||
    typeof n.body!=='string' || n.body.length>250000)return false;
  const t=words161(n.body).normalize('NFKC').replace(/\s+/g,'');
  if(!t.includes(target.match) || !/共同(?:運営)?マガジン/.test(t) || !/コメント/.test(t) || !/参加希望/.test(t) || !/招待/.test(t))return false;
  // Changed monetary, identity, or extra promotional requirements are never guessed.
  if(/募集(?:停止|終了|休止)|受付(?:停止|終了|休止)|満員|新規参加.{0,20}(?:不可|お断り)|参加費.{0,15}[1-9]\d*円|審査料|参加.{0,15}(?:購入必須|有料|決済)|(?:自己紹介|紹介記事|スキ|リポスト|シェア|メンバーシップ).{0,12}(?:必須|義務|が必要)|(?:本人確認書類|電話番号|住所)を(?:送|記入)|DMのみ/.test(t))return false;
  if(!target.follow && /フォロー.{0,12}(?:必要|必須|してください)|フォローが必要/.test(t))return false;
  if(target.id===JOIN520.id && (!/参加費は(?:完全)?無料/.test(t) || !/参加の申請は[、,]?コメント欄に参加希望と書くだけです/.test(t) || /合言葉/.test(t)))return false;
  if(target.follow && !/フォロー/.test(t))return false;
  if(target.match==='note文芸部' && (!/この記事にコメント|こちらの記事にコメント/.test(t) || !/1日の投稿数上限は5記事/.test(t)))return false;
  if(target.match==='綴り灯' && (!/一日一本|1日1本/.test(t) || !/クリエイターからの招待・プレゼント/.test(t)))return false;
  if(target.restricted && (!/AI生成文のそのままの投稿不可/.test(t) || !/公募・新人賞/.test(t)))return false;
  const forward=anchors161(n.body).some(a=>noteLink161(a.href,target.rule)?.id===target.id);
  const back=noteLink161(meta161(html,'og:url'))?.id===target.id && anchors161(html).some(a=>noteLink161(a.href,target.url,'article')?.id===target.article);
  return forward || back;
}
function inviteUrl520(raw,id=JOIN520.id,requireId=false) {
  if(typeof raw!=='string' || raw.length>6000 || /[\x00-\x20\x7f]/.test(raw))return null;
  try {
    const u=new URL(xmlValue520(raw));
    if(u.origin!=='https://note.com' || u.username || u.password || u.hash || u.port)return null;
    const decoded=decodeURIComponent(u.pathname+'?'+u.searchParams.toString());
    if(!/invit|招待|承認|accept|(?:^|\/)join(?:\/|\?)/i.test(decoded) || /(?:^|\/)(?:login|logout|settings|api|purchase|checkout)(?:\/|\?|$)/i.test(decoded))return null;
    const ids=Array.from(decoded.matchAll(/(?:^|[\/=])((?:m)[a-z0-9]{12})(?![a-z0-9])/g),m=>m[1]);
    if(ids.some(k=>k!==id) || (requireId && !ids.includes(id)))return null;
    for(const [key,value] of u.searchParams) {
      if(/redirect|return|next|url|continue/i.test(key))return null;
      if(/^https?:/i.test(value))return null;
    }
    return u.href;
  } catch{return null;}
}
async function sealInvite520(env,id,link) {
  const key=await encryptionKey(env),iv=crypto.getRandomValues(new Uint8Array(12));
  const bytes=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('note-helper:invite:v1:43__:'+id)},key,new TextEncoder().encode(link));
  return {iv:b64(iv),ciphertext:b64(bytes)};
}
async function openInvite520(env,row) {
  const key=await encryptionKey(env);
  const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(row.iv),additionalData:new TextEncoder().encode('note-helper:invite:v1:43__:'+row.id)},key,unb64(row.ciphertext));
  return new TextDecoder().decode(bytes);
}
// The first Authentication-Results field is stamped by Cloudflare Email Routing.
// A user-forwarded body is not proof of note's sender; nested authentication fields are ignored.
function noteMail520(message,env) {
  const to=String(env.NOTE_INVITE_TO||'').trim().toLowerCase();
  if(!to || String(message.to||'').toLowerCase()!==to)return false;
  const ar=message.headers.get('Authentication-Results')||'';
  const first=ar.split(/,(?=\s*[^;,\s]+\s*;)/)[0];
  if(!/^\s*mx\.cloudflare\.net\s*;/i.test(first) || !/(?:^|;)\s*dmarc=pass\b/i.test(first))return false;
  const from=message.headers.get('From')||'';
  const address=from.match(/<([^<>\s]+)>\s*$/)?.[1] || from.trim();
  if(!/^[^@<>\s,;]+@(?:[a-z0-9-]+\.)?note\.(?:com|mu)$/i.test(address))return false;
  const domain=address.split('@')[1].toLowerCase();
  const aligned=first.match(/\bheader\.from=([^;\s,]+)/i)?.[1]?.toLowerCase();
  return aligned===domain;
}
function mailText520(raw,depth=0) {
  need520(depth<6 && raw.length<=250000,'招待メールの形式を確認できません。');
  const cut=/\r?\n\r?\n/.exec(raw);
  need520(cut,'招待メールの本文がありません。');
  const head=raw.slice(0,cut.index).replace(/\r?\n[ \t]+/g,' '),body=raw.slice(cut.index+cut[0].length);
  const get=name=>head.match(new RegExp('^'+name+':\\s*(.*)$','im'))?.[1]||'';
  const type=get('Content-Type');
  if(/attachment/i.test(get('Content-Disposition')))return '';
  if(/^multipart\/(?:alternative|mixed|related)\b/i.test(type)) {
    const boundary=type.match(/boundary\s*=\s*(?:"([^"\r\n]+)"|([^;\s]+))/i);
    need520(boundary && (boundary[1]||boundary[2]).length<=150,'招待メールの区切りを確認できません。');
    const token='--'+(boundary[1]||boundary[2]),parts=body.split(token).slice(1);
    need520(parts.length<=20 && parts.some(p=>p.startsWith('--')),'招待メールを読み切れません。');
    return parts.filter(p=>!p.startsWith('--')).map(p=>mailText520(p.replace(/^\r?\n/,''),depth+1)).join('\n');
  }
  if(type && !/^text\/(?:plain|html)\b/i.test(type))return '';
  const charset=type.match(/charset\s*=\s*"?([^;"\s]+)/i)?.[1]||'utf-8';
  need520(/^(?:utf-8|us-ascii)$/i.test(charset),'UTF-8形式の招待メールを指定してください。');
  const encoding=get('Content-Transfer-Encoding').trim().toLowerCase();
  let text=body;
  if(encoding==='base64')text=new TextDecoder('utf-8',{fatal:true}).decode(unb64(body.replace(/\s/g,'')));
  else if(encoding==='quoted-printable') {
    const soft=body.replace(/=\r?\n/g,''),bytes=[];
    for(let i=0;i<soft.length;i++) {
      if(soft[i]==='=' && /^[a-f0-9]{2}$/i.test(soft.slice(i+1,i+3))){bytes.push(parseInt(soft.slice(i+1,i+3),16));i+=2;}
      else {need520(soft.charCodeAt(i)<128,'メールの文字コードを確認できません。');bytes.push(soft.charCodeAt(i));}
    }
    text=new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(bytes));
  }else need520(!encoding || ['7bit','8bit','binary'].includes(encoding),'メールの文字コードを確認できません。');
  return text;
}
function inviteFromMail520(text,details=false) {
  const plain=words161(text).normalize('NFKC').replace(/\s+/g,'');
  const matches=JOIN_TARGETS520.filter(j=>plain.includes(j.match));
  need520(matches.length===1 && /招待/.test(plain) && /共同運営/.test(plain),'対象誌の共同運営招待を特定できません。');
  const target=matches[0];
  const links=[...anchors161(text).filter(a=>/参加|承認|招待|確認/.test(a.label)).map(a=>a.href),
    ...Array.from(text.matchAll(/https:\/\/note\.com\/[^\s<>"']+/g),m=>m[0])];
  const urls=[...new Set(links.map(s=>inviteUrl520(s,target.id)).filter(Boolean))];
  need520(urls.length===1,'招待の承認リンクを1つに特定できません。');
  return details?{url:urls[0],id:target.id}:urls[0];
}
// The registered note address also receives account verification and recovery mail.
// Keep a copy in the owner's verified inbox; only authenticated invitations can
// enter the existing approval workflow. No account-verification URL is opened here.
function noteMailConfig520(env) {
  const address=value=>{
    const v=String(value||'').trim();
    return v.length<=254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(v)?v:'';
  };
  const recipient=address(env.NOTE_INVITE_TO),forward=address(env.NOTE_MAIL_FORWARD_TO);
  const requested=!!String(env.NOTE_MAIL_FORWARD_TO||'').trim();
  const error=requested && (!recipient || !forward || recipient.toLowerCase()===forward.toLowerCase());
  return {recipient,forward:requested && !error?forward:'',error};
}
async function receiveNoteInvite520(message,env) {
  const cfg=noteMailConfig520(env);
  if(!cfg.recipient || String(message.to||'').toLowerCase()!==cfg.recipient.toLowerCase()) {
    message.setReject('Unexpected recipient');return;
  }
  if(cfg.error)throw new Error('note-helper: invalid mail forwarding configuration');
  const trusted=noteMail520(message,env);
  // Parsing is bounded and never determines whether an inbox copy is kept.
  // Cloudflare's raw stream can be parsed before calling forward().
  let text=null;
  if(trusted && message.rawSize<=250000) {
    try {text=mailText520(await read520body(new Response(message.raw),250000));}
    catch { /* Unsupported MIME still reaches the owner's inbox below. */ }
  }
  if(cfg.forward) {
    // A failed forward must never be acknowledged as successful or followed by
    // an automatic acceptance. Do not expose recipient addresses in errors.
    try {
      if(message.canBeForwarded===false || typeof message.forward!=='function')throw Error();
      await message.forward(cfg.forward);
    } catch {throw new Error('note-helper: inbox copy could not be forwarded');}
  }
  if(!trusted) {
    if(!cfg.forward)message.setReject('Verified note invitation sender required');
    return;
  }
  if(text===null) {
    if(!cfg.forward)message.setReject('Unsupported invitation message');
    return;
  }
  const plain=words161(text).normalize('NFKC').replace(/\s+/g,'');
  if(!/共同運営/.test(plain) || !/招待/.test(plain)) {
    if(!cfg.forward)message.setReject('Invitation-only recipient; inbox forwarding is not configured');
    return;
  }
  if(!env.SCHEDULER)throw new Error('note-helper: invitation storage unavailable');
  let invitation;
  try {invitation=inviteFromMail520(text,true);}catch{invitation={mail:text};}
  // The owning DO resolves durable targets. Raw mail is not stored or displayed.
  const response=await stub520(env).fetch(new Request('https://scheduler.internal/desk/invitation',{
    method:'POST',body:JSON.stringify(invitation)}));
  const status=response.status;
  await response.body?.cancel().catch(()=>{});
  if(status===400) {
    // An unmatched invitation remains readable in the owner's inbox. Storage
    // errors use a different status and must never be mistaken for a mismatch.
    if(!cfg.forward)message.setReject('Invitation target could not be verified');
    return;
  }
  if(!response.ok)throw new Error('note-helper: invitation could not be saved');
}

// Only note's native comment composer is changed. No undocumented POST endpoint is used.
function noteJoinDOM520(step,arg) {
  if(location.origin!=='https://note.com' || location.pathname.replace(/\/$/,'')!=='/'+arg.owner+'/n/'+arg.article)return {state:'page'};
  const canonical=document.querySelector('link[rel="canonical"]')?.href;
  if(!canonical || new URL(canonical).origin!==location.origin || new URL(canonical).pathname.replace(/\/$/,'')!==location.pathname.replace(/\/$/,''))return {state:'page'};
  const visible=e=>e.getClientRects().length>0 && !e.closest('[hidden],[aria-hidden=true]');
  const name=e=>(e.getAttribute('aria-label')||e.innerText||e.value||'').trim();
  const fields=[...document.querySelectorAll('textarea')].filter(e=>visible(e) && !e.disabled && !e.readOnly && /コメント/.test([e.placeholder,e.getAttribute('aria-label'),...Array.from(e.labels||[],l=>l.textContent)].join(' ')));
  if(fields.length!==1)return {state:'composer'};
  const field=fields[0];
  const nodes=[...document.querySelectorAll('[data-comment-id],[data-testid="comment-item"],.m-comment,.o-commentList__item,.m-commentList__item')].filter(visible);
  const cards=nodes.filter(n=>!nodes.some(other=>other!==n && other.contains(n)));
  for(const card of cards) {
    const own=[...card.querySelectorAll('a[href]')].some(a=>{try{const u=new URL(a.href);return u.origin===location.origin && u.pathname.replace(/\/$/,'')==='/43__';}catch{return false;}});
    if(own && /参加(?:を)?希望|参加したい|招待/.test(card.innerText))return {state:'existing'};
  }
  const load=[...document.querySelectorAll('button,a,[role=button]')].filter(e=>visible(e) && /^(?:もっと見る|さらに表示|コメントをすべて見る|すべてのコメントを表示|以前のコメントを表示|次のコメント)$/.test(name(e)) &&
    (e.closest('[class*="comment"],[class*="Comment"],[data-testid*="comment"]')));
  if(step==='more' && load.length===1){load[0].click();return {state:'loading'};}
  // An incomplete comment history cannot establish that this account has not already applied.
  if(!Number.isSafeInteger(arg.count) || arg.count<0 || cards.length!==arg.count || load.length)return {state:'history'};
  if(step==='read')return {state:'ready'};
  let scope=field.closest('form')||field.parentElement;
  let buttons=[];
  for(let depth=0;scope && depth<5;depth++,scope=scope.parentElement) {
    if(scope.querySelectorAll('textarea').length!==1)break;
    buttons=[...scope.querySelectorAll('button,input[type=submit],[role=button]')].filter(e=>visible(e) && name(e)==='送信');
    if(buttons.length)break;
  }
  if(buttons.length!==1 || field.closest('[role=dialog]'))return {state:'composer'};
  if(step==='fill') {
    if(field.value && field.value!==arg.comment)return {state:'draft'};
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,arg.comment);
    field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));
    return {state:'filled'};
  }
  if(step==='send') {
    if(field.value!==arg.comment || buttons[0].disabled || buttons[0].getAttribute('aria-disabled')==='true')return {state:'composer'};
    buttons[0].click();return {state:'clicked'};
  }
  return {state:'page'};
}
async function browserJoin520(binding,id,cookie,job,mark,mayAct) {
  const target=validJoinTarget520(job.definition) ? job.definition : joinTarget520(job.target||JOIN520.id);
  if(!target)return {message:'申請先を確認できません'};
  return inNoteBrowser(binding,cookie,false,async({command,evaluate,blocked,blockedResult:originalBlocked})=>{
    const blockedResult=()=>{const result=originalBlocked();if(/HTTP (401|403|429)\b/.test(result.message))result.hold=Math.max(2*HOUR,result.hold||0);return result;};
    const poll=async(fn,ok)=>{for(let i=0;i<12 && !blocked();i++){try{const x=await fn();if(ok(x))return x;}catch{}await pause520(220);}return null;};
    await command('Page.navigate',{url:'https://note.com/'});
    const who=await poll(()=>evaluate(noteIdentityJS),x=>x?.id && x?.name);
    if(blocked())return blockedResult();
    if(who?.id!==id || who?.name!=='43__')return {message:'520本人のログインを確認待ち'};
    const member=async()=>{
      const data=await evaluate(`(async()=>{if(location.origin!=='https://note.com')return null;
        const r=await fetch('/api/v1/magazines/${target.id}',{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(4500)});
        return r.ok?await r.json():null;})()`);
      return !blocked() && editorialProof162({id:target.id},data,'').ok;
    };
    if(await member())return {joined:true,message:'520が共同運営メンバーであることを確認済み'};
    if(blocked())return blockedResult();
    if(job.kind==='verify')return {message:'共同運営メンバーへの反映を再確認待ち'};
    if(job.kind==='invite') {
      if(!inviteUrl520(job.url,target.id) || !await mayAct())return {message:'招待の対象・待機・設定を再確認待ち'};
      // Opening a bearer invitation can itself accept it. Persist before navigation, not after it.
      if(!await mark())return {message:'招待の変更・停止を確認したため承認を保留'};
      await command('Page.navigate',{url:job.url});
      await pause520(1000);
      if(blocked())return blockedResult();
      const screen=await evaluate(`(()=>{if(location.origin!=='https://note.com')return 'outside';
        const root=document.querySelector('main,[role=main]')||document.body,t=root.innerText||'';
        if(/期限切れ|有効期限.*(?:切れ|過ぎ)|無効な招待|招待.*無効/.test(t))return 'expired';
        if(!t.includes(${JSON.stringify(target.match)})||!/共同運営/.test(t)||!/招待/.test(t))return 'unknown';
        if(/購入|支払|決済|月額|有料/.test(t))return 'paid';
        const buttons=[...root.querySelectorAll('button')].filter(b=>b.getClientRects().length&&!b.disabled&&['招待を承認する','招待を承認','参加する','承認する'].includes(b.textContent.trim()));
        return buttons.length===1?'ready':'unknown';})()`);
      if(screen==='ready' && !blocked() && await mayAct()) {
        // A second identity check covers redirects/login transitions after following the invitation.
        const identity=await evaluate(noteIdentityJS);
        if(identity?.id===id && identity.name==='43__' && !blocked())await evaluate(`(()=>{
          if(location.origin!=='https://note.com')return false;
          const root=document.querySelector('main,[role=main]')||document.body,t=root.innerText||'';
          if(!t.includes(${JSON.stringify(target.match)})||!/共同運営/.test(t)||!/招待/.test(t)||/購入|支払|決済|月額|有料/.test(t))return false;
          const bs=[...root.querySelectorAll('button')].filter(b=>b.getClientRects().length&&!b.disabled&&['招待を承認する','招待を承認','参加する','承認する'].includes(b.textContent.trim()));
          if(bs.length!==1)return false;bs[0].click();return true;})()`);
      }
      return blocked()?blockedResult():{expired:screen==='expired',message:screen==='expired'?'招待リンクが期限切れです。新しい招待を受信すると再確認します。':screen==='paid'?'有料の参加画面を検出・承認を保留':'承認操作を記録・次回に参加状態を別の接続で確認'};
    }
    if(job.kind==='apply') {
      const preparation=await prepareJoinAccount520({command,evaluate,blocked,poll},target,id,job.steps||{},mark,mayAct);
      if(preparation)return blocked()?blockedResult():preparation;
    }
    await command('Page.navigate',{url:target.rule});
    const fresh=await poll(()=>evaluate(`(async()=>{if(location.origin!=='https://note.com')return null;
      const r=await fetch('/api/v3/notes/${target.article}',{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(4500)});
      if(!r.ok)return null;const n=(await r.json()).data;
      if(n?.key!==${JSON.stringify(target.article)}||n.user?.urlname!==${JSON.stringify(target.owner)}||n.status!=='published')return null;
      return {hash:await (${draftBodyHash.toString()})(n.body),count:n.commentCount??n.comment_count};})()`),x=>x?.hash);
    if(blocked())return blockedResult();
    if(!fresh || fresh.hash!==job.hash)return {message:'募集記事が変更されたため申請を再確認待ち'};
    const arg={...target,count:fresh.count};
    // Comment composers below the article can be mounted only when scrolled into view.
    await evaluate('window.scrollTo(0,document.documentElement.scrollHeight)');
    const form=step=>evaluate('('+noteJoinDOM520.toString()+')('+JSON.stringify(step)+','+JSON.stringify(arg)+')');
    let result=await poll(()=>form('read'),x=>['ready','existing','history'].includes(x?.state));
    for(let i=0;result?.state==='history' && i<12 && !blocked();i++) {
      if((await form('more')).state!=='loading')break;
      await pause520(250);result=await form('read');
    }
    if(result?.state==='existing')return {existing:true,message:'520の参加希望コメントを確認済み・招待待ち'};
    if(job.kind==='check')return {message:'申請結果は未確認・同じ申請は自動再送しません'};
    if(result?.state!=='ready')return {message:'コメント欄と過去の参加申請を読み切れず・申請を保留'};
    if(blocked())return blockedResult();
    if((await form('fill')).state!=='filled')return {message:'参加希望コメントの入力欄を確認待ち'};
    await pause520(300);
    const identity=await evaluate(noteIdentityJS);
    if(blocked())return blockedResult();
    if(identity?.id!==id || identity.name!=='43__' || !await mayAct() || !await mark())return {message:'本人・停止・待機を再確認したため申請を保留'};
    const sent=await form('send');
    return sent?.state==='clicked'?{sent:true,message:'参加申請を操作済み・次回に送信結果を確認'}:
      {notClicked:true,message:'送信ボタンを確認できず・申請していません'};
  });
}

Object.assign(Desk520.prototype,{
  initJoin520() {
    if(!this.one("SELECT 1 FROM sqlite_master WHERE name='desk_join_cfg'"))
    this.storage.transactionSync(()=>{
      this.rows("CREATE TABLE desk_join_cfg(id INTEGER PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 1,due INTEGER NOT NULL DEFAULT 0,day TEXT NOT NULL DEFAULT '',used INTEGER NOT NULL DEFAULT 0,mail_at INTEGER NOT NULL DEFAULT 0)");
      this.rows('INSERT INTO desk_join_cfg(id) VALUES(1)');
      this.rows("CREATE TABLE desk_join(id TEXT PRIMARY KEY,phase TEXT NOT NULL DEFAULT 'wait',at INTEGER NOT NULL DEFAULT 0,due INTEGER NOT NULL DEFAULT 0,token TEXT NOT NULL DEFAULT '',message TEXT NOT NULL DEFAULT '募集方法を確認待ち',account TEXT NOT NULL DEFAULT '',proof INTEGER NOT NULL DEFAULT 0)");
      this.rows('INSERT INTO desk_join(id) VALUES(?)',JOIN520.id);
      this.rows("CREATE TABLE desk_invite(hash TEXT PRIMARY KEY,id TEXT NOT NULL,iv TEXT NOT NULL,ciphertext TEXT NOT NULL,created INTEGER NOT NULL,phase TEXT NOT NULL DEFAULT 'wait',at INTEGER NOT NULL DEFAULT 0,token TEXT NOT NULL DEFAULT '')");
      this.rows('CREATE INDEX desk_invite_pending ON desk_invite(id,phase,created)');
      this.rememberMagazine(noteLink161(JOIN520.url),JOIN520.name);
    });
    if(!this.one("SELECT 1 FROM sqlite_master WHERE name='desk_join_steps'"))this.storage.transactionSync(()=>{
      this.rows("CREATE TABLE desk_join_steps(id TEXT NOT NULL,step TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(id,step))");
      this.rows("CREATE TABLE desk_join_budget(day TEXT PRIMARY KEY,applications INTEGER NOT NULL DEFAULT 0)");
      this.rows('CREATE INDEX desk_join_due ON desk_join(due,id)');
      for(const target of JOIN_TARGETS520){
        this.rows('INSERT OR IGNORE INTO desk_join(id) VALUES(?)',target.id);
        this.rememberMagazine(noteLink161(target.url),target.name);
      }
    });
  },
  joinActive520(id=JOIN520.id) {
    return !!this.one(`SELECT 1 FROM desk_join_cfg j JOIN desk_cfg c ON c.id=j.id JOIN desk_delivery d ON d.id=j.id
      WHERE j.id=1 AND j.enabled=1 AND c.enabled=1 AND d.enabled=1 AND c.blocked<=?
      AND NOT EXISTS(SELECT 1 FROM desk_member WHERE id=? AND mode='excluded')`,Date.now(),id);
  },
  joinView520() {
    const c=this.one('SELECT enabled,mail_at FROM desk_join_cfg WHERE id=1');
    const items=this.rows('SELECT t.definition,j.phase,j.at,j.message,j.proof FROM desk_join_target t JOIN desk_join j ON j.id=t.id ORDER BY j.at DESC,j.id LIMIT 40').map(row=>{
      const target=JSON.parse(row.definition);
      return {phase:row.phase,at:row.at,message:row.message,proof:row.proof,name:target.name,rule:target.rule,comment:target.comment,active:this.joinActive520(target.id)};
    });
    return {enabled:!!c.enabled,active:this.joinActive520(''),browser:typeof this.env.BROWSER?.acquire==='function',
      mailConfigured:!!noteMailConfig520(this.env).recipient,mailReceived:c.mail_at,mailForwardConfigured:!!noteMailConfig520(this.env).forward,mailForwardError:noteMailConfig520(this.env).error,tuta:this.tutaView520(),items,total:this.one('SELECT COUNT(*) n FROM desk_join_target').n};
  },
  async saveInvitation520(url,trustedMail=false,id=null,active=()=>true) {
    this.init();
    const candidates=invitationIds520(url).map(k=>this.joinTarget520(k)).filter(j=>j && inviteUrl520(url,j.id,true));
    const target=id?this.joinTarget520(id):candidates.length===1?candidates[0]:null;
    need520(target,'対象の誌を招待URLから特定できません。');
    need520(this.one("SELECT 1 FROM desk_member WHERE id=? AND mode<>'excluded'",target.id),'この誌は除外されています。');
    const link=inviteUrl520(url,target.id,!trustedMail);
    need520(link,'noteの招待承認リンクを確認してください。手動登録には対象のマガジンIDを含むリンクが必要です。');
    const hash=await draftBodyHash(link);
    if(this.one('SELECT 1 FROM desk_invite WHERE hash=?',hash))return '登録済みの招待です。承認操作は繰り返しません。';
    const encrypted=await sealInvite520(this.env,target.id,link),now=Date.now();
    this.storage.transactionSync(()=>{
      need520(this.one("SELECT 1 FROM desk_member WHERE id=? AND mode<>'excluded'",target.id),'この誌は除外されています。');
      need520(active(),'招待の受信を停止しました。');
      // A newer invitation supersedes only unopened ones. Already-opened links remain tombstones.
      this.rows("UPDATE desk_invite SET phase='replaced',iv='',ciphertext='' WHERE id=? AND phase='wait'",target.id);
      this.rows('INSERT OR IGNORE INTO desk_invite(hash,id,iv,ciphertext,created) VALUES(?,?,?,?,?)',hash,target.id,encrypted.iv,encrypted.ciphertext,now);
      this.rows('UPDATE desk_join SET due=0 WHERE id=?',target.id);
      this.rows('UPDATE desk_join_cfg SET due=0,mail_at=CASE WHEN ? THEN ? ELSE mail_at END WHERE id=1',+trustedMail,now);
    });
    return '招待を暗号化して保存しました。次の定期起動で520本人と対象誌を確認して承認します。';
  },
  async joinTick520(now) {
    const cfg=this.one('SELECT * FROM desk_join_cfg WHERE id=1');
    if(cfg.due>now || !this.joinActive520(''))return;
    // The publication window and existing account lease take priority over participation.
    if(this.one('SELECT 1 FROM desk_link_plan WHERE pub IS NULL AND scheduled BETWEEN ? AND ? LIMIT 1',now-5*M520,now+6*M520) ||
      this.one('SELECT 1 FROM desk_work_schedule WHERE pub IS NULL AND scheduled BETWEEN ? AND ? LIMIT 1',now-5*M520,now+6*M520))return;
    const rows=this.rows(`SELECT j.* FROM desk_join j JOIN desk_join_target t ON t.id=j.id WHERE j.due<=? AND NOT EXISTS(SELECT 1 FROM desk_member m WHERE m.id=j.id AND m.mode='excluded')
      ORDER BY EXISTS(SELECT 1 FROM desk_invite v WHERE v.id=j.id AND v.phase='wait') DESC,j.due,j.at,j.id LIMIT 1`,now);
    const row=rows[0];
    if(!row)return;
    const target=this.joinTarget520(row.id);
    if(!target)return;
    const today=jstDay(now),used=cfg.day===today?cfg.used:0;
    if(used>=8){this.rows('UPDATE desk_join_cfg SET due=? WHERE id=1',jstStart(today)+D520+M520);return;}
    this.rows('UPDATE desk_join_cfg SET due=? WHERE id=1',now+30*M520);
    let env,lease,message='参加申請・招待の確認を再試行待ち',due=now+2*HOUR,attempt='';
    try {
      if(typeof this.env.BROWSER?.acquire!=='function'){message='CloudflareのBROWSER設定が必要です';return;}
      const pending=this.one("SELECT * FROM desk_invite WHERE id=? AND phase='wait' ORDER BY created DESC LIMIT 1",target.id);
      const recent=this.one("SELECT at FROM desk_invite WHERE id=? AND phase IN ('opened','confirmed') ORDER BY at DESC LIMIT 1",target.id);
      const kind=pending?'invite':row.phase==='joined'||row.phase==='accepting'||(recent && recent.at>=now-2*HOUR)?'verify':row.phase==='wait'?'apply':'check';
      if(kind==='apply' && (this.one('SELECT applications FROM desk_join_budget WHERE day=?',today)?.applications||0)>=2){message='本日の参加申請2誌を確認済み・翌日に続けます';due=jstStart(today)+D520+M520;return;}
      if(kind==='apply' && target.restricted){message='AI生成文・応募中作品・R18の条件があるため自動申請対象外。作品の資格を未確認です';due=now+7*D520;return;}
      const sources=await Promise.allSettled([
        this.publicRead('https://note.com/api/v1/magazines/'+target.id,'json'),
        this.publicRead(target.url,'html'),
        kind==='apply'||kind==='check'?this.publicRead('https://note.com/api/v3/notes/'+target.article,'json'):Promise.resolve(null)
      ]);
      const [mag,html,note]=sources.map(s=>s.status==='fulfilled'?s.value:null);
      if(!joinFree520(mag,html||'',target)){message='対象誌が無料か確認できず・申請と承認を保留';due=now+D520;return;}
      if((kind==='apply'||kind==='check') && !joinRecruitment520(note?.data,html||'',target)){message='現在の募集方法を照合できず・参加申請を保留';due=now+D520;return;}
      const accountInfo=await this.deliveryAccount();
      if(!accountInfo || accountInfo.until>Date.now()){message='520本人の接続・待機の終了を確認待ち';due=accountInfo?Math.max(now+4*M520,accountInfo.until+M520):now+2*HOUR;return;}
      if(row.account && row.account!==accountInfo.id){message='登録時の520本人と一致せず・操作を保留';return;}
      env=scoped(this.env,accountInfo.slot);lease=await acquire(env,false);
      if(!lease){message='520の処理終了を確認待ち';due=now+4*M520;return;}
      const credential=await loadCookie(env,accountInfo.id);
      let link=null;
      if(kind==='invite') {
        if(pending.created<now-7*D520){this.rows("UPDATE desk_invite SET phase='expired',iv='',ciphertext='' WHERE hash=? AND phase='wait'",pending.hash);message='受信から7日経過した招待を保留。新しい招待を受信すると再確認します。';return;}
        link=await openInvite520(this.env,pending);
      }
      const live=async()=>{
        if(!this.joinActive520(target.id))return false;
        const c=await sql(env,`SELECT c.account,c.token,c.lease,c.next_at,h.kind,n.hold_until FROM nh_control c
          JOIN nh_health h ON h.id=c.id JOIN nh_v13_connection n ON n.slot=? WHERE c.id=1`,accountInfo.slot).first();
        const t=Date.now();
        return !!c && c.account===accountInfo.id && c.token===lease && c.lease>t && c.hold_until<=t && (!c.kind || c.next_at<=t);
      };
      const marker=crypto.randomUUID();
      this.rows('UPDATE desk_join_cfg SET day=?,used=? WHERE id=1',today,used+1);
      const result=await browserJoin520(this.env.BROWSER,accountInfo.id,cleanCookie(credential.NOTE_SESSION),
        {kind,target:target.id,definition:target,hash:note?.data?await draftBodyHash(note.data.body):null,url:link,
          steps:Object.fromEntries(this.rows('SELECT step,at FROM desk_join_steps WHERE id=?',target.id).map(r=>[r.step,r.at]))},async(step=null)=>{
          if(!await live())return false;
          return this.storage.transactionSync(()=>{
            if(!this.joinActive520(target.id))return false;
            if(step){
              if(step!=='notify')return false;
              return !!this.one('INSERT INTO desk_join_steps(id,step,at) VALUES(?,?,?) ON CONFLICT(id,step) DO UPDATE SET at=excluded.at WHERE desk_join_steps.at<=? RETURNING id',target.id,step,Date.now(),Date.now()-D520);
            }
            if(kind==='apply') {
              const applications=this.one('SELECT applications FROM desk_join_budget WHERE day=?',jstDay(Date.now()))?.applications||0;
              if(applications>=2)return false;
              if(!this.one("UPDATE desk_join SET phase='sent',at=?,token=?,account=?,message='参加申請の操作を記録・自動再送なし' WHERE id=? AND phase='wait' RETURNING id",Date.now(),marker,accountInfo.id,target.id))return false;
              this.rows('INSERT INTO desk_join_budget(day,applications) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET applications=applications+1',jstDay(Date.now()));
            }else if(kind==='invite') {
              if(!this.one("UPDATE desk_invite SET phase='opened',at=?,token=?,iv='',ciphertext='' WHERE hash=? AND phase='wait' RETURNING hash",Date.now(),marker,pending.hash))return false;
              this.rows("UPDATE desk_join SET phase='accepting',at=?,account=?,message='招待承認の開始を記録・参加状態は未確認' WHERE id=?",Date.now(),accountInfo.id,target.id);
            }else return false;
            attempt=marker;return true;
          });
        },live);
      message=result.message;due=Date.now()+(result.noFollow?30*D520:attempt||result.prepared?4*M520:kind==='check'||kind==='verify'?6*HOUR:2*HOUR);
      this.storage.transactionSync(()=>{
        if(!this.joinActive520(target.id))return;
        if(result.joined) {
          this.rows("UPDATE desk_join SET phase='joined',proof=?,at=?,account=? WHERE id=?",Date.now(),Date.now(),accountInfo.id,target.id);
          this.rows("UPDATE desk_invite SET phase='confirmed',iv='',ciphertext='' WHERE id=? AND phase IN ('wait','opened')",target.id);
          this.rows("UPDATE desk_member SET due=0 WHERE id=? AND mode<>'excluded'",target.id);
          this.rows('UPDATE desk_import SET due=0 WHERE id=?',target.id);
          due=Date.now()+D520;
        }else if(result.existing)this.rows("UPDATE desk_join SET phase='applied',at=?,account=? WHERE id=? AND phase IN ('wait','sent','applied')",Date.now(),accountInfo.id,target.id);
        else if(result.notClicked && attempt && kind==='apply')this.rows("UPDATE desk_join SET phase='wait',token='' WHERE id=? AND phase='sent' AND token=?",target.id,attempt);
        if(result.expired && pending)this.rows("UPDATE desk_invite SET phase='expired',iv='',ciphertext='' WHERE hash=? AND phase='opened'",pending.hash);
      });
      if(result.hold>0) {
        const until=Date.now()+result.hold;due=Math.max(due,until);
        this.rows('UPDATE desk_cfg SET blocked=MAX(blocked,?) WHERE id=1',until);
        await sql(this.env,'UPDATE nh_v13_connection SET hold_until=MAX(hold_until,?) WHERE slot=?',until,accountInfo.slot).run();
      }
    }catch(error) {
      message=readLimit(error)?'D1の読み取り枠更新後に再確認':'本人確認・画面・保存の途中で失敗。記録済みの操作は再送せず確認します';
      due=readLimit(error)?(Math.floor(Date.now()/D520)+1)*D520+M520:Date.now()+2*HOUR;
    }finally {
      this.rows('UPDATE desk_join SET due=?,message=? WHERE id=?',due,message,target.id);
      if(lease)await release(env,lease);
    }
  }
});
function joinRecord520(j) {
  if(!j)return '';
  return ['【参加申請・招待の承認】'+(j.active?'自動確認ON':'休止中'),
    ...(j.items||[]).map(r=>r.name+' ／ '+(r.active?'':'休止・除外 ／ ')+r.message),
    j.tuta?.configured?tutaRecord520(j.tuta):j.mailConfigured?(j.mailReceived?'招待メールの最終受信：'+time(j.mailReceived):'受信先の指定あり・メール到着は未確認'):'招待メールの受信が未接続です。自動承認の稼働には1回の受信接続が必要です。',
    j.tuta?.configured?'確認・復旧メールは引き続きTutaで受信します。':j.mailForwardError?'確認・復旧メールの転送先設定に誤りがあります。登録メールの変更は保留してください。':j.mailForwardConfigured?'確認・復旧メール：転送先の指定あり。実際に元の受信箱へ届くことを確認してから登録メールを変更してください。':'確認・復旧メールの転送先は未設定です。この受信先へ登録メールを変更する前に設定してください。',
    '探索・参加先に固定の累計上限はありません。フォロー操作は行いません。新規申請は1日2誌、本人画面の確認は1日8回まで続けます。',
    '申請経路を確認できた誌：'+(j.total??j.items?.length??0)+'誌（この欄の表示は直近40誌。全件の処理と記録は継続）。',
    '送信済みは再申請しません。相手の招待待ちは自動承認できません。参加後も作品ごとの掲載条件を確認します。'].join('\n');
}

// An application may require these native account actions. Unknown controls hold the request.
function joinFollowDOM520(owner,action) {
  if(location.origin!=='https://note.com' || location.pathname.replace(/\/$/,'')!=='/'+owner)return 'page';
  const canonical=document.querySelector('link[rel=canonical]')?.href;
  if(!canonical || new URL(canonical).origin!==location.origin || new URL(canonical).pathname.replace(/\/$/,'')!=='/'+owner)return 'page';
  const visible=e=>e.getClientRects().length>0 && !e.closest('[hidden],[aria-hidden=true]');
  const name=e=>(e.getAttribute('aria-label')||e.textContent||'').trim();
  const roots=[...document.querySelectorAll('[data-testid="creator-header"],.o-creatorProfile,.o-creatorHeader,.m-creatorProfile,header')].filter(e=>visible(e)&&e.querySelector('h1,h2'));
  const controls=[...new Set(roots.flatMap(root=>[...root.querySelectorAll('button')]).filter(e=>visible(e)&&['フォロー','フォローする','フォロー中'].includes(name(e))))];
  if(controls.length!==1)return 'missing';
  const b=controls[0];
  if(name(b)==='フォロー中')return 'on';
  if(b.disabled || b.getAttribute('aria-disabled')==='true')return 'disabled';
  // This function is deliberately read-only, regardless of action.
  return 'off';
}
async function prepareJoinAccount520(io,target,id,steps,mark,mayAct) {
  const {command,evaluate,blocked,poll}=io;
  const identity=async()=>{const who=await evaluate(noteIdentityJS);return who?.id===id && who.name==='43__' && !blocked() && await mayAct();};
  const code=recommendationControlJS.replace('account|reaction|reactions','account|notification|notifications');
  const labels=['クリエイターからの招待・プレゼント'];
  await command('Page.navigate',{url:noteSettingsURL});
  const read=()=>evaluate('('+code+')('+JSON.stringify(labels)+',"read")');
  let state=await poll(read,v=>['on','off'].includes(v));
  if(!state && !blocked()){
    const url=await evaluate(`(()=>{if(location.origin!=='https://note.com'||!location.pathname.startsWith('/settings/'))return null;
      const xs=[...document.querySelectorAll('a[href]')].filter(a=>a.getClientRects().length && ['通知','通知設定','メール通知'].includes(a.textContent.trim()));
      const urls=[...new Set(xs.map(a=>a.href).filter(h=>{const u=new URL(h);return u.origin===location.origin&&/^\\/settings\\/(?:notification|notifications)\\/?$/.test(u.pathname)}))];
      return urls.length===1?urls[0]:null;})()`);
    if(url)await command('Page.navigate',{url});
    else await evaluate(`(()=>{if(location.origin!=='https://note.com'||!location.pathname.startsWith('/settings/'))return false;
      const bs=[...document.querySelectorAll('[role=tab]')].filter(b=>b.getClientRects().length&&!b.disabled&&['通知','通知設定'].includes(b.textContent.trim()));
      if(bs.length!==1)return false;bs[0].click();return true;})()`);
    state=await poll(read,v=>['on','off'].includes(v));
  }
  if(!await identity())return {message:'招待通知の設定中に本人・待機状態を再確認待ち'};
  if(state==='off'){
    if(steps.notify && steps.notify>Date.now()-D520)return {message:'招待通知の保存結果を再確認待ち（1日以内の再操作なし）'};
    if(!await mark('notify'))return {message:'招待通知の変更を保留'};
    const result=await evaluate('('+code+')('+JSON.stringify(labels)+',"enable")');
    return {prepared:result==='clicked',message:'招待通知ONの操作を記録・次回に保存結果を確認'};
  }
  if(state!=='on')return {message:'「クリエイターからの招待・プレゼント」の設定を確認待ち'};
  if(!target.follow)return null;
  await command('Page.navigate',{url:'https://note.com/'+target.owner});
  const follow=action=>evaluate('('+joinFollowDOM520.toString()+')('+JSON.stringify(target.owner)+','+JSON.stringify(action)+')');
  state=await poll(()=>follow('read'),v=>['on','off'].includes(v));
  if(!await identity())return {message:'既存のフォロー状態と本人・待機状態を再確認待ち'};
  if(state==='on')return null;
  if(state!=='off')return {message:'募集元の運営者のフォローボタンを確認待ち'};
  return {noFollow:true,message:'参加に新しいフォローが必要なため申請を見送り。フォロー数は増やしません'};
}

const SHELF520=Object.freeze({name:'520 作品案内',description:'520（43__）の小説・エッセイ・詩を集めた作品棚です。新作と、これまでの作品をここから読めます。'});
function shelfProof520(payload,key=null){
  const d=payload?.data?.magazine??payload?.data;
  return !!d && /^m[a-z0-9]{1,64}$/.test(d.key||'') && (!key||d.key===key) && d.owner?.urlname==='43__' &&
    d.name===SHELF520.name && (d.description??d.desc)===SHELF520.description &&
    !d.isPaid && !d.is_paid && !(Number(d.price)>0) && (d.price===0||d.isFree===true||d.magazineType==='free') &&
    !d.isPrivate && !d.is_private && (d.isPrivate===false||d.is_private===false||d.isPublic===true||d.status==='published'||d.status==='public') && !['private','paid','subscription','membership'].includes(d.status??d.magazineType??d.type);
}
function shelfDOM520(step,arg){
  if(location.origin!=='https://note.com')return {state:'page'};
  const visible=e=>e.getClientRects().length>0 && !e.closest('[hidden],[aria-hidden=true]');
  const text=e=>(e.getAttribute('aria-label')||e.textContent||e.value||'').trim();
  const buttons=root=>[...root.querySelectorAll('button,[role=button],input[type=submit]')].filter(e=>visible(e)&&!e.disabled&&e.getAttribute('aria-disabled')!=='true');
  const root=document.querySelector('main,[role=main]')||document.body;
  const safeLink=a=>{try{const u=new URL(a.href);return u.origin===location.origin&&!u.username&&!u.password?u:null;}catch{return null;}};
  if(step==='menu'){
    const links=[...document.querySelectorAll('a[href]')].filter(a=>visible(a)&&text(a)==='マガジン').map(safeLink).filter(u=>u&&/^\/(?:43__\/)?magazines\/?$/.test(u.pathname));
    const urls=[...new Set(links.map(u=>u.href))];
    if(urls.length===1)return {state:'link',url:urls[0]};
    const menus=buttons(document).filter(b=>['アカウントメニュー','ユーザーメニュー','プロフィールメニュー'].includes(text(b)));
    if(menus.length===1){menus[0].click();return {state:'opening'};}
    return {state:'missing'};
  }
  if(step==='list'){
    if(!/^\/(?:43__\/)?magazines\/?$/.test(location.pathname))return {state:'page'};
    const links=[...root.querySelectorAll('a[href]')].filter(visible),keys=new Set();
    for(const a of links){const u=safeLink(a),m=u&&/^\/(?:43__\/)?m\/(m[a-z0-9]{1,64})\/?$/.exec(u.pathname);
      if(m && (text(a)===arg.name || [...a.querySelectorAll('h1,h2,h3,h4')].some(h=>text(h)===arg.name)))keys.add(m[1]);}
    const more=buttons(root).filter(b=>/^(もっと見る|さらに表示|次へ|次のページ)$/.test(text(b)));
    const pages=links.filter(a=>a.rel==='next'||['次へ','次のページ'].includes(text(a))).map(safeLink).filter(u=>u && u.pathname===location.pathname && u.href!==location.href);
    if(keys.size>1)return {state:'ambiguous'};
    if(keys.size===1)return {state:'found',key:[...keys][0]};
    if(pages.length===1)return {state:'next',url:pages[0].href};
    if(more.length===1){more[0].click();return {state:'loading'};}
    if(more.length||pages.length)return {state:'incomplete'};
    const create=links.filter(a=>['マガジンを作る','マガジンをつくる','マガジンを作成'].includes(text(a))).map(safeLink)
      .filter(u=>u && /^\/magazines\/(?:new|create)\/?$/.test(u.pathname));
    if(create.length===1)return {state:'new',url:create[0].href};
    const bs=buttons(root).filter(b=>['マガジンを作る','マガジンをつくる','マガジンを作成'].includes(text(b)));
    if(bs.length===1)return {state:'newbutton'};
    return {state:'missing'};
  }
  if(step==='open'){
    if(!/^\/(?:43__\/)?magazines\/?$/.test(location.pathname))return {state:'page'};
    const bs=buttons(root).filter(b=>['マガジンを作る','マガジンをつくる','マガジンを作成'].includes(text(b)));
    if(bs.length!==1)return {state:'missing'};bs[0].click();return {state:'opened'};
  }
  if(!/^\/magazines\/(?:new|create)\/?$/.test(location.pathname) && !document.querySelector('[role=dialog]'))return {state:'page'};
  const form=document.querySelector('[role=dialog]')||root;
  if(!/マガジン/.test(form.innerText||''))return {state:'page'};
  const fields=[...form.querySelectorAll('input,textarea')].filter(e=>visible(e)&&!e.disabled&&!e.readOnly);
  const caption=e=>[e.placeholder,e.getAttribute('aria-label'),...(e.labels||[])].map(v=>typeof v==='string'?v:v?.textContent||'').join(' ');
  const names=fields.filter(e=>/マガジン(?:の)?(?:タイトル|名)|タイトル/.test(caption(e)) && ['text',''].includes(e.type||''));
  const descriptions=fields.filter(e=>/説明/.test(caption(e)) && e.tagName==='TEXTAREA');
  if(names.length!==1 || descriptions.length!==1)return {state:'missing'};
  const selected=[...form.querySelectorAll('input:checked,[aria-checked=true],[aria-selected=true]')].filter(visible)
    .map(e=>e.labels?.length?[...e.labels].map(text).join(' '):text(e));
  // Both public visibility and free distribution must be explicit. Never silently accept a paid default.
  if(!selected.some(t=>/^無料(?:マガジン)?$/.test(t.trim())) || !selected.some(t=>/^公開$/.test(t.trim())) ||
     selected.some(t=>/有料|定期購読|非公開|メンバーシップ/.test(t)))return {state:'unsafe'};
  if(step==='fill'){
    if((names[0].value && names[0].value!==arg.name)||(descriptions[0].value && descriptions[0].value!==arg.description))return {state:'draft'};
    for(const [el,value] of [[names[0],arg.name],[descriptions[0],arg.description]]){
      Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,value);
      el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
    }
    return {state:'filled'};
  }
  if(step==='create'){
    if(names[0].value!==arg.name || descriptions[0].value!==arg.description)return {state:'changed'};
    const bs=buttons(form).filter(b=>['作成','作成する'].includes(text(b)));
    if(bs.length!==1)return {state:'missing'};bs[0].click();return {state:'clicked'};
  }
  return {state:'ready'};
}
async function browserShelf520(binding,id,cookie,create,mark,live){
  return inNoteBrowser(binding,cookie,false,async({command,evaluate,blocked,blockedResult})=>{
    const poll=async(fn,ok)=>{for(let i=0;i<10&&!blocked();i++){try{const v=await fn();if(ok(v))return v;}catch{}await pause520(250);}return null;};
    const dom=step=>evaluate('('+shelfDOM520.toString()+')('+JSON.stringify(step)+','+JSON.stringify(SHELF520)+')');
    await command('Page.navigate',{url:'https://note.com/43__/magazines'});
    const who=await poll(()=>evaluate(noteIdentityJS),v=>v?.id);
    if(who?.id!==id || who?.name!=='43__')return {message:'作品棚の作成前に520本人を確認待ち'};
    let listing=await poll(()=>dom('list'),v=>['found','new','newbutton','next','loading','ambiguous'].includes(v?.state));
    if(!listing){
      const menu=await dom('menu');
      if(menu.state==='opening'){await pause520(300);listing=await dom('menu');}else listing=menu;
      if(listing?.state==='link'){await command('Page.navigate',{url:listing.url});listing=await poll(()=>dom('list'),v=>v?.state!=='page'&&v?.state!=='missing');}
    }
    const visited=new Set();
    for(let i=0;i<6 && !blocked() && ['next','loading'].includes(listing?.state);i++){
      if(listing.state==='next'){if(visited.has(listing.url))break;visited.add(listing.url);await command('Page.navigate',{url:listing.url});}
      await pause520(400);listing=await dom('list');
    }
    if(blocked())return blockedResult();
    if(listing?.state==='found'){
      const data=await evaluate(`(async()=>{if(location.origin!=='https://note.com')return null;const r=await fetch('/api/v1/magazines/'+${JSON.stringify(listing.key)},{credentials:'same-origin',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(4500)});return r.ok?await r.json():null;})()`);
      return shelfProof520(data,listing.key)?{key:listing.key,message:'520本人の無料の作品棚を確認済み'}:{message:'同名のマガジンを確認しましたが、所有者・無料・説明が一致しないため保留'};
    }
    if(!create)return {message:'作成操作の結果を再確認待ち・同じ作品棚を重複作成しません'};
    if(!['new','newbutton'].includes(listing?.state))return {message:'マガジン一覧と新規作成欄を確認待ち'};
    if(listing.state==='new')await command('Page.navigate',{url:listing.url});else await dom('open');
    const fields=await poll(()=>dom('fill'),v=>v?.state==='filled');
    if(!fields)return blocked()?blockedResult():{message:'作品棚の無料・公開設定と入力欄を確認待ち'};
    const identity=await evaluate(noteIdentityJS);
    if(blocked())return blockedResult();
    if(identity?.id!==id || identity?.name!=='43__' || !await live() || !await mark())return {message:'作品棚の作成を保留'};
    const result=await dom('create');
    return result?.state==='clicked'?{sent:true,message:'作品棚の作成を操作済み・次回に公開情報で確認'}:{notClicked:true,message:'作成ボタンを確認できず・再確認待ち'};
  });
}
function shelfCandidates520(rows,now){
  const eligible=rows.filter(r=>r.title.trim()!=='521' && r.pub>0 && r.pub<=now && r.verified>=now-8*D520);
  const recent=[...eligible].sort((a,b)=>b.pub-a.pub||a.article.localeCompare(b.article)).slice(0,2);
  const rest=eligible.filter(r=>!recent.some(a=>a.article===r.article));
  // Comparable seven-day counts pick entrances; unknown counts stay eligible for discovery.
  rest.sort((a,b)=>(b.d7??-1)-(a.d7??-1)||a.pub-b.pub||a.article.localeCompare(b.article));
  const measured=rest.slice(0,4),remaining=rest.slice(4);
  const week=Math.floor((now+9*HOUR)/(7*D520)),start=remaining.length?week*2%remaining.length:0;
  const explore=Array.from({length:Math.min(2,remaining.length)},(_,i)=>remaining[(start+i)%remaining.length]);
  return recent.concat(measured,explore);
}
Object.assign(Desk520.prototype,{
  initShelf520(){
    if(this.one("SELECT 1 FROM sqlite_master WHERE name='desk_shelf'"))return;
    this.storage.transactionSync(()=>{
      this.rows("CREATE TABLE desk_shelf(id INTEGER PRIMARY KEY,phase TEXT NOT NULL DEFAULT 'wait',article TEXT NOT NULL DEFAULT '',due INTEGER NOT NULL DEFAULT 0,at INTEGER NOT NULL DEFAULT 0,day TEXT NOT NULL DEFAULT '',used INTEGER NOT NULL DEFAULT 0,message TEXT NOT NULL DEFAULT '無料の作品棚を確認待ち')");
      this.rows('INSERT INTO desk_shelf(id) VALUES(1)');
      this.rows("CREATE TABLE desk_shelf_item(article TEXT PRIMARY KEY,phase TEXT NOT NULL,at INTEGER NOT NULL,due INTEGER NOT NULL,baseline INTEGER,message TEXT NOT NULL)");
      this.rows('CREATE INDEX desk_shelf_item_due ON desk_shelf_item(due)');
    });
  },
  shelfActive520(){return !!this.one('SELECT 1 FROM desk_cfg c JOIN desk_delivery d ON d.id=c.id WHERE c.id=1 AND c.enabled=1 AND d.enabled=1 AND c.blocked<=?',Date.now());},
  shelfView520(){
    const s=this.one('SELECT phase,article,at,message FROM desk_shelf WHERE id=1');
    const items=this.rows('SELECT i.phase,i.message,i.at,a.title FROM desk_shelf_item i JOIN desk_archive a ON a.article=i.article ORDER BY i.at DESC LIMIT 12');
    return {...s,items,active:this.shelfActive520(),url:s.article?'https://note.com/43__/m/'+s.article:null};
  },
  async shelfTick520(now){
    const state=this.one('SELECT * FROM desk_shelf WHERE id=1');
    if(!this.shelfActive520() || state.due>now || typeof this.env.BROWSER?.acquire!=='function')return;
    if(this.one('SELECT 1 FROM desk_work_schedule WHERE pub IS NULL AND scheduled BETWEEN ? AND ? LIMIT 1',now-5*M520,now+6*M520)||
       this.one('SELECT 1 FROM desk_link_plan WHERE pub IS NULL AND scheduled BETWEEN ? AND ? LIMIT 1',now-5*M520,now+6*M520))return;
    const today=jstDay(now),used=state.day===today?state.used:0;
    if(used>=4){this.rows('UPDATE desk_shelf SET due=? WHERE id=1',jstStart(today)+D520+M520);return;}
    this.rows('UPDATE desk_shelf SET due=? WHERE id=1',now+30*M520);
    let env,lease,message=state.message,due=now+2*HOUR,attempt=0;
    try{
      const info=await this.deliveryAccount();
      if(!info || info.until>Date.now()){message='作品棚の更新は520の処理・待機終了後';due=Math.max(now+4*M520,info?.until||0);return;}
      env=scoped(this.env,info.slot);lease=await acquire(env,false);
      if(!lease){message='作品棚の更新は520の使用終了後';due=now+4*M520;return;}
      const cookie=cleanCookie((await loadCookie(env,info.id)).NOTE_SESSION);
      const live=async()=>{
        if(!this.shelfActive520())return false;
        const c=await sql(env,'SELECT c.account,c.token,c.lease,c.next_at,h.kind,n.hold_until FROM nh_control c JOIN nh_health h ON h.id=c.id JOIN nh_v13_connection n ON n.slot=? WHERE c.id=1',info.slot).first(),at=Date.now();
        return c?.account===info.id && c.token===lease && c.lease>at && c.hold_until<=at && (!c.kind||c.next_at<=at);
      };
      let result;
      if(!state.article){
        this.rows('UPDATE desk_shelf SET day=?,used=? WHERE id=1',today,used+1);
        result=await browserShelf520(this.env.BROWSER,info.id,cookie,state.phase==='wait',async()=>{
          if(!await live())return false;
          const row=this.one("UPDATE desk_shelf SET phase='sent',at=? WHERE id=1 AND phase='wait' RETURNING id",Date.now());
          if(row)attempt=Date.now();return !!row;
        },live);
        if(result.key && this.shelfActive520())this.rows("UPDATE desk_shelf SET article=?,phase='ready' WHERE id=1",result.key);
        if(result.notClicked && attempt)this.rows("UPDATE desk_shelf SET phase='wait' WHERE id=1 AND phase='sent' AND at=?",attempt);
      }else{
        if(!shelfProof520(await this.publicRead('https://note.com/api/v1/magazines/'+state.article,'json'),state.article)){message='作品棚の所有者・無料・説明の再確認待ち';due=now+D520;return;}
        // Only read pending confirmations. Public RSS confirms entries independently of browser clicks.
        const pending=this.rows("SELECT article FROM desk_shelf_item WHERE phase IN ('sent','seen') AND due<=? ORDER BY due LIMIT 8",now);
        if(pending.length){
          const entries=await this.readIssue('https://note.com/43__/m/'+state.article);
          for(const p of pending){
            const confirmed=entries.some(e=>publicKey520(e.link)===p.article);
            this.rows('UPDATE desk_shelf_item SET phase=?,due=?,message=? WHERE article=?',confirmed?'confirmed':'sent',now+6*HOUR,confirmed?'作品棚のRSSで掲載を確認済み':'掲載結果を確認待ち・再追加なし',p.article);
          }
        }
        if(this.one("SELECT COUNT(*) n FROM desk_shelf_item WHERE at>=?",jstStart(today)).n>=2){message='本日の作品棚への追加2本を操作済み';due=jstStart(today)+D520+M520;return;}
        const candidates=this.rows(`SELECT a.article,a.title,a.pub,a.verified,a.likes,s.value d7 FROM desk_archive a
          LEFT JOIN desk_entries e ON e.article=a.article LEFT JOIN desk_sample s ON s.seq=e.seq AND s.age=7
          WHERE a.verified>=? ORDER BY a.pub DESC LIMIT 300`,now-8*D520);
        const work=shelfCandidates520(candidates,now).find(w=>!this.one('SELECT 1 FROM desk_shelf_item WHERE article=?',w.article));
        if(!work){message='現在確認できた作品棚の追加候補は処理済み';due=now+6*HOUR;return;}
        const n=(await this.publicRead('https://note.com/api/v3/notes/'+work.article,'json'))?.data;
        if(n?.key!==work.article || !isPublishedBy520(n) || n.name!==work.title || n.name.trim()==='521'){message='作品棚の候補の現在の公開状態を再確認待ち';return;}
        this.rows('UPDATE desk_shelf SET day=?,used=? WHERE id=1',today,used+1);
        result=await browserDelivery(this.env.BROWSER,info.id,cookie,{kind:'mag',key:work.article,title:work.title,target:state.article},async key=>{
          if(key!==work.article || !await live())return false;
          const row=this.one("INSERT OR IGNORE INTO desk_shelf_item(article,phase,at,due,baseline,message) VALUES(?,'sent',?,?,?,'作品棚への追加操作を記録・結果未確認') RETURNING article",key,Date.now(),Date.now()+4*M520,work.likes);
          if(row)attempt=Date.now();return !!row;
        });
        if(result.notClicked && attempt)this.rows("DELETE FROM desk_shelf_item WHERE article=? AND phase='sent' AND at=?",work.article,attempt);
        if(result.seen)this.rows("INSERT INTO desk_shelf_item(article,phase,at,due,baseline,message) VALUES(?,'seen',?,?,?,'画面で追加済み・RSSで再確認待ち') ON CONFLICT(article) DO UPDATE SET phase='seen'",work.article,Date.now(),Date.now()+4*M520,work.likes);
      }
      message=result.message;due=Date.now()+(result.key||result.sent||attempt?4*M520:2*HOUR);
      if(result.hold>0){const until=Date.now()+result.hold;due=Math.max(due,until);this.rows('UPDATE desk_cfg SET blocked=MAX(blocked,?) WHERE id=1',until);await sql(this.env,'UPDATE nh_v13_connection SET hold_until=MAX(hold_until,?) WHERE slot=?',until,info.slot).run();}
    }catch(error){message=readLimit(error)?'D1の読み取り枠更新後に作品棚を確認':'作品棚の処理を再確認待ち・記録済みの操作は再送しません';due=readLimit(error)?(Math.floor(Date.now()/D520)+1)*D520+M520:Date.now()+2*HOUR;}
    finally{this.rows('UPDATE desk_shelf SET due=?,message=? WHERE id=1',due,message);if(lease)await release(env,lease);}
  }
});
function shelfRecord520(s){
  if(!s)return '';
  return ['【520の作品棚】'+(s.active?'自動更新ON':'休止中'),s.message,s.url||'無料の「520 作品案内」を作成・確認待ち',
    ...s.items.map(i=>i.title+' ／ '+i.message),
    '新作2本を優先し、公開7日後のスキと未紹介の既刊から選択。追加は1日2本まで。原文と固定記事521は編集しません。',
    'スキ・フォロワーの推移を記録します。回遊率や読了数、掲載による増加効果そのものは未計測です。'].join('\n');
}

// Reviewed publishers' broad invitations are not re-labelled as explicit AI approval.
// A changed rule document suspends automatic placements until it is reviewed again.
function reviewedPolicy520(target,n,html){
  if(target?.dynamic)return genericJoinRoute520(n,html,target)?genericPlacementPolicy520(n.body,target):null;
  if(!target || target.restricted || !joinRecruitment520(n,html,target))return null;
  const text=words161(n.body).normalize('NFKC').replace(/\s+/g,'');
  if(/(?:AI|人工知能|生成).{0,24}(?:不可|禁止|限定|お断り|要相談|申告|明記)|(?:必須|必ず).{0,12}(?:ハッシュタグ|自己紹介)|(?:ハッシュタグ|自己紹介).{0,12}(?:必須|必要)|未発表(?:のみ|に限)|事前(?:審査|承認)|字数.{0,12}(?:以上|以内|以下)|[0-9]+(?:文字|字)(?:以上|以内|以下)/i.test(text))return null;
  if(target.id===JOIN520.id && (!/エッセイは不可/.test(text)||!/1日に2投稿/.test(text)||!/過去記事の投稿が可能/.test(text)))return null;
  if(target.match==='note文芸部' && (!/5記事まで/.test(text)||!/ご自分のものだけ/.test(text)))return null;
  if(target.match==='綴り灯' && (!/ジャンル(?:は問いません|不問)/.test(text)||!/ハッシュタグの使用は任意/.test(text)))return null;
  return {min:0,max:1000000,genres:[...target.genres],methods:[...method520]};
}
Object.assign(Desk520.prototype,{
  initJoinPolicy520(){
    if(this.one("SELECT 1 FROM sqlite_master WHERE name='desk_mag_send'"))return;
    this.storage.transactionSync(()=>{
      this.rows('CREATE TABLE desk_mag_send(article TEXT NOT NULL,id TEXT NOT NULL,at INTEGER NOT NULL,day TEXT NOT NULL,PRIMARY KEY(article,id))');
      this.rows('CREATE INDEX desk_mag_send_day ON desk_mag_send(id,day)');
      this.rows('CREATE TABLE desk_join_rule(id TEXT PRIMARY KEY,hash TEXT NOT NULL,checked INTEGER NOT NULL)');
      // An earlier unconfirmed attempt still consumes the publication budget.
      for(const row of this.rows("SELECT subject,target,at FROM desk_job WHERE kind='mag' AND phase IN ('sent','seen','confirmed')"))
        this.rows('INSERT OR IGNORE INTO desk_mag_send(article,id,at,day) VALUES(?,?,?,?)',row.subject,row.target,row.at,jstDay(row.at));
    });
  },
  joinProof520(id,now){
    return !!this.joinTarget520(id) && !!this.one("SELECT 1 FROM desk_join WHERE id=? AND phase='joined' AND proof>? AND NOT EXISTS(SELECT 1 FROM desk_member WHERE id=? AND mode='excluded')",id,now-2*D520,id);
  },
  magazineRoom520(id,now){
    const target=this.joinTarget520(id);
    if(!target)return true;
    if(target.restricted)return false;
    const own=this.one('SELECT COUNT(*) n FROM desk_mag_send WHERE id=? AND day=?',id,jstDay(now)).n;
    // Native additions by the account, observed in the current issue, count as well.
    const observed=this.one(`SELECT COUNT(*) n FROM desk_ref r WHERE r.id=? AND r.observed>=? AND r.observed<?
      AND NOT EXISTS(SELECT 1 FROM desk_mag_send s WHERE s.article=r.article AND s.id=r.id)`,id,jstStart(jstDay(now)),jstStart(jstDay(now))+D520).n;
    return own+observed<target.perDay;
  },
  async reviewedMagazine520(row,target){
    const result=await Promise.allSettled([this.publicRead('https://note.com/api/v3/notes/'+target.article,'json'),this.publicRead(target.url,'html')]);
    const n=result[0].status==='fulfilled'?result[0].value?.data:null,html=result[1].status==='fulfilled'?result[1].value:'';
    const policy=reviewedPolicy520(target,n,html);
    const hold=reason=>({title:target.name,rules:target.rule,state:'保留',reason,summary:'',policy:null});
    if(!policy)return hold('現在の募集条件を対応済みの条件と照合できません');
    const hash=await draftBodyHash(n.body),prior=this.one('SELECT hash FROM desk_join_rule WHERE id=?',target.id);
    if(!hash)return hold('募集本文全体を確認できません');
    if(prior && prior.hash!==hash)return hold('募集本文が変更されています。自動掲載は条件の再確認まで保留');
    this.rows('INSERT INTO desk_join_rule(id,hash,checked) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET checked=excluded.checked',target.id,hash,Date.now());
    return {title:target.name,rules:target.rule,state:'利用中',reason:'確認した公開要項の対象作品。制作方法の限定の記載なし（AIの明示許諾とは別）',
      summary:policy.genres.join('・')+' ／ 1日'+target.perDay+'本まで',policy};
  }
});
Object.assign(Desk520.prototype,{
  chooseMagazine520(valid,genre,now){
    const choices=valid.filter(m=>this.magazineRoom520(noteLink161(m.url)?.id,now));
    if(!choices.length)return null;
    if(choices.length===1)return choices[0];
    const rows=choices.map(m=>{
      const id=noteLink161(m.url)?.id;
      const observations=this.one(`SELECT COUNT(*) n FROM desk_ref r JOIN desk_entries e ON e.article=r.article
        JOIN desk_sample s ON s.seq=e.seq AND s.age=7 WHERE r.id=? AND e.genre=? AND s.value IS NOT NULL AND r.observed<=s.due AND e.pub>=?`,id,genre??'',now-365*D520).n;
      const attempts=this.one('SELECT COUNT(*) n,MAX(at) last FROM desk_mag_send WHERE id=? AND at>=?',id,now-30*D520);
      return {mag:m,observations,attempts:attempts.n,last:attempts.last||0};
    });
    // Fill gaps in comparable observations first; never call a zero-sample magazine a winner.
    const explore=rows.filter(r=>r.observations<3).sort((a,b)=>a.attempts-b.attempts||a.observations-b.observations||a.last-b.last||a.mag.url.localeCompare(b.mag.url));
    if(explore.length)return explore[0].mag;
    return (genre && this.strongestMagazine(choices,genre)) || rows.sort((a,b)=>a.attempts-b.attempts||a.last-b.last||a.mag.url.localeCompare(b.mag.url))[0].mag;
  }
});

// Unbounded cumulative discovery. Network work and each transaction remain bounded.
function validJoinTarget520(t){
  return !!t && /^m[a-z0-9]{1,64}$/.test(t.id||'') && /^n[a-z0-9]{1,64}$/.test(t.article||'') &&
    /^\w[\w-]{0,79}$/.test(t.owner||'') && t.owner!=='43__' &&
    t.url==='https://note.com/'+t.owner+'/m/'+t.id && t.rule==='https://note.com/'+t.owner+'/n/'+t.article &&
    text520(t.name,100) && text520(t.match,100) && text520(t.comment,300) && typeof t.follow==='boolean';
}
function invitationIds520(raw){
  try{
    const u=new URL(raw);
    if(u.origin!=='https://note.com'||u.username||u.password)return [];
    return [...new Set([...decodeURIComponent(u.pathname+'?'+u.searchParams.toString()).matchAll(/(?:^|[\/=])(m[a-z0-9]{1,64})(?![a-z0-9])/g)].map(m=>m[1]))];
  }catch{return [];}
}
function genericJoinRoute520(n,html,t){
  if(!validJoinTarget520(t) || t.follow || t.restricted || n?.key!==t.article || n.user?.urlname!==t.owner || n.status!=='published' ||
    n.is_limited===true || n.isLimited===true || n.is_paid===true || n.isPaid===true || Number(n.price)>0 ||
    typeof n.body!=='string' || !n.body.trim() || n.body.length>250000)return false;
  const plain=words161(n.body).normalize('NFKC');
  const text=plain.split(/[。\n]+/).filter(s=>!/^\s*(?:制作方法[:：]\s*(?:本人執筆|AI補助|AI生成)(?:[・、,]\s*(?:本人執筆|AI補助|AI生成))*|(?:自己紹介(?:記事)?|ハッシュタグ|タグ)(?:は)?(?:不要|任意)|フォロー(?:は)?(?:不要|任意|必須ではありません)|フォローの必要はありません)\s*$/.test(s))
    .join('。').replace(/[「」『』\s]/g,'');
  // Only a publisher's explicit simple comment route. No guessed application API.
  if(!/共同(?:運営)?マガジン/.test(text) || !/招待/.test(text) || !/文芸|文学|小説|詩|散文|エッセイ/.test(text) ||
    !/(?:参加の申請は[、,]?コメント欄に参加希望と書くだけ|参加希望と(?:この記事の)?コメント(?:欄に)?(?:してください|を書いてください|を書くだけ))/.test(text))return false;
  // An unimplemented condition cannot be silently satisfied on the writer's behalf.
  if(/フォロー|フォロワー|募集(?:停止|終了|休止)|受付(?:停止|終了|休止)|満員|参加費.{0,12}[1-9]\d*円|購入|有料|決済|メンバーシップ|合言葉|自己紹介|審査|承認制|公募|新人賞|応募中|R18|成人向け|本人確認|電話番号|住所|DMのみ|AI|人工知能|手書き|人間執筆|著作権.{0,8}譲渡|(?:スキ|リポスト|シェア|ハッシュタグ).{0,15}(?:必須|必要|お願い|ください)|(?:必須|必ず).{0,15}(?:スキ|リポスト|シェア|ハッシュタグ)|限定|資格|要件|対象外|のみ参加|参加.{0,8}条件|条件.{0,8}参加|事前.{0,8}(?:相談|連絡)|禁止|不可|お断り|期限|締切/i.test(text))return false;
  const forward=anchors161(n.body).some(a=>noteLink161(a.href,t.rule)?.id===t.id);
  const back=noteLink161(meta161(html,'og:url'))?.id===t.id && anchors161(html).some(a=>noteLink161(a.href,t.url,'article')?.id===t.article);
  return forward||back;
}
function genericPlacementPolicy520(body,target){
  // Joining does not imply publication eligibility. Only the explicit permitted-set parser can unlock it.
  const clauses=words161(body).split(/[。\n]+/).map(s=>s.trim()).filter(Boolean);
  const rules=clauses.filter(s=>s!==target.name && s!=='マガジン' && !/^(?:共同(?:運営)?マガジン|参加費は(?:完全)?無料|招待メールを送ります|参加の申請は[、,]?コメント欄に参加希望と書くだけです|参加希望とコメントしてください)$/.test(s.replace(/[「」『』]/g,''))).join('。');
  return magazinePolicy161(rules).policy;
}
const rememberMagazineBeforeExpansion520=Desk520.prototype.rememberMagazine;
Object.assign(Desk520.prototype,{
  initExpansion520(){
    if(!this.one("SELECT 1 FROM sqlite_master WHERE name='desk_join_target'"))this.storage.transactionSync(()=>{
      this.rows('CREATE TABLE desk_join_target(id TEXT PRIMARY KEY,definition TEXT NOT NULL,created INTEGER NOT NULL)');
      this.rows("CREATE TABLE desk_join_discovery(id TEXT PRIMARY KEY,due INTEGER NOT NULL DEFAULT 0,checked INTEGER NOT NULL DEFAULT 0,message TEXT NOT NULL DEFAULT '募集元を確認待ち')");
      this.rows('CREATE INDEX desk_join_discovery_due ON desk_join_discovery(due,id)');
      this.rows("CREATE TABLE desk_expansion(id INTEGER PRIMARY KEY,due INTEGER NOT NULL DEFAULT 0,day TEXT NOT NULL DEFAULT '',used INTEGER NOT NULL DEFAULT 0)");
      this.rows('INSERT INTO desk_expansion(id) VALUES(1)');
      this.rows('CREATE TABLE desk_scout_cursor(url TEXT PRIMARY KEY,offset INTEGER NOT NULL DEFAULT 0,checked INTEGER NOT NULL DEFAULT 0)');
      this.rows("CREATE TABLE desk_popular(id INTEGER PRIMARY KEY,due INTEGER NOT NULL DEFAULT 0,attempt INTEGER NOT NULL DEFAULT 0,checked INTEGER NOT NULL DEFAULT 0,message TEXT NOT NULL DEFAULT '人気記事の表示を確認待ち')");
      this.rows('INSERT INTO desk_popular(id) VALUES(1)');
      for(const t of JOIN_TARGETS520)this.rows('INSERT INTO desk_join_target(id,definition,created) VALUES(?,?,?)',t.id,JSON.stringify(t),Date.now());
      this.rows('INSERT OR IGNORE INTO desk_join_discovery(id) SELECT id FROM desk_import');
      // No reset of memberships, exclusions, in-flight writes, holds or publication schedules.
      this.rows("INSERT OR IGNORE INTO desk_scout(url,kind,due) VALUES('https://note.com/43__/magazines','owner',0),('https://note.com/43__','owner',0)");
      this.rows('UPDATE desk_scout_state SET due=0 WHERE id=1');
    });
    this.expansionReady=true;
  },
  rememberMagazine(link,label){
    const result=rememberMagazineBeforeExpansion520.call(this,link,label);
    if(this.expansionReady && result)this.rows('INSERT OR IGNORE INTO desk_join_discovery(id) VALUES(?)',link.id);
    return result;
  },
  joinTarget520(id){
    const row=this.one('SELECT definition FROM desk_join_target WHERE id=?',id);
    if(!row)return null;
    try{const t=JSON.parse(row.definition);return t.id===id && validJoinTarget520(t)?t:null;}catch{return null;}
  },
  async saveInvitationMail520(text,active=()=>true){
    need520(typeof text==='string' && text.length<=250000,'招待本文を確認できません。');
    const plain=words161(text).normalize('NFKC').replace(/\s+/g,'');
    need520(/共同運営/.test(plain)&&/招待/.test(plain),'共同運営招待を確認できません。');
    const links=[...anchors161(text).filter(a=>/参加|承認|招待|確認/.test(a.label)).map(a=>a.href),
      ...Array.from(text.matchAll(/https:\/\/note\.com\/[^\s<>"']+/g),m=>m[0])];
    const ids=[...new Set(links.flatMap(invitationIds520))];
    let targets=ids.map(id=>this.joinTarget520(id)).filter(Boolean);
    if(!ids.length){
      // Opaque links can be matched only against actual, outstanding applications, not the entire discovered web.
      targets=this.rows("SELECT t.definition FROM desk_join_target t JOIN desk_join j ON j.id=t.id WHERE j.phase IN ('sent','applied','accepting') AND j.at>?",Date.now()-30*D520)
        .map(r=>JSON.parse(r.definition)).filter(t=>validJoinTarget520(t)&&plain.includes(t.match));
    }
    targets=targets.filter(t=>plain.includes(t.match));
    need520(targets.length===1,'招待の対象誌を特定できません。');
    const target=targets[0],urls=[...new Set(links.map(s=>inviteUrl520(s,target.id,ids.length>0)).filter(Boolean))];
    need520(urls.length===1,'承認リンクを1つに特定できません。');
    return this.saveInvitation520(urls[0],true,target.id,active);
  },
  async expandJoin520(now){
    const c=this.one('SELECT * FROM desk_expansion WHERE id=1');
    if(c.due>now || !this.joinActive520(''))return;
    const day=jstDay(now),used=c.day===day?c.used:0;
    if(used>=12)return;
    const row=this.one(`SELECT i.* FROM desk_join_discovery q JOIN desk_import i ON i.id=q.id
      WHERE q.due<=? AND NOT EXISTS(SELECT 1 FROM desk_join_target t WHERE t.id=q.id)
      AND NOT EXISTS(SELECT 1 FROM desk_member m WHERE m.id=q.id AND m.mode='excluded') ORDER BY q.due,q.id LIMIT 1`,now);
    if(!row)return;
    this.rows('UPDATE desk_expansion SET day=?,used=?,due=? WHERE id=1',day,used+1,now+30*M520);
    this.rows("UPDATE desk_join_discovery SET due=?,checked=?,message='募集方法の読み取り中' WHERE id=?",now+D520,now,row.id);
    let message='無料・募集元・フォロー不要の申請方法を確認できず保留';
    try{
      const reads=await Promise.allSettled([this.publicRead('https://note.com/api/v1/magazines/'+row.id,'json'),this.publicRead(row.url,'html')]);
      const payload=reads[0].value,html=reads[1].value||'',data=payload?.data?.magazine??payload?.data;
      const owner=data?.owner?.urlname;
      if(data?.key!==row.id || !/^\w[\w-]{0,79}$/.test(owner||'') || owner==='43__')return;
      const canonical=noteLink161(meta161(html,'og:url'));
      if(canonical?.id!==row.id || canonical.owner!==owner)return;
      const name=typeof data.name==='string'?data.name.trim():row.name;
      if(!text520(name,100) || !/文芸|文学|小説|詩|散文|エッセイ|創作/.test(name+' '+meta161(html,'og:description')))return;
      const candidates=[...new Map(anchors161(html).filter(a=>/募集|参加|運営ルール/.test(a.label)).map(a=>noteLink161(a.href,row.url,'article')).filter(l=>l?.owner===owner).map(l=>[l.id,l])).values()];
      if(candidates.length!==1){message='運営者の募集記事を1つに特定できず保留';return;}
      const rule=candidates[0],target={id:row.id,owner,article:rule.id,name,match:name,follow:false,dynamic:true,perDay:1,genres:[],url:canonical.url,rule:rule.url,
        comment:'はじめまして。520（43__）です。参加希望です。よろしくお願いいたします。'};
      if(!joinFree520(payload,html,target))return;
      const n=(await this.publicRead('https://note.com/api/v3/notes/'+rule.id,'json'))?.data;
      if(!genericJoinRoute520(n,html,target))return;
      target.ruleHash=await draftBodyHash(n.body);
      if(!target.ruleHash)return;
      this.storage.transactionSync(()=>{
        if(!this.joinActive520(target.id))return;
        this.rows('INSERT OR IGNORE INTO desk_join_target(id,definition,created) VALUES(?,?,?)',target.id,JSON.stringify(target),now);
        this.rows('INSERT OR IGNORE INTO desk_join(id) VALUES(?)',target.id);
        this.rows('UPDATE desk_join_cfg SET due=MIN(due,?) WHERE id=1',now);
      });
      message='フォロー不要・無料の参加申請先に追加。掲載条件は別に確認します';
    }finally{this.rows('UPDATE desk_join_discovery SET message=?,due=? WHERE id=?',message,now+7*D520,row.id);}
  },
  async scoutLiterary(now){
    const cfg=this.one('SELECT c.enabled,c.blocked,d.enabled AS directory FROM desk_cfg c JOIN desk_directory d ON d.id=c.id WHERE c.id=1');
    if(!cfg.enabled || !cfg.directory)return '探索は休止中です。';
    if(cfg.blocked>now)return 'noteの待機期限 '+time(cfg.blocked)+' 以降に自動で続けます。';
    const day=jstDay(now),budget=this.one('SELECT day,used FROM desk_scout_budget WHERE id=1'),used=budget.day===day?budget.used:0;
    if(used>=64)return '本日は64回の探索を試みました。翌日、続きから再開します。累計上限はありません。';
    if(this.one('SELECT due FROM desk_scout_state WHERE id=1').due>now)return '探索は次の通常間隔で続けます。';
    const next=this.one('SELECT url,kind FROM desk_scout WHERE due<=? ORDER BY due,url LIMIT 1',now);
    if(!next)return '確認予定のページは巡回済みです。更新時に続けます。';
    this.storage.transactionSync(()=>{
      this.rows('UPDATE desk_scout_budget SET day=?,used=?,seeded=1 WHERE id=1',day,used+1);
      this.rows('UPDATE desk_scout_state SET due=? WHERE id=1',now+(used+1<32?4:30)*M520);
      this.rows('UPDATE desk_scout SET due=? WHERE url=?',now+HOUR,next.url);
      this.rows('INSERT OR IGNORE INTO desk_scout_cursor(url) VALUES(?)',next.url);
    });
    try{
      let entries=[],nextPage=null;
      if(next.kind==='feed'){
        const items=await this.readIssue(next.url),mag=noteLink161(next.url);
        this.recordReferences(items,mag,this.one('SELECT name FROM desk_import WHERE id=?',mag.id)?.name||mag.id,now);
        entries=[...new Set(items.map(e=>noteLink161(e.link,next.url,'article')?.owner).filter(v=>v&&v!=='43__'))].sort().map(owner=>({writer:owner}));
      }else{
        const html=await this.publicRead(next.url,'html'),url=new URL(next.url);
        if(!/<html[\s>]/i.test(html))throw Error('HTML');
        const canonical=meta161(html,'og:url');
        const sameOwner=raw=>{try{const u=new URL(raw);return u.origin==='https://note.com' && u.pathname.split('/')[1]===url.pathname.split('/')[1] && /^\/\w[\w-]{0,79}(?:\/magazines)?\/?$/.test(u.pathname);}catch{return false;}};
        if(canonical && !sameOwner(canonical))throw Error('owner');
        const anchors=anchors161(html),page=Number(url.searchParams.get('page')||1);
        for(const a of anchors){
          try{const u=new URL(a.href,next.url);if(sameOwner(u.href) && u.pathname===url.pathname && u.search==='?page='+(page+1) && !u.hash){nextPage=u.href;break;}}catch{}
        }
        const found=new Map();
        for(const a of anchors){
          const link=noteLink161(a.href,next.url);
          if(link && (next.kind==='owner'||/小説|文芸|文学|詩|エッセイ|散文|掌編|創作|物語|短歌|共同運営/.test(a.label)))found.set(link.id,{link,label:a.label.split('\n')[0]});
        }
        entries=[...found.values()].sort((a,b)=>a.link.id.localeCompare(b.link.id));
      }
      const cursor=this.one('SELECT offset FROM desk_scout_cursor WHERE url=?',next.url).offset;
      const offset=cursor>=entries.length?0:cursor,batch=entries.slice(offset,offset+50),more=offset+batch.length<entries.length;
      let added=0;
      this.storage.transactionSync(()=>{
        for(const e of batch){
          if(e.writer){this.rows("INSERT OR IGNORE INTO desk_scout(url,kind,due) VALUES(?,'author',?)",'https://note.com/'+e.writer+'/magazines',now);continue;}
          const known=this.one('SELECT 1 FROM desk_import WHERE id=?',e.link.id);
          if(this.rememberMagazine(e.link,e.label)){
            this.rows('INSERT OR IGNORE INTO desk_scout_mag(id) VALUES(?)',e.link.id);
            if(!known)added++;
            this.rows("INSERT OR IGNORE INTO desk_scout(url,kind,due) VALUES(?,'feed',?)",e.link.url,now);
            if(e.link.owner)this.rows("INSERT OR IGNORE INTO desk_scout(url,kind,due) VALUES(?,'author',?)",'https://note.com/'+e.link.owner+'/magazines',now);
            if(next.kind==='owner'){
              this.rows('INSERT OR IGNORE INTO desk_owner_source(id) VALUES(?)',e.link.id);
              this.rows("UPDATE desk_member SET due=0 WHERE id=? AND mode='check' AND ticket=''",e.link.id);
            }
          }
        }
        if(nextPage)this.rows('INSERT OR IGNORE INTO desk_scout(url,kind,due) VALUES(?,?,?)',nextPage,next.kind,now);
        this.rows('UPDATE desk_scout_cursor SET offset=?,checked=? WHERE url=?',more?offset+batch.length:0,now,next.url);
        this.rows('UPDATE desk_scout SET due=? WHERE url=?',now+(more?4*M520:next.kind==='feed'||next.kind==='owner'?D520:7*D520),next.url);
        this.rows('UPDATE desk_scout_state SET message=? WHERE id=1','新たに'+added+'誌を登録。'+(more?'この一覧の続きも確認します。':'')+'累計誌数の上限なし');
        if(next.kind==='owner')this.rows("UPDATE desk_directory SET token='',due=?,message=? WHERE id=1",now+D520,'520の公開一覧を巡回中。ページの続きも探索キューで確認します。');
      });
    }catch{this.rows("UPDATE desk_scout_state SET message='公開ページの読み取りを再確認待ち。確認済みの続きは保持しています' WHERE id=1");}
    return this.one('SELECT message FROM desk_scout_state WHERE id=1').message;
  },
  async discoverMagazines(now,manual=false){
    const cfg=this.one('SELECT enabled,due FROM desk_directory WHERE id=1');
    if(!manual && (!cfg.enabled || cfg.due>now))return;
    this.storage.transactionSync(()=>{
      for(const url of ['https://note.com/43__','https://note.com/43__/magazines'])
        this.rows("INSERT INTO desk_scout(url,kind,due) VALUES(?,'owner',?) ON CONFLICT(url) DO UPDATE SET due=MIN(due,excluded.due)",url,now);
      this.rows("UPDATE desk_directory SET enabled=1,due=?,token='',message='520の公開一覧を継続探索に追加しました' WHERE id=1",now+D520);
    });
  }
});

// A discovery surface independent of following, liking or magazine membership.
const popularLabels520=[
  '自分のクリエイタートップの「ホーム」「記事」タブに人気記事を表示できます',
  '自分のクリエイタートップの「ホーム」「記事」タブに人気記事を表示する',
  '人気記事を表示する','人気記事を表示'
];
async function browserPopular520(binding,id,cookie,mayChange,mark){
  return inNoteBrowser(binding,cookie,false,async({command,evaluate,blocked,blockedResult})=>{
    const control=recommendationControlJS.replace('account|reaction|reactions','profile');
    const read=action=>evaluate('('+control+')('+JSON.stringify(popularLabels520)+','+JSON.stringify(action)+')');
    await command('Page.navigate',{url:'https://note.com/settings/profile'});
    let state,previous,stable=false;
    for(let i=0;i<14 && !blocked();i++){
      try{state=await read('read');}catch{state=null;}
      if(['on','off'].includes(state)&&state===previous){stable=true;break;}
      previous=state;await pause520(300);
    }
    if(blocked())return blockedResult();
    if(!stable)return {message:'プロフィールの人気記事設定を識別できず・次回再確認'};
    const who=await evaluate(noteIdentityJS);
    if(blocked())return blockedResult();
    if(who?.id!==id || who.name!=='43__')return {message:'520本人を確認できず・人気記事設定は保留'};
    if(state==='on')return {verified:true,message:'人気記事の表示ONをnoteで確認済み（表示には16記事以上の公開が必要）'};
    if(!mayChange)return {message:'人気記事設定の保存結果を再確認待ち'};
    // Capture all unrelated fields in a fresh session; only this checkbox may change before Save.
    const snapshot=()=>evaluate(`(()=>{if(location.origin!=='https://note.com'||location.pathname.replace(/\\/$/,'')!=='/settings/profile')return null;
      return JSON.stringify([...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]),textarea,select')].map(e=>[e.tagName,e.name,e.type,e.value]));})()`);
    const before=await snapshot();
    if(before===null || !await mark())return {message:'停止・待機・処理期限により人気表示の変更を保留'};
    if((await read('enable'))!=='clicked')return {message:'人気記事の表示状態が変化・次回再確認'};
    await pause520(300);
    if(blocked())return blockedResult();
    if(await snapshot()!==before)return {message:'他のプロフィール欄に変化を検出・保存を保留'};
    const identity=await evaluate(noteIdentityJS);
    if(blocked())return blockedResult();
    if(identity?.id!==id || identity.name!=='43__' || !await mark(true))return {message:'プロフィール保存前の本人・停止状態を再確認待ち'};
    const saved=await evaluate(`(()=>{if(location.origin!=='https://note.com'||location.pathname.replace(/\\/$/,'')!=='/settings/profile')return 'outside';
      const buttons=[...document.querySelectorAll('button,input[type=submit]')].filter(e=>e.getClientRects().length && !e.disabled && e.getAttribute('aria-disabled')!=='true' && /^(?:保存|保存する|変更を保存|プロフィールを更新)$/.test((e.getAttribute('aria-label')||e.textContent||e.value||'').trim()));
      if(buttons.length>1)return 'ambiguous';if(buttons.length===1){buttons[0].click();return 'saved';}return 'automatic';})()`);
    if(saved==='outside'||saved==='ambiguous')return {message:'プロフィール保存ボタンを特定できず・次回再確認'};
    await pause520(1000);
    return blocked()?blockedResult():{sent:true,message:'人気記事表示のON操作済み・次回の別接続で保存結果を確認'};
  });
}
Object.assign(Desk520.prototype,{
  async popularTick520(now){
    const state=this.one('SELECT * FROM desk_popular WHERE id=1');
    if(state.due>now || !this.shelfActive520())return;
    if(this.one('SELECT 1 FROM desk_link_plan WHERE pub IS NULL AND scheduled BETWEEN ? AND ? LIMIT 1',now-5*M520,now+6*M520)||
      this.one('SELECT 1 FROM desk_work_schedule WHERE pub IS NULL AND scheduled BETWEEN ? AND ? LIMIT 1',now-5*M520,now+6*M520))return;
    this.rows('UPDATE desk_popular SET due=? WHERE id=1',now+2*HOUR);
    let env,lease,due=now+6*HOUR,message='人気記事の表示を再確認待ち';
    try{
      if(typeof this.env.BROWSER?.acquire!=='function'){message='ブラウザー接続後に人気記事の表示を確認';return;}
      const a=await this.deliveryAccount();
      if(!a || a.until>Date.now()){message='520の接続・前の処理が終了するのを待機中';due=a?Math.max(now+30*M520,a.until+M520):due;return;}
      env=scoped(this.env,a.slot);lease=await acquire(env,false);
      if(!lease){due=now+30*M520;return;}
      const cookie=cleanCookie((await loadCookie(env,a.id)).NOTE_SESSION);
      const result=await browserPopular520(this.env.BROWSER,a.id,cookie,!state.attempt||state.attempt<=now-D520,async(saveOnly=false)=>{
        if(!this.shelfActive520())return false;
        const live=await sql(env,'SELECT c.account,c.token,c.lease,c.next_at,h.kind,n.hold_until FROM nh_control c JOIN nh_health h ON h.id=c.id JOIN nh_v13_connection n ON n.slot=? WHERE c.id=1',a.slot).first(),at=Date.now();
        if(!live || live.account!==a.id || live.token!==lease || live.lease<=at || live.hold_until>at || (live.kind && live.next_at>at))return false;
        if(saveOnly)return true;
        return !!this.one('UPDATE desk_popular SET attempt=? WHERE id=1 AND (attempt=0 OR attempt<=?) RETURNING id',at,at-D520);
      });
      message=result.message;
      if(result.verified){this.rows('UPDATE desk_popular SET checked=? WHERE id=1',Date.now());due=now+7*D520;}
      else if(result.sent)due=now+30*M520;
      if(result.hold>0){const until=Date.now()+result.hold;due=Math.max(due,until);this.rows('UPDATE desk_cfg SET blocked=MAX(blocked,?) WHERE id=1',until);await sql(env,'UPDATE nh_v13_connection SET hold_until=MAX(hold_until,?) WHERE slot=?',until,a.slot).run();}
    }catch(error){message=readLimit(error)?'D1の読み取り枠更新後に再確認':'人気記事設定の読み戻しを再確認待ち';if(readLimit(error))due=(Math.floor(Date.now()/D520)+1)*D520+M520;}
    finally{this.rows('UPDATE desk_popular SET due=?,message=? WHERE id=1',due,message);if(lease)await release(env,lease);}
  }
});

// Tuta's own web client performs its decryption. This bridge never uses IMAP,
// exports a mailbox, follows email links, or dismisses authentication warnings.
// UI contracts checked against tutao/tutanota MailView, ListModel,
// ConversationViewModel and MailViewerViewModel; unknown versions fail closed.
const TUTA520_ORIGIN='https://app.tuta.com';
function tutaCredentials520(input) {
  const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
  const password=typeof input.password==='string'?input.password:'';
  const totp=typeof input.totp==='string'?input.totp.replace(/\s/g,'').toUpperCase():'';
  need520(email.length<=254 && /^[^\s<>@,;]+@(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(email),'Tutaのメールアドレスを末尾まで入力してください。');
  need520(password.length>0 && password.length<=1024 && !/[\x00\r\n]/.test(password),'Tutaのパスワードを入力してください。');
  need520(!totp || /^[A-Z2-7]{16,128}$/.test(totp),'TOTPには6桁のコードではなく、本人の認証アプリ設定キーを入力してください。');
  return {email,password,totp};
}
async function tutaSeal520(env,generation,input) {
  const key=await encryptionKey(env),iv=crypto.getRandomValues(new Uint8Array(12));
  const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('note-helper:tuta:v1:'+generation)},key,new TextEncoder().encode(JSON.stringify(input)));
  return {iv:b64(iv),ciphertext:b64(data)};
}
async function tutaOpen520(env,row) {
  const key=await encryptionKey(env);
  const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(row.iv),additionalData:new TextEncoder().encode('note-helper:tuta:v1:'+row.generation)},key,unb64(row.ciphertext));
  return tutaCredentials520(JSON.parse(new TextDecoder().decode(data)));
}
async function tutaTotp520(secret,at=Date.now()) {
  if(!/^[A-Z2-7]{16,128}$/.test(secret))throw new Error('TOTP configuration');
  let value=0,bits=0;const bytes=[],alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  for(const char of secret){value=(value<<5)|alphabet.indexOf(char);bits+=5;if(bits>=8){bits-=8;bytes.push((value>>>bits)&255);}}
  const counter=new Uint8Array(8);new DataView(counter.buffer).setBigUint64(0,BigInt(Math.floor(at/30000)));
  const key=await crypto.subtle.importKey('raw',new Uint8Array(bytes),{name:'HMAC',hash:'SHA-1'},false,['sign']);
  const hash=new Uint8Array(await crypto.subtle.sign('HMAC',key,counter)),offset=hash.at(-1)&15;
  return String((new DataView(hash.buffer).getUint32(offset)&0x7fffffff)%1000000).padStart(6,'0');
}

// Executed only inside app.tuta.com. Return booleans and candidate identifiers;
// unrelated subjects, addresses, bodies and authentication data stay in the tab.
async function tutaScreen520(step,arg={}) {
  if(location.origin!=='https://app.tuta.com')return {state:'outside'};
  const visible=e=>!!e?.getClientRects().length && !e.closest('[hidden],[aria-hidden="true"]');
  const all=(selector,root=document)=>[...root.querySelectorAll(selector)].filter(visible);
  const name=e=>(e.getAttribute('aria-label')||e.innerText||e.textContent||e.value||'').trim();
  const label=e=>[e.getAttribute('aria-label'),e.getAttribute('placeholder'),e.name,
    ...(e.getAttribute('aria-labelledby')||'').split(/\s+/).filter(Boolean).map(id=>document.getElementById(id)?.textContent),
    ...Array.from(e.labels||[],name)].filter(Boolean).join(' ');
  const unique=xs=>xs.length===1?xs[0]:null;
  const input=(e,v)=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,v);
    e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));
  };
  const buttons=(root=document)=>all('button,[role="button"],input[type="submit"]',root).filter(e=>!e.disabled && e.getAttribute('aria-disabled')!=='true');
  const passwords=all('input[type="password"]').filter(e=>!e.disabled);
  const emails=all('input[type="email"],input[autocomplete="username"],input[type="text"]')
    .filter(e=>!e.disabled && (e.type==='email'||e.autocomplete==='username'||/e-?mail|メールアドレス/i.test(label(e))));
  const otp=all('input').filter(e=>!e.disabled && e.type!=='hidden' && (e.autocomplete==='one-time-code'||/TOTP|authentication code|認証コード|authentifizierungscode/i.test(label(e))));
  const captcha=all('iframe[src*="captcha"],input[name*="captcha"]');
  if(captcha.length)return {state:'challenge'};
  if(['login','loginReady','loginSubmit'].includes(step)) {
    if(!/^\/(?:login)?\/?$/.test(location.pathname))return {state:'outside'};
    const email=unique(emails),pass=unique(passwords.filter(e=>!otp.includes(e)));
    if(!email||!pass)return {state:'page',reason:'login_fields'};
    if(step==='login'){
      input(email,arg.email);input(pass,arg.password);
      return email.value===arg.email&&pass.value===arg.password?{state:'filled'}:{state:'page',reason:'login_values'};
    }
    const submit=unique(buttons().filter(e=>/^(?:log\s?in|sign in|ログイン|anmelden)$/i.test(name(e))));
    if(email.value!==arg.email||!pass.value)return {state:'page',reason:'login_values'};
    if(!submit)return {state:'page',reason:'login_button'};
    if(step==='loginReady')return {state:'ready'};
    submit.click();return {state:'sent'};
  }
  if(['otp','otpReady','otpSubmit'].includes(step)) {
    const field=unique(otp),root=field?.closest('[role="dialog"],dialog,form')||document;
    if(!field)return {state:'challenge'};
    if(step==='otp'){
      if(!/^\d{6}$/.test(arg.code||''))return {state:'challenge'};
      input(field,arg.code);return {state:'filled'};
    }
    const submit=unique(buttons(root).filter(e=>/^(?:verify|confirm|ok|log\s?in|確認|認証|ログイン|bestätigen)$/i.test(name(e))));
    if(!/^\d{6}$/.test(field.value))return {state:'page',reason:'otp_values'};
    if(!submit)return {state:'page',reason:'otp_button'};
    if(step==='otpReady')return {state:'ready'};
    submit.click();return {state:'sent'};
  }
  if(otp.length)return {state:'otp'};
  if(passwords.length && emails.length)return {state:'login'};

  // Mithril stores its vnode tree on its mount element. Walk only vnode edges;
  // email HTML and DOM attributes cannot create an application model here.
  const queue=[];
  for(const el of [document.documentElement,document.body,...Array.from(document.querySelectorAll('div')).slice(0,300)]) {
    const nodes=Object.getOwnPropertyDescriptor(el||{},'vnodes')?.value;
    if(Array.isArray(nodes))queue.push(...nodes);
  }
  const seen=new Set(),models=new Set();
  for(let i=0;i<queue.length && i<12000;i++) {
    const node=queue[i];if(!node||typeof node!=='object'||seen.has(node))continue;seen.add(node);
    for(const container of [node.attrs,node.state]) {
      const model=container?.mailViewModel;
      if(model && typeof model.onSingleSelection==='function' && typeof model.getConversationViewModel==='function' && model.listModel)models.add(model);
    }
    if(node.instance)queue.push(node.instance);
    if(Array.isArray(node.children))queue.push(...node.children);
  }
  const model=unique([...models]);if(!model)return {state:'page',reason:models.size?'model_ambiguous':'model_missing'};
  const list=model.listModel,items=list.state?.items;
  if(!Array.isArray(items) || typeof list.isLoadedCompletely!=='function')return {state:'page',reason:'list_contract'};

  // Locate the signed-in controller through the trusted application's own model
  // dependencies. Never infer identity from text in an email or a screen label.
  const dependencies=[{object:model,depth:0}],checked=new Set();let identity=false,wrong=false;
  for(let i=0;i<dependencies.length && i<600;i++) {
    const {object,depth}=dependencies[i];
    if(!object || typeof object!=='object' || checked.has(object) || object instanceof Node)continue;
    checked.add(object);
    if(typeof object.getUserController==='function') {
      try{
        const email=object.getUserController()?.userGroupInfo?.mailAddress;
        if(typeof email==='string'){if(email.toLowerCase()===arg.email)identity=true;else wrong=true;}
      }catch{}
    }
    if(depth<4)for(const descriptor of Object.values(Object.getOwnPropertyDescriptors(object))) {
      if(descriptor.value && typeof descriptor.value==='object')dependencies.push({object:descriptor.value,depth:depth+1});
    }
  }
  if(wrong || !identity)return {state:'identity',reason:wrong?'account_mismatch':'account_unconfirmed'};
  if(!items.length && !list.isLoadedCompletely())return {state:'loading'};
  const key=mail=>Array.isArray(mail?._id)&&mail._id.length===2 && mail._id.every(v=>typeof v==='string' && v.length<200)?JSON.stringify(mail._id):null;
  const sender=address=>typeof address==='string' && /^[^@<>\s,;]+@(?:[a-z0-9-]+\.)?note\.(?:com|mu)$/i.test(address);
  const date=mail=>new Date(mail.receivedDate).getTime();
  const recent=mail=>Number.isFinite(date(mail)) && date(mail)>=arg.since && date(mail)<=Date.now();
  const candidates=items.filter(mail=>key(mail) && recent(mail) && sender(mail.sender?.address) && /招待|invitation|invited/i.test(mail.subject||''));
  if(step==='list')return {state:'ready',items:candidates.map(mail=>({key:key(mail),received:date(mail)})),
    complete:list.isLoadedCompletely() || (items.every((mail,i)=>Number.isFinite(date(mail)) && (!i || date(items[i-1])>=date(mail))) && items.some(mail=>date(mail)<arg.since))};
  if(step==='more') {
    if(typeof list.loadMore!=='function')return {state:'page'};
    await list.loadMore();return {state:'loaded'};
  }
  if(step==='open') {
    const mail=unique(candidates.filter(mail=>key(mail)===arg.key));
    if(!mail)return {state:'changed'};
    await model.onSingleSelection(mail);return {state:'opened'};
  }
  if(step!=='read')return {state:'page'};
  const view=model.getConversationViewModel()?.primaryViewModel?.();
  if(!view || key(view.mail)!==arg.key || !recent(view.mail) || typeof view.getMailBody!=='function' ||
    typeof view.getSanitizedMailBody!=='function' || typeof view.mustRenderFailureBanner!=='function' ||
    typeof view.isWarningDismissed!=='function' || typeof view.didErrorsOccur!=='function')return {state:'loading'};
  if(!view.mailDetails || !view.getSanitizedMailBody())return {state:'loading'};
  // None == 0 in FailureBannerType. With loaded mailDetails and no dismissed
  // warning, this requires Tuta's positive authenticated-sender result.
  if(view.isWarningDismissed()!==false || view.mustRenderFailureBanner()!==0 || view.didErrorsOccur()!==false)return {state:'untrusted'};
  const from=view.getSender?.()?.address,displayed=view.getDisplayedSender?.()?.address;
  if(!sender(from) || typeof displayed!=='string' || from.toLowerCase()!==displayed.toLowerCase())return {state:'untrusted'};
  const recipients=[...(view.getToRecipients?.()||[]),...(view.getCcRecipients?.()||[]),...(view.getBccRecipients?.()||[])];
  if(!recipients.some(r=>typeof r.address==='string' && r.address.toLowerCase()===arg.email))return {state:'recipient'};
  const fragment=view.getSanitizedMailBody(),body=fragment.textContent||'',text=(view.getSubject?.()||'')+'\n'+body;
  if(text.length>60000 || !/共同運営/.test(body) || !/招待/.test(body))return {state:'irrelevant'};
  const links=[...fragment.querySelectorAll('a[href]')].map(a=>a.getAttribute('href'))
    .concat(Array.from(text.matchAll(/https:\/\/note\.com\/[^\s<>"']+/g),m=>m[0]))
    .filter(raw=>{try{const u=new URL(raw);return u.origin==='https://note.com'&&!u.username&&!u.password && raw.length<=6000;}catch{return false;}});
  return {state:'mail',key:arg.key,received:date(view.mail),text,links:[...new Set(links)].slice(0,24),authenticated:true};
}

// Fixed, non-sensitive diagnostics survive a browser failure and a DO restart.
const TUTA_STAGES520={browser:'ブラウザー起動',target:'ブラウザーのタブ作成',websocket:'ブラウザーとの接続',
  network:'通信の準備',navigate:'Tutaページを開く処理',login_page:'ログイン欄の読み込み',
  login_fill:'ログイン欄への入力',login_ready:'ログインボタンの準備待ち',login_submit:'ログインの送信',
  mailbox:'ログイン後の受信箱・本人確認',otp_fill:'追加認証の入力',otp_ready:'追加認証ボタンの準備待ち',
  otp_submit:'追加認証の送信',list:'受信一覧の確認',mail:'招待メールの確認',mail_open:'招待メールを開く処理',
  mail_read:'招待メールの送信元確認',more:'受信一覧の続きを取得',storage:'招待記録の保存'};
const TUTA_STATES520={unread:'画面の確認前',outside:'想定したTutaのページではありません',
  page:'必要な画面を識別できません',loading:'画面の読み込みが完了していません',
  login:'ログイン欄が表示されたままです',identity:'ログイン中の本人を確認できません',
  otp:'追加認証の画面です',challenge:'追加認証の対応が必要です',stopped:'停止・待機・時間切れ',
  script_error:'画面の確認処理を完了できません',invalid_result:'画面の確認結果を取得できません',
  login_fields:'メールアドレス欄とパスワード欄を1つずつ確認できません',
  login_values:'入力後にフォームの内容が変わりました',login_button:'ログインボタンを押せる状態と確認できません',
  otp_values:'追加認証の入力が未確認です',otp_button:'追加認証ボタンを押せる状態と確認できません',
  model_missing:'受信箱の内部データを取得できません',model_ambiguous:'受信箱の内部データを1つに特定できません',
  list_contract:'受信一覧のデータ形式を確認できません',account_mismatch:'保存したアドレスとログイン中の本人が一致しません',
  account_unconfirmed:'ログイン中の本人を内部データで確認できません'};
function tutaDiagnostic520(result) {
  if(!Object.hasOwn(TUTA_STAGES520,result.stage||''))return '';
  const state=Object.hasOwn(TUTA_STATES520,result.screen||'')?result.screen:'unread';
  const http=Number.isInteger(result.http)&&result.http>=400&&result.http<=599?' ／ HTTP '+result.http:'';
  return '\n停止箇所：'+TUTA_STAGES520[result.stage]+'\n確認内容：'+TUTA_STATES520[state]+http+
    '\n確認コード：TUTA4/'+result.stage+'/'+state;
}

async function readTuta520(binding,credential,callbacks) {
  let session,socket,command,blocked=0,retry=0,opened=false;
  const until=Date.now()+100000;
  let saved=0,skipped=0,details=0,complete=false,unresolved=false,stage='browser',lastScreen={state:'unread'};
  const inspected=new Set();
  // Diagnostics contain only fixed stage/state identifiers, never page text,
  // URLs, exceptions, account addresses, mail contents or credentials.
  const report=result=>({...result,stage,screen:lastScreen.reason||lastScreen.state,http:blocked,
    ...(blocked||retry>0?{kind:blocked===401?'auth':'hold',hold:Math.max(retry,blocked===429?2*HOUR:0)}:{})});
  try {
    session=await binding.acquire({keepAlive:15000,recording:false,guardrails:{allowedDomains:['app.tuta.com','*.tuta.com','*.tutanota.com']}});
    stage='target';
    const target=await binding.devtools.newTarget(session.sessionId);
    stage='websocket';
    const link=await binding.connectSession(session.sessionId,{targetId:target.id});
    const upgrade=await link.webSocket.fetch('https://browser-binding.invalid',{headers:{Upgrade:'websocket'}});
    socket=upgrade.webSocket;if(!socket)throw Error('browser setup');socket.accept();command=pageCommand(socket);
    socket.addEventListener('message',event=>{
      let value;try{value=JSON.parse(event.data);}catch{return;}
      if(value.method!=='Network.responseReceived')return;
      const r=value.params?.response;let u;try{u=new URL(r.url);}catch{return;}
      if(u.protocol!=='https:' || !(u.hostname==='tuta.com'||u.hostname.endsWith('.tuta.com')||u.hostname.endsWith('.tutanota.com')))return;
      if((r.status===401&&opened)||[403,429].includes(r.status)||r.status>=500)blocked=r.status;
      const raw=Object.entries(r.headers||{}).find(([k])=>k.toLowerCase()==='retry-after')?.[1];
      if(raw!==undefined){const wait=/^\d+$/.test(String(raw))?Number(raw)*1000:Date.parse(raw)-Date.now();if(Number.isFinite(wait))retry=Math.max(retry,wait);}
    });
    const halt=()=>blocked||retry>0||Date.now()>=until||!callbacks.active();
    const frame=async(step,arg={})=>{
      if(halt())return {state:'stopped'};
      const r=await command('Runtime.evaluate',{expression:'('+tutaScreen520.toString()+')('+JSON.stringify(step)+','+JSON.stringify({email:credential.email,since:Date.now()-7*D520,...arg})+')',returnByValue:true,awaitPromise:true});
      if(r.exceptionDetails){lastScreen={state:'script_error'};throw Error('mail screen');}
      lastScreen=r.result?.value && typeof r.result.value.state==='string'?r.result.value:{state:'page',reason:'invalid_result'};
      return lastScreen;
    };
    const poll=async(step,arg={},tries=30)=>{
      let state={state:'page'};
      for(let n=0;n<tries&&!halt();n++) {
        try{state=await frame(step,arg);}catch{lastScreen=state={state:'script_error'};}
        if(!['page','loading','identity','script_error'].includes(state?.state))return state;
        await pause520(500);
      }
      return state;
    };
    stage='network';
    await command('Network.enable');
    await command('Network.setCacheDisabled',{cacheDisabled:true});
    await command('Network.setBlockedURLs',{urls:['*://note.com/*','*://*.note.com/*']});
    stage='navigate';
    await command('Page.navigate',{url:TUTA520_ORIGIN+'/login'});
    stage='login_page';
    // A fresh isolated browser may still be downloading/decrypting the app.
    // Wait within the existing total deadline, without another login attempt.
    let state=await poll('list',{},60);
    // Never adopt somebody else's pre-existing browser login.
    if(state?.state!=='login')return report({kind:state?.state==='challenge'?'challenge':'screen'});
    stage='login_fill';
    if((await frame('login',{password:credential.password})).state!=='filled')return report({kind:'screen'});
    stage='login_ready';
    if((await poll('loginReady',{},20)).state!=='ready')return report({kind:'screen'});
    if(halt())return report({kind:'stopped'});
    stage='login_submit';opened=true;
    if((await frame('loginSubmit')).state!=='sent')return report({kind:'screen'});
    stage='mailbox';
    state={state:'login'};
    let otpSent=false;
    for(let n=0;n<90&&!halt();n++) {
      await pause520(500);
      try{state=await frame('list');}catch{lastScreen=state={state:'script_error'};continue;}
      if(state.state==='ready')break;
      if(state.state==='challenge')return report({kind:'challenge'});
      if(state.state==='otp') {
        if(!credential.totp || otpSent)return report({kind:'challenge'});
        const code=await tutaTotp520(credential.totp);
        stage='otp_fill';
        if((await frame('otp',{code})).state!=='filled')return report({kind:'challenge'});
        stage='otp_ready';
        if((await poll('otpReady',{},20)).state!=='ready')return report({kind:'challenge'});
        if(halt())return report({kind:'stopped'});
        stage='otp_submit';
        if((await frame('otpSubmit')).state!=='sent')return report({kind:'challenge'});
        otpSent=true;stage='mailbox';
      }
    }
    if(halt())return report({kind:'timeout'});
    if(state?.state!=='ready')return report({kind:state?.state==='login'?'auth':state?.state==='otp'?'challenge':'screen'});
    for(let page=0;page<4&&!halt();page++) {
      stage='list';state=await poll('list',{},12);
      if(state?.state!=='ready')return report({kind:'screen',saved});
      const waiting=[];
      stage='storage';
      for(const item of state.items||[])if(!inspected.has(item.key) && !await callbacks.seen(item.key))waiting.push(item);
      stage='mail';
      let processed=0;
      for(const item of waiting) {
        if(halt()||details>=8)break;
        details++;processed++;inspected.add(item.key);
        stage='mail_open';
        if((await frame('open',{key:item.key})).state!=='opened'){unresolved=true;continue;}
        stage='mail_read';
        const mail=await poll('read',{key:item.key},12);
        if(halt())break;
        if(mail?.state==='mail' && mail.authenticated===true) {
          stage='storage';
          if(await callbacks.save(mail))saved++;else skipped++;
          stage='mail';
        }else if(['untrusted','recipient','irrelevant'].includes(mail?.state)) {
          stage='storage';skipped++;await callbacks.skip(item.key,mail.state);stage='mail';
        }else unresolved=true;
      }
      if(details>=8){complete=!!state.complete && processed===waiting.length;break;}
      if(state.complete){complete=true;break;}
      stage='more';
      if(page<3 && (await frame('more')).state!=='loaded')break;
    }
    if(!callbacks.active())return report({kind:'stopped'});
    return report({kind:'ok',saved,skipped,details,complete:complete&&!unresolved});
  } catch {return report({kind:stage==='storage'?'storage':['browser','target','websocket','network','navigate'].includes(stage)?'browser':'screen',saved});}
  finally {
    try{socket?.close();}catch{}
    if(session)await binding.closeSession(session.sessionId).catch(()=>{});
  }
}


const TUTA_MESSAGES520={
  auth:'Tutaのログイン成功を確認できません。入力情報・追加認証・画面の読み込みを含め、下の停止箇所を確認してください。',
  challenge:'Tutaの追加認証が必要です。認証アプリの場合はTOTP設定キーを登録できます。別端末承認・セキュリティキー・画像認証は自動通過しません。',
  screen:'Tutaの画面を確認できず、自動読み取りを保留しました。下に停止箇所を表示します。',
  browser:'Cloudflareのブラウザーを起動・接続できません。BROWSERの設定を確認してください。',
  hold:'Tutaの応答制限・待機指定に従って休止しています。',
  timeout:'Tutaの確認時間を超えたため、次回に続けます。',
  stopped:'Tutaの確認を停止しました。',
  storage:'Tutaの接続情報・招待を読み出しまたは保存できません。暗号化設定を確認してください。'
};
function tutaRecord520(t) {
  return 'Tuta：'+t.message+(t.checked?'\nTuta受信箱の最終確認：'+time(t.checked):'\n接続未確認：Tuta経由の招待取り込みはまだ成功を確認できていません。')+
    (t.last_received?'\nTutaから招待を取り込んだ日時：'+time(t.last_received):'')+
    (t.enabled?'\n次の自動再試行予定：'+time(Math.max(t.due,t.hold_until,t.lease)):'' );
}
Object.assign(Desk520.prototype,{
  initTuta520() {
    if(this.one("SELECT 1 FROM sqlite_master WHERE name='desk_tuta'"))return;
    this.storage.transactionSync(()=>{
      this.rows("CREATE TABLE desk_tuta(id INTEGER PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 0,generation TEXT NOT NULL DEFAULT '',iv TEXT NOT NULL DEFAULT '',ciphertext TEXT NOT NULL DEFAULT '',due INTEGER NOT NULL DEFAULT 0,hold_until INTEGER NOT NULL DEFAULT 0,lease INTEGER NOT NULL DEFAULT 0,token TEXT NOT NULL DEFAULT '',last_try INTEGER NOT NULL DEFAULT 0,checked INTEGER NOT NULL DEFAULT 0,last_received INTEGER NOT NULL DEFAULT 0,day TEXT NOT NULL DEFAULT '',used INTEGER NOT NULL DEFAULT 0,failures INTEGER NOT NULL DEFAULT 0,message TEXT NOT NULL DEFAULT '未接続')");
      this.rows('INSERT INTO desk_tuta(id) VALUES(1)');
      this.rows('CREATE TABLE desk_tuta_seen(hash TEXT PRIMARY KEY,due INTEGER NOT NULL,at INTEGER NOT NULL)');
      this.rows('CREATE INDEX desk_tuta_seen_at ON desk_tuta_seen(at)');
    });
  },
  tutaView520() {
    const row=this.one("SELECT enabled,(ciphertext<>'') AS configured,due,hold_until,lease,checked,last_received,message FROM desk_tuta WHERE id=1");
    return {...row,enabled:!!row.enabled,configured:!!row.configured};
  },
  async connectTuta520(input) {
    const credential=tutaCredentials520(input),generation=crypto.randomUUID();
    const encrypted=await tutaSeal520(this.env,generation,credential);
    this.rows("UPDATE desk_tuta SET enabled=1,generation=?,iv=?,ciphertext=?,due=MAX(hold_until,lease,last_try+300000,?),checked=0,failures=0,message='接続情報を暗号化保存しました。Tutaへのログインは確認待ちです。' WHERE id=1",generation,encrypted.iv,encrypted.ciphertext,Date.now());
    return 'Tutaの接続情報を保存しました。接続成功はまだ未確認です。少し待って「記録を開く」で結果を確認できます。参加申請・自動運転の休止中は再開後に確認します。';
  },
  disconnectTuta520() {
    this.rows("UPDATE desk_tuta SET enabled=0,generation=?,iv='',ciphertext='',due=0,checked=0,message='Tutaの接続情報を削除し、自動受信を停止しました。' WHERE id=1",crypto.randomUUID());
    return 'Tutaの接続情報を削除しました。すでに取り込んだ招待の承認も止める場合は「自動申請・承認を休止」を押してください。';
  },
  requestTutaCheck520(now) {
    const state=this.one('SELECT * FROM desk_tuta WHERE id=1');
    need520(state.enabled && state.ciphertext,'先にTutaを接続してください。');
    const gate=Math.max(state.hold_until,state.lease,state.last_try+5*M520);
    if(gate>now)return '次のTuta接続確認は '+time(gate)+' 以降です。';
    this.rows("UPDATE desk_tuta SET due=?,message='Tutaの接続を再確認待ち' WHERE id=1",now);
    return 'Tutaの再確認を予約しました。少し待って「記録を開く」で結果を確認してください。';
  },
  async tutaTick520(now) {
    this.init();
    const row=this.one('SELECT * FROM desk_tuta WHERE id=1');
    if(!row.enabled||!row.ciphertext||row.due>now||row.hold_until>now||row.lease>now||!this.joinActive520(''))return;
    if(this.one('SELECT 1 FROM desk_link_plan WHERE pub IS NULL AND scheduled BETWEEN ? AND ? LIMIT 1',now-5*M520,now+6*M520)||
      this.one('SELECT 1 FROM desk_work_schedule WHERE pub IS NULL AND scheduled BETWEEN ? AND ? LIMIT 1',now-5*M520,now+6*M520))return;
    const today=jstDay(now),used=row.day===today?row.used:0;
    if(used>=24){this.rows("UPDATE desk_tuta SET due=?,message='本日のTuta確認24回に達しました。翌日に続けます。' WHERE id=1",jstStart(today)+D520+M520);return;}
    const token=crypto.randomUUID();
    if(!this.one('UPDATE desk_tuta SET lease=?,token=?,last_try=?,due=?,day=?,used=? WHERE id=1 AND enabled=1 AND generation=? AND lease<=? RETURNING id',now+5*M520,token,now,now+HOUR,today,used+1,row.generation,now))return;
    const active=()=>!!this.one('SELECT 1 FROM desk_tuta WHERE id=1 AND enabled=1 AND generation=? AND token=? AND lease>?',row.generation,token,Date.now()) && this.joinActive520('');
    let result={kind:'storage'},credential;
    const hashOf=key=>draftBodyHash(credential.email+'\n'+key);
    const seen=async key=>{
      const hash=await hashOf(key);return !!this.one('SELECT 1 FROM desk_tuta_seen WHERE hash=? AND due>?',hash,Date.now());
    };
    const mark=async(key,delay)=>{
      const hash=await hashOf(key);if(!active())return;
      this.rows('INSERT INTO desk_tuta_seen(hash,due,at) VALUES(?,?,?) ON CONFLICT(hash) DO UPDATE SET due=excluded.due,at=excluded.at',hash,Date.now()+delay,Date.now());
    };
    try {
      credential=await tutaOpen520(this.env,row);
      if(typeof this.env.BROWSER?.acquire!=='function')result={kind:'browser'};
      else result=await readTuta520(this.env.BROWSER,credential,{
        active,seen,
        skip:(key,reason)=>mark(key,reason==='irrelevant'?8*D520:D520),
        save:async mail=>{
          if(!active() || mail.authenticated!==true || typeof mail.key!=='string' || !Array.isArray(mail.links))return false;
          const text='<p>'+esc(mail.text)+'</p>'+mail.links.map(url=>'<a href="'+esc(url)+'">招待を確認</a>').join('');
          try {
            await this.saveInvitationMail520(text,active);
            if(!active())return false;
            await mark(mail.key,8*D520);
            this.rows('UPDATE desk_tuta SET last_received=? WHERE id=1 AND generation=? AND token=?',Date.now(),row.generation,token);
            return true;
          }catch(error){if(!(error instanceof Input520))throw error;await mark(mail.key,HOUR);return false;}
        }
      });
    } catch {result={kind:'storage'};}
    finally {
      const at=Date.now(),ok=result.kind==='ok',hold=Math.max(0,Number(result.hold)||0);
      const failures=ok?0:row.failures+1;
      const delay=ok?HOUR:['auth','challenge'].includes(result.kind)?Math.min(24,2**Math.min(failures,5))*HOUR:2*HOUR;
      const message=ok?'Tuta受信箱を確認済み。今回の招待取り込み '+result.saved+'件。'+(result.skipped?'対象外・照合保留 '+result.skipped+'件。':'')+(result.complete?'直近7日の受信箱を確認しました。':'読み取り保留・上限により、直近一覧の一部だけ確認しました。'):
        (TUTA_MESSAGES520[result.kind]||TUTA_MESSAGES520.storage)+tutaDiagnostic520(result);
      // Even if the owner replaced or removed credentials while the browser was
      // running, preserve server Retry-After. Release only our own lease.
      this.rows('UPDATE desk_tuta SET hold_until=MAX(hold_until,?) WHERE id=1',at+hold);
      this.rows('UPDATE desk_tuta SET message=?,due=MAX(hold_until,?),checked=CASE WHEN ? THEN ? ELSE checked END,failures=? WHERE id=1 AND generation=? AND token=?',message,at+Math.max(delay,hold),+ok,at,failures,row.generation,token);
      this.rows("UPDATE desk_tuta SET lease=0,token='' WHERE id=1 AND token=?",token);
      this.rows('DELETE FROM desk_tuta_seen WHERE at<?',at-30*D520);
    }
  }
});

// A small native form, separate from the manuscript dashboard. No client script,
// credential-bearing URLs, public status, or D1 queries are needed for this page.
function tutaPage520(state=null,message='',status=200) {
  const lines=[];
  if(state) {
    lines.push(tutaRecord520(state.mail));
    if(!state.browser)lines.push('ブラウザー接続が未設定です。CloudflareのBROWSER設定を確認してください。');
    if(!state.encryption)lines.push('Cookie暗号化キーの形式を確認してください。');
    if(state.paused.length)lines.push('休止中：'+state.paused.join('・'));
    if(state.noteHold>Date.now())lines.push('note指定の待機：'+time(state.noteHold)+'まで');
    if(state.active && state.mail.configured)lines.push('定期確認の対象です。ログイン成功は上の確認記録で判断してください。');
  }
  const resume=state?.mail.configured && (state.paused.length || !state.mail.enabled);
  return reply(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tuta接続 ${VERSION}</title><style>body{font:17px system-ui;max-width:660px;margin:24px auto;padding:0 18px;line-height:1.7}label{display:block;margin:16px 0}input,button{font:inherit;padding:12px;box-sizing:border-box}input{width:100%}button{margin:8px 8px 8px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f4f6;padding:16px}small{display:block}details{margin:18px 0}a{overflow-wrap:anywhere}</style></head><body>
<h1>Tuta接続</h1><p>note-helper ${VERSION} ／ 520（43__）用</p>
<p>今のTutaでnoteの共同運営招待を確認します。メールアドレスの変更・独自ドメイン・転送設定は不要です。</p>
<p role="status">${esc(message||'管理用の鍵を入力してください。初回はTutaのログイン情報も入力します。')}</p>
${state?'<pre>'+esc(lines.join('\n\n'))+'</pre>':''}
<form method="post" action="/tuta">
<label>管理用の鍵（ADMIN_KEY）<input type="password" name="key" required autocomplete="off" autocapitalize="none" spellcheck="false"></label>
<button type="submit" name="action" value="status">接続結果を見る</button>
<label>Tutaのメールアドレス<input type="email" name="email" maxlength="254" autocomplete="off" autocapitalize="none" spellcheck="false"></label>
<label>Tutaのパスワード<input type="password" name="password" maxlength="1024" autocomplete="new-password"></label>
<details><summary>認証アプリの2段階認証を使っている場合</summary>
<p>本人のTOTP設定キーを入力できます。6桁の使い捨てコードではありません。セキュリティキー・別端末承認・画像認証が必要な場合は保留します。</p>
<label>TOTP設定キー（任意）<input type="password" name="totp" maxlength="128" autocomplete="new-password" autocapitalize="none" spellcheck="false"></label></details>
<button type="submit" name="action" value="connect">Tutaを接続して自動確認</button>
<small>Cloudflare上のブラウザーが受信箱を確認します。接続情報は暗号化して保存します。対象の招待が既読になる場合があります。入力した値は画面に再表示しません。</small>
<p>設定保存だけでは接続成功ではありません。少し待って「接続結果を見る」を押し、「Tuta受信箱を確認済み」を確認してください。接続済みならメールアドレス・パスワードの再入力は不要です。</p>
<button type="submit" name="action" value="check">保存済みの情報で再確認</button>
${resume?'<p>以下でTutaの定期確認と、520の登録済み予定の公開・共同誌への追加・参加申請・招待承認・作品棚・お礼更新を再開します。待機期限や除外設定は保持します。</p><button type="submit" name="action" value="resume">Tuta確認と520の自動運転を再開</button>':''}
<details><summary>接続を解除する</summary><button type="submit" name="action" value="off">Tutaの接続情報を削除して停止</button><small>取り込み済みの招待の承認も止める場合は、作品管理で「自動申請・承認を休止」を押してください。</small></details>
</form>
<p>通常は1時間ごと・1日最大24回。接続情報を更新してもログイン確認は5分以上空けます。直近7日の受信箱を1回最大4ページ・招待8件まで確認します。確認範囲と保留の理由は接続結果に表示します。</p>
<p><a href="/520">520の作品管理・記録</a> ／ <a href="/">スキの管理画面</a></p>
</body></html>`,true,status);
}
async function tutaRoute520(request,env) {
  if(request.method==='GET')return tutaPage520();
  if(request.method!=='POST')return tutaPage520(null,'操作方法を確認してください。',405);
  if(request.headers.get('Origin')!==new URL(request.url).origin)return tutaPage520(null,'Tuta接続画面を開き直してください。',403);
  if(!env.ADMIN_KEY)return tutaPage520(null,'CloudflareのADMIN_KEYが設定されていません。',503);
  if(request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/x-www-form-urlencoded')return tutaPage520(null,'Tuta接続画面のボタンから操作してください。',415);
  try {
    const form=new URLSearchParams(await read520body(request,24000));
    if(form.get('key')!==env.ADMIN_KEY)return tutaPage520(null,'管理用の鍵が違います。',403);
    const actions={status:'tuta_status',connect:'tuta_connect',check:'tuta_check',off:'tuta_off',resume:'tuta_resume'};
    const action=form.get('action')||'status';
    need520(Object.hasOwn(actions,action),'操作を選んでください。');
    if(!env.SCHEDULER)return tutaPage520(null,'CloudflareのSCHEDULER設定を確認してください。',503);
    const input={action:actions[action],tuta_only:true};
    if(action==='connect')Object.assign(input,{email:form.get('email'),password:form.get('password'),totp:form.get('totp')||''});
    const response=await stub520(env).fetch(new Request('https://scheduler.internal/desk/admin',{method:'POST',body:JSON.stringify(input)}));
    const data=await response.json();
    if(!response.ok)return tutaPage520(null,response.status===400?data.error:'設定の保存・読み出しを確認できません。「接続結果を見る」で状態を確認してください。',response.status===400?400:503);
    if(!data.tuta)throw Error('Tuta status');
    return tutaPage520(data.tuta,data.correctionMessage||'保存された確認結果を表示しました。接続成功かどうかは下の記録で確認してください。');
  } catch(error) {
    return tutaPage520(null,error instanceof Input520?error.message:'作品管理の保存先に接続できません。保存済みかどうかは「接続結果を見る」で確認してください。',error instanceof Input520?400:503);
  }
}
Object.assign(Desk520.prototype,{
  tutaDashboard520() {
    const row=this.one('SELECT c.enabled AS records,d.enabled AS delivery,j.enabled AS joins,c.blocked FROM desk_cfg c JOIN desk_delivery d ON d.id=c.id JOIN desk_join_cfg j ON j.id=c.id WHERE c.id=1');
    const paused=[!row.records?'自動記録':'',!row.delivery?'520の自動運転':'',!row.joins?'参加申請・招待承認':''].filter(Boolean);
    return {mail:this.tutaView520(),paused,noteHold:row.blocked,active:!paused.length && row.blocked<=Date.now(),
      browser:typeof this.env.BROWSER?.acquire==='function',encryption:/^[a-f0-9]{64}$/i.test(String(this.env.COOKIE_ENCRYPTION_KEY||'').trim())};
  },
  resumeTuta520(now) {
    need520(this.one("SELECT 1 FROM desk_tuta WHERE id=1 AND ciphertext<>''"),'先にTutaを接続してください。');
    this.storage.transactionSync(()=>{
      this.rows('UPDATE desk_tuta SET enabled=1 WHERE id=1');
      this.rows('UPDATE desk_cfg SET enabled=1,started=COALESCE(started,?),weekly_at=COALESCE(weekly_at,?) WHERE id=1',now,monday520(now));
      this.rows('UPDATE desk_delivery SET enabled=1 WHERE id=1');
      this.rows('UPDATE desk_join_cfg SET enabled=1 WHERE id=1');
    });
    return 'Tuta確認と520の自動運転を再開しました。待機期限・次回時刻・履歴・除外設定は維持します。Tutaへの接続成功は確認記録を見てください。';
  }
});
