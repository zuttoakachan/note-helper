const VERSION = 'v16.9.29';
const MAX_AUTHOR_HOURS = 365 * 24;
const SLOTS = ['1', '2'];
const DEFAULT_TAGS = ['小説', '短編小説', '創作', '散文', 'エッセイ', '詩', '日記', 'ショートショート', '掌編小説', '詩のようなもの', '自由詩', '独白', '希死念慮', '鬱', '恋愛', '恋愛エッセイ', '人間関係', '恋愛小説', '家族', '孤独', '生き方', '愛', '記憶', '喪失', '文学'];
const HOUR = 3600000, INTERVAL = 240000, LEASE = 300000;
const sql = (env, q, ...a) => env.DB.prepare(q).bind(...a);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time = n => typeof n==='number' && n>0 && Number.isFinite(new Date(n).getTime()) ? new Date(n).toLocaleString('ja-JP', {timeZone:'Asia/Tokyo'}) : 'まだありません';
const day = (ago=0) => new Date(Date.now() + 9 * HOUR - ago * 24 * HOUR).toISOString().slice(0, 10);
// Preserve valid server waits, including long ones. Reject overflow before it
// reaches a persisted deadline; callers retain their normal error backoff.
function retryDelay16929(value, now=Date.now(), secondsOnly=false) {
  if(typeof value!=='number'&&typeof value!=='string')return 0;
  const raw=typeof value==='string'?value.trim():value;
  if(raw==='')return 0;
  const seconds=secondsOnly||typeof raw==='number'||/^\d+$/.test(raw);
  const until=seconds?now+Math.ceil(Number(raw)*1000):Date.parse(raw);
  return Number.isSafeInteger(until)&&until>now&&Number.isFinite(new Date(until).getTime())?until-now:0;
}
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
<h1>note-helper ${VERSION}</h1><p><a href="/test">今すぐ本番テスト・結果を見る</a></p><p><a href="/tuta" style="display:block;padding:16px;background:#eef2ff;font-weight:bold">Tuta接続・招待メールの自動確認</a></p><p><a href="/520">520の作品管理・記録</a></p>
<p>創作記事の感想コメントへのスキと、創作記事に反応した読者の公開記事を自動で探索します。追加探索は30分以上空け、各アカウント1日12回まで。送信枠と同じ人への待機を記事巡回と共有します。成功件数と確認待ちは状態欄に表示します。</p>
<p>同じ読者が別の自作にもスキした記録を巡回先の比較に使います。対応した企画は条件を確認して自動応募し、公開結果まで確認します。詳細は「520の作品管理・記録」で確認できます。</p>
<p>公開作品の内容が近い別作者の作品を最大10本比較し、3作品以上に共通して反応した読者と、継続して他者の作品を紹介する作者を優先します。材料が足りない間は従来の巡回を続けます。比較状況は「520の作品管理・記録」に表示します。</p>
<p>通常は各アカウント4分以上の間隔で最大1件。2垢がONの間は処理開始も約2分以上ずらします。間隔は下の設定で変更できます。実行が遅れる場合があります。</p>
<p>送信前の一時的な読み取りエラーは、次の通常間隔で自動再試行します。スキの送信・結果確認のエラー、認証・回数制限などでは原則2時間待機します。noteが指定した待機時間を守ります。</p>
<p>質問箱の文芸に関する回答へのスキと、520の0円メンバーシップ参加も自動で探索します。通常会費0円と、新しくフォローしないことを確認できた場合だけ参加します。結果は状態確認に表示します。</p>
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

const READY = 'v16.9.19-ready';
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
  schema.push(...discoverySchema1697.map(q=>db.prepare(q)));
  schema.push(...growthSchema1699.map(q=>db.prepare(q)));
  schema.push(...outreachSchema16910.map(q=>db.prepare(q)));
  schema.push(...learningSchema16913.map(q=>db.prepare(q)));
  schema.push(...diagnosticSchema16915.map(q=>db.prepare(q)));
  schema.push(...auxSchema16917.map(q=>db.prepare(q)));
  schema.push(...boardSchema16912.map(q=>db.prepare(q)));
  await db.batch(schema);
  await repairAuxMetadata16919(original);
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
  // Repair only the exact pre-send internal-failure signatures. Auth/rate,
  // server holds, active leases, stopped accounts and uncertain writes survive.
  for(const slot of SLOTS){
    const env=scoped(original,slot),now=Date.now();
    items.push(sql(env,`UPDATE nh_control SET next_at=MAX(checked+(SELECT interval_seconds*1000 FROM nh_v15_settings WHERE id=1),?),
      message='追加探索の内部エラーによる休止を修正・通常巡回の予約待ち'
      WHERE id=1 AND enabled=1 AND lease<=? AND inflight='' AND next_at>?
      AND EXISTS(SELECT 1 FROM nh_health WHERE id=1 AND kind='storage')
      AND EXISTS(SELECT 1 FROM nh_v13_connection WHERE slot=? AND hold_until<=?)
      AND EXISTS(SELECT 1 FROM nh_v1697_discovery WHERE slot=? AND pending='')
      AND EXISTS(SELECT 1 FROM nh_v16910_state WHERE slot=? AND pending='')
      AND message IN (?,?)`,now,now,now,slot,now,slot,slot,
      '自動再確認待ち：感想・読者の追加探索／接続・保存・内部処理に失敗しました。操作結果を確認できません。',
      '自動再確認待ち：質問箱・0円参加・掲示板の追加探索／接続・保存・内部処理に失敗しました。操作結果を確認できません。'));
  }
  items.push(sql(original,'INSERT OR IGNORE INTO nh_migrations (name) VALUES (?)',READY));
  await db.batch(items);
}
function orderFor(tags, slot) {
  const offset = slot === '2' ? Math.ceil(tags.length / 2) : 0;
  return tags.slice(offset).concat(tags.slice(0,offset));
}
const REASONS = {
  board_checks:'参加済みの掲示板探索',board_sent:'掲示板投稿へのスキ確認',
  qa_checks:'質問箱の探索',qa_sent:'回答へのスキ確認',member_checks:'0円参加の探索',member_joined:'0円プランの参加確認',
  reader_saved:'読者候補の保存・更新',reader_profiles:'保存した読者の公開記事確認',reader_wait:'保存した読者の作者待機',reader_fallback:'読者候補から通常巡回へ継続',reader_returning:'自分の作品の読者探索',
  reader_checks:'読者・感想の追加探索', comment_sent:'感想コメントへのスキ確認成功', comment_recovered:'前回コメントのスキ確認成功', reader_sent:'読者経由の記事スキ確認成功', runs:'自動確認', sent:'送信成功', recovered:'前回送信の成功確認', author_recent:'同じ作者への待機で除外した候補',
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
    const retry = retryDelay16929(data?.parameters?.retry_after,Date.now(),true);
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
    const retry = retryDelay16929(raw);
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
  if(env.TRACE)env.TRACE.identity={id:String(user.id),owner:user.urlname};
  return String(user.id);
}
async function article(env, key) {
  try {
    const data=await api(env, '/api/v3/notes/' + key);
    if(data.key!==key)throw new Trouble('取得した記事が確認対象と一致しません','response');
    return data;
  }
  catch (error) { if (error.code === 404 && !error.retry) return null; throw error; }
}
function likeState16928(note){
  if(note===null)return false;
  if(note?.status!=='published'||typeof note.is_liked!=='boolean')
    throw new Trouble('記事の公開状態・スキ状態を確認できません','response');
  return note.is_liked;
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
// Reader discovery shares the normal account lease and sending interval.
// Browser text is transient. Only a comment fingerprint and author cooldown persist.
const FICTION1697 = new Set(['小説','短編小説','掌編小説','ショートショート','創作','散文','エッセイ','詩','文学','純文学','随筆','創作小説','恋愛小説','私小説','散文詩','自由詩','詩のようなもの','恋愛エッセイ']);
const discoverySchema1697 = [
  `CREATE TABLE IF NOT EXISTS nh_v1697_discovery(slot TEXT PRIMARY KEY,turn INTEGER NOT NULL DEFAULT 0,due INTEGER NOT NULL DEFAULT 0,utc_day INTEGER NOT NULL DEFAULT -1,used INTEGER NOT NULL DEFAULT 0,seed TEXT NOT NULL DEFAULT '',seed_owner TEXT NOT NULL DEFAULT '',seed_at INTEGER NOT NULL DEFAULT 0,pending TEXT NOT NULL DEFAULT '',reader_pending TEXT NOT NULL DEFAULT '',comments INTEGER NOT NULL DEFAULT 0,readers INTEGER NOT NULL DEFAULT 0,message TEXT NOT NULL DEFAULT '創作記事の取得待ち')`,
  `INSERT OR IGNORE INTO nh_v1697_discovery(slot) VALUES('1'),('2')`,
  `CREATE TABLE IF NOT EXISTS nh_v1697_comments(key TEXT PRIMARY KEY,slot TEXT NOT NULL,source TEXT NOT NULL,source_owner TEXT NOT NULL,owner TEXT NOT NULL,hash TEXT NOT NULL,status TEXT NOT NULL,created INTEGER NOT NULL,confirmed INTEGER)`
];
function publicFiction1697(n) {
  const tags=Array.isArray(n?.hashtags)?n.hashtags:[];
  return n?.status==='published' && /^n[a-z0-9]{1,64}$/.test(n.key) && /^[\w-]{1,80}$/.test(n.user?.urlname||'') &&
    tags.some(t=>FICTION1697.has(String(typeof t==='string'?t:t?.hashtag?.name??t?.name??'').replace(/^#/,'')));
}
async function saveSeed1697(env,notes,tag,ownIds,cursor) {
  if(!FICTION1697.has(tag))return;
  await rememberOutreach16910(env,notes,ownIds,cursor);
  const candidates=notes.filter(n=>/^n[a-z0-9]{1,64}$/.test(n?.key||'') && /^[\w-]{1,80}$/.test(n.user?.urlname||'') &&
    !ownIds.has(String(n.user?.id)) && ((Number(n.comment_count??n.commentCount)||0)>0 || (Number(n.like_count??n.likeCount)||0)>0));
  if(!candidates.length)return;
  const n=candidates[cursor%candidates.length];
  networkCall16922(env,'seed',candidates,null,false);
  await sql(env,'UPDATE nh_v1697_discovery SET seed=?,seed_owner=?,seed_at=? WHERE slot=?',n.key,n.user.urlname,Date.now(),env.SLOT).run();
}
async function liveDiscovery1697(env,token) {
  return !!await sql(env,`SELECT 1 FROM nh_control c JOIN nh_v13_connection n ON n.slot=?
    WHERE c.id=1 AND c.enabled=1 AND c.token=? AND c.lease>? AND n.hold_until<=?`,env.SLOT,token,Date.now(),Date.now()).first();
}
async function reserveComment1697(env,token,settings,seed,row,author) {
  const now=Date.now(),cutoff=now-settings.author_hours*HOUR,key='comment:'+seed.key+':'+row.hash;
  const result=await env.DB.batch([
    sql(env,`INSERT INTO nh_v15_authors(author,last_at,slot,token) SELECT ?,?,?,?
      WHERE EXISTS(SELECT 1 FROM nh_control c JOIN nh_v13_connection n ON n.slot=? WHERE c.id=1 AND c.enabled=1 AND c.token=? AND c.lease>? AND n.hold_until<=?)
      AND NOT EXISTS(SELECT 1 FROM nh_shared WHERE key=?)
      AND NOT EXISTS(SELECT 1 FROM nh_v14_authors WHERE author=? AND last_at>?)
      AND EXISTS(SELECT 1 FROM nh_v1697_discovery WHERE slot=? AND pending='')
      ON CONFLICT(author) DO UPDATE SET last_at=excluded.last_at,slot=excluded.slot,token=excluded.token WHERE nh_v15_authors.last_at<=?`,
      author,now,env.SLOT,token,env.SLOT,token,now,now,key,author,cutoff,env.SLOT,cutoff),
    sql(env,`INSERT OR IGNORE INTO nh_shared(key,slot,token,created) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM nh_v15_authors WHERE author=? AND token=? AND last_at=?)`,key,env.SLOT,token,now,author,token,now),
    sql(env,`INSERT OR IGNORE INTO nh_v1697_comments(key,slot,source,source_owner,owner,hash,status,created)
      SELECT ?,?,?,?,?,?,'pending',? WHERE EXISTS(SELECT 1 FROM nh_shared WHERE key=? AND token=?)`,key,env.SLOT,seed.key,seed.owner,row.owner,row.hash,now,key,token),
    sql(env,`UPDATE nh_v1697_discovery SET pending=? WHERE slot=? AND pending='' AND EXISTS(SELECT 1 FROM nh_v1697_comments WHERE key=? AND slot=? AND status='pending') AND EXISTS(SELECT 1 FROM nh_shared WHERE key=? AND token=?)`,key,env.SLOT,key,env.SLOT,key,token),
    sql(env,`INSERT INTO nh_v14_authors(slot,author,last_at,token) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM nh_shared WHERE key=? AND token=?) ON CONFLICT(slot,author) DO UPDATE SET last_at=excluded.last_at,token=excluded.token`,env.SLOT,author,now,token,key,token)
  ]);
  return [0,1,2,3].every(i=>result[i].meta.changes)?key:null;
}
async function settleComment1697(env,key,liked) {
  // Count exactly once, including a confirmed recovery after a lost browser reply.
  await env.DB.batch([
    sql(env,`UPDATE nh_v1697_discovery SET comments=comments+? WHERE slot=? AND pending=? AND EXISTS(SELECT 1 FROM nh_v1697_comments WHERE key=? AND status='pending')`,+liked,env.SLOT,key,key),
    sql(env,`UPDATE nh_v1697_comments SET status=?,confirmed=? WHERE key=? AND slot=? AND status='pending'`,liked?'liked':'uncertain',liked?Date.now():null,key,env.SLOT),
    sql(env,`UPDATE nh_v1697_discovery SET pending='' WHERE slot=? AND pending=?`,env.SLOT,key)
  ]);
}

// Strict native UI adapter: no guessed comment-write endpoint and no toggle based
// on heart colour. Missing/ambiguous identity, text or pressed state means no click.
async function readerScreen1697(step,arg) {
  if(location.origin!=='https://note.com' || location.pathname.replace(/\/$/,'')!=='/'+arg.owner+'/n/'+arg.key)return {state:'page'};
  let canonical;
  try{canonical=new URL(document.querySelector('link[rel="canonical"]')?.href);}catch{return {state:'loading'};}
  if(canonical.origin!==location.origin || canonical.pathname.replace(/\/$/,'')!==location.pathname.replace(/\/$/,''))return {state:'page'};
  if(step==='ready')return {state:'ready'};
  const visible=e=>!!e?.getClientRects().length && !e.closest('[hidden],[aria-hidden="true"]');
  const label=e=>(e.getAttribute('aria-label')||e.getAttribute('title')||e.innerText||'').replace(/\s+/g,' ').trim();
  const owner=a=>{try{const u=new URL(a.href);return u.origin===location.origin && /^\/([\w-]{1,80})\/?$/.exec(u.pathname)?.[1]||'';}catch{return '';}};
  const all=(root,selector)=>[...root.querySelectorAll(selector)].filter(visible);
  const controls=root=>all(root,'button,[role="button"]');
  const unique=items=>[...new Set(items)];
  // Count and action are distinct controls; never toggle the article heart to open readers.
  const excluded='[data-testid="note-body"],.note-common-styles,nav,aside,[data-testid="note-card"],.m-noteSmall';
  const rowSelector='[data-comment-id],[data-testid="comment-item"],.m-comment,.o-comment,.o-commentList__item,.m-commentList__item,.o-comment__item,[class*="CommentItem_"],[class*="CommentItem__"],[class*="commentItem_"],[class*="commentList__item"]';
  const roots=all(document,rowSelector).filter(e=>!e.closest(excluded)).filter((r,i,rs)=>!rs.some(other=>other!==r && r.contains(other) && other.innerText===r.innerText));
  const rows=[];
  for(const root of roots.slice(0,24)){
    const local=e=>e.closest(rowSelector)===root;
    const authorNodes=all(root,'[data-testid="comment-author"] a[href],a[data-testid="comment-author"],.m-comment__author a[href],.o-comment__author a[href],[class*="comment" i][class*="author" i] a[href],[class*="comment" i][class*="userName" i] a[href]');
    const bodies=all(root,'[data-testid="comment-body"],[data-testid="comment-text"],.m-comment__body,.m-comment__text,.o-comment__body,.o-comment__text,.m-commentList__body,.m-commentList__text,.o-commentList__body,.o-commentList__text,[class*="commentBody"],[class*="CommentBody"],[class*="commentText"],[class*="CommentText"]').filter(local);
    const names=unique((authorNodes.length?authorNodes:all(root,'a[href]').filter(a=>!bodies.some(b=>b.contains(a)))).filter(local).map(owner).filter(Boolean));
    const texts=unique(bodies.map(e=>(e.innerText||'').trim()).filter(Boolean));
    if(names.length!==1 || texts.length!==1 || texts[0].length>2000)continue;
    const text=texts[0],name=names[0];
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(name+'\n'+text))),b=>b.toString(16).padStart(2,'0')).join('');
    const likes=controls(root).filter(b=>local(b) && /^(?:コメントに)?スキ(?:する|をする|をつける|を取り消す|を取消す|を解除|済み)?(?:\s*[\d,]+)?$/.test(label(b)));
    const button=likes.length===1?likes[0]:null;
    let liked=null;
    if(button){
      const pressed=button.getAttribute('aria-pressed'),n=label(button);
      // Contradictory accessibility state cannot authorize a write.
      if(pressed==='true' && /スキ(?:する|をする|をつける)/.test(n) || pressed==='false' && /取り消す|取消す|解除|済み/.test(n))liked=null;
      else if(pressed==='true'||/取り消す|取消す|解除|済み/.test(n))liked=true;
      else if(pressed==='false'||/スキ(?:する|をする|をつける)/.test(n))liked=false;
    }
    const eligible=text.length>=20 && /読|文章|描写|物語|主人公|登場人物|余韻|ラスト|結末|表現/.test(text) &&
      !/https?:|www\.|フォロ[ーバ]|スキ返|相互|参加希望|招待|勧誘|死ね|殺す/.test(text);
    rows.push({owner:name,hash,liked,eligible,button});
  }
  const clean=r=>r.map(({button,...row})=>row);
  const dialogs=unique(all(document,'[role="dialog"],dialog[open],[aria-modal="true"],.m-modal,.o-modal,[class*="Modal__content"],[class*="modal__content"]'));
  const likerTitle=/^(?:この記事に)?スキ(?:(?:を)?した(?:人|ユーザー|クリエイター)(?:の一覧)?|の一覧|一覧)(?:\s*[（(]?\s*[\d,]+\s*(?:人|件)?\s*[）)]?)?$/;
  const modals=dialogs.filter(d=>{
    const headings=all(d,'h1,h2,h3,[role="heading"]');
    return likerTitle.test(label(d)) || headings.some(h=>likerTitle.test(label(h))) ||
      likerTitle.test((d.innerText||'').split('\n').map(s=>s.trim()).find(Boolean)||'');
  }).filter((r,i,rs)=>!rs.some(other=>other!==r && r.contains(other)));
  const modal=modals.length===1?modals[0]:null;
  const commentLists=all(document,'[data-testid="comment-list"],.o-commentList,.m-commentList,[class*="CommentList_"],[class*="commentList_"]').filter(e=>!e.closest(excluded));
  const commentBusy=commentLists.some(e=>e.getAttribute('aria-busy')==='true'||all(e,'[role="progressbar"],[aria-busy="true"]').length>0);
  const emptyComments=!roots.length&&!commentBusy&&commentLists.some(e=>(e.innerText||'').split('\n').some(line=>/^(?:まだ)?コメント(?:は|が)?(?:ありません[。！!]?|0件)$/.test(line.trim())));
  if(step==='comments')return {state:commentBusy?'loading':'ready',rows:clean(rows),empty:emptyComments,roots:roots.length,lists:commentLists.length};
  if(step==='closeComments'){
    const comments=dialogs.filter(d=>all(d,'h1,h2,h3,[role="heading"]').some(h=>/^コメント(?:\s*[（(]?\d+[）)]?)?$/.test(label(h))));
    if(!comments.length)return {state:'ready'};
    const leaves=comments.filter(d=>!comments.some(x=>x!==d&&d.contains(x)));
    if(leaves.length!==1)return {state:'ambiguous'};
    const close=controls(leaves[0]).filter(b=>/^(?:閉じる|とじる|close)$/i.test(label(b))&&!b.closest(rowSelector));
    if(close.length!==1||close[0].disabled)return {state:'missing'};
    close[0].click();return {state:'closed'};
  }
  if(step==='verify'||step==='like'){
    const found=rows.filter(r=>r.owner===arg.commentOwner && r.hash===arg.hash);
    if(found.length!==1)return {state:'missing'};
    const r=found[0];if(r.liked===true)return {state:'liked'};
    if(step==='verify')return {state:r.liked===false?'off':'unknown'};
    if(!r.eligible || r.liked!==false || !r.button || r.button.disabled || r.button.getAttribute('aria-disabled')==='true')return {state:'unknown'};
    r.button.click();return {state:'clicked'};
  }
  if(step==='openComments'){
    if(roots.length||emptyComments)return {state:'ready'};
    const options=controls(document).filter(b=>/^(?:コメント(?:欄)?(?:を見る|を表示|をすべて見る)?|コメント\s*[（(]?\d+\s*(?:件)?[）)]?|\d+\s*コメント)$/.test(label(b)) && !b.closest(rowSelector) && !b.closest(excluded));
    if(!options.length)return {state:'missing'};
    if(new Set(options.map(label)).size!==1)return {state:'ambiguous'};
    if(options[0].disabled || options[0].getAttribute('aria-disabled')==='true')return {state:'loading'};
    options[0].scrollIntoView?.({block:'center'});options[0].click();return {state:'opened'};
  }
  if(step==='openLikers'){
    if(modal)return {state:'ready'};
    const explicit=controls(document).filter(b=>/^(?:この記事に)?スキ(?:を)?した(?:人|ユーザー|クリエイター)(?:の一覧)?(?:を見る|を表示)?(?:\s*\d+人)?$|^スキ(?:の一覧|一覧)(?:を見る|を表示)?$/.test(label(b)) && !b.closest(rowSelector) && !b.closest(excluded));
    const countSelector='.o-noteLike__count,.m-noteLike__count,[class*="likeCount"],[class*="LikeCount"],[class*="like__count"],[class*="like__number"],[class*="like-count"],[class*="like_count"]';
    const numeric=all(document,countSelector).flatMap(e=>{
      if(e.closest(rowSelector)||e.closest(excluded)||!/^\d[\d,]*$/.test(label(e)))return [];
      // A count may be a span inside a native button. Never click a count
      // contained in the heart toggle, even when the count itself looks right.
      const b=e.closest('button,[role="button"]')||e;
      if(b.getAttribute('aria-pressed')!==null||/スキ(?:する|をする|をつける|を取り消す|を取消す|を解除|済み)/.test(label(b)))return [];
      if(!/^\d[\d,]*$/.test(label(b))&&!/一覧|スキ(?:を)?した/.test(label(b)))return [];
      return [b];
    });
    const options=unique(explicit.length?explicit:numeric);
    // Responsive copies have the same count; select one only if all counts agree.
    if(!options.length || !explicit.length && new Set(options.map(label)).size!==1)return {state:'missing'};
    if(explicit.length>1 && new Set(explicit.map(label)).size!==1)return {state:'ambiguous'};
    const button=options[0];if(button.disabled || button.getAttribute('aria-disabled')==='true')return {state:'loading'};
    button.scrollIntoView?.({block:'center'});button.click();return {state:'opened'};
  }
  if(step==='readers'){
    const busy=modal && (modal.getAttribute('aria-busy')==='true' || all(modal,'[role="progressbar"],[aria-busy="true"]').length>0 || /読み込み中|ロード中/.test(modal.innerText));
    const likers=modal&&!busy?unique(all(modal,'a[href]').map(owner).filter(Boolean)):[];
    // Merely opening a shell dialog does not establish an empty response.
    const empty=modal&&!busy&&/スキ(?:を)?した(?:人|ユーザー|クリエイター)(?:は|が)?(?:いません|ありません)|まだスキがありません|ゲストユーザー/.test(modal.innerText);
    return {state:busy?'loading':'ready',owners:unique([...rows.map(r=>r.owner),...likers]).filter(v=>v!==arg.owner).slice(0,20),likeOwners:likers.filter(v=>v!==arg.owner).slice(0,20),likesRead:!!modal&&!busy&&(likers.length>0||!!empty),comments:rows.length,likers:likers.length,modal:!!modal,busy:!!busy};
  }
  return {state:'missing'};
}


// Persist public reader identities between discovery runs. No private mail,
// notification feed, guessed write endpoint, or return-visit attribution.
const growthSchema1699 = [
  `CREATE TABLE IF NOT EXISTS nh_v1699_readers(slot TEXT NOT NULL,owner TEXT NOT NULL,source TEXT NOT NULL,origin TEXT NOT NULL,author TEXT NOT NULL DEFAULT '',seen INTEGER NOT NULL,expires INTEGER NOT NULL,next_at INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(slot,owner))`,
  `CREATE INDEX IF NOT EXISTS nh_v1699_readers_due ON nh_v1699_readers(slot,next_at,owner)`,
  `CREATE INDEX IF NOT EXISTS nh_v1699_readers_expiry ON nh_v1699_readers(expires)`
];
async function rememberReaders1699(env,owners,seed,origin,bump) {
  const now=Date.now();
  const names=[...new Set(owners)].filter(n=>typeof n==='string' && /^[\w-]{1,80}$/.test(n) && n!==seed.owner && n!==env.TRACE?.identity?.owner).slice(0,20);
  if(!names.length)return;
  const origins=origin==='literary'?(networkCall16922(env,'origins')||{}):{};
  // Maximum 64 pending public identities per account; all lookups use indexes.
  // Refreshing an existing reader never shortens its next-check time.
  const result=await env.DB.batch([
    sql(env,'DELETE FROM nh_v1699_readers WHERE expires<=?',now),
    ...names.map(owner=>sql(env,`INSERT INTO nh_v1699_readers(slot,owner,source,origin,seen,expires,next_at) SELECT ?,?,?,?,?,?,0
      WHERE (SELECT COUNT(*) FROM nh_v1699_readers WHERE slot=?)<64 OR EXISTS(SELECT 1 FROM nh_v1699_readers WHERE slot=? AND owner=?)
      ON CONFLICT(slot,owner) DO UPDATE SET source=excluded.source,origin=excluded.origin,seen=excluded.seen,expires=excluded.expires`,
      env.SLOT,owner,seed.key,origins[owner]||origin,now,now+7*24*HOUR,env.SLOT,env.SLOT,owner))
  ]);
  bump('reader_saved',result.slice(1).filter(r=>r.meta.changes).length);
}
async function queuedReader1699(env,state,settings,token,ownIds,bump,origin=null) {
  if(!await liveDiscovery1697(env,token))return null;
  const now=Date.now();
  await networkEnqueue16922(env,bump);
  const preferred=(env.TRACE?.learning?.turn||0)%4!==0?(networkCall16922(env,'rank')||[]):[];
  const priority=preferred.length?'CASE q.owner '+preferred.map((_,i)=>'WHEN ? THEN '+i).join(' ')+' ELSE 9 END,':'';
  const row=await sql(env,`SELECT q.*,a.last_at FROM nh_v1699_readers q LEFT JOIN nh_v15_authors a ON a.author=q.author
    WHERE q.slot=? AND q.next_at<=? AND q.expires>? AND (? IS NULL OR q.origin=?) ORDER BY ${priority}q.next_at,q.owner LIMIT 1`,env.SLOT,now,now,origin,origin,...preferred).first();
  if(!row)return null;
  const wait=Math.max(now+24*HOUR,(row.last_at||0)+settings.author_hours*HOUR);
  const claimed=await sql(env,`UPDATE nh_v1699_readers SET next_at=? WHERE slot=? AND owner=? AND next_at<=?
    AND EXISTS(SELECT 1 FROM nh_control WHERE id=1 AND enabled=1 AND token=? AND lease>?)`,wait,env.SLOT,row.owner,now,token,now).run();
  if(!claimed.meta.changes)return null;
  if(ownIds.has(row.author) || row.owner===env.TRACE?.identity?.owner || (row.last_at||0)>now-settings.author_hours*HOUR){bump('reader_wait');return null;}
  if(!await liveDiscovery1697(env,token))return null;
  bump('reader_profiles');
  let data;
  try{data=await api(env,'/api/v2/creators/'+encodeURIComponent(row.owner)+'/contents?kind=note&page=1');}
  catch(error){
    if(error instanceof Trouble && [404,410].includes(error.code) && !error.retry){
      await sql(env,'DELETE FROM nh_v1699_readers WHERE slot=? AND owner=?',env.SLOT,row.owner).run();return null;
    }
    throw error;
  }
  if(!Array.isArray(data?.contents))return null;
  const notes=data.contents.slice(0,30).filter(n=>publicFiction1697(n) && n.user.urlname===row.owner &&
    /^[1-9]\d{0,19}$/.test(String(n.user.id)) && !ownIds.has(String(n.user.id)) && n.is_liked!==true).slice(0,settings.scan_notes);
  if(notes.length){
    const ids=new Set(notes.map(n=>String(n.user.id)));
    if(ids.size!==1)return null;
    await sql(env,'UPDATE nh_v1699_readers SET author=? WHERE slot=? AND owner=?',String(notes[0].user.id),env.SLOT,row.owner).run();
    await sql(env,'UPDATE nh_v1697_discovery SET message=? WHERE slot=?',
      (row.origin==='returning'?'自分の作品に反応した読者':row.origin==='overlap'?'近い3作品以上に共通して反応した読者':row.origin==='curator'?'他者の作品の紹介活動を確認した作者':'文芸記事に反応した読者')+'の公開記事を確認・送信結果は通常巡回欄に記録',env.SLOT).run();
  }
  if(notes.length && env.TRACE)env.TRACE.readerOrigin=row.origin;
  return notes.length?notes:null;
}
async function ownReaderSeed1699(env,state,turn) {
  const identity=env.TRACE?.identity;
  if(identity?.id!==state.account || !/^[\w-]{1,80}$/.test(identity.owner))return null;
  const data=await api(env,'/api/v2/creators/'+encodeURIComponent(identity.owner)+'/contents?kind=note&page=1');
  if(!Array.isArray(data?.contents))return null;
  networkCall16922(env,'corpus',data.contents,false);
  const notes=data.contents.slice(0,30).filter(n=>n?.status==='published' && /^n[a-z0-9]{1,64}$/.test(n.key) &&
    n.user?.urlname===identity.owner && String(n.user?.id)===state.account && typeof n.name==='string' && n.name.trim() && n.name.trim()!=='521' &&
    Math.max(Number(n.like_count??n.likeCount)||0,Number(n.comment_count??n.commentCount)||0)>0);
  // The creator endpoint provides recent content. No hashtags are required on the user's own work.
  const n=notes[Math.floor(turn/4)%Math.min(4,notes.length)];
  return n?{key:n.key,owner:identity.owner}:null;
}

async function readerOpportunity1697(env,state,settings,token,ownIds,markSending,bump) {
  const now=Date.now(),utc=Math.floor(now/(24*HOUR));
  const s=await auxReadWrite16919(env,'discovery_read',()=>sql(env,'SELECT * FROM nh_v1697_discovery WHERE slot=?',env.SLOT).first());
  const deferred=browserWait16916(env.BROWSER);
  if(deferred){
    await sql(env,'UPDATE nh_v1697_discovery SET message=? WHERE slot=?',deferred.message,env.SLOT).run();
    return s.pending?{handled:true,message:'前回操作は再送せず・'+deferred.message}:null;
  }
  const returning=!s.pending && (!s.seed || s.turn%4===3);
  if(!s.pending && ((!s.seed && !returning) || s.due>now))return null;
  const record=async message=>auxReadWrite16919(env,'discovery_message',()=>sql(env,'UPDATE nh_v1697_discovery SET message=? WHERE slot=?',message,env.SLOT).run());
  if(typeof env.BROWSER?.acquire!=='function'){
    await sql(env,"UPDATE nh_v1697_discovery SET due=?,message='BROWSER未設定・追加巡回は待機中' WHERE slot=?",now+6*HOUR,env.SLOT).run();
    if(s.pending)return {handled:true,message:'前回のコメント操作は未確認。BROWSERの接続待ちです。'};
    return null;
  }
  if(s.utc_day===utc && s.used>=12){
    await sql(env,"UPDATE nh_v1697_discovery SET due=?,message='追加巡回は本日12回確認済み・翌日に自動再開' WHERE slot=?",(utc+1)*24*HOUR+60000,env.SLOT).run();
    return s.pending?{handled:true,message:'前回のコメント操作は再送せず、翌日の確認待ちです。'}:null;
  }
  const pending=s.pending?await sql(env,'SELECT * FROM nh_v1697_comments WHERE key=? AND slot=?',s.pending,env.SLOT).first():null;
  if(s.pending && !pending)throw new Trouble('コメントの確認記録が一致しません','config');
  if(pending)markSending();
  let seed=pending?{key:pending.source,owner:pending.source_owner}:{key:s.seed,owner:s.seed_owner};
  if(!returning && (!/^n[a-z0-9]{1,64}$/.test(seed.key)||!/^[\w-]{1,80}$/.test(seed.owner)))return null;
  if(!await auxReadWrite16919(env,'discovery_lease',()=>liveDiscovery1697(env,token)))return {handled:true,message:'停止または処理期限のため追加巡回を終了しました'};
  const mode=pending?'verify':returning||s.turn%2?'readers':'comments';
  if(mode==='readers'&&!returning)seed=networkCall16922(env,'seed',[],seed,true,s.turn)||seed;
  const component=returning?'own_readers':mode==='readers'?'readers':'comments';
  await diagnostic16915(env,component,'attempt','source');
  if(returning){
    bump('reader_returning');seed=await ownReaderSeed1699(env,state,s.turn);
    if(!seed){await auxReadWrite16919(env,'discovery_source_wait',()=>sql(env,'UPDATE nh_v1697_discovery SET due=?,turn=? WHERE slot=?',now+30*60000,s.turn+1,env.SLOT).run());await record('自分の公開作品の読者候補なし・通常巡回を継続');await diagnostic16915(env,component,'wait','no_source');return null;}
  }
  const source=await article(env,seed.key);
  if(!source || source.key!==seed.key || source.user?.urlname!==seed.owner || (returning?String(source.user?.id)!==state.account || source.status!=='published':ownIds.has(String(source.user?.id)) || (!pending&&!publicFiction1697(source)))){
    networkCall16922(env,'missing',seed);
    if(pending){await settleComment1697(env,s.pending,false);return {handled:true,message:'前回のコメントの公開元を確認できず、再送せず除外しました'};}
    await auxReadWrite16919(env,'discovery_source_wait',()=>sql(env,'UPDATE nh_v1697_discovery SET due=?,turn=? WHERE slot=?',now+30*60000,s.turn+1,env.SLOT).run());
    await record('創作タグ・公開元の一致を確認できず・次の巡回で別の記事を確認');await diagnostic16915(env,component,'wait','source_mismatch');return null;
  }
  networkCall16922(env,'note',source);
  const claim=await claimDiscovery16919(env,s,Date.now(),!pending);
  if(!claim)return null;
  bump('reader_checks');
  let reserved='',failure=null;
  const guard=async fn=>{try{return await fn();}catch(e){failure=e;throw e;}};
  const result=await inNoteBrowser(env.BROWSER,cleanCookie(env.NOTE_SESSION),false,async io=>{
    const {command,evaluate,blocked,blockedResult}=io;
    const form=(step,extra={})=>evaluate('('+BROWSER_SOURCES520.readerScreen1697+')('+JSON.stringify(step)+','+JSON.stringify({...seed,...extra})+')');
    await command('Page.navigate',{url:'https://note.com/'+seed.owner+'/n/'+seed.key});
    let identity;
    for(let n=0;n<6&&!blocked();n++){
      try{identity=await evaluate(noteIdentityJS);if(identity?.id)break;}catch{}
      await pause520(250);
    }
    if(blocked())return blockedResult();
    if(identity?.id!==state.account)return {message:'追加巡回の本人確認が一致せず・操作なし'};
    const waitForm=async(step,accept,extra={})=>{
      let last={state:'loading'},signature='';
      for(let n=0;n<16&&!blocked();n++){
        last=await form(step,extra);
        const next=JSON.stringify(last);
        if(accept(last) && (['openComments','openLikers'].includes(step)||next===signature))return last;
        signature=next;await pause520(250);
      }
      return {state:'loading'};
    };
    // Read native controls only after hydration; never retry an action click in a poll.
    const page=await waitForm('ready',r=>r.state==='ready');
    if(page.state!=='ready')return {stage:'article_page',message:'追加巡回：記事画面の読み込みを確認できず・次回再確認'};
    if(mode==='readers'){
      const opened=await waitForm('openLikers',r=>['ready','opened'].includes(r.state));
      if(blocked())return blockedResult();
      let r=await waitForm('readers',r=>r.state==='ready' && r.likesRead===true);
      if(!r.likesRead){
        await evaluate('window.scrollTo(0,document.documentElement.scrollHeight)');
        await waitForm('openComments',r=>['ready','opened'].includes(r.state));
        r=await waitForm('readers',r=>r.comments>0);
      }
      if(blocked())return blockedResult();
      const read=r.state==='ready'&&r.likesRead===true;
      return {owners:r.owners||[],likeOwners:r.likeOwners||[],readersVerified:read,
        stage:read?'liker_list':opened.state==='opened'?'liker_loading':'liker_control',
        message:read?'スキした読者の一覧を確認・'+(r.likeOwners?.length||0)+'人（取得できた範囲）':
          r.owners?.length?'コメントの作者を確認。スキした読者の一覧は未確認':
          '追加巡回：スキした読者の一覧'+(opened.state==='opened'?'の読み込み':'を開く場所')+'を確認できず・通常の記事巡回を継続'};
    }
    await evaluate('window.scrollTo(0,document.documentElement.scrollHeight)');
    await waitForm('openComments',r=>['ready','opened'].includes(r.state));
    const read=await waitForm('comments',r=>r.state==='ready' && (r.rows.length>0||r.empty===true));
    const rows=read.rows||[],stable=read.state==='ready'&&(rows.length>0||read.empty===true);
    if(blocked())return blockedResult();
    if(pending){
      const r=await waitForm('verify',r=>['liked','off'].includes(r.state),{commentOwner:pending.owner,hash:pending.hash});
      return {recovered:r.state==='liked',resolved:true,stage:'comment_recovery',message:r.state==='liked'?'前回のコメントへのスキを確認しました':'前回のコメントへのスキは未確認・再送せず除外しました'};
    }
    if(!stable)return {stage:'comment_rows',message:'コメント欄の本文・作者・スキ状態を確認できず・操作なし'};
    let checked=0;
    for(const row of rows){
      if(!row.eligible||row.liked!==false||row.owner===seed.owner)continue;
      if(++checked>3)break;
      const who=await guard(()=>api(env,'/api/v2/creators/'+encodeURIComponent(row.owner)));
      const author=String(who?.id||'');
      if(who?.urlname!==row.owner||!/^\d+$/.test(author)||ownIds.has(author))continue;
      const key=await guard(()=>reserveComment1697(env,token,settings,seed,row,author));
      if(!key){bump('reserved');continue;}
      reserved=key;markSending();
      if(blocked())return blockedResult();
      if(!await guard(()=>liveDiscovery1697(env,token)))return {message:'停止・待機のためコメント操作を保留'};
      const target={commentOwner:row.owner,hash:row.hash};
      if((await form('like',target)).state!=='clicked')return {message:'コメントの状態が変わったため操作を保留'};
      await pause520(1000);
      if(blocked())return blockedResult();
      await command('Page.navigate',{url:'https://note.com/'+seed.owner+'/n/'+seed.key});
      await waitForm('openComments',r=>['ready','opened'].includes(r.state));
      const verified=(await waitForm('verify',r=>r.state==='liked',target)).state==='liked';
      return {verified,message:verified?'感想コメントへのスキ確認済み':'コメントへのスキは操作済み・次回に結果確認'};
    }
    return {commentsRead:true,stage:'comment_rows',message:'感想コメントの候補なし・作者待機・スキ済み'};
  },env.TRACE);
  if(failure)throw failure;
  if(result.browserDeferred && !reserved){
    await returnDiscovery16919(env,s,claim,Math.max(Date.now()+60000,result.retryAt),result.message);
    await diagnostic16915(env,component,'wait','browser');
    return pending?{handled:true,message:'前回操作は再送せず・'+result.message}:null;
  }
  await record(result.message||'追加巡回の画面を確認待ち');
  await diagnostic16915(env,component,result.verified||result.recovered?'confirmed':result.readersVerified||result.commentsRead?'read':'failed',result.stage||'browser');
  if(result.code||result.hold)throw new Trouble(result.message,result.code===429?'rate':[401,403].includes(result.code)?'auth':'network',result.hold||0,result.code||0);
  if(pending){
    // An unavailable page is not a reason to retry a click. Recovery is read-only.
    if(!result.resolved)throw new Trouble(result.message||'前回のコメント操作の確認待ち');
    await settleComment1697(env,s.pending,!!result.recovered);
    if(result.recovered)bump('comment_recovered');
    return {handled:true,success:!!result.recovered,message:result.message};
  }
  if(reserved){
    if(result.verified){await settleComment1697(env,reserved,true);bump('comment_sent');}
    else throw new Trouble(result.message||'コメントの送信結果は未確認');
    return {handled:true,success:true,message:result.message};
  }
  if(result.readersVerified)networkCall16922(env,'observe',source,result.likeOwners||[],returning);
  if(returning && result.readersVerified)await learningObserve16913(env,result.likeOwners||[],source,env.TRACE?.identity);
  if(!result.owners?.length)return null;
  await rememberReaders1699(env,result.owners,seed,returning?'returning':'literary',bump);
  return null;
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
    await auxiliaryWrites16917(env,'metrics',()=>learningPersist16913(env));
    if(trace.auxFault)message+='／追加機能だけ保留（AUX17/'+trace.auxFault.component+'/'+trace.auxFault.reason+'）';
    await env.DB.batch([
      ...metrics(),
      ...statItems(env,activeTag,success ? 'sent' : 'skips'),
      sql(env,'UPDATE nh_control SET message=?,next_at=? WHERE id=1 AND token=?',message,Date.now()+(settings?.interval_seconds*1000 || INTERVAL),token),
      sql(env,"UPDATE nh_health SET errors=CASE WHEN ? THEN 0 ELSE errors END,kind='',rate_fail=CASE WHEN ? THEN 0 ELSE rate_fail END,success_at=CASE WHEN ? THEN ? ELSE success_at END WHERE id=1",+success,+success,+success,Date.now())
    ]);
  };
  try {
    const snapshot=await runSnapshot16913(env);
    settings=snapshot.settings;const state=snapshot.state;
    checkingSend = Boolean(state.inflight);
    env = await loadCookie(env,state.account);
    if (await account(env)!==state.account) throw new Trouble('登録済みのnoteとログイン情報が一致しません','auth');
    await sql(env,'UPDATE nh_v14_alerts SET pending=0 WHERE slot=? AND pending<>0',slot).run();
    if (state.inflight) {
      stage='前回送信の確認';
      const data=await article(env,state.inflight), liked=likeState16928(data);
      const before=await sql(env,'SELECT status FROM nh_seen WHERE key=?',state.inflight).first();
      const add=liked && before?.status!=='liked';
      const items=[
        sql(env,'INSERT INTO nh_seen VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET status=excluded.status',state.inflight,liked?'liked':'uncertain',Date.now()),
        sql(env,"UPDATE nh_control SET inflight='',total=total+? WHERE id=1 AND token=?",+add,token),
        sql(env,"UPDATE nh_v1697_discovery SET readers=readers+?,reader_pending='',message=? WHERE slot=? AND reader_pending=?",+add,liked?'前回の読者経由の記事スキを確認':'前回の読者経由の記事は再送せず除外',slot,state.inflight)
      ];
      if (add) { items.push(sql(env,'INSERT OR IGNORE INTO nh_v13_success VALUES (?,?,?,?)',slot,state.inflight,day(),Date.now())); bump('recovered'); }
      await env.DB.batch(items);
      await auxiliaryWrites16917(env,'confirmed',()=>learningConfirmed16913(env,state.inflight,liked));
      await finish(liked?'前回の記事のスキを確認しました。次回から候補を確認します':'前回の記事は再送せず除外しました',liked);
      return true;
    }
    const tags=orderFor(settings.tags,slot);
    const marks = values=>values.map(()=>'?').join(',');
    const [otherRows,waitRows]=await original.DB.batch([
      sql(scoped(original,slot==='1'?'2':'1'),'SELECT account FROM nh_control WHERE id=1'),
      sql(env,'SELECT tag,until_at FROM nh_v15_tag_wait WHERE slot=? AND tag IN ('+marks(tags)+') AND until_at>?',slot,...tags,Date.now())
    ]);
    const ownIds=new Set([state.account,otherRows.results[0].account].filter(Boolean));
    stage='質問箱・0円参加・掲示板の追加探索';
    const extra=await auxiliary16917(env,token,'outreach',()=>checkingSend,()=>outreachOpportunity16910(env,state,settings,token,ownIds,()=>{checkingSend=true;},bump));
    if(extra?.handled){await finish(extra.message,extra.success);return true;}
    stage='感想・読者の追加探索';
    const opportunity=await auxiliary16917(env,token,'readers',()=>checkingSend,()=>readerOpportunity1697(env,state,settings,token,ownIds,()=>{checkingSend=true;},bump));
    if(opportunity?.handled){await finish(opportunity.message,opportunity.success);return true;}
    stage='巡回先の選択';
    const choice=await auxiliary16917(env,token,'selection',()=>checkingSend,()=>learningChoice16913(env,settings,token),{mode:'normal'});
    stage='保存した読者の記事確認';
    const readerNotes=['tag','explore_tag'].includes(choice.mode)?null:await auxiliary16917(env,token,'queue',()=>checkingSend,()=>queuedReader1699(env,state,settings,token,ownIds,bump,choice.origin||null));
    const started=Date.now();
    const waits=new Map(waitRows.results.map(row=>[row.tag,row.until_at]));
    let cursor=state.cursor, savedCursor=cursor, lists=0, details=0, limited=false;
    for (let visited=0; visited<tags.length+(readerNotes?1:0) && (visited===0 && readerNotes || lists<settings.scan_tags); visited++) {
      if (details>=settings.scan_notes || Date.now()-started>=90000) { limited=true; break; }
      const fromReader=!!readerNotes && visited===0;
      const preferred=!fromReader && visited===0 && choice.mode==='tag' && !(waits.get(choice.tag)>Date.now());
      const tag=fromReader?'':preferred?choice.tag:tags[cursor%tags.length]; if(!fromReader&&!preferred)cursor++;
      if (waits.get(tag)>Date.now()) { bump('tag_wait'); continue; }
      const live=await sql(env,'UPDATE nh_control SET cursor=? WHERE id=1 AND token=? AND enabled=1 AND lease>?',cursor,token,Date.now()).run();
      if (!live.meta.changes) { await finish('停止または処理期限により探索を終了しました'); return true; }
      savedCursor=cursor;
      stage=fromReader?'保存した読者の記事確認':'記事一覧の取得'; activeTag=tag; if(!fromReader)lists++;
      if(tag)await env.DB.batch(statItems(env,tag,'checks'));
      const data=fromReader?{notes:readerNotes}:await api(env,'/api/v3/hashtags/'+encodeURIComponent(tag)+'/notes?order=new&page=1');
      if (!Array.isArray(data.notes)) throw new Trouble('記事一覧の形式を確認できません','response');
      if(!fromReader)await auxiliary16917(env,token,'seed',()=>checkingSend,()=>saveSeed1697(env,data.notes,tag,ownIds,cursor));
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
        if(note&&(note.status!=='published'||typeof note.is_liked!=='boolean')){bump('no_candidates');continue;}
        if(fromReader && note && (!publicFiction1697(note)||author!==listedAuthor||note.user?.urlname!==notes.get(key)?.user?.urlname)){bump('no_candidates');continue;}
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
          sql(env,'INSERT INTO nh_v14_authors (slot,author,last_at,token) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM nh_shared WHERE key=? AND token=?) ON CONFLICT(slot,author) DO UPDATE SET last_at=excluded.last_at,token=excluded.token',slot,author,now,token,key,token),
          ...(fromReader?[sql(env,'UPDATE nh_v1697_discovery SET reader_pending=? WHERE slot=? AND EXISTS(SELECT 1 FROM nh_control WHERE id=1 AND token=? AND inflight=?)',key,slot,token,key)]:[])
        ]);
        if (!reserved[0].meta.changes || !reserved[1].meta.changes || !reserved[3].meta.changes) { bump('reserved'); continue; }
        checkingSend=true;
        await auxiliaryWrites16917(env,'contact',()=>learningReserve16913(env,key,note,learningSource16913(tag,env.TRACE?.readerOrigin),token));
        // A diagnostic/learning write may have awaited D1. Check the lease and
        // stop/server hold once more immediately before the actual POST.
        if(!await liveDiscovery1697(env,token))throw new Trouble('停止・待機・処理期限のため送信を保留。再送せず確認します');
        stage='スキ送信';
        await api(env,'/api/v3/notes/'+key+'/likes',true,referer);
        stage='送信後の確認';
        if (!likeState16928(await article(env,key))) throw new Trouble('送信結果は未確認。再送せず次回に確認します');
        await env.DB.batch([
          sql(env,"UPDATE nh_seen SET status='liked' WHERE key=?",key),
          sql(env,"UPDATE nh_control SET inflight='',total=total+1 WHERE id=1 AND token=?",token),
          sql(env,'INSERT OR IGNORE INTO nh_v13_success VALUES (?,?,?,?)',slot,key,day(),Date.now()),
          ...(fromReader?[sql(env,"UPDATE nh_v1697_discovery SET readers=readers+1,reader_pending='',message='読者経由の記事へのスキ確認済み' WHERE slot=?",slot)]:[])
        ]);
        await auxiliaryWrites16917(env,'confirmed',()=>learningConfirmed16913(env,key,true));
        bump('sent');if(fromReader)bump('reader_sent');
        await finish('スキ確認済み：'+key+(fromReader?'（文芸・自分の作品の読者経由）':'（#'+tag+'）')+'／詳細確認 '+details+'記事',true);
        return true;
      }
      if (limited) break;
      bump('no_candidates');
      if(fromReader){activeTag=null;bump('reader_fallback');continue;}
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
    const wait=Math.max(retryRead ? (settings?.interval_seconds*1000 || INTERVAL) : 2*HOUR,serverWait);
    const message=(retryRead ? '今回の巡回を見送りました。次回に自動再試行：' : '自動再確認待ち：')+stage+'／'+failure(error)+
      (!(error instanceof Trouble)?'（RUN17/'+auxReason16917(error)+'）':'');
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
  const discovery=await sql(original,'SELECT d.slot,d.comments,d.readers,d.message,d.due,d.used,d.utc_day,COALESCE(a.due,0) aux_due,(SELECT COUNT(*) FROM nh_v1699_readers q WHERE q.slot=d.slot AND q.expires>?) queued FROM nh_v1697_discovery d LEFT JOIN nh_v16917_aux a ON a.slot=d.slot ORDER BY d.slot',Date.now()).all();
  blocks.push('【追加の自動巡回】感想コメントへのスキ／創作記事に反応した読者の記事探索\n'+discovery.results.map(r=>
    'アカウント '+r.slot+'：コメントのスキ確認 '+r.comments+'件／読者経由の記事スキ確認 '+r.readers+'件／保存した読者候補 '+r.queued+'人\n'+discoveryStatus16919(r,schedule.states.find(s=>s.slot===r.slot),Date.now())).join('\n\n')+
    '\n記事スキとコメントスキの送信枠・同じ人への待機は共通です。記事の累計にはコメント分を含めません。画面確認待ちは送信成功ではありません。読者からの訪問・読了・通知到達は未計測です。');
  const outreach=await sql(original,'SELECT slot,qa,members,pending,member_blocked,qa_message,member_message FROM nh_v16910_state ORDER BY slot').all();
  blocks.push('【質問箱の回答へのスキ・0円メンバーシップ】\n'+outreach.results.map(r=>
    'アカウント '+r.slot+'：回答スキの確認 '+r.qa+'件／0円参加の確認 '+r.members+'件\n質問箱：'+r.qa_message+'\n0円参加：'+r.member_message+(r.pending?'\n前回の操作結果を確認中・自動再送なし':'')).join('\n\n')+
    '\n回答スキは両アカウント、メンバーシップは520だけが対象です。通常会費0円・新しいフォローなしを確認できる場合だけ参加します。初月無料は対象外です。参加は1日1回まで。追加探索は感想・読者探索と共通の各12回/UTC日、30分以上の間隔です。\n520の作品管理で自動公開等を休止すると、新規の0円参加と掲示板スキも休止します。参加数はアクセス数ではありません。');
  const boards=await sql(original,`SELECT b.*,(SELECT due FROM nh_v16912_boards q WHERE q.slot=b.slot ORDER BY due,owner LIMIT 1) AS due FROM nh_v16912_state b ORDER BY b.slot`).all();
  blocks.push('【参加済み0円メンバーシップの掲示板スキ】\n'+boards.results.map(r=>
    'アカウント '+r.slot+'：スキの確認 '+r.sent+'件\n'+r.message+'\n最終探索：'+time(r.checked)+'\n参加先の次の確認：'+(r.due==null?'0円参加の確認待ち':r.due>Date.now()?time(r.due)+'以降':'次の掲示板探索枠')).join('\n\n')+
    '\n520の枠が対象です。スキ回りと520の作品管理がONの間、参加を確認できた0円プランの運営者の投稿を探します。同じ作者への待機には参加操作も含みます。無料参加・掲示板・スキ状態を確認できないときは保留します。成功数は再読み込みでスキを確認した分です。訪問数や通知到達は未計測です。');
  blocks.push(await diagnosticRecord16915(original));
  blocks.push(await learningRecord16913(original,settings));
  const [tg,stats,metrics,audit] = summary;
  const telegram=tg.results[0];
  const warnings=[];
  if (!original.SCHEDULER) warnings.push('SCHEDULERが未設定です。実行予約を作成できません。');
  if (!original.COOKIE_ENCRYPTION_KEY || !/^[a-f0-9]{64}$/i.test(original.COOKIE_ENCRYPTION_KEY.trim())) warnings.push('Cookie暗号化キーの形式を確認してください。');
  if (schedule.active.length && schedule.runtime.heartbeat && Date.now()-schedule.runtime.heartbeat>10*60000) warnings.push('予約処理の記録が10分以上更新されていません。Cloudflareのデプロイ・設定・ログを確認してください。');
  if (!schedule.runtime.heartbeat) warnings.push('v15の予約処理はまだ記録されていません。状態確認後、数分たってから再確認してください。');
  blocks.push('【動作設定】\nタグ：'+settings.tags.length+'個\n各アカウント：'+settings.interval_seconds+'秒以上の間隔\n同じ作者：2垢共通で'+settings.author_hours+'時間\n2垢ON時の処理開始間隔：'+settings.interval_seconds/2+'秒以上\n探索上限：'+settings.scan_tags+'タグ・記事詳細'+settings.scan_notes+'件\n候補なしのタグ：'+settings.empty_minutes+'分待ち\n予約処理の最終確認：'+time(schedule.runtime.heartbeat)+'\n次の予約予定：'+time(schedule.runtime.alarm_at)+(warnings.length?'\n\n【確認事項】\n'+warnings.join('\n'):''));
  blocks.push('Telegram通知：' + (original.TELEGRAM_BOT_TOKEN && telegram.paired ? '連携済み' : '未設定') + '\n' + telegram.message + '\n最終通知成功：' + time(telegram.last_sent)+'\n通知対象はログイン・アクセス拒否・暗号化設定の問題。429の回数制限は通知せず休止します。');
  blocks.push(await auxRecord16917(original));
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
    if (url.pathname === '/test' || url.pathname === '/test/') return productionTestRoute16920(request,original);
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
  constructor(ctx, env) {
    this.ctx=ctx;this.busy=false;
    const browser=coordinatedBrowser16916(env.BROWSER,ctx.storage,()=>!!this.desk?.ready&&this.desk.publicationPriority16916(Date.now()));
    this.env=new Proxy(env,{get:(target,key,receiver)=>key==='BROWSER'?browser:Reflect.get(target,key,receiver)});
  }
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
        await this.startDeskTick16916();
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
      this.desk ||= new Desk520(this.ctx.storage,this.env);
      try {
        this.desk.init();
        if(this.desk.duePublication(Date.now()))await this.desk.task520('予約作品の公開',()=>this.desk.dispatch(Date.now(),true));
      } catch { console.error('note-helper: publication preparation deferred'); }
      const schedule = await schedulerState(this.env);
      const due = schedule.active.find(s=>s.eligible<=Date.now());
      if (due) {
        await sql(this.env,'UPDATE nh_v15_runtime SET last_slot=?,last_at=? WHERE id=1',due.slot,Date.now()).run();
        try { await run({...this.env,NETWORK16922:this.desk?.ready?this.desk.networkBridge16922():null,MEMBER_GATE16910:()=>{
          this.desk ||= new Desk520(this.ctx.storage,this.env);this.desk.init();
          return !!this.desk.one('SELECT 1 FROM desk_cfg c JOIN desk_delivery d ON d.id=c.id WHERE c.id=1 AND c.enabled=1 AND d.enabled=1 AND c.blocked<=?',Date.now());
        }},due.slot); }
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
      try {
        const publicationAt=this.desk.publicationAlarm16915(Date.now());
        if(publicationAt)next=Math.min(next,publicationAt);
      } catch { console.error('note-helper: publication alarm deferred'); }
      try {const testAt=this.desk?.productionTestAlarm16920();if(testAt)next=Math.min(next,testAt);}
      catch {console.error("note-helper: production test schedule deferred");}
      await this.ctx.storage.setAlarm(next);
      await sql(this.env,'UPDATE nh_v15_runtime SET alarm_at=? WHERE id=1',next).run();
      // A durable-object background task survives a closed management page.
      // Do not delay the ordinary alarm while the optional browser work runs.
      if(typeof this.ctx.waitUntil==='function') {
        try {
          if(this.desk.productionTestActive16920()){
            // Use a separate alarm invocation from an ordinary account run so
            // its request budget is not combined with the production probe.
            if(!due)await this.desk.pumpProductionTest16920();
          }else this.ctx.waitUntil(this.startDeskTick16916(true).catch(()=>{}));
        }
        catch {console.error('note-helper: desk fallback deferred');}
      }
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
  if (Number(res.headers.get('content-length'))>limit) {
    await res.body?.cancel().catch(()=>{});
    throw new Input520('データが大きすぎます。');
  }
  const reader=res.body?.getReader();
  if (!reader) throw new Input520('データが空です。');
  const decoder=new TextDecoder('utf-8',{fatal:true});
  let size=0, result='';
  try {
    for (;;) {
      const {value,done}=await reader.read();
      if (done) break;
      size+=value.byteLength;
      if (size>limit) throw new Input520('1回の登録量を減らしてください。');
      result+=decoder.decode(value,{stream:true});
    }
    return result+decoder.decode();
  } catch(error) {
    await reader.cancel().catch(()=>{});
    throw error;
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
async function inNoteBrowser(binding,cookie,allowEditor,action,requestTrace=null){
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
      if(requestTrace && data.method==='Network.requestWillBeSent' && ['Document','XHR','Fetch'].includes(data.params?.type) && /^https:\/\/(?:editor\.)?note\.com\//.test(data.params?.request?.url||''))requestTrace.calls++;
      if(data.method!=='Network.responseReceived')return;
      const {type,response}=data.params;
      if(!['Document','XHR','Fetch'].includes(type) || !/^https:\/\/(?:editor\.)?note\.com\//.test(response.url))return;
      const raw=Object.entries(response.headers||{}).find(([k])=>k.toLowerCase()==='retry-after')?.[1];
      if(raw!==undefined)retry=Math.max(retry,retryDelay16929(raw));
      if([401,403,429].includes(response.status) || (allowEditor && response.status>=500))denied=response.status;
    });
    const command=pageCommand(socket);
    const evaluate=async expression=>{
      const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
      if(r.exceptionDetails)throw Error('settings page');
      return r.result.value;
    };
    const blocked=()=>denied || retry>0;
    const blockedResult=()=>({code:denied,message:denied?'note応答 HTTP '+denied+'・操作結果は未確認':'note指定の待機・操作結果は未確認',hold:Math.max(denied===429?2*HOUR:0,retry)});
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
  } catch(error) {
    const deferred=browserDeferred16916(error);if(deferred)return deferred;
    return denied || retry>0?{code:denied,message:'note側で待機・操作結果は未確認',hold:Math.max(2*HOUR,retry)}:{message:stage+'を完了できず・再確認待ち'};
  } finally {
    try {socket?.close();} catch {}
    if(session?.sessionId)await boundedClose16916(()=>binding.closeSession(session.sessionId)).catch(()=>{});
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
    const form = step => evaluate('('+BROWSER_SOURCES520.articleReactionForm+')('+JSON.stringify(step)+','+JSON.stringify(titles)+')');
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
      let draft, metadata, url=page;
      const readMetadata=key=>evaluate('('+BROWSER_SOURCES520.readDraftCover+')('+JSON.stringify(key)+','+JSON.stringify(accountId)+',('+BROWSER_SOURCES520.draftBodyHash+'))');
      if(job.key){
        if(!/^n[a-z0-9]{1,64}$/.test(job.key))return {message:'登録された下書きIDを確認できず・公開保留'};
        const listed=await frame('findDraft',{...arg,byLink:true});
        if(['reserved','ambiguous'].includes(listed?.state))return {message:'予約・公開済みまたは同名の候補あり・公開保留'};
        metadata=await readMetadata(job.key);
        if(blocked())return blockedResult();
        if(metadata?.unsafe)return {message:'公開済み・予約済みまたは所有者の不一致を確認・公開保留'};
        if(!metadata || !text520(metadata.name,300) || !/^[0-9a-f]{64}$/.test(metadata.hash||''))
          return {message:'登録した下書きの本人・保存済み本文を確認できず・公開保留'};
        draft={key:job.key,url:'https://editor.note.com/notes/'+job.key+'/edit/'};
      }
      const visited=new Set();
      for(let i=0;!job.key && i<4 && url && !visited.has(url);i++){
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
      metadata ||= await readMetadata(draft.key);
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
    this.initObservation1698();
    this.initPipeline16913();
    this.initTraffic16913();
    this.initPublication16914();
    this.initRuntime16916();
    this.initDistribution16918();
    this.initProductionTest16920();
    this.networkTry16922(()=>{this.initNetwork16922();this.initRepeat16923();this.initContest16923();});
    this.ready=true;
  }
  async admin(req,ctx) {
    try {
      const input=await req.json();
      this.init();
      const now=Date.now();
      let correctionMessage='';
      switch(input.action) {
        case 'production_test_start':
          need520(SLOTS.includes(input.slot),'アカウントを選んでください。');
          this.startProductionTest16920(input.slot);
          await this.wakeProductionTest16920();
          if(typeof ctx?.waitUntil==='function')ctx.waitUntil(this.pumpProductionTest16920().catch(()=>{}));
          return deskJson(this.productionTestView16920());
        case 'production_test_status':
          await this.wakeProductionTest16920();
          if(typeof ctx?.waitUntil==='function')ctx.waitUntil(this.pumpProductionTest16920().catch(()=>{}));
          return deskJson(this.productionTestView16920());
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
      works:this.rows('SELECT w.seq,w.title,w.d,w.t,w.locked,w.genre,w.chars,w.suggested,w.key AS draft,w.paused,w.link_at,w.article,w.pub,c.article AS attemptedArticle,c.result AS coverResult,p.confirmed,j.phase AS jobPhase,j.message AS jobMessage,m.url magurl,m.name AS magazine FROM desk_work_schedule w LEFT JOIN desk_work_cover c ON c.seq=w.seq LEFT JOIN desk_snapshot p ON p.article=c.article LEFT JOIN desk_job j ON j.kind=\'publish\' AND j.subject=CAST(w.seq AS TEXT) LEFT JOIN desk_mag m ON m.url=w.magazine ORDER BY w.seq')};
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
    return {cfg,backlist,rssIntelligence:this.rssView16926(),repeat:this.repeatView16923(),contests:this.contestView16923(),audience:this.networkView16922(),runtime:this.runtimeView16916(),pipeline:this.pipelineView16913(),traffic:this.trafficView16913(),observation:this.observationView1698(),join:this.joinView520(),shelf:this.shelfView520(),popular:this.one('SELECT message,checked FROM desk_popular WHERE id=1'),magazineProgress,magazineProgressText:magazineProgressText520(magazineProgress),taskFailures:this.taskHealthRows16928(),reactions:this.one('SELECT confirmed,desired,checked,message FROM desk_reactions WHERE id=1'),scout:{total:this.one('SELECT COUNT(*) n FROM desk_import').n,allowed:eligible.length,used:scoutBudget.day===jstDay(now)?scoutBudget.used:0,message:this.one('SELECT message FROM desk_scout_state WHERE id=1').message},linkPlans:schedules.linkPlans,deliveryOn:this.one('SELECT enabled FROM desk_delivery WHERE id=1').enabled,delivery:this.rows('SELECT kind,label,phase,at,message FROM desk_job ORDER BY at DESC LIMIT 24'),recommendation:this.one('SELECT checked,message FROM desk_recommend WHERE id=1'),archive:this.archivePage(offset,Date.now()),growth:this.growthView(),directory:this.one('SELECT message FROM desk_directory WHERE id=1'),
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
      const delay=retryDelay16929(raw,now);
      if(res.status===429 || delay>0) {
        const hold=now+(delay||HOUR);
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
      if(!evidence.ok && this.joinProof520(link.id,now) && await this.joinFeeProof16911(api.value,page.value||'',this.joinTarget520(link.id)))
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
      this.rows("UPDATE desk_job SET phase='confirmed',at=?,message='誌面のRSSで掲載を確認済み' WHERE kind='mag' AND article=? AND target=? AND phase IN ('sent','seen')",now,key,link.id);
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
    this.rows(`INSERT INTO desk_archive(article,title,pub) VALUES(?,?,?) ON CONFLICT(article) DO UPDATE SET
      title=excluded.title,pick_due=CASE WHEN title<>excluded.title THEN 0 ELSE pick_due END`,key,title,pub);
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
      if(n?.user?.urlname!=='43__' || n.key!==a.article || !text520(n.name,300) || n.name.trim()==='521' || (n.status && n.status!=='published'))throw Error('not verified');
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
      this.rows(`UPDATE desk_archive SET title=?,pick_due=0,due=?,verified=?,genre=?,chars=?,previous=CASE WHEN ? IS NOT NULL THEN likes ELSE previous END,
        prior_at=CASE WHEN ? IS NOT NULL THEN at ELSE prior_at END,likes=COALESCE(?,likes),at=CASE WHEN ? IS NULL THEN at ELSE ? END,state=? WHERE article=?`,
        n.name,now+(value===null?D520:7*D520),now,genre,chars,value,value,value,value,now,value===null?'スキ数取得待ち':'取得済み',a.article);
    }catch(error){
      if(error instanceof PublicReadError && /HTTP (404|410)$/.test(error.message)) this.rows('DELETE FROM desk_reaction_work WHERE article=?',a.article);
      this.rows("UPDATE desk_archive SET due=?,state='詳細取得待ち',verified=0 WHERE article=?",now+D520,a.article);
    }
  }
  archiveFits(article,magazines,now) {
    if(!article.verified || article.verified<now-8*D520)return [];
    const genre=article.work_genre??article.genre,chars=article.work_chars??article.chars;
    return magazines.filter(({p})=>
      validPolicy16928(p) && (genre?p.genres.includes(genre):genre520.every(g=>p.genres.includes(g))) &&
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
      const fits=this.placementCandidates16918(row,mags,now);
      const genre=row.work_genre||row.genre;
      const pick=this.chooseMagazine520(fits,genre,now,row);
      this.rows('UPDATE desk_archive SET pick_due=?,pick_rev=?,choice=? WHERE article=?',now+(pick?D520:HOUR),rev,pick?.url??null,article);
    }
  }
  archivePage(offset,now) {
    const magazines=this.eligibleMags(now);
    const rows=this.rows(`SELECT a.*,w.genre work_genre,w.method,w.chars work_chars FROM desk_archive a
      LEFT JOIN desk_work w ON w.article=a.article ORDER BY a.pub DESC,a.article LIMIT 31 OFFSET ?`,offset);
    const more=rows.length===31;
    const items=rows.slice(0,30).map(a=>{
      const seen=this.rows('SELECT name,observed FROM desk_ref WHERE article=? ORDER BY observed',a.article);
      const choice=this.placementCandidates16918(a,magazines,now).find(m=>m.url===a.choice);
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
      .flatMap(m=>{try{const p=JSON.parse(m.policy);return validPolicy16928(p)?[{...m,p}]:[];}catch{return [];}}).sort((a,b)=>a.p.genres.length-b.p.genres.length ||
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
      const picked=this.chooseMagazine520(valid,w.genre,now,w);
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
    const {key,conflict}=this.publicationTarget16914(row);
    return {kind:'publish',subject:String(row.seq),key,target:key,title:row.title,body:row.body,scheduled:row.scheduled,conflict};
  }
  canDeliver(job,now){
    const cfg=this.one('SELECT enabled,blocked FROM desk_cfg WHERE id=1');
    if(!cfg.enabled || cfg.blocked>now || !this.one('SELECT enabled FROM desk_delivery WHERE id=1').enabled)return false;
    const fresh=job.kind==='mag'?this.eligiblePlacement(job.key,now,job.target):job.link?this.dueLink(now,job.key):this.dueManuscript(now,job.subject);
    return !!fresh && !fresh.conflict && fresh.subject===job.subject && fresh.target===job.target && fresh.title===job.title && (job.kind!=='publish' || job.scheduled===fresh.scheduled);
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
    const plain=plainDraft16914(n.body);
    if(plain!==null && plain===matches[0].body.replace(/\r\n?/g,'\n'))this.rows('INSERT OR IGNORE INTO desk_draft_identity(seq,article) VALUES(?,?)',matches[0].seq,key);
  }
  async lookupDraftTitle(now,key=null){
    if(this.publicationPriority16916(now))return;
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
    let slot,base,lease;
    try{
      const a=await this.deliveryAccount();
      if(!a || a.until>Date.now() || this.publicationPriority16916(Date.now()))return;
      slot=a.slot;base=scoped(this.env,slot);
      lease=await acquire(base,false);if(!lease)return;
      const env=await loadCookie(base,a.id);
      if(await account(env)!==a.id)return;
      for(const p of pending){
        const gate=await sql(env,'SELECT token,lease FROM nh_control WHERE id=1').first();
        if(gate?.token!==lease || gate.lease<=Date.now() || this.publicationPriority16916(Date.now()))break;
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
    }finally{if(lease)await release(base,lease);}
  }
  async resolveDraftDirectory(now){
    if(browserWait16916(this.env.BROWSER))return;
    if(typeof this.env.BROWSER?.acquire!=='function')return;
    const cfg=this.one('SELECT enabled,blocked FROM desk_cfg WHERE id=1');
    if(!cfg.enabled || cfg.blocked>now || this.one('SELECT due FROM desk_draft_directory WHERE id=1').due>now)return;
    const works=this.rows("SELECT seq,title,'' AS key FROM desk_work_schedule WHERE pub IS NULL AND key IS NULL AND d>=? ORDER BY d,seq LIMIT 40",jstDay(now));
    const links=this.rows("SELECT article AS key,1 AS byLink FROM desk_link_plan WHERE pub IS NULL AND title IS NULL AND scheduled>? ORDER BY scheduled LIMIT 40",now);
    if(!works.length && !links.length)return;
    this.rows('UPDATE desk_draft_directory SET due=? WHERE id=1',now+4*M520);
    const a=await this.deliveryAccount().catch(()=>null);
    if(!a || a.until>now)return;
    const base=scoped(this.env,a.slot),lease=await acquire(base,false);
    if(!lease)return;
    try {
    const env=await loadCookie(base,a.id);
    if(this.publicationPriority16916(Date.now()))return;
    this.rows('UPDATE desk_draft_directory SET due=? WHERE id=1',now+HOUR);
    const result=await inspectDraftDirectory(this.env.BROWSER,cleanCookie(env.NOTE_SESSION),a.id,[...works,...links]);
    if(result.browserDeferred)this.rows('UPDATE desk_draft_directory SET due=? WHERE id=1',Math.max(Date.now()+M520,result.retryAt));
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
    }finally{await release(base,lease);}
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
  async dispatchUnlocked16915(now,publicationOnly=false,probe=null){
    const cfg=this.one('SELECT enabled,blocked FROM desk_cfg WHERE id=1');
    const state=this.one('SELECT * FROM desk_delivery WHERE id=1');
    if(!cfg.enabled || !state.enabled || cfg.blocked>now || (!probe && state.due>now) || typeof this.env?.BROWSER?.acquire!=='function')return;
    if(probe && this.publicationPriority16916(now))return;
    const day=Math.floor(now/D520);
    if(state.utc_day!==day){this.rows('UPDATE desk_delivery SET utc_day=?,pubs=0,mags=0 WHERE id=1',day);state.pubs=0;state.mags=0;}
    let job=!probe && state.pubs<4?this.duePublication(now):null;
    if(job && this.one("SELECT 1 FROM desk_job WHERE kind='publish' AND subject=? AND (phase<>'wait' OR next>?)",job.subject,now))job=null;
    if(!job && !publicationOnly && state.mags<DISTRIBUTION16918.placements)job=this.nextPlacement(now,!!state.old_first);
    if(!job)return;
    const browser=browserPurpose16916(this.env.BROWSER,job.kind==='publish'?'publish':'normal');
    const waiting=browserWait16916(browser,job.kind==='publish'?'publish':'normal');
    if(waiting)return;
    probe?.capture?.({article:job.key,id:job.target,name:job.name,title:job.title,fresh:true});
    const label=job.kind==='publish'?job.title:job.title+' → '+job.name;
    this.rows("INSERT INTO desk_job(kind,subject,target,label,at,next,article,message) VALUES(?,?,?,?,?,?,?,'本人と条件を照合中') ON CONFLICT(kind,subject) DO UPDATE SET target=excluded.target,label=excluded.label,at=excluded.at,next=excluded.next,message=excluded.message WHERE phase='wait'",job.kind,job.subject,job.target,label,now,now+15*M520,job.kind==='mag'?job.key:'');
    this.rows('UPDATE desk_delivery SET due=? WHERE id=1',now+M520);
    let message='通信を確認待ち',slot,lease,env,attemptAt=0,retry=job.kind==='mag'?D520:M520;
    try{
      if(job.conflict){message=job.conflict;return;}
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
        if(!owner || owner==='43__' || (!editorialProof162(noteLink161(job.url),info.value,html).ok && !(this.joinProof520(job.target,Date.now()) && await this.joinFeeProof16911(info.value,html,this.joinTarget520(job.target))))){
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
      const result=await browserDelivery(browser,account.id,cookie,job,async (key,info)=>{
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
          const currentDay=Math.floor(at/D520),usage=this.one('SELECT utc_day,pubs,mags FROM desk_delivery WHERE id=1');
          if(usage.utc_day===currentDay && (job.kind==='publish'?usage.pubs>=4:usage.mags>=DISTRIBUTION16918.placements))return false;
          const marked=this.one("UPDATE desk_job SET phase='sent',target=?,at=?,message='操作開始を記録・結果は未確認（自動再送なし）' WHERE kind=? AND subject=? AND phase='wait' RETURNING subject",job.kind==='publish'?key:job.target,at,job.kind,job.subject);
          if(!marked)return false;
          if(usage.utc_day!==currentDay)this.rows('UPDATE desk_delivery SET utc_day=?,pubs=0,mags=0 WHERE id=1',currentDay);
          if(job.kind==='mag')this.rows('UPDATE desk_delivery SET mags=mags+1,old_first=? WHERE id=1',+!job.old);
          else this.rows('UPDATE desk_delivery SET pubs=pubs+1 WHERE id=1');
          attemptAt=at;
          if(job.kind==='mag'){
            this.rows('UPDATE desk_distribution16918 SET mag_next=? WHERE id=1',at+DISTRIBUTION16918.placementGap);
            this.rows('UPDATE desk_archive SET mag_at=?,mag_due=?,pick_due=0 WHERE article=?',at,at+DISTRIBUTION16918.workGap,job.key);
            this.rows('INSERT OR IGNORE INTO desk_mag_send(article,id,at,day) VALUES(?,?,?,?)',job.key,job.target,at,jstDay(at));
            this.rows('INSERT INTO desk_mag_verify16913(article,id,started,due) VALUES(?,?,?,?) ON CONFLICT(article,id) DO NOTHING',job.key,job.target,at,at+4*M520);
          }
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
      if(result.browserDeferred)retry=Math.max(M520,result.retryAt-Date.now());
      if(result.notClicked && attemptAt)this.storage.transactionSync(()=>{
        const undone=this.one("UPDATE desk_job SET phase='wait',message=? WHERE kind=? AND subject=? AND phase='sent' AND at=? RETURNING target",message,job.kind,job.subject,attemptAt);
        if(undone){
          const field=job.kind==='publish'?'pubs':'mags';
          this.rows('UPDATE desk_delivery SET '+field+'=MAX(0,'+field+'-1) WHERE id=1 AND utc_day=?',Math.floor(attemptAt/D520));
        }
        if(undone && job.kind==='mag'){
          this.rows('UPDATE desk_archive SET mag_at=?,mag_due=? WHERE article=? AND mag_at=?',job.previousMagAt,job.previousMagDue,job.key,attemptAt);
          this.rows('DELETE FROM desk_mag_send WHERE article=? AND id=? AND at=?',job.key,job.target,attemptAt);
          this.rows('DELETE FROM desk_mag_verify16913 WHERE article=? AND id=? AND started=?',job.key,job.target,attemptAt);
        }
        if(undone && job.kind==='publish'){
          this.rows('DELETE FROM desk_snapshot WHERE article=? AND confirmed IS NULL',undone.target);
          if(job.link)this.rows('UPDATE desk_link_plan SET cover=NULL,check_at=NULL,result=? WHERE article=? AND pub IS NULL',message,undone.target);
          else this.rows('DELETE FROM desk_work_cover WHERE article=? AND seq=?',undone.target,Number(job.subject));
        }
      });
      if(result.seen){
        this.rows("UPDATE desk_job SET phase='seen',message=?,at=? WHERE kind=? AND subject=? AND (phase='wait' OR (phase='sent' AND at=?))",message,Date.now(),job.kind,job.subject,attemptAt);
        if(job.kind==='mag')this.rows('INSERT OR IGNORE INTO desk_mag_verify16913(article,id,started,due) VALUES(?,?,?,?)',job.key,job.target,Date.now(),Date.now()+4*M520);
      }
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
      try{
      this.rows("UPDATE desk_job SET message=?,next=?,at=? WHERE kind=? AND subject=? AND phase='wait'",message,Date.now()+retry,Date.now(),job.kind,job.subject);
      if(job.kind==='mag')this.rows("UPDATE desk_archive SET mag_due=MAX(mag_due,?) WHERE article=? AND EXISTS(SELECT 1 FROM desk_job WHERE kind='mag' AND subject=? AND phase='wait')",Date.now()+5*M520,job.key,job.subject);
      }finally{if(lease)await release(env,lease);}
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
    if(browserWait16916(this.env.BROWSER))return;
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
      try{this.rows('UPDATE desk_reactions SET message=?,due=? WHERE id=1',message,due);}
      finally{if(token)await release(env,token);}
    }
  }
  async ensureRecommendation(now) {
    if(browserWait16916(this.env.BROWSER))return;
    const state=this.one('SELECT * FROM desk_recommend WHERE id=1');
    if(state.due>now || (state.done && state.checked>now-7*D520))return;
    const cfg=this.one('SELECT enabled,blocked FROM desk_cfg WHERE id=1');
    if(!cfg.enabled || cfg.blocked>now || !this.one('SELECT enabled FROM desk_delivery WHERE id=1').enabled)return;
    if(!this.one('SELECT enabled FROM desk_delivery WHERE id=1').enabled)return;
    if(this.one('SELECT 1 FROM desk_link_plan WHERE pub IS NULL AND scheduled BETWEEN ? AND ? LIMIT 1',now-5*M520,now+6*M520) || this.one('SELECT 1 FROM desk_work_schedule WHERE pub IS NULL AND paused=0 AND scheduled BETWEEN ? AND ? LIMIT 1',now-5*M520,now+6*M520))return;
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
        if(!this.deliveryActive520())return false;
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
      try{this.rows('UPDATE desk_recommend SET done=?,due=?,message=?,checked=? WHERE id=1',done,due,message,Date.now());}
      finally{if(recommendLease)await release(recommendEnv,recommendLease);}
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
  taskHealth16928(name,failed,message=''){
    const at=Date.now();
    try{
      if(failed)this.rows('INSERT INTO desk_task_health(task,at,failed,message) VALUES(?,?,1,?) ON CONFLICT(task) DO UPDATE SET at=excluded.at,failed=1,message=excluded.message',name,at,message);
      else this.rows("UPDATE desk_task_health SET failed=0,at=?,message='' WHERE task=? AND failed<>0",at,name);
      this.taskHealthMemory16928?.delete(name);
    }catch{
      const first=!this.taskHealthMemory16928?.size;
      this.taskHealthMemory16928 ||= new Map();
      this.taskHealthMemory16928.set(name,{task:name,at,message:(failed?message+'／':'')+'状態記録の保存を再確認待ち'});
      if(this.taskHealthMemory16928.size>32)this.taskHealthMemory16928.delete(this.taskHealthMemory16928.keys().next().value);
      if(first)console.warn('note-helper: task status persistence deferred');
    }
  }
  taskHealthRows16928(){
    let rows=[];
    try{rows=this.rows("SELECT task,at,message FROM desk_task_health WHERE failed=1 AND task<>'520の作品棚' ORDER BY at DESC");}
    catch{rows=[{task:'状態記録',at:Date.now(),message:'状態記録の読み取りを再確認待ち'}];}
    return [...new Map([...rows,...(this.taskHealthMemory16928?.values()||[])].map(r=>[r.task,r])).values()].sort((a,b)=>b.at-a.at);
  }
  async task520(name, work) {
    let result;
    try {result=await work();}
    catch(error) {
      const message=readLimit(error)?'D1の読み取り枠更新待ち':error instanceof PublicReadError?publicReadReason(error):'読み取り・保存・接続の途中で失敗しました。次回に再確認します';
      this.taskHealth16928(name,true,message);
      return null;
    }
    this.taskHealth16928(name,false);
    return result;
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
    if(!publication)await task('企画への自動応募',()=>this.contestTick16923(Date.now()));
    if(!publication)await task('作品と読者の比較情報',()=>this.networkTick16922(Date.now()));
    await task('RSSと既刊の照合',()=>this.rssMatchTick16926(Date.now()));
    await task('誌面の時間帯観測',()=>this.rssSampleTick16926(Date.now()));
    await task('文芸誌の探索',()=>this.scoutLiterary(Date.now()));
    if(!publication)await task('参加先の募集確認',()=>this.expandJoin520(Date.now()));
    if(!publication)await task('Tutaの招待確認',()=>this.tutaTick520(Date.now()));
    if(!publication)await task('参加申請・招待の承認',()=>this.joinTick520(Date.now()));
    if(!publication)await task('参加後の掲載準備',()=>this.handoffJoined16913(Date.now()));
    await task('共同誌の追加結果',()=>this.verifyPlacement16913(Date.now()));
    if(!publication)await task('人気記事の入口',()=>this.popularTick520(Date.now()));
    if(!publication)await task('スキのお礼設定',()=>this.syncReactions(Date.now()));
    if(!publication)await task('キーワード一覧の観測',()=>this.observeEntrances1698(Date.now()));
    if(!publication)await task('noteのアクセス状況',()=>this.trafficTick16913(Date.now()));
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
function validPolicy16928(p){
  return !!p&&Number.isSafeInteger(p.min)&&Number.isSafeInteger(p.max)&&p.min>=0&&p.max>=p.min&&p.max<=1000000&&
    Array.isArray(p.genres)&&p.genres.length>0&&p.genres.every(g=>genre520.includes(g))&&
    Array.isArray(p.methods)&&p.methods.length>0&&p.methods.every(m=>method520.includes(m));
}
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
function editorialProof162(link,payload,html,participationFree=false){
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
  const free=participationFree || h.free || d?.price===0 || d?.price==='0' || d?.isFree===true || d?.magazineType==='free';
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
  if(s.observation)lines.push(observationText1698(s));
  if(s.join)lines.push(joinRecord520(s.join));
  if(s.runtime){
    const r=s.runtime.tick,b=s.runtime.browser;
    lines.push('【自動処理の確認】',r.message,'最終開始 '+tm(r.started)+' ／ 最終巡回完了 '+tm(r.finished)+(r.fallback?' ／ 補助起動による確認':''));
    if(b)lines.push('ブラウザー：'+(b.hold_until>Date.now()?(BROWSER_WAIT16916[b.reason]||BROWSER_WAIT16916.startup)+' ／ '+tm(b.hold_until)+'以降':b.lease>Date.now()?'処理中':b.next_at>Date.now()?'起動間隔待ち ／ '+tm(b.next_at)+'以降':'起動待機なし')+' ／ 最終起動 '+tm(b.started));
  }
  if(s.audience)lines.push(networkRecord16922(s.audience));
  if(s.repeat)lines.push(repeatRecord16923(s.repeat));
  if(s.contests)lines.push(contestRecord16923(s.contests));
  lines.push(rssRecord16926(s.rssIntelligence));
  if(s.pipeline)lines.push(pipelineRecord16913(s.pipeline));
  if(s.traffic)lines.push(trafficRecord16913(s.traffic));
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
  if(s.scout)lines.push('掲載先探索 ／ 発見 '+s.scout.total+'誌 ／ 現在の掲載条件・編集権限を確認済み '+s.scout.allowed+'誌 ／ 本日探索を試みたページ '+s.scout.used+'か所（最大192） ／ '+s.scout.message);
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
      w.magazine?'次の掲載候補 '+w.magazine+' ／ 誌面での掲載は確認待ち':s.mags.length?'確認済みの条件で該当する誌なし':'条件を確認できた掲載先なし');
    if(w.jobMessage)lines.push('公開処理 ／ '+w.jobMessage);
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
    const state=p.confirmed||w?.confirmed?'noteで公開中を確認':published?(sent?'公開操作後に公開一覧で確認':'公開確認・ツールの公開操作記録なし'):sent?'公開操作済み・確認中':w?.locked?'note側で予約済み（本人登録）':Date.now()>p.scheduled+5*M520?'時間枠終了・保留':'公開予定';
    add(p.article,p.title||w?.title,p.scheduled,'',published,state,w?.coverResult||p.result||p.message||w?.jobMessage,!sent&&!published&&!w?.locked);
  }
  for(const w of works){
    if(included.has(w.seq))continue;
    const clock=w.t||w.suggested,at=clock?Date.parse(w.d+'T'+clock+':00+09:00'):null;
    const state=w.confirmed?'noteで公開中を確認':w.pub?(['sent','seen','confirmed'].includes(w.jobPhase)?'公開操作後に公開一覧で確認':'公開確認・ツールの公開操作記録なし'):w.paused?'予約取り消し済み':w.locked?'note予約済み（登録時の指定）':w.attemptedArticle?'公開操作済み・確認中':at&&at+5*M520<Date.now()?'時間枠終了・保留':'登録済み';
    const key=w.article||w.attemptedArticle||w.draft;
    add(key,w.title,at,w.d+' 時刻未定',!!w.pub,state,w.coverResult||w.jobMessage||(!key?'本人の下書き一覧からリンクを確認中':''),!!key&&!!at&&!w.pub&&!w.locked&&!w.attemptedArticle&&!w.paused);
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
    const where=w.seen.length?'誌面で掲載を確認：'+w.seen.map(x=>x.name).join('、')+(w.choice?' ／ 次の候補：'+w.choice+'（掲載未確認）':''):w.choice?'次の掲載候補：'+w.choice+'（掲載未確認）':w.waiting;
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
<p><a href="/tuta" style="display:block;padding:16px;background:#eef2ff;font-weight:bold">Tuta接続・招待メールの自動確認</a></p><a href="/">スキ回り・質問箱・0円参加の結果を確認</a><h1>520 作品管理</h1><p><a href="/test">今すぐ本番テスト</a></p><small>${VERSION}</small><p>43__ 専用・日本時間。公開確認と計測には公開情報を使います。</p>
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
<p>登録時刻から5分以内の定期起動で、520の下書きと完成稿が一致すれば公開します。時間を過ぎた稿は保留します。手動で公開した新作も計測します。条件と編集権限を確認できた共同誌には、新作と既刊を複数誌へ順番に追加します。「記録を開く」で結果が見られます。</p>
<details><summary>自動公開・共同誌・参加申請・0円参加・お礼更新を休止／再開</summary><button type="button" id="autopause">休止</button><button type="button" id="autoresume">再開</button></details>
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
<details><summary>旧版の作品棚の記録（自動作成・追加は廃止）</summary>
<pre id="shelfstatus">${esc(records?.shelf?shelfRecord520(records.shelf):'「記録を開く」で旧版の操作記録を確認できます。')}</pre>
<p>本人のマガジンの自動作成と作品追加は行いません。旧版の記録だけを表示します。記事内の誘導リンクや案内記事も追加しません。</p></details>
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
      const where=w.seen.length?'誌面で掲載を確認：'+w.seen.map(x=>x.name).join('、')+(w.choice?' ／ 次の候補：'+w.choice+'（掲載未確認）':''):w.choice?'次の掲載候補：'+w.choice+'（掲載未確認）':w.waiting;
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
// A participation-fee statement must come from the target owner's complete,
// linked recruitment article. Free-to-read articles are not fee evidence.
function recruitmentFee16911(n,html,target) {
  const unknown={free:false,paid:false};
  if(!target || n?.key!==target.article || n.user?.urlname!==target.owner || n.status!=='published' ||
     n.is_limited===true || n.isLimited===true || n.is_paid===true || n.isPaid===true || Number(n.price)>0 ||
     typeof n.body!=='string' || !n.body.trim() || n.body.length>250000)return unknown;
  const plain=words161(n.body).normalize('NFKC').replace(/\s+/g,'');
  if(!plain.includes(target.match) || !/共同(?:運営)?マガジン/.test(plain))return unknown;
  const page=noteLink161(meta161(html,'og:url'));
  const forward=anchors161(n.body).some(a=>{const u=noteLink161(a.href,target.rule);return u?.id===target.id && (!u.owner || u.owner===target.owner);});
  const back=page?.id===target.id && page.owner===target.owner && anchors161(html).some(a=>{const u=noteLink161(a.href,target.url,'article');return u?.id===target.article && u.owner===target.owner;});
  if(!forward && !back)return unknown;
  const clauses=words161(n.body.replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote\s*>/gi,''))
    .normalize('NFKC').split(/[。！!？?\n]+/).map(s=>s.replace(/\s+/g,'').replace(/^[・●○■※◆▶▷*-]+/,''));
  const fee='(?:参加費|入会費|入会金|年会費|月会費|会費|参加料金|利用料)';
  // An entry-fee waiver alone does not establish that participation is free.
  const positive=/^(?:(?:この|当)マガジンの)?(?:参加費|会費|参加料金|利用料金?)(?:は|:|が)?(?:完全)?(?:無料|0円)(?:です|となります)?$/;
  const cost=new RegExp(fee+'.{0,24}(?:[1-9][0-9,]*円|有料|別途|必要|発生|無料では(?:ない|ありません))');
  const conditional=/初月|初回|お試し|無料期間|期間限定|トライアル|キャンペーン|無料体験|無料招待|クーポン|割引|有料会員|有料プラン|有料メンバー|購入が必要|購入必須/;
  const paid=clauses.some(s=>cost.test(s)) || conditional.test(plain);
  return {free:!paid && clauses.some(s=>positive.test(s)),paid};
}
function joinFree520(data,html='',target=JOIN520,note=null) {
  if(!target)return false;
  const d=data?.data?.magazine??data?.data,canonical=noteLink161(meta161(html,'og:url'));
  // Explicit mismatches take precedence over a matching article or label.
  if(d?.key && d.key!==target.id || d?.owner?.urlname && d.owner.urlname!==target.owner ||
     canonical && (canonical.id!==target.id || canonical.owner && canonical.owner!==target.owner))return false;
  const identity=d?.key===target.id && d.owner?.urlname===target.owner || canonical?.id===target.id && canonical.owner===target.owner;
  if(!identity)return false;
  const h=magHeader162(html,{id:target.id}),fee=recruitmentFee16911(note,html,target);
  const matching=d?.key===target.id?d:null;
  const types=[matching?.magazineType,matching?.type];
  const paid=h.paid || matching?.isPaid===true || matching?.is_paid===true || Number(matching?.price)>0 ||
    types.some(v=>/^(paid|subscription|membership)$/i.test(v||'')) || fee.paid;
  const free=h.free || matching?.price===0 || matching?.price==='0' || matching?.isFree===true || matching?.is_free===true ||
    types.some(v=>v==='free') || fee.free;
  return !paid && free;
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
      return !blocked() && editorialProof162({id:target.id},data,'',joinFree520(data,job.feeHtml||'',target,job.feeNote)).ok;
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
      return {hash:await (${BROWSER_SOURCES520.draftBodyHash})(n.body),count:n.commentCount??n.comment_count};})()`),x=>x?.hash);
    if(blocked())return blockedResult();
    if(!fresh || fresh.hash!==job.hash)return {message:'募集記事が変更されたため申請を再確認待ち'};
    const arg={...target,count:fresh.count};
    // Comment composers below the article can be mounted only when scrolled into view.
    await evaluate('window.scrollTo(0,document.documentElement.scrollHeight)');
    const form=step=>evaluate('('+BROWSER_SOURCES520.noteJoinDOM520+')('+JSON.stringify(step)+','+JSON.stringify(arg)+')');
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
  async joinFeeProof16911(payload,html,target) {
    if(!target)return false;
    if(joinFree520(payload,html,target))return true;
    const n=(await this.publicRead('https://note.com/api/v3/notes/'+target.article,'json'))?.data;
    return joinFree520(payload,html,target,n);
  },
  async joinTickUnlocked16920(now,probe=null) {
    if(browserWait16916(this.env.BROWSER))return;
    const cfg=this.one('SELECT * FROM desk_join_cfg WHERE id=1');
    if((!probe && cfg.due>now) || !this.joinActive520(''))return;
    // The publication window and existing account lease take priority over participation.
    if(this.one('SELECT 1 FROM desk_link_plan WHERE pub IS NULL AND scheduled BETWEEN ? AND ? LIMIT 1',now-5*M520,now+6*M520) ||
      this.one('SELECT 1 FROM desk_work_schedule WHERE pub IS NULL AND scheduled BETWEEN ? AND ? LIMIT 1',now-5*M520,now+6*M520))return;
    const applicationRoom=(this.one('SELECT applications FROM desk_join_budget WHERE day=?',jstDay(now))?.applications||0)<DISTRIBUTION16918.applications &&
      this.one('SELECT app_next FROM desk_distribution16918 WHERE id=1').app_next<=now;
    const rows=this.rows(`SELECT j.* FROM desk_join j JOIN desk_join_target t ON t.id=j.id WHERE (j.due<=? OR ?) AND NOT EXISTS(SELECT 1 FROM desk_member m WHERE m.id=j.id AND m.mode='excluded')
      AND (j.phase<>'wait' OR ? OR EXISTS(SELECT 1 FROM desk_invite v WHERE v.id=j.id AND v.phase='wait')) AND (?='' OR j.id=?)
      ORDER BY EXISTS(SELECT 1 FROM desk_invite v WHERE v.id=j.id AND v.phase='wait') DESC,
      CASE WHEN j.phase='wait' THEN 0 WHEN j.phase='accepting' THEN 1 WHEN j.phase IN ('sent','applied') THEN 2 ELSE 3 END,j.due,j.at,j.id LIMIT 16`,now,+!!probe,+applicationRoom,probe?.target||'',probe?.target||'');
    const canRank=rows[0]?.phase==='wait'&&!this.one("SELECT 1 FROM desk_invite WHERE id=? AND phase='wait'",rows[0].id);
    const row=canRank?this.networkTry16922(()=>this.networkRecruitment16922(rows.filter(j=>j.phase==='wait'),now,cfg.used),rows[0]):rows[0];
    if(!row)return;
    if(probe?.verify && !['sent','applied','accepting','joined'].includes(row.phase))return;
    const target=this.joinTarget520(row.id);
    if(!target)return;
    probe?.capture?.({id:row.id,phase:row.phase,name:target.name});
    const today=jstDay(now),used=cfg.day===today?cfg.used:0;
    if(used>=DISTRIBUTION16918.checks){this.rows('UPDATE desk_join_cfg SET due=? WHERE id=1',jstStart(today)+D520+M520);return;}
    this.rows('UPDATE desk_join_cfg SET due=? WHERE id=1',now+15*M520);
    let env,lease,message='参加申請・招待の確認を再試行待ち',due=now+2*HOUR,attempt='';
    try {
      if(typeof this.env.BROWSER?.acquire!=='function'){message='CloudflareのBROWSER設定が必要です';return;}
      const pending=this.one("SELECT * FROM desk_invite WHERE id=? AND phase='wait' ORDER BY created DESC LIMIT 1",target.id);
      const recent=this.one("SELECT at FROM desk_invite WHERE id=? AND phase IN ('opened','confirmed') ORDER BY at DESC LIMIT 1",target.id);
      const kind=pending?'invite':row.phase==='joined'||row.phase==='accepting'||(recent && recent.at>=now-2*HOUR)?'verify':row.phase==='wait'?'apply':'check';
      if(kind==='apply' && (this.one('SELECT applications FROM desk_join_budget WHERE day=?',today)?.applications||0)>=DISTRIBUTION16918.applications){message='本日の参加申請枠を使用済み・翌日に続けます';due=jstStart(today)+D520+M520;return;}
      if(kind==='apply' && target.restricted){message='AI生成文・応募中作品・R18の条件があるため自動申請対象外。作品の資格を未確認です';due=now+7*D520;return;}
      const sources=await Promise.allSettled([
        this.publicRead('https://note.com/api/v1/magazines/'+target.id,'json'),
        this.publicRead(target.url,'html'),
        this.publicRead('https://note.com/api/v3/notes/'+target.article,'json')
      ]);
      const [mag,html,note]=sources.map(s=>s.status==='fulfilled'?s.value:null);
      if(!joinFree520(mag,html||'',target,note?.data)){message='対象誌が無料か確認できず・申請と承認を保留';due=now+D520;return;}
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
        {kind,target:target.id,definition:target,feeNote:note?.data,feeHtml:html||'',hash:note?.data?await draftBodyHash(note.data.body):null,url:link,
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
              if(applications>=DISTRIBUTION16918.applications || this.one('SELECT app_next FROM desk_distribution16918 WHERE id=1').app_next>Date.now())return false;
              if(!this.one("UPDATE desk_join SET phase='sent',at=?,token=?,account=?,message='参加申請の操作を記録・自動再送なし' WHERE id=? AND phase='wait' RETURNING id",Date.now(),marker,accountInfo.id,target.id))return false;
              this.rows('INSERT INTO desk_join_budget(day,applications) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET applications=applications+1',jstDay(Date.now()));
              this.rows('UPDATE desk_distribution16918 SET app_next=? WHERE id=1',Date.now()+DISTRIBUTION16918.applicationGap);
            }else if(kind==='invite') {
              if(!this.one("UPDATE desk_invite SET phase='opened',at=?,token=?,iv='',ciphertext='' WHERE hash=? AND phase='wait' RETURNING hash",Date.now(),marker,pending.hash))return false;
              this.rows("UPDATE desk_join SET phase='accepting',at=?,account=?,message='招待承認の開始を記録・参加状態は未確認' WHERE id=?",Date.now(),accountInfo.id,target.id);
            }else return false;
            attempt=marker;return true;
          });
        },live);
      probe?.result?.(result);
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
      try{this.rows('UPDATE desk_join SET due=?,message=? WHERE id=?',due,message,target.id);}
      finally{if(lease)await release(env,lease);}
    }
  }
});
function joinRecord520(j) {
  if(!j)return '';
  return ['【参加申請・招待の承認】'+(j.active?'自動確認ON':'休止中'),
    ...(j.items||[]).map(r=>r.name+' ／ '+(r.active?'':'休止・除外 ／ ')+r.message),
    j.tuta?.configured?tutaRecord520(j.tuta):j.mailConfigured?(j.mailReceived?'招待メールの最終受信：'+time(j.mailReceived):'受信先の指定あり・メール到着は未確認'):'招待メールの受信が未接続です。自動承認の稼働には1回の受信接続が必要です。',
    j.tuta?.configured?'確認・復旧メールは引き続きTutaで受信します。':j.mailForwardError?'確認・復旧メールの転送先設定に誤りがあります。登録メールの変更は保留してください。':j.mailForwardConfigured?'確認・復旧メール：転送先の指定あり。実際に元の受信箱へ届くことを確認してから登録メールを変更してください。':'確認・復旧メールの転送先は未設定です。この受信先へ登録メールを変更する前に設定してください。',
    '探索・参加先に固定の累計上限はありません。フォロー操作は行いません。新規申請は1日24誌（日本時間）、30分以上あけて続けます。本人画面の確認は1日96回まで。条件未確認・通信待機では上限まで送らない場合があります。',
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
  const follow=action=>evaluate('('+BROWSER_SOURCES520.joinFollowDOM520+')('+JSON.stringify(target.owner)+','+JSON.stringify(action)+')');
  state=await poll(()=>follow('read'),v=>['on','off'].includes(v));
  if(!await identity())return {message:'既存のフォロー状態と本人・待機状態を再確認待ち'};
  if(state==='on')return null;
  if(state!=='off')return {message:'募集元の運営者のフォローボタンを確認待ち'};
  return {noFollow:true,message:'参加に新しいフォローが必要なため申請を見送り。フォロー数は増やしません'};
}

// Previous shelf records are retained for inspection only; no creation or addition code remains.
Object.assign(Desk520.prototype,{
  initShelf520(){
    if(this.one("SELECT 1 FROM sqlite_master WHERE name='desk_shelf'"))return;
    this.storage.transactionSync(()=>{
      this.rows("CREATE TABLE desk_shelf(id INTEGER PRIMARY KEY,phase TEXT NOT NULL DEFAULT 'wait',article TEXT NOT NULL DEFAULT '',due INTEGER NOT NULL DEFAULT 0,at INTEGER NOT NULL DEFAULT 0,day TEXT NOT NULL DEFAULT '',used INTEGER NOT NULL DEFAULT 0,message TEXT NOT NULL DEFAULT '自作マガジンの自動作成・作品追加は廃止')");
      this.rows('INSERT INTO desk_shelf(id) VALUES(1)');
      this.rows("CREATE TABLE desk_shelf_item(article TEXT PRIMARY KEY,phase TEXT NOT NULL,at INTEGER NOT NULL,due INTEGER NOT NULL,baseline INTEGER,message TEXT NOT NULL)");
      this.rows('CREATE INDEX desk_shelf_item_due ON desk_shelf_item(due)');
    });
  },
  deliveryActive520(){return !!this.one('SELECT 1 FROM desk_cfg c JOIN desk_delivery d ON d.id=c.id WHERE c.id=1 AND c.enabled=1 AND d.enabled=1 AND c.blocked<=?',Date.now());},
  shelfView520(){
    const s=this.one('SELECT phase,article,at,message FROM desk_shelf WHERE id=1');
    const items=this.rows('SELECT i.phase,i.message,i.at,a.title FROM desk_shelf_item i JOIN desk_archive a ON a.article=i.article ORDER BY i.at DESC LIMIT 12');
    return {...s,items,active:false,message:'自作マガジンの自動作成・作品追加は廃止しました。',previousMessage:s.message,url:s.article?'https://note.com/43__/m/'+s.article:null};
  },
});
function shelfRecord520(s){
  if(!s)return '';
  return ['【520の作品棚】自動作成・作品追加の機能は廃止',
    ...(s.article || s.at || s.items.length ? ['以下は旧版の操作記録です。',s.previousMessage||'',s.url||'',
      ...s.items.map(i=>i.title+' ／ '+i.message)] : [])].filter(Boolean).join('\n');
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
    if(used>=48)return;
    const choices=this.rows(`SELECT i.* FROM desk_join_discovery q JOIN desk_import i ON i.id=q.id
      WHERE q.due<=? AND NOT EXISTS(SELECT 1 FROM desk_join_target t WHERE t.id=q.id)
      AND NOT EXISTS(SELECT 1 FROM desk_member m WHERE m.id=q.id AND m.mode='excluded') ORDER BY q.due,q.id LIMIT 16`,now);
    const row=this.networkTry16922(()=>this.networkRecruitment16922(choices,now,used),choices[0]);
    if(!row)return;
    this.rows('UPDATE desk_expansion SET day=?,used=?,due=? WHERE id=1',day,used+1,now+15*M520);
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
      const n=(await this.publicRead('https://note.com/api/v3/notes/'+rule.id,'json'))?.data;
      if(!joinFree520(payload,html,target,n))return;
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
    if(used>=192)return '本日は192回の探索を試みました。翌日、続きから再開します。累計上限はありません。';
    if(this.one('SELECT due FROM desk_scout_state WHERE id=1').due>now)return '探索は次の通常間隔で続けます。';
    const next=this.one('SELECT url,kind FROM desk_scout WHERE due<=? ORDER BY due,url LIMIT 1',now);
    if(!next)return '確認予定のページは巡回済みです。更新時に続けます。';
    this.storage.transactionSync(()=>{
      this.rows('UPDATE desk_scout_budget SET day=?,used=?,seeded=1 WHERE id=1',day,used+1);
      this.rows('UPDATE desk_scout_state SET due=? WHERE id=1',now+6*M520);
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
        this.rows('UPDATE desk_scout SET due=? WHERE url=?',now+(more?4*M520:next.kind==='feed'?this.rssScoutDelay16926(next.url,now):next.kind==='owner'?D520:7*D520),next.url);
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
    if(browserWait16916(this.env.BROWSER))return;
    const state=this.one('SELECT * FROM desk_popular WHERE id=1');
    if(state.due>now || !this.deliveryActive520())return;
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
        if(!this.deliveryActive520())return false;
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
    finally{try{this.rows('UPDATE desk_popular SET due=?,message=? WHERE id=1',due,message);}finally{if(lease)await release(env,lease);}}
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
  const list=model.listModel;
  if(!list)return {state:'loading'};
  // Only the trusted application's selected mailbox model supplies mail data.
  // Older stream-based state and wrapped rows coexist with newer mails getters.
  const read=(object,name)=>{try{return object?.[name];}catch{return undefined;}};
  let state=read(list,'state');
  if(typeof state==='function'){try{state=state.call(list);}catch{state=null;}}
  const direct=read(list,'mails'),visibleItems=read(list,'items');
  const raw=Array.isArray(direct)?direct:Array.isArray(state?.items)?state.items:Array.isArray(visibleItems)?visibleItems:null;
  if(!raw)return {state:!state&&!direct&&!visibleItems?'loading':'page',reason:'list_contract'};
  const mailValue=value=>{
    const valid=m=>Array.isArray(m?._id)&&m._id.length===2 && m._id.every(x=>typeof x==='string'&&x.length<200) &&
      typeof m.subject==='string' && typeof m.sender?.address==='string' && Number.isFinite(new Date(m.receivedDate).getTime());
    if(valid(value))return value;
    // No recursive scan through mail bodies, attachments or untrusted HTML.
    if(valid(value?.mail))return value.mail;
    return null;
  };
  const items=raw.map(mailValue).filter(Boolean);
  let complete=false,legacy=false;
  if(typeof list.isLoadedCompletely==='function'){
    const done=list.isLoadedCompletely();
    if(typeof done!=='boolean')return {state:'page',reason:'list_contract'};
    complete=done;legacy=Array.isArray(state?.items);
  }else if(typeof list.isEmptyAndDone==='function'){
    const empty=list.isEmptyAndDone();
    if(typeof empty!=='boolean'||empty&&raw.length)return {state:'page',reason:'list_contract'};
    complete=empty;
  }
  if(raw.length && !items.length)return {state:'page',reason:'list_contract'};
  if(items.length!==raw.length)complete=false;

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
  if(!items.length && !complete)return {state:'loading'};
  const key=mail=>Array.isArray(mail?._id)&&mail._id.length===2 && mail._id.every(v=>typeof v==='string' && v.length<200)?JSON.stringify(mail._id):null;
  const sender=address=>typeof address==='string' && /^[^@<>\s,;]+@(?:[a-z0-9-]+\.)?note\.(?:com|mu)$/i.test(address);
  const date=mail=>new Date(mail.receivedDate).getTime();
  const recent=mail=>Number.isFinite(date(mail)) && date(mail)>=arg.since && date(mail)<=Date.now();
  const candidates=items.filter(mail=>key(mail) && recent(mail) && sender(mail.sender?.address) && /招待|invitation|invited/i.test(mail.subject||''));
  if(step==='list')return {state:'ready',items:candidates.map(mail=>({key:key(mail),received:date(mail)})),
    // mails in the current model are not ordered by receivedDate. Never declare
    // the inbox exhausted merely because a grouped/unsorted old mail is present.
    complete:complete || (legacy && items.length===raw.length && items.every((mail,i)=>Number.isFinite(date(mail)) && (!i || date(items[i-1])>=date(mail))) && items.some(mail=>date(mail)<arg.since))};
  if(step==='more') {
    if(typeof list.loadMore!=='function')return {state:'page'};
    const before=items.map(mail=>key(mail)).join('|');
    await list.loadMore();
    let state=read(list,'state');
    if(typeof state==='function')state=state.call(list);
    const direct=read(list,'mails');
    const next=Array.isArray(direct)?direct:Array.isArray(state?.items)?state.items:read(list,'items');
    const finished=typeof list.isLoadedCompletely==='function'?list.isLoadedCompletely()===true:
      typeof list.isEmptyAndDone==='function'?list.isEmptyAndDone()===true:false;
    if(finished)return {state:'loaded'};
    return Array.isArray(next) && next.map(mailValue).filter(Boolean).map(mail=>key(mail)).join('|')!==before?{state:'loaded'}:{state:'unchanged'};
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
  script_error:'画面の確認処理を完了できません',script_reference:'画面確認用の関数・変数を参照できません',
  script_type:'画面確認用データの型を扱えません',script_syntax:'画面確認コードの構文を解釈できません',
  script_eval:'画面確認コードの実行を許可されません',command_error:'ブラウザーから確認結果が返りません',invalid_result:'画面の確認結果を取得できません',
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
    '\n確認コード：TUTA5/'+result.stage+'/'+state;
}

function tutaErrorState520(error) {
  return ['script_reference','script_type','script_syntax','script_eval','command_error'].includes(error?.tutaState)?error.tutaState:'script_error';
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
      if(raw!==undefined)retry=Math.max(retry,retryDelay16929(raw));
    });
    const halt=()=>blocked||retry>0||Date.now()>=until||!callbacks.active();
    const frame=async(step,arg={})=>{
      if(halt())return {state:'stopped'};
      let r;
      try {
        r=await command('Runtime.evaluate',{expression:'('+BROWSER_SOURCES520.tutaScreen520+')('+JSON.stringify(step)+','+JSON.stringify({email:credential.email,since:Date.now()-7*D520,...arg})+')',returnByValue:true,awaitPromise:true});
      } catch { throw Object.assign(Error('browser result unavailable'),{tutaState:'command_error'}); }
      if(r.exceptionDetails){
        // Only the fixed exception class is used. Never persist descriptions,
        // exception messages, stack traces, URLs or page/mail contents.
        const classes={ReferenceError:'script_reference',TypeError:'script_type',SyntaxError:'script_syntax',EvalError:'script_eval'};
        const name=r.exceptionDetails.exception?.className;
        const state=Object.hasOwn(classes,name||'')?classes[name]:'script_error';
        throw Object.assign(Error('mail screen'),{tutaState:state});
      }
      lastScreen=r.result?.value && typeof r.result.value.state==='string'?r.result.value:{state:'page',reason:'invalid_result'};
      return lastScreen;
    };
    const poll=async(step,arg={},tries=30)=>{
      let state={state:'page'};
      for(let n=0;n<tries&&!halt();n++) {
        try{state=await frame(step,arg);}catch(error){lastScreen=state={state:tutaErrorState520(error)};}
        if(!['page','loading','identity','script_error','script_reference','script_type','script_syntax','script_eval','command_error'].includes(state?.state))return state;
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
      try{state=await frame('list');}catch(error){lastScreen=state={state:tutaErrorState520(error)};continue;}
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
  } catch(error) {
    if(stage!=='storage')lastScreen={state:tutaErrorState520(error)};
    const deferred=browserDeferred16916(error);if(deferred)return {...deferred,kind:'browser_wait',saved:0};
    return report({kind:stage==='storage'?'storage':['browser','target','websocket','network','navigate'].includes(stage)?'browser':'screen',saved});
  }
  finally {
    try{socket?.close();}catch{}
    if(session)await boundedClose16916(()=>binding.closeSession(session.sessionId)).catch(()=>{});
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
    if(browserWait16916(this.env.BROWSER))return;
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
      try{
      const at=Date.now(),ok=result.kind==='ok',hold=Math.max(0,Number(result.hold)||0);
      const waiting=result.kind==='browser_wait';
      const failures=ok?0:waiting?row.failures:row.failures+1;
      const delay=waiting?Math.max(M520,result.retryAt-at):ok?HOUR:['auth','challenge'].includes(result.kind)?Math.min(24,2**Math.min(failures,5))*HOUR:2*HOUR;
      const message=ok?'Tuta受信箱を確認済み。今回の招待取り込み '+result.saved+'件。'+(result.skipped?'対象外・照合保留 '+result.skipped+'件。':'')+(result.complete?'直近7日の受信箱を確認しました。':'読み取り保留・上限により、直近一覧の一部だけ確認しました。'):
        waiting?result.message:(TUTA_MESSAGES520[result.kind]||TUTA_MESSAGES520.storage)+tutaDiagnostic520(result);
      if(waiting)this.rows('UPDATE desk_tuta SET used=MAX(0,used-1) WHERE id=1 AND generation=? AND token=?',row.generation,token);
      // Even if the owner replaced or removed credentials while the browser was
      // running, preserve server Retry-After. Release only our own lease.
      this.rows('UPDATE desk_tuta SET hold_until=MAX(hold_until,?) WHERE id=1',at+hold);
      this.rows('UPDATE desk_tuta SET message=?,due=MAX(hold_until,?),checked=CASE WHEN ? THEN ? ELSE checked END,failures=? WHERE id=1 AND generation=? AND token=?',message,at+Math.max(delay,hold),+ok,at,failures,row.generation,token);
      this.rows('DELETE FROM desk_tuta_seen WHERE at<?',at-30*D520);
      }finally{this.rows("UPDATE desk_tuta SET lease=0,token='' WHERE id=1 AND token=?",token);}
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

// Generated standalone browser sources. Regenerate from the functions above when editing.
// These literals must never be replaced by runtime Function.toString().
// Public, signed-out observations. These records never choose or change note placement.
const OBSERVE1698 = Object.freeze({keywords:['小説','短編小説','恋愛','孤独','夜職','美容整形'],daily:12,gap:2*HOUR});
function observationUrl1698(job) {
  if(job.kind==='keyword' && OBSERVE1698.keywords.includes(job.subject) && ['popular','new'].includes(job.mode))
    return 'https://note.com/tag/'+encodeURIComponent(job.subject)+(job.mode==='new'?'?mode=new':'');
  if(job.kind==='footer' && /^n[a-z0-9]{1,64}$/.test(job.subject))return 'https://note.com/43__/n/'+job.subject;
  throw Error('Invalid public observation');
}
// Serialized once at build time. No clicks, scrolls, login or author-side settings.
function observationScreen1698(job) {
  const unknown=reason=>({state:'unknown',reason});
  const visible=e=>!!e?.getClientRects().length && !e.closest('[hidden],[aria-hidden="true"]') && getComputedStyle(e).visibility!=='hidden';
  const text=e=>(e?.textContent||'').replace(/\s+/g,' ').trim();
  const absolute=raw=>{try{const u=new URL(raw,location.href);return u.origin==='https://note.com' && !u.username && !u.password?u:null;}catch{return null;}};
  const rawCanonical=document.querySelector('link[rel="canonical"]')?.getAttribute('href');
  const canonical=rawCanonical?absolute(rawCanonical):null;
  if(location.origin!=='https://note.com' || document.readyState!=='complete' || !canonical ||
     canonical.pathname.replace(/\/$/,'')!==location.pathname.replace(/\/$/,''))return unknown('page');
  const bodySelector='[contenteditable],.note-common-styles__textnote-body,.o-noteContentText,[data-testid="note-body"],[class*="noteBody"],[class*="NoteBody"],blockquote';
  const h1=[...document.querySelectorAll('h1')].filter(visible);
  if(h1.length!==1)return unknown('heading');
  if(job.kind==='keyword') {
    let path;try{path=decodeURIComponent(location.pathname).replace(/\/$/,'');}catch{return unknown('page');}
    const mode=new URL(location.href).searchParams.get('mode');
    if(path!=='/tag/'+job.subject || text(h1[0])!==job.subject ||
       (job.mode==='new'?mode!=='new':mode!==null))return unknown('page');
    const mains=[...document.querySelectorAll('main,[role="main"]')].filter(visible);
    const root=mains.length===1?mains[0]:null;
    if(!root)return unknown('list');
    const tabs=[...root.querySelectorAll('a[href],[role="tab"]')].filter(e=>visible(e)&&['人気','新着'].includes(text(e)));
    const selected=tabs.filter(e=>e.getAttribute('aria-selected')==='true' || ['page','true'].includes(e.getAttribute('aria-current')) || e.classList.contains('is-active'));
    if(selected.length!==1 || text(selected[0])!==(job.mode==='new'?'新着':'人気'))return unknown('sort');
    const cardSelector='article,[data-testid="note-card"],.m-note,.m-largeNoteWrapper,[class*="noteCard"],[class*="NoteCard"]';
    const cards=[...root.querySelectorAll(cardSelector)].filter(e=>visible(e)&&!e.closest('aside,nav,footer,[class*="recommend" i],[data-testid*="recommend"],'+bodySelector));
    const leaves=cards.filter(e=>!cards.some(other=>other!==e && e.contains(other)));
    if(!leaves.length)return unknown('list');
    const entries=[],seen=new Set();let incomplete=false;
    for(const card of leaves.slice(0,50)) {
      const headings=[...card.querySelectorAll('h2,h3,h4')].filter(visible);
      if(headings.length!==1 || !text(headings[0])){incomplete=true;continue;}
      const urls=[...new Set([...card.querySelectorAll('a[href],[data-href]')].concat(card.matches('a[href],[data-href]')?[card]:[])
        .filter(visible).map(e=>absolute(e.getAttribute('href')||e.getAttribute('data-href')))
        .filter(u=>u && /^\/[\w-]{1,80}\/n\/n[a-z0-9]{1,64}\/?$/.test(u.pathname)).map(u=>u.origin+u.pathname.replace(/\/$/,'')))];
      if(urls.length!==1){incomplete=true;continue;}
      if(seen.has(urls[0]))continue;
      seen.add(urls[0]);entries.push({url:urls[0],title:text(headings[0]).slice(0,300)});
    }
    // A missing/unrecognized card is not proof that 520 is absent from this page.
    if(!entries.length)return unknown('cards');
    return {state:'observed',complete:!incomplete,entries,scope:'initial_cards'};
  }
  if(job.kind!=='footer' || location.pathname.replace(/\/$/,'')!=='/43__/n/'+job.subject || text(h1[0])==='521')return unknown('page');
  const groups=[...document.querySelectorAll('[aria-label*="パンくず"],[aria-label*="breadcrumb" i],[class*="breadcrumb" i]')]
    .filter(e=>visible(e) && !e.closest(bodySelector));
  const paths=[];
  for(const group of groups) {
    if(group.getBoundingClientRect().top<h1[0].getBoundingClientRect().bottom)continue;
    const links=[...group.querySelectorAll('a[href]')].filter(visible);
    const list=links.map(a=>({u:absolute(a.getAttribute('href')),label:text(a)}));
    if(!list.some(x=>x.u?.pathname==='/' && ['トップ','ホーム'].includes(x.label)))continue;
    const topics=list.filter(x=>x.u && /^\/topic\/[a-z0-9_/-]+\/?$/.test(x.u.pathname) && x.label && x.label.length<=100)
      .map(x=>({label:x.label,url:x.u.origin+x.u.pathname}));
    if(topics.length && topics.length<=8)paths.push(topics);
  }
  const unique=[...new Map(paths.map(p=>[JSON.stringify(p),p])).values()];
  return unique.length===1?{state:'observed',title:text(h1[0]).slice(0,300),topics:unique[0]}:unknown('breadcrumb');
}
async function readObservation1698(binding,jobs) {
  const targets=jobs.map(observationUrl1698),results=[];
  let socket,session,command,hold=0,denied=0,deadline;
  try {
    session=await binding.acquire({keepAlive:15000,recording:false,guardrails:{allowedDomains:['note.com','*.st-note.com']}});
    const target=await binding.devtools.newTarget(session.sessionId);
    const link=await binding.connectSession(session.sessionId,{targetId:target.id});
    const upgraded=await link.webSocket.fetch('https://browser-binding.invalid',{headers:{Upgrade:'websocket'}});
    socket=upgraded.webSocket;if(!socket)throw Error('browser');socket.accept();
    command=pageCommand(socket);
    deadline=setTimeout(()=>{try{socket.close();}catch{}},24000);
    // This session is anonymous. No saved credential is ever read or installed.
    await command('Network.enable');
    await command('Network.clearBrowserCookies');
    await command('Network.setCacheDisabled',{cacheDisabled:true});
    socket.addEventListener('message',event=>{
      let data;try{data=JSON.parse(event.data);}catch{return;}
      if(data.method==='Fetch.requestPaused') {
        const p=data.params;let u;try{u=new URL(p.request.url);}catch{}
        const allowed=u?.protocol==='https:' && !u.username && !u.password &&
          (u.hostname==='note.com'||/^(?:[a-z0-9-]+\.)+st-note\.com$/.test(u.hostname)) && ['GET','HEAD'].includes(p.request.method) &&
          (p.resourceType!=='Document'||targets.includes(u.href));
        command(allowed?'Fetch.continueRequest':'Fetch.failRequest',allowed?{requestId:p.requestId}:{requestId:p.requestId,errorReason:'BlockedByClient'}).catch(()=>{});
      }
      if(data.method!=='Network.responseReceived')return;
      const response=data.params.response;
      if(!['Document','Fetch','XHR'].includes(data.params.type) || !response.url?.startsWith('https://note.com/'))return;
      const raw=Object.entries(response.headers||{}).find(([k])=>k.toLowerCase()==='retry-after')?.[1];
      const retry=retryDelay16929(raw);
      if(retry>0)hold=Math.max(hold,retry);
      if([401,403,429].includes(response.status)){denied=response.status;hold=Math.max(hold,2*HOUR);}
      if(response.status>=500){denied=response.status;hold=Math.max(hold,HOUR);}
    });
    await command('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
    for(const [i,job] of jobs.entries()) {
      if(hold || denied)break;
      await command('Page.navigate',{url:targets[i]});
      let result=null,previous='';
      for(let n=0;n<10 && !hold && !denied;n++) {
        try {
          const evaluated=await command('Runtime.evaluate',{expression:'('+BROWSER_SOURCES520.observationScreen1698+')('+JSON.stringify(job)+')',returnByValue:true,awaitPromise:false});
          if(!evaluated.exceptionDetails)result=evaluated.result?.value;
        }catch{result=null;}
        const signature=JSON.stringify(result);
        if(result?.state==='observed' && signature===previous)break;
        previous=signature;await pause520(350);
        // A single observation is not stable evidence until read again.
        if(n===9 && result?.state==='observed')result=null;
      }
      if(hold || denied)break;
      results.push({job,result:result||{state:'unknown',reason:'screen'}});
    }
  }catch { /* Only fixed diagnostics are shown. An error never becomes a negative observation. */ }
  finally {
    clearTimeout(deadline);try{socket?.close();}catch{}
    if(session)await boundedClose16916(()=>binding.closeSession(session.sessionId)).catch(()=>{});
  }
  return {results,hold,denied};
}
Object.assign(Desk520.prototype,{
  initObservation1698() {
    if(this.one("SELECT 1 FROM sqlite_master WHERE name='desk_observe_state'"))return;
    this.storage.transactionSync(()=>{
      this.rows("CREATE TABLE desk_observe_state(id INTEGER PRIMARY KEY,next INTEGER NOT NULL DEFAULT 0,day TEXT NOT NULL DEFAULT '',used INTEGER NOT NULL DEFAULT 0,message TEXT NOT NULL DEFAULT '次の定期起動から公開ページの観測を開始します')");
      this.rows('INSERT INTO desk_observe_state(id) VALUES(1)');
      this.rows("CREATE TABLE desk_observe_keyword(keyword TEXT NOT NULL,mode TEXT NOT NULL,due INTEGER NOT NULL DEFAULT 0,attempted INTEGER NOT NULL DEFAULT 0,observed INTEGER NOT NULL DEFAULT 0,cards INTEGER,complete INTEGER NOT NULL DEFAULT 0,hits TEXT NOT NULL DEFAULT '[]',state TEXT NOT NULL DEFAULT '待機',PRIMARY KEY(keyword,mode))");
      this.rows('CREATE INDEX desk_observe_keyword_due ON desk_observe_keyword(due,keyword,mode)');
      this.rows("CREATE TABLE desk_observe_footer(article TEXT PRIMARY KEY,due INTEGER NOT NULL DEFAULT 0,attempted INTEGER NOT NULL DEFAULT 0,observed INTEGER NOT NULL DEFAULT 0,topics TEXT NOT NULL DEFAULT '[]',state TEXT NOT NULL DEFAULT '待機')");
      this.rows('CREATE INDEX desk_observe_footer_due ON desk_observe_footer(due,article)');
      this.rows('CREATE TABLE desk_observe_hit(keyword TEXT NOT NULL,mode TEXT NOT NULL,article TEXT NOT NULL,title TEXT NOT NULL,first_at INTEGER NOT NULL,last_at INTEGER NOT NULL,PRIMARY KEY(keyword,mode,article))');
      this.rows('CREATE INDEX desk_observe_hit_time ON desk_observe_hit(last_at DESC)');
      this.rows('CREATE TABLE desk_observe_log(id INTEGER PRIMARY KEY,at INTEGER NOT NULL,kind TEXT NOT NULL,subject TEXT NOT NULL,mode TEXT NOT NULL,data TEXT NOT NULL)');
      this.rows('CREATE INDEX desk_observe_log_time ON desk_observe_log(at)');
      for(const keyword of OBSERVE1698.keywords)for(const mode of ['popular','new'])this.rows('INSERT INTO desk_observe_keyword(keyword,mode) VALUES(?,?)',keyword,mode);
    });
  },
  observationView1698() {
    return {state:this.one('SELECT next,used,day,message FROM desk_observe_state WHERE id=1'),
      keywords:this.rows('SELECT keyword,mode,attempted,observed,cards,complete,hits,state FROM desk_observe_keyword ORDER BY keyword,mode'),
      footers:this.rows('SELECT f.*,a.title FROM desk_observe_footer f JOIN desk_archive a ON a.article=f.article ORDER BY f.attempted DESC,a.pub DESC LIMIT 30'),
      hits:this.rows('SELECT keyword,mode,article,title,first_at,last_at FROM desk_observe_hit ORDER BY last_at DESC LIMIT 30')};
  },
  recordObservation1698(job,result,now) {
    // Validate the browser boundary again; do not trust arbitrary returned URLs or counts.
    let valid=result?.state==='observed',data;
    if(job.kind==='keyword') {
      valid=valid && Array.isArray(result.entries) && result.entries.length>0 && result.entries.length<=50 && typeof result.complete==='boolean';
      const entries=valid?result.entries:[];
      valid=valid && entries.every(e=>typeof e.title==='string' && e.title.length<=300 && /^https:\/\/note\.com\/[\w-]{1,80}\/n\/n[a-z0-9]{1,64}$/.test(e.url));
      if(valid) {
        const hits=[...new Map(entries.filter(e=>/^https:\/\/note\.com\/43__\/n\//.test(e.url) && e.title.trim()!=='521')
          .map(e=>[e.url,{article:e.url.split('/').at(-1),title:e.title}])).values()];
        data={cards:new Set(entries.map(e=>e.url)).size,complete:result.complete,hits};
      }
    } else {
      valid=valid && Array.isArray(result.topics) && result.topics.length>0 && result.topics.length<=8 && result.topics.every(t=>
        typeof t.label==='string' && t.label.trim() && t.label.length<=100 && /^https:\/\/note\.com\/topic\/[a-z0-9_/-]+$/.test(t.url));
      if(valid)data={topics:result.topics};
    }
    this.storage.transactionSync(()=>{
      const table=job.kind==='keyword'?'desk_observe_keyword':'desk_observe_footer';
      const where=job.kind==='keyword'?'keyword=? AND mode=?':'article=?',args=job.kind==='keyword'?[job.subject,job.mode]:[job.subject];
      if(!valid){this.rows('UPDATE '+table+" SET state='読み取り未確認・前回の成功記録を保持',attempted=?,due=? WHERE "+where,now,now+D520,...args);return;}
      if(job.kind==='keyword') {
        const state=data.hits.length?'520の記事を確認':data.complete?'確認したカード内では見つからず':'一部のカードを読み取れず・掲載の有無は未確認';
        this.rows('UPDATE desk_observe_keyword SET observed=?,cards=?,complete=?,hits=?,state=? WHERE keyword=? AND mode=?',now,data.cards,+data.complete,JSON.stringify(data.hits),state,...args);
        for(const hit of data.hits)this.rows('INSERT INTO desk_observe_hit(keyword,mode,article,title,first_at,last_at) VALUES(?,?,?,?,?,?) ON CONFLICT(keyword,mode,article) DO UPDATE SET title=excluded.title,last_at=excluded.last_at',job.subject,job.mode,hit.article,hit.title,now,now);
      }else this.rows("UPDATE desk_observe_footer SET observed=?,topics=?,state='ページ下部の案内を確認' WHERE article=?",now,JSON.stringify(data.topics),job.subject);
      this.rows('INSERT INTO desk_observe_log(at,kind,subject,mode,data) VALUES(?,?,?,?,?)',now,job.kind,job.subject,job.mode||'',JSON.stringify(data));
    });
  },
  async observeEntrances1698(now) {
    if(browserWait16916(this.env.BROWSER))return;
    const cfg=this.one('SELECT c.enabled,c.blocked,d.enabled delivery FROM desk_cfg c JOIN desk_delivery d ON d.id=c.id WHERE c.id=1');
    const state=this.one('SELECT * FROM desk_observe_state WHERE id=1');
    if(!cfg.enabled || !cfg.delivery || cfg.blocked>now || state.next>now)return;
    const soon=now+6*M520;
    if(this.one('SELECT 1 FROM desk_link_plan WHERE pub IS NULL AND scheduled BETWEEN ? AND ? LIMIT 1',now-5*M520,soon) ||
       this.one('SELECT 1 FROM desk_work_schedule WHERE pub IS NULL AND paused=0 AND scheduled BETWEEN ? AND ? LIMIT 1',now-5*M520,soon))return;
    const today=jstDay(now),used=state.day===today?state.used:0;
    if(used>=OBSERVE1698.daily){this.rows('UPDATE desk_observe_state SET next=? WHERE id=1',jstStart(today)+D520+M520);return;}
    if(typeof this.env.BROWSER?.acquire!=='function'){
      this.rows("UPDATE desk_observe_state SET next=?,message='BROWSER未接続・公開ページを観測できません' WHERE id=1",now+6*HOUR);return;
    }
    // Existing catalogue supplies identities. No additional D1 reads or full-history scans.
    this.rows("INSERT OR IGNORE INTO desk_observe_footer(article) SELECT a.article FROM desk_archive a WHERE trim(a.title)<>'521' AND NOT EXISTS(SELECT 1 FROM desk_observe_footer f WHERE f.article=a.article) ORDER BY a.pub DESC LIMIT 8");
    const keyword=this.one('SELECT keyword,mode FROM desk_observe_keyword WHERE due<=? ORDER BY due,keyword,mode LIMIT 1',now);
    const footer=this.one("SELECT f.article FROM desk_observe_footer f JOIN desk_archive a ON a.article=f.article WHERE f.due<=? AND trim(a.title)<>'521' ORDER BY f.due,a.pub DESC LIMIT 1",now);
    const jobs=[...(keyword?[{kind:'keyword',subject:keyword.keyword,mode:keyword.mode}]:[]),...(footer?[{kind:'footer',subject:footer.article}]:[])];
    if(!jobs.length){this.rows('UPDATE desk_observe_state SET next=? WHERE id=1',now+HOUR);return;}
    this.storage.transactionSync(()=>{
      // Reserve budgets before awaiting the browser; a restart or concurrent request cannot repeat the work.
      this.rows("UPDATE desk_observe_state SET next=?,day=?,used=?,message='公開ページを観測中' WHERE id=1",now+OBSERVE1698.gap,today,used+1);
      for(const job of jobs){
        if(job.kind==='keyword')this.rows("UPDATE desk_observe_keyword SET due=?,attempted=?,state='確認中・前回の成功記録を保持' WHERE keyword=? AND mode=?",now+D520,now,job.subject,job.mode);
        else this.rows("UPDATE desk_observe_footer SET due=?,attempted=?,state='確認中・前回の成功記録を保持' WHERE article=?",now+7*D520,now,job.subject);
      }
      // Observation snapshots are bounded; permanent first/last positive sightings remain separate.
      this.rows('DELETE FROM desk_observe_log WHERE at<?',now-30*D520);
    });
    const read=await readObservation1698(this.env.BROWSER,jobs);
    if(read.hold>0)this.rows('UPDATE desk_cfg SET blocked=MAX(blocked,?) WHERE id=1',Date.now()+read.hold);
    for(const job of jobs){
      const result=read.results.find(r=>r.job.kind===job.kind && r.job.subject===job.subject && r.job.mode===job.mode)?.result;
      this.recordObservation1698(job,result,Date.now());
    }
    this.rows('UPDATE desk_observe_state SET next=MAX(next,?),message=? WHERE id=1',Date.now()+read.hold,
      read.hold?'noteの待機・応答制限を確認。次回へ延期':read.results.some(r=>r.result.state==='observed')?'今回の公開ページの観測結果を保存しました':'画面の読み取りは未確認。次回に自動再確認します');
  }
});
function observationText1698(s) {
  const v=s.observation;if(!v)return '';
  const lines=['【キーワード一覧・ページ下部の案内の観測】'+(s.cfg.enabled && s.deliveryOn?'':'（休止中）'),v.state.message,
    '作品を自動掲載させる機能ではありません。初期表示のうち識別できたカードを観測します。未発見は対象外・圏外を意味しません。',
    'ログアウト状態での観測です。閲覧者による表示の違い・キーワード別のアクセス数・全体順位は計測できません。'];
  for(const k of v.keywords){
    lines.push(k.keyword+' ／ '+(k.mode==='new'?'新着':'人気')+' ／ '+k.state+' ／ 最終試行 '+time(k.attempted));
    if(k.observed)lines.push('  最後に読み取れた記録 '+time(k.observed)+' ／ '+k.cards+'カード ／ 520 '+JSON.parse(k.hits).length+'作品'+(k.complete?'':'（一部未確認）'));
  }
  lines.push('【520の記事を一覧で確認した記録・最新30件】');
  for(const h of v.hits)lines.push(h.title+' ／ '+h.keyword+'・'+(h.mode==='new'?'新着':'人気')+' ／ 初回 '+time(h.first_at)+' ／ 最終 '+time(h.last_at));
  if(!v.hits.length)lines.push('実際の掲載を確認できた記録はまだありません。');
  lines.push('【記事ページ下部の案内・最新30件】','下部リンクの表示を記録しています。キーワード一覧の掲載や、note内部の分類全体を示すものではありません。');
  for(const f of v.footers)lines.push(f.title+' ／ '+f.state+(f.observed?' ／ 前回確認 '+time(f.observed)+' ／ '+JSON.parse(f.topics).map(t=>t.label).join(' → '):''));
  if(!v.footers.length)lines.push('公開作品の取得・観測待ち');
  return lines.join('\n');
}

// v16.9.10: native question-answer likes and strictly zero-fee memberships.
// Both use the ordinary account lease, author cooldown and discovery budget.
const outreachSchema16910 = [
  `CREATE TABLE IF NOT EXISTS nh_v16910_state(slot TEXT PRIMARY KEY,pending TEXT NOT NULL DEFAULT '',qa INTEGER NOT NULL DEFAULT 0,members INTEGER NOT NULL DEFAULT 0,member_day TEXT NOT NULL DEFAULT '',member_used INTEGER NOT NULL DEFAULT 0,member_blocked INTEGER NOT NULL DEFAULT 0,qa_message TEXT NOT NULL DEFAULT '文芸作者の質問箱を探索待ち',member_message TEXT NOT NULL DEFAULT '520の0円プランを探索待ち')`,
  `INSERT OR IGNORE INTO nh_v16910_state(slot) VALUES('1'),('2')`,
  `CREATE TABLE IF NOT EXISTS nh_v16910_sources(slot TEXT NOT NULL,owner TEXT NOT NULL,author TEXT NOT NULL,source TEXT NOT NULL,seen INTEGER NOT NULL,qa_due INTEGER NOT NULL DEFAULT 0,member_due INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(slot,owner))`,
  `CREATE INDEX IF NOT EXISTS nh_v16910_qa_due ON nh_v16910_sources(slot,qa_due,owner)`,
  `CREATE INDEX IF NOT EXISTS nh_v16910_member_due ON nh_v16910_sources(slot,member_due,owner)`,
  `CREATE INDEX IF NOT EXISTS nh_v16910_source_age ON nh_v16910_sources(seen)`,
  `CREATE TABLE IF NOT EXISTS nh_v16910_actions(key TEXT PRIMARY KEY,slot TEXT NOT NULL,kind TEXT NOT NULL,owner TEXT NOT NULL,author TEXT NOT NULL,source TEXT NOT NULL,url TEXT NOT NULL,hash TEXT NOT NULL,plan TEXT NOT NULL,status TEXT NOT NULL,created INTEGER NOT NULL,confirmed INTEGER,verifications INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS nh_v16910_action_slot ON nh_v16910_actions(slot,created DESC)`
];
async function rememberOutreach16910(env,notes,ownIds,cursor) {
  const pool=[...new Map(notes.filter(n=>/^n[a-z0-9]{1,64}$/.test(n?.key||'') && /^[\w-]{1,80}$/.test(n.user?.urlname||'') &&
    /^[1-9]\d{0,19}$/.test(String(n.user?.id)) && !ownIds.has(String(n.user.id))).map(n=>[n.user.urlname,n])).values()];
  if(!pool.length)return;
  const selected=Array.from({length:Math.min(3,pool.length)},(_,i)=>pool[(cursor+i)%pool.length]),now=Date.now();
  await env.DB.batch([
    sql(env,'DELETE FROM nh_v16910_sources WHERE seen<?',now-14*24*HOUR),
    ...selected.map(n=>sql(env,`INSERT INTO nh_v16910_sources(slot,owner,author,source,seen) VALUES(?,?,?,?,?)
      ON CONFLICT(slot,owner) DO UPDATE SET author=excluded.author,source=excluded.source,seen=excluded.seen`,env.SLOT,n.user.urlname,String(n.user.id),n.key,now))
  ]);
}
function membershipPrice16910(raw) {
  if(typeof raw!=='string' || raw.length>6000)return false;
  const text=raw.normalize('NFKC').replace(/[ \t\u00a0]+/g,' ');
  if(/初月|初回|お試し|無料体験|無料期間|トライアル|クーポン|割引|返金|キャッシュバック|ポイント還元|期間限定|無料招待|有料|翌月|次月|(?:ヶ月|か月|ヵ月|日間|週間|年間|年|半年)無料|無料.{0,12}(?:終了|期間後)|フォロー必須|フォローが必要|フォローしてください|自動的にフォロー|自動フォロー/.test(text))return false;
  // A marketing mention of "無料" is never a regular monthly price.
  const regular=/(?:^|\n)\s*(?:(?:月額|会費|月会費|通常料金|通常会費)\s*[:：]?\s*0\s*円|[¥￥]\s*0\s*(?:\/|／)\s*月|0\s*円\s*(?:\/|／)\s*月)\s*(?:[（(]税込[）)])?\s*(?:$|\n)/m.test(text);
  if(!regular)return false;
  for(const m of text.matchAll(/(?:[¥￥]\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s*円)/g))if(Number((m[1]||m[2]).replaceAll(',',''))!==0)return false;
  return true;
}
// Only native controls are clicked. All targets are read again immediately before
// clicking; unknown states, duplicate cards and unrelated forms fail closed.
async function outreachScreen16910(step,arg,freePrice) {
  if(location.origin!=='https://note.com' || !/^[\w-]{1,80}$/.test(arg.owner||''))return {state:'page'};
  const visible=e=>!!e?.getClientRects().length && !e.closest('[hidden],[aria-hidden="true"]');
  const label=e=>(e.getAttribute('aria-label')||e.getAttribute('title')||e.innerText||e.value||'').trim();
  const all=(root,s)=>[...root.querySelectorAll(s)].filter(visible);
  const unique=a=>a.length===1?a[0]:null;
  const buttons=root=>all(root,'button,[role="button"],input[type="submit"]');
  const enabled=e=>e && !e.disabled && e.getAttribute('aria-disabled')!=='true';
  const path=location.pathname.replace(/\/$/,'');
  const canonical=document.querySelector('link[rel="canonical"]')?.href;
  const samePage=()=>{try{const u=new URL(canonical);return u.origin===location.origin && u.pathname.replace(/\/$/,'')===path;}catch{return false;}};
  const link=e=>{try{const u=new URL(e.href,location.href);return u.origin===location.origin && !u.username && !u.password?u.href:null;}catch{return null;}};
  const digest=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
  if(arg.kind==='qa'){
    if(path!=='/qa/'+arg.owner || !samePage())return {state:'page'};
    const main=document.querySelector('main,[role="main"]');if(!main)return {state:'page'};
    const roots=new Set();
    for(const h of all(main,'h2')){
      for(let root=h.parentElement,depth=0;root && root!==main && depth<7;root=root.parentElement,depth++){
        if(all(root,'h2').length!==1)break;
        const likes=buttons(root).filter(b=>/^(?:回答に)?スキ(?:する|をする|をつける|を取り消す|を取消す|済み)?$/.test(label(b)) ||
          (b.hasAttribute('aria-pressed') && /like|スキ/i.test(b.className+' '+(b.querySelector('svg')?.getAttribute('aria-label')||''))));
        if(likes.length===1 && all(root,'p').some(p=>p.innerText.trim().length>=12)){roots.add(root);break;}
      }
    }
    const rows=[];
    for(const root of [...roots].slice(0,20)){
      const q=unique(all(root,'h2'));
      const b=unique(buttons(root).filter(b=>/^(?:回答に)?スキ(?:する|をする|をつける|を取り消す|を取消す|済み)?$/.test(label(b)) ||
        (b.hasAttribute('aria-pressed') && /like|スキ/i.test(b.className+' '+(b.querySelector('svg')?.getAttribute('aria-label')||'')))));
      const answer=all(root,'p').filter(p=>!p.closest('button,nav,header,footer') && !q.contains(p)).map(p=>p.innerText.trim()).filter(Boolean).join('\n');
      if(!q||!b||!answer||answer.length>4000)continue;
      const question=q.innerText.trim(),content=question+'\n'+answer;
      if(!question || content.length>6000)continue;
      const pressed=b.getAttribute('aria-pressed'),name=label(b);
      const conflict=pressed==='true'&&/スキ(?:する|をする|をつける)$/.test(name)||pressed==='false'&&/取り消す|取消す|済み/.test(name);
      const liked=conflict?null:pressed==='true'||/取り消す|取消す|済み/.test(name)?true:pressed==='false'||/スキ(?:する|をする|をつける)$/.test(name)?false:null;
      rows.push({hash:await digest(arg.owner+'\n'+content),liked,eligible:/小説|詩|文学|文芸|読書|創作|物語|文章|執筆|作家|作品|本を読/.test(content) && !/スキ返|相互フォロー|参加希望|https?:\/\//.test(content),button:b});
    }
    if(step==='read')return {state:'ready',rows:rows.map(({button,...r})=>r)};
    const row=unique(rows.filter(r=>r.hash===arg.hash));if(!row)return {state:'unknown'};
    if(row.liked===true)return {state:'confirmed'};
    if(step==='verify')return {state:row.liked===false?'off':'unknown'};
    if(step!=='act' || !row.eligible || row.liked!==false || !enabled(row.button))return {state:'unknown'};
    row.button.click();return {state:'clicked'};
  }
  if(arg.kind!=='member')return {state:'page'};
  if(step==='entry'){
    if(path!=='/'+arg.owner || !samePage())return {state:'page'};
    const urls=[...new Set(all(document,'a[href]').filter(a=>/^メンバーシップ$/.test(label(a))).map(link).filter(h=>h && new URL(h).pathname.replace(/\/$/,'')==='/'+arg.owner+'/membership'))];
    return urls.length===1?{state:'entry',url:urls[0]}:{state:'missing'};
  }
  const native=document.querySelector('main,[role="main"]');if(!native)return {state:'page'};
  if(step==='plans' || step==='verify'){
    if(path!=='/'+arg.owner+'/membership' || !samePage())return {state:'page'};
    const cards=new Map();
    for(const h of all(native,'h2,h3')){
      const title=h.innerText.trim();if(!title||title.length>200)continue;
      for(let root=h.parentElement,depth=0;root && root!==native && depth<6;root=root.parentElement,depth++){
        if(all(root,'h2,h3').length!==1)break;
        const text=root.innerText,joined=all(root,'button,[role="button"],a,span,p').some(e=>/^(?:このプランに)?参加中$|^加入中$|^退会する$/.test(label(e)));
        const links=all(root,'a[href]').filter(e=>label(e)==='参加手続きへ' && link(e));
        const controls=buttons(root).filter(e=>label(e)==='参加手続きへ');
        if(joined || links.length+controls.length===1){cards.set(root,{title,joined,free:freePrice(text),control:links[0]||controls[0]});break;}
      }
    }
    if(step==='verify'){
      const matching=[...cards.values()].filter(p=>p.title===arg.plan);
      return matching.length===1?{state:matching[0].joined?(matching[0].free?'confirmed':'price_changed'):'off'}:{state:'unknown'};
    }
    // Do not replace an existing plan or join multiple plans of one owner.
    if([...cards.values()].some(p=>p.joined))return {state:'already'};
    const eligible=[...cards.values()].filter(p=>p.free && enabled(p.control));
    if(!cards.size)return {state:'unknown'};
    if(eligible.length>1)return {state:'unknown'};
    if(!eligible.length)return {state:'no_free'};
    const chosen=eligible[0];
    if(!arg.open)return {state:'plan',plan:chosen.title};
    if(chosen.title!==arg.plan)return {state:'changed'};
    chosen.control.click();return {state:'opened'};
  }
  // Checkout must identify both the owner and the previously selected plan.
  const dialogs=all(document,'[role="dialog"],dialog[open]');
  if(dialogs.length>1)return {state:'unknown'};
  const scope=dialogs[0]||native;
  const titles=all(scope,'h1,h2,h3,h4').filter(h=>h.innerText.trim()===arg.plan);
  const ownerLinks=all(scope,'a[href]').filter(a=>link(a) && new URL(link(a)).pathname.replace(/\/$/,'')==='/'+arg.owner);
  if(!titles.length||!ownerLinks.length||!freePrice(scope.innerText))return {state:'price'};
  if(all(scope,'input,textarea,select').some(e=>!e.disabled && (e.matches('textarea,select') ||
    !['checkbox','radio','hidden','submit','button'].includes(e.type||'text'))))return {state:'input'};
  const checks=all(scope,'input[type="checkbox"],[role="checkbox"]');
  const checkLabel=e=>(e.getAttribute('aria-label')||[...(e.labels||[])].map(l=>l.textContent).join(' ')||e.parentElement?.innerText||'').trim();
  const following=checks.filter(e=>/^(?:このクリエイターを|クリエイターを|参加と同時に)?フォローする$/.test(checkLabel(e)));
  if(following.length>1)return {state:'follow'};
  const checked=e=>e.matches('input')?(e.indeterminate?null:e.checked):e.getAttribute('aria-checked')==='true'?true:e.getAttribute('aria-checked')==='false'?false:null;
  if(checks.some(e=>!following.includes(e)&&(e.required||checked(e)!==false)))return {state:'input'};
  if(following.length && checked(following[0])!==false && arg.wasFollowing!==true){
    if(step==='nofollow' && checked(following[0])===true && enabled(following[0])){following[0].click();return {state:'changed'};}
    return {state:'follow'};
  }
  // With no explicit opt-out, only an already-followed owner is eligible.
  if(arg.wasFollowing!==true && !(following.length===1 && checked(following[0])===false))return {state:'follow'};
  const submit=unique(buttons(scope).filter(b=>/^(?:無料で)?参加する$/.test(label(b))));
  if(!enabled(submit))return {state:'unknown'};
  const signature=JSON.stringify([arg.owner,arg.plan,scope.innerText.replace(/\s+/g,' '),following.length,following[0]?checked(following[0]):null]);
  if(step==='check')return {state:'ready',signature};
  if(step!=='act' || signature!==arg.signature)return {state:'changed'};
  submit.click();return {state:'clicked'};
}
async function relationship16910(owner,author) {
  if(location.origin!=='https://note.com' || !/^[\w-]{1,80}$/.test(owner))return null;
  try{
    const r=await fetch('/api/v2/creators/'+encodeURIComponent(owner),{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(4500)});
    if(!r.ok)return null;
    const j=await r.json(),d=j.data??j;
    if(d.urlname!==owner || String(d.id)!==author)return null;
    const values=[d.isFollowing,d.is_following].filter(v=>typeof v==='boolean');
    return values.length && values.every(v=>v===values[0])?values[0]:null;
  }catch{return null;}
}
async function reserveOutreach16910(env,token,settings,job) {
  const now=Date.now(),cutoff=now-settings.author_hours*HOUR;
  if(!['qa','member','board'].includes(job.kind))return null;
  if(job.kind==='board' && (boardPostURL16912(job.url,job.owner)!==job.url || job.hash!==await boardHash16912(job.url)))return null;
  const key=job.kind==='board'?'board:'+job.hash:job.kind==='qa'?'qa:'+job.owner+':'+job.hash:'member:'+job.author;
  const r=await env.DB.batch([
    sql(env,`INSERT INTO nh_v15_authors(author,last_at,slot,token) SELECT ?,?,?,?
      WHERE EXISTS(SELECT 1 FROM nh_control c JOIN nh_v13_connection n ON n.slot=? WHERE c.id=1 AND c.enabled=1 AND c.token=? AND c.lease>? AND n.hold_until<=?)
      AND NOT EXISTS(SELECT 1 FROM nh_shared WHERE key=?)
      AND NOT EXISTS(SELECT 1 FROM nh_v14_authors WHERE author=? AND last_at>?)
      AND EXISTS(SELECT 1 FROM nh_v16910_state WHERE slot=? AND pending='' AND (? IN ('qa','board') OR (member_blocked=0 AND (member_day<>? OR member_used<1))))
      AND EXISTS(SELECT 1 FROM nh_v1697_discovery WHERE slot=? AND pending='')
      ON CONFLICT(author) DO UPDATE SET last_at=excluded.last_at,slot=excluded.slot,token=excluded.token WHERE nh_v15_authors.last_at<=?`,
      job.author,now,env.SLOT,token,env.SLOT,token,now,now,key,job.author,cutoff,env.SLOT,job.kind,day(),env.SLOT,cutoff),
    sql(env,`INSERT OR IGNORE INTO nh_shared(key,slot,token,created) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM nh_v15_authors WHERE author=? AND token=? AND last_at=?)`,key,env.SLOT,token,now,job.author,token,now),
    sql(env,`INSERT OR IGNORE INTO nh_v16910_actions(key,slot,kind,owner,author,source,url,hash,plan,status,created)
      SELECT ?,?,?,?,?,?,?,?,?,'pending',? WHERE EXISTS(SELECT 1 FROM nh_shared WHERE key=? AND token=?)`,key,env.SLOT,job.kind,job.owner,job.author,job.source,job.url,job.hash||'',job.plan||'',now,key,token),
    sql(env,`UPDATE nh_v16910_state SET pending=?,member_used=CASE WHEN ?='member' THEN CASE WHEN member_day=? THEN member_used+1 ELSE 1 END ELSE member_used END,
      member_day=CASE WHEN ?='member' THEN ? ELSE member_day END WHERE slot=? AND pending=''
      AND EXISTS(SELECT 1 FROM nh_v16910_actions WHERE key=? AND slot=? AND status='pending') AND EXISTS(SELECT 1 FROM nh_shared WHERE key=? AND token=?)`,key,job.kind,day(),job.kind,day(),env.SLOT,key,env.SLOT,key,token),
    sql(env,`INSERT INTO nh_v14_authors(slot,author,last_at,token) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM nh_shared WHERE key=? AND token=?) ON CONFLICT(slot,author) DO UPDATE SET last_at=excluded.last_at,token=excluded.token`,env.SLOT,job.author,now,token,key,token)
  ]);
  return [0,1,2,3].every(i=>r[i].meta.changes)?key:null;
}
async function settleOutreach16910(env,job,confirmed) {
  const field=job.kind==='qa'?'qa':'members';
  await env.DB.batch([
    ...(job.kind==='board'?[sql(env,
      `UPDATE nh_v16912_state SET sent=sent+? WHERE slot=? AND EXISTS(SELECT 1 FROM nh_v16910_state s JOIN nh_v16910_actions a ON a.key=s.pending WHERE s.slot=? AND s.pending=? AND a.slot=s.slot AND a.status='pending' AND a.kind='board')`,+confirmed,env.SLOT,env.SLOT,job.key)]:[
    sql(env,`UPDATE nh_v16910_state SET ${field}=${field}+? WHERE slot=? AND pending=? AND EXISTS(SELECT 1 FROM nh_v16910_actions WHERE key=? AND slot=? AND status='pending')`,+confirmed,env.SLOT,job.key,job.key,env.SLOT)]),
    sql(env,`UPDATE nh_v16910_actions SET status=?,confirmed=? WHERE key=? AND slot=? AND status='pending'`,confirmed?'confirmed':'uncertain',confirmed?Date.now():null,job.key,env.SLOT),
    sql(env,`UPDATE nh_v16910_state SET pending='' WHERE slot=? AND pending=?`,env.SLOT,job.key),
    ...(job.kind==='member'&&confirmed?[sql(env,
      `INSERT OR IGNORE INTO nh_v16912_boards(slot,owner,author,source,url,plan)
        SELECT slot,owner,author,source,url,plan FROM nh_v16910_actions WHERE key=? AND slot=? AND kind='member' AND status='confirmed'`,job.key,env.SLOT)]:[])
  ]);
}
const outreachReason16910 = state=>({follow:'新しいフォローなしで参加できることを確認できず・保留',price:'通常会費0円と参加先の一致を確認できず・保留',input:'決済情報・追加入力や同意が必要なため保留',no_free:'通常会費0円のプランを確認できず',already:'参加済みのプランあり・追加参加なし',unknown:'画面を一意に確認できず・次回再確認',page:'対象の画面を確認できず・次回再確認'}[state]||'画面の状態が変わったため保留');
async function browserOutreach16910(env,accountId,job,reserve,live) {
  return inNoteBrowser(env.BROWSER,cleanCookie(env.NOTE_SESSION),false,async ({command,evaluate,blocked,blockedResult})=>{
    const form=(step,extra={})=>evaluate('('+BROWSER_SOURCES520.outreachScreen16910+')('+JSON.stringify(step)+','+JSON.stringify({...job,...extra})+',('+BROWSER_SOURCES520.membershipPrice16910+'))');
    const wait=async(read,accept)=>{
      let previous='';
      for(let i=0;i<10&&!blocked();i++){
        let r;try{r=await read();}catch{}
        const signature=JSON.stringify(r);
        if(r&&accept(r)&&signature===previous)return r;
        previous=signature;await pause520(250);
      }
      return null;
    };
    await command('Page.navigate',{url:job.url});
    const identity=await wait(()=>evaluate(noteIdentityJS),x=>!!x?.id);
    if(blocked())return blockedResult();
    if(identity?.id!==accountId || (job.kind==='member'&&identity.name!=='43__'))return {message:'登録したnote本人を確認できず・操作なし'};
    if(job.recover){
      const r=await wait(()=>form('verify'),r=>['confirmed','off'].includes(r.state));
      if(blocked())return blockedResult();
      return {resolved:!!r,confirmed:r?.state==='confirmed',message:r?.state==='confirmed'?'前回の操作結果をnoteで確認':'前回の操作結果は未確認・自動再送なし'};
    }
    if(job.kind==='qa'){
      const list=await wait(()=>form('read'),r=>r.state==='ready'&&r.rows?.length>0);
      if(blocked())return blockedResult();
      if(!list)return {message:'質問と回答・スキ状態を識別できず・候補保留'};
      for(const row of list.rows.filter(r=>r.eligible&&r.liked===false).slice(0,3)){
        const next={...job,hash:row.hash};
        if(!await live() || blocked())return blocked()?blockedResult():{message:'停止・待機のため操作保留'};
        if(!await reserve(next))continue;
        if(!await live() || blocked())return blocked()?blockedResult():{message:'停止・待機のため操作保留'};
        const r=await form('act',{hash:row.hash});
        if(r.state!=='clicked')return {message:'回答の状態が変わったため操作保留'};
        await command('Page.navigate',{url:job.url});
        const verified=await wait(()=>form('verify',{hash:row.hash}),r=>r.state==='confirmed');
        if(blocked())return blockedResult();
        return {confirmed:!!verified,message:verified?'質問箱の回答へのスキ確認済み':'回答へのスキは操作済み・結果確認待ち'};
      }
      return {read:true,stage:'qa_rows',message:'文芸の回答候補なし・スキ済み・作者待機'};
    }
    const relation=()=>evaluate('('+BROWSER_SOURCES520.relationship16910+')('+JSON.stringify(job.owner)+','+JSON.stringify(job.author)+')');
    const wasFollowing=await relation();
    const entry=await wait(()=>form('entry'),r=>r.state==='entry');
    if(blocked())return blockedResult();
    if(!entry)return {message:'公開プロフィールにメンバーシップの入口を確認できず'};
    await command('Page.navigate',{url:entry.url});
    const selected=await wait(()=>form('plans'),r=>['plan','already','no_free'].includes(r.state));
    if(blocked())return blockedResult();
    if(selected?.state!=='plan')return {read:selected?.state==='already'||selected?.state==='no_free',stage:'member_plan',message:outreachReason16910(selected?.state)};
    if(!await live())return {message:'停止・待機のため参加保留'};
    if((await form('plans',{open:true,plan:selected.plan})).state!=='opened')return {message:'参加プランが変わったため保留'};
    let check=await wait(()=>form('check',{plan:selected.plan,wasFollowing}),r=>['ready','follow','price','input'].includes(r.state));
    if(check?.state==='follow'){
      await form('nofollow',{plan:selected.plan,wasFollowing});
      check=await wait(()=>form('check',{plan:selected.plan,wasFollowing}),r=>['ready','follow','price','input'].includes(r.state));
    }
    if(blocked())return blockedResult();
    if(check?.state!=='ready')return {read:!!check,stage:'member_plan',message:outreachReason16910(check?.state)};
    const who=await evaluate(noteIdentityJS);
    if(blocked())return blockedResult();
    if(who?.id!==accountId||who?.name!=='43__'||!await live())return {message:'本人・停止状態を確認できず参加保留'};
    const next={...job,url:entry.url,plan:selected.plan};
    if(!await reserve(next))return {message:'参加済み・作者待機・本日の参加枠により見送り'};
    if(blocked()||!await live())return blocked()?blockedResult():{message:'停止・待機のため参加保留'};
    if((await form('act',{plan:selected.plan,wasFollowing,signature:check.signature})).state!=='clicked')return {message:'参加直前の条件が変わったため保留'};
    await pause520(1000);
    if(blocked())return blockedResult();
    // A new page read, never the optimistic local success banner.
    await command('Page.navigate',{url:entry.url});
    const verified=await wait(()=>form('verify',{plan:selected.plan}),r=>r.state==='confirmed');
    const after=await relation();
    if(blocked())return blockedResult();
    return {confirmed:!!verified,followChanged:wasFollowing!==true&&after===true,message:wasFollowing!==true&&after===true?
      '参加後に新しいフォローを検出・追加参加を停止しました':verified?'0円プランへの参加をnoteで確認':'参加操作済み・noteで結果確認待ち'};
  },env.TRACE);
}
async function outreachOpportunity16910(env,state,settings,token,ownIds,markSending,bump) {
  const now=Date.now(),utc=Math.floor(now/(24*HOUR));
  const [states,discoveries]=await env.DB.batch([sql(env,'SELECT * FROM nh_v16910_state WHERE slot=?',env.SLOT),sql(env,'SELECT * FROM nh_v1697_discovery WHERE slot=?',env.SLOT)]);
  const s=states.results[0],d=discoveries.results[0];
  const deferred=browserWait16916(env.BROWSER);
  if(deferred)return s.pending?{handled:true,message:'前回操作は再送せず・'+deferred.message}:null;
  if(d.pending || (!s.pending && d.due>now))return null;
  let job=s.pending?await sql(env,'SELECT * FROM nh_v16910_actions WHERE key=? AND slot=?',s.pending,env.SLOT).first():null;
  if(s.pending && !job)throw new Trouble('追加操作の確認記録を読み出せません','config');
  if(job){job.recover=true;markSending();}
  const is520=env.TRACE?.identity?.owner==='43__';
  const kind=job?.kind||(d.turn%8===2?'qa':d.turn%8===4&&is520?'board':d.turn%8===6&&is520?'member':null);
  if(!kind)return null;
  const record=message=>sql(env,kind==='board'?'UPDATE nh_v16912_state SET message=? WHERE slot=?':'UPDATE nh_v16910_state SET '+(kind==='qa'?'qa_message':'member_message')+'=? WHERE slot=?',message,env.SLOT).run();
  if(['member','board'].includes(kind) && !job?.recover && !env.MEMBER_GATE16910?.()){
    await record('作品管理の自動運転が休止中・0円参加と掲示板スキも休止中');return null;
  }
  if(typeof env.BROWSER?.acquire!=='function'){
    await record('BROWSERの接続待ち');return job?{handled:true,message:'追加操作の結果は未確認・BROWSERの接続待ち'}:null;
  }
  if(d.utc_day===utc&&d.used>=12){await record('他の追加機能を含む共通探索枠12回に達したため翌日に確認（この機能の実行回数ではありません）');return job?{handled:true,message:'前回操作は再送せず翌日の確認待ち'}:null;}
  if(!job){
    if(kind==='member'&&(s.member_blocked || s.member_day===day()&&s.member_used>=1))return null;
    if(kind==='board'){
      const candidate=await sql(env,'SELECT * FROM nh_v16912_boards WHERE slot=? AND due<=? ORDER BY due,owner LIMIT 1',env.SLOT,now).first();
      if(!candidate)return null;
      await sql(env,'UPDATE nh_v16912_boards SET due=? WHERE slot=? AND owner=?',now+30*60000,env.SLOT,candidate.owner).run();
      if(ownIds.has(candidate.author))return null;
      job={...candidate,kind};
    }else{
    const field=kind==='qa'?'qa_due':'member_due';
    const candidate=await sql(env,`SELECT q.* FROM nh_v16910_sources q WHERE q.slot=? AND q.${field}<=? AND q.seen>? ORDER BY q.${field},q.owner LIMIT 1`,env.SLOT,now,now-14*24*HOUR).first();
    if(!candidate)return null;
    await sql(env,`UPDATE nh_v16910_sources SET ${field}=? WHERE slot=? AND owner=?`,now+30*60000,env.SLOT,candidate.owner).run();
    if(ownIds.has(candidate.author))return null;
    job={...candidate,kind,url:'https://note.com/'+(kind==='qa'?'qa/':'')+candidate.owner};
    }
  }
  if(!await liveDiscovery1697(env,token))return {handled:true,message:'停止・待機のため追加処理を終了'};
  if(job.recover){
    if(job.verifications>=3){await settleOutreach16910(env,job,false);await record('3回の読み取りで結果未確認・再送せず除外');return {handled:true,message:'前回の追加操作は結果未確認・再送せず次の候補へ'};}
    await sql(env,'UPDATE nh_v16910_actions SET verifications=verifications+1 WHERE key=?',job.key).run();
  }else{
    const n=await article(env,job.source);
    if(!publicFiction1697(n)||String(n.user.id)!==job.author||n.user.urlname!==job.owner){await record('現在の文芸作品・作者を確認できず・保留');return null;}
    const last=await sql(env,'SELECT last_at FROM nh_v15_authors WHERE author=?',job.author).first();
    if(last?.last_at>now-settings.author_hours*HOUR){
      if(kind==='board')await sql(env,'UPDATE nh_v16912_boards SET due=MAX(due,?) WHERE slot=? AND owner=?',last.last_at+settings.author_hours*HOUR,env.SLOT,job.owner).run();
      else {
        const field=kind==='qa'?'qa_due':'member_due';
        await sql(env,'UPDATE nh_v16910_sources SET '+field+'=MAX('+field+',?) WHERE slot=? AND owner=?',last.last_at+settings.author_hours*HOUR,env.SLOT,job.owner).run();
      }
      await record('同じ作者への待機中');return null;
    }
  }
  // Shared browser-attempt budget is charged after source preflight and before opening the browser, including failures.
  const claim=await claimDiscovery16919(env,d,Date.now(),!job.recover);
  if(!claim)return null;
  bump(kind==='board'?'board_checks':kind==='qa'?'qa_checks':'member_checks');
  if(kind==='board')await sql(env,'UPDATE nh_v16912_state SET checked=? WHERE slot=?',now,env.SLOT).run();
  await diagnostic16915(env,kind,'attempt','browser');
  let reserved=null,failure=null;
  const guard=async fn=>{try{return await fn();}catch(e){failure=e;throw e;}};
  const browser=kind==='board'?browserBoard16912:browserOutreach16910;
  const result=await browser(env,state.account,job,next=>guard(async()=>{
    const key=await reserveOutreach16910(env,token,settings,next);
    if(key){reserved={...next,key};markSending();}return !!key;
  }),()=>guard(async()=>await liveDiscovery1697(env,token) && (!['member','board'].includes(kind)||job.recover||!!env.MEMBER_GATE16910?.())),urls=>guard(()=>unseenBoardPosts16912(env,urls,job.owner)));
  if(failure)throw failure;
  if(result.browserDeferred && !reserved){
    await returnDiscovery16919(env,d,claim,Math.max(Date.now()+60000,result.retryAt),result.message);
    if(job.recover)await sql(env,'UPDATE nh_v16910_actions SET verifications=MAX(0,verifications-1) WHERE key=?',job.key).run();
    await record(result.message);await diagnostic16915(env,kind,'wait','browser');
    return job.recover?{handled:true,message:'前回操作は再送せず・'+result.message}:null;
  }
  if(result.followChanged)await sql(env,"UPDATE nh_v16910_state SET member_blocked=1,member_message='新しいフォローを検出・追加参加を停止。既存フォローは変更しません'").run();
  await record(result.message||'追加操作の確認待ち');
  await diagnostic16915(env,kind,result.confirmed?'confirmed':result.read?'read':'failed',result.stage||'browser');
  if(!job.recover && !result.code && !result.hold){
    const wait=result.read?24*HOUR:30*60000;
    if(kind==='board')await sql(env,'UPDATE nh_v16912_boards SET due=MAX(due,?) WHERE slot=? AND owner=?',Date.now()+wait,env.SLOT,job.owner).run();
    else await sql(env,'UPDATE nh_v16910_sources SET '+(kind==='qa'?'qa_due':'member_due')+'=MAX('+(kind==='qa'?'qa_due':'member_due')+',?) WHERE slot=? AND owner=?',Date.now()+wait,env.SLOT,job.owner).run();
  }
  if(result.code||result.hold)throw new Trouble(result.message,result.code===429?'rate':[401,403].includes(result.code)?'auth':'network',result.hold||0,result.code||0);
  if(job.recover || reserved){
    const target=reserved||job;
    if(result.confirmed || job.recover&&result.resolved){await settleOutreach16910(env,target,!!result.confirmed);if(result.confirmed)bump(kind==='board'?'board_sent':kind==='qa'?'qa_sent':'member_joined');}
    else throw new Trouble(result.message||'操作結果未確認・自動再送なし');
    return {handled:true,success:!!result.confirmed,message:result.message};
  }
  return null;
}

// One indexed schedule per confirmed free membership. Existing joins are imported
// once during prepare; later successful joins are inserted when they settle.
const boardSchema16912 = [
  `CREATE TABLE IF NOT EXISTS nh_v16912_state(slot TEXT PRIMARY KEY,sent INTEGER NOT NULL DEFAULT 0,checked INTEGER NOT NULL DEFAULT 0,message TEXT NOT NULL DEFAULT '0円プランへの参加確認待ち')`,
  `INSERT OR IGNORE INTO nh_v16912_state(slot) VALUES('1'),('2')`,
  `CREATE TABLE IF NOT EXISTS nh_v16912_boards(slot TEXT NOT NULL,owner TEXT NOT NULL,author TEXT NOT NULL,source TEXT NOT NULL,url TEXT NOT NULL,plan TEXT NOT NULL,due INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(slot,owner))`,
  `CREATE INDEX IF NOT EXISTS nh_v16912_board_due ON nh_v16912_boards(slot,due,owner)`,
  `CREATE INDEX IF NOT EXISTS nh_v16912_joined ON nh_v16910_actions(kind,status,slot)`,
  `INSERT OR IGNORE INTO nh_v16912_boards(slot,owner,author,source,url,plan)
    SELECT slot,owner,author,source,url,plan FROM nh_v16910_actions WHERE kind='member' AND status='confirmed'`
];
function boardPostURL16912(value,owner) {
  if(!/^[\w-]{1,80}$/.test(owner||''))return null;
  try {
    const u=new URL(value,'https://note.com');
    const match=/^\/([\w-]{1,80})\/membership\/boards\/([a-z0-9]{1,64})\/posts\/([a-z0-9]{1,64})\/?$/.exec(u.pathname);
    return u.origin==='https://note.com' && !u.username && !u.password && match?.[1]===owner ? u.origin+u.pathname.replace(/\/$/,'') : null;
  }catch{return null;}
}
// Only the owner's original board post. A comment's heart, an article card,
// membership checkout, or a heart with unknown state is never an action target.
function boardScreen16912(step,arg,postURL) {
  if(location.origin!=='https://note.com' || !/^[\w-]{1,80}$/.test(arg.owner||''))return {state:'page'};
  const path=location.pathname.replace(/\/$/,''),base='/'+arg.owner+'/membership';
  const canonical=document.querySelector('link[rel="canonical"]')?.href;
  try {const u=new URL(canonical);if(u.origin!==location.origin || u.pathname.replace(/\/$/,'')!==path)return {state:'canonical'};}catch{return {state:'canonical'};}
  const visible=e=>!!e?.getClientRects().length && !e.closest('[hidden],[aria-hidden="true"]');
  const all=(root,sel)=>[...root.querySelectorAll(sel)].filter(visible);
  const label=e=>(e.getAttribute('aria-label')||e.getAttribute('title')||e.innerText||'').trim();
  const main=document.querySelector('main,[role="main"]');if(!main)return {state:'page'};
  const blocked=all(document,'[role="dialog"],dialog[open]').length>0;
  if(blocked)return {state:'dialog'};
  if(step==='entry') {
    if(path!==base)return {state:'page'};
    const urls=all(main,'a[href]').filter(a=>/^(?:掲示板|掲示板を見る|すべての掲示板)$/.test(label(a))).map(a=>{
      try{const u=new URL(a.href);return u.origin===location.origin && !u.username && !u.password && u.pathname.replace(/\/$/,'')===base+'/boards'?u.origin+u.pathname:null;}catch{return null;}
    }).filter(Boolean);
    const found=[...new Set(urls)];return found.length===1?{state:'entry',url:found[0]}:{state:'missing'};
  }
  if(step==='list') {
    if(path!==base+'/boards')return {state:'page'};
    const posts=[...new Set(all(main,'a[href]').filter(a=>!a.closest('[data-testid*="comment"],[class*="Comment"],[class*="comment"]'))
      .map(a=>postURL(a.href,arg.owner)).filter(Boolean))].slice(0,8);
    return {state:'list',posts};
  }
  const url=postURL(location.href,arg.owner);
  if(!url || url!==arg.url)return {state:'page'};
  // Require the actual post heading, author and timestamp together. Never take
  // the first heart on the page or reuse a button handle after a navigation.
  const headings=all(main,'h1');if(headings.length!==1 || !headings[0].innerText.trim())return {state:'post'};
  const excluded='[data-testid*="comment"],[class*="Comment"],[class*="comment"],[id*="comment"],aside,nav,[role="dialog"]';
  const hearts=root=>all(root,'button,[role="button"]').filter(b=>!b.closest(excluded) &&
    (/^(?:投稿に)?スキ(?:する|をする|をつける|を取り消す|を取消す|済み)?$/.test(label(b)) ||
      (b.getAttribute('aria-pressed')!==null && /like|スキ/i.test((b.getAttribute('class')||'')+' '+(b.querySelector('svg')?.getAttribute('aria-label')||'')))));
  for(let root=headings[0].parentElement,depth=0;root && depth<9;root=root.parentElement,depth++) {
    if(root!==main && !main.contains(root))break;
    const buttons=hearts(root);
    if(buttons.length>1)return {state:'ambiguous'};
    const owners=[...new Set(all(root,'a[href]').filter(a=>!a.closest(excluded)).map(a=>{
      try{const u=new URL(a.href);return u.origin===location.origin && !u.username && !u.password?/^\/([\w-]{1,80})\/?$/.exec(u.pathname)?.[1]:null;}catch{return null;}
    }).filter(Boolean))];
    const times=all(root,'time[datetime]').filter(e=>!e.closest(excluded));
    const dated=times.some(t=>{const n=Date.parse(t.getAttribute('datetime'));return Number.isFinite(n) && n>0 && n<=Date.now();});
    if(buttons.length===1 && owners.length===1 && owners[0]===arg.owner && dated) {
      const b=buttons[0],name=label(b),pressed=b.getAttribute('aria-pressed');
      const conflict=pressed==='true'&&/スキ(?:する|をする|をつける)$/.test(name)||pressed==='false'&&/取り消す|取消す|済み/.test(name);
      const liked=conflict?null:pressed==='true'||/取り消す|取消す|済み/.test(name)?true:
        pressed==='false'||/スキ(?:する|をする|をつける)$/.test(name)?false:null;
      if(step==='read'||step==='verify')return {state:'post',liked};
      if(step!=='act'||liked!==false||b.disabled||b.getAttribute('aria-disabled')==='true')return {state:'unknown'};
      b.click();return {state:'clicked'};
    }
    if(root===main)break;
  }
  return {state:'post_unidentified'};
}
async function boardHash16912(url) {
  return b64(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(url)));
}
async function unseenBoardPosts16912(env,urls,owner) {
  const valid=[...new Set(urls.map(u=>boardPostURL16912(u,owner)).filter(Boolean))].slice(0,8);
  if(!valid.length)return [];
  const keys=await Promise.all(valid.map(async u=>'board:'+await boardHash16912(u)));
  const known=await sql(env,'SELECT key FROM nh_shared WHERE key IN ('+keys.map(()=>'?').join(',')+')',...keys).all();
  const seen=new Set(known.results.map(r=>r.key));
  return valid.filter((u,i)=>!seen.has(keys[i]));
}
async function browserBoard16912(env,accountId,job,reserve,live,unseen) {
  return inNoteBrowser(env.BROWSER,cleanCookie(env.NOTE_SESSION),false,async ({command,evaluate,blocked,blockedResult})=>{
    const membership='https://note.com/'+job.owner+'/membership';
    const form=(step,extra={})=>evaluate('('+BROWSER_SOURCES520.boardScreen16912+')('+JSON.stringify(step)+','+JSON.stringify({...job,...extra})+',('+BROWSER_SOURCES520.boardPostURL16912+'))');
    const fee=()=>evaluate('('+BROWSER_SOURCES520.outreachScreen16910+')("verify",'+JSON.stringify({...job,kind:'member'})+',('+BROWSER_SOURCES520.membershipPrice16910+'))');
    const wait=async(read,accept)=>{
      let previous='';
      for(let i=0;i<10&&!blocked();i++){
        let r;try{r=await read();}catch{}
        const signature=JSON.stringify(r);
        if(r&&accept(r)&&signature===previous)return r;
        previous=signature;await pause520(250);
      }
      return null;
    };
    const navigate=async url=>{if(blocked())return false;await command('Page.navigate',{url});return !blocked();};
    await navigate(membership);
    const who=await wait(()=>evaluate(noteIdentityJS),x=>!!x?.id);
    if(blocked())return blockedResult();
    if(who?.id!==accountId||who.name!=='43__')return {message:'掲示板：520本人を確認できず・操作なし'};
    const joined=await wait(fee,r=>['confirmed','off','price_changed','unknown'].includes(r.state));
    if(blocked())return blockedResult();
    if(joined?.state!=='confirmed')return {message:'掲示板：参加中の同じ0円プランを確認できず・保留'};
    let urls;
    if(job.recover) {
      const url=boardPostURL16912(job.url,job.owner);
      if(!url)return {message:'掲示板：前回投稿のリンクを確認できず・再送なし'};
      urls=[url];
    }else{
      const entry=await wait(()=>form('entry'),r=>r.state==='entry');
      if(blocked())return blockedResult();
      if(!entry)return {message:'掲示板：参加先の掲示板リンクを確認できず・次回再確認'};
      await navigate(entry.url);
      const list=await wait(()=>form('list'),r=>r.state==='list');
      if(blocked())return blockedResult();
      if(!list?.posts.length)return {message:'掲示板：読める投稿リンクが見つからず・次回再確認'};
      urls=(await unseen(list.posts)).slice(0,3);
    }
    let read=urls.length===0;
    for(const url of urls){
      if(blocked())return blockedResult();
      if(!await live())return {message:'掲示板：停止・待機のため操作保留'};
      await navigate(url);
      const post=await wait(()=>form('read',{url}),r=>r.state==='post'&&typeof r.liked==='boolean');
      if(blocked())return blockedResult();
      if(job.recover)return {resolved:!!post,confirmed:post?.liked===true,message:post?.liked===true?'掲示板：前回投稿へのスキを再読み込みで確認':'掲示板：前回のスキは未確認・再送なし'};
      if(post)read=true;
      if(!post||post.liked!==false)continue;
      // Re-read membership immediately before the write, then reload the post.
      await navigate(membership);
      const current=await wait(fee,r=>['confirmed','off','price_changed','unknown'].includes(r.state));
      const identity=await evaluate(noteIdentityJS);
      if(blocked())return blockedResult();
      if(current?.state!=='confirmed'||identity?.id!==accountId||identity.name!=='43__'||!await live())return {message:'掲示板：本人・0円参加・停止状態の再確認で保留'};
      await navigate(url);
      const fresh=await wait(()=>form('read',{url}),r=>r.state==='post'&&typeof r.liked==='boolean');
      if(blocked())return blockedResult();
      if(fresh?.liked!==false)continue;
      const hash=await boardHash16912(url);
      if(!await live() || !await reserve({...job,url,hash}))return {message:'掲示板：記事履歴・作者待機・停止状態により見送り'};
      if(blocked()||!await live())return blocked()?blockedResult():{message:'掲示板：停止・待機のため送信保留・再送なし'};
      if((await form('act',{url})).state!=='clicked')return {message:'掲示板：送信直前の投稿の状態が変わったため保留'};
      await pause520(1000);
      if(blocked())return blockedResult();
      await navigate(url);
      const verified=await wait(()=>form('verify',{url}),r=>r.state==='post'&&typeof r.liked==='boolean');
      if(blocked())return blockedResult();
      return {confirmed:verified?.liked===true,message:verified?.liked===true?'掲示板：投稿へのスキを再読み込みで確認':'掲示板：スキ操作済み・結果未確認（自動再送なし）'};
    }
    return {read,stage:'board_post',message:read?'掲示板：取得範囲の投稿は確認済み・送信対象なし':'掲示板：投稿者やスキ状態を確認できず・次回再確認'};
  },env.TRACE);
}

// Observed reciprocal article likes are an association, never a visit or conversion.
const learningSchema16913=[
  `CREATE TABLE IF NOT EXISTS nh_v16913_learning(slot TEXT PRIMARY KEY,turn INTEGER NOT NULL DEFAULT 0,due INTEGER NOT NULL DEFAULT 0,observed INTEGER NOT NULL DEFAULT 0,plan TEXT NOT NULL DEFAULT '[]')`,
  `INSERT OR IGNORE INTO nh_v16913_learning(slot) VALUES('1'),('2')`,
  `CREATE TABLE IF NOT EXISTS nh_v16913_contacts(slot TEXT NOT NULL,key TEXT NOT NULL,owner TEXT NOT NULL,account TEXT NOT NULL,source TEXT NOT NULL,sent INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending',confirmed INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(slot,key))`,
  `CREATE INDEX IF NOT EXISTS nh_v16913_contact_owner ON nh_v16913_contacts(slot,owner,confirmed DESC)`,
  `CREATE INDEX IF NOT EXISTS nh_v16913_contact_age ON nh_v16913_contacts(sent)`,
  `CREATE TABLE IF NOT EXISTS nh_v16913_response(slot TEXT NOT NULL,key TEXT NOT NULL,owner TEXT NOT NULL,article TEXT NOT NULL,published INTEGER NOT NULL,at INTEGER NOT NULL,token TEXT NOT NULL,PRIMARY KEY(slot,key),UNIQUE(slot,owner,article))`,
  `CREATE INDEX IF NOT EXISTS nh_v16913_response_age ON nh_v16913_response(at)`,
  `CREATE TABLE IF NOT EXISTS nh_v16913_scores(slot TEXT NOT NULL,day TEXT NOT NULL,source TEXT NOT NULL,sent INTEGER NOT NULL DEFAULT 0,responded INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(slot,day,source))`
];
function learningSource16913(tag,origin='') {
  return tag?'tag:'+tag:'reader:'+(['returning','overlap','curator'].includes(origin)?origin:'literary');
}
function learningReserve16913(env,key,note,source,token) {
  const owner=note.user?.urlname,identity=env.TRACE?.identity;
  if(!/^[\w-]{1,80}$/.test(owner||'') || !identity?.id || owner===identity.owner)return [];
  return [sql(env,`INSERT OR IGNORE INTO nh_v16913_contacts(slot,key,owner,account,source,sent)
    SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM nh_control WHERE id=1 AND token=? AND inflight=?)`,
    env.SLOT,key,owner,identity.id,source,Date.now(),token,key)];
}
function learningConfirmed16913(env,key,ok) {
  const items=[];
  if(ok)items.push(sql(env,`INSERT INTO nh_v16913_scores(slot,day,source,sent)
    SELECT slot,?,source,1 FROM nh_v16913_contacts WHERE slot=? AND key=? AND status='pending'
    ON CONFLICT(slot,day,source) DO UPDATE SET sent=sent+1`,day(),env.SLOT,key));
  items.push(sql(env,`UPDATE nh_v16913_contacts SET status=?,confirmed=? WHERE slot=? AND key=? AND status='pending'`,ok?'confirmed':'unknown',ok?Date.now():0,env.SLOT,key));
  return items;
}
async function learningObserve16913(env,owners,article,identity) {
  const now=Date.now(),pub=Date.parse(article.publishAt||article.publish_at||article.publishedAt);
  // A like on a newly published article must be later than publication. Merely
  // noticing a like on an old article does not establish when it happened.
  if(identity?.id!==env.TRACE?.identity?.id || article.user?.urlname!==identity.owner ||
    String(article.user?.id)!==identity.id || article.status!=='published' || !/^n[a-z0-9]{1,64}$/.test(article.key||'') ||
    !Number.isFinite(pub) || pub<=now-14*D520 || pub>now)return;
  const names=[...new Set(owners)].filter(o=>/^[\w-]{1,80}$/.test(o)&&o!==identity.owner).slice(0,20);
  await sql(env,'UPDATE nh_v16913_learning SET observed=? WHERE slot=?',now,env.SLOT).run();
  if(!names.length)return;
  const matches=await sql(env,`SELECT * FROM nh_v16913_contacts WHERE slot=? AND owner IN (${names.map(()=>'?').join(',')})
    AND account=? AND status='confirmed' AND confirmed<? AND confirmed>=? ORDER BY confirmed DESC,key LIMIT 100`,env.SLOT,...names,identity.id,pub,pub-14*D520).all();
  networkCall16922(env,'repeat',matches.results,article);
  const seen=new Set();
  for(const contact of matches.results){
    if(seen.has(contact.owner))continue;
    seen.add(contact.owner);
    const token=crypto.randomUUID(),cohort=jstDay(contact.confirmed);
    await env.DB.batch([
      sql(env,`INSERT OR IGNORE INTO nh_v16913_response(slot,key,owner,article,published,at,token) VALUES(?,?,?,?,?,?,?)`,env.SLOT,contact.key,contact.owner,article.key,pub,now,token),
      sql(env,`UPDATE nh_v16913_scores SET responded=responded+1 WHERE slot=? AND day=? AND source=?
        AND EXISTS(SELECT 1 FROM nh_v16913_response WHERE slot=? AND key=? AND token=?)`,env.SLOT,cohort,contact.source,env.SLOT,contact.key,token),
      sql(env,'UPDATE nh_v16913_learning SET due=0 WHERE slot=?',env.SLOT)
    ]);
  }
}
function rankLearning16913(rows) {
  // Smoothed observed rate, with minimum evidence. Unseen reactions stay unknown.
  return rows.map(r=>({...r,score:(r.responded+1)/(r.sent+20)}))
    .sort((a,b)=>b.score-a.score || b.responded-a.responded || a.source.localeCompare(b.source));
}
async function learningChoice16913(env,settings,token) {
  const now=Date.now();
  const state=env.TRACE?.learning;
  if(!state)return {mode:'normal'};
  state.used=true;
  const plan=repeatRank16923(learningPlan16917(state.plan),networkCall16922(env,'repeatCounts')||[]);
  const winner=plan.find(r=>r.sent>=10 && r.responded>=2 && (r.source.startsWith('tag:')?settings.tags.includes(r.source.slice(4)):['reader:returning','reader:literary','reader:overlap','reader:curator'].includes(r.source)));
  if(!winner)return {mode:'normal'};
  // 1 in 4 slots is ordinary exploration. Its independent original cursor
  // prevents a preferred tag from starving the remaining tags.
  if(state.turn%4===0)return {mode:Math.floor(state.turn/4)%2?'explore_reader':'explore_tag'};
  return winner.source.startsWith('tag:')?{mode:'tag',tag:winner.source.slice(4)}:{mode:'reader',origin:winner.source.slice(7)};
}
async function runSnapshot16913(env) {
  const now=Date.now();
  const core=()=>[
    sql(env,'SELECT a.tags,a.author_hours,b.interval_seconds,b.scan_tags,b.scan_notes,b.empty_minutes FROM nh_v14_settings a JOIN nh_v15_settings b ON b.id=a.id WHERE a.id=1'),
    sql(env,'SELECT * FROM nh_control WHERE id=1')
  ];
  let results;
  try {
    // Four bounded queries as before. Learning and its gate share one point read.
    results=await env.DB.batch([...core(),
      sql(env,`SELECT l.*,COALESCE(a.due,0) aux_due FROM nh_v16913_learning l LEFT JOIN nh_v16917_aux a ON a.slot=l.slot WHERE l.slot=?`,env.SLOT),
      sql(env,`SELECT source,SUM(sent) sent,SUM(responded) responded FROM nh_v16913_scores
        WHERE slot=? AND day>=? AND EXISTS(SELECT 1 FROM nh_v16913_learning WHERE slot=? AND due<=?)
        AND NOT EXISTS(SELECT 1 FROM nh_v16917_aux WHERE slot=? AND due>?) GROUP BY source`,env.SLOT,day(27),env.SLOT,now,env.SLOT,now)
    ]);
  }catch(error){
    if(auxFatal16917(error))throw error;
    // Core settings/identity still have to be read successfully. Never guess.
    results=await env.DB.batch(core());
    await auxFault16917(env,'snapshot',error);
  }
  const row=results[0].results[0],tags=JSON.parse(row.tags);
  if(!Array.isArray(tags)||!tags.length)throw new Trouble('タグ設定を確認してください','config');
  if(results.length===4){
    try {
      const state=results[2].results[0];
      if(!state)throw new TypeError('missing learning row');
      env.TRACE.auxUntil=Number(state.aux_due)||0;
      if(env.TRACE.auxUntil>now)return {settings:{...row,tags},state:results[1].results[0]};
      const plan=state.due<=now?rankLearning16913(results[3].results):learningPlan16917(state.plan);
      learningPlan16917(plan);
      env.TRACE.learning={...state,refresh:state.due<=now,plan:JSON.stringify(plan)};
    }catch(error){await auxFault16917(env,'snapshot',error);}
  }
  return {settings:{...row,tags},state:results[1].results[0]};
}
function learningPersist16913(env) {
  const state=env.TRACE?.learning;
  if(!state?.used)return [];
  const now=Date.now(),items=[sql(env,`UPDATE nh_v16913_learning SET turn=turn+1,
    plan=CASE WHEN ? AND observed=? THEN ? ELSE plan END,due=CASE WHEN ? AND observed=? THEN ? ELSE due END
    WHERE slot=? AND turn=?`,+state.refresh,state.observed,state.plan,+state.refresh,state.observed,now+HOUR,env.SLOT,state.turn)];
  if(state.refresh)items.push(
    sql(env,'DELETE FROM nh_v16913_scores WHERE slot=? AND day<?',env.SLOT,day(60)),
    sql(env,'DELETE FROM nh_v16913_contacts WHERE rowid IN (SELECT rowid FROM nh_v16913_contacts WHERE sent<? ORDER BY sent LIMIT 64)',now-45*D520),
    sql(env,'DELETE FROM nh_v16913_response WHERE rowid IN (SELECT rowid FROM nh_v16913_response WHERE at<? ORDER BY at LIMIT 64)',now-45*D520));
  return items;
}
async function learningRecord16913(env,settings) {
  const rows=await sql(env,'SELECT * FROM nh_v16913_learning ORDER BY slot').all();
  return '【反応に応じた巡回先の調整】\n'+rows.results.map(r=>{
    let plan;try{plan=learningPlan16917(r.plan);}catch{plan=[];}
    const learned=plan.some(p=>p.sent>=10&&p.responded>=2 &&
      (p.source.startsWith('tag:')?settings.tags.includes(p.source.slice(4)):['reader:returning','reader:literary','reader:overlap','reader:curator'].includes(p.source)));
    return 'アカウント '+r.slot+'：'+(learned?'観測できた反応をもとに優先・4回に1回は通常探索':'比較用の記録を収集中・通常探索')+
      '\n自分の記事の読者を最後に確認：'+time(r.observed)+'\n'+plan.slice(0,8).map(p=>
        (p.source.startsWith('tag:')?'#'+p.source.slice(4):p.source==='reader:returning'?'自分の記事の読者':p.source==='reader:overlap'?'近い作品に共通する読者':p.source==='reader:curator'?'作品を紹介する作者':'文芸記事の読者')+
        '：記事スキ送信確認 '+p.sent+'件／後日公開した自分の記事に相手のスキを観測 '+p.responded+'件').join('\n');
  }).join('\n\n')+'\n直近28日の送信分。比較には1経路10件以上・反応2件以上が必要です。確認する読者一覧は一部です。未観測は無反応と断定せず、訪問・読了・送信による効果とは区別します。送信間隔と作者待機は維持します。';
}

// Resume the approved pipeline using existing credentials, proofs and pauses.
// Every network task is bounded; no uncertain write is queued for resending.
Object.assign(Desk520.prototype,{
  initPipeline16913(){
    if(this.one("SELECT 1 FROM sqlite_master WHERE name='desk_mag_verify16913'"))return;
    this.storage.transactionSync(()=>{
      this.rows("CREATE TABLE desk_mag_verify16913(article TEXT PRIMARY KEY,id TEXT NOT NULL,started INTEGER NOT NULL,due INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,done INTEGER NOT NULL DEFAULT 0,message TEXT NOT NULL DEFAULT '追加後の公開表示を確認待ち')");
      this.rows('CREATE INDEX desk_mag_verify_due16913 ON desk_mag_verify16913(done,due,article)');
      this.rows('CREATE INDEX IF NOT EXISTS desk_job_pipeline16913 ON desk_job(kind,target,phase)');
      this.rows('CREATE TABLE desk_join_handoff16913(id TEXT PRIMARY KEY,due INTEGER NOT NULL,at INTEGER NOT NULL,message TEXT NOT NULL)');
      this.rows(`INSERT INTO desk_mag_verify16913(article,id,started,due)
        SELECT subject,target,at,0 FROM desk_job WHERE kind='mag' AND phase IN ('sent','seen')`);
    });
  },
  pipelineActive16913(){
    return !!this.one('SELECT 1 FROM desk_cfg c JOIN desk_delivery d ON d.id=c.id WHERE c.id=1 AND c.enabled=1 AND d.enabled=1 AND c.blocked<=?',Date.now());
  },
  async handoffJoined16913(now){
    if(!this.pipelineActive16913())return;
    const j=this.one(`SELECT j.id,i.url,i.name,i.managed FROM desk_join j JOIN desk_import i ON i.id=j.id
      JOIN desk_member m ON m.id=j.id LEFT JOIN desk_join_handoff16913 h ON h.id=j.id
      WHERE j.phase='joined' AND j.proof>? AND m.mode<>'excluded' AND (h.due IS NULL OR h.due<=?)
      ORDER BY COALESCE(h.due,0),j.proof,j.id LIMIT 1`,now-2*D520,now);
    if(!j)return;
    this.rows("INSERT INTO desk_join_handoff16913(id,due,at,message) VALUES(?,?,?,'参加後の編集権限と掲載条件を再確認中') ON CONFLICT(id) DO UPDATE SET due=excluded.due,at=excluded.at,message=excluded.message",j.id,now+6*HOUR,now);
    // Existing checks enforce identity, current free status, publisher rules and
    // the saved exclusion. Success does not infer permission from an invite URL.
    await this.checkEditorial(j,now);
    if(!this.pipelineActive16913() || this.one('SELECT mode FROM desk_member WHERE id=?',j.id)?.mode!=='auto')return;
    this.rows('UPDATE desk_import SET due=0 WHERE id=? AND allowed=1 AND token=\'\'',j.id);
    await this.reviewMagazine(j.id,Date.now());
    if(!this.pipelineActive16913())return;
    const policy=this.one("SELECT 1 FROM desk_import WHERE id=? AND allowed=1 AND managed=1 AND state='利用中'",j.id);
    if(!policy){this.rows("UPDATE desk_join_handoff16913 SET message='参加を確認済み・現在の掲載条件を確認待ち' WHERE id=?",j.id);return;}
    const entries=await this.readIssue(j.url);
    if(!this.pipelineActive16913())return;
    const at=Date.now(),dates=entries.map(e=>Date.parse(e.pubdate)).filter(t=>Number.isFinite(t)&&t>0&&t<=at);
    this.storage.transactionSync(()=>{
      this.recordReferences(entries,noteLink161(j.url),j.name,at);
      this.rows("UPDATE desk_mag SET recent=?,last_check=?,rss_state='取得済み' WHERE url=? AND active=1",dates.length?Math.max(...dates):0,at,j.url);
      this.rows('UPDATE desk_pick_meta SET rev=rev+1 WHERE id=1');
      this.rows("UPDATE desk_join_handoff16913 SET due=?,message='編集権限・掲載条件・最新号を確認済み。対象作品を次の掲載枠で照合' WHERE id=?",at+D520,j.id);
      this.match(at);this.planArchive(at);
    });
  },
  async verifyPlacement16913(now,selected=null){
    if(!this.pipelineActive16913())return;
    const p=selected?this.one('SELECT * FROM desk_mag_verify16913 WHERE article=? AND id=? AND done<>1',selected.article,selected.id):
      this.one('SELECT * FROM desk_mag_verify16913 WHERE done=0 AND due<=? ORDER BY due,article LIMIT 1',now);
    if(!p)return;
    const job=this.one("SELECT phase FROM desk_job WHERE kind='mag' AND article=? AND target=?",p.article,p.id);
    if(job?.phase==='confirmed' || this.one('SELECT 1 FROM desk_ref WHERE article=? AND id=?',p.article,p.id)){
      this.rows("UPDATE desk_mag_verify16913 SET done=1,message='公開表示で掲載を確認済み' WHERE article=? AND id=?",p.article,p.id);return;
    }
    if(!job || !['sent','seen'].includes(job.phase)){
      this.rows("UPDATE desk_mag_verify16913 SET done=2,message='追加操作の記録がないため確認対象外' WHERE article=? AND id=?",p.article,p.id);return;
    }
    if(!selected && (p.attempts>=8 || now-p.started>7*D520)){
      this.rows("UPDATE desk_mag_verify16913 SET done=2,message='追加結果は未確認。個別の再確認枠を終了・再送なし。通常の誌面確認は継続' WHERE article=? AND id=?",p.article,p.id);return;
    }
    const imported=this.one('SELECT url,name FROM desk_import WHERE id=?',p.id);
    const target=this.joinTarget520(p.id),link=noteLink161(imported?.url||target?.url||'');
    if(!link){this.rows("UPDATE desk_mag_verify16913 SET done=2,message='対象誌の公開URLを確認できません・再送なし' WHERE article=? AND id=?",p.article,p.id);return;}
    this.rows('UPDATE desk_mag_verify16913 SET due=? WHERE article=? AND id=?',now+Math.min(24,2**p.attempts)*HOUR,p.article,p.id);
    let proved=false,read=false,reason='公開表示では掲載をまだ確認できません・再送なし';
    try{
      const entries=await this.readIssue(link.url);
      if(!this.pipelineActive16913())return;
      read=true;
      this.storage.transactionSync(()=>this.recordReferences(entries,link,imported?.name||target?.name,Date.now()));
      proved=!!this.one('SELECT 1 FROM desk_ref WHERE article=? AND id=?',p.article,p.id);
    }catch{reason='誌面の取得を再試行待ち・再送なし';}
    if(!proved && this.pipelineActive16913()){
      try{
        // A busy magazine can push an addition off its latest RSS page. The
        // published article's explicit magazine list supplies another proof.
        const n=(await this.publicRead('https://note.com/api/v3/notes/'+p.article,'json'))?.data;
        const pub=Date.parse(n?.publishAt||n?.publish_at||n?.publishedAt);
        if(n?.key===p.article&&n.status==='published'&&n.user?.urlname==='43__'&&Number.isFinite(pub)&&pub<=Date.now()&&Array.isArray(n.magazines))read=true;
        const listed=n?.key===p.article && n.status==='published' && n.user?.urlname==='43__' && Number.isFinite(pub) && pub<=Date.now() &&
          Array.isArray(n.magazines) && n.magazines.some(m=>{
            const l=noteLink161(m?.magazineUrl||m?.magazine_url||m?.url||'');
            return l?.id===p.id && (!l.owner || !link.owner || l.owner===link.owner) && (!m.key || m.key===p.id);
          });
        if(listed && this.pipelineActive16913()){
          this.storage.transactionSync(()=>{
            this.rows('INSERT OR IGNORE INTO desk_ref(article,id,name,url,observed) VALUES(?,?,?,?,?)',p.article,p.id,imported?.name||target?.name||p.id,link.url,Date.now());
            this.rows("UPDATE desk_job SET phase='confirmed',at=?,message='公開記事の掲載マガジン一覧で追加先を確認済み' WHERE kind='mag' AND article=? AND target=? AND phase IN ('sent','seen')",Date.now(),p.article,p.id);
          });
          proved=true;
        }
      }catch{ /* An unavailable page never confirms a placement. */ }
    }
    if(!this.pipelineActive16913())return;
    this.rows('UPDATE desk_mag_verify16913 SET attempts=attempts+?,done=?,message=? WHERE article=? AND id=?',+read,proved?1:0,proved?'公開表示で掲載を確認済み':reason,p.article,p.id);
  },
  pipelineView16913(){
    const rows=this.rows(`SELECT j.id,i.name,j.phase,j.proof,j.message,i.allowed,i.state,i.reason,m.mode,
      (SELECT COUNT(*) FROM desk_invite v WHERE v.id=j.id AND v.phase='wait') invitations,
      (SELECT COUNT(*) FROM desk_job q WHERE q.kind='mag' AND q.target=j.id AND q.phase IN ('sent','seen')) pending,
      (SELECT COUNT(*) FROM desk_ref r WHERE r.id=j.id) confirmed,
      h.message handoff FROM desk_join j JOIN desk_import i ON i.id=j.id LEFT JOIN desk_member m ON m.id=j.id
      LEFT JOIN desk_join_handoff16913 h ON h.id=j.id ORDER BY j.at DESC,j.id LIMIT 40`);
    const checks=this.rows('SELECT message FROM desk_mag_verify16913 ORDER BY started DESC LIMIT 5');
    return {active:this.pipelineActive16913(),rows,checks,distribution:this.distributionView16918(Date.now())};
  }
});
function pipelineRecord16913(p) {
  if(!p)return '';
  const lines=['【共同誌：参加から掲載まで】'+(p.active?'自動確認ON':'休止・待機中')];
  if(p.distribution){const d=p.distribution;lines.push(
    '今日の申請操作 '+d.applications+'/'+DISTRIBUTION16918.applications+'誌 ／ 本人画面の確認 '+d.checks+'/'+DISTRIBUTION16918.checks+'回（日本時間0時更新）',
    '今日の掲載操作 '+d.placements+'/'+DISTRIBUTION16918.placements+'件 ／ うち公開30日以上の既刊 '+d.old+'件（日本時間9時更新）',
    '新作と既刊を交互に、未掲載の複数誌へ順番に追加します。掲載は15分以上、同じ作品は2時間以上あけます。作品ごとの累計誌数に固定上限はありません。',
    '各誌の募集条件・投稿上限を優先します。操作件数には結果未確認を含み、掲載成功は下の公開確認で判断します。同じ作品を同じ誌へ再送・削除再追加しません。');} 
  if(p.distribution?.outcomes){const o=p.distribution.outcomes;lines.push(
    '申請経路を登録 '+o.targets+'誌 ／ 未申請 '+o.waiting+'誌 ／ 申請・招待の確認待ち '+o.pending+'誌 ／ 参加確認 '+o.joined+'誌',
    '自動掲載の公開確認 '+o.confirmed+'件 ／ 掲載操作後の確認待ち '+o.unconfirmed+'件',
    '公開探索は1日192ページ、募集方法は1日48誌まで確認します。未申請には条件未確認・除外済みを含みます。成功数が0のままなら下の保留理由を確認してください。');}
  for(const r of p.rows){
    const stage=r.mode==='excluded'?'除外済み':r.pending?'追加後の公開確認':r.phase==='joined'?
      r.mode==='auto'&&r.allowed&&r.state==='利用中'?'掲載条件に合う作品の選定・掲載枠待ち':'参加後の編集権限・掲載条件の確認':
      r.invitations?'受信済み招待の承認確認':['sent','applied','accepting'].includes(r.phase)?r.phase==='accepting'?'承認後の参加確認':'相手からの招待待ち':'参加申請の条件確認';
    lines.push(r.name+' ／ '+stage+' ／ 追加後の確認待ち '+r.pending+'件 ／ 公開表示で掲載確認 '+r.confirmed+'件',r.message);
    if(r.phase==='joined' && r.handoff)lines.push(r.handoff);
    if(r.allowed && r.state!=='利用中' && r.reason)lines.push('掲載条件：'+r.reason);
  }
  if(!p.rows.length)lines.push('参加経路を確認できる誌を探索中');
  lines.push(...p.checks.map(c=>c.message),'招待を送るかどうかは相手の判断です。申請・承認の開始は参加成功ではなく、掲載確認は読者の訪問を意味しません。');
  return lines.join('\n');
}

// Native dashboard read-only collection; documented fields and date semantics:
// https://www.help-note.com/hc/ja/articles/360010324194
// https://www.help-note.com/hc/ja/articles/61983634535449
function trafficScreen16913(step='read') {
  if(location.origin!=='https://note.com' || !/^\/dashboard\/?$/.test(location.pathname))return {state:'page'};
  const visible=e=>!!e?.getClientRects().length && !e.closest('[hidden],[aria-hidden="true"]');
  const root=document.querySelector('main,[role="main"]')||document.body;
  if(!root)return {state:'loading'};
  const clean=t=>(t||'').normalize('NFKC').replace(/[\u200b\u200e\u200f]/g,'').trim();
  const all=s=>[...root.querySelectorAll(s)].filter(visible);
  const text=clean(root.innerText),header=text.split(/直近1[ヶかケ]月のまとめ|あなたへの提案|記事の流入元/)[0];
  if(!/アクセス状況/.test(text) || !/インプレッション/.test(header) || !/ページビュー/.test(header))return {state:'layout'};
  if(/この期間のデータはありません|集計中|読み込み中/.test(header))return {state:'loading'};
  const stamps=[...header.matchAll(/(\d{4})[\/年.-](\d{1,2})[\/月.-](\d{1,2})日?\s*(?:〜|～|~|–|−|—|-|から)\s*(?:(\d{4})[\/年.-])?(\d{1,2})[\/月.-](\d{1,2})日?/g)];
  const dates=[...new Set(stamps.map(m=>JSON.stringify([m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'),(m[4]||m[1])+'-'+m[5].padStart(2,'0')+'-'+m[6].padStart(2,'0')])))] ;
  if(dates.length!==1)return {state:'period'};
  const [start,end]=JSON.parse(dates[0]);
  if(step==='previous'){
    // Only the displayed dashboard's period navigation, never account settings.
    const controls=all('button').filter(b=>!b.disabled && b.getAttribute('aria-disabled')!=='true' &&
      /^(?:前の期間(?:へ|に移動|を表示)?|前期間|Previous period)$/i.test(clean(b.getAttribute('aria-label')||b.getAttribute('title')||b.innerText)));
    if(controls.length!==1)return {state:'previous_missing'};
    controls[0].click();return {state:'moved',start,end};
  }
  const values={},labels={impressions:'インプレッション',pageviews:'ページビュー',likes:'スキ',comments:'コメント'};
  const nodes=all('span,p,dt,dd,div,button,strong,h2,h3');
  for(const [key,label] of Object.entries(labels)){
    const found=new Set();
    for(const el of nodes.filter(e=>clean(e.innerText)===label)){
      // Summary metric cards have one label and one exact count. Article rows,
      // charts, menus and comparison percentages cannot pass this whole match.
      for(let p=el.parentElement,n=0;p&&p!==root&&n<4;p=p.parentElement,n++){
        const value=clean(p.innerText).replace(/\s/g,'');
        const match=new RegExp('^(?:'+label+'([0-9,]+|[-−–—])(?:回|件)?|([0-9,]+|[-−–—])(?:回|件)?'+label+')$').exec(value);
        if(match){
          const raw=match[1]||match[2];
          if(/^[0-9]+$|^[1-9][0-9]{0,2}(?:,[0-9]{3})+$/.test(raw))found.add(Number(raw.replaceAll(',','')));
          // note documents '-' as zero for the modern metrics. Do not apply it
          // to pre-2021 impressions or missing/unavailable data.
          else if(/^[-−–—]$/.test(raw) && start>='2021-05-01')found.add(0);
          break;
        }
      }
    }
    if(found.size!==1 || !Number.isSafeInteger([...found][0]))return {state:'metrics',field:key};
    values[key]=[...found][0];
  }
  const updated=[...header.matchAll(/(\d{4}[\/年.-]\d{1,2}[\/月.-]\d{1,2}日?\s+\d{1,2}:\d{2}(?::\d{2})?)\s*集計/g)].map(m=>m[1]);
  const refText=text.split('記事の流入元').slice(1).join('記事の流入元'),referrers=[];
  const pattern=/((?:[a-z0-9-]+\.)+[a-z]{2,63}|no referrer|other|流入元不明|X|Facebook|Google|Instagram)\s+(\d+(?:\.\d+)?)\s*%\s*\(\s*([\d,]+)\s*PV\s*\)/gi;
  for(const m of refText.matchAll(pattern)){
    const count=Number(m[3].replaceAll(',','')),share=Number(m[2]),name=m[1];
    if(Number.isSafeInteger(count)&&count>=0&&share>=0&&share<=100&&!referrers.some(r=>r.name===name))referrers.push({name,pageviews:count,share});
  }
  if(referrers.length>12)return {state:'referrers'};
  return {state:'ready',start,end,...values,updated:updated.length===1?updated[0]:'',referrers,
    referrersRead:referrers.length>0,signature:JSON.stringify([start,end,values,updated,referrers])};
}
function trafficValid16913(data,now=Date.now()) {
  return !!data && date520(data.start) && date520(data.end) && data.start<=data.end && data.end<=jstDay(now) &&
    ['impressions','pageviews','likes','comments'].every(k=>Number.isSafeInteger(data[k])&&data[k]>=0) &&
    Array.isArray(data.referrers) && data.referrers.length<=12 && data.referrers.every(r=>
      typeof r.name==='string' && r.name.length<=100 && !/[<>@\/:\r\n]/.test(r.name) && Number.isSafeInteger(r.pageviews) && r.pageviews>=0 && Number.isFinite(r.share) && r.share>=0 && r.share<=100) &&
    typeof data.updated==='string' && data.updated.length<=50;
}
function trafficComparable16913(current,previous) {
  return trafficValid16913(current) && trafficValid16913(previous) && previous.end<current.start &&
    jstStart(current.end)-jstStart(current.start)===jstStart(previous.end)-jstStart(previous.start) &&
    jstStart(previous.end)+D520===jstStart(current.start);
}
async function browserTraffic16913(binding,cookie,id,live) {
  return inNoteBrowser(binding,cookie,false,async({command,evaluate,blocked,blockedResult})=>{
    await command('Emulation.setTimezoneOverride',{timezoneId:'Asia/Tokyo'});
    await command('Page.navigate',{url:'https://note.com/dashboard'});
    const form=step=>evaluate('('+BROWSER_SOURCES520.trafficScreen16913+')('+JSON.stringify(step)+')');
    const read=async previous=>{
      let last='',state;
      for(let n=0;n<16&&!blocked();n++){
        try{state=await form('read');}catch{state={state:'loading'};}
        if(state?.state==='ready' && state.signature===last && state.signature!==previous)return state;
        last=state?.signature||'';await pause520(300);
      }
      return state?.state==='ready'?{state:'unstable'}:state;
    };
    const current=await read('');
    if(blocked())return blockedResult();
    const identity=await evaluate(noteIdentityJS);
    if(blocked())return blockedResult();
    if(identity?.id!==id || identity.name!=='43__')return {message:'アクセス状況の本人を確認できず・記録保留'};
    if(current?.state!=='ready' || !trafficValid16913(current))return {message:'アクセス状況の'+({period:'対象期間',metrics:'指標と正確な件数',layout:'新しい画面',referrers:'流入元',unstable:'安定した数値'}[current?.state]||'読み込み')+'を確認待ち'};
    let previous=null;
    if(await live() && (await form('previous')).state==='moved'){
      const row=await read(current.signature);
      if(blocked())return blockedResult();
      if(row?.state==='ready' && trafficComparable16913(current,row))previous=row;
    }
    if(!await live())return {message:'停止・待機・処理期限のためアクセス状況の保存を保留'};
    return {current,previous,message:'noteのアクセス状況を取得'+(previous?'・前期間との比較あり':'・前期間は未取得')+(current.referrersRead?'':'・流入元の内訳は未取得')};
  });
}
Object.assign(Desk520.prototype,{
  initTraffic16913(){
    if(this.one("SELECT 1 FROM sqlite_master WHERE name='desk_traffic16913'"))return;
    this.storage.transactionSync(()=>{
      this.rows("CREATE TABLE desk_traffic16913(id INTEGER PRIMARY KEY,due INTEGER NOT NULL DEFAULT 0,checked INTEGER NOT NULL DEFAULT 0,message TEXT NOT NULL DEFAULT 'アクセス状況の初回取得待ち',payload TEXT NOT NULL DEFAULT '{}')");
      this.rows('INSERT INTO desk_traffic16913(id) VALUES(1)');
      this.rows('CREATE TABLE desk_traffic_history16913(day TEXT PRIMARY KEY,checked INTEGER NOT NULL,payload TEXT NOT NULL)');
    });
  },
  async trafficTick16913(now){
    if(browserWait16916(this.env.BROWSER))return;
    const state=this.one('SELECT due FROM desk_traffic16913 WHERE id=1');
    const active=()=>!!this.one('SELECT 1 FROM desk_cfg c JOIN desk_delivery d ON d.id=c.id WHERE c.id=1 AND c.enabled=1 AND d.enabled=1 AND c.blocked<=?',Date.now());
    if(state.due>now || !active() || this.one('SELECT 1 FROM desk_link_plan WHERE pub IS NULL AND scheduled BETWEEN ? AND ? LIMIT 1',now-5*M520,now+6*M520) ||
      this.one('SELECT 1 FROM desk_work_schedule WHERE pub IS NULL AND scheduled BETWEEN ? AND ? LIMIT 1',now-5*M520,now+6*M520))return;
    this.rows('UPDATE desk_traffic16913 SET due=? WHERE id=1',now+6*HOUR);
    let message='アクセス状況の接続を再確認待ち',env,token;
    try{
      if(typeof this.env.BROWSER?.acquire!=='function'){message='BROWSER設定の確認待ち';return;}
      const identity=await this.deliveryAccount();
      if(!identity || identity.until>now){message='520本人の接続・処理・待機の終了後に取得';this.rows('UPDATE desk_traffic16913 SET due=? WHERE id=1',Math.max(now+4*M520,identity?.until||now+2*HOUR));return;}
      env=scoped(this.env,identity.slot);token=await acquire(env,false);
      if(!token){message='520の処理終了後に取得';this.rows('UPDATE desk_traffic16913 SET due=? WHERE id=1',now+4*M520);return;}
      const credential=await loadCookie(env,identity.id);
      let failure=null;
      const live=async()=>{
        try{
          const row=await sql(env,'SELECT c.account,c.token,c.lease,c.next_at,h.kind,n.hold_until FROM nh_control c JOIN nh_health h ON h.id=c.id JOIN nh_v13_connection n ON n.slot=? WHERE c.id=1',identity.slot).first();
          return active()&&row?.account===identity.id&&row.token===token&&row.lease>Date.now()&&row.hold_until<=Date.now()&&(!row.kind||row.next_at<=Date.now());
        }catch(e){failure=e;throw e;}
      };
      const result=await browserTraffic16913(this.env.BROWSER,cleanCookie(credential.NOTE_SESSION),identity.id,live);
      if(failure)throw failure;
      message=result.message;
      if(result.hold>0){
        const until=Date.now()+result.hold;
        this.rows('UPDATE desk_cfg SET blocked=MAX(blocked,?) WHERE id=1',until);
        this.rows('UPDATE desk_traffic16913 SET due=MAX(due,?) WHERE id=1',until);
        await sql(this.env,'UPDATE nh_v13_connection SET hold_until=MAX(hold_until,?) WHERE slot=?',until,identity.slot).run();
      }
      if(result.current && trafficValid16913(result.current) && await live()){
        const take=r=>r?Object.fromEntries(['start','end','impressions','pageviews','likes','comments','updated','referrers','referrersRead'].map(k=>[k,r[k]])):null;
        const payload=JSON.stringify({current:take(result.current),previous:take(result.previous)}),at=Date.now();
        this.storage.transactionSync(()=>{
          if(!active())return;
          this.rows('UPDATE desk_traffic16913 SET checked=?,payload=? WHERE id=1',at,payload);
          this.rows('INSERT INTO desk_traffic_history16913(day,checked,payload) VALUES(?,?,?) ON CONFLICT(day) DO UPDATE SET checked=excluded.checked,payload=excluded.payload',jstDay(at),at,payload);
          this.rows('DELETE FROM desk_traffic_history16913 WHERE day<?',jstDay(at-90*D520));
        });
      }
    }catch(error){
      message=readLimit(error)?'D1の読み取り枠更新後に取得':'アクセス状況を読み戻せず・次回に再確認';
      if(readLimit(error))this.rows('UPDATE desk_traffic16913 SET due=? WHERE id=1',(Math.floor(Date.now()/D520)+1)*D520+M520);
    }finally{
      try{this.rows('UPDATE desk_traffic16913 SET message=? WHERE id=1',message);}
      finally{if(token)await release(env,token);}
    }
  },
  trafficView16913(){
    const row=this.one('SELECT * FROM desk_traffic16913 WHERE id=1');
    return {...row,payload:JSON.parse(row.payload)};
  }
});
function trafficRecord16913(row) {
  if(!row)return '';
  const {current,previous}=row.payload;
  const lines=['【noteでの閲覧・表示・流入】',row.message,'最後の取得：'+time(row.checked)+' ／ 次回：'+time(row.due)];
  if(current){
    lines.push('対象期間：'+current.start+'〜'+current.end+'（日本時間）',
      'ページビュー '+current.pageviews+' ／ インプレッション '+current.impressions+' ／ 受けたスキ '+current.likes+' ／ コメント '+current.comments,
      'noteの集計表示：'+(current.updated||'日時は取得できませんでした'));
    if(previous && trafficComparable16913(current,previous)){
      const delta=current.pageviews-previous.pageviews;
      lines.push('前期間 '+previous.start+'〜'+previous.end+'：'+previous.pageviews+'PV ／ 増減 '+(delta>0?'+':'')+delta+'PV');
    }
    lines.push('流入元：'+(current.referrersRead?current.referrers.map(r=>r.name+' '+r.pageviews+'PV（'+r.share+'%）').join(' ／ '):'未取得'));
  }
  lines.push('PVは記事が開かれた回数で、人数・読了数ではありません。自分の閲覧も含まれます。集計には遅れがあり、当日を含む期間は途中です。note.comの流入内訳から個別のスキ・共同誌の効果は判定できません。');
  return lines.join('\n');
}

// Reconcile only an unambiguous link at the manuscript's own title and time.
// This chooses where to inspect; the editor must still match the complete manuscript before publishing.
Object.assign(Desk520.prototype, {
  publicationTarget16914(work) {
    if(work.key)return {key:work.key,conflict:''};
    const links=this.rows('SELECT article FROM desk_link_plan WHERE pub IS NULL AND title=? AND scheduled=? LIMIT 2',work.title,work.scheduled);
    if(!links.length)return {key:'',conflict:''};
    if(links.length!==1)return {key:'',conflict:'同じ日時・タイトルの共有リンクが複数あるため公開を保留'};
    const key=links[0].article;
    if(this.one('SELECT 1 FROM desk_work_schedule WHERE seq<>? AND (key=? OR (pub IS NULL AND key IS NULL AND title=? AND scheduled=?)) LIMIT 1',work.seq,key,work.title,work.scheduled))
      return {key:'',conflict:'同じ下書きに対応する完成稿を1件に特定できず公開を保留'};
    return {key,conflict:''};
  },
  initPublication16914() {
    if(this.one("SELECT 1 FROM sqlite_master WHERE name='desk_link_title16914'"))return;
    this.rows('CREATE INDEX desk_link_title16914 ON desk_link_plan(title,scheduled) WHERE pub IS NULL');
  }
});

// Read ordinary saved paragraphs with note's HTML attributes and inline formatting.
// Preserve spaces, line breaks and empty paragraphs. Unsupported content has no plain-text proof.
function plainDraft16914(html) {
  if(typeof html!=='string' || html.length>500000)return null;
  const parts=[],stack=[];
  let end=0,line='',children=0,soleBreak=false;
  for(const token of html.matchAll(/<\/?[a-z][a-z0-9]*(?:\s+(?:[^"'<>]|"[^"]*"|'[^']*')*)?\s*\/?>|[^<]+/gi)) {
    if(token.index!==end)return null;
    const value=token[0];end=token.index+value.length;
    if(value[0]!=='<') {
      if(!stack.length){if(value.trim())return null;continue;}
      if(/&(?!amp;|lt;|gt;|quot;|apos;|nbsp;|#(?:x[\da-f]+|\d+);)[a-z0-9#]+;/i.test(value))return null;
      if(stack.length===1){children++;soleBreak=false;}
      line+=xmlValue520(value.replace(/&nbsp;/gi,'\u00a0'));
      continue;
    }
    const name=/^<\/?([a-z0-9]+)/i.exec(value)[1].toLowerCase(),closing=value.startsWith('</');
    if(closing) {
      if(stack.pop()!==name)return null;
      if(!stack.length){parts.push(soleBreak&&children===1?'':line);line='';children=0;soleBreak=false;}
      continue;
    }
    if(!stack.length) {
      if(!['p','div'].includes(name)||value.endsWith('/>'))return null;
      stack.push(name);continue;
    }
    if(stack.length===1){children++;soleBreak=name==='br'&&children===1;}
    if(name==='br') {
      if(!/ProseMirror-trailingBreak/.test(attr161(value,'class')))line+='\n';
      continue;
    }
    if(!['span','strong','em','b','i','s','u','a','code'].includes(name)||value.endsWith('/>'))return null;
    stack.push(name);
  }
  return end===html.length && !stack.length && parts.length?parts.join('\n'):null;
}

Object.assign(Desk520.prototype,{
  async dispatch(now,publicationOnly=false,probe=null){
    // Cron and the alarm can arrive together. A single in-memory operation plus
    // durable job/account leases prevent duplicate publication across restarts.
    if(this.deliveryTask16915)return probe?undefined:this.deliveryTask16915;
    const work=this.dispatchUnlocked16915(now,publicationOnly,probe);
    this.deliveryTask16915=work;
    try{return await work;}finally{if(this.deliveryTask16915===work)this.deliveryTask16915=null;}
  },
  publicationAlarm16915(now){
    const cfg=this.one('SELECT c.enabled,c.blocked,d.enabled delivery FROM desk_cfg c JOIN desk_delivery d ON d.id=c.id WHERE c.id=1');
    if(!cfg?.enabled || !cfg.delivery || cfg.blocked>now)return null;
    const row=this.one(`SELECT MIN(scheduled) at FROM (
      SELECT l.scheduled FROM desk_link_plan l WHERE l.pub IS NULL AND l.scheduled>? AND l.scheduled<=?
        AND NOT EXISTS(SELECT 1 FROM desk_job j WHERE j.kind='publish' AND j.subject=l.article AND j.phase<>'wait')
      UNION ALL SELECT w.scheduled FROM desk_work_schedule w WHERE w.pub IS NULL AND w.locked=0 AND w.paused=0 AND w.scheduled>? AND w.scheduled<=?
        AND NOT EXISTS(SELECT 1 FROM desk_job j WHERE j.kind='publish' AND j.subject=CAST(w.seq AS TEXT) AND j.phase<>'wait'))`,now,now+120000,now,now+120000);
    return row?.at||null;
  }
});

// Optional discovery and learning cannot veto a proven ordinary article like.
// The only persistent gate has two primary-key rows. Never store exception text.
const auxSchema16917=[
  `CREATE TABLE IF NOT EXISTS nh_v16917_aux(slot TEXT PRIMARY KEY,due INTEGER NOT NULL DEFAULT 0,failed_at INTEGER NOT NULL DEFAULT 0,component TEXT NOT NULL DEFAULT '',reason TEXT NOT NULL DEFAULT '')`,
  `INSERT OR IGNORE INTO nh_v16917_aux(slot) VALUES('1'),('2')`
];
const AUX_COMPONENTS16917={diagnostics:'動作記録の保存',snapshot:'巡回先の学習データ',outreach:'質問箱・参加・掲示板',readers:'感想・読者の探索',selection:'巡回先の選択',queue:'保存した読者の確認',seed:'追加探索の候補保存',contact:'反応比較用の送信記録',confirmed:'反応比較用の成功記録',metrics:'巡回先の学習記録'};
function auxReason16917(error){
  if(error instanceof TypeError)return 'type';
  if(error instanceof SyntaxError)return 'format';
  if(/D1_ERROR|D1_EXEC_ERROR|D1_TYPE_ERROR/i.test(errorText(error)))return 'storage';
  if(error instanceof Trouble)return error.kind==='network'?'network':error.kind==='response'?'response':'internal';
  return 'internal';
}
function auxFatal16917(error){
  return readLimit(error) || error instanceof Trouble &&
    (error.retry>0 || [401,403,429].includes(error.code) || ['auth','rate','config','mismatch'].includes(error.kind));
}
async function auxFault16917(env,component,error){
  const trace=env.TRACE;
  if(!trace || trace.auxFault)return;
  component=Object.hasOwn(AUX_COMPONENTS16917,component)?component:'snapshot';
  const detail=AUX_ERRORS16919.get(error)||{operation:component,detail:auxDetail16919(error)};
  const fault={component,reason:auxReason16917(error),...detail,due:Date.now()+2*HOUR};
  trace.auxFault=fault;trace.auxUntil=fault.due;trace.learning=null;
  try {
    await sql(env,'UPDATE nh_v16917_aux SET due=MAX(due,?),failed_at=?,component=?,reason=?,operation=?,detail=?,recovered_at=0 WHERE slot=?',fault.due,Date.now(),component,fault.reason,fault.operation,fault.detail,env.SLOT).run();
    if(['snapshot','selection'].includes(component))await sql(env,'UPDATE nh_v16913_learning SET due=? WHERE slot=?',fault.due,env.SLOT).run();
  }catch(storageError){
    if(readLimit(storageError))throw storageError;
    // Failure to record diagnostics must not turn a read-only feature into a
    // veto. The core action/lease ledgers are independently required below.
    console.warn('note-helper: optional diagnostics unavailable');
  }
}
async function auxSafety16917(env,token){
  const row=await sql(env,`SELECT c.enabled,c.token,c.lease,c.inflight,n.hold_until,
    d.slot discovery_slot,d.pending comment_pending,o.slot outreach_slot,o.pending outreach_pending
    FROM nh_control c JOIN nh_v13_connection n ON n.slot=?
    LEFT JOIN nh_v1697_discovery d ON d.slot=n.slot LEFT JOIN nh_v16910_state o ON o.slot=n.slot WHERE c.id=1`,env.SLOT).first();
  if(!row || row.discovery_slot!==env.SLOT || row.outreach_slot!==env.SLOT)
    throw new Trouble('追加操作の確認記録を読み出せません','config');
  return {live:row.enabled===1 && row.token===token && row.lease>Date.now() && row.hold_until<=Date.now(),
    pending:!!(row.inflight||row.comment_pending||row.outreach_pending)};
}
async function auxiliary16917(env,token,component,isSending,work,fallback=null){
  if(env.TRACE?.auxUntil>Date.now()){
    const safe=await auxSafety16917(env,token);
    if(safe.live && !safe.pending && !isSending())return fallback;
  }
  try {return await work();}
  catch(error){
    if(auxFatal16917(error)||isSending())throw error;
    // A batch may have committed before its response was lost. Read the
    // authoritative ledgers again; any uncertainty blocks a second action.
    const safe=await auxSafety16917(env,token);
    if(!safe.live||safe.pending)throw error;
    await auxFault16917(env,component,error);
    return fallback;
  }
}
async function auxiliaryWrites16917(env,component,make){
  if(env.TRACE?.auxUntil>Date.now())return;
  try {const items=make();if(items.length)await env.DB.batch(items);}
  catch(error){if(auxFatal16917(error))throw error;await auxFault16917(env,component,error);}
}
function learningPlan16917(value){
  const rows=typeof value==='string'?JSON.parse(value):value;
  if(!Array.isArray(rows) || rows.some(r=>!r || typeof r.source!=='string' || r.source.length>120 ||
    !Number.isSafeInteger(r.sent)||r.sent<0 || !Number.isSafeInteger(r.responded)||r.responded<0))
    throw new TypeError('invalid cached learning plan');
  return rows;
}
async function auxRecord16917(env){
  const rows=await sql(env,'SELECT * FROM nh_v16917_aux ORDER BY slot').all();
  const reasons={type:'読み取ったデータの型',format:'保存データの形式',storage:'補助データの読み書き',network:'追加読み取りの通信',response:'追加読み取りの応答',internal:'追加機能の内部処理'};
  return '【追加機能と通常巡回の状態】\n'+rows.results.map(r=>
    'アカウント '+r.slot+'：'+(!r.failed_at?'追加機能の内部エラー記録なし':
      (r.recovered_at>r.failed_at?'失敗後の読み取り・操作確認あり':r.due>Date.now()?'追加機能だけ再確認待ち':r.component==='diagnostics'?'動作記録の保存に失敗・探索の継続は可能':'追加機能の再確認時刻に到達')+'／'+(AUX_COMPONENTS16917[r.component]||'追加機能')+'／'+(reasons[r.reason]||'内部処理')+
      '\n確認コード：AUX19/'+r.component+'/'+(r.operation||'legacy')+'/'+(r.detail||r.reason)+'／最終記録 '+time(r.failed_at)+(r.due>0?'／再確認 '+time(r.due):'')+(r.recovered_at>r.failed_at?'／再確認成功 '+time(r.recovered_at):''))
  ).join('\n\n')+'\n通常の記事巡回は各アカウントの状態欄で確認してください。ログイン拒否・回数制限・note指定の待機・送信結果不明は引き続き共通で待機します。';
}

// One browser admission record per scheduler. No credentials or provider error
// text are persisted. Cloudflare capacity waits never become note Retry-After.
class BrowserWait16916 extends Error {
  constructor(reason,at) { super('browser deferred');this.reason=reason;this.at=at; }
}
const BROWSER_WAIT16916={spacing:'前のブラウザー起動との間隔待ち',busy:'別のブラウザー処理の終了待ち',publication:'予約作品の公開を優先して待機中',daily:'Cloudflareのブラウザー日次枠の更新待ち',rate:'Cloudflareのブラウザー回数制限・再試行待ち',startup:'Cloudflareのブラウザー起動を確認できず・再試行待ち',storage:'ブラウザーの予約記録を確認できず・再試行待ち'};
function browserDeferred16916(error) {
  return error instanceof BrowserWait16916?{browserDeferred:true,browserReason:error.reason,retryAt:error.at,message:BROWSER_WAIT16916[error.reason]||BROWSER_WAIT16916.startup}:null;
}
const LOCAL_BROWSERS16921=new WeakMap();
function browserWait16916(binding,purpose) {
  try {return LOCAL_BROWSERS16921.get(binding)?.available(purpose)||null;}
  catch {return browserDeferred16916(new BrowserWait16916('storage',Date.now()+240000));}
}
function browserPurpose16916(binding,purpose) {
  return LOCAL_BROWSERS16921.get(binding)?.purpose(purpose)||binding;
}
function boundedClose16916(work) {
  let timer;
  return Promise.race([Promise.resolve().then(work),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('close timeout')),5000);})]).finally(()=>clearTimeout(timer));
}
function coordinatedBrowser16916(raw,storage,priority=()=>false) {
  if(LOCAL_BROWSERS16921.has(raw)||typeof raw?.acquire!=='function')return raw;
  let ready=false;
  const sessions=new Map();
  const rows=(q,...a)=>storage.sql.exec(q,...a).toArray();
  const one=(q,...a)=>rows(q,...a)[0];
  const init=()=>{
    if(ready)return;
    storage.transactionSync(()=>{
      rows("CREATE TABLE IF NOT EXISTS desk_browser16916(id INTEGER PRIMARY KEY,next_at INTEGER NOT NULL DEFAULT 0,hold_until INTEGER NOT NULL DEFAULT 0,lease INTEGER NOT NULL DEFAULT 0,token TEXT NOT NULL DEFAULT '',started INTEGER NOT NULL DEFAULT 0,closed INTEGER NOT NULL DEFAULT 0,reason TEXT NOT NULL DEFAULT '',attempts INTEGER NOT NULL DEFAULT 0,sessions INTEGER NOT NULL DEFAULT 0)");
      rows('INSERT OR IGNORE INTO desk_browser16916(id) VALUES(1)');
    });ready=true;
  };
  const available=purpose=>{
    init();const now=Date.now(),s=one('SELECT * FROM desk_browser16916 WHERE id=1');
    let reason='',at=0;
    if(s.hold_until>now){reason=Object.hasOwn(BROWSER_WAIT16916,s.reason)?s.reason:'startup';at=s.hold_until;}
    else if(s.lease>now){reason='busy';at=s.lease;}
    else if(s.next_at>now){reason='spacing';at=s.next_at;}
    else if(purpose!=='publish'&&priority()){reason='publication';at=now+60000;}
    return reason?browserDeferred16916(new BrowserWait16916(reason,at)):null;
  };
  const binding=purpose=>{const wrapped={
    available16916:(kind=purpose)=>available(kind),purpose16916:binding,
    state16916:()=>{init();return one('SELECT next_at,hold_until,lease,started,closed,reason,attempts,sessions FROM desk_browser16916 WHERE id=1');},
    devtools:raw.devtools,
    connectSession:(...args)=>raw.connectSession(...args),
    async acquire(options){
      const wait=available(purpose);if(wait)throw new BrowserWait16916(wait.browserReason,wait.retryAt);
      const at=Date.now(),token=crypto.randomUUID();
      // Reserve synchronously before yielding. An interrupted isolate leaves a
      // finite lease, while the provider's 15-second keepAlive closes its session.
      rows("UPDATE desk_browser16916 SET next_at=?,lease=?,token=?,started=?,attempts=attempts+1 WHERE id=1",at+21000,at+4*60000,token,at);
      let session;
      try {
        session=await raw.acquire(options);
        if(typeof session?.sessionId!=='string'||!session.sessionId)throw Error('missing browser session');
        const held=one('SELECT token,lease FROM desk_browser16916 WHERE id=1');
        if(held?.token!==token||held.lease<=Date.now())
          throw new BrowserWait16916('busy',Math.max(Date.now()+21000,held?.lease||0));
        rows("UPDATE desk_browser16916 SET sessions=sessions+1,reason='' WHERE id=1 AND token=?",token);
        sessions.set(session.sessionId,token);
        return session;
      }catch(error){
        // A session may already exist even though its local bookkeeping failed.
        // The caller has not received it and cannot perform this cleanup.
        const created=typeof session?.sessionId==='string'&&!!session.sessionId;
        if(created)await boundedClose16916(()=>raw.closeSession(session.sessionId)).catch(()=>{});
        const text=errorText(error);
        const daily=/browser.*time.*limit.*(?:today|day)|daily.*browser.*limit/i.test(text);
        const rate=Number(error?.status??error?.statusCode??error?.code)===429||/\b429\b|too many|rate.?limit|concurrent.*limit/i.test(text);
        let reason=error instanceof BrowserWait16916?error.reason:created?'storage':daily?'daily':rate?'rate':'startup';
        const rawRetry=error?.retryAfter??error?.retry_after??error?.headers?.get?.('Retry-After');
        let until=Math.max(Date.now()+60000,daily?(Math.floor(Date.now()/86400000)+1)*86400000+5000:0,
          Date.now()+retryDelay16929(rawRetry),error instanceof BrowserWait16916?error.at:0);
        try{rows("UPDATE desk_browser16916 SET hold_until=MAX(hold_until,?),lease=0,token='',reason=? WHERE id=1 AND token=?",until,reason,token);}
        catch{reason='storage';until=Math.max(until,at+4*60000);}
        throw new BrowserWait16916(reason,until);
      }
    },
    async closeSession(id){
      const token=sessions.get(id);let closed=false;
      try {await boundedClose16916(()=>raw.closeSession(id));closed=true;}
      finally {
        sessions.delete(id);
        if(token)rows("UPDATE desk_browser16916 SET lease=0,token='',closed=?,next_at=MAX(next_at,?) WHERE id=1 AND token=?",Date.now(),closed?0:Date.now()+21000,token);
      }
    }
  };
    LOCAL_BROWSERS16921.set(wrapped,{available:wrapped.available16916,purpose:binding,state:wrapped.state16916});
    return wrapped;
  };
  return binding('normal');
}

Object.assign(Desk520.prototype,{
  initRuntime16916(){
    if(this.one("SELECT 1 FROM sqlite_master WHERE name='desk_runtime16916'"))return;
    this.storage.transactionSync(()=>{
      this.rows("CREATE TABLE desk_runtime16916(id INTEGER PRIMARY KEY,started INTEGER NOT NULL DEFAULT 0,finished INTEGER NOT NULL DEFAULT 0,due INTEGER NOT NULL DEFAULT 0,lease INTEGER NOT NULL DEFAULT 0,token TEXT NOT NULL DEFAULT '',fallback INTEGER NOT NULL DEFAULT 0,message TEXT NOT NULL DEFAULT '定期処理の確認待ち')");
      this.rows('INSERT INTO desk_runtime16916(id) VALUES(1)');
    });
  },
  publicationPriority16916(now){
    const cfg=this.one('SELECT c.enabled,c.blocked,d.enabled delivery FROM desk_cfg c JOIN desk_delivery d ON d.id=c.id WHERE c.id=1');
    if(!cfg?.enabled||!cfg.delivery||cfg.blocked>now)return false;
    const args=[now-5*M520,now+6*M520];
    return !!this.one(`SELECT 1 FROM desk_link_plan l WHERE l.pub IS NULL AND l.scheduled BETWEEN ? AND ?
      AND NOT EXISTS(SELECT 1 FROM desk_job j WHERE j.kind='publish' AND j.subject=l.article AND j.phase<>'wait') LIMIT 1`,...args)||
      !!this.one(`SELECT 1 FROM desk_work_schedule w WHERE w.pub IS NULL AND w.locked=0 AND w.paused=0 AND w.scheduled BETWEEN ? AND ?
      AND NOT EXISTS(SELECT 1 FROM desk_job j WHERE j.kind='publish' AND j.subject=CAST(w.seq AS TEXT) AND j.phase<>'wait') LIMIT 1`,...args);
  },
  runtimeView16916(){
    return {tick:this.one('SELECT started,finished,due,lease,fallback,message FROM desk_runtime16916 WHERE id=1'),browser:LOCAL_BROWSERS16921.get(this.env.BROWSER)?.state()||null};
  }
});
Object.assign(NoteScheduler.prototype,{
  startDeskTick16916(fallback=false){
    if(this.deskTicking)return this.deskTicking;
    this.desk ||= new Desk520(this.ctx.storage,this.env);this.desk.init();
    if(this.desk.productionTestActive16920())return this.desk.pumpProductionTest16920();
    const now=Date.now(),state=this.desk.one('SELECT * FROM desk_runtime16916 WHERE id=1');
    if(!this.desk.one('SELECT enabled FROM desk_cfg WHERE id=1')?.enabled || state.due>now || state.lease>now ||
       (fallback&&state.started>now-10*M520))return Promise.resolve();
    const token=crypto.randomUUID();
    this.desk.rows("UPDATE desk_runtime16916 SET started=?,lease=?,due=?,token=?,fallback=?,message=? WHERE id=1",now,now+15*M520,now+2*M520,token,+fallback,fallback?'定期起動の間隔が空いたため補助起動中':'定期処理中');
    const work=Promise.resolve().then(()=>this.desk.tick()).then(()=>{
      this.desk.rows("UPDATE desk_runtime16916 SET finished=?,message='定期処理を1巡しました。各機能の成否は個別の記録に表示します' WHERE id=1 AND token=?",Date.now(),token);
    },()=>{
      this.desk.rows("UPDATE desk_runtime16916 SET message='定期処理を完了できず・次回に自動再確認',due=MAX(due,?) WHERE id=1 AND token=?",Date.now()+2*M520,token);
    }).finally(()=>{
      try {this.desk.rows("UPDATE desk_runtime16916 SET lease=0,token='' WHERE id=1 AND token=?",token);}
      finally {if(this.deskTicking===work)this.deskTicking=null;}
    });
    this.deskTicking=work;
    this.ctx.waitUntil?.(work.catch(()=>{}));
    return work;
  }
});

// Bounded component diagnostics: no page text, identities, mail or credentials.
const COMPONENTS16915={comments:'コメントへのスキ',readers:'文芸記事の読者探索',own_readers:'自分の記事の読者確認',qa:'質問箱へのスキ',member:'0円プランへの参加',board:'掲示板へのスキ'};
const diagnosticSchema16915=[
  `CREATE TABLE IF NOT EXISTS nh_v16915_diagnostics(slot TEXT NOT NULL,component TEXT NOT NULL,attempted INTEGER NOT NULL DEFAULT 0,read_at INTEGER NOT NULL DEFAULT 0,confirmed INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL DEFAULT 'wait',stage TEXT NOT NULL DEFAULT '',PRIMARY KEY(slot,component))`
];
async function diagnostic16915(env,component,state,stage){
  if(!Object.hasOwn(COMPONENTS16915,component)||!['attempt','wait','read','failed','confirmed'].includes(state))return;
  const stages=new Set(['source','no_source','source_mismatch','article_page','liker_control','liker_loading','liker_list','comment_rows','comment_recovery','browser','qa_rows','member_plan','board_post']);
  await diagnosticWrite16919(env,component,state,stage,()=>sql(env,`INSERT INTO nh_v16915_diagnostics(slot,component,attempted,read_at,confirmed,state,stage) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(slot,component) DO UPDATE SET attempted=MAX(attempted,excluded.attempted),read_at=MAX(read_at,excluded.read_at),confirmed=MAX(confirmed,excluded.confirmed),state=excluded.state,stage=excluded.stage`,
    env.SLOT,component,state==='attempt'?Date.now():0,['read','confirmed'].includes(state)?Date.now():0,state==='confirmed'?Date.now():0,state,stages.has(stage)?stage:'browser'));
}
async function diagnosticRecord16915(env){
  const all=await sql(env,'SELECT * FROM nh_v16915_diagnostics ORDER BY slot,component').all();
  const states={attempt:'確認を開始・完了は未確認',wait:'候補または条件待ち',read:'読み取り確認済み',failed:'読み取り・操作の確認に失敗',confirmed:'操作結果を確認済み'};
  const stages={source:'元記事',no_source:'元記事なし',source_mismatch:'元記事の条件不一致',article_page:'記事画面',liker_control:'読者一覧を開く場所',liker_loading:'読者一覧の読み込み',liker_list:'読者一覧',comment_rows:'コメント欄',comment_recovery:'前回コメントの結果',browser:'ブラウザー画面',qa_rows:'質問箱の回答',member_plan:'参加プラン',board_post:'掲示板の投稿'};
  return '【追加機能の動作確認・v16.9.15以降】\n'+(all.results.length?all.results.map(r=>'アカウント '+r.slot+' '+(COMPONENTS16915[r.component]||'追加機能')+'：'+(states[r.state]||'未確認')+'／'+(stages[r.stage]||'未確認')+'\n最終試行 '+time(r.attempted)+'／読み取り確認 '+time(r.read_at)+'／操作確認 '+time(r.confirmed)).join('\n\n'):'更新後の追加探索はまだ記録されていません。')+'\nONや次回時刻は成功の証拠ではありません。読み取り成功と送信・参加の成功を別々に記録します。訪問やスキ返しを保証するものではありません。';
}

// Magazine-only expansion. The ordinary like scheduler and its D1 tables are unchanged.
const DISTRIBUTION16918=Object.freeze({applications:24,checks:96,placements:48,applicationGap:30*M520,placementGap:15*M520,workGap:2*HOUR});
Object.assign(Desk520.prototype,{
  initDistribution16918(){
    if(this.one("SELECT 1 FROM sqlite_master WHERE name='desk_distribution16918'"))return;
    this.storage.transactionSync(()=>{
      // Preserve legacy subjects, uncertain writes, pauses and all per-publisher history.
      this.rows("ALTER TABLE desk_job ADD COLUMN article TEXT NOT NULL DEFAULT ''");
      this.rows("UPDATE desk_job SET article=subject WHERE kind='mag' AND length(subject) BETWEEN 2 AND 65 AND substr(subject,1,1)='n' AND subject NOT GLOB '*[^a-z0-9]*'");
      this.rows("CREATE UNIQUE INDEX desk_job_mag_pair16918 ON desk_job(article,target) WHERE kind='mag' AND article<>''");
      this.rows('CREATE INDEX desk_job_article16918 ON desk_job(kind,article,target)');
      this.rows('ALTER TABLE desk_archive ADD COLUMN mag_at INTEGER NOT NULL DEFAULT 0');
      this.rows('ALTER TABLE desk_archive ADD COLUMN mag_due INTEGER NOT NULL DEFAULT 0');
      this.rows('CREATE INDEX desk_archive_distribution16918 ON desk_archive(mag_due,mag_at,pub,article) WHERE choice IS NOT NULL');
      this.rows('CREATE INDEX desk_mag_send_at16918 ON desk_mag_send(at)');
      this.rows('CREATE INDEX desk_mag_send_article16918 ON desk_mag_send(article,at)');
      this.rows(`CREATE TABLE desk_mag_verify_new16918(article TEXT NOT NULL,id TEXT NOT NULL,started INTEGER NOT NULL,due INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,done INTEGER NOT NULL DEFAULT 0,message TEXT NOT NULL DEFAULT '追加後の公開表示を確認待ち',PRIMARY KEY(article,id))`);
      this.rows('INSERT INTO desk_mag_verify_new16918 SELECT article,id,started,due,attempts,done,message FROM desk_mag_verify16913');
      this.rows('DROP TABLE desk_mag_verify16913');
      this.rows('ALTER TABLE desk_mag_verify_new16918 RENAME TO desk_mag_verify16913');
      this.rows('CREATE INDEX desk_mag_verify_due16913 ON desk_mag_verify16913(done,due,article,id)');
      this.rows('CREATE INDEX desk_mag_verify_started16918 ON desk_mag_verify16913(started DESC)');
      this.rows(`UPDATE desk_archive SET mag_at=COALESCE((SELECT MAX(s.at) FROM desk_mag_send s WHERE s.article=desk_archive.article),0),
        mag_due=COALESCE((SELECT MAX(s.at)+? FROM desk_mag_send s WHERE s.article=desk_archive.article),0)`,DISTRIBUTION16918.workGap);
      // The marker is written last in the same transaction; interrupted upgrades roll back.
      this.rows('CREATE TABLE desk_distribution16918(id INTEGER PRIMARY KEY,mag_next INTEGER NOT NULL DEFAULT 0,app_next INTEGER NOT NULL DEFAULT 0)');
      this.rows(`INSERT INTO desk_distribution16918(id,mag_next,app_next) SELECT 1,
        COALESCE((SELECT MAX(at)+? FROM desk_mag_send),0),
        COALESCE((SELECT MAX(at)+? FROM desk_join WHERE phase IN ('sent','applied','accepting')),0)`,DISTRIBUTION16918.placementGap,DISTRIBUTION16918.applicationGap);
      this.rows('UPDATE desk_pick_meta SET rev=rev+1 WHERE id=1');
    });
  },
  placementCandidates16918(article,magazines,now,activeTarget=null){
    const done=new Set(this.rows('SELECT id FROM desk_ref WHERE article=? UNION SELECT id FROM desk_mag_send WHERE article=?',article.article,article.article).map(r=>r.id));
    const jobs=new Map(this.rows("SELECT subject,target,phase,next FROM desk_job WHERE kind='mag' AND article=?",article.article).map(j=>[j.target,j]));
    return this.archiveFits(article,magazines,now).filter(m=>{
      const link=noteLink161(m.url),job=jobs.get(link?.id);
      return link && link.owner!=='43__' && !done.has(link.id) && (!activeTarget || link.id===activeTarget) &&
        (!job || job.phase==='wait' && (job.next<=now || activeTarget===link.id));
    });
  },
  eligiblePlacement(key,now,activeTarget=null){
    const a=this.one('SELECT a.*,w.genre work_genre,w.chars work_chars,w.method FROM desk_archive a LEFT JOIN desk_work w ON w.article=a.article WHERE a.article=?',key);
    if(!a?.choice || a.title.trim()==='521' || !activeTarget && a.mag_due>now)return null;
    const pacing=this.one('SELECT mag_next FROM desk_distribution16918 WHERE id=1');
    if(pacing.mag_next>now)return null;
    const mag=this.chooseMagazine520(this.placementCandidates16918(a,this.eligibleMags(now),now,activeTarget),a.work_genre||a.genre,now,a);
    const link=noteLink161(mag?.url);
    if(!link || link.owner==='43__')return null;
    const prior=this.one("SELECT subject FROM desk_job WHERE kind='mag' AND article=? AND target=?",key,link.id);
    const job={kind:'mag',key,subject:prior?.subject||key+'@'+link.id,target:link.id,url:link.url,title:a.title,name:mag.name,
      old:a.pub<=now-30*D520,previousMagAt:a.mag_at,previousMagDue:a.mag_due};
    return activeTarget?job:this.rssTiming16926(job,now);
  },
  nextPlacement(now,oldFirst){
    if(this.one('SELECT mag_next FROM desk_distribution16918 WHERE id=1').mag_next>now)return null;
    // Least recently circulated works go first. New works and backlist alternate.
    for(const old of [oldFirst,!oldFirst]){
      const keys=this.rows('SELECT article FROM desk_archive WHERE choice IS NOT NULL AND mag_due<=? AND pub '+(old?'<=?':'>?')+
        ' ORDER BY mag_at,'+(old?'pub ASC':'pub DESC')+',article LIMIT 8',now,now-30*D520);
      for(const {article} of keys){
        const job=this.eligiblePlacement(article,now);
        if(job)return job;
        // A blocked publisher cannot monopolize the head of the queue.
        this.rows('UPDATE desk_archive SET mag_due=?,pick_due=MIN(pick_due,?) WHERE article=?',now+HOUR,now+HOUR,article);
      }
    }
    return null;
  },
  distributionView16918(now){
    const usage=this.one('SELECT utc_day,mags FROM desk_delivery WHERE id=1');
    const checks=this.one('SELECT day,used FROM desk_join_cfg WHERE id=1');
    const today=jstDay(now);
    const sent=this.one(`SELECT COUNT(*) n,SUM(CASE WHEN a.pub<=? THEN 1 ELSE 0 END) old
      FROM desk_mag_send s LEFT JOIN desk_archive a ON a.article=s.article WHERE s.at>=? AND s.at<?`,now-30*D520,Math.floor(now/D520)*D520,(Math.floor(now/D520)+1)*D520);
    return {applications:this.one('SELECT applications FROM desk_join_budget WHERE day=?',today)?.applications||0,
      checks:checks.day===today?checks.used:0,placements:usage.utc_day===Math.floor(now/D520)?usage.mags:0,old:sent.old||0,
      outcomes:{...this.one(`SELECT COUNT(*) targets,COALESCE(SUM(phase='wait'),0) waiting,
        COALESCE(SUM(phase IN ('sent','applied','accepting')),0) pending,
        COALESCE(SUM(phase='joined' AND proof>0),0) joined FROM desk_join`),
        ...this.one(`SELECT COALESCE(SUM(phase='confirmed'),0) confirmed,
        COALESCE(SUM(phase IN ('sent','seen')),0) unconfirmed FROM desk_job WHERE kind='mag'`)}};
  }
});

// Metadata recovery is limited to named auxiliary columns. Action ledgers and
// credentials are never reconstructed, cleared or retried speculatively.
const AUX_ERRORS16919=new WeakMap();
const AUX_COLUMNS16919={
  nh_v1697_discovery:{attempt_token:"TEXT NOT NULL DEFAULT ''"},
  nh_v16917_aux:{operation:"TEXT NOT NULL DEFAULT ''",detail:"TEXT NOT NULL DEFAULT ''",recovered_at:'INTEGER NOT NULL DEFAULT 0'},
  nh_v16915_diagnostics:{attempted:'INTEGER NOT NULL DEFAULT 0',read_at:'INTEGER NOT NULL DEFAULT 0',confirmed:'INTEGER NOT NULL DEFAULT 0',state:"TEXT NOT NULL DEFAULT 'wait'",stage:"TEXT NOT NULL DEFAULT ''"}
};
async function repairAuxMetadata16919(env){
  const tables=Object.keys(AUX_COLUMNS16919);
  const info=await env.DB.batch(tables.map(t=>env.DB.prepare('PRAGMA table_info('+t+')')));
  const changes=[];
  for(let i=0;i<tables.length;i++){
    const table=tables[i],names=new Set(info[i].results.map(r=>r.name));
    if(!names.size)throw new Error('D1_ERROR: missing auxiliary table');
    for(const [column,type] of Object.entries(AUX_COLUMNS16919[table]))
      if(!names.has(column))changes.push(env.DB.prepare('ALTER TABLE '+table+' ADD COLUMN '+column+' '+type));
  }
  if(changes.length){
    try{await env.DB.batch(changes);}
    catch(error){
      // Two first invocations can observe the same old schema. A successful
      // concurrent upgrade is accepted only after every expected column exists.
      if(!/duplicate column name/i.test(errorText(error)))throw error;
      const check=await env.DB.batch(tables.map(t=>env.DB.prepare('PRAGMA table_info('+t+')')));
      if(check.some((r,i)=>Object.keys(AUX_COLUMNS16919[tables[i]]).some(c=>!r.results.some(x=>x.name===c))))throw error;
    }
  }
}
function auxDetail16919(error){
  const t=errorText(error);
  for(const [pattern,code] of [
    [/daily row (?:read|write) limit/i,'daily_quota'],
    [/no such table/i,'missing_table'],[/no such column|has no column named/i,'missing_column'],
    [/D1_TYPE_ERROR|unsupported type|type.*undefined/i,'binding_type'],
    [/too many SQL variables|too many (?:bound )?parameters/i,'binding_limit'],
    [/too many API requests|subrequest/i,'request_limit'],
    [/constraint failed|SQLITE_CONSTRAINT/i,'constraint'],
    [/syntax error/i,'sql_syntax'],
    [/maximum.*storage|maximum DB size|database or disk is full/i,'storage_full'],
    [/reset|overloaded|network connection lost|replica disconnected|transient issue|timeout/i,'temporary_storage']
  ])if(pattern.test(t))return code;
  return auxReason16917(error);
}
async function auxReadWrite16919(env,operation,work){
  for(let attempt=0;;attempt++){
    try{return await work();}
    catch(error){
      const detail=auxDetail16919(error);
      if(error && typeof error==='object')AUX_ERRORS16919.set(error,{operation,detail});
      // Only callers with read-only or absolute/idempotent writes use this helper.
      if(attempt || auxFatal16917(error))throw error;
      if(detail==='missing_column' && !env.TRACE?.schemaChecked16919){
        const text=errorText(error);
        const allowed=Object.values(AUX_COLUMNS16919).flatMap(c=>Object.keys(c));
        if(!allowed.some(c=>new RegExp('(?:column(?: named)?[: ]+|\\.)'+c+'\\b','i').test(text)))throw error;
        if(env.TRACE)env.TRACE.schemaChecked16919=true;
        await repairAuxMetadata16919(env);
      }else if(detail!=='temporary_storage')throw error;
    }
  }
}
async function diagnosticWrite16919(env,component,state,stage,statement){
  try{
    await auxReadWrite16919(env,'diagnostic_save',()=>statement().run());
    if(['read','confirmed'].includes(state)){
      const group=['comments','readers','own_readers'].includes(component)?'readers':'outreach';
      await sql(env,"UPDATE nh_v16917_aux SET recovered_at=? WHERE slot=? AND failed_at>0 AND failed_at<? AND component IN (?, 'diagnostics')",Date.now(),env.SLOT,Date.now(),group).run();
    }
  }catch(error){
    if(auxFatal16917(error))throw error;
    // Failure of an informational record must not veto an independently
    // reserved operation or consume the rest of the browser attempt budget.
    const detail=auxDetail16919(error);
    if(env.TRACE)env.TRACE.diagnosticFault16919=detail;
    try{await sql(env,"UPDATE nh_v16917_aux SET failed_at=?,component='diagnostics',reason='storage',operation='diagnostic_save',detail=?,recovered_at=0 WHERE slot=? AND due<=?",Date.now(),detail,env.SLOT,Date.now()).run();}
    catch(recordError){if(auxFatal16917(recordError))throw recordError;}
  }
}
async function claimDiscovery16919(env,s,now,advance){
  const utc=Math.floor(now/(24*HOUR)),token=crypto.randomUUID();
  const nextTurn=s.turn+Number(advance),nextUsed=s.utc_day===utc?s.used+1:1;
  const result=await auxReadWrite16919(env,'discovery_budget',()=>sql(env,`UPDATE nh_v1697_discovery
    SET due=?,turn=?,utc_day=?,used=?,attempt_token=? WHERE slot=? AND
    (attempt_token=? OR (turn=? AND utc_day=? AND used=? AND due=?))`,
    now+30*60000,nextTurn,utc,nextUsed,token,env.SLOT,token,s.turn,s.utc_day,s.used,s.due).run());
  return result.meta.changes?{token,turn:nextTurn,utc,used:nextUsed}:null;
}
async function returnDiscovery16919(env,s,claim,at,message){
  return auxReadWrite16919(env,'discovery_return',()=>sql(env,`UPDATE nh_v1697_discovery
    SET due=?,turn=?,utc_day=?,used=?,attempt_token='',message=? WHERE slot=? AND attempt_token=?`,
    at,s.turn,s.utc_day,s.used,message,env.SLOT,claim.token).run());
}
function discoveryStatus16919(r,state,now){
  const utc=Math.floor(now/(24*HOUR)),used=r.utc_day===utc?r.used:0;
  let due=Math.max(r.due||0,r.aux_due||0,state?.eligible||0),message=r.message;
  if(used>=12)due=Math.max(due,(utc+1)*24*HOUR+60000);
  if(/本日12回|翌日に自動再開/.test(message))message=used>=12?'本日の共通探索枠を使用済み':'前日の探索枠は更新済み';
  if(r.aux_due>now)message='追加探索だけエラー後の再確認待ち。詳細は「追加機能と通常巡回の状態」に表示';
  const next=!state?.enabled?'自動運転は停止中':due>now?time(due)+'以降':r.due?'次の通常巡回で確認':'元記事の取得待ち';
  return message+'\n本日の共通探索枠 '+used+'/12回（成功件数ではありません）\n次の追加探索：'+next;
}

// A bounded, authenticated production check. Each durable phase runs once;
// write receipts are stored before invoking the existing idempotent pipelines.
const TEST_STEPS16920=['追加機能の読み取り','参加申請・招待','申請結果の確認','共同誌への掲載','掲載結果の確認'];
const TEST_LABELS16920={ok:'確認済み',wait:'未実行・保留',unknown:'操作済み・結果未確認',empty:'対象なし',error:'エラー',running:'処理中'};
Object.assign(Desk520.prototype,{
  initProductionTest16920(){
    if(this.one("SELECT 1 FROM sqlite_master WHERE name='desk_test16920'"))return;
    this.storage.transactionSync(()=>{
      this.rows(`CREATE TABLE desk_test16920(id INTEGER PRIMARY KEY,token TEXT NOT NULL DEFAULT '',slot TEXT NOT NULL DEFAULT '1',
        phase INTEGER NOT NULL DEFAULT 5,started INTEGER NOT NULL DEFAULT 0,finished INTEGER NOT NULL DEFAULT 0,
        due INTEGER NOT NULL DEFAULT 0,lease INTEGER NOT NULL DEFAULT 0,next_test INTEGER NOT NULL DEFAULT 0,
        results TEXT NOT NULL DEFAULT '[]',target TEXT NOT NULL DEFAULT '{}')`);
      this.rows('INSERT INTO desk_test16920(id) VALUES(1)');
    });
  },
  productionTestActive16920(){return !!this.one("SELECT 1 FROM desk_test16920 WHERE id=1 AND token<>'' AND phase<5 AND finished=0");},
  productionTestView16920(){
    const r=this.one('SELECT * FROM desk_test16920 WHERE id=1');
    return {version:VERSION,slot:r.slot,started:r.started,finished:r.finished,active:!!r.token&&r.phase<5&&!r.finished,
      step:TEST_STEPS16920[r.phase]||'',due:r.due,nextTest:r.next_test,results:JSON.parse(r.results)};
  },
  startProductionTest16920(slot){
    const now=Date.now();
    return this.storage.transactionSync(()=>{
      const r=this.one('SELECT * FROM desk_test16920 WHERE id=1');
      // Repeated form submissions and an interrupted client never enqueue twice.
      if(r.phase<5 && r.token && !r.finished || r.next_test>now)return false;
      this.rows("UPDATE desk_test16920 SET token=?,slot=?,phase=0,started=?,finished=0,due=?,lease=0,next_test=?,results='[]',target='{}' WHERE id=1",
        crypto.randomUUID(),slot,now,now,now+5*M520);
      return true;
    });
  },
  testResult16920(token,key,label,state,message){
    const r=this.one('SELECT results FROM desk_test16920 WHERE id=1 AND token=?',token);
    if(!r)return;
    const items=JSON.parse(r.results).filter(v=>v.key!==key);
    items.push({key,label,state,message:String(message).slice(0,1800),at:Date.now()});
    this.rows('UPDATE desk_test16920 SET results=? WHERE id=1 AND token=?',JSON.stringify(items),token);
  },
  testTarget16920(token,key,value){
    const r=this.one('SELECT target FROM desk_test16920 WHERE id=1 AND token=?',token);
    if(!r)return;
    this.rows('UPDATE desk_test16920 SET target=? WHERE id=1 AND token=?',JSON.stringify({...JSON.parse(r.target),[key]:value}),token);
  },
  productionTestAlarm16920(){
    const r=this.one('SELECT phase,token,finished,due,lease FROM desk_test16920 WHERE id=1');
    return r?.token && r.phase<5 && !r.finished?Math.max(Date.now()+1000,r.due,r.lease):null;
  },
  async wakeProductionTest16920(){
    const next=this.productionTestAlarm16920();
    if(!next || typeof this.storage.setAlarm!=='function')return;
    const old=await this.storage.getAlarm();
    if(old===null || old>next)await this.storage.setAlarm(next);
  },
  async pumpProductionTest16920(){
    if(this.testTask16920)return this.testTask16920;
    const work=this.advanceProductionTest16920();this.testTask16920=work;
    try{return await work;}finally{if(this.testTask16920===work)this.testTask16920=null;}
  },
  async advanceProductionTest16920(){
    const now=Date.now(),r=this.one('SELECT * FROM desk_test16920 WHERE id=1');
    if(!r.token || r.phase>=5 || r.finished || r.due>now)return;
    if(r.lease){
      if(r.lease>now)return;
      this.testResult16920(r.token,'interrupted','テストの実行記録','error','前回の処理完了を確認できません。操作は自動で繰り返しません。記録済みの申請・掲載は通常の結果確認で追跡します。');
      this.rows('UPDATE desk_test16920 SET phase=5,finished=?,lease=0 WHERE id=1 AND token=?',now,r.token);return;
    }
    // Give an in-progress regular desk task time to finish; do not run two
    // independent browser pipelines against the same account at once.
    const deskRun=this.one('SELECT lease FROM desk_runtime16916 WHERE id=1');
    const wait=browserWait16916(this.env.BROWSER);
    if(r.phase<4 && (deskRun.lease>now || wait && ['busy','spacing','publication'].includes(wait.browserReason))){
      if(now-r.started<10*M520){
        this.rows('UPDATE desk_test16920 SET due=? WHERE id=1 AND token=?',Math.min(now+30000,Math.max(now+1000,wait?.retryAt||deskRun.lease)),r.token);
        await this.wakeProductionTest16920();return;
      }
      this.testResult16920(r.token,'busy','テストの待機','wait','別の処理が続いているため今回のテストを終了しました。新しい送信はしていません。');
      this.rows('UPDATE desk_test16920 SET phase=5,finished=? WHERE id=1 AND token=?',now,r.token);return;
    }
    const locked=this.one('UPDATE desk_test16920 SET lease=? WHERE id=1 AND token=? AND phase=? AND lease=0 RETURNING id',now+4*M520,r.token,r.phase);
    if(!locked)return;
    // Persist the recovery wake before any external action.
    await this.wakeProductionTest16920();
    let end=false;
    try{
      if(r.phase===0)await this.testReaders16920(r);
      else if(r.phase===1)await this.testJoin16920(r);
      else if(r.phase===2)await this.testJoinProof16920(r);
      else if(r.phase===3)await this.testPlacement16920(r);
      else await this.testPlacementProof16920(r);
    }catch(error){
      const code=readLimit(error)?'daily_quota':auxDetail16919(error);
      this.testResult16920(r.token,'phase_'+r.phase,TEST_STEPS16920[r.phase],'error',
        error instanceof Trouble?error.message:readLimit(error)?quotaMessage:'処理を完了できません。確認コード TEST20/'+r.phase+'/'+code+'。保存済みの操作は再送しません。');
      end=readLimit(error) || r.phase===0 && /storage|table|column|binding|constraint|quota/.test(code);
    }finally{
      const phase=end?5:r.phase+1,at=Date.now();
      this.rows('UPDATE desk_test16920 SET phase=?,finished=?,lease=0,due=? WHERE id=1 AND token=? AND phase=?',phase,phase>=5?at:0,at+1000,r.token,r.phase);
      await this.wakeProductionTest16920();
    }
  },
  async testReaders16920(r){
    await prepare(this.env);
    let env={...scoped(this.env,r.slot),NETWORK16922:this.networkBridge16922(),TRACE:{calls:0}},lease;
    const put=(key,label,state,message)=>this.testResult16920(r.token,key,label,state,message);
    await sql(env,'CREATE TABLE IF NOT EXISTS nh_v16920_probe(slot TEXT PRIMARY KEY,token TEXT NOT NULL,at INTEGER NOT NULL)').run();
    await sql(env,'INSERT INTO nh_v16920_probe(slot,token,at) VALUES(?,?,?) ON CONFLICT(slot) DO UPDATE SET token=excluded.token,at=excluded.at',r.slot,r.token,Date.now()).run();
    const probe=await sql(env,'SELECT token FROM nh_v16920_probe WHERE slot=?',r.slot).first();
    if(probe?.token!==r.token)throw Error('D1_ERROR: probe readback mismatch');
    const discovery=await auxReadWrite16919(env,'discovery_read',()=>sql(env,'SELECT seed,seed_owner,pending,turn,attempt_token FROM nh_v1697_discovery WHERE slot=?',r.slot).first());
    await auxReadWrite16919(env,'aux_read',()=>sql(env,'SELECT failed_at,operation,detail,recovered_at FROM nh_v16917_aux WHERE slot=?',r.slot).first());
    if(!discovery)throw Error('D1_ERROR: missing auxiliary row');
    put('storage','追加機能の保存・読み取り','ok','検証用の値を書き込み、同じ値を読み戻しました。追加探索の保存項目も読み取れました。');
    const state=await sql(env,`SELECT c.*,h.kind,n.hold_until FROM nh_control c JOIN nh_health h ON h.id=c.id
      JOIN nh_v13_connection n ON n.slot=? WHERE c.id=1`,r.slot).first();
    if(!state?.enabled || !state.account){put('identity','note本人確認','wait','選んだアカウントは停止中または未登録です。設定は変更していません。');return;}
    const hold=Math.max(state.lease,state.hold_until,state.kind?state.next_at:0);
    if(hold>Date.now()){put('identity','note本人確認','wait',time(hold)+'まで既存の処理・待機があるため実行しませんでした。');return;}
    if(state.inflight || discovery.pending){put('identity','note本人確認','wait','前回の送信結果が未確認です。通常の再確認を優先し、新しい操作は行いません。');return;}
    lease=await acquire(env,false);
    if(!lease){put('identity','note本人確認','wait','別の処理中のため、今回は本人確認を実行しませんでした。');return;}
    try{
      env=await loadCookie(env,state.account);
      if(await account(env)!==state.account)throw new Trouble('保存済みのnote本人と一致しません','mismatch');
      put('identity','note本人確認','ok','アカウント '+r.slot+' の現在のログインを確認しました。');
      let seed={key:discovery.seed,owner:discovery.seed_owner};
      if(!/^n[a-z0-9]{1,64}$/.test(seed.key) || !/^[\w-]{1,80}$/.test(seed.owner))seed=await ownReaderSeed1699(env,state,discovery.turn);
      if(!seed){put('source','読み取り対象','wait','確認に使える公開記事がまだありません。通常の記事探索で取得後に試せます。');return;}
      const source=await article(env,seed.key);
      if(!source || source.key!==seed.key || source.status!=='published' || source.user?.urlname!==seed.owner){put('source','読み取り対象','wait','保存された記事の公開状態・作者が一致しません。別の記事の取得待ちです。');return;}
      if(typeof env.BROWSER?.acquire!=='function'){put('browser','note画面の読み取り','error','BROWSERの設定がありません。');return;}
      const result=await productionReaderProbe16920(env,state.account,seed,source);
      if(result.code || result.hold){
        await sql(env,'UPDATE nh_v13_connection SET hold_until=MAX(hold_until,?) WHERE slot=?',Date.now()+Math.max(result.hold||0,2*HOUR),r.slot).run();
        put('browser','note画面の読み取り','wait',result.message);return;
      }
      if(!result.identity){put('browser','note画面の読み取り',result.browserDeferred?'wait':'error',result.message||'記事画面で本人を確認できません。');return;}
      put('source','読み取り対象','ok','https://note.com/'+seed.owner+'/n/'+seed.key);
      put('comments','コメント欄の読み取り',result.comments?'ok':result.commentEmpty?'empty':'error',result.commentMessage);
      put('readers','スキした読者の読み取り',result.readers?'ok':result.readerEmpty?'empty':'error',result.readerMessage);
      if(result.readers){
        const own=source.user.urlname===env.TRACE?.identity?.owner;
        networkCall16922(env,'observe',source,result.owners||[],own);
        let saved=0;
        await rememberReaders1699(env,result.owners,seed,own?'returning':'literary',(_,n)=>saved+=n);
        put('candidates','読者候補の保存','ok',saved+'人の候補を保存・更新しました。上限・既存の作者待機は維持します。');
        await diagnostic16915(env,'readers','read','liker_list');
      }
      const compare=this.networkView16922(),cohort=compare.accounts.find(a=>a.slot===r.slot);
      put('comparison','作品・読者・紹介先の比較',cohort?.seeds>=3?'ok':'wait',cohort?'比較作品 '+cohort.seeds+'本／3作品以上に共通する読者 '+cohort.readers.length+'人／紹介活動を確認した作者 '+cohort.curators.length+'人。材料不足の間は従来の巡回を継続します。':'比較用の自作本文を取得待ちです。通常巡回中に自動で収集します。');
      if(result.comments)await diagnostic16915(env,'comments','read','comment_rows');
      if(env.TRACE.diagnosticFault16919)put('diagnostic','確認記録の保存','error','読み取りはできましたが、診断記録の保存に失敗しました。TEST20/diagnostic/'+env.TRACE.diagnosticFault16919);
    }catch(error){
      if(error instanceof Trouble && (error.retry || ['auth','rate','mismatch'].includes(error.kind)))
        await sql(env,'UPDATE nh_v13_connection SET hold_until=MAX(hold_until,?) WHERE slot=?',Date.now()+Math.max(error.retry||0,2*HOUR),r.slot).run();
      throw error;
    }finally{await release(env,lease);}
  },
  async joinTick520(now,probe=null){
    if(this.joinTask16920)return;
    const work=this.joinTickUnlocked16920(now,probe);this.joinTask16920=work;
    try{return await work;}finally{if(this.joinTask16920===work)this.joinTask16920=null;}
  },
  async testJoin16920(r){
    const now=Date.now(),cfg=this.one('SELECT * FROM desk_join_cfg WHERE id=1');
    if(!this.joinActive520('')){this.testResult16920(r.token,'application','参加申請・招待','wait','自動申請・作品管理が休止中、またはnote指定の待機中です。');return;}
    if(this.publicationPriority16916(now)){this.testResult16920(r.token,'application','参加申請・招待','wait','予約公開の時間帯のため公開処理を優先しました。');return;}
    const waiting=browserWait16916(this.env.BROWSER);
    if(waiting){this.testResult16920(r.token,'application','参加申請・招待','wait',waiting.message+' ／ '+time(waiting.retryAt)+' 以降に再確認できます。');return;}
    if(cfg.day===jstDay(now)&&cfg.used>=DISTRIBUTION16918.checks){this.testResult16920(r.token,'application','参加申請・招待','wait','本日の本人画面確認枠を使い切っています。翌日に再開します。');return;}
    if(typeof this.env.BROWSER?.acquire!=='function'){this.testResult16920(r.token,'application','参加申請・招待','error','BROWSERの設定がありません。');return;}
    let chosen,result;
    await this.joinTick520(now,{capture:value=>{chosen=value;this.testTarget16920(r.token,'join',value);},result:value=>{result=value;}});
    if(!chosen){
      const gap=this.one('SELECT app_next FROM desk_distribution16918 WHERE id=1').app_next;
      const reason=cfg.day===jstDay(now)&&cfg.used>=DISTRIBUTION16918.checks?'本日の本人画面確認枠を使い切っています。':
        gap>now?'次の新規申請は '+time(gap)+' 以降です。':'現在申請できる募集先・受信済み招待がありません。';
      this.testResult16920(r.token,'application','参加申請・招待','wait',reason+' テストによる送信はありません。');return;
    }
    const j=this.one('SELECT phase,proof,message FROM desk_join WHERE id=?',chosen.id);
    const confirmed=result?.joined===true || result?.existing===true;
    this.testResult16920(r.token,'application','参加申請・招待',confirmed?'ok':['sent','accepting'].includes(j.phase)?'unknown':'wait',chosen.name+' ／ '+j.message+
      (j.phase==='sent'?'。送信操作を記録しましたが、申請の到達はまだ未確認です。再送はしません。':''));
  },
  async testJoinProof16920(r){
    const target=JSON.parse(this.one('SELECT target FROM desk_test16920 WHERE id=1 AND token=?',r.token).target).join;
    if(!target){this.testResult16920(r.token,'application_proof','申請結果の確認','wait','確認対象の申請・招待がありません。');return;}
    const before=this.one('SELECT phase,proof FROM desk_join WHERE id=?',target.id);
    if(before?.phase==='joined' && before.proof>=r.started){
      this.testResult16920(r.token,'application_proof','申請結果の確認','ok',target.name+' ／ 今回の本人画面で共同運営者としての参加を確認しました。');return;
    }
    let result;
    await this.joinTick520(Date.now(),{target:target.id,verify:true,result:value=>{result=value;}});
    const j=this.one('SELECT phase,message FROM desk_join WHERE id=?',target.id);
    this.testResult16920(r.token,'application_proof','申請結果の確認',result?.joined||result?.existing?'ok':['sent','accepting','applied'].includes(j?.phase)?'unknown':'wait',
      target.name+' ／ '+(result?.message||j?.message||'本人画面を再確認できませんでした。')+
      (result?.existing?'。希望コメントの存在を確認しました。相手からの招待は待機中です。':''));
  },
  async testPlacement16920(r){
    const now=Date.now();
    if(!this.pipelineActive16913()){this.testResult16920(r.token,'placement','共同誌への掲載','wait','自動公開・共同誌への追加が休止中、またはnote指定の待機中です。');return;}
    // First resolve an existing unknown operation. Never re-add it to test.
    const pending=this.one("SELECT article,target id,label FROM desk_job WHERE kind='mag' AND phase IN ('sent','seen') ORDER BY at LIMIT 1");
    if(pending){this.testTarget16920(r.token,'mag',{...pending,fresh:false});this.testResult16920(r.token,'placement','共同誌への掲載','unknown','以前の掲載操作が未確認のため、その結果を先に調べます。新しく追加しません。');return;}
    const waiting=browserWait16916(this.env.BROWSER);
    if(waiting){this.testResult16920(r.token,'placement','共同誌への掲載','wait',waiting.message+' ／ '+time(waiting.retryAt)+' 以降に再確認できます。');return;}
    if(typeof this.env.BROWSER?.acquire!=='function'){this.testResult16920(r.token,'placement','共同誌への掲載','error','BROWSERの設定がありません。');return;}
    await this.handoffJoined16913(now);
    this.planArchive(Date.now());
    let chosen;
    await this.dispatch(Date.now(),false,{capture:value=>{chosen=value;this.testTarget16920(r.token,'mag',value);}});
    if(!chosen){
      const gate=this.one('SELECT mag_next FROM desk_distribution16918 WHERE id=1').mag_next;
      const used=this.one('SELECT utc_day,mags FROM desk_delivery WHERE id=1');
      const reason=this.publicationPriority16916(Date.now())?'予約公開の時間帯です。':gate>Date.now()?'次の追加は '+time(gate)+' 以降です。':
        used.utc_day===Math.floor(now/D520)&&used.mags>=DISTRIBUTION16918.placements?'本日の掲載枠を使い切っています。':
        '現在の条件・編集権限・作品の待機時間を満たす掲載対象がありません。';
      this.testResult16920(r.token,'placement','共同誌への掲載','wait',reason+' 掲載操作は行っていません。');return;
    }
    const j=this.one("SELECT phase,message FROM desk_job WHERE kind='mag' AND article=? AND target=?",chosen.article,chosen.id);
    this.testResult16920(r.token,'placement','共同誌への掲載',j?.phase==='confirmed'?'ok':['sent','seen'].includes(j?.phase)?'unknown':'wait',chosen.title+' → '+chosen.name+' ／ '+(j?.message||'操作は未実行です。'));
  },
  async testPlacementProof16920(r){
    const target=JSON.parse(this.one('SELECT target FROM desk_test16920 WHERE id=1 AND token=?',r.token).target).mag;
    if(!target){this.testResult16920(r.token,'proof','掲載結果の確認','wait','今回確認する掲載操作がありません。掲載成功は未確認です。');return;}
    if(!this.pipelineActive16913()){this.testResult16920(r.token,'proof','掲載結果の確認','wait','作品管理の停止・note指定の待機により、結果確認を保留しました。');return;}
    const pending=this.one("SELECT phase FROM desk_job WHERE kind='mag' AND article=? AND target=?",target.article,target.id);
    if(!pending || pending.phase==='wait'){this.testResult16920(r.token,'proof','掲載結果の確認','wait','掲載操作が実行されていないため、掲載成功は未確認です。');return;}
    // Only an exact article × magazine public read may confirm this test.
    await this.verifyPlacement16913(Date.now(),target);
    const proof=this.one('SELECT observed FROM desk_ref WHERE article=? AND id=?',target.article,target.id);
    const j=this.one("SELECT phase,message FROM desk_job WHERE kind='mag' AND article=? AND target=?",target.article,target.id);
    const v=this.one('SELECT message FROM desk_mag_verify16913 WHERE article=? AND id=?',target.article,target.id);
    this.testResult16920(r.token,'proof','掲載結果の確認',proof?'ok':'unknown',proof?
      (target.fresh?'今回の操作後に':'以前の操作について')+'、同じ作品・同じ誌への掲載を公開情報で確認しました。確認日時 '+time(proof.observed)+' ／ 記事 '+target.article+' ／ 誌 '+target.id:
      (v?.message||j?.message||'掲載状態を読み取れませんでした。')+'。掲載成功とは数えず、通常の結果確認を続けます。');
  }
});
async function productionReaderProbe16920(env,id,seed,source=null){
  return inNoteBrowser(env.BROWSER,cleanCookie(env.NOTE_SESSION),false,async io=>{
    const {command,evaluate,blocked,blockedResult}=io;
    await command('Page.navigate',{url:'https://note.com/'+seed.owner+'/n/'+seed.key});
    let who;
    for(let i=0;i<12&&!blocked();i++){try{who=await evaluate(noteIdentityJS);if(who?.id)break;}catch{}await pause520(250);}
    if(blocked())return blockedResult();
    if(who?.id!==id)return {message:'記事画面で保存済みの本人を確認できません。'};
    const read=step=>evaluate('('+BROWSER_SOURCES520.readerScreen1697+')('+JSON.stringify(step)+','+JSON.stringify(seed)+')');
    const poll=async(step,valid,opener=false)=>{
      let prev='',last={state:'loading'};
      for(let i=0;i<24&&!blocked();i++){
        last=await read(step);
        if(last?.state==='page')return last;
        const next=JSON.stringify(last);
        if(valid(last)&&(opener||next===prev))return last;
        prev=next;await pause520(250);
      }
      return {...last,timedOut:true};
    };
    const ready=await poll('ready',v=>v?.state==='ready');
    if(blocked())return blockedResult();
    if(ready.state!=='ready')return {message:'記事画面の読み込みを確認できません。TEST21/article_page'};
    // Authoritative article metadata can explain zero targets, but does not
    // count as a successful read of a list or authorize a comment reaction.
    const count=name=>{
      if(source?.key!==seed.key||source?.user?.urlname!==seed.owner||source?.status!=='published')return null;
      const n=source[name+'Count']??source[name+'_count'];
      return typeof n==='number'&&Number.isSafeInteger(n)&&n>=0?n:null;
    };
    await evaluate('window.scrollTo(0,document.documentElement.scrollHeight)');
    const commentOpen=await poll('openComments',v=>['ready','opened'].includes(v?.state),true);
    const comments=await poll('comments',v=>v?.state==='ready'&&(v.rows?.length>0||v.empty===true));
    if(blocked())return blockedResult();
    // Close a recognized comments modal before opening the separate liker list.
    const closed=await read('closeComments');
    const opened=['ready','closed'].includes(closed?.state)?await poll('openLikers',v=>['ready','opened'].includes(v?.state),true):{state:'overlay'};
    const readers=await poll('readers',v=>v?.state==='ready'&&v.likesRead===true);
    if(blocked())return blockedResult();
    const commentCount=comments.rows?.length||0;
    const statesRead=(comments.rows||[]).filter(r=>typeof r.liked==='boolean').length;
    const commentsRead=comments.state==='ready'&&!comments.timedOut&&commentCount>0;
    const commentEmpty=!commentCount&&!comments.roots&&(comments.empty===true||count('comment')===0);
    const readersRead=readers.state==='ready'&&!readers.timedOut&&readers.likesRead===true;
    const readerEmpty=!readersRead&&count('like')===0;
    const commentCode=comments.state==='page'?'article_page':comments.state==='loading'?'comment_loading':comments.roots?'comment_rows':commentOpen.state==='opened'?'comment_loading':'comment_control';
    const readerCode=readers.state==='page'?'article_page':opened.state==='overlay'?'comment_overlay':readers.modal?'liker_list':opened.state==='opened'?'liker_loading':'liker_control';
    return {identity:true,comments:commentsRead,commentCount,commentEmpty,readers:readersRead,readerEmpty,owners:readers.likeOwners||[],
      commentMessage:commentsRead?'本文・作者を読み取れたコメント '+commentCount+'件。スキ状態を確認できたもの '+statesRead+'件。状態不明のコメントには操作しません。スキは送信していません。':
        commentEmpty?'コメント0件のため、コメントへのスキは未検証です。'+(comments.empty?'コメント欄の空表示を確認しました。':'記事情報の件数を確認しました。'):
        'コメント欄を読み取れません。'+(comments.roots?'項目 '+comments.roots+'件の本文・作者を特定できません。':commentOpen.state==='opened'?'欄を開きましたが読み込みを確認できません。':'欄を開くボタン・コメント項目を確認できません。')+' TEST21/comments/'+commentCode,
      readerMessage:readersRead?'スキした読者一覧を読み取れました。取得できた範囲で '+(readers.likeOwners?.length||0)+'人。':
        readerEmpty?'記事情報ではスキ0件のため、読者一覧の読み取りは未検証です。':
        'スキした読者一覧を読み取れません。'+(readers.modal?'一覧画面内の読者・空表示を確認できません。':opened.state==='opened'?'一覧を開く操作後、一覧画面を確認できません。':opened.state==='overlay'?'コメント画面を閉じられません。':'一覧を開く数字・ボタンを確認できません。')+' TEST21/readers/'+readerCode};
  },env.TRACE);
}
async function productionTestRoute16920(request,env){
  if(request.method==='GET')return productionTestPage16920();
  if(request.method!=='POST')return reply('Method not allowed',false,405);
  const json=request.headers.get('Accept')?.includes('application/json');
  const fail=(message,status)=>json?deskJson({error:message},status):productionTestPage16920(null,message,status);
  if(request.headers.get('Origin')!==new URL(request.url).origin)return fail('操作画面を開き直してください。',403);
  if(!env.ADMIN_KEY || !env.SCHEDULER)return fail('ADMIN_KEY・SCHEDULERの設定を確認してください。',503);
  try{
    const f=new URLSearchParams(await read520body(request,20000));
    if(f.get('key')!==env.ADMIN_KEY)return fail('管理用の鍵が違います。',403);
    if(!['run','status'].includes(f.get('action')))return fail('操作を選んでください。',400);
    const slot=f.get('account')||'1';if(!SLOTS.includes(slot))return fail('アカウントを選んでください。',400);
    const res=await stub520(env).fetch(new Request('https://scheduler.internal/desk/admin',{method:'POST',body:JSON.stringify({action:f.get('action')==='run'?'production_test_start':'production_test_status',slot})}));
    if(!res.ok)return fail('テストの記録に接続できません。処理を開始済みの場合は「結果を確認」で確認してください。',503);
    const view=await res.json();
    return json?deskJson(view):productionTestPage16920(view);
  }catch{return fail('接続・保存を確認できません。「結果を確認」で保存済みの結果を確認してください。',503);}
}
function productionTestText16920(v){
  if(!v?.started)return 'テストの記録はまだありません。';
  return ['開始 '+time(v.started)+' ／ 読み取り対象：アカウント '+v.slot,
    v.active?'処理中：'+v.step+'（自動で続けます）':'テスト終了。各項目の結果を確認してください。',
    ...v.results.map(r=>'【'+r.label+'】'+(TEST_LABELS16920[r.state]||'未確認')+'\n'+r.message+'\n'+time(r.at)),
    '次の新しいテスト：'+time(v.nextTest)+' 以降'].join('\n\n');
}
function productionTestPage16920(view=null,message='',status=200){
  const nonce=crypto.randomUUID().replaceAll('-','');
  return new Response(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>今すぐ本番テスト ${VERSION}</title><style>body{font:17px system-ui;max-width:740px;margin:24px auto;padding:0 18px;line-height:1.7}input,select,button{font:inherit;padding:12px;box-sizing:border-box}input,select{width:100%}label{display:block;margin:12px 0}button{margin:8px 6px 8px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f4f6;padding:16px}</style>
<h1>今すぐ本番テスト</h1><p>note-helper ${VERSION}</p><p><a href="/">スキ回り</a> ／ <a href="/520">520 作品管理</a></p>
<p>追加機能の保存・本人確認・読者一覧を読み取り、520の参加申請または招待確認を最大1誌、公開済み作品の共同誌への追加を最大1件試します。掲載先の公開表示まで確認します。</p>
<p>実際に参加希望コメント・招待承認・掲載を行う場合があります。無料・募集条件・編集権限を確認し、既存の送信間隔・回数制限・停止設定を守ります。記事の新規公開、スキ送信、フォローはこのテストでは行いません。</p>
<form method="post" action="/test" id="testform"><label>管理用の鍵（ADMIN_KEY）<input type="password" name="key" required autocomplete="off" autocapitalize="none" spellcheck="false"></label>
<label>追加機能の読み取りを試すアカウント<select name="account"><option value="1"${view?.slot==='2'?'':' selected'}>1</option><option value="2"${view?.slot==='2'?' selected':''}>2</option></select></label>
<button name="action" value="run">今すぐテスト</button><button name="action" value="status">結果を確認</button></form>
<p id="message" role="status">${esc(message)}</p><pre id="testresult">${esc(productionTestText16920(view))}</pre>
<p>1回のテストは通常数分です。処理中は結果を自動表示します。画面を閉じても保存された順番で続けます。申請の相手方承認、閲覧数、スキ返しは保証できません。Tutaの受信接続は今回のテスト対象外です。</p>
<script nonce="${nonce}">(()=>{const f=document.getElementById('testform'),out=document.getElementById('testresult'),msg=document.getElementById('message');let busy=false,timer;
const tm=n=>typeof n==='number'&&n>0&&Number.isFinite(new Date(n).getTime())?new Date(n).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'未記録';
const states=${JSON.stringify(TEST_LABELS16920)};
async function send(action){if(busy)return;busy=true;clearTimeout(timer);try{const data=new URLSearchParams(new FormData(f));data.set('action',action);
const res=await fetch('/test',{method:'POST',headers:{Accept:'application/json'},body:data});if(!res.headers.get('Content-Type')?.includes('application/json'))throw Error('応答を確認できません。「結果を確認」を押してください。');const s=await res.json();if(!res.ok)throw Error(s.error);
out.textContent=!s.started?'テストの記録はまだありません。':['開始 '+tm(s.started)+' ／ 読み取り対象：アカウント '+s.slot,s.active?'処理中：'+s.step+'（自動で続けます）':'テスト終了。各項目の結果を確認してください。',...s.results.map(r=>'【'+r.label+'】'+(states[r.state]||'未確認')+'\\n'+r.message+'\\n'+tm(r.at)),'次の新しいテスト：'+tm(s.nextTest)+' 以降'].join('\\n\\n');
msg.textContent=s.active?'テスト中です。結果は自動で表示します。':'保存された結果を表示しました。';if(s.active)timer=setTimeout(()=>send('status'),4000);
}catch(e){msg.textContent=e.message||'通信を確認できません。「結果を確認」を押してください。';}finally{busy=false;}}
f.addEventListener('submit',e=>{e.preventDefault();if(f.reportValidity())send(e.submitter?.value||'status');});})();</script></html>`,{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':"default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"}});
}

// Public literary discovery. Derived, bounded caches live in the existing
// Durable Object, never in D1. They cannot authorize an external write.
const NETWORK16922=Object.freeze({works:320,magazines:128,samples:80,curators:96,seeds:10,readers:20,days:28,daily:8,gap:30*60000});
const LOCAL_NETWORK16922=new WeakSet();
const NETWORK_THEMES16922=[
  ['仕事','仕事|職場|接客|店員|客席|出勤|退勤|給料|時給|店長|同僚|ロッカー|梱包|工場|営業'],
  ['容姿','容姿|顔|鏡|化粧|美容|整形|口紅|香水|鼻|可愛い|美し'],
  ['関係','恋|彼女|彼氏|恋人|好き|愛し|キス|別れ|返信|ふたり|二人|きみ|君'],
  ['記憶','記憶|思い出|思い出す|あの頃|昔|回想|忘れ|覚えて'],
  ['暮らし','部屋|台所|洗濯|アパート|団地|冷蔵庫|玄関|窓|暮らし|コンビニ|ワンルーム'],
  ['家族','家族|母|父|姉|妹|兄|弟|娘|息子|親子'],
  ['都市','電車|駅|タクシー|改札|終電|街|歩道|信号|東京'],
  ['自然','雨|海|水|川|花|桜|風|鳥|動物|木|空'],
  ['金銭','金|支払|会計|値段|借金|財布|千円|万円'],
  ['独白','僕|ぼく|俺|わたし|わたしたち|おまえ']
];
function networkJSON16922(s,fallback=[]){try{const x=JSON.parse(s);return Array.isArray(x)?x:fallback;}catch{return fallback;}}
function networkOwner16922(s){return typeof s==='string'&&/^[\w-]{1,80}$/.test(s)&&!['api','settings','search','hashtag','tag','info'].includes(s);}
function networkNote16922(n){return n?.status==='published'&&/^n[a-z0-9]{1,64}$/.test(n.key||'')&&networkOwner16922(n.user?.urlname)&&typeof n.name==='string'&&n.name.trim()&&n.name.trim()!=='521';}
function networkFeature16922(n,detail=false){
  const full=detail&&typeof n.body==='string'&&n.body.length<=250000&&n.is_limited!==true&&n.isLimited!==true&&n.is_paid!==true&&n.isPaid!==true&&!(Number(n.price)>0);
  const text=words161((n.name||'')+'\n'+(full?n.body:'')).normalize('NFKC').slice(0,24000);
  const counts=new Map(),stop=new Set(['自分','本当','今日','時間','言葉','文章','小説','記事','作品','投稿','読者','紹介','気持','全部','最後','最初','人間']);
  for(const word of text.match(/[一-龯々]{2,8}|[ァ-ヶー]{3,16}/g)||[]){
    const parts=/^[一-龯々]+$/.test(word)?Array.from({length:word.length-1},(_,i)=>word.slice(i,i+2)):[word];
    for(const token of parts)if(!stop.has(token))counts.set(token,(counts.get(token)||0)+1);
  }
  return {full:!!full&&text.length>=80,themes:NETWORK_THEMES16922.filter(([,p])=>new RegExp(p).test(text)).map(([k])=>k),
    tokens:[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,96).map(([k])=>k)};
}
function networkSimilarity16922(a,b){
  if(!a?.full||!b?.full)return 0;
  const themes=a.themes.filter(t=>t!=='独白'&&b.themes.includes(t)),tokens=a.tokens.filter(t=>b.tokens.includes(t));
  // Genre labels alone cannot establish a match. This is content similarity,
  // not an inference about either creator's or reader's personal attributes.
  if(themes.length<2&&tokens.length<4)return 0;
  return Math.min(1,0.55*themes.length/Math.max(2,new Set([...a.themes,...b.themes].filter(t=>t!=='独白')).size)+
    0.45*tokens.length/Math.max(8,Math.min(a.tokens.length,b.tokens.length)));
}
function networkParseFeature16922(text){try{const f=JSON.parse(text);return f&&typeof f.full==='boolean'&&Array.isArray(f.themes)&&Array.isArray(f.tokens)?f:null;}catch{return null;}}
function networkCall16922(env,method,...args){
  const bridge=env.NETWORK16922;
  if(!bridge||!LOCAL_NETWORK16922.has(bridge))return null;
  return bridge.call(method,env.SLOT,env.TRACE?.identity,...args);
}
async function networkEnqueue16922(env,bump){
  const candidates=networkCall16922(env,'queue')||[];
  for(const c of candidates.slice(0,4))await rememberReaders1699(env,[c.owner],{key:c.article,owner:env.TRACE?.identity?.owner||''},c.origin,bump);
}
Object.assign(Desk520.prototype,{
  initNetwork16922(){
    if(this.networkReady16922)return;
    if(!this.one("SELECT 1 FROM sqlite_master WHERE name='desk_network16922'"))this.storage.transactionSync(()=>{
      this.rows("CREATE TABLE desk_audience16922(slot TEXT PRIMARY KEY,account TEXT NOT NULL,owner TEXT NOT NULL,corpus TEXT NOT NULL DEFAULT '[]',seeds TEXT NOT NULL DEFAULT '[]',queue_at INTEGER NOT NULL DEFAULT 0,updated INTEGER NOT NULL DEFAULT 0)");
      this.rows("CREATE TABLE desk_network_work16922(article TEXT PRIMARY KEY,owner TEXT NOT NULL,title TEXT NOT NULL,pub INTEGER NOT NULL,feature TEXT NOT NULL,full INTEGER NOT NULL,fiction INTEGER NOT NULL,likes INTEGER NOT NULL,seen INTEGER NOT NULL,due INTEGER NOT NULL DEFAULT 0)");
      this.rows('CREATE INDEX desk_network_work_due16922 ON desk_network_work16922(due,article)');
      this.rows('CREATE INDEX desk_network_work_owner16922 ON desk_network_work16922(owner,pub DESC)');
      this.rows('CREATE INDEX desk_network_work_seen16922 ON desk_network_work16922(seen,article)');
      this.rows("CREATE TABLE desk_network_mag16922(id TEXT PRIMARY KEY,url TEXT NOT NULL,owner TEXT NOT NULL,name TEXT NOT NULL,items TEXT NOT NULL DEFAULT '[]',first_at INTEGER NOT NULL,last_at INTEGER NOT NULL,changed INTEGER NOT NULL DEFAULT 0)");
      this.rows('CREATE INDEX desk_network_mag_age16922 ON desk_network_mag16922(last_at,id)');
      this.rows("CREATE TABLE desk_network_sample16922(article TEXT PRIMARY KEY,owner TEXT NOT NULL,readers TEXT NOT NULL,sampled INTEGER NOT NULL)");
      this.rows('CREATE INDEX desk_network_sample_age16922 ON desk_network_sample16922(sampled,article)');
      this.rows("CREATE TABLE desk_network_curator16922(owner TEXT PRIMARY KEY,posts TEXT NOT NULL DEFAULT '[]',magazines TEXT NOT NULL DEFAULT '[]',seen INTEGER NOT NULL)");
      this.rows('CREATE INDEX desk_network_curator_age16922 ON desk_network_curator16922(seen,owner)');
      this.rows("CREATE TABLE desk_network_route16922(article TEXT PRIMARY KEY,id TEXT NOT NULL,at INTEGER NOT NULL,reason TEXT NOT NULL)");
      this.rows('CREATE INDEX desk_network_route_age16922 ON desk_network_route16922(at,article)');
      this.rows("CREATE TABLE desk_network16922(id INTEGER PRIMARY KEY,due INTEGER NOT NULL DEFAULT 0,day TEXT NOT NULL DEFAULT '',used INTEGER NOT NULL DEFAULT 0,turn INTEGER NOT NULL DEFAULT 0,fault_until INTEGER NOT NULL DEFAULT 0,checked INTEGER NOT NULL DEFAULT 0,message TEXT NOT NULL DEFAULT '公開作品と読者の比較材料を収集中')");
      this.rows('INSERT INTO desk_network16922(id) VALUES(1)');
    });
    this.networkReady16922=true;
  },
  networkTry16922(fn,fallback=null){
    if(this.networkFaultUntil16922>Date.now())return fallback;
    try{this.initNetwork16922();return fn();}catch{
      // The new cache failing cannot abort ordinary likes or a publication.
      this.networkFaultUntil16922=Date.now()+HOUR;
      try{this.rows("UPDATE desk_network16922 SET fault_until=?,message='比較情報の保存・読み取りを再確認待ち。従来の巡回を継続' WHERE id=1",this.networkFaultUntil16922);}catch{}
      return fallback;
    }
  },
  networkIdentity16922(slot,identity){
    if(!SLOTS.includes(slot)||!networkOwner16922(identity?.owner)||!/^\d{1,20}$/.test(identity?.id||''))return null;
    let row=this.one('SELECT * FROM desk_audience16922 WHERE slot=?',slot);
    if(!row||row.account!==identity.id||row.owner!==identity.owner){
      this.rows("INSERT INTO desk_audience16922(slot,account,owner) VALUES(?,?,?) ON CONFLICT(slot) DO UPDATE SET account=excluded.account,owner=excluded.owner,corpus='[]',seeds='[]',queue_at=0,updated=0",slot,identity.id,identity.owner);
      row=this.one('SELECT * FROM desk_audience16922 WHERE slot=?',slot);
    }
    return row;
  },
  networkWork16922(n,detail=false){
    if(!networkNote16922(n))return null;
    const now=Date.now(),f=networkFeature16922(n,detail),pub=Date.parse(n.publishAt||n.publish_at||n.publishedAt)||0;
    if(pub>now)return null;
    const own=this.rows('SELECT owner FROM desk_audience16922').some(r=>r.owner===n.user.urlname)||n.user.urlname==='43__';
    const old=this.one('SELECT * FROM desk_network_work16922 WHERE article=?',n.key);
    if(old&&old.owner!==n.user.urlname){this.rows('DELETE FROM desk_network_sample16922 WHERE article=?',n.key);}
    // A summary never overwrites a verified full-text fingerprint.
    if(!detail&&old?.full&&old.owner===n.user.urlname)return old;
    this.rows(`INSERT INTO desk_network_work16922(article,owner,title,pub,feature,full,fiction,likes,seen,due) VALUES(?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(article) DO UPDATE SET owner=excluded.owner,title=excluded.title,pub=excluded.pub,feature=excluded.feature,full=excluded.full,fiction=excluded.fiction,likes=excluded.likes,seen=excluded.seen,
      due=CASE WHEN ? THEN excluded.due ELSE desk_network_work16922.due END`,n.key,n.user.urlname,n.name.slice(0,160),pub,JSON.stringify(f),+f.full,+(own||publicFiction1697(n)),Math.max(0,Number(n.likeCount??n.like_count)||0),now,detail?now+7*D520:0,+detail);
    this.networkTrim16922('desk_network_work16922','article','seen',NETWORK16922.works);
    if(detail){
      this.networkRecommendations16922(n,f,now);
      for(const m of (Array.isArray(n.magazines)?n.magazines:[]).slice(0,12)){
        const link=noteLink161(m?.magazineUrl||m?.magazine_url||m?.url||(/^m[a-z0-9]{1,64}$/.test(m?.key||'')?'https://note.com/m/'+m.key:''));
        if(link){
          this.networkMagazine16922(link,m.name||link.id,[{title:n.name,link:'https://note.com/'+n.user.urlname+'/n/'+n.key,pubdate:pub?new Date(pub).toISOString():''}],false);
          const related=f.full&&publicFiction1697(n)&&this.rows('SELECT * FROM desk_audience16922').some(r=>this.networkOwnFeatures16922(r).some(o=>networkSimilarity16922(o,f)>=0.22));
          if(related&&link.owner!=='43__'&&this.rememberMagazine(link,m.name||link.id)){
            this.rows('INSERT OR IGNORE INTO desk_scout_mag(id) VALUES(?)',link.id);
            this.rows("INSERT OR IGNORE INTO desk_scout(url,kind,due) VALUES(?,'feed',?)",link.url,now);
          }
        }
      }
    }
    return this.one('SELECT * FROM desk_network_work16922 WHERE article=?',n.key);
  },
  networkTrim16922(table,key,column,limit){
    // All callers are fixed internal constants. At most cap+batch rows exist.
    if(table==='desk_network_work16922'){
      const kept=new Set(this.rows('SELECT corpus,seeds FROM desk_audience16922').flatMap(r=>[...networkJSON16922(r.corpus).slice(0,12),...networkJSON16922(r.seeds).slice(0,10)]));
      for(const w of this.rows("SELECT article FROM desk_network_work16922 WHERE owner='43__' AND full=1 ORDER BY pub DESC LIMIT 12"))kept.add(w.article);
      const keys=[...kept],where=keys.length?' WHERE article NOT IN ('+keys.map(()=>'?').join(',')+')':'';
      const extra=this.rows('SELECT article FROM desk_network_work16922'+where+' ORDER BY full DESC,seen DESC,article LIMIT 40 OFFSET ?',...keys,Math.max(0,limit-keys.length));
      for(const w of extra)this.rows('DELETE FROM desk_network_work16922 WHERE article=?',w.article);
      return;
    }
    const extra=this.rows('SELECT '+key+' FROM '+table+' ORDER BY '+column+' DESC,'+key+' LIMIT 40 OFFSET ?',limit);
    for(const row of extra)this.rows('DELETE FROM '+table+' WHERE '+key+'=?',row[key]);
  },
  networkCorpus16922(slot,identity,notes,detail=false){
    const row=this.networkIdentity16922(slot,identity);if(!row)return;
    let keys=networkJSON16922(row.corpus);
    for(const n of notes.slice(0,12))if(networkNote16922(n)&&n.user.urlname===row.owner&&String(n.user.id)===row.account){
      const w=this.networkWork16922(n,detail);if(w)keys=[...new Set([...keys,w.article])];
    }
    const works=keys.map(k=>this.one('SELECT article,pub FROM desk_network_work16922 WHERE article=? AND owner=?',k,row.owner)).filter(Boolean).sort((a,b)=>b.pub-a.pub||a.article.localeCompare(b.article)).slice(0,12);
    this.rows('UPDATE desk_audience16922 SET corpus=?,updated=? WHERE slot=?',JSON.stringify(works.map(w=>w.article)),Date.now(),slot);
  },
  networkOwnFeatures16922(row){
    return networkJSON16922(row?.corpus).slice(0,12).map(k=>this.one('SELECT feature FROM desk_network_work16922 WHERE article=? AND owner=? AND full=1',k,row.owner)).filter(Boolean).map(w=>networkParseFeature16922(w.feature)).filter(Boolean);
  },
  networkSeeds16922(slot,identity,notes=[],fallback=null,choose=false,turn=0){
    const row=this.networkIdentity16922(slot,identity);if(!row)return fallback;
    for(const n of notes.slice(0,8))if(networkNote16922(n)&&publicFiction1697(n)&&n.user.urlname!==row.owner)this.networkWork16922(n,false);
    const own=this.networkOwnFeatures16922(row);if(!own.length)return fallback;
    const excluded=new Set(this.rows('SELECT owner FROM desk_audience16922').map(r=>r.owner));
    const candidates=this.rows('SELECT * FROM desk_network_work16922 WHERE fiction=1 AND full=1 AND likes>0 AND seen>=? ORDER BY seen DESC,article LIMIT 320',Date.now()-28*D520)
      .filter(w=>!excluded.has(w.owner)&&w.owner!=='43__').map(w=>({...w,score:Math.max(0,...own.map(f=>networkSimilarity16922(f,networkParseFeature16922(w.feature))))})).filter(w=>w.score>=0.22)
      .sort((a,b)=>b.score-a.score||b.pub-a.pub||a.article.localeCompare(b.article));
    const writers=new Set(),seeds=[];
    for(const w of candidates)if(!writers.has(w.owner)){writers.add(w.owner);seeds.push(w);if(seeds.length>=NETWORK16922.seeds)break;}
    const keys=seeds.map(w=>w.article);
    if(JSON.stringify(keys)!==row.seeds)this.rows('UPDATE desk_audience16922 SET seeds=?,updated=? WHERE slot=?',JSON.stringify(keys),Date.now(),slot);
    if(!choose)return fallback;
    // Alternate ordinary affinity samples with a missing second article from
    // an eligible magazine. Both use the SAME existing reader-browser slot.
    if(Math.floor(turn/4)%2){
      const mags=this.rows(`SELECT m.* FROM desk_network_mag16922 m JOIN desk_import i ON i.id=m.id JOIN desk_member r ON r.id=m.id
        WHERE i.allowed=1 AND i.managed=1 AND i.state='利用中' AND r.mode='auto' AND r.checked>? AND m.last_at>?
        ORDER BY m.last_at DESC,m.id LIMIT 12`,Date.now()-2*D520,Date.now()-28*D520),needs=[];
      const byKey=new Map(candidates.map(w=>[w.article,w]));
      for(const mag of mags){
        const items=networkJSON16922(mag.items).slice(0,20),samples=items.map(i=>this.one('SELECT sampled FROM desk_network_sample16922 WHERE article=? AND sampled>?',i.article,Date.now()-28*D520)).filter(Boolean).length;
        for(const item of items){const work=byKey.get(item.article),sample=this.one('SELECT sampled FROM desk_network_sample16922 WHERE article=?',item.article);
          if(work&&(!sample||sample.sampled<Date.now()-7*D520))needs.push({...work,samples});}
      }
      needs.sort((a,b)=>a.samples-b.samples||b.score-a.score||a.article.localeCompare(b.article));
      if(needs[0])return {key:needs[0].article,owner:needs[0].owner};
    }
    const ranked=seeds.map(w=>({...w,sampled:this.one('SELECT sampled FROM desk_network_sample16922 WHERE article=?',w.article)?.sampled||0})).sort((a,b)=>a.sampled-b.sampled||b.score-a.score);
    const next=ranked.find(w=>w.sampled<Date.now()-7*D520);
    return next?{key:next.article,owner:next.owner}:fallback;
  },
  networkObserve16922(slot,identity,source,owners,returning=false){
    const row=this.networkIdentity16922(slot,identity);if(!row||!networkNote16922(source))return;
    if(returning){this.networkCorpus16922(slot,identity,[source],true);return;}
    if(!publicFiction1697(source)||source.user.urlname===identity.owner)return;
    this.networkWork16922(source,true);
    const excluded=new Set(this.rows('SELECT owner FROM desk_audience16922').map(r=>r.owner));
    const names=[...new Set(owners)].filter(o=>networkOwner16922(o)&&!excluded.has(o)&&o!==source.user.urlname&&o!=='43__').slice(0,20);
    this.rows('INSERT INTO desk_network_sample16922(article,owner,readers,sampled) VALUES(?,?,?,?) ON CONFLICT(article) DO UPDATE SET owner=excluded.owner,readers=excluded.readers,sampled=excluded.sampled',source.key,source.user.urlname,JSON.stringify(names),Date.now());
    this.networkTrim16922('desk_network_sample16922','article','sampled',NETWORK16922.samples);
    this.networkSeeds16922(slot,identity);
  },
  networkReaders16922(row){
    if(!row)return [];
    const cutoff=Date.now()-28*D520,people=new Map(),own=new Set(this.rows('SELECT owner FROM desk_audience16922').map(r=>r.owner)),features=this.networkOwnFeatures16922(row);
    for(const key of networkJSON16922(row.seeds).slice(0,10)){
      const s=this.one('SELECT * FROM desk_network_sample16922 WHERE article=? AND sampled>=?',key,cutoff);
      const w=this.one('SELECT owner,feature FROM desk_network_work16922 WHERE article=? AND full=1 AND seen>=?',key,cutoff);
      if(!s||!w||s.owner!==w.owner||!features.some(f=>networkSimilarity16922(f,networkParseFeature16922(w.feature))>=0.22))continue;
      for(const owner of networkJSON16922(s.readers).slice(0,20)){
        if(!networkOwner16922(owner)||own.has(owner)||owner==='43__')continue;
        const p=people.get(owner)||{owner,writers:new Set(),articles:new Set(),article:key,origin:'overlap'};
        p.writers.add(s.owner);p.articles.add(key);people.set(owner,p);
      }
    }
    return [...people.values()].filter(p=>p.writers.size>=3&&p.articles.size>=3).map(p=>({...p,count:p.writers.size})).sort((a,b)=>b.count-a.count||a.owner.localeCompare(b.owner));
  },
  networkMagazine16922(link,name,entries,complete=true){
    if(!link||!/^m[a-z0-9]{1,64}$/.test(link.id))return;
    const now=Date.now(),old=this.one('SELECT * FROM desk_network_mag16922 WHERE id=?',link.id),prior=networkJSON16922(old?.items);
    const items=[...new Map(entries.slice(0,30).map(e=>{
      const a=noteLink161(e.link,link.url,'article'),pub=Date.parse(e.pubdate);
      return a&&Number.isFinite(pub)&&pub>0&&pub<=now&&pub>=now-60*D520?[a.id,{article:a.id,owner:a.owner,title:String(e.title||'').slice(0,160),pub}]:null;
    }).filter(Boolean)).values()].slice(0,20);
    const combined=complete?items:[...new Map([...items,...prior].map(e=>[e.article,e])).values()].slice(0,20);
    const owner=networkOwner16922(link.owner)?link.owner:old?.owner||'';
    const changed=!!old&&complete&&now-old.first_at>=7*D520&&items.some(e=>!prior.some(p=>p.article===e.article));
    this.rows(`INSERT INTO desk_network_mag16922(id,url,owner,name,items,first_at,last_at,changed) VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET url=excluded.url,owner=excluded.owner,name=excluded.name,items=excluded.items,last_at=excluded.last_at,changed=MAX(desk_network_mag16922.changed,excluded.changed)`,link.id,link.url,owner,String(name||link.id).slice(0,100),JSON.stringify(combined),old?.first_at||now,now,changed?now:0);
    // Hydrate only a few diverse public works, through the shared scout budget.
    const writers=new Set();
    for(const item of items)if(writers.size<4&&!writers.has(item.owner)){
      writers.add(item.owner);this.networkWork16922({key:item.article,status:'published',user:{urlname:item.owner},name:item.title,publishAt:new Date(item.pub).toISOString()},false);
    }
    this.networkTrim16922('desk_network_mag16922','id','last_at',NETWORK16922.magazines);
    if(owner&&owner!=='43__'){
      const curator=this.one('SELECT * FROM desk_network_curator16922 WHERE owner=?',owner),mags=networkJSON16922(curator?.magazines);
      this.rows("INSERT INTO desk_network_curator16922(owner,magazines,seen) VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET magazines=excluded.magazines,seen=excluded.seen",owner,JSON.stringify([...new Set([link.id,...mags])].slice(0,8)),now);
      this.networkTrim16922('desk_network_curator16922','owner','seen',NETWORK16922.curators);
    }
  },
  networkRecommendations16922(n,f,now){
    if(!f.full||n.user.urlname==='43__'||!/紹介|おすすめ|推薦|読んだ|読みました/.test(words161(n.body).slice(0,24000)))return;
    const targets=[...new Map(anchors161(n.body).slice(0,80).map(a=>noteLink161(a.href,'https://note.com','article')).filter(a=>a&&a.owner!==n.user.urlname).map(a=>[a.owner,a])).values()];
    const pub=Date.parse(n.publishAt||n.publish_at||n.publishedAt);
    if(targets.length<2||!Number.isFinite(pub)||pub<now-60*D520||pub>now)return;
    const old=this.one('SELECT * FROM desk_network_curator16922 WHERE owner=?',n.user.urlname),posts=networkJSON16922(old?.posts).filter(p=>p.article!==n.key&&p.pub>=now-60*D520);
    posts.push({article:n.key,pub,owners:targets.slice(0,8).map(a=>a.owner),feature:f});
    posts.sort((a,b)=>b.pub-a.pub);
    this.rows("INSERT INTO desk_network_curator16922(owner,posts,seen) VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET posts=excluded.posts,seen=excluded.seen",n.user.urlname,JSON.stringify(posts.slice(0,6)),now);
    this.networkTrim16922('desk_network_curator16922','owner','seen',NETWORK16922.curators);
  },
  networkCurators16922(row){
    const own=this.networkOwnFeatures16922(row);if(!own.length)return [];
    const now=Date.now(),excluded=new Set(this.rows('SELECT owner FROM desk_audience16922').map(r=>r.owner)),out=[];
    for(const c of this.rows('SELECT * FROM desk_network_curator16922 WHERE seen>=? ORDER BY seen DESC LIMIT 96',now-28*D520)){
      if(excluded.has(c.owner)||c.owner==='43__')continue;
      const posts=networkJSON16922(c.posts).filter(p=>p.pub>=now-60*D520&&p.pub<=now),days=new Set(posts.map(p=>jstDay(p.pub)));
      let score=0,article='',magazine='';
      if(days.size>=2&&Math.max(...posts.map(p=>p.pub))-Math.min(...posts.map(p=>p.pub))>=7*D520&&Math.max(...posts.map(p=>p.pub))>=now-28*D520){
        score=Math.max(0,...posts.flatMap(p=>own.map(f=>networkSimilarity16922(f,p.feature))));article=posts[0].article;
      }
      for(const id of networkJSON16922(c.magazines).slice(0,8)){
        const m=this.one('SELECT * FROM desk_network_mag16922 WHERE id=? AND owner=? AND last_at>=? AND changed>=?',id,c.owner,now-28*D520,now-28*D520);if(!m)continue;
        const items=networkJSON16922(m.items).filter(i=>i.owner!==c.owner&&i.pub>=now-60*D520),writers=new Set(items.map(i=>i.owner)),dates=items.map(i=>i.pub);
        if(writers.size<3||items.length<3||Math.max(...dates)-Math.min(...dates)<7*D520||Math.max(...dates)<now-28*D520)continue;
        const features=items.slice(0,20).map(i=>this.one('SELECT feature FROM desk_network_work16922 WHERE article=? AND full=1',i.article)).filter(Boolean).map(w=>networkParseFeature16922(w.feature)).filter(Boolean);
        const matches=features.map(f=>Math.max(0,...own.map(o=>networkSimilarity16922(o,f)))).filter(s=>s>=0.22);
        if(matches.length>=2&&Math.max(...matches)>score){score=Math.max(...matches);article=items[0].article;magazine=id;}
      }
      if(score>=0.22)out.push({owner:c.owner,score,article,magazine,origin:'curator'});
    }
    return out.sort((a,b)=>b.score-a.score||a.owner.localeCompare(b.owner)).slice(0,16);
  },
  networkBridge16922(){
    const desk=this,bridge={call(method,slot,identity,...args){return desk.networkTry16922(()=>{
      if(desk.one('SELECT fault_until FROM desk_network16922 WHERE id=1').fault_until>Date.now())return null;
      const row=desk.networkIdentity16922(slot,identity);if(!row)return null;
      if(method==='repeat')return desk.repeatObserve16923(slot,identity,...args);
      if(method==='repeatCounts')return desk.repeatCounts16923(slot,identity);
      if(method==='corpus')return desk.networkCorpus16922(slot,identity,...args);
      if(method==='seed')return desk.networkSeeds16922(slot,identity,...args);
      if(method==='note'){if(args[0]?.user?.urlname===identity.owner)desk.networkCorpus16922(slot,identity,[args[0]],true);else desk.networkWork16922(args[0],true);return null;}
      if(method==='missing'){
        const seed=args[0];if(!/^n[a-z0-9]{1,64}$/.test(seed?.key||'')||!networkOwner16922(seed?.owner))return;
        desk.rows('DELETE FROM desk_network_sample16922 WHERE article=? AND owner=?',seed.key,seed.owner);
        desk.rows('UPDATE desk_network_work16922 SET full=0,fiction=0,due=? WHERE article=? AND owner=?',Date.now()+D520,seed.key,seed.owner);
        desk.networkSeeds16922(slot,identity);return null;
      }
      if(method==='observe')return desk.networkObserve16922(slot,identity,...args);
      if(method==='origins')return Object.fromEntries(desk.networkReaders16922(row).map(r=>[r.owner,'overlap']));
      if(method==='queue'){
        if(row.queue_at>Date.now())return [];
        const readers=desk.networkReaders16922(row),curators=desk.networkCurators16922(row),turn=Math.floor(Date.now()/(6*HOUR));
        const rotated=readers.length?[...readers.slice(turn%readers.length),...readers.slice(0,turn%readers.length)]:[];
        const curator=curators.length?curators[turn%curators.length]:null;
        const candidates=[...rotated.slice(0,3),...(curator?[curator]:[])];
        if(curator)desk.rows("INSERT OR IGNORE INTO desk_scout(url,kind,due) VALUES(?,'author',?)",'https://note.com/'+curator.owner+'/magazines',Date.now());
        desk.rows('UPDATE desk_audience16922 SET queue_at=? WHERE slot=?',Date.now()+6*HOUR,slot);
        return candidates;
      }
      if(method==='rank')return [...desk.networkReaders16922(row),...desk.networkCurators16922(row)].slice(0,8).map(r=>r.owner);
      return null;
    });}};
    LOCAL_NETWORK16922.add(bridge);return bridge;
  },
  async networkTick16922(now){
    this.initNetwork16922();
    const c=this.one('SELECT * FROM desk_network16922 WHERE id=1'),cfg=this.one('SELECT c.enabled,c.blocked,d.enabled delivery,q.enabled directory FROM desk_cfg c JOIN desk_delivery d ON d.id=c.id JOIN desk_directory q ON q.id=c.id WHERE c.id=1');
    if(!cfg.enabled||!cfg.delivery||!cfg.directory||cfg.blocked>now||c.due>now||c.fault_until>now||this.publicationPriority16916(now))return;
    const date=jstDay(now),budget=this.one('SELECT * FROM desk_scout_budget WHERE id=1'),used=budget.day===date?budget.used:0;
    if((c.day===date?c.used:0)>=8||used>=192||used%4!==0||this.one('SELECT due FROM desk_scout_state WHERE id=1').due>now)return;
    const own=new Set(['43__',...this.rows('SELECT owner FROM desk_audience16922').map(r=>r.owner)]);
    const candidates=this.rows('SELECT * FROM desk_network_work16922 WHERE due<=? ORDER BY due,article LIMIT 32',now);
    const recentOwn=[...own].flatMap(owner=>this.rows('SELECT * FROM desk_network_work16922 WHERE owner=? AND full=0 AND due<=? ORDER BY pub DESC LIMIT 2',owner,now));
    const next=c.turn%3!==2&&recentOwn.length?recentOwn[0]:candidates[0];if(!next)return;
    // Reserving both counters and the ordinary scout gate is synchronous.
    this.storage.transactionSync(()=>{
      this.rows('UPDATE desk_network16922 SET day=?,used=?,turn=turn+1,due=?,checked=?,message=? WHERE id=1',date,(c.day===date?c.used:0)+1,now+NETWORK16922.gap,now,'公開作品の内容を比較中');
      this.rows('UPDATE desk_scout_budget SET day=?,used=? WHERE id=1',date,used+1);
      this.rows('UPDATE desk_scout_state SET due=MAX(due,?) WHERE id=1',now+6*M520);
      this.rows('UPDATE desk_network_work16922 SET due=? WHERE article=?',now+D520,next.article);
    });
    try{
      const n=(await this.publicRead('https://note.com/api/v3/notes/'+next.article,'json'))?.data;
      if(!networkNote16922(n)||n.key!==next.article||n.user.urlname!==next.owner){
        this.rows('DELETE FROM desk_network_sample16922 WHERE article=?',next.article);
        this.rows("UPDATE desk_network_work16922 SET full=0,fiction=0,feature=? WHERE article=?",JSON.stringify({full:false,themes:[],tokens:[]}),next.article);
        throw new Error('unverified source');
      }
      this.networkWork16922(n,true);
      for(const row of this.rows('SELECT * FROM desk_audience16922')){
        const identity={id:row.account,owner:row.owner};
        if(n.user.urlname===row.owner&&String(n.user.id)===row.account)this.networkCorpus16922(row.slot,identity,[n],true);
        this.networkSeeds16922(row.slot,identity);
      }
      this.rows("UPDATE desk_network16922 SET message='公開作品の比較情報を更新。読者一覧は通常の追加探索枠で確認' WHERE id=1");
    }catch(error){
      this.rows('UPDATE desk_network16922 SET message=? WHERE id=1',error instanceof PublicReadError?publicReadReason(error):'作品の公開元・本文を確認できず、従来の巡回を継続');
    }
  },
  networkMagazineScore16922(id,feature,now){
    const m=this.one('SELECT * FROM desk_network_mag16922 WHERE id=? AND last_at>=?',id,now-28*D520);if(!m||!feature)return null;
    const items=networkJSON16922(m.items).filter(i=>i.pub>=now-60*D520&&i.pub<=now),matches=[],readers=new Set();let sampled=0;
    for(const item of items.slice(0,20)){
      const w=this.one('SELECT * FROM desk_network_work16922 WHERE article=? AND owner=? AND full=1 AND seen>=?',item.article,item.owner,now-28*D520);
      if(w){const score=networkSimilarity16922(feature,networkParseFeature16922(w.feature));if(score>=0.22)matches.push({owner:item.owner,score});}
      const s=this.one('SELECT * FROM desk_network_sample16922 WHERE article=? AND owner=? AND sampled>=?',item.article,item.owner,now-28*D520);
      if(s){sampled++;for(const name of networkJSON16922(s.readers).slice(0,20))if(networkOwner16922(name))readers.add(name);}
    }
    if(new Set(matches.map(m=>m.owner)).size<2)return null;
    return {theme:matches.reduce((a,m)=>a+m.score,0)/matches.length,readers,sampled,known:sampled>=2&&readers.size>=6};
  },
  networkChoose16922(choices,baseline,work,now){
    if(!work?.article||!baseline||choices.length<2)return baseline;
    const w=this.one('SELECT feature FROM desk_network_work16922 WHERE article=? AND owner=? AND full=1',work.article,'43__'),feature=networkParseFeature16922(w?.feature);if(!feature)return baseline;
    const sent=this.rows('SELECT id FROM desk_mag_send WHERE article=?',work.article);
    // Every fourth placement uses the original exploration/outcome policy.
    if(sent.length%4===0)return baseline;
    const previous=this.rows('SELECT id FROM desk_ref WHERE article=? ORDER BY observed DESC LIMIT 24',work.article);
    const prior=new Set();let priorKnown=false;
    for(const r of previous){const s=this.networkMagazineScore16922(r.id,feature,now);if(s?.known){priorKnown=true;for(const name of s.readers)prior.add(name);}}
    const sampleChoices=[baseline,...choices.filter(m=>m.url!==baseline.url)].slice(0,24),scored=[];
    for(const mag of sampleChoices){
      const id=noteLink161(mag.url)?.id,s=this.networkMagazineScore16922(id,feature,now);if(!s)continue;
      const overlap=[...s.readers].filter(name=>prior.has(name)).length,novelty=priorKnown&&s.known?1-overlap/s.readers.size:null;
      scored.push({mag,id,...s,overlap,novelty});
    }
    // Unknown audience never becomes a fictitious zero-overlap winner. Novelty
    // is compared only when all compared destinations have adequate samples.
    const compareAudience=priorKnown&&scored.length>=2&&scored.every(s=>s.known);
    scored.forEach(s=>s.score=s.theme+(compareAudience?0.3*s.novelty:0));
    scored.sort((a,b)=>b.score-a.score||a.mag.url.localeCompare(b.mag.url));
    const best=scored[0],base=scored.find(s=>s.mag.url===baseline.url);
    if(!best||scored.length<2||!base||best.score<=base.score+0.03)return baseline;
    const reason=compareAudience?'作品の題材が近く、観測した読者 '+best.readers.size+'人のうち既掲載誌と共通 '+best.overlap+'人（取得範囲の比較）':'複数作者の作品と題材が近いため優先。読者の重なりは資料不足';
    this.rows('INSERT INTO desk_network_route16922(article,id,at,reason) VALUES(?,?,?,?) ON CONFLICT(article) DO UPDATE SET id=excluded.id,at=excluded.at,reason=excluded.reason',work.article,best.id,now,reason);
    this.networkTrim16922('desk_network_route16922','article','at',80);
    return best.mag;
  },
  networkRecruitment16922(rows,now,turn=0){
    if(rows.length<2||turn%4===0)return rows[0];
    const row=this.one("SELECT * FROM desk_audience16922 WHERE owner='43__'");if(!row)return rows[0];
    const curators=this.networkCurators16922(row),score=id=>{
      const mag=this.one('SELECT owner FROM desk_network_mag16922 WHERE id=?',id);return curators.find(c=>c.owner===mag?.owner)?.score||0;
    };
    return rows.map((r,i)=>({r,i,s:score(r.id)})).sort((a,b)=>b.s-a.s||a.i-b.i)[0].r;
  },
  networkView16922(){return this.networkTry16922(()=>{
    const now=Date.now(),cfg=this.one('SELECT * FROM desk_network16922 WHERE id=1');
    return {message:cfg.message,checked:cfg.checked,used:cfg.day===jstDay(now)?cfg.used:0,
      accounts:this.rows('SELECT * FROM desk_audience16922 ORDER BY slot').map(r=>({slot:r.slot,works:this.networkOwnFeatures16922(r).length,seeds:networkJSON16922(r.seeds).length,
        readers:this.networkReaders16922(r).map(p=>({owner:p.owner,works:p.count})),curators:this.networkCurators16922(r).map(c=>c.owner)})),
      routes:this.rows('SELECT r.*,w.title,m.name FROM desk_network_route16922 r LEFT JOIN desk_archive w ON w.article=r.article LEFT JOIN desk_network_mag16922 m ON m.id=r.id ORDER BY at DESC LIMIT 8')};
  },{message:'比較機能を準備中',accounts:[],routes:[]});}
});
const networkReadBefore16922=Desk520.prototype.publicRead;
Desk520.prototype.publicRead=function(path,format){
  return networkReadBefore16922.call(this,path,format).then(result=>{
    this.networkTry16922(()=>{
      if(format==='json'&&/^https:\/\/note\.com\/api\/v3\/notes\/n[a-z0-9]+$/.test(path)&&result?.data?.key===path.split('/').pop())this.networkWork16922(result.data,true);
      if(format==='issue'){
        const link=noteLink161(result?.header?.link||''),requested=noteLink161(path.replace(/\/rss$/,''));
        if(link&&requested?.id===link.id&&Array.isArray(result.entries))this.networkMagazine16922(link,result.header.title||link.id,result.entries,true);
      }
    });return result;
  });
};
const networkChooseBefore16922=Desk520.prototype.chooseMagazine520;
Desk520.prototype.chooseMagazine520=function(valid,genre,now,work=null){
  const baseline=networkChooseBefore16922.call(this,valid,genre,now);
  return this.networkTry16922(()=>this.networkChoose16922(valid.filter(m=>this.magazineRoom520(noteLink161(m.url)?.id,now)),baseline,work,now),baseline);
};
function networkRecord16922(v){
  if(!v)return '';
  return '【作品に近い読者・紹介者・掲載先の比較】\n'+v.message+'\n'+(v.accounts||[]).map(a=>
    'アカウント '+a.slot+'：本文を確認した自作 '+a.works+'本／比較作品 '+a.seeds+'本（別作者・最大10本）'+
    '\n3作品・3作者以上に共通する読者 '+a.readers.length+'人／紹介活動を確認した作者 '+a.curators.length+'人').join('\n')+
    '\n'+(v.routes||[]).map(r=>(r.title||r.article)+' → '+(r.name||r.id)+'（比較 '+time(r.at)+'）：'+r.reason).join('\n')+
    '\n比較用の追加取得は本日 '+(v.used||0)+'/8ページ。既存の公開探索192ページ枠に含みます。読者一覧は既存の追加探索枠内で確認。'+
    '\n比較候補・掲載先の選択は送信や掲載の成功ではありません。公開一覧の一部を比較しており、新規訪問・読了・掲載による効果は未確認です。資料が足りない場合は従来の巡回と掲載先選択を継続します。';
}

// Repeat reactions are observed public likes on distinct, later-published own
// works. They do not measure reading, traffic attribution or causal conversion.
Object.assign(Desk520.prototype,{
  initRepeat16923(){
    if(this.repeatReady16923)return;
    this.rows(`CREATE TABLE IF NOT EXISTS desk_repeat16923(
      slot TEXT NOT NULL,account TEXT NOT NULL,reader TEXT NOT NULL,source TEXT NOT NULL,
      contact TEXT NOT NULL,confirmed INTEGER NOT NULL,works TEXT NOT NULL,seen INTEGER NOT NULL,
      PRIMARY KEY(slot,account,reader))`);
    this.rows('CREATE INDEX IF NOT EXISTS desk_repeat_age16923 ON desk_repeat16923(seen)');
    this.rows('CREATE INDEX IF NOT EXISTS desk_repeat_cohort16924 ON desk_repeat16923(confirmed)');
    this.repeatReady16923=true;
  },
  repeatObserve16923(slot,identity,contacts,article){
    this.initRepeat16923();
    const now=Date.now(),pub=Date.parse(article?.publishAt||article?.publish_at||article?.publishedAt);
    if(!SLOTS.includes(slot)||!identity?.id||!networkOwner16922(identity.owner)||
      article?.user?.urlname!==identity.owner||String(article.user?.id)!==identity.id||article.status!=='published'||
      !/^n[a-z0-9]{1,64}$/.test(article.key||'')||!Number.isFinite(pub)||pub>now||pub<=now-14*D520)return;
    const seen=new Set();
    this.storage.transactionSync(()=>{
      // This bounded cache is used only for the 28-day comparison. Expired
      // cohorts must not occupy the cap and prevent observing new readers.
      this.rows('DELETE FROM desk_repeat16923 WHERE confirmed<?',now-28*D520);
      for(const c of contacts.slice(0,100)){
        if(seen.size>=20)break;
        if(c.slot!==slot||c.account!==identity.id||c.status!=='confirmed'||c.confirmed>=pub||c.confirmed<pub-14*D520||
          !networkOwner16922(c.owner)||c.owner===identity.owner||seen.has(c.owner)||typeof c.source!=='string'||c.source.length>120)continue;
        seen.add(c.owner);
        let old=this.one('SELECT * FROM desk_repeat16923 WHERE slot=? AND account=? AND reader=?',slot,identity.id,c.owner);
        // Keep the first observed contact/source for the entire cohort window;
        // another outgoing like must not steal credit for the same returning reader.
        if(old && old.confirmed<now-28*D520){this.rows('DELETE FROM desk_repeat16923 WHERE slot=? AND account=? AND reader=?',slot,identity.id,c.owner);old=null;}
        if(old && (pub<=old.confirmed||pub>old.confirmed+14*D520))continue;
        if(!old && this.one('SELECT COUNT(*) n FROM desk_repeat16923').n>=2048)continue;
        const works=networkJSON16922(old?.works||'[]').filter(w=>w.pub>(old?.confirmed||c.confirmed));
        if(!works.some(w=>w.key===article.key))works.push({key:article.key,pub});
        const value=JSON.stringify(works.sort((a,b)=>a.pub-b.pub||a.key.localeCompare(b.key)).slice(0,12));
        this.rows(`INSERT INTO desk_repeat16923(slot,account,reader,source,contact,confirmed,works,seen) VALUES(?,?,?,?,?,?,?,?)
          ON CONFLICT(slot,account,reader) DO UPDATE SET works=excluded.works,seen=excluded.seen`,
          slot,identity.id,c.owner,old?.source||c.source,old?.contact||c.key,old?.confirmed||c.confirmed,value,now);
      }
    });
  },
  repeatCounts16923(slot,identity){
    this.initRepeat16923();
    if(!identity?.id)return [];
    const out=new Map();
    for(const r of this.rows('SELECT source,works FROM desk_repeat16923 WHERE slot=? AND account=? AND confirmed>=?',slot,identity.id,Date.now()-28*D520)){
      const works=networkJSON16922(r.works),distinct=new Set(works.map(w=>w.key));
      const n=out.get(r.source)||{source:r.source,observed:0,repeat:0};
      if(distinct.size)n.observed++;
      if(distinct.size>=2)n.repeat++;
      out.set(r.source,n);
    }
    return [...out.values()].sort((a,b)=>b.repeat-a.repeat||b.observed-a.observed||a.source.localeCompare(b.source));
  },
  repeatView16923(){
    return this.networkTry16922(()=>{
      this.initRepeat16923();
      return this.rows('SELECT slot,account,owner FROM desk_audience16922').map(r=>({slot:r.slot,
        rows:this.repeatCounts16923(r.slot,{id:r.account,owner:r.owner})}));
    },[]);
  }
});
function repeatRank16923(plan,counts){
  const stats=new Map((counts||[]).map(x=>[x.source,x]));
  return plan.map(p=>({...p,repeat:Math.min(p.sent,stats.get(p.source)?.repeat||0)}))
    .sort((a,b)=>{
      const eligible=r=>r.sent>=10&&r.responded>=2&&r.repeat>=2;
      return +eligible(b)-+eligible(a)||(eligible(a)&&eligible(b)?(b.repeat+1)/(b.sent+20)-(a.repeat+1)/(a.sent+20):0)||
        (b.responded+1)/(b.sent+20)-(a.responded+1)/(a.sent+20)||a.source.localeCompare(b.source);
    });
}
function repeatRecord16923(accounts){
  return '【別の自作にも反応した読者】\n'+(accounts||[]).map(a=>'アカウント '+a.slot+'：'+
    (a.rows.length?a.rows.slice(0,8).map(r=>r.source+' ／ 後日公開した1作以上にスキ '+r.observed+'人、2作以上にスキ '+r.repeat+'人').join('\n'):'観測記録を収集中')).join('\n')+
    '\n送信を確認した後、14日以内に公開した別々の自作への公開スキを比較します。1経路10送信・2人以上の複数作への反応で優先。4回に1回は従来の探索を維持。読了・再訪・送信の効果を断定するものではありません。';
}

// Opportunities use a durable read/validate/write/verify pipeline. A discovered
// announcement is never permission to enter. Unknown rules stay out of writes.
const CONTEST16923={pages:12,entries:2,gap:30*M520,writeGap:2*HOUR,maxRules:64,maxEntries:256,
  seed:{owner:'kakitsubataayame',id:'n9b601ce1183b',url:'https://note.com/kakitsubataayame/n/n9b601ce1183b'}};
class ContestReadWait16924 extends Error {
  constructor(message,at){super(message);this.at=at;}
}
function contestOwner16923(s){return typeof s==='string'&&/^[\w-]{1,80}$/.test(s)&&!['api','settings','search','hashtag','tag'].includes(s);}
function contestTags16923(n){
  if(!Array.isArray(n?.hashtags)||n.hashtags.length>30)return null;
  const names=n.hashtags.map(t=>typeof t==='string'?t:t?.hashtag?.name??t?.name);
  if(names.some(t=>typeof t!=='string'||!t.trim()||t.length>120))return null;
  const tags=names.map(t=>t.replace(/^#/,'').trim());
  if(tags.some(t=>!t||/[\r\n\u0000-\u001f]/.test(t)))return null;
  return [...new Set(tags)].sort();
}
function contestRule16923(n,now=Date.now()){
  const hold=reason=>({ok:false,reason});
  if(n?.status!=='published'||typeof n.body!=='string'||n.body.length>250000||n.is_limited===true||n.is_paid===true||n.isLimited===true||n.isPaid===true||n.hasPaywall===true||n.isPreview===true||Number(n.price)>0)return hold('募集本文の全体を確認待ち');
  // This organizer's reviewed exception expressly permits a missing title/body
  // hashtag when the work appears in the hashtag listing. Other contests must
  // not inherit that exception. Past publication permission is NOT inferred.
  if(n.key!==CONTEST16923.seed.id||n.user?.urlname!==CONTEST16923.seed.owner)return hold('募集条件・応募方法を自動で確定できないため見送り');
  const text=words161(n.body).normalize('NFKC').replace(/\s+/g,'');
  const required=['■お題■『2』','■参加資格■共同運営マガジンnote文芸部のメンバーであること',
    'お一人さま2作品まで','1作品1万字まで','無料記事限定','当マガジン投稿可能ジャンル全て',
    '2026年11月21日(土)13:00','2026年12月20日(日)23:59',
    'どこかに記載漏れがあっても、下記のハッシュタグ検索一覧に記事が反映されさえすればOKです',
    '#note文芸部年末コンテスト2026'];
  if(required.some(t=>!text.includes(t)))return hold('既知の募集条件が変更・未確認のため見送り');
  const section=label=>text.match(new RegExp('■'+label+'■([^■]*)'))?.[1].replace(/[・●]/g,'');
  if(section('参加資格')!=='共同運営マガジンnote文芸部のメンバーであること'||
    section('投稿について')!=='お一人さま2作品まで1作品1万字まで無料記事限定過度なアフィリエイト等はご遠慮ください'||
    section('投稿ジャンル')!=='当マガジン投稿可能ジャンル全て')return hold('応募資格・投稿条件の本文が対応した要項と一致しません');
  const extra=/(?:年齢|国籍|居住|年生|歳以上|歳以下|職業限定|個人情報|住所|電話番号|要項を追記|条件を追記|変更しました|追加要件|生成AI|AI生成|AI補助|人工知能|未発表|未公開|初出|二重応募|重複応募|併願|商業化|受賞歴|受賞済|著作権.{0,12}譲渡|同意書|応募フォーム|専用フォーム|DMで|メールで|[1-9][0-9]*円|参加費|有料会員|追加条件|条件変更|募集終了|中止|延期|訂正|改定)/i;
  if(extra.test(text))return hold('追加の応募条件・変更があるため自動応募を保留');
  const start=Date.parse('2026-11-21T13:00:00+09:00'),end=Date.parse('2026-12-20T23:59:00+09:00')+60000;
  if(now<start||now>=end)return hold(now<start?'募集開始前':'募集期間終了');
  return {ok:true,kind:'community-tag',title:'note文芸部年末コンテスト2026',tag:'note文芸部年末コンテスト2026',
    member:'m32620a9cd50d',start,end,max:2,chars:10000,previous:false,theme:'2',
    reason:'公開要項の例外によりタグ欄で参加可能。募集開始後に公開した作品のみ照合。制作方法の限定記載なし（AIの明示許諾ではありません）'};
}
async function contestSnapshot16923(n,account){
  if(n?.status!=='published'||n.user?.urlname!=='43__'||String(n.user?.id)!==account||!/^n[a-z0-9]{1,64}$/.test(n.key||'')||
    typeof n.name!=='string'||!n.name.trim()||n.name.trim()==='521'||typeof n.body!=='string'||n.body.length>250000||
    n.is_limited===true||n.isLimited===true||n.is_paid===true||n.isPaid===true||n.price!==0||n.hasPaywall===true||n.isPreview===true||n.hasAvailableCirclePlans===true||!Object.hasOwn(n,'eyecatch'))return null;
  const tags=contestTags16923(n),hash=await draftBodyHash(n.body),cover=coverId(n.eyecatch),pub=Date.parse(n.publishAt||n.publish_at||n.publishedAt);
  if(!tags||!hash||cover===null||!Number.isFinite(pub)||pub>Date.now())return null;
  return {key:n.key,title:n.name,hash,cover,tags,pub,account};
}
function contestFits16923(n,p){
  if(!n||typeof n!=='object'||typeof n.body!=='string'||!n.body.trim()||!p?.ok)return false;
  const pub=Date.parse(n?.publishAt||n?.publish_at||n?.publishedAt),chars=publishedChars162(n);
  if(!p?.ok||!Number.isFinite(pub)||pub<p.start||pub>=p.end||chars===null||chars>p.chars||chars<1)return false;
  if(/(?:amzn\.to|amazon\.[^\s"<>]+[?&]tag=|a\.r10\.to|hb\.afl\.rakuten|[?&](?:affiliate|aff_id|a8mat)=)/i.test(n.body))return false;
  // This is a conservative literal topic match, not a claim about literary merit.
  return /(?:2人|二人|ふたり|2つ|二つ|ふたつ|2度|二度|2年|二年)/.test(words161(n.body));
}
function contestSame16923(a,b,tag,added=false){
  if(!a||!b||a.key!==b.key||a.account!==b.account||a.title!==b.title||a.hash!==b.hash||a.cover!==b.cover||a.pub!==b.pub)return false;
  const want=[...new Set([...a.tags,...(added?[tag]:[])])].sort();
  return JSON.stringify(want)===JSON.stringify(b.tags);
}
Object.assign(Desk520.prototype,{
  initContest16923(){
    if(this.contestReady16923)return;
    if(!this.one("SELECT 1 FROM sqlite_master WHERE name='desk_contest16923'"))this.storage.transactionSync(()=>{
      this.rows("CREATE TABLE desk_contest16923(id INTEGER PRIMARY KEY,day TEXT DEFAULT '',used INTEGER DEFAULT 0,writes INTEGER DEFAULT 0,due INTEGER DEFAULT 0,next_write INTEGER DEFAULT 0,scout INTEGER DEFAULT 0,message TEXT DEFAULT '企画の募集条件を自動確認待ち')");
      this.rows('INSERT INTO desk_contest16923(id) VALUES(1)');
      this.rows("CREATE TABLE desk_contest_rule16923(id TEXT PRIMARY KEY,owner TEXT NOT NULL,url TEXT NOT NULL,title TEXT DEFAULT '',hash TEXT DEFAULT '',policy TEXT DEFAULT '',due INTEGER DEFAULT 0,checked INTEGER DEFAULT 0,cursor INTEGER DEFAULT 0,message TEXT DEFAULT '募集本文を確認待ち')");
      this.rows('CREATE INDEX desk_contest_rule_due16923 ON desk_contest_rule16923(due,id)');
      this.rows("CREATE TABLE desk_contest_entry16923(contest TEXT NOT NULL,article TEXT NOT NULL,account TEXT NOT NULL,rule_hash TEXT NOT NULL,policy TEXT NOT NULL,before_json TEXT NOT NULL,phase TEXT NOT NULL,at INTEGER NOT NULL,due INTEGER NOT NULL,checks INTEGER DEFAULT 0,message TEXT NOT NULL,PRIMARY KEY(contest,article))");
      this.rows('CREATE INDEX desk_contest_entry_due16923 ON desk_contest_entry16923(phase,due)');
      this.rows('CREATE UNIQUE INDEX desk_contest_work16923 ON desk_contest_entry16923(article)');
      const s=CONTEST16923.seed;this.rows('INSERT INTO desk_contest_rule16923(id,owner,url,title) VALUES(?,?,?,?)',s.id,s.owner,s.url,'note文芸部年末コンテスト2026');
    });
    this.contestReady16923=true;
  },
  contestActive16923(now=Date.now()){
    return this.pipelineActive16913()&&!this.publicationPriority16916(now)&&!!this.one('SELECT 1 FROM desk_directory WHERE id=1 AND enabled=1');
  },
  contestDiscover16923(path,format,value){
    this.initContest16923();
    const found=[];
    if(format==='json'&&/^https:\/\/note\.com\/api\/v3\/notes\/n[a-z0-9]+$/.test(path)){
      const n=value?.data;if(n?.status==='published'&&/コンテスト|公募|お題企画|作品募集/.test(n.name||'')&&contestOwner16923(n.user?.urlname))
        found.push({id:n.key,owner:n.user.urlname,url:'https://note.com/'+n.user.urlname+'/n/'+n.key,title:n.name});
    }else if(format==='html'&&path==='https://note.com/contests'){
      for(const a of anchors161(value)){
        if(!/応募概要|募集要項/.test(a.label))continue;
        const l=noteLink161(a.href,path,'article');if(l)found.push({...l,title:a.label});
      }
    }else if(format==='issue'||format==='rss'){
      const items=Array.isArray(value)?value:value?.entries;
      for(const x of (Array.isArray(items)?items:[]).slice(0,30))if(/コンテスト|作品募集|お題企画/.test(x.title||'')){
        const l=noteLink161(x.link,path,'article');if(l)found.push({...l,title:x.title});
      }
    }
    // Repeatedly reading a feed must advance past already-known candidates.
    // Only genuinely new rows consume this per-read insertion allowance.
    let count=this.one('SELECT COUNT(*) n FROM desk_contest_rule16923').n,added=0;
    const seen=new Set();
    for(const f of found){
      if(added>=8||count>=CONTEST16923.maxRules)break;
      if(!/^n[a-z0-9]{1,64}$/.test(f.id||'')||!contestOwner16923(f.owner)||seen.has(f.id))continue;
      seen.add(f.id);
      if(this.one('SELECT 1 FROM desk_contest_rule16923 WHERE id=?',f.id))continue;
      this.rows('INSERT OR IGNORE INTO desk_contest_rule16923(id,owner,url,title) VALUES(?,?,?,?)',f.id,f.owner,f.url,String(f.title||'').slice(0,300));
      added++;count++;
    }
  },
  contestReadRoom16924(pages=1){
    const now=Date.now(),day=jstDay(now),s=this.one('SELECT * FROM desk_contest16923 WHERE id=1'),b=this.one('SELECT * FROM desk_scout_budget WHERE id=1');
    if(!this.contestActive16923(now))return {ok:false,at:Math.max(now+CONTEST16923.gap,this.one('SELECT blocked FROM desk_cfg WHERE id=1')?.blocked||0),message:'停止・公開優先・note指定の待機中'};
    const used=s.day===day?s.used:0,shared=b.day===day?b.used:0;
    if(used+pages>CONTEST16923.pages||shared+pages>192)return {ok:false,at:jstStart(day)+D520+M520,message:'本日の読み取り枠を使用済み。翌日の枠で自動再確認します'};
    return {ok:true,day,used,shared};
  },
  contestDefer16924(message,at,row=null){
    this.rows('UPDATE desk_contest16923 SET due=MAX(due,?),message=? WHERE id=1',at,message);
    if(row)this.rows("UPDATE desk_contest_entry16923 SET due=MAX(due,?),message=? WHERE contest=? AND article=? AND phase='sent'",at,message+'（応募操作の再送なし）',row.contest,row.article);
  },
  async contestRead16923(path,format='json'){
    const room=this.contestReadRoom16924();
    if(!room.ok)throw new ContestReadWait16924(room.message,room.at);
    const now=Date.now(),{day,used,shared}=room;
    this.storage.transactionSync(()=>{
      this.rows('UPDATE desk_contest16923 SET day=?,used=?,writes=CASE WHEN day=? THEN writes ELSE 0 END WHERE id=1',day,used+1,day);
      this.rows('UPDATE desk_scout_budget SET day=?,used=? WHERE id=1',day,shared+1);
      this.rows('UPDATE desk_scout_state SET due=MAX(due,?) WHERE id=1',now+6*M520);
    });
    return this.publicRead(path,format);
  },
  async contestSourceRead16925(path,format,ruleId=''){
    try{
      const value=await this.contestRead16923(path,format);
      // An incomplete response is not evidence of changed contest rules.
      if(ruleId&&(!value?.data||typeof value.data.body!=='string'||!value.data.body.trim()))throw new PublicReadError('募集記事の本文を確認できません');
      return value;
    }catch(error){
      if(readLimit(error))throw error;
      const now=Date.now(),hold=this.one('SELECT blocked FROM desk_cfg WHERE id=1')?.blocked||0;
      const at=Math.max(error instanceof ContestReadWait16924?error.at:now+2*HOUR,hold);
      const reason=error instanceof ContestReadWait16924?error.message:error instanceof PublicReadError?publicReadReason(error):'募集元の読み取りを完了できません';
      const message=reason+' ／ '+time(at)+'以降に自動再確認';
      if(ruleId)this.rows('UPDATE desk_contest_rule16923 SET due=?,message=? WHERE id=?',at,message,ruleId);
      else this.rows('UPDATE desk_contest16923 SET scout=? WHERE id=1',at);
      this.rows('UPDATE desk_contest16923 SET message=? WHERE id=1',message);
      // A source failure must not delay other rules. Shared holds and budget
      // exhaustion, however, apply to the entire contest reader.
      if(error instanceof ContestReadWait16924||hold>now)this.contestDefer16924(message,at);
      throw error;
    }
  },
  async contestCensus16923(account,tag){
    const entries=new Set(),seen=new Set();
    for(let page=1;page<=4;page++){
      const d=(await this.contestRead16923('https://note.com/api/v2/creators/43__/contents?kind=note&page='+page))?.data;
      if(!Array.isArray(d?.contents)||d.contents.length>100||[d.page,d.currentPage].some(v=>v!=null&&Number(v)!==page))return null;
      if(typeof d.isLastPage==='boolean'&&typeof d.is_last_page==='boolean'&&d.isLastPage!==d.is_last_page)return null;
      for(const n of d.contents){
        if(n.status!=='published')return null;
        if(n.user?.urlname!=='43__'||String(n.user.id)!==account||!/^n[a-z0-9]{1,64}$/.test(n.key||'')||seen.has(n.key))return null;
        seen.add(n.key);
        const tags=contestTags16923(n);if(!tags)return null;
        if(tags.includes(tag))entries.add(n.key);
      }
      if((d.isLastPage??d.is_last_page)===true)return [...entries];
      if((d.isLastPage??d.is_last_page)!==false||!d.contents.length)return null;
    }
    return null;
  },
  contestReserve16923(rule,policy,before,manual){
    const now=Date.now(),today=jstDay(now);
    if(!this.contestActive16923(now)||now<policy.start||now>=policy.end||!this.joinProof520(policy.member,now)||!Array.isArray(manual)||
      !Array.isArray(before?.tags)||before.tags.length>=10||before.tags.includes(policy.tag)||!this.contestReadRoom16924().ok)return false;
    return this.storage.transactionSync(()=>{
      const state=this.one('SELECT * FROM desk_contest16923 WHERE id=1'),live=this.one('SELECT * FROM desk_contest_rule16923 WHERE id=?',rule.id);
      if(!live||live.hash!==rule.hash||live.checked<now-10*M520||state.next_write>now||
        (state.day===today&&state.writes>=CONTEST16923.entries)||this.one('SELECT COUNT(*) n FROM desk_contest_entry16923').n>=CONTEST16923.maxEntries||
        this.one('SELECT 1 FROM desk_contest_entry16923 WHERE article=?',before.key))return false;
      const known=new Set([...manual,...this.rows('SELECT article FROM desk_contest_entry16923 WHERE contest=?',rule.id).map(r=>r.article)]);
      if(known.has(before.key)||known.size>=policy.max)return false;
      // Persist before the first tag mutation: even an autosave or lost browser
      // response consumes the entry and cannot cause a duplicate edit later.
      this.rows(`INSERT INTO desk_contest_entry16923(contest,article,account,rule_hash,policy,before_json,phase,at,due,message)
        VALUES(?,?,?,?,?,?,'sent',?,?,'応募操作を開始・反映確認待ち（自動再送なし）')`,rule.id,before.key,before.account,rule.hash,JSON.stringify(policy),JSON.stringify(before),now,now+5*M520);
      this.rows('UPDATE desk_contest16923 SET writes=CASE WHEN day=? THEN writes+1 ELSE 1 END,day=?,next_write=?,message=? WHERE id=1',today,today,now+CONTEST16923.writeGap,'応募操作を開始・公開結果を確認待ち');
      return true;
    });
  },
  async contestVerify16923(row){
    const now=Date.now();
    const current=this.one('SELECT * FROM desk_contest_entry16923 WHERE contest=? AND article=?',row.contest,row.article);
    if(!current||current.phase!=='sent')return;
    row=current;
    let before,p;
    try{before=JSON.parse(row.before_json);p=JSON.parse(row.policy);if(!Number.isFinite(p.end)||!Array.isArray(before.tags))throw Error();}
    catch{this.rows("UPDATE desk_contest_entry16923 SET phase='unknown',message='応募前の照合記録を読み取れません。応募操作は再送しません' WHERE contest=? AND article=?",row.contest,row.article);return;}
    if(now>p.end+7*D520){
      this.rows("UPDATE desk_contest_entry16923 SET phase='unknown',message='募集終了後7日までに反映を確定できませんでした。応募操作は再送しません' WHERE contest=? AND article=?",row.contest,row.article);return;
    }
    // Reserve enough read budget before beginning a complete verification. A
    // deferred or failed request is not a completed check and cannot exhaust it.
    const room=this.contestReadRoom16924(2);
    if(!room.ok){this.contestDefer16924(room.message,room.at,row);return;}
    const next=now+Math.min(24,2**Math.min(5,row.checks))*HOUR;
    this.rows("UPDATE desk_contest_entry16923 SET due=? WHERE contest=? AND article=? AND phase='sent'",next,row.contest,row.article);
    try{
      const n=(await this.contestRead16923('https://note.com/api/v3/notes/'+row.article))?.data;
      const after=await contestSnapshot16923(n,row.account);
      if(!after){this.rows("UPDATE desk_contest_entry16923 SET message='応募先記事の公開状態を確認待ち。応募操作は再送しません' WHERE contest=? AND article=? AND phase='sent'",row.contest,row.article);return;}
      const finish=(phase,message)=>this.storage.transactionSync(()=>{
        if(!this.one("SELECT 1 FROM desk_contest_entry16923 WHERE contest=? AND article=? AND phase='sent'",row.contest,row.article))return;
        this.rows("UPDATE desk_contest_entry16923 SET phase=?,message=?,checks=checks+1 WHERE contest=? AND article=? AND phase='sent'",phase,message,row.contest,row.article);
        const held=phase!=='changed'&&this.one("SELECT 1 FROM desk_contest_entry16923 WHERE phase='changed' LIMIT 1");
        this.rows('UPDATE desk_contest16923 SET message=? WHERE id=1',message+(held?' ／ 別の作品の変更を検出したため、新しい応募は保留中':''));
      });
      if(!contestSame16923({...before,tags:after.tags},after,p.tag)){
        finish('changed','応募操作後に本文・タイトル・画像等の変更を検出。新しい応募操作を保留');return;
      }
      if(!contestSame16923(before,after,p.tag,true)){
        finish('sent','応募タグまたは既存タグの保存結果を確認待ち。応募操作は再送しません');return;
      }
      const html=await this.contestRead16923('https://note.com/hashtag/'+encodeURIComponent(p.tag)+'?f=new','html');
      const listed=anchors161(html).some(a=>{const l=noteLink161(a.href,'https://note.com','article');return l?.owner==='43__'&&l.id===row.article;});
      finish(listed?'listed':'sent',listed?'応募タグ・募集一覧への掲載と作品内容の維持を確認。受賞・主催者の受理判定は未確認':'応募タグと作品内容の維持を確認。募集一覧への掲載は未確認（応募操作の再送なし）');
    }catch(error){
      if(readLimit(error))throw error;
      const message=error instanceof ContestReadWait16924?error.message:error instanceof PublicReadError?publicReadReason(error):'応募結果の読み取りに失敗。保存済み記録から自動再確認します';
      const at=error instanceof ContestReadWait16924?error.at:now+2*HOUR;
      this.contestDefer16924(message,at,row);
    }
  },
  async contestTick16923(now){
    this.initContest16923();
    const state=this.one('SELECT * FROM desk_contest16923 WHERE id=1');
    if(!this.contestActive16923(now)||state.due>now)return;
    this.rows('UPDATE desk_contest16923 SET due=? WHERE id=1',now+CONTEST16923.gap);
    const pending=this.one("SELECT * FROM desk_contest_entry16923 WHERE phase='sent' AND due<=? ORDER BY due LIMIT 1",now);
    if(pending){await this.contestVerify16923(pending);return;}
    if(this.one("SELECT 1 FROM desk_contest_entry16923 WHERE phase='changed'")){
      this.rows("UPDATE desk_contest16923 SET message='応募後の作品変更を検出したため、新しい応募は保留中。ほかの操作済み応募は読み取り確認を継続' WHERE id=1");return;
    }
    const room=this.contestReadRoom16924();
    if(!room.ok){this.contestDefer16924(room.message,room.at);return;}
    if(state.scout<=now){
      this.rows('UPDATE desk_contest16923 SET scout=? WHERE id=1',now+D520);
      await this.contestSourceRead16925('https://note.com/contests','html');return;
    }
    const rule=this.one('SELECT * FROM desk_contest_rule16923 WHERE due<=? ORDER BY due,id LIMIT 1',now);if(!rule)return;
    this.rows('UPDATE desk_contest_rule16923 SET due=? WHERE id=?',now+D520,rule.id);
    const n=(await this.contestSourceRead16925('https://note.com/api/v3/notes/'+rule.id,'json',rule.id))?.data;
    const p=n?.key===rule.id&&n.user?.urlname===rule.owner?contestRule16923(n,now):{ok:false,reason:'募集元の本人・記事が一致しません'};
    const hash=typeof n?.body==='string'?await draftBodyHash(n.body):null;
    const message=reason=>{
      this.rows('UPDATE desk_contest_rule16923 SET message=? WHERE id=?',reason,rule.id);
      this.rows('UPDATE desk_contest16923 SET message=? WHERE id=1',reason);
    };
    if(rule.hash&&hash!==rule.hash){message('募集本文が変更されたため、この企画の自動応募を保留');return;}
    this.rows('UPDATE desk_contest_rule16923 SET hash=?,policy=?,checked=?,message=? WHERE id=?',hash||'',JSON.stringify(p),now,p.reason,rule.id);
    rule.hash=hash;
    if(!p.ok||!hash){message(p.reason);return;}
    if(!this.joinProof520(p.member,now)){message('共同誌の参加確認待ち。既存の参加処理が確認できた後に自動で再照合');return;}
    const taken=this.one('SELECT COUNT(*) n FROM desk_contest_entry16923 WHERE contest=?',rule.id).n;
    if(taken>=p.max){message('この企画の応募上限に到達（結果未確認の操作も含む）');return;}
    if(state.next_write>now||(state.day===jstDay(now)&&state.writes>=CONTEST16923.entries))return;
    const magazines=this.eligibleMags(now).filter(m=>noteLink161(m.url)?.id===p.member);
    if(!magazines.length){message('参加済み共同誌の最新の投稿条件・編集権限を確認待ち');return;}
    const options=this.rows(`SELECT a.*,w.genre work_genre,w.chars work_chars,w.method FROM desk_archive a LEFT JOIN desk_work w ON w.article=a.article WHERE a.pub>=? AND a.pub<? AND a.verified>?
      AND NOT EXISTS(SELECT 1 FROM desk_contest_entry16923 e WHERE e.article=a.article)
      ORDER BY a.pub DESC,a.article LIMIT 24`,p.start,p.end,now-8*D520).filter(a=>this.archiveFits(a,magazines,now).length);
    if(!options.length){message('募集開始後に公開した、条件の合う自作を待機中');return;}
    const work=options[rule.cursor%options.length];
    this.rows('UPDATE desk_contest_rule16923 SET cursor=cursor+1,due=? WHERE id=?',now+2*HOUR,rule.id);
    const account=await this.deliveryAccount();
    if(!account||account.until>Date.now()){message('520の本人確認・既存の待機終了を確認待ち');return;}
    const own=(await this.contestRead16923('https://note.com/api/v3/notes/'+work.article))?.data;
    if(!contestFits16923(own,p)){message('「'+work.title+'」は題材・字数・公開時期の照合対象外。次の作品を自動確認');return;}
    const before=await contestSnapshot16923(own,account.id);
    if(!before||before.key!==work.article){message('本文・画像・タグ全体の保存状態を確認待ち');return;}
    const manual=await this.contestCensus16923(account.id,p.tag);
    if(!manual){message('既存の応募件数を全件確認できず保留');return;}
    if(manual.includes(before.key)||new Set([...manual,...this.rows('SELECT article FROM desk_contest_entry16923 WHERE contest=?',rule.id).map(r=>r.article)]).size>=p.max){message('手動応募を含む応募済み作品・応募上限を確認');return;}
    const binding=browserPurpose16916(this.env.BROWSER,'normal');
    if(browserWait16916(binding,'normal')){message('既存のブラウザー処理の終了を待機中');return;}
    let lease,env=scoped(this.env,account.slot);
    try{
      lease=await acquire(env,false);if(!lease)return;
      const credentials=await loadCookie(env,account.id),cookie=cleanCookie(credentials.NOTE_SESSION);
      const mayAct=async()=>{
        const live=await sql(env,'SELECT c.account,c.token,c.lease,c.next_at,c.enabled,c.inflight,h.kind,n.hold_until,d.pending comment_pending,o.pending outreach_pending FROM nh_control c JOIN nh_health h ON h.id=c.id JOIN nh_v13_connection n ON n.slot=? LEFT JOIN nh_v1697_discovery d ON d.slot=n.slot LEFT JOIN nh_v16910_state o ON o.slot=n.slot WHERE c.id=1',account.slot).first();
        const at=Date.now();
        return !!live&&live.enabled===1&&live.inflight===''&&live.comment_pending===''&&live.outreach_pending===''&&live.account===account.id&&live.token===lease&&live.lease>at&&live.hold_until<=at&&(!live.kind||live.next_at<=at)&&this.contestActive16923(at)&&at<p.end&&this.joinProof520(p.member,at)&&this.archiveFits(work,this.eligibleMags(at).filter(m=>noteLink161(m.url)?.id===p.member),at).length>0;
      };
      if(!await mayAct()){message('停止・ほかの操作の結果・待機終了を確認してから応募します');return;}
      const result=await contestBrowser16923(binding,cookie,before,p,async()=>await mayAct()&&this.contestReserve16923(rule,p,before,manual),mayAct,plainDraft16914(own.body),async()=>{const fresh=(await this.contestRead16923("https://note.com/api/v3/notes/"+before.key))?.data;const saved=await contestSnapshot16923(fresh,account.id);return contestSame16923(before,saved,p.tag)||contestSame16923(before,saved,p.tag,true);});
      message(result.message);
      this.rows("UPDATE desk_contest_entry16923 SET message=? WHERE contest=? AND article=? AND phase='sent'",result.message,rule.id,before.key);
      if(result.hold||[401,403,429].includes(result.code)){
        const until=Date.now()+Math.max(result.hold||0,HOUR);
        this.rows('UPDATE desk_cfg SET blocked=MAX(blocked,?) WHERE id=1',until);
        await sql(this.env,'UPDATE nh_v13_connection SET hold_until=MAX(hold_until,?) WHERE slot=?',until,account.slot).run();
      }
    }finally{if(lease)await release(env,lease);}
  },
  contestView16923(){
    try{this.initContest16923();return {state:this.one('SELECT * FROM desk_contest16923 WHERE id=1'),
      rules:this.rows('SELECT title,url,message FROM desk_contest_rule16923 ORDER BY checked DESC LIMIT 8'),
      entries:this.rows('SELECT article,phase,message FROM desk_contest_entry16923 ORDER BY at DESC LIMIT 12')};}catch{return null;}
  }
});
function contestRecord16923(v){
  if(!v)return '【企画への自動応募】記録を確認待ち';
  return '【企画への自動応募】\n'+v.state.message+'\n'+v.rules.map(r=>r.title+'：'+r.message+'\n'+r.url).join('\n')+
    (v.entries.length?'\n'+v.entries.map(e=>'https://note.com/43__/n/'+e.article+'\n'+e.message).join('\n'):'\n応募操作の記録はまだありません。')+
    '\n募集元を自動探索し、対応済みの条件・参加資格・作品との一致を確認した場合だけ応募します。現在の自動操作はnote文芸部年末コンテスト2026のタグ応募に対応。他の企画・有料応募・外部フォーム・未確定の条件は見送り。最大2応募/日・2時間間隔。本文・タイトル・見出し画像・既存タグを照合。応募一覧への反映と受賞は別に表示します。';
}

// Static standalone browser source, independent of bundler helper names.
function contestScreen16923(step,arg){
  if(!['https://note.com','https://editor.note.com'].includes(location.origin)||
    !new RegExp('^/notes/'+arg.key+'/(edit|publish|publish_setting|publish_settings)/?$').test(location.pathname))return {state:'page'};
  const visible=e=>!!e?.getClientRects().length&&!e.closest('[hidden],[aria-hidden="true"]');
  const all=(root,sel)=>[...root.querySelectorAll(sel)].filter(visible);
  const name=e=>(e.getAttribute('aria-label')||e.innerText||e.textContent||'').trim();
  const one=xs=>xs.length===1?xs[0]:null;
  const button=(root,labels)=>one(all(root,'button,[role=button]').filter(e=>!e.disabled&&e.getAttribute('aria-disabled')!=='true'&&labels.includes(name(e))));
  const dialogs=all(document,'[role=dialog],dialog');
  if(dialogs.length){
    const dialog=one(dialogs),text=dialog?.innerText||'';
    const ok=dialog&&button(dialog,['OK']);
    if(!ok||!text.includes(arg.tag)||!/コンテスト.{1,160}に参加します/.test(text)||!/よろしいですか/.test(text)||/購入|支払|有料|料金|同意書/.test(text))return {state:'unknown_dialog'};
    if(step==='confirm'){ok.click();return {state:'confirmed'};}
    return {state:'confirmation'};
  }
  if(step==='settings'){
    const go=button(document,['公開に進む','公開設定']);if(!go)return {state:'missing'};
    go.click();return {state:'opened'};
  }
  const submit=button(document,['更新する']);if(!submit)return {state:'missing'};
  const inputs=all(document,'input,textarea').filter(e=>/ハッシュタグ/.test(e.placeholder||e.getAttribute('aria-label')||''));
  const field=one(inputs);if(!field||field.disabled||field.readOnly||field.value.trim())return {state:'tag_field'};
  const selected=all(document,'[aria-checked=true],[aria-selected=true],[aria-pressed=true]').map(name);
  for(const e of document.querySelectorAll('input:checked'))selected.push([...(e.labels||[])].map(name).join('')||name(e));
  if(!selected.includes('無料')||selected.some(t=>/有料|メンバーシップ|日時指定|予約|SNS|Xに|Twitter/.test(t))||
    all(document,'input[type="datetime-local"],[name*="schedul"][type=hidden]').some(e=>e.value))return {state:'settings'};
  const expected=[...new Set(arg.tags)].sort();
  const values=[];
  for(const chip of document.querySelectorAll('[data-selected-tag],[data-tag],[class*=tagChip],[class*=TagChip],input[name="hashtags[]"]')){
    const raw=chip.getAttribute('data-selected-tag')||chip.getAttribute('data-tag')||chip.value||chip.innerText||'';
    const clean=raw.replace(/(?:削除|外す|取り消す|[×✕])\s*$/,'').replace(/^#/,'').trim();
    if(clean&&!/\n/.test(clean))values.push(clean);
  }
  for(const el of all(document,'[aria-label]')){
    const label=el.getAttribute('aria-label')||'';
    const m=/^ハッシュタグ\s*#?(.+?)(?:\s*を)?(?:削除|外す)$/.exec(label);if(m)values.push(m[1].trim());
  }
  const actual=[...new Set(values)].sort();
  const tags=JSON.stringify(actual)===JSON.stringify(expected)?actual:null;
  if(!tags)return {state:'tags'};
  if(step==='ready'&&!tags.includes(arg.tag)&&tags.length>=10)return {state:'tag_limit'};
  if(step==='ready'||step==='updatedReady')return {state:'ready'};
  if(step==='add'){
    if(tags.includes(arg.tag))return {state:'already'};
    if(tags.length>=10)return {state:'tag_limit'};
    const proto=field.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;if(!setter)return {state:'tag_field'};
    setter.call(field,arg.tag);field.dispatchEvent(new Event('input',{bubbles:true}));
    field.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}));
    field.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}));
    return {state:'added'};
  }
  if(step==='update'){submit.click();return {state:'clicked'};}
  return {state:'unknown'};
}
async function contestBrowserRead16923(key){
  if(location.origin!=='https://note.com'||!/^n[a-z0-9]{1,64}$/.test(key))return null;
  const r=await fetch('/api/v3/notes/'+key,{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(4500)});
  if(!r.ok)return null;
  const n=(await r.json())?.data;return n?.key===key?n:null;
}
async function contestBrowser16923(binding,cookie,before,p,mark,mayAct,plain,beforeUpdate){
  if(typeof plain!=='string')return {message:'本文の表示形式を厳密に照合できず応募保留'};
  return inNoteBrowser(binding,cookie,true,async({command,evaluate,blocked,blockedResult})=>{
    const end=Date.now()+35000;
    const poll=async(fn,accept)=>{
      for(let i=0;i<12&&!blocked()&&Date.now()<end;i++){
        try{const v=await fn();if(accept(v))return v;}catch{}
        await pause520(200);
      }
      return null;
    };
    const arg={key:before.key,title:before.title,body:plain,tag:p.tag,tags:before.tags};
    const screen=(step,extra={})=>evaluate('('+BROWSER_SOURCES520.contestScreen16923+')('+JSON.stringify(step)+','+JSON.stringify({...arg,...extra})+')');
    await command('Page.navigate',{url:'https://note.com/43__/n/'+before.key});
    const who=await poll(()=>evaluate(noteIdentityJS),x=>!!x?.id);
    if(blocked())return blockedResult();
    if(who?.id!==before.account||who.name!=='43__')return {message:'応募するアカウント本人のログインを確認待ち'};
    const saved=await evaluate('('+BROWSER_SOURCES520.contestBrowserRead16923+')('+JSON.stringify(before.key)+')');
    if(!contestSame16923(before,await contestSnapshot16923(saved,before.account),p.tag))return {message:'作品の保存状態が変わったため応募保留'};
    if(!await mayAct())return {message:'停止・待機・期限の条件により応募保留'};
    await command('Page.navigate',{url:'https://editor.note.com/notes/'+before.key+'/edit/'});
    const draft=()=>evaluate('('+nativeScreenJS+')("draft",'+JSON.stringify(arg)+')');
    if(!await poll(draft,x=>x==='ready'))return blocked()?blockedResult():{message:'編集画面の本文・タイトルが一致せず応募保留'};
    const img=await evaluate('('+nativeScreenJS+')("linkCover",'+JSON.stringify(arg)+')');
    if(!img||coverId(img.src)!==before.cover)return {message:'編集画面の見出し画像が一致せず応募保留'};
    if((await screen('settings'))?.state!=='opened')return {message:'公開設定の画面を確認待ち'};
    const ready=await poll(()=>screen('ready'),x=>x?.state==='ready');
    if(!ready)return blocked()?blockedResult():{message:'無料設定・既存タグ・更新ボタンを確認できず応募保留'};
    if(before.tags.includes(p.tag))return {message:'応募タグ設定済み。重ねて操作しません'};
    if(blocked()||!await mayAct()||!await mark())return blocked()?blockedResult():{message:'応募上限・停止・期限を再確認して保留'};
    // From here onward the ledger is irrevocably attempted. Never retry an edit
    // after a crash, timeout, unexpected screen or lost response.
    if(blocked()||!await mayAct())return blocked()?blockedResult():{message:'タグ入力の直前に停止・待機・期限を確認して保留。応募操作は再送しません'};
    if((await screen('add'))?.state!=='added')return {message:'タグ入力操作の結果を確認待ち。自動再送しません'};
    const changed=await poll(()=>screen('updatedReady',{tags:[...before.tags,p.tag]}),x=>['ready','confirmation'].includes(x?.state));
    if(changed?.state==='confirmation'){
      if(!await mayAct()||blocked())return blocked()?blockedResult():{message:'応募確認の前に停止・期限を確認して保留'};
      if((await screen('confirm',{tags:[...before.tags,p.tag]}))?.state!=='confirmed')return {message:'応募確認画面を確認待ち。自動再送しません'};
    }
    if(!await poll(()=>screen('updatedReady',{tags:[...before.tags,p.tag]}),x=>x?.state==='ready'))return blocked()?blockedResult():{message:'追加タグと既存タグの一致を確認待ち。自動再送しません'};
    if(blocked()||!await mayAct())return blocked()?blockedResult():{message:'更新前に停止・期限を確認して保留'};
    if(typeof beforeUpdate!=='function'||!await beforeUpdate())return {message:'更新直前の保存済み作品の一致を確認できず保留。自動再送しません'};
    if(blocked()||!await mayAct())return blocked()?blockedResult():{message:'更新直前に停止・待機・期限を確認して保留'};
    const result=await screen('update',{tags:[...before.tags,p.tag]});
    return {message:result?.state==='clicked'?'応募の更新操作済み。別の読み取りでタグ・作品内容・募集一覧を自動確認します':'更新操作の結果が未確認。自動再送しません'};
  });
}

const contestOriginalRead16923=Desk520.prototype.publicRead;
Desk520.prototype.publicRead=async function(path,format){
  const result=await contestOriginalRead16923.call(this,path,format);
  try{this.contestDiscover16923(path,format,result);}catch{}
  return result;
};

// RSS observations are bounded local hints. They never grant publishing rights,
// alter an article, or bypass the existing mutation ledger and rate limits.
const RSS16926=Object.freeze({feeds:128,windows:4096,appearances:4096,spread:2048,delays:256,briefs:96,matches:512,age:28*D520});
function rssUrl16926(path){
  try{const u=new URL(path);return u.origin==='https://note.com'&&!u.username&&!u.password&&!u.search&&!u.hash&&
    (/^\/[\w-]{1,80}\/rss$/.test(u.pathname)||!!noteLink161(path.replace(/\/rss$/,''))&&u.pathname.endsWith('/rss'))?u.href:null;}catch{return null;}
}
function rssIdentity16926(url,issue){
  if(!issue||!Array.isArray(issue.entries)||typeof issue.header?.link!=='string')return null;
  const base=url.replace(/\/rss$/,''),mag=noteLink161(base),channel=noteLink161(issue.header.link);
  if(mag)return channel?.id===mag.id?{id:mag.id,owner:channel.owner||mag.owner||'',url:base}:null;
  try{const a=new URL(base),b=new URL(issue.header.link);return a.origin===b.origin&&a.pathname.replace(/\/$/,'')===b.pathname.replace(/\/$/,'')?{id:'',owner:a.pathname.slice(1),url:base}:null;}catch{return null;}
}
function rssItems16926(issue,url){
  const seen=new Set(),items=[];
  for(const e of issue.entries.slice(0,100)){
    const a=noteLink161(e?.link||'',url,'article');if(!a||seen.has(a.id))continue;
    seen.add(a.id);items.push({key:a.id,owner:a.owner,title:String(e.title||'').slice(0,180),pub:Date.parse(e.pubdate)||0});
  }
  return items;
}
function rssHeader16926(value){return typeof value==='string'&&value.length<=512&&!/[\r\n\u0000]/.test(value)?value:'';}
function rssPrevious16926(body){
  const text=words161(body).normalize('NFKC').replace(/\s+/g,'');
  if(/未発表|未公開|新作(?:のみ|限定)|(?:既発表|過去作|過去記事|再掲).{0,10}(?:不可|禁止|NG|除く)|(?:過去|既発表).{0,30}(?:ただし|但し|場合に限|条件付き)/i.test(text))return false;
  return /(?:既発表(?:の)?(?:作品|記事)?|過去(?:の)?(?:作品|記事)|再掲)(?:も|は|で)?(?:可|OK|歓迎|可能)|過去に(?:公開|投稿|発表)した(?:作品|記事).{0,35}(?:応募可能|応募できます|参加できます|応募可)/i.test(text);
}
function rssTopic16926(n){
  const text=words161(n.body).normalize('NFKC');
  const m=/(?:テーマ|お題)\s*(?:は|[:：]|■)?\s*[「『“"]([^」』”"\n]{1,50})[」』”"]/.exec(text);
  return m?m[1].trim():'';
}
function rssTopicMatch16926(topic,feature,title){
  if(!feature?.full||!topic)return 0;
  const f=networkFeature16922({name:topic,body:topic},true);
  const themes=f.themes.filter(t=>t!=='独白'&&feature.themes.includes(t));
  const tokens=f.tokens.filter(t=>feature.tokens.includes(t));
  if(!themes.length&&!tokens.length&&!title.includes(topic))return 0;
  return Math.min(1,(title.includes(topic)?0.6:0)+0.25*themes.length+0.15*tokens.length);
}
Object.assign(Desk520.prototype,{
  initRss16926(){
    if(this.rssReady16926)return;
    this.storage.transactionSync(()=>{
      this.rows("CREATE TABLE IF NOT EXISTS desk_rss16926(id INTEGER PRIMARY KEY,requests INTEGER DEFAULT 0,unchanged INTEGER DEFAULT 0,changed INTEGER DEFAULT 0,new_items INTEGER DEFAULT 0,due INTEGER DEFAULT 0,pruned INTEGER DEFAULT 0,sample_day TEXT DEFAULT '',sample_used INTEGER DEFAULT 0,sample_slot TEXT DEFAULT '',sample_url TEXT DEFAULT '',sample_at INTEGER DEFAULT 0,sample_due INTEGER DEFAULT 0,sample_feed TEXT DEFAULT '',message TEXT DEFAULT 'RSSの観測を開始待ち')");
      this.rows('INSERT OR IGNORE INTO desk_rss16926(id) VALUES(1)');
      this.rows("CREATE TABLE IF NOT EXISTS desk_rss_feed16926(url TEXT PRIMARY KEY,id TEXT NOT NULL,checked INTEGER NOT NULL,items TEXT NOT NULL,payload TEXT NOT NULL,etag TEXT NOT NULL,modified TEXT NOT NULL,quiet INTEGER NOT NULL,added INTEGER NOT NULL,full_at INTEGER NOT NULL)");
      this.rows('CREATE INDEX IF NOT EXISTS desk_rss_feed_age16926 ON desk_rss_feed16926(checked,url)');
      this.rows('CREATE INDEX IF NOT EXISTS desk_rss_feed_id16926 ON desk_rss_feed16926(id,checked)');
      this.rows('CREATE TABLE IF NOT EXISTS desk_rss_activity16927(url TEXT PRIMARY KEY,checked INTEGER NOT NULL,changed_at INTEGER NOT NULL,added INTEGER NOT NULL)');
      this.rows('CREATE INDEX IF NOT EXISTS desk_rss_activity_age16927 ON desk_rss_activity16927(checked)');
      this.rows('CREATE TABLE IF NOT EXISTS desk_rss_window16926(id TEXT NOT NULL,start INTEGER NOT NULL,finish INTEGER NOT NULL,day TEXT NOT NULL,hour INTEGER NOT NULL,added INTEGER NOT NULL,PRIMARY KEY(id,start))');
      this.rows('CREATE INDEX IF NOT EXISTS desk_rss_window_age16926 ON desk_rss_window16926(finish)');
      this.rows('CREATE TABLE IF NOT EXISTS desk_rss_appearance16926(article TEXT NOT NULL,id TEXT NOT NULL,first_seen INTEGER NOT NULL,last_seen INTEGER NOT NULL,not_before INTEGER NOT NULL,automatic INTEGER NOT NULL,name TEXT NOT NULL,PRIMARY KEY(article,id))');
      this.rows('CREATE INDEX IF NOT EXISTS desk_rss_appearance_age16926 ON desk_rss_appearance16926(last_seen)');
      this.rows('CREATE INDEX IF NOT EXISTS desk_rss_appearance_source16926 ON desk_rss_appearance16926(id,first_seen,article)');
      this.rows('CREATE TABLE IF NOT EXISTS desk_rss_spread16926(article TEXT NOT NULL,source TEXT NOT NULL,target TEXT NOT NULL,first_seen INTEGER NOT NULL,not_before INTEGER NOT NULL,observed INTEGER NOT NULL,PRIMARY KEY(article,source,target))');
      this.rows('CREATE INDEX IF NOT EXISTS desk_rss_spread_source16926 ON desk_rss_spread16926(source,observed,article)');
      this.rows('CREATE INDEX IF NOT EXISTS desk_rss_spread_age16926 ON desk_rss_spread16926(observed)');
      this.rows('CREATE TABLE IF NOT EXISTS desk_rss_delay16926(article TEXT NOT NULL,id TEXT NOT NULL,started INTEGER NOT NULL,until INTEGER NOT NULL,message TEXT NOT NULL,PRIMARY KEY(article,id))');
      this.rows('CREATE INDEX IF NOT EXISTS desk_rss_delay_age16926 ON desk_rss_delay16926(started)');
      this.rows("CREATE TABLE IF NOT EXISTS desk_rss_brief16926(source TEXT PRIMARY KEY,kind TEXT NOT NULL,url TEXT NOT NULL,title TEXT NOT NULL,hash TEXT NOT NULL,topic TEXT NOT NULL,previous INTEGER NOT NULL,policy TEXT NOT NULL,checked INTEGER NOT NULL,due INTEGER NOT NULL,cursor TEXT NOT NULL DEFAULT '',message TEXT NOT NULL)");
      this.rows('CREATE INDEX IF NOT EXISTS desk_rss_brief_due16926 ON desk_rss_brief16926(due,source)');
      this.rows('CREATE INDEX IF NOT EXISTS desk_rss_brief_age16926 ON desk_rss_brief16926(checked)');
      this.rows('CREATE TABLE IF NOT EXISTS desk_rss_match16926(source TEXT NOT NULL,article TEXT NOT NULL,title TEXT NOT NULL,score REAL NOT NULL,hash TEXT NOT NULL,at INTEGER NOT NULL,ready INTEGER NOT NULL,message TEXT NOT NULL,PRIMARY KEY(source,article))');
      this.rows('CREATE INDEX IF NOT EXISTS desk_rss_match_work16926 ON desk_rss_match16926(article,ready,at)');
      this.rows('CREATE INDEX IF NOT EXISTS desk_rss_match_age16926 ON desk_rss_match16926(at)');
    });
    this.rssReady16926=true;
  },
  rssTry16926(fn,fallback=null){
    if(this.rssFaultUntil16926>Date.now())return fallback;
    try{this.initRss16926();return fn();}catch{
      this.rssFaultUntil16926=Date.now()+HOUR;
      try{this.rows("UPDATE desk_rss16926 SET message='追加の観測情報を再確認待ち。通常の巡回を継続' WHERE id=1");}catch{}
      return fallback;
    }
  },
  rssTrim16926(now){
    const prune=this.one('SELECT pruned FROM desk_rss16926 WHERE id=1').pruned<=now-HOUR;
    for(const [table,age,cap] of [['feed','checked',RSS16926.feeds],['window','finish',RSS16926.windows],['appearance','last_seen',RSS16926.appearances],['spread','observed',RSS16926.spread],['delay','started',RSS16926.delays],['brief','checked',RSS16926.briefs],['match','at',RSS16926.matches]]){
      if(!prune&&!['feed','delay','brief'].includes(table))continue;
      const name='desk_rss_'+table+'16926';
      this.rows('DELETE FROM '+name+' WHERE '+age+'<?',now-RSS16926.age);
      this.rows('DELETE FROM '+name+' WHERE rowid IN (SELECT rowid FROM '+name+' ORDER BY '+age+' DESC,rowid DESC LIMIT -1 OFFSET ?)',cap);
    }
    // Activity is only a bounded companion to the feed cache, never history.
    this.rows('DELETE FROM desk_rss_activity16927 WHERE NOT EXISTS (SELECT 1 FROM desk_rss_feed16926 f WHERE f.url=desk_rss_activity16927.url)');
    if(prune)this.rows('UPDATE desk_rss16926 SET pruned=? WHERE id=1',now);
  },
  rssObserve16926(url,issue,old,headers={},unchanged=false){
    const now=Date.now(),identity=rssIdentity16926(url,issue);if(!identity)return;
    const items=rssItems16926(issue,url),before=networkJSON16922(old?.items||'[]'),known=new Set(before.map(i=>i.key));
    const added=old?items.filter(i=>!known.has(i.key)):items;
    const payload=JSON.stringify(issue),cacheable=payload.length<=131072&&!/(?:no-store|private)/i.test(headers.cache||'');
    this.storage.transactionSync(()=>{
      const span=old?now-old.checked:0,hour=Math.floor((now+9*HOUR)/HOUR),priorHour=old?Math.floor((old.checked+9*HOUR)/HOUR):0;
      // A day-long gap cannot identify the hour when a magazine changed.
      if(identity.id&&span>=30000&&span<=90*M520&&hour===priorHour)
        this.rows('INSERT OR IGNORE INTO desk_rss_window16926 VALUES(?,?,?,?,?,?)',identity.id,old.checked,now,jstDay(now),hour%24,added.filter(n=>n.owner!=='43__').length);
      this.rows(`INSERT INTO desk_rss_feed16926 VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET id=excluded.id,checked=excluded.checked,items=excluded.items,payload=excluded.payload,etag=excluded.etag,modified=excluded.modified,quiet=excluded.quiet,added=excluded.added,full_at=excluded.full_at`,
        url,identity.id,now,JSON.stringify(items),cacheable?payload:'',cacheable?rssHeader16926(headers.etag):'',cacheable?rssHeader16926(headers.modified):'',old&&!added.length?(old.quiet||0)+1:0,old?added.length:0,unchanged?old.full_at:now);
      // Short observation pairs do not establish days of inactivity. Preserve
      // the last actual addition across unchanged reads and object restarts.
      this.rows(`INSERT INTO desk_rss_activity16927 VALUES(?,?,?,?) ON CONFLICT(url) DO UPDATE SET checked=excluded.checked,
        changed_at=CASE WHEN excluded.added>0 THEN excluded.changed_at ELSE changed_at END,
        added=CASE WHEN excluded.added>0 THEN excluded.added ELSE added END`,url,now,now,old?added.length:0);
      this.rows('UPDATE desk_rss16926 SET requests=requests+1,unchanged=unchanged+?,changed=changed+?,new_items=new_items+?,message=? WHERE id=1',unchanged?1:0,old&&added.length?1:0,added.length,'RSSの更新差分を確認。募集要項・操作直前の確認は継続');
      if(identity.id&&identity.owner!=='43__')this.rssAppear16926(identity,issue.header.title||identity.id,items,old,known,now);
      this.rssTrim16926(now);
    });
    // Old entries at the head of a feed cannot hide newly arrived works.
    this.networkTry16922(()=>{
      const writers=new Set();
      for(const n of added)if(writers.size<4&&!writers.has(n.owner)&&n.pub>0&&n.pub<=now){
        writers.add(n.owner);this.networkWork16922({key:n.key,status:'published',user:{urlname:n.owner},name:n.title,publishAt:new Date(n.pub).toISOString()},false);
      }
    });
  },
  rssAppear16926(identity,name,items,old,known,now){
    for(const n of items.filter(i=>i.owner==='43__').slice(0,20)){
      if(!this.one('SELECT 1 FROM desk_archive WHERE article=? AND verified>0',n.key))continue;
      const existing=this.one('SELECT * FROM desk_rss_appearance16926 WHERE article=? AND id=?',n.key,identity.id);
      const automatic=!!this.one('SELECT 1 FROM desk_mag_send WHERE article=? AND id=?',n.key,identity.id)||!!this.one("SELECT 1 FROM desk_job WHERE kind='mag' AND article=? AND target=? AND phase IN ('sent','seen','confirmed')",n.key,identity.id);
      const lower=old&&!known.has(n.key)&&old.checked>=now-2*D520?old.checked:0;
      this.rows(`INSERT INTO desk_rss_appearance16926 VALUES(?,?,?,?,?,?,?) ON CONFLICT(article,id) DO UPDATE SET last_seen=excluded.last_seen,automatic=MAX(automatic,excluded.automatic),name=excluded.name`,n.key,identity.id,now,now,lower,+automatic,String(name).slice(0,100));
      if(existing||automatic||!lower)continue;
      const prior=this.rows('SELECT * FROM desk_rss_appearance16926 WHERE article=? AND id<>? AND first_seen<=? AND first_seen>=? ORDER BY first_seen DESC LIMIT 8',n.key,identity.id,lower,now-RSS16926.age);
      for(const a of prior)this.rows('INSERT OR IGNORE INTO desk_rss_spread16926 VALUES(?,?,?,?,?,?)',n.key,a.id,identity.id,a.first_seen,lower,now);
    }
  },
  async rssFetch16926(url){
    const now=Date.now();
    if(this.one('SELECT blocked FROM desk_cfg WHERE id=1').blocked>now)throw new PublicReadError('note指定の待機中');
    const old=this.rssTry16926(()=>this.one('SELECT * FROM desk_rss_feed16926 WHERE url=?',url));
    let cached=null;
    try{cached=JSON.parse(old?.payload||'');if(!rssIdentity16926(url,cached))cached=null;}catch{}
    const headers={Accept:'application/rss+xml, application/xml, text/xml'};
    // Periodically retrieve a full response even when a server has validators.
    if(cached&&old.full_at>now-D520){if(old.etag)headers['If-None-Match']=old.etag;else if(old.modified)headers['If-Modified-Since']=old.modified;}
    let response,target=url;
    for(let attempt=0;attempt<3;attempt++){
      try{response=await fetch(target,{method:'GET',redirect:'manual',cache:'no-store',headers,signal:AbortSignal.timeout(7500)});}
      catch(e){throw new PublicReadError(['AbortError','TimeoutError'].includes(e?.name)?'noteへの通信がタイムアウト':'noteから応答を受け取れません');}
      if(![301,302,303,307,308].includes(response.status))break;
      const next=directoryRedirect161(target,response.headers.get('Location')||'');await response.body?.cancel();
      if(!next||next===target||attempt===2)throw new PublicReadError('RSSの転送先を確認できません');
      target=next;
    }
    const unchanged=response.status===304;
    if(unchanged&&(!cached||!headers['If-None-Match']&&!headers['If-Modified-Since'])){await response.body?.cancel();throw new PublicReadError('RSSの更新確認に必要な記録がありません');}
    if(!response.ok&&!unchanged){
      const delay=retryDelay16929(response.headers.get('Retry-After'),now);
      if(response.status===429||delay>0)this.rows('UPDATE desk_cfg SET blocked=MAX(blocked,?) WHERE id=1',now+(delay||HOUR));
      await response.body?.cancel();throw new PublicReadError('note応答 HTTP '+response.status);
    }
    let issue=cached;
    if(!unchanged){
      let body;try{body=await read520body(response,3000000);}catch{throw new PublicReadError('RSS本文を読み取れません');}
      try{issue=rss520(body,'issue');}catch{throw new PublicReadError('RSSの形式を読み取れません');}
    }else await response.body?.cancel();
    this.rssTry16926(()=>this.rssObserve16926(url,issue,old,{etag:response.headers.get('ETag')||(unchanged?old.etag:''),modified:response.headers.get('Last-Modified')||(unchanged?old.modified:''),cache:response.headers.get('Cache-Control')||''},unchanged));
    return issue;
  },
  rssScoutDelay16926(url,now){
    return this.rssTry16926(()=>{
      const f=this.one('SELECT * FROM desk_rss_feed16926 WHERE url=?',url+'/rss');
      if(!f||f.checked<now-10*M520)return D520;
      const activity=this.one('SELECT * FROM desk_rss_activity16927 WHERE url=?',f.url);
      if(!activity)return D520;
      const elapsed=Math.max(0,now-activity.changed_at);
      return elapsed>=2*D520?2*D520:elapsed<6*HOUR&&activity.added>0?(activity.added>=6?2*HOUR:6*HOUR):D520;
    },D520);
  },
  async rssSampleTick16926(now){
    const plan=this.rssTry16926(()=>{
      if(!this.contestActive16923(now))return null;
      const day=jstDay(now),hour=Math.floor((now+9*HOUR)/HOUR)%24,minute=Math.floor(now/M520)%60;
      let s=this.one('SELECT * FROM desk_rss16926 WHERE id=1');
      if(s.sample_day!==day){
        this.rows("UPDATE desk_rss16926 SET sample_day=?,sample_used=0,sample_slot='',sample_url='',sample_at=0,sample_due=0,sample_feed='' WHERE id=1",day);
        s=this.one('SELECT * FROM desk_rss16926 WHERE id=1');
      }
      if(s.sample_used>=8||s.sample_due>now)return null;
      if(s.sample_url&&(now-s.sample_at>50*M520||Math.floor(s.sample_at/HOUR)!==Math.floor(now/HOUR))){
        this.rows("UPDATE desk_rss16926 SET sample_url='' WHERE id=1");return null;
      }
      const slot=day+'-'+hour,following=!!s.sample_url;
      if(!following&&(![12,13,20,21].includes(hour)||minute>30||s.sample_slot===slot))return null;
      const budget=this.one('SELECT day,used FROM desk_scout_budget WHERE id=1'),used=budget.day===day?budget.used:0;
      if(used>=192||this.one('SELECT due FROM desk_scout_state WHERE id=1').due>now)return null;
      let feed=following?s.sample_url:s.sample_feed;
      if(!feed){
        const candidates=this.rows(`SELECT f.url FROM desk_rss_feed16926 f JOIN desk_mag m ON f.url=m.url||'/rss'
          WHERE m.active=1 AND f.id<>'' AND f.checked>=? ORDER BY f.checked DESC,f.url LIMIT 2`,now-2*D520);
        if(!candidates.length)return null;
        feed=candidates[Math.floor(jstStart(day)/D520)%candidates.length].url;
      }
      if(!rssUrl16926(feed))return null;
      this.storage.transactionSync(()=>{
        this.rows('UPDATE desk_scout_budget SET day=?,used=? WHERE id=1',day,used+1);
        this.rows('UPDATE desk_scout_state SET due=MAX(due,?) WHERE id=1',now+6*M520);
        this.rows('UPDATE desk_rss16926 SET sample_used=sample_used+1,sample_slot=?,sample_url=?,sample_at=?,sample_due=?,sample_feed=? WHERE id=1',slot,following?'':feed,following?0:now,following?0:now+20*M520,feed);
      });
      return feed;
    });
    if(!plan)return;
    try{await this.publicRead(plan,'issue');}
    catch{this.rssTry16926(()=>this.rows("UPDATE desk_rss16926 SET message='時間帯の観測は再確認待ち。確認できた区間だけ比較します' WHERE id=1"));}
  },
  rssRates16926(id,now){
    return this.rows('SELECT hour,COUNT(DISTINCT day) days,SUM(finish-start) duration,SUM(added) added FROM desk_rss_window16926 WHERE id=? AND finish>=? GROUP BY hour',id,now-21*D520)
      .filter(r=>r.days>=3&&r.duration>=HOUR).map(r=>({...r,rate:r.added*HOUR/r.duration}));
  },
  rssTiming16926(job,now){
    return this.rssTry16926(()=>{
      const old=this.one('SELECT * FROM desk_rss_delay16926 WHERE article=? AND id=?',job.key,job.target);
      const started=Math.min(now,this.one('SELECT MIN(started) started FROM desk_rss_delay16926 WHERE article=?',job.key).started??now);
      if(now>=started+2*HOUR)return job;
      if(old){if(now>=old.until)return job;return null;}
      const feed=this.one('SELECT checked FROM desk_rss_feed16926 WHERE id=? ORDER BY checked DESC LIMIT 1',job.target);
      if(!feed||feed.checked<now-2*D520)return job;
      const rates=this.rssRates16926(job.target,now),hour=Math.floor((now+9*HOUR)/HOUR)%24,current=rates.find(r=>r.hour===hour);
      if(!current||current.rate<3)return job;
      const next=rates.filter(r=>{const gap=(r.hour-hour+24)%24;return gap>=1&&gap<=2&&r.rate*2+0.5<current.rate;})
        .sort((a,b)=>a.rate-b.rate||((a.hour-hour+24)%24)-((b.hour-hour+24)%24))[0];
      if(!next)return job;
      const until=Math.min(started+2*HOUR,Math.floor(now/HOUR)*HOUR+((next.hour-hour+24)%24)*HOUR);
      this.rows('INSERT INTO desk_rss_delay16926 VALUES(?,?,?,?,?)',job.key,job.target,started,until,'観測上、更新の少ない時間帯まで共同誌への追加を待機');
      this.rssTrim16926(now);return null;
    },job);
  },
  rssSpreadScore16927(id,now){
    // Count a later appearance only for a source article in this same cohort.
    // Evicted/recreated observations and subsequently identified auto-adds
    // cannot inflate the numerator or produce a score above one.
    const r=this.one(`SELECT COUNT(*) observations,COALESCE(SUM(EXISTS(
      SELECT 1 FROM desk_rss_spread16926 s JOIN desk_rss_appearance16926 t ON t.article=s.article AND t.id=s.target
      WHERE s.source=a.id AND s.article=a.article AND s.first_seen=a.first_seen
        AND s.observed>=? AND s.observed<=? AND s.not_before>=a.first_seen
        AND t.first_seen=s.observed AND t.automatic=0
    )),0) later FROM desk_rss_appearance16926 a WHERE a.id=? AND a.first_seen>=? AND a.first_seen<=?`,now-RSS16926.age,now,id,now-RSS16926.age,now);
    return {...r,score:r.observations?r.later/r.observations:0};
  },
  rssChoose16926(valid,base,work,now){
    if(!base||!work?.article)return base;
    return this.rssTry16926(()=>{
      const sent=this.one('SELECT COUNT(*) n FROM desk_mag_send WHERE article=?',work.article).n;
      if(sent%4===0)return base;
      const choices=[base,...valid.filter(m=>m.url!==base.url)].filter(m=>this.magazineRoom520(noteLink161(m.url)?.id,now)).slice(0,24);
      const matches=this.rows(`SELECT m.source,m.score FROM desk_rss_match16926 m JOIN desk_rss_brief16926 b ON b.source=m.source AND b.hash=m.hash
        WHERE m.article=? AND m.ready=1 AND m.at>=? AND b.checked>=?`,work.article,now-2*D520,now-2*D520);
      const matched=matches.sort((a,b)=>b.score-a.score).map(r=>({r,mag:choices.find(m=>noteLink161(m.url)?.id===r.source)})).find(x=>x.mag);
      if(matched&&matched.r.score>=0.25)return matched.mag;
      const scores=choices.map(m=>{
        const id=noteLink161(m.url)?.id;
        return {m,...this.rssSpreadScore16927(id,now)};
      });
      const baseline=scores[0];if(!baseline||baseline.observations<6)return base;
      const better=scores.filter(s=>s.observations>=6&&s.later>=3&&s.score>=baseline.score+0.2).sort((a,b)=>b.score-a.score)[0];
      return better?.m||base;
    },base);
  },
  rssBrief16926(source,kind,url,title,hash,topic,previous,policy,message){
    const old=this.one('SELECT hash FROM desk_rss_brief16926 WHERE source=?',source),now=Date.now();
    this.storage.transactionSync(()=>{
      if(old&&old.hash!==hash)this.rows('DELETE FROM desk_rss_match16926 WHERE source=?',source);
      this.rows(`INSERT INTO desk_rss_brief16926(source,kind,url,title,hash,topic,previous,policy,checked,due,message) VALUES(?,?,?,?,?,?,?,?,?,0,?)
        ON CONFLICT(source) DO UPDATE SET kind=excluded.kind,url=excluded.url,title=excluded.title,hash=excluded.hash,topic=excluded.topic,previous=excluded.previous,policy=excluded.policy,checked=excluded.checked,
        due=CASE WHEN hash<>excluded.hash THEN 0 ELSE due END,cursor=CASE WHEN hash<>excluded.hash THEN '' ELSE cursor END,message=excluded.message`,source,kind,url,String(title).slice(0,180),hash,topic,+previous,JSON.stringify(policy||{}),now,message);
      if(!previous||kind==='mag'&&!policy)this.rows('DELETE FROM desk_rss_match16926 WHERE source=?',source);
      this.rssTrim16926(now);
    });
  },
  async rssCapture16926(path,format,value){
    if(format!=='json'||!/^https:\/\/note\.com\/api\/v3\/notes\/n[a-z0-9]+$/.test(path))return;
    const n=value?.data;if(n?.key!==path.split('/').at(-1)||n.status!=='published'||!contestOwner16923(n.user?.urlname)||n.price!==0||
      n.isLimited===true||n.is_limited===true||n.isPaid===true||n.is_paid===true||n.isPreview===true||n.hasPaywall===true||typeof n.body!=='string'||n.body.length>250000||!/募集|コンテスト|お題|企画/.test(n.name||''))return;
    const hash=await draftBodyHash(n.body);if(!hash)return;
    const previous=rssPrevious16926(n.body),topic=rssTopic16926(n),policy=contestRule16923(n);
    this.rssTry16926(()=>this.rssBrief16926(n.key,'contest','https://note.com/'+n.user.urlname+'/n/'+n.key,n.name,hash,topic,previous,policy,
      previous?'既刊との照合候補。参加資格・期間・応募方法の全条件を別途確認':'過去作品の応募可否を確認できないため既刊は対象外'));
  },
  async rssMagazineBrief16926(row,result){
    const link=noteLink161(row?.url);if(!link||!result)return;
    // This hook runs AFTER the existing owner, permission and complete rule
    // parser. RSS headlines and discovery alone cannot create a ready match.
    const rule=noteLink161(result.rules||'','https://note.com','article');
    const captured=this.rssTry16926(()=>rule?this.one('SELECT topic,hash FROM desk_rss_brief16926 WHERE source=?',rule.id):null);
    const hash=await draftBodyHash(JSON.stringify({policy:result.policy||null,rules:result.rules||'',summary:result.summary||'',title:result.title||'',topic:captured?.topic||'',sourceHash:captured?.hash||''}));
    this.rssTry16926(()=>{
      this.rssBrief16926(link.id,'mag',row.url,result.title||row.name||link.id,hash,captured?.topic||'',!!result.policy,result.policy,
        result.policy?'既発表可を含む掲載条件を確認。過去作品との照合待ち':result.reason||'掲載条件を再確認待ち');
    });
  },
  rssMatchTick16926(now){
    return this.rssTry16926(()=>{
      if(!this.contestActive16923(now)||this.one('SELECT due FROM desk_rss16926 WHERE id=1').due>now)return;
      this.rows('UPDATE desk_rss16926 SET due=? WHERE id=1',now+30*M520);
      const b=this.one('SELECT * FROM desk_rss_brief16926 WHERE previous=1 AND checked>=? AND due<=? ORDER BY due,source LIMIT 1',now-2*D520,now);if(!b)return;
      let policy;try{policy=JSON.parse(b.policy);}catch{return;}
      const mag=b.kind==='mag'?this.eligibleMags(now).find(m=>noteLink161(m.url)?.id===b.source):null;
      const candidates=this.rows(`SELECT a.*,w.genre work_genre,w.chars work_chars,w.method,n.feature,n.seen feature_at FROM desk_archive a
        LEFT JOIN desk_work w ON w.article=a.article LEFT JOIN desk_network_work16922 n ON n.article=a.article AND n.owner='43__'
        WHERE a.pub<? AND a.verified>=? AND a.article>? ORDER BY a.article LIMIT 24`,now,now-8*D520,b.cursor);
      let nudged=false;
      this.storage.transactionSync(()=>{
        this.rows(`DELETE FROM desk_rss_match16926 WHERE source=? AND NOT EXISTS
          (SELECT 1 FROM desk_archive a WHERE a.article=desk_rss_match16926.article AND a.pub<? AND a.verified>=?)`,b.source,now,now-8*D520);
        for(const a of candidates){
          // The previous result ceases to apply even when this evaluation
          // exits early because the content or eligibility has changed.
          this.rows('DELETE FROM desk_rss_match16926 WHERE source=? AND article=?',b.source,a.article);
          if(a.title.trim()==='521')continue;
          const feature=a.feature_at>=now-8*D520?networkParseFeature16922(a.feature):null;
          if(b.kind==='mag'&&(!mag||!this.archiveFits(a,[mag],now).length))continue;
          const score=b.topic?rssTopicMatch16926(b.topic,feature,a.title):b.kind==='mag'?0.25:0;
          if(!score){
            if(b.topic&&!feature&&!nudged){this.networkTry16922(()=>this.networkWork16922({key:a.article,name:a.title,status:'published',user:{urlname:'43__'},publishAt:new Date(a.pub).toISOString()},false));nudged=true;}
            continue;
          }
          const ready=b.kind==='mag'&&!!mag;
          this.rows(`INSERT INTO desk_rss_match16926 VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(source,article) DO UPDATE SET title=excluded.title,score=excluded.score,hash=excluded.hash,at=excluded.at,ready=excluded.ready,message=excluded.message`,b.source,a.article,a.title,score,b.hash,now,+ready,
            ready?'既発表可・字数・ジャンル・制作条件を照合。既存の掲載処理で直前再確認':'題材の一致候補。応募資格・期間・操作方法が未確認のため応募しません');
          if(ready)this.rows('UPDATE desk_archive SET pick_due=0 WHERE article=?',a.article);
        }
        this.rows('UPDATE desk_rss_brief16926 SET cursor=?,due=? WHERE source=?',candidates.length===24?candidates.at(-1).article:'',now+(candidates.length===24?30*M520:6*HOUR),b.source);
        this.rssTrim16926(now);
      });
    });
  },
  rssView16926(){
    return this.rssTry16926(()=>({state:this.one('SELECT * FROM desk_rss16926 WHERE id=1'),feeds:this.one('SELECT COUNT(*) n FROM desk_rss_feed16926').n,
      delays:this.rows('SELECT article,id,until,message FROM desk_rss_delay16926 WHERE until>? ORDER BY until LIMIT 8',Date.now()),
      spread:this.rows(`SELECT s.source,s.target,COUNT(DISTINCT s.article) works,MAX(s.observed) at FROM desk_rss_spread16926 s
        JOIN desk_rss_appearance16926 a ON a.article=s.article AND a.id=s.source AND a.first_seen=s.first_seen
        JOIN desk_rss_appearance16926 t ON t.article=s.article AND t.id=s.target AND t.first_seen=s.observed
        WHERE s.observed>=? AND s.observed<=? AND a.first_seen>=? AND s.not_before>=a.first_seen AND t.automatic=0
        GROUP BY s.source,s.target ORDER BY works DESC,at DESC LIMIT 8`,Date.now()-RSS16926.age,Date.now(),Date.now()-RSS16926.age),
      matches:this.rows('SELECT m.*,b.url,b.title opportunity FROM desk_rss_match16926 m JOIN desk_rss_brief16926 b ON b.source=m.source AND b.hash=m.hash WHERE m.at>=? AND b.checked>=? ORDER BY m.ready DESC,m.score DESC,m.at DESC LIMIT 12',Date.now()-2*D520,Date.now()-2*D520)
    }));
  }
});
const rssInitBefore16926=Desk520.prototype.init;
Desk520.prototype.init=function(){
  const result=rssInitBefore16926.call(this);
  this.rssTry16926(()=>true,false);
  return result;
};
const rssFetchBefore16926=Desk520.prototype.fetchPublic;
Desk520.prototype.fetchPublic=async function(path,format){
  const url=['rss','issue','channel'].includes(format)&&rssUrl16926(path);
  if(!url||!this.rssTry16926(()=>true,false))return rssFetchBefore16926.call(this,path,format);
  this.rssPending16926 ||= new Map();
  let task=this.rssPending16926.get(url);
  if(!task){task=this.rssFetch16926(url).finally(()=>this.rssPending16926.delete(url));this.rssPending16926.set(url,task);}
  const issue=await task;
  return structuredClone(format==='issue'?issue:format==='channel'?issue.header:issue.entries);
};
const rssReadBefore16926=Desk520.prototype.publicRead;
Desk520.prototype.publicRead=async function(path,format){
  const result=await rssReadBefore16926.call(this,path,format);
  try{await this.rssCapture16926(path,format,result);}catch{}
  return result;
};
const rssRulesBefore16926=Desk520.prototype.sourceForMagazine;
Desk520.prototype.sourceForMagazine=async function(row){
  const result=await rssRulesBefore16926.call(this,row);
  try{await this.rssMagazineBrief16926(row,result);}catch{}
  return result;
};
const rssChooseBefore16926=Desk520.prototype.chooseMagazine520;
Desk520.prototype.chooseMagazine520=function(valid,genre,now,work=null){
  const base=rssChooseBefore16926.call(this,valid,genre,now,work);
  return this.rssChoose16926(valid,base,work,now);
};
function rssRecord16926(v){
  if(!v)return '【RSSと既刊の活用】追加情報を再確認待ち。通常処理は継続';
  return '【RSSと既刊の活用】\n'+v.state.message+'\n観測中 '+v.feeds+'フィード ／ 更新なし応答 '+v.state.unchanged+'回 ／ 差分で見つけた記事 '+v.state.new_items+'件'+
    '\n時間帯の観測は最大8取得/日。既存192ページ枠に含めます。3日以上の観測が揃うまでは通常の掲載を継続。'+
    '\n混雑を避ける掲載待機 '+v.delays.length+'件（最大2時間後の通常枠へ。作品の公開予約は変更しません）'+
    v.delays.map(d=>'\n'+d.article+' → '+d.id+' ／ '+time(d.until)+'以降').join('')+
    '\n後続の誌面で確認した組み合わせ：'+(v.spread.length?v.spread.map(s=>s.source+' → '+s.target+' '+s.works+'作品').join(' ／ '):'観測を収集中')+
    '\n過去作品と新しい募集の照合：'+(v.matches.length?v.matches.map(m=>'\n'+m.title+' → '+m.opportunity+'\n'+m.url+'\n'+m.message).join(''):'条件と題材の合う作品を確認待ち')+
    '\n二次掲載はRSS上での観測順です。掲載時刻・紹介者・流入の因果関係は未確認。既存の参加資格・上限・待機・応募方法の確認を通ったものだけ操作します。';
}

const BROWSER_SOURCES520 = Object.freeze({
  "contestScreen16923": "function contestScreen16923(step,arg){\n  if(!['https://note.com','https://editor.note.com'].includes(location.origin)||\n    !new RegExp('^/notes/'+arg.key+'/(edit|publish|publish_setting|publish_settings)/?$').test(location.pathname))return {state:'page'};\n  const visible=e=>!!e?.getClientRects().length&&!e.closest('[hidden],[aria-hidden=\"true\"]');\n  const all=(root,sel)=>[...root.querySelectorAll(sel)].filter(visible);\n  const name=e=>(e.getAttribute('aria-label')||e.innerText||e.textContent||'').trim();\n  const one=xs=>xs.length===1?xs[0]:null;\n  const button=(root,labels)=>one(all(root,'button,[role=button]').filter(e=>!e.disabled&&e.getAttribute('aria-disabled')!=='true'&&labels.includes(name(e))));\n  const dialogs=all(document,'[role=dialog],dialog');\n  if(dialogs.length){\n    const dialog=one(dialogs),text=dialog?.innerText||'';\n    const ok=dialog&&button(dialog,['OK']);\n    if(!ok||!text.includes(arg.tag)||!/コンテスト.{1,160}に参加します/.test(text)||!/よろしいですか/.test(text)||/購入|支払|有料|料金|同意書/.test(text))return {state:'unknown_dialog'};\n    if(step==='confirm'){ok.click();return {state:'confirmed'};}\n    return {state:'confirmation'};\n  }\n  if(step==='settings'){\n    const go=button(document,['公開に進む','公開設定']);if(!go)return {state:'missing'};\n    go.click();return {state:'opened'};\n  }\n  const submit=button(document,['更新する']);if(!submit)return {state:'missing'};\n  const inputs=all(document,'input,textarea').filter(e=>/ハッシュタグ/.test(e.placeholder||e.getAttribute('aria-label')||''));\n  const field=one(inputs);if(!field||field.disabled||field.readOnly||field.value.trim())return {state:'tag_field'};\n  const selected=all(document,'[aria-checked=true],[aria-selected=true],[aria-pressed=true]').map(name);\n  for(const e of document.querySelectorAll('input:checked'))selected.push([...(e.labels||[])].map(name).join('')||name(e));\n  if(!selected.includes('無料')||selected.some(t=>/有料|メンバーシップ|日時指定|予約|SNS|Xに|Twitter/.test(t))||\n    all(document,'input[type=\"datetime-local\"],[name*=\"schedul\"][type=hidden]').some(e=>e.value))return {state:'settings'};\n  const expected=[...new Set(arg.tags)].sort();\n  const values=[];\n  for(const chip of document.querySelectorAll('[data-selected-tag],[data-tag],[class*=tagChip],[class*=TagChip],input[name=\"hashtags[]\"]')){\n    const raw=chip.getAttribute('data-selected-tag')||chip.getAttribute('data-tag')||chip.value||chip.innerText||'';\n    const clean=raw.replace(/(?:削除|外す|取り消す|[×✕])\\s*$/,'').replace(/^#/,'').trim();\n    if(clean&&!/\\n/.test(clean))values.push(clean);\n  }\n  for(const el of all(document,'[aria-label]')){\n    const label=el.getAttribute('aria-label')||'';\n    const m=/^ハッシュタグ\\s*#?(.+?)(?:\\s*を)?(?:削除|外す)$/.exec(label);if(m)values.push(m[1].trim());\n  }\n  const actual=[...new Set(values)].sort();\n  const tags=JSON.stringify(actual)===JSON.stringify(expected)?actual:null;\n  if(!tags)return {state:'tags'};\n  if(step==='ready'&&!tags.includes(arg.tag)&&tags.length>=10)return {state:'tag_limit'};\n  if(step==='ready'||step==='updatedReady')return {state:'ready'};\n  if(step==='add'){\n    if(tags.includes(arg.tag))return {state:'already'};\n    if(tags.length>=10)return {state:'tag_limit'};\n    const proto=field.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;\n    const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;if(!setter)return {state:'tag_field'};\n    setter.call(field,arg.tag);field.dispatchEvent(new Event('input',{bubbles:true}));\n    field.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}));\n    field.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}));\n    return {state:'added'};\n  }\n  if(step==='update'){submit.click();return {state:'clicked'};}\n  return {state:'unknown'};\n}",
  "contestBrowserRead16923": "async function contestBrowserRead16923(key){\n  if(location.origin!=='https://note.com'||!/^n[a-z0-9]{1,64}$/.test(key))return null;\n  const r=await fetch('/api/v3/notes/'+key,{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(4500)});\n  if(!r.ok)return null;\n  const n=(await r.json())?.data;return n?.key===key?n:null;\n}",

  "trafficScreen16913": "function trafficScreen16913(step='read') {\n  if(location.origin!=='https://note.com' || !/^\\/dashboard\\/?$/.test(location.pathname))return {state:'page'};\n  const visible=e=>!!e?.getClientRects().length && !e.closest('[hidden],[aria-hidden=\"true\"]');\n  const root=document.querySelector('main,[role=\"main\"]')||document.body;\n  if(!root)return {state:'loading'};\n  const clean=t=>(t||'').normalize('NFKC').replace(/[\\u200b\\u200e\\u200f]/g,'').trim();\n  const all=s=>[...root.querySelectorAll(s)].filter(visible);\n  const text=clean(root.innerText),header=text.split(/直近1[ヶかケ]月のまとめ|あなたへの提案|記事の流入元/)[0];\n  if(!/アクセス状況/.test(text) || !/インプレッション/.test(header) || !/ページビュー/.test(header))return {state:'layout'};\n  if(/この期間のデータはありません|集計中|読み込み中/.test(header))return {state:'loading'};\n  const stamps=[...header.matchAll(/(\\d{4})[\\/年.-](\\d{1,2})[\\/月.-](\\d{1,2})日?\\s*(?:〜|～|~|–|−|—|-|から)\\s*(?:(\\d{4})[\\/年.-])?(\\d{1,2})[\\/月.-](\\d{1,2})日?/g)];\n  const dates=[...new Set(stamps.map(m=>JSON.stringify([m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'),(m[4]||m[1])+'-'+m[5].padStart(2,'0')+'-'+m[6].padStart(2,'0')])))] ;\n  if(dates.length!==1)return {state:'period'};\n  const [start,end]=JSON.parse(dates[0]);\n  if(step==='previous'){\n    // Only the displayed dashboard's period navigation, never account settings.\n    const controls=all('button').filter(b=>!b.disabled && b.getAttribute('aria-disabled')!=='true' &&\n      /^(?:前の期間(?:へ|に移動|を表示)?|前期間|Previous period)$/i.test(clean(b.getAttribute('aria-label')||b.getAttribute('title')||b.innerText)));\n    if(controls.length!==1)return {state:'previous_missing'};\n    controls[0].click();return {state:'moved',start,end};\n  }\n  const values={},labels={impressions:'インプレッション',pageviews:'ページビュー',likes:'スキ',comments:'コメント'};\n  const nodes=all('span,p,dt,dd,div,button,strong,h2,h3');\n  for(const [key,label] of Object.entries(labels)){\n    const found=new Set();\n    for(const el of nodes.filter(e=>clean(e.innerText)===label)){\n      // Summary metric cards have one label and one exact count. Article rows,\n      // charts, menus and comparison percentages cannot pass this whole match.\n      for(let p=el.parentElement,n=0;p&&p!==root&&n<4;p=p.parentElement,n++){\n        const value=clean(p.innerText).replace(/\\s/g,'');\n        const match=new RegExp('^(?:'+label+'([0-9,]+|[-−–—])(?:回|件)?|([0-9,]+|[-−–—])(?:回|件)?'+label+')$').exec(value);\n        if(match){\n          const raw=match[1]||match[2];\n          if(/^[0-9]+$|^[1-9][0-9]{0,2}(?:,[0-9]{3})+$/.test(raw))found.add(Number(raw.replaceAll(',','')));\n          // note documents '-' as zero for the modern metrics. Do not apply it\n          // to pre-2021 impressions or missing/unavailable data.\n          else if(/^[-−–—]$/.test(raw) && start>='2021-05-01')found.add(0);\n          break;\n        }\n      }\n    }\n    if(found.size!==1 || !Number.isSafeInteger([...found][0]))return {state:'metrics',field:key};\n    values[key]=[...found][0];\n  }\n  const updated=[...header.matchAll(/(\\d{4}[\\/年.-]\\d{1,2}[\\/月.-]\\d{1,2}日?\\s+\\d{1,2}:\\d{2}(?::\\d{2})?)\\s*集計/g)].map(m=>m[1]);\n  const refText=text.split('記事の流入元').slice(1).join('記事の流入元'),referrers=[];\n  const pattern=/((?:[a-z0-9-]+\\.)+[a-z]{2,63}|no referrer|other|流入元不明|X|Facebook|Google|Instagram)\\s+(\\d+(?:\\.\\d+)?)\\s*%\\s*\\(\\s*([\\d,]+)\\s*PV\\s*\\)/gi;\n  for(const m of refText.matchAll(pattern)){\n    const count=Number(m[3].replaceAll(',','')),share=Number(m[2]),name=m[1];\n    if(Number.isSafeInteger(count)&&count>=0&&share>=0&&share<=100&&!referrers.some(r=>r.name===name))referrers.push({name,pageviews:count,share});\n  }\n  if(referrers.length>12)return {state:'referrers'};\n  return {state:'ready',start,end,...values,updated:updated.length===1?updated[0]:'',referrers,\n    referrersRead:referrers.length>0,signature:JSON.stringify([start,end,values,updated,referrers])};\n}",
  "boardPostURL16912": "function boardPostURL16912(value,owner) {\n  if(!/^[\\w-]{1,80}$/.test(owner||''))return null;\n  try {\n    const u=new URL(value,'https://note.com');\n    const match=/^\\/([\\w-]{1,80})\\/membership\\/boards\\/([a-z0-9]{1,64})\\/posts\\/([a-z0-9]{1,64})\\/?$/.exec(u.pathname);\n    return u.origin==='https://note.com' && !u.username && !u.password && match?.[1]===owner ? u.origin+u.pathname.replace(/\\/$/,'') : null;\n  }catch{return null;}\n}",
  "boardScreen16912": "function boardScreen16912(step,arg,postURL) {\n  if(location.origin!=='https://note.com' || !/^[\\w-]{1,80}$/.test(arg.owner||''))return {state:'page'};\n  const path=location.pathname.replace(/\\/$/,''),base='/'+arg.owner+'/membership';\n  const canonical=document.querySelector('link[rel=\"canonical\"]')?.href;\n  try {const u=new URL(canonical);if(u.origin!==location.origin || u.pathname.replace(/\\/$/,'')!==path)return {state:'canonical'};}catch{return {state:'canonical'};}\n  const visible=e=>!!e?.getClientRects().length && !e.closest('[hidden],[aria-hidden=\"true\"]');\n  const all=(root,sel)=>[...root.querySelectorAll(sel)].filter(visible);\n  const label=e=>(e.getAttribute('aria-label')||e.getAttribute('title')||e.innerText||'').trim();\n  const main=document.querySelector('main,[role=\"main\"]');if(!main)return {state:'page'};\n  const blocked=all(document,'[role=\"dialog\"],dialog[open]').length>0;\n  if(blocked)return {state:'dialog'};\n  if(step==='entry') {\n    if(path!==base)return {state:'page'};\n    const urls=all(main,'a[href]').filter(a=>/^(?:掲示板|掲示板を見る|すべての掲示板)$/.test(label(a))).map(a=>{\n      try{const u=new URL(a.href);return u.origin===location.origin && !u.username && !u.password && u.pathname.replace(/\\/$/,'')===base+'/boards'?u.origin+u.pathname:null;}catch{return null;}\n    }).filter(Boolean);\n    const found=[...new Set(urls)];return found.length===1?{state:'entry',url:found[0]}:{state:'missing'};\n  }\n  if(step==='list') {\n    if(path!==base+'/boards')return {state:'page'};\n    const posts=[...new Set(all(main,'a[href]').filter(a=>!a.closest('[data-testid*=\"comment\"],[class*=\"Comment\"],[class*=\"comment\"]'))\n      .map(a=>postURL(a.href,arg.owner)).filter(Boolean))].slice(0,8);\n    return {state:'list',posts};\n  }\n  const url=postURL(location.href,arg.owner);\n  if(!url || url!==arg.url)return {state:'page'};\n  // Require the actual post heading, author and timestamp together. Never take\n  // the first heart on the page or reuse a button handle after a navigation.\n  const headings=all(main,'h1');if(headings.length!==1 || !headings[0].innerText.trim())return {state:'post'};\n  const excluded='[data-testid*=\"comment\"],[class*=\"Comment\"],[class*=\"comment\"],[id*=\"comment\"],aside,nav,[role=\"dialog\"]';\n  const hearts=root=>all(root,'button,[role=\"button\"]').filter(b=>!b.closest(excluded) &&\n    (/^(?:投稿に)?スキ(?:する|をする|をつける|を取り消す|を取消す|済み)?$/.test(label(b)) ||\n      (b.getAttribute('aria-pressed')!==null && /like|スキ/i.test((b.getAttribute('class')||'')+' '+(b.querySelector('svg')?.getAttribute('aria-label')||'')))));\n  for(let root=headings[0].parentElement,depth=0;root && depth<9;root=root.parentElement,depth++) {\n    if(root!==main && !main.contains(root))break;\n    const buttons=hearts(root);\n    if(buttons.length>1)return {state:'ambiguous'};\n    const owners=[...new Set(all(root,'a[href]').filter(a=>!a.closest(excluded)).map(a=>{\n      try{const u=new URL(a.href);return u.origin===location.origin && !u.username && !u.password?/^\\/([\\w-]{1,80})\\/?$/.exec(u.pathname)?.[1]:null;}catch{return null;}\n    }).filter(Boolean))];\n    const times=all(root,'time[datetime]').filter(e=>!e.closest(excluded));\n    const dated=times.some(t=>{const n=Date.parse(t.getAttribute('datetime'));return Number.isFinite(n) && n>0 && n<=Date.now();});\n    if(buttons.length===1 && owners.length===1 && owners[0]===arg.owner && dated) {\n      const b=buttons[0],name=label(b),pressed=b.getAttribute('aria-pressed');\n      const conflict=pressed==='true'&&/スキ(?:する|をする|をつける)$/.test(name)||pressed==='false'&&/取り消す|取消す|済み/.test(name);\n      const liked=conflict?null:pressed==='true'||/取り消す|取消す|済み/.test(name)?true:\n        pressed==='false'||/スキ(?:する|をする|をつける)$/.test(name)?false:null;\n      if(step==='read'||step==='verify')return {state:'post',liked};\n      if(step!=='act'||liked!==false||b.disabled||b.getAttribute('aria-disabled')==='true')return {state:'unknown'};\n      b.click();return {state:'clicked'};\n    }\n    if(root===main)break;\n  }\n  return {state:'post_unidentified'};\n}",
  "outreachScreen16910": "async function outreachScreen16910(step,arg,freePrice) {\n  if(location.origin!=='https://note.com' || !/^[\\w-]{1,80}$/.test(arg.owner||''))return {state:'page'};\n  const visible=e=>!!e?.getClientRects().length && !e.closest('[hidden],[aria-hidden=\"true\"]');\n  const label=e=>(e.getAttribute('aria-label')||e.getAttribute('title')||e.innerText||e.value||'').trim();\n  const all=(root,s)=>[...root.querySelectorAll(s)].filter(visible);\n  const unique=a=>a.length===1?a[0]:null;\n  const buttons=root=>all(root,'button,[role=\"button\"],input[type=\"submit\"]');\n  const enabled=e=>e && !e.disabled && e.getAttribute('aria-disabled')!=='true';\n  const path=location.pathname.replace(/\\/$/,'');\n  const canonical=document.querySelector('link[rel=\"canonical\"]')?.href;\n  const samePage=()=>{try{const u=new URL(canonical);return u.origin===location.origin && u.pathname.replace(/\\/$/,'')===path;}catch{return false;}};\n  const link=e=>{try{const u=new URL(e.href,location.href);return u.origin===location.origin && !u.username && !u.password?u.href:null;}catch{return null;}};\n  const digest=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');\n  if(arg.kind==='qa'){\n    if(path!=='/qa/'+arg.owner || !samePage())return {state:'page'};\n    const main=document.querySelector('main,[role=\"main\"]');if(!main)return {state:'page'};\n    const roots=new Set();\n    for(const h of all(main,'h2')){\n      for(let root=h.parentElement,depth=0;root && root!==main && depth<7;root=root.parentElement,depth++){\n        if(all(root,'h2').length!==1)break;\n        const likes=buttons(root).filter(b=>/^(?:回答に)?スキ(?:する|をする|をつける|を取り消す|を取消す|済み)?$/.test(label(b)) ||\n          (b.hasAttribute('aria-pressed') && /like|スキ/i.test(b.className+' '+(b.querySelector('svg')?.getAttribute('aria-label')||''))));\n        if(likes.length===1 && all(root,'p').some(p=>p.innerText.trim().length>=12)){roots.add(root);break;}\n      }\n    }\n    const rows=[];\n    for(const root of [...roots].slice(0,20)){\n      const q=unique(all(root,'h2'));\n      const b=unique(buttons(root).filter(b=>/^(?:回答に)?スキ(?:する|をする|をつける|を取り消す|を取消す|済み)?$/.test(label(b)) ||\n        (b.hasAttribute('aria-pressed') && /like|スキ/i.test(b.className+' '+(b.querySelector('svg')?.getAttribute('aria-label')||'')))));\n      const answer=all(root,'p').filter(p=>!p.closest('button,nav,header,footer') && !q.contains(p)).map(p=>p.innerText.trim()).filter(Boolean).join('\\n');\n      if(!q||!b||!answer||answer.length>4000)continue;\n      const question=q.innerText.trim(),content=question+'\\n'+answer;\n      if(!question || content.length>6000)continue;\n      const pressed=b.getAttribute('aria-pressed'),name=label(b);\n      const conflict=pressed==='true'&&/スキ(?:する|をする|をつける)$/.test(name)||pressed==='false'&&/取り消す|取消す|済み/.test(name);\n      const liked=conflict?null:pressed==='true'||/取り消す|取消す|済み/.test(name)?true:pressed==='false'||/スキ(?:する|をする|をつける)$/.test(name)?false:null;\n      rows.push({hash:await digest(arg.owner+'\\n'+content),liked,eligible:/小説|詩|文学|文芸|読書|創作|物語|文章|執筆|作家|作品|本を読/.test(content) && !/スキ返|相互フォロー|参加希望|https?:\\/\\//.test(content),button:b});\n    }\n    if(step==='read')return {state:'ready',rows:rows.map(({button,...r})=>r)};\n    const row=unique(rows.filter(r=>r.hash===arg.hash));if(!row)return {state:'unknown'};\n    if(row.liked===true)return {state:'confirmed'};\n    if(step==='verify')return {state:row.liked===false?'off':'unknown'};\n    if(step!=='act' || !row.eligible || row.liked!==false || !enabled(row.button))return {state:'unknown'};\n    row.button.click();return {state:'clicked'};\n  }\n  if(arg.kind!=='member')return {state:'page'};\n  if(step==='entry'){\n    if(path!=='/'+arg.owner || !samePage())return {state:'page'};\n    const urls=[...new Set(all(document,'a[href]').filter(a=>/^メンバーシップ$/.test(label(a))).map(link).filter(h=>h && new URL(h).pathname.replace(/\\/$/,'')==='/'+arg.owner+'/membership'))];\n    return urls.length===1?{state:'entry',url:urls[0]}:{state:'missing'};\n  }\n  const native=document.querySelector('main,[role=\"main\"]');if(!native)return {state:'page'};\n  if(step==='plans' || step==='verify'){\n    if(path!=='/'+arg.owner+'/membership' || !samePage())return {state:'page'};\n    const cards=new Map();\n    for(const h of all(native,'h2,h3')){\n      const title=h.innerText.trim();if(!title||title.length>200)continue;\n      for(let root=h.parentElement,depth=0;root && root!==native && depth<6;root=root.parentElement,depth++){\n        if(all(root,'h2,h3').length!==1)break;\n        const text=root.innerText,joined=all(root,'button,[role=\"button\"],a,span,p').some(e=>/^(?:このプランに)?参加中$|^加入中$|^退会する$/.test(label(e)));\n        const links=all(root,'a[href]').filter(e=>label(e)==='参加手続きへ' && link(e));\n        const controls=buttons(root).filter(e=>label(e)==='参加手続きへ');\n        if(joined || links.length+controls.length===1){cards.set(root,{title,joined,free:freePrice(text),control:links[0]||controls[0]});break;}\n      }\n    }\n    if(step==='verify'){\n      const matching=[...cards.values()].filter(p=>p.title===arg.plan);\n      return matching.length===1?{state:matching[0].joined?(matching[0].free?'confirmed':'price_changed'):'off'}:{state:'unknown'};\n    }\n    // Do not replace an existing plan or join multiple plans of one owner.\n    if([...cards.values()].some(p=>p.joined))return {state:'already'};\n    const eligible=[...cards.values()].filter(p=>p.free && enabled(p.control));\n    if(!cards.size)return {state:'unknown'};\n    if(eligible.length>1)return {state:'unknown'};\n    if(!eligible.length)return {state:'no_free'};\n    const chosen=eligible[0];\n    if(!arg.open)return {state:'plan',plan:chosen.title};\n    if(chosen.title!==arg.plan)return {state:'changed'};\n    chosen.control.click();return {state:'opened'};\n  }\n  // Checkout must identify both the owner and the previously selected plan.\n  const dialogs=all(document,'[role=\"dialog\"],dialog[open]');\n  if(dialogs.length>1)return {state:'unknown'};\n  const scope=dialogs[0]||native;\n  const titles=all(scope,'h1,h2,h3,h4').filter(h=>h.innerText.trim()===arg.plan);\n  const ownerLinks=all(scope,'a[href]').filter(a=>link(a) && new URL(link(a)).pathname.replace(/\\/$/,'')==='/'+arg.owner);\n  if(!titles.length||!ownerLinks.length||!freePrice(scope.innerText))return {state:'price'};\n  if(all(scope,'input,textarea,select').some(e=>!e.disabled && (e.matches('textarea,select') ||\n    !['checkbox','radio','hidden','submit','button'].includes(e.type||'text'))))return {state:'input'};\n  const checks=all(scope,'input[type=\"checkbox\"],[role=\"checkbox\"]');\n  const checkLabel=e=>(e.getAttribute('aria-label')||[...(e.labels||[])].map(l=>l.textContent).join(' ')||e.parentElement?.innerText||'').trim();\n  const following=checks.filter(e=>/^(?:このクリエイターを|クリエイターを|参加と同時に)?フォローする$/.test(checkLabel(e)));\n  if(following.length>1)return {state:'follow'};\n  const checked=e=>e.matches('input')?(e.indeterminate?null:e.checked):e.getAttribute('aria-checked')==='true'?true:e.getAttribute('aria-checked')==='false'?false:null;\n  if(checks.some(e=>!following.includes(e)&&(e.required||checked(e)!==false)))return {state:'input'};\n  if(following.length && checked(following[0])!==false && arg.wasFollowing!==true){\n    if(step==='nofollow' && checked(following[0])===true && enabled(following[0])){following[0].click();return {state:'changed'};}\n    return {state:'follow'};\n  }\n  // With no explicit opt-out, only an already-followed owner is eligible.\n  if(arg.wasFollowing!==true && !(following.length===1 && checked(following[0])===false))return {state:'follow'};\n  const submit=unique(buttons(scope).filter(b=>/^(?:無料で)?参加する$/.test(label(b))));\n  if(!enabled(submit))return {state:'unknown'};\n  const signature=JSON.stringify([arg.owner,arg.plan,scope.innerText.replace(/\\s+/g,' '),following.length,following[0]?checked(following[0]):null]);\n  if(step==='check')return {state:'ready',signature};\n  if(step!=='act' || signature!==arg.signature)return {state:'changed'};\n  submit.click();return {state:'clicked'};\n}",
  "membershipPrice16910": "function membershipPrice16910(raw) {\n  if(typeof raw!=='string' || raw.length>6000)return false;\n  const text=raw.normalize('NFKC').replace(/[ \\t\\u00a0]+/g,' ');\n  if(/初月|初回|お試し|無料体験|無料期間|トライアル|クーポン|割引|返金|キャッシュバック|ポイント還元|期間限定|無料招待|有料|翌月|次月|(?:ヶ月|か月|ヵ月|日間|週間|年間|年|半年)無料|無料.{0,12}(?:終了|期間後)|フォロー必須|フォローが必要|フォローしてください|自動的にフォロー|自動フォロー/.test(text))return false;\n  // A marketing mention of \"無料\" is never a regular monthly price.\n  const regular=/(?:^|\\n)\\s*(?:(?:月額|会費|月会費|通常料金|通常会費)\\s*[:：]?\\s*0\\s*円|[¥￥]\\s*0\\s*(?:\\/|／)\\s*月|0\\s*円\\s*(?:\\/|／)\\s*月)\\s*(?:[（(]税込[）)])?\\s*(?:$|\\n)/m.test(text);\n  if(!regular)return false;\n  for(const m of text.matchAll(/(?:[¥￥]\\s*([\\d,]+(?:\\.\\d+)?)|([\\d,]+(?:\\.\\d+)?)\\s*円)/g))if(Number((m[1]||m[2]).replaceAll(',',''))!==0)return false;\n  return true;\n}",
  "relationship16910": "async function relationship16910(owner,author) {\n  if(location.origin!=='https://note.com' || !/^[\\w-]{1,80}$/.test(owner))return null;\n  try{\n    const r=await fetch('/api/v2/creators/'+encodeURIComponent(owner),{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(4500)});\n    if(!r.ok)return null;\n    const j=await r.json(),d=j.data??j;\n    if(d.urlname!==owner || String(d.id)!==author)return null;\n    const values=[d.isFollowing,d.is_following].filter(v=>typeof v==='boolean');\n    return values.length && values.every(v=>v===values[0])?values[0]:null;\n  }catch{return null;}\n}",
  "articleReactionForm": "function articleReactionForm(step, titles) {\n  if (location.origin !== 'https://note.com' || location.pathname.replace(/\\/$/,'') !== '/settings/reactions/like/note') return {state:'page'};\n  const visible = el => el.getClientRects().length > 0 && !el.closest('[hidden],[aria-hidden=\"true\"]');\n  const name = el => (el.getAttribute('aria-label') || el.textContent || el.value || el.title || '').trim();\n  const root = document.querySelector('[role=\"dialog\"]') || document.querySelector('main,[role=\"main\"]') || document.body;\n  if (!root || !/スキのお礼/.test(root.innerText) || !/記事にスキ/.test(root.innerText)) return {state:'page'};\n  const controls = el => [...el.querySelectorAll('button,[role=\"button\"],input[type=\"submit\"],a[href=\"#\"]')].filter(visible);\n  const selected = [...root.querySelectorAll('[role=\"tab\"][aria-selected=\"true\"],a[aria-current=\"page\"]')].filter(visible);\n  if (selected.some(el => /コメントにスキ|掲示板.*スキ/.test(name(el)))) return {state:'page'};\n  const pane = [...root.querySelectorAll('[role=\"tabpanel\"]')].filter(visible);\n  if (pane.length > 1) return {state:'page'};\n  const scope = pane[0] || root;\n  const saves = controls(root).filter(el=>/^保存(する)?$/.test(name(el)));\n  if (saves.length !== 1) return {state:'page'};\n  const fields = [...scope.querySelectorAll('textarea,input[type=\"text\"],input:not([type])')].filter(el =>\n    visible(el) && !el.closest('header,nav,[role=\"search\"]') && !el.readOnly && !el.disabled);\n  if (fields.length > 10 || fields.some(el => !/お礼|リアクション|メッセージ|ありがとう|スキ/.test(\n    [el.placeholder,el.getAttribute('aria-label'),el.name,...Array.from(el.labels || [],name)].join(' ')) &&\n    !(el.maxLength > 0 && el.maxLength <= 50) && el.tagName !== 'TEXTAREA')) return {state:'page'};\n  const add = controls(scope).filter(el => /^(?:[+＋]\\s*)?(?:(?:新し[いく]|他の|別の|もう1つの)?(?:スキの)?(?:お礼(?:メッセージ)?|メッセージ|リアクション)(?:を|の)?)?追加(?:する)?(?:[（(][^()（）]*[）)])?$/.test(name(el)));\n  if (!fields.length && add.length !== 1) return {state:'page'};\n  // Look for a selected reaction image inside each message card. Ignore site navigation and stock illustrations.\n  const media = [];\n  for (const field of fields) {\n    for (let row=field.parentElement; row && row!==root.parentElement; row=row.parentElement) {\n      if (fields.filter(f=>row.contains(f)).length !== 1) break;\n      const remove = controls(row).filter(b=>/^(?:設定した|登録した)?(?:画像|お礼画像)(?:を|の)?(?:削除|解除)(?:する)?$/.test(name(b)));\n      if (remove.length === 1) {media.push(remove[0]);break;}\n      const image = [...row.querySelectorAll('img[src]')].some(img=>visible(img) &&\n        (/^blob:|\\/uploads\\/|\\/production\\/uploads\\//.test(img.currentSrc || img.src)) &&\n        !img.closest('header,nav,a') && !/アイコン|サンプル|アバター/.test(img.alt));\n      if (image) {media.push(null);break;}\n      if (row===scope || row===root) break;\n    }\n  }\n  const limits = fields.map(el=>el.maxLength).filter(n=>n>0);\n  const lengthHint = (scope.innerText || '').match(/(\\d{1,3})\\s*(?:文字|字)以内/);\n  if(lengthHint && Number(lengthHint[1])>0)limits.push(Number(lengthHint[1]));\n  const limit = limits.length ? Math.min(...limits) : 35;\n  const values = fields.map(el=>el.value);\n  const active = values.filter(Boolean);\n  const sorted = [...titles].sort();\n  const same = active.length===titles.length && [...active].sort().every((v,i)=>v===sorted[i]);\n  if (step==='read') return {state:'ready',same:same && !media.length,limit,signature:JSON.stringify([values,media.length])};\n  if (titles.some(v=>v.length>limit)) return {state:'limit',limit};\n  if (media.length) {\n    if (!media[0] || step!=='edit') return {state:'image'};\n    media[0].click();return {state:'more'};\n  }\n  const filled = titles.every((v,i)=>values[i]===v) && values.slice(titles.length).every(v=>!v);\n  if (step==='save') {\n    if (!filled || saves[0].disabled || saves[0].getAttribute('aria-disabled')==='true') return {state:'page'};\n    saves[0].click();return {state:'sent'};\n  }\n  if (step!=='edit') return {state:'page'};\n  // Fill existing slots before adding another. Some screens enable Add only after text input.\n  for (const [i,el] of fields.entries()) {\n    const next = titles[i] || '';\n    if (el.value === next) continue;\n    const proto = el.tagName==='TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;\n    Object.getOwnPropertyDescriptor(proto,'value').set.call(el,next);\n    el.dispatchEvent(new Event('input',{bubbles:true}));\n    el.dispatchEvent(new Event('change',{bubbles:true}));\n  }\n  if (fields.length < titles.length) {\n    if (add.length!==1) return {state:'page'};\n    if (!add[0].disabled && add[0].getAttribute('aria-disabled')!=='true') add[0].click();\n    return {state:'more'};\n  }\n  return {state:'filled'};\n}",
  "readDraftCover": "async function readDraftCover(key,accountId,hashBody) {\n  if(location.origin!=='https://note.com' || !/^n[a-z0-9]{1,64}$/.test(key))return null;\n  try {\n    const r=await fetch('/api/v3/notes/'+key,{credentials:'same-origin',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(4500)});\n    if(!r.ok)return null;\n    const n=(await r.json())?.data;\n    if(!n || n.key!==key)return null;\n    if(n.user?.urlname && n.user.urlname!=='43__' || n.user?.id && String(n.user.id)!==accountId || ['published','reserved','scheduled'].includes(n.status) ||\n       [n.scheduledPublishAt,n.scheduled_publish_at,n.publishAt,n.publish_at].some(t=>t && Date.parse(t)>Date.now()))return {unsafe:true};\n    if(n.status!=='draft' || n.user?.urlname!=='43__' || String(n.user.id)!==accountId)return null;\n    const full=n.is_limited!==true && n.is_paid!==true && !(Number(n.price)>0);\n    return {name:n.name,hash:full?await hashBody(n.body):null,...(Object.hasOwn(n,'eyecatch')?{cover:n.eyecatch}:{})};\n  }catch{return null;}\n}",
  "draftBodyHash": "async function draftBodyHash(body){\n  if(typeof body!=='string' || !body.trim() || body.length>2500000)return null;\n  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body));\n  return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');\n}",
  "noteJoinDOM520": "function noteJoinDOM520(step,arg) {\n  if(location.origin!=='https://note.com' || location.pathname.replace(/\\/$/,'')!=='/'+arg.owner+'/n/'+arg.article)return {state:'page'};\n  const canonical=document.querySelector('link[rel=\"canonical\"]')?.href;\n  if(!canonical || new URL(canonical).origin!==location.origin || new URL(canonical).pathname.replace(/\\/$/,'')!==location.pathname.replace(/\\/$/,''))return {state:'page'};\n  const visible=e=>e.getClientRects().length>0 && !e.closest('[hidden],[aria-hidden=true]');\n  const name=e=>(e.getAttribute('aria-label')||e.innerText||e.value||'').trim();\n  const fields=[...document.querySelectorAll('textarea')].filter(e=>visible(e) && !e.disabled && !e.readOnly && /コメント/.test([e.placeholder,e.getAttribute('aria-label'),...Array.from(e.labels||[],l=>l.textContent)].join(' ')));\n  if(fields.length!==1)return {state:'composer'};\n  const field=fields[0];\n  const nodes=[...document.querySelectorAll('[data-comment-id],[data-testid=\"comment-item\"],.m-comment,.o-commentList__item,.m-commentList__item')].filter(visible);\n  const cards=nodes.filter(n=>!nodes.some(other=>other!==n && other.contains(n)));\n  for(const card of cards) {\n    const own=[...card.querySelectorAll('a[href]')].some(a=>{try{const u=new URL(a.href);return u.origin===location.origin && u.pathname.replace(/\\/$/,'')==='/43__';}catch{return false;}});\n    if(own && /参加(?:を)?希望|参加したい|招待/.test(card.innerText))return {state:'existing'};\n  }\n  const load=[...document.querySelectorAll('button,a,[role=button]')].filter(e=>visible(e) && /^(?:もっと見る|さらに表示|コメントをすべて見る|すべてのコメントを表示|以前のコメントを表示|次のコメント)$/.test(name(e)) &&\n    (e.closest('[class*=\"comment\"],[class*=\"Comment\"],[data-testid*=\"comment\"]')));\n  if(step==='more' && load.length===1){load[0].click();return {state:'loading'};}\n  // An incomplete comment history cannot establish that this account has not already applied.\n  if(!Number.isSafeInteger(arg.count) || arg.count<0 || cards.length!==arg.count || load.length)return {state:'history'};\n  if(step==='read')return {state:'ready'};\n  let scope=field.closest('form')||field.parentElement;\n  let buttons=[];\n  for(let depth=0;scope && depth<5;depth++,scope=scope.parentElement) {\n    if(scope.querySelectorAll('textarea').length!==1)break;\n    buttons=[...scope.querySelectorAll('button,input[type=submit],[role=button]')].filter(e=>visible(e) && name(e)==='送信');\n    if(buttons.length)break;\n  }\n  if(buttons.length!==1 || field.closest('[role=dialog]'))return {state:'composer'};\n  if(step==='fill') {\n    if(field.value && field.value!==arg.comment)return {state:'draft'};\n    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,arg.comment);\n    field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));\n    return {state:'filled'};\n  }\n  if(step==='send') {\n    if(field.value!==arg.comment || buttons[0].disabled || buttons[0].getAttribute('aria-disabled')==='true')return {state:'composer'};\n    buttons[0].click();return {state:'clicked'};\n  }\n  return {state:'page'};\n}",
  "joinFollowDOM520": "function joinFollowDOM520(owner,action) {\n  if(location.origin!=='https://note.com' || location.pathname.replace(/\\/$/,'')!=='/'+owner)return 'page';\n  const canonical=document.querySelector('link[rel=canonical]')?.href;\n  if(!canonical || new URL(canonical).origin!==location.origin || new URL(canonical).pathname.replace(/\\/$/,'')!=='/'+owner)return 'page';\n  const visible=e=>e.getClientRects().length>0 && !e.closest('[hidden],[aria-hidden=true]');\n  const name=e=>(e.getAttribute('aria-label')||e.textContent||'').trim();\n  const roots=[...document.querySelectorAll('[data-testid=\"creator-header\"],.o-creatorProfile,.o-creatorHeader,.m-creatorProfile,header')].filter(e=>visible(e)&&e.querySelector('h1,h2'));\n  const controls=[...new Set(roots.flatMap(root=>[...root.querySelectorAll('button')]).filter(e=>visible(e)&&['フォロー','フォローする','フォロー中'].includes(name(e))))];\n  if(controls.length!==1)return 'missing';\n  const b=controls[0];\n  if(name(b)==='フォロー中')return 'on';\n  if(b.disabled || b.getAttribute('aria-disabled')==='true')return 'disabled';\n  // This function is deliberately read-only, regardless of action.\n  return 'off';\n}",
  "tutaScreen520": "async function tutaScreen520(step,arg={}) {\n  if(location.origin!=='https://app.tuta.com')return {state:'outside'};\n  const visible=e=>!!e?.getClientRects().length && !e.closest('[hidden],[aria-hidden=\"true\"]');\n  const all=(selector,root=document)=>[...root.querySelectorAll(selector)].filter(visible);\n  const name=e=>(e.getAttribute('aria-label')||e.innerText||e.textContent||e.value||'').trim();\n  const label=e=>[e.getAttribute('aria-label'),e.getAttribute('placeholder'),e.name,\n    ...(e.getAttribute('aria-labelledby')||'').split(/\\s+/).filter(Boolean).map(id=>document.getElementById(id)?.textContent),\n    ...Array.from(e.labels||[],name)].filter(Boolean).join(' ');\n  const unique=xs=>xs.length===1?xs[0]:null;\n  const input=(e,v)=>{\n    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,v);\n    e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));\n  };\n  const buttons=(root=document)=>all('button,[role=\"button\"],input[type=\"submit\"]',root).filter(e=>!e.disabled && e.getAttribute('aria-disabled')!=='true');\n  const passwords=all('input[type=\"password\"]').filter(e=>!e.disabled);\n  const emails=all('input[type=\"email\"],input[autocomplete=\"username\"],input[type=\"text\"]')\n    .filter(e=>!e.disabled && (e.type==='email'||e.autocomplete==='username'||/e-?mail|メールアドレス/i.test(label(e))));\n  const otp=all('input').filter(e=>!e.disabled && e.type!=='hidden' && (e.autocomplete==='one-time-code'||/TOTP|authentication code|認証コード|authentifizierungscode/i.test(label(e))));\n  const captcha=all('iframe[src*=\"captcha\"],input[name*=\"captcha\"]');\n  if(captcha.length)return {state:'challenge'};\n  if(['login','loginReady','loginSubmit'].includes(step)) {\n    if(!/^\\/(?:login)?\\/?$/.test(location.pathname))return {state:'outside'};\n    const email=unique(emails),pass=unique(passwords.filter(e=>!otp.includes(e)));\n    if(!email||!pass)return {state:'page',reason:'login_fields'};\n    if(step==='login'){\n      input(email,arg.email);input(pass,arg.password);\n      return email.value===arg.email&&pass.value===arg.password?{state:'filled'}:{state:'page',reason:'login_values'};\n    }\n    const submit=unique(buttons().filter(e=>/^(?:log\\s?in|sign in|ログイン|anmelden)$/i.test(name(e))));\n    if(email.value!==arg.email||!pass.value)return {state:'page',reason:'login_values'};\n    if(!submit)return {state:'page',reason:'login_button'};\n    if(step==='loginReady')return {state:'ready'};\n    submit.click();return {state:'sent'};\n  }\n  if(['otp','otpReady','otpSubmit'].includes(step)) {\n    const field=unique(otp),root=field?.closest('[role=\"dialog\"],dialog,form')||document;\n    if(!field)return {state:'challenge'};\n    if(step==='otp'){\n      if(!/^\\d{6}$/.test(arg.code||''))return {state:'challenge'};\n      input(field,arg.code);return {state:'filled'};\n    }\n    const submit=unique(buttons(root).filter(e=>/^(?:verify|confirm|ok|log\\s?in|確認|認証|ログイン|bestätigen)$/i.test(name(e))));\n    if(!/^\\d{6}$/.test(field.value))return {state:'page',reason:'otp_values'};\n    if(!submit)return {state:'page',reason:'otp_button'};\n    if(step==='otpReady')return {state:'ready'};\n    submit.click();return {state:'sent'};\n  }\n  if(otp.length)return {state:'otp'};\n  if(passwords.length && emails.length)return {state:'login'};\n\n  // Mithril stores its vnode tree on its mount element. Walk only vnode edges;\n  // email HTML and DOM attributes cannot create an application model here.\n  const queue=[];\n  for(const el of [document.documentElement,document.body,...Array.from(document.querySelectorAll('div')).slice(0,300)]) {\n    const nodes=Object.getOwnPropertyDescriptor(el||{},'vnodes')?.value;\n    if(Array.isArray(nodes))queue.push(...nodes);\n  }\n  const seen=new Set(),models=new Set();\n  for(let i=0;i<queue.length && i<12000;i++) {\n    const node=queue[i];if(!node||typeof node!=='object'||seen.has(node))continue;seen.add(node);\n    for(const container of [node.attrs,node.state]) {\n      const model=container?.mailViewModel;\n      if(model && typeof model.onSingleSelection==='function' && typeof model.getConversationViewModel==='function' && model.listModel)models.add(model);\n    }\n    if(node.instance)queue.push(node.instance);\n    if(Array.isArray(node.children))queue.push(...node.children);\n  }\n  const model=unique([...models]);if(!model)return {state:'page',reason:models.size?'model_ambiguous':'model_missing'};\n  const list=model.listModel;\n  if(!list)return {state:'loading'};\n  // Only the trusted application's selected mailbox model supplies mail data.\n  // Older stream-based state and wrapped rows coexist with newer mails getters.\n  const read=(object,name)=>{try{return object?.[name];}catch{return undefined;}};\n  let state=read(list,'state');\n  if(typeof state==='function'){try{state=state.call(list);}catch{state=null;}}\n  const direct=read(list,'mails'),visibleItems=read(list,'items');\n  const raw=Array.isArray(direct)?direct:Array.isArray(state?.items)?state.items:Array.isArray(visibleItems)?visibleItems:null;\n  if(!raw)return {state:!state&&!direct&&!visibleItems?'loading':'page',reason:'list_contract'};\n  const mailValue=value=>{\n    const valid=m=>Array.isArray(m?._id)&&m._id.length===2 && m._id.every(x=>typeof x==='string'&&x.length<200) &&\n      typeof m.subject==='string' && typeof m.sender?.address==='string' && Number.isFinite(new Date(m.receivedDate).getTime());\n    if(valid(value))return value;\n    // No recursive scan through mail bodies, attachments or untrusted HTML.\n    if(valid(value?.mail))return value.mail;\n    return null;\n  };\n  const items=raw.map(mailValue).filter(Boolean);\n  let complete=false,legacy=false;\n  if(typeof list.isLoadedCompletely==='function'){\n    const done=list.isLoadedCompletely();\n    if(typeof done!=='boolean')return {state:'page',reason:'list_contract'};\n    complete=done;legacy=Array.isArray(state?.items);\n  }else if(typeof list.isEmptyAndDone==='function'){\n    const empty=list.isEmptyAndDone();\n    if(typeof empty!=='boolean'||empty&&raw.length)return {state:'page',reason:'list_contract'};\n    complete=empty;\n  }\n  if(raw.length && !items.length)return {state:'page',reason:'list_contract'};\n  if(items.length!==raw.length)complete=false;\n\n  // Locate the signed-in controller through the trusted application's own model\n  // dependencies. Never infer identity from text in an email or a screen label.\n  const dependencies=[{object:model,depth:0}],checked=new Set();let identity=false,wrong=false;\n  for(let i=0;i<dependencies.length && i<600;i++) {\n    const {object,depth}=dependencies[i];\n    if(!object || typeof object!=='object' || checked.has(object) || object instanceof Node)continue;\n    checked.add(object);\n    if(typeof object.getUserController==='function') {\n      try{\n        const email=object.getUserController()?.userGroupInfo?.mailAddress;\n        if(typeof email==='string'){if(email.toLowerCase()===arg.email)identity=true;else wrong=true;}\n      }catch{}\n    }\n    if(depth<4)for(const descriptor of Object.values(Object.getOwnPropertyDescriptors(object))) {\n      if(descriptor.value && typeof descriptor.value==='object')dependencies.push({object:descriptor.value,depth:depth+1});\n    }\n  }\n  if(wrong || !identity)return {state:'identity',reason:wrong?'account_mismatch':'account_unconfirmed'};\n  if(!items.length && !complete)return {state:'loading'};\n  const key=mail=>Array.isArray(mail?._id)&&mail._id.length===2 && mail._id.every(v=>typeof v==='string' && v.length<200)?JSON.stringify(mail._id):null;\n  const sender=address=>typeof address==='string' && /^[^@<>\\s,;]+@(?:[a-z0-9-]+\\.)?note\\.(?:com|mu)$/i.test(address);\n  const date=mail=>new Date(mail.receivedDate).getTime();\n  const recent=mail=>Number.isFinite(date(mail)) && date(mail)>=arg.since && date(mail)<=Date.now();\n  const candidates=items.filter(mail=>key(mail) && recent(mail) && sender(mail.sender?.address) && /招待|invitation|invited/i.test(mail.subject||''));\n  if(step==='list')return {state:'ready',items:candidates.map(mail=>({key:key(mail),received:date(mail)})),\n    // mails in the current model are not ordered by receivedDate. Never declare\n    // the inbox exhausted merely because a grouped/unsorted old mail is present.\n    complete:complete || (legacy && items.length===raw.length && items.every((mail,i)=>Number.isFinite(date(mail)) && (!i || date(items[i-1])>=date(mail))) && items.some(mail=>date(mail)<arg.since))};\n  if(step==='more') {\n    if(typeof list.loadMore!=='function')return {state:'page'};\n    const before=items.map(mail=>key(mail)).join('|');\n    await list.loadMore();\n    let state=read(list,'state');\n    if(typeof state==='function')state=state.call(list);\n    const direct=read(list,'mails');\n    const next=Array.isArray(direct)?direct:Array.isArray(state?.items)?state.items:read(list,'items');\n    const finished=typeof list.isLoadedCompletely==='function'?list.isLoadedCompletely()===true:\n      typeof list.isEmptyAndDone==='function'?list.isEmptyAndDone()===true:false;\n    if(finished)return {state:'loaded'};\n    return Array.isArray(next) && next.map(mailValue).filter(Boolean).map(mail=>key(mail)).join('|')!==before?{state:'loaded'}:{state:'unchanged'};\n  }\n  if(step==='open') {\n    const mail=unique(candidates.filter(mail=>key(mail)===arg.key));\n    if(!mail)return {state:'changed'};\n    await model.onSingleSelection(mail);return {state:'opened'};\n  }\n  if(step!=='read')return {state:'page'};\n  const view=model.getConversationViewModel()?.primaryViewModel?.();\n  if(!view || key(view.mail)!==arg.key || !recent(view.mail) || typeof view.getMailBody!=='function' ||\n    typeof view.getSanitizedMailBody!=='function' || typeof view.mustRenderFailureBanner!=='function' ||\n    typeof view.isWarningDismissed!=='function' || typeof view.didErrorsOccur!=='function')return {state:'loading'};\n  if(!view.mailDetails || !view.getSanitizedMailBody())return {state:'loading'};\n  // None == 0 in FailureBannerType. With loaded mailDetails and no dismissed\n  // warning, this requires Tuta's positive authenticated-sender result.\n  if(view.isWarningDismissed()!==false || view.mustRenderFailureBanner()!==0 || view.didErrorsOccur()!==false)return {state:'untrusted'};\n  const from=view.getSender?.()?.address,displayed=view.getDisplayedSender?.()?.address;\n  if(!sender(from) || typeof displayed!=='string' || from.toLowerCase()!==displayed.toLowerCase())return {state:'untrusted'};\n  const recipients=[...(view.getToRecipients?.()||[]),...(view.getCcRecipients?.()||[]),...(view.getBccRecipients?.()||[])];\n  if(!recipients.some(r=>typeof r.address==='string' && r.address.toLowerCase()===arg.email))return {state:'recipient'};\n  const fragment=view.getSanitizedMailBody(),body=fragment.textContent||'',text=(view.getSubject?.()||'')+'\\n'+body;\n  if(text.length>60000 || !/共同運営/.test(body) || !/招待/.test(body))return {state:'irrelevant'};\n  const links=[...fragment.querySelectorAll('a[href]')].map(a=>a.getAttribute('href'))\n    .concat(Array.from(text.matchAll(/https:\\/\\/note\\.com\\/[^\\s<>\"']+/g),m=>m[0]))\n    .filter(raw=>{try{const u=new URL(raw);return u.origin==='https://note.com'&&!u.username&&!u.password && raw.length<=6000;}catch{return false;}});\n  return {state:'mail',key:arg.key,received:date(view.mail),text,links:[...new Set(links)].slice(0,24),authenticated:true};\n}",
  "readerScreen1697": "async function readerScreen1697(step,arg) {\n  if(location.origin!=='https://note.com' || location.pathname.replace(/\\/$/,'')!=='/'+arg.owner+'/n/'+arg.key)return {state:'page'};\n  let canonical;\n  try{canonical=new URL(document.querySelector('link[rel=\"canonical\"]')?.href);}catch{return {state:'loading'};}\n  if(canonical.origin!==location.origin || canonical.pathname.replace(/\\/$/,'')!==location.pathname.replace(/\\/$/,''))return {state:'page'};\n  if(step==='ready')return {state:'ready'};\n  const visible=e=>!!e?.getClientRects().length && !e.closest('[hidden],[aria-hidden=\"true\"]');\n  const label=e=>(e.getAttribute('aria-label')||e.getAttribute('title')||e.innerText||'').replace(/\\s+/g,' ').trim();\n  const owner=a=>{try{const u=new URL(a.href);return u.origin===location.origin && /^\\/([\\w-]{1,80})\\/?$/.exec(u.pathname)?.[1]||'';}catch{return '';}};\n  const all=(root,selector)=>[...root.querySelectorAll(selector)].filter(visible);\n  const controls=root=>all(root,'button,[role=\"button\"]');\n  const unique=items=>[...new Set(items)];\n  // Count and action are distinct controls; never toggle the article heart to open readers.\n  const excluded='[data-testid=\"note-body\"],.note-common-styles,nav,aside,[data-testid=\"note-card\"],.m-noteSmall';\n  const rowSelector='[data-comment-id],[data-testid=\"comment-item\"],.m-comment,.o-comment,.o-commentList__item,.m-commentList__item,.o-comment__item,[class*=\"CommentItem_\"],[class*=\"CommentItem__\"],[class*=\"commentItem_\"],[class*=\"commentList__item\"]';\n  const roots=all(document,rowSelector).filter(e=>!e.closest(excluded)).filter((r,i,rs)=>!rs.some(other=>other!==r && r.contains(other) && other.innerText===r.innerText));\n  const rows=[];\n  for(const root of roots.slice(0,24)){\n    const local=e=>e.closest(rowSelector)===root;\n    const authorNodes=all(root,'[data-testid=\"comment-author\"] a[href],a[data-testid=\"comment-author\"],.m-comment__author a[href],.o-comment__author a[href],[class*=\"comment\" i][class*=\"author\" i] a[href],[class*=\"comment\" i][class*=\"userName\" i] a[href]');\n    const bodies=all(root,'[data-testid=\"comment-body\"],[data-testid=\"comment-text\"],.m-comment__body,.m-comment__text,.o-comment__body,.o-comment__text,.m-commentList__body,.m-commentList__text,.o-commentList__body,.o-commentList__text,[class*=\"commentBody\"],[class*=\"CommentBody\"],[class*=\"commentText\"],[class*=\"CommentText\"]').filter(local);\n    const names=unique((authorNodes.length?authorNodes:all(root,'a[href]').filter(a=>!bodies.some(b=>b.contains(a)))).filter(local).map(owner).filter(Boolean));\n    const texts=unique(bodies.map(e=>(e.innerText||'').trim()).filter(Boolean));\n    if(names.length!==1 || texts.length!==1 || texts[0].length>2000)continue;\n    const text=texts[0],name=names[0];\n    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(name+'\\n'+text))),b=>b.toString(16).padStart(2,'0')).join('');\n    const likes=controls(root).filter(b=>local(b) && /^(?:コメントに)?スキ(?:する|をする|をつける|を取り消す|を取消す|を解除|済み)?(?:\\s*[\\d,]+)?$/.test(label(b)));\n    const button=likes.length===1?likes[0]:null;\n    let liked=null;\n    if(button){\n      const pressed=button.getAttribute('aria-pressed'),n=label(button);\n      // Contradictory accessibility state cannot authorize a write.\n      if(pressed==='true' && /スキ(?:する|をする|をつける)/.test(n) || pressed==='false' && /取り消す|取消す|解除|済み/.test(n))liked=null;\n      else if(pressed==='true'||/取り消す|取消す|解除|済み/.test(n))liked=true;\n      else if(pressed==='false'||/スキ(?:する|をする|をつける)/.test(n))liked=false;\n    }\n    const eligible=text.length>=20 && /読|文章|描写|物語|主人公|登場人物|余韻|ラスト|結末|表現/.test(text) &&\n      !/https?:|www\\.|フォロ[ーバ]|スキ返|相互|参加希望|招待|勧誘|死ね|殺す/.test(text);\n    rows.push({owner:name,hash,liked,eligible,button});\n  }\n  const clean=r=>r.map(({button,...row})=>row);\n  const dialogs=unique(all(document,'[role=\"dialog\"],dialog[open],[aria-modal=\"true\"],.m-modal,.o-modal,[class*=\"Modal__content\"],[class*=\"modal__content\"]'));\n  const likerTitle=/^(?:この記事に)?スキ(?:(?:を)?した(?:人|ユーザー|クリエイター)(?:の一覧)?|の一覧|一覧)(?:\\s*[（(]?\\s*[\\d,]+\\s*(?:人|件)?\\s*[）)]?)?$/;\n  const modals=dialogs.filter(d=>{\n    const headings=all(d,'h1,h2,h3,[role=\"heading\"]');\n    return likerTitle.test(label(d)) || headings.some(h=>likerTitle.test(label(h))) ||\n      likerTitle.test((d.innerText||'').split('\\n').map(s=>s.trim()).find(Boolean)||'');\n  }).filter((r,i,rs)=>!rs.some(other=>other!==r && r.contains(other)));\n  const modal=modals.length===1?modals[0]:null;\n  const commentLists=all(document,'[data-testid=\"comment-list\"],.o-commentList,.m-commentList,[class*=\"CommentList_\"],[class*=\"commentList_\"]').filter(e=>!e.closest(excluded));\n  const commentBusy=commentLists.some(e=>e.getAttribute('aria-busy')==='true'||all(e,'[role=\"progressbar\"],[aria-busy=\"true\"]').length>0);\n  const emptyComments=!roots.length&&!commentBusy&&commentLists.some(e=>(e.innerText||'').split('\\n').some(line=>/^(?:まだ)?コメント(?:は|が)?(?:ありません[。！!]?|0件)$/.test(line.trim())));\n  if(step==='comments')return {state:commentBusy?'loading':'ready',rows:clean(rows),empty:emptyComments,roots:roots.length,lists:commentLists.length};\n  if(step==='closeComments'){\n    const comments=dialogs.filter(d=>all(d,'h1,h2,h3,[role=\"heading\"]').some(h=>/^コメント(?:\\s*[（(]?\\d+[）)]?)?$/.test(label(h))));\n    if(!comments.length)return {state:'ready'};\n    const leaves=comments.filter(d=>!comments.some(x=>x!==d&&d.contains(x)));\n    if(leaves.length!==1)return {state:'ambiguous'};\n    const close=controls(leaves[0]).filter(b=>/^(?:閉じる|とじる|close)$/i.test(label(b))&&!b.closest(rowSelector));\n    if(close.length!==1||close[0].disabled)return {state:'missing'};\n    close[0].click();return {state:'closed'};\n  }\n  if(step==='verify'||step==='like'){\n    const found=rows.filter(r=>r.owner===arg.commentOwner && r.hash===arg.hash);\n    if(found.length!==1)return {state:'missing'};\n    const r=found[0];if(r.liked===true)return {state:'liked'};\n    if(step==='verify')return {state:r.liked===false?'off':'unknown'};\n    if(!r.eligible || r.liked!==false || !r.button || r.button.disabled || r.button.getAttribute('aria-disabled')==='true')return {state:'unknown'};\n    r.button.click();return {state:'clicked'};\n  }\n  if(step==='openComments'){\n    if(roots.length||emptyComments)return {state:'ready'};\n    const options=controls(document).filter(b=>/^(?:コメント(?:欄)?(?:を見る|を表示|をすべて見る)?|コメント\\s*[（(]?\\d+\\s*(?:件)?[）)]?|\\d+\\s*コメント)$/.test(label(b)) && !b.closest(rowSelector) && !b.closest(excluded));\n    if(!options.length)return {state:'missing'};\n    if(new Set(options.map(label)).size!==1)return {state:'ambiguous'};\n    if(options[0].disabled || options[0].getAttribute('aria-disabled')==='true')return {state:'loading'};\n    options[0].scrollIntoView?.({block:'center'});options[0].click();return {state:'opened'};\n  }\n  if(step==='openLikers'){\n    if(modal)return {state:'ready'};\n    const explicit=controls(document).filter(b=>/^(?:この記事に)?スキ(?:を)?した(?:人|ユーザー|クリエイター)(?:の一覧)?(?:を見る|を表示)?(?:\\s*\\d+人)?$|^スキ(?:の一覧|一覧)(?:を見る|を表示)?$/.test(label(b)) && !b.closest(rowSelector) && !b.closest(excluded));\n    const countSelector='.o-noteLike__count,.m-noteLike__count,[class*=\"likeCount\"],[class*=\"LikeCount\"],[class*=\"like__count\"],[class*=\"like__number\"],[class*=\"like-count\"],[class*=\"like_count\"]';\n    const numeric=all(document,countSelector).flatMap(e=>{\n      if(e.closest(rowSelector)||e.closest(excluded)||!/^\\d[\\d,]*$/.test(label(e)))return [];\n      // A count may be a span inside a native button. Never click a count\n      // contained in the heart toggle, even when the count itself looks right.\n      const b=e.closest('button,[role=\"button\"]')||e;\n      if(b.getAttribute('aria-pressed')!==null||/スキ(?:する|をする|をつける|を取り消す|を取消す|を解除|済み)/.test(label(b)))return [];\n      if(!/^\\d[\\d,]*$/.test(label(b))&&!/一覧|スキ(?:を)?した/.test(label(b)))return [];\n      return [b];\n    });\n    const options=unique(explicit.length?explicit:numeric);\n    // Responsive copies have the same count; select one only if all counts agree.\n    if(!options.length || !explicit.length && new Set(options.map(label)).size!==1)return {state:'missing'};\n    if(explicit.length>1 && new Set(explicit.map(label)).size!==1)return {state:'ambiguous'};\n    const button=options[0];if(button.disabled || button.getAttribute('aria-disabled')==='true')return {state:'loading'};\n    button.scrollIntoView?.({block:'center'});button.click();return {state:'opened'};\n  }\n  if(step==='readers'){\n    const busy=modal && (modal.getAttribute('aria-busy')==='true' || all(modal,'[role=\"progressbar\"],[aria-busy=\"true\"]').length>0 || /読み込み中|ロード中/.test(modal.innerText));\n    const likers=modal&&!busy?unique(all(modal,'a[href]').map(owner).filter(Boolean)):[];\n    // Merely opening a shell dialog does not establish an empty response.\n    const empty=modal&&!busy&&/スキ(?:を)?した(?:人|ユーザー|クリエイター)(?:は|が)?(?:いません|ありません)|まだスキがありません|ゲストユーザー/.test(modal.innerText);\n    return {state:busy?'loading':'ready',owners:unique([...rows.map(r=>r.owner),...likers]).filter(v=>v!==arg.owner).slice(0,20),likeOwners:likers.filter(v=>v!==arg.owner).slice(0,20),likesRead:!!modal&&!busy&&(likers.length>0||!!empty),comments:rows.length,likers:likers.length,modal:!!modal,busy:!!busy};\n  }\n  return {state:'missing'};\n}",
  "observationScreen1698": "function observationScreen1698(job) {\n  const unknown=reason=>({state:'unknown',reason});\n  const visible=e=>!!e?.getClientRects().length && !e.closest('[hidden],[aria-hidden=\"true\"]') && getComputedStyle(e).visibility!=='hidden';\n  const text=e=>(e?.textContent||'').replace(/\\s+/g,' ').trim();\n  const absolute=raw=>{try{const u=new URL(raw,location.href);return u.origin==='https://note.com' && !u.username && !u.password?u:null;}catch{return null;}};\n  const rawCanonical=document.querySelector('link[rel=\"canonical\"]')?.getAttribute('href');\n  const canonical=rawCanonical?absolute(rawCanonical):null;\n  if(location.origin!=='https://note.com' || document.readyState!=='complete' || !canonical ||\n     canonical.pathname.replace(/\\/$/,'')!==location.pathname.replace(/\\/$/,''))return unknown('page');\n  const bodySelector='[contenteditable],.note-common-styles__textnote-body,.o-noteContentText,[data-testid=\"note-body\"],[class*=\"noteBody\"],[class*=\"NoteBody\"],blockquote';\n  const h1=[...document.querySelectorAll('h1')].filter(visible);\n  if(h1.length!==1)return unknown('heading');\n  if(job.kind==='keyword') {\n    let path;try{path=decodeURIComponent(location.pathname).replace(/\\/$/,'');}catch{return unknown('page');}\n    const mode=new URL(location.href).searchParams.get('mode');\n    if(path!=='/tag/'+job.subject || text(h1[0])!==job.subject ||\n       (job.mode==='new'?mode!=='new':mode!==null))return unknown('page');\n    const mains=[...document.querySelectorAll('main,[role=\"main\"]')].filter(visible);\n    const root=mains.length===1?mains[0]:null;\n    if(!root)return unknown('list');\n    const tabs=[...root.querySelectorAll('a[href],[role=\"tab\"]')].filter(e=>visible(e)&&['人気','新着'].includes(text(e)));\n    const selected=tabs.filter(e=>e.getAttribute('aria-selected')==='true' || ['page','true'].includes(e.getAttribute('aria-current')) || e.classList.contains('is-active'));\n    if(selected.length!==1 || text(selected[0])!==(job.mode==='new'?'新着':'人気'))return unknown('sort');\n    const cardSelector='article,[data-testid=\"note-card\"],.m-note,.m-largeNoteWrapper,[class*=\"noteCard\"],[class*=\"NoteCard\"]';\n    const cards=[...root.querySelectorAll(cardSelector)].filter(e=>visible(e)&&!e.closest('aside,nav,footer,[class*=\"recommend\" i],[data-testid*=\"recommend\"],'+bodySelector));\n    const leaves=cards.filter(e=>!cards.some(other=>other!==e && e.contains(other)));\n    if(!leaves.length)return unknown('list');\n    const entries=[],seen=new Set();let incomplete=false;\n    for(const card of leaves.slice(0,50)) {\n      const headings=[...card.querySelectorAll('h2,h3,h4')].filter(visible);\n      if(headings.length!==1 || !text(headings[0])){incomplete=true;continue;}\n      const urls=[...new Set([...card.querySelectorAll('a[href],[data-href]')].concat(card.matches('a[href],[data-href]')?[card]:[])\n        .filter(visible).map(e=>absolute(e.getAttribute('href')||e.getAttribute('data-href')))\n        .filter(u=>u && /^\\/[\\w-]{1,80}\\/n\\/n[a-z0-9]{1,64}\\/?$/.test(u.pathname)).map(u=>u.origin+u.pathname.replace(/\\/$/,'')))];\n      if(urls.length!==1){incomplete=true;continue;}\n      if(seen.has(urls[0]))continue;\n      seen.add(urls[0]);entries.push({url:urls[0],title:text(headings[0]).slice(0,300)});\n    }\n    // A missing/unrecognized card is not proof that 520 is absent from this page.\n    if(!entries.length)return unknown('cards');\n    return {state:'observed',complete:!incomplete,entries,scope:'initial_cards'};\n  }\n  if(job.kind!=='footer' || location.pathname.replace(/\\/$/,'')!=='/43__/n/'+job.subject || text(h1[0])==='521')return unknown('page');\n  const groups=[...document.querySelectorAll('[aria-label*=\"パンくず\"],[aria-label*=\"breadcrumb\" i],[class*=\"breadcrumb\" i]')]\n    .filter(e=>visible(e) && !e.closest(bodySelector));\n  const paths=[];\n  for(const group of groups) {\n    if(group.getBoundingClientRect().top<h1[0].getBoundingClientRect().bottom)continue;\n    const links=[...group.querySelectorAll('a[href]')].filter(visible);\n    const list=links.map(a=>({u:absolute(a.getAttribute('href')),label:text(a)}));\n    if(!list.some(x=>x.u?.pathname==='/' && ['トップ','ホーム'].includes(x.label)))continue;\n    const topics=list.filter(x=>x.u && /^\\/topic\\/[a-z0-9_/-]+\\/?$/.test(x.u.pathname) && x.label && x.label.length<=100)\n      .map(x=>({label:x.label,url:x.u.origin+x.u.pathname}));\n    if(topics.length && topics.length<=8)paths.push(topics);\n  }\n  const unique=[...new Map(paths.map(p=>[JSON.stringify(p),p])).values()];\n  return unique.length===1?{state:'observed',title:text(h1[0]).slice(0,300),topics:unique[0]}:unknown('breadcrumb');\n}"
});
