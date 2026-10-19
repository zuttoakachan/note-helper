const VERSION = 'v14.3';
const SLOTS = ['1', '2'];
const ORDERS = {
  '1': ['小説', '短編小説', '創作', '散文', 'エッセイ', '詩', '日記', 'ショートショート', '掌編小説', '詩のようなもの', '自由詩', '独白', '希死念慮'],
  '2': ['ショートショート', '掌編小説', '詩のようなもの', '自由詩', '独白', '希死念慮', '小説', '短編小説', '創作', '散文', 'エッセイ', '詩', '日記']
};
const HOUR = 3600000, INTERVAL = 240000, LEASE = 300000;
const sql = (env, q, ...a) => env.DB.prepare(q).bind(...a);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time = n => n ? new Date(n).toLocaleString('ja-JP', {timeZone:'Asia/Tokyo'}) : 'まだありません';
const day = () => new Date(Date.now() + 9 * HOUR).toISOString().slice(0, 10);
function scoped(env, slot) {
  return {...env, SLOT:slot, NOTE_SESSION:slot === '2' ? env.NOTE_SESSION_2 : env.NOTE_SESSION,
    DB:slot === '1' ? env.DB : {
      prepare:q => env.DB.prepare(q.replace(/\b(nh_control|nh_seen|nh_health)\b/g, '$1_2')),
      batch:items => env.DB.batch(items)
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
function page(message = '管理用の鍵を入力してください。', slot = '1', settings = null) {
  return reply(`<!doctype html><html lang="ja"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>note-helper ${VERSION}</title>
<style>body{font:17px system-ui;max-width:700px;margin:24px auto;padding:0 18px;line-height:1.7}input,textarea,select,button{font:inherit;padding:12px;box-sizing:border-box}input,textarea,select{width:100%}button{margin:12px 8px 0 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f4f6;padding:16px}details{margin-top:24px}small{display:block}</style>
<h1>note-helper ${VERSION}</h1>
<p>通常は処理完了から240秒（4分）以上あけて、各アカウント最大1件。実行が遅れる場合があります。タグは管理画面で変更できます。初期設定は13タグです。</p>
<p>エラー後は毎回2時間ずつ休止して再確認します。noteが長い待機時間を指定した場合は、その時間を守ります。</p>
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
<details><summary>巡回タグ・同じ作者への間隔を変更</summary>
<p>「両方の状態を確認」を押すと現在の設定を読み込みます。タグは1行に1つ。保存すると両アカウントに適用し、2番の巡回順をずらします。</p>
<label>タグ一覧<textarea name="tags" rows="13" maxlength="3000" placeholder="状態確認で現在のタグを表示">${settings ? esc(settings.tags.join('\n')) : ''}</textarea></label>
<label>同じ作者への間隔（時間・1〜168）<input name="author_hours" type="number" min="1" max="168" step="1" value="${settings ? settings.author_hours : ''}"></label>
<p>初期値は24時間。同じnoteアカウントから同じ作者への送信予約を、この間隔で制限します。送信結果が不明な場合も予約を保持します。導入前の作者履歴は含みません。</p>
<button name="action" value="settings">両方の設定を保存</button></details>
<details><summary>Telegram通知を設定・確認</summary>
<p>CloudflareのSecretに TELEGRAM_BOT_TOKEN を設定してから使用します。ログイン・アクセス拒否・暗号化設定のエラーを通知します。同じ問題の通知は原則24時間に1回です。</p>
<button name="action" value="tg_pair">① 連携コードを発行</button>
<button name="action" value="tg_connect">② Telegramとの連携を確認</button>
<button name="action" value="tg_test">通知をテスト</button>
<button name="action" value="tg_off">通知を解除</button>
</details>
</form>
<p>接続確認・Cookie保存は各アカウント5分に1回まで。回数制限の休止中やnoteが指定した待機中は実行しません。画面は自動更新されません。</p>
<p>接続確認OKは確認日時時点の結果です。いいね送信の制限解除を保証するものではありません。開始やCookie保存では自動運転の休止期限を短縮しません。停止直前の送信は取り消せません。</p></html>`, true);
}
async function prepare(original) {
  for (const slot of SLOTS) {
    const env = scoped(original, slot);
    await env.DB.batch([
      env.DB.prepare("CREATE TABLE IF NOT EXISTS nh_control (id INTEGER PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, account TEXT NOT NULL DEFAULT '', cursor INTEGER NOT NULL DEFAULT 0, token TEXT NOT NULL DEFAULT '', lease INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0, inflight TEXT NOT NULL DEFAULT '', total INTEGER NOT NULL DEFAULT 0, message TEXT NOT NULL DEFAULT '未開始', checked INTEGER NOT NULL DEFAULT 0)"),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS nh_seen (key TEXT PRIMARY KEY, status TEXT NOT NULL, created INTEGER NOT NULL)'),
      env.DB.prepare("CREATE TABLE IF NOT EXISTS nh_health (id INTEGER PRIMARY KEY, rate_fail INTEGER NOT NULL DEFAULT 0, errors INTEGER NOT NULL DEFAULT 0, kind TEXT NOT NULL DEFAULT '', success_at INTEGER NOT NULL DEFAULT 0)"),
      env.DB.prepare('INSERT OR IGNORE INTO nh_control (id) VALUES (1)'),
      env.DB.prepare('INSERT OR IGNORE INTO nh_health (id) VALUES (1)')
    ]);
  }
  await original.DB.batch([
    original.DB.prepare('CREATE TABLE IF NOT EXISTS nh_shared (key TEXT PRIMARY KEY, slot TEXT NOT NULL, token TEXT NOT NULL, created INTEGER NOT NULL)'),
    original.DB.prepare('CREATE TABLE IF NOT EXISTS nh_migrations (name TEXT PRIMARY KEY)'),
    original.DB.prepare("CREATE TABLE IF NOT EXISTS nh_v13_credentials (slot TEXT PRIMARY KEY, iv TEXT NOT NULL, ciphertext TEXT NOT NULL, updated INTEGER NOT NULL)"),
    original.DB.prepare("CREATE TABLE IF NOT EXISTS nh_v13_connection (slot TEXT PRIMARY KEY, next_check INTEGER NOT NULL DEFAULT 0, hold_until INTEGER NOT NULL DEFAULT 0, checked INTEGER NOT NULL DEFAULT 0, ok INTEGER NOT NULL DEFAULT 0, message TEXT NOT NULL DEFAULT '未確認')"),
    original.DB.prepare("INSERT OR IGNORE INTO nh_v13_connection (slot) VALUES ('1')"),
    original.DB.prepare("INSERT OR IGNORE INTO nh_v13_connection (slot) VALUES ('2')"),
    original.DB.prepare('CREATE TABLE IF NOT EXISTS nh_v13_success (slot TEXT NOT NULL, key TEXT NOT NULL, day TEXT NOT NULL, confirmed INTEGER NOT NULL, PRIMARY KEY(slot,key))'),
    original.DB.prepare('CREATE INDEX IF NOT EXISTS nh_v13_success_day ON nh_v13_success(day,slot)')
  ]);
  await original.DB.batch([
    original.DB.prepare("CREATE TABLE IF NOT EXISTS nh_v14_settings (id INTEGER PRIMARY KEY, tags TEXT NOT NULL, author_hours INTEGER NOT NULL DEFAULT 24)"),
    original.DB.prepare("CREATE TABLE IF NOT EXISTS nh_v14_authors (slot TEXT NOT NULL, author TEXT NOT NULL, last_at INTEGER NOT NULL, token TEXT NOT NULL, PRIMARY KEY(slot,author))"),
    original.DB.prepare("CREATE TABLE IF NOT EXISTS nh_v14_stats (slot TEXT NOT NULL, tag TEXT NOT NULL, day TEXT NOT NULL, checks INTEGER NOT NULL DEFAULT 0, sent INTEGER NOT NULL DEFAULT 0, skips INTEGER NOT NULL DEFAULT 0, errors INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(slot,tag,day))"),
    original.DB.prepare("CREATE TABLE IF NOT EXISTS nh_v14_telegram (id INTEGER PRIMARY KEY, chat_id TEXT NOT NULL DEFAULT '', nonce TEXT NOT NULL DEFAULT '', expires INTEGER NOT NULL DEFAULT 0, next_test INTEGER NOT NULL DEFAULT 0, last_sent INTEGER NOT NULL DEFAULT 0, message TEXT NOT NULL DEFAULT '未連携')"),
    original.DB.prepare("INSERT OR IGNORE INTO nh_v14_telegram (id) VALUES (1)"),
    original.DB.prepare("CREATE TABLE IF NOT EXISTS nh_v14_alerts (slot TEXT PRIMARY KEY, fingerprint TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '', pending INTEGER NOT NULL DEFAULT 0, last_sent INTEGER NOT NULL DEFAULT 0, attempt_at INTEGER NOT NULL DEFAULT 0)"),
    original.DB.prepare("INSERT OR IGNORE INTO nh_v14_alerts (slot) VALUES ('1')"),
    original.DB.prepare("INSERT OR IGNORE INTO nh_v14_alerts (slot) VALUES ('2')")
  ]);
  await sql(original, 'INSERT OR IGNORE INTO nh_v14_settings (id,tags,author_hours) VALUES (1,?,24)', JSON.stringify(ORDERS['1'])).run();
  if (await sql(original, "SELECT name FROM nh_migrations WHERE name='v13-history'").first()) return;
  const items = [];
  for (const slot of SLOTS) {
    const env = scoped(original, slot);
    items.push(
      sql(env, "INSERT OR IGNORE INTO nh_shared SELECT key, ?, 'history', created FROM nh_seen WHERE NOT EXISTS (SELECT 1 FROM nh_migrations WHERE name='v13-history')", slot),
      sql(env, "INSERT OR IGNORE INTO nh_shared SELECT inflight, ?, 'history', checked FROM nh_control WHERE inflight<>'' AND NOT EXISTS (SELECT 1 FROM nh_migrations WHERE name='v13-history')", slot)
    );
  }
  items.push(original.DB.prepare("INSERT OR IGNORE INTO nh_migrations VALUES ('v13-history')"));
  await original.DB.batch(items);
}
function orderFor(tags, slot) {
  const offset = slot === '2' ? Math.ceil(tags.length / 2) : 0;
  return tags.slice(offset).concat(tags.slice(0,offset));
}
async function getSettings(env) {
  const row = await sql(env,'SELECT * FROM nh_v14_settings WHERE id=1').first();
  const tags = JSON.parse(row.tags);
  if (!Array.isArray(tags) || !tags.length) throw new Trouble('タグ設定を確認してください','config');
  return {tags, author_hours:row.author_hours};
}
async function saveSettings(env, form) {
  const raw = String(form.get('tags') || '');
  if (raw.length > 3000) throw new Trouble('タグの入力が長すぎます','config');
  const tags = [...new Set(raw.split(/[\s,、・，]+/u).map(t=>t.replace(/^[#＃]+/u,'').trim()).filter(Boolean))];
  const hours = Number(form.get('author_hours'));
  if (!tags.length || tags.length>30 || tags.some(t=>[...t].length>50 || /[\x00-\x1f\x7f<>/#＃]/u.test(t))) throw new Trouble('タグは1〜30個、各50文字以内で入力してください','config');
  if (!Number.isInteger(hours) || hours<1 || hours>168) throw new Trouble('作者への間隔は1〜168時間の整数で入力してください','config');
  const result = await sql(env,"UPDATE nh_v14_settings SET tags=?,author_hours=? WHERE id=1 AND NOT EXISTS (SELECT 1 FROM nh_control WHERE lease>?) AND NOT EXISTS (SELECT 1 FROM nh_control_2 WHERE lease>?)",JSON.stringify(tags),hours,Date.now(),Date.now()).run();
  return result.meta.changes ? tags.length+'タグを両方に保存しました。2番の順番をずらしています。休止期限と履歴は保持します。' : '自動処理中のため設定を変更しませんでした。少し待って再度保存してください。';
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
      body:JSON.stringify(body), redirect:'manual',
      signal:AbortSignal.timeout(15000)
    });
  } catch (error) {
    const reason = ['TimeoutError','AbortError'].includes(error?.name)
      ? '15秒以内に応答がありませんでした'
      : 'CloudflareからTelegramへの通信を開始・完了できませんでした';
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
      sql(env,'UPDATE nh_v14_alerts SET pending=0')
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
      await telegram(env,'sendMessage',{chat_id:row.chat_id,text:'note-helper v14：通知テスト成功。ログイン情報などの対応が必要な場合、このチャットへ通知します。'});
      await sql(env,"UPDATE nh_v14_telegram SET last_sent=?,message='通知テスト成功' WHERE id=1",Date.now()).run();
      return 'Telegramにテスト通知を送りました。';
    } catch (error) {
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
  const cfg = await sql(env,'SELECT * FROM nh_v14_telegram WHERE id=1').first();
  if (!env.TELEGRAM_BOT_TOKEN || !cfg.chat_id) return;
  for (const slot of SLOTS) {
    // Check current status so repaired or manually stopped accounts do not send stale alerts.
    const selected = scoped(env,slot);
    const state = await sql(selected,'SELECT enabled FROM nh_control WHERE id=1').first();
    const health = await sql(selected,'SELECT kind FROM nh_health WHERE id=1').first();
    if (!state.enabled || !['auth','config'].includes(health.kind)) {
      await sql(env,'UPDATE nh_v14_alerts SET pending=0 WHERE slot=?',slot).run(); continue;
    }
    const row = await sql(env,'SELECT * FROM nh_v14_alerts WHERE slot=?',slot).first();
    if (!row.pending || row.attempt_at>Date.now()) continue;
    const gate = await sql(env,'UPDATE nh_v14_alerts SET attempt_at=? WHERE slot=? AND pending=1 AND attempt_at<=? AND fingerprint=?',Date.now()+15*60000,slot,Date.now(),row.fingerprint).run();
    if (!gate.meta.changes) continue;
    try {
      await telegram(env,'sendMessage',{chat_id:cfg.chat_id,text:'note-helper：アカウント '+slot+' の確認が必要です。\n'+row.message+'\n管理画面で状態を確認してください。\n401はCookie更新、403はアクセス拒否の確認が必要です。'});
      await env.DB.batch([
        sql(env,'UPDATE nh_v14_alerts SET pending=0,last_sent=? WHERE slot=? AND fingerprint=?',Date.now(),slot,row.fingerprint),
        sql(env,"UPDATE nh_v14_telegram SET last_sent=?,message='エラー通知を送信しました' WHERE id=1",Date.now())
      ]);
    } catch (error) {
      await env.DB.batch([
        sql(env,'UPDATE nh_v14_alerts SET attempt_at=? WHERE slot=?',Date.now()+Math.max(15*60000,error.retry||0),slot),
        sql(env,"UPDATE nh_v14_telegram SET message='通知失敗。設定を確認してください。後で自動再試行します' WHERE id=1")
      ]);
    }
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
  catch (error) { if (error.code === 404) return null; throw error; }
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
      items.push(sql(original, 'UPDATE nh_v14_alerts SET pending=0 WHERE slot=?', slot));
      await original.DB.batch(items);
      return 'アカウント ' + slot + '：' + message + '\nいいねは送信していません。自動運転の休止期限は維持します。';
    } catch (error) {
      const message = error instanceof Trouble ? error.message : '通信・保存・内部処理のエラー。保存結果を確認できません。';
      const wait = error instanceof Trouble ? Math.max(error.retry, error.code === 429 ? 2*HOUR : 0) : 0;
      await sql(original, 'UPDATE nh_v13_connection SET checked=?, ok=0, message=?, hold_until=MAX(hold_until,?), next_check=MAX(next_check,?) WHERE slot=?', Date.now(), (candidate !== null ? '更新用Cookieの確認：' : '') + message, Date.now()+wait, Date.now()+Math.max(LEASE,wait), slot).run();
      return 'アカウント ' + slot + '：' + message + '\n本人確認に失敗したCookieは保存しません。いいねは送信していません。';
    }
  } finally { await release(env, token); }
}
async function run(baseEnv) {
  const token = await acquire(baseEnv, true);
  if (!token) return;
  let env = baseEnv, stage = 'ログイン確認', activeTag = null;
  const finish = async (message, success = false) => {
    await env.DB.batch([
      ...statItems(env, activeTag, success ? 'sent' : 'skips'),
      sql(env, 'UPDATE nh_control SET message=?, next_at=? WHERE id=1 AND token=?', message, Date.now()+INTERVAL, token),
      sql(env, "UPDATE nh_health SET errors=CASE WHEN ? THEN 0 ELSE errors END, kind='', rate_fail=CASE WHEN ? THEN 0 ELSE rate_fail END, success_at=CASE WHEN ? THEN ? ELSE success_at END WHERE id=1", +success,+success,+success,Date.now())
    ]);
  };
  try {
    const state = await sql(env, 'SELECT * FROM nh_control WHERE id=1').first();
    env = await loadCookie(env, state.account);
    if (await account(env) !== state.account) throw new Trouble('登録済みのnoteとログイン情報が一致しません', 'auth');
    await sql(env, 'UPDATE nh_v14_alerts SET pending=0 WHERE slot=?', env.SLOT).run();
    if (state.inflight) {
      stage = '前回送信の確認';
      const data = await article(env, state.inflight), liked = data?.is_liked === true;
      const before = await sql(env, 'SELECT status FROM nh_seen WHERE key=?', state.inflight).first();
      const add = liked && before?.status !== 'liked';
      const items = [
        sql(env, 'INSERT INTO nh_seen VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET status=excluded.status', state.inflight, liked ? 'liked' : 'uncertain', Date.now()),
        sql(env, "UPDATE nh_control SET inflight='', total=total+? WHERE id=1 AND token=?", +add,token)
      ];
      if (add) items.push(sql(env, 'INSERT OR IGNORE INTO nh_v13_success VALUES (?,?,?,?)', env.SLOT,state.inflight,day(),Date.now()));
      await env.DB.batch(items);
      await finish(liked ? '前回の記事のスキを確認しました。次回から候補を確認します' : '前回の記事は再送せず除外しました');
      return;
    }
    stage = '記事一覧の取得';
    const settings = await getSettings(env);
    const tags = orderFor(settings.tags, env.SLOT), tag = tags[state.cursor % tags.length];
    activeTag = tag;
    await env.DB.batch(statItems(env, tag, 'checks'));
    await sql(env, 'UPDATE nh_control SET cursor=cursor+1 WHERE id=1 AND token=?', token).run();
    const data = await api(env, '/api/v3/hashtags/' + encodeURIComponent(tag) + '/notes?order=new&page=1');
    if (!Array.isArray(data.notes)) throw new Trouble('記事一覧の形式を確認できません', 'response');
    const keys = [...new Set(data.notes.map(n => n?.key).filter(k => typeof k === 'string' && /^n[a-z0-9]+$/.test(k)))].slice(0,50);
    if (!keys.length) { await finish('#' + tag + '：記事なし'); return; }
    const marks = keys.map(() => '?').join(',');
    const seen = await sql(env, 'SELECT key FROM nh_seen WHERE key IN (' + marks + ') UNION SELECT key FROM nh_shared WHERE key IN (' + marks + ')', ...keys,...keys).all();
    const done = new Set(seen.results.map(r => r.key)), key = keys.find(k => !done.has(k));
    if (!key) { await finish('#' + tag + '：履歴・共通予約を除く候補なし'); return; }
    stage = '記事確認';
    const note = await article(env, key);
    if (!note || note.is_liked === true || String(note.user?.id ?? note.user_id) === state.account) {
      await sql(env, "INSERT OR IGNORE INTO nh_seen VALUES (?, 'skip', ?)", key,Date.now()).run();
      await finish('#' + tag + '：削除済み・スキ済み・自分の記事を除外'); return;
    }
    const author = String(note.user?.id ?? note.user_id ?? '');
    if (!author || author === '0') {
      await finish('#' + tag + '：作者IDを確認できないため送信を見送り'); return;
    }
    const recent = await sql(env, 'SELECT last_at FROM nh_v14_authors WHERE slot=? AND author=?',env.SLOT,author).first();
    if (recent && recent.last_at > Date.now() - settings.author_hours*HOUR) {
      await finish('#' + tag + '：同じ作者への間隔待ち（' + settings.author_hours + '時間）'); return;
    }
    const referer = note.note_url || (note.user?.urlname ? 'https://note.com/' + note.user.urlname + '/n/' + key : '');
    let valid = false;
    try { const u = new URL(referer); valid = u.origin === 'https://note.com' && u.pathname.endsWith('/n/' + key); } catch {}
    if (!valid) throw new Trouble('記事URLを確認できません', 'response');
    stage = '共通予約の保存';
    const reserved = await env.DB.batch([
      sql(env, 'INSERT INTO nh_v14_authors (slot,author,last_at,token) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM nh_control WHERE id=1 AND token=? AND enabled=1 AND lease>?) AND NOT EXISTS (SELECT 1 FROM nh_shared WHERE key=?) ON CONFLICT(slot,author) DO UPDATE SET last_at=excluded.last_at,token=excluded.token WHERE nh_v14_authors.last_at<=?', env.SLOT,author,Date.now(),token,token,Date.now(),key,Date.now()-settings.author_hours*HOUR),
      sql(env, 'INSERT OR IGNORE INTO nh_shared (key,slot,token,created) SELECT ?,?,?,? FROM nh_control WHERE id=1 AND token=? AND enabled=1 AND lease>? AND EXISTS (SELECT 1 FROM nh_v14_authors WHERE slot=? AND author=? AND token=?)', key,env.SLOT,token,Date.now(),token,Date.now(),env.SLOT,author,token),
      sql(env, "INSERT OR IGNORE INTO nh_seen (key,status,created) SELECT ?, 'pending', ? WHERE EXISTS (SELECT 1 FROM nh_shared WHERE key=? AND token=?)", key,Date.now(),key,token),
      sql(env, 'UPDATE nh_control SET inflight=?, lease=? WHERE id=1 AND token=? AND enabled=1 AND lease>? AND EXISTS (SELECT 1 FROM nh_shared WHERE key=? AND token=?)', key,Date.now()+LEASE,token,Date.now(),key,token)
    ]);
    if (!reserved[0].meta.changes || !reserved[1].meta.changes || !reserved[3].meta.changes) { await finish('共通予約済み、または停止操作により送信を見送りました'); return; }
    stage = 'スキ送信';
    await api(env, '/api/v3/notes/' + key + '/likes', true, referer);
    stage = '送信後の確認';
    if ((await article(env,key))?.is_liked !== true) throw new Trouble('送信結果は未確認。再送せず次回に確認します');
    await env.DB.batch([
      sql(env, "UPDATE nh_seen SET status='liked' WHERE key=?", key),
      sql(env, "UPDATE nh_control SET inflight='', total=total+1 WHERE id=1 AND token=?", token),
      sql(env, 'INSERT OR IGNORE INTO nh_v13_success VALUES (?,?,?,?)', env.SLOT,key,day(),Date.now())
    ]);
    await finish('スキ確認済み：' + key + '（#' + tag + '）', true);
  } catch (error) {
    const kind = error instanceof Trouble ? error.kind : 'storage';
    const h = await sql(env, 'SELECT * FROM nh_health WHERE id=1').first();
    const errors = Number(h.errors)+1, rates = Number(h.rate_fail)+(kind === 'rate' ? 1 : 0);
    const serverWait = error instanceof Trouble ? error.retry : 0;
    const wait = Math.max(2*HOUR, serverWait);
    const message = '自動再確認待ち：' + stage + '／' + (error instanceof Trouble ? error.message : '保存・内部処理のエラー');
    await env.DB.batch([
      ...statItems(env, activeTag, 'errors'),
      sql(env, 'UPDATE nh_health SET rate_fail=?, errors=?, kind=? WHERE id=1', rates,errors,kind),
      sql(env, 'UPDATE nh_control SET next_at=?, message=? WHERE id=1 AND token=?', Date.now()+wait,message,token),
      sql(env, 'UPDATE nh_v13_connection SET hold_until=MAX(hold_until,?) WHERE slot=?', Date.now()+serverWait,env.SLOT)
    ]);
    if (['auth','config'].includes(kind)) await queueAlert(env, kind, message);
  } finally { await release(env,token); }
}
async function dashboard(original, prefix = '') {
  const blocks = [];
  const settings = await getSettings(original);
  const telegram = await sql(original,'SELECT * FROM nh_v14_telegram WHERE id=1').first();
  blocks.push('Telegram通知：' + (original.TELEGRAM_BOT_TOKEN && telegram.chat_id ? '連携済み' : '未設定') + '\n' + telegram.message + '\n最終通知成功：' + time(telegram.last_sent) + '\n同じ作者への間隔：各アカウント ' + settings.author_hours + '時間');
  for (const slot of SLOTS) {
    const env = scoped(original,slot);
    const s = await sql(env, 'SELECT * FROM nh_control WHERE id=1').first();
    const h = await sql(env, 'SELECT * FROM nh_health WHERE id=1').first();
    const c = await sql(env, 'SELECT * FROM nh_v13_connection WHERE slot=?',slot).first();
    const saved = await sql(env, 'SELECT updated FROM nh_v13_credentials WHERE slot=?',slot).first();
    const today = await sql(env, 'SELECT COUNT(*) AS count FROM nh_v13_success WHERE slot=? AND day=?',slot,day()).first();
    const now = Date.now(), next = Math.max(s.next_at,s.lease,c.hold_until);
    const verified = c.ok === 1 && c.checked >= s.checked;
    let status;
    if (!s.enabled) status = '停止中（開始操作が必要）';
    else if (s.lease > now) status = 'ON・処理中';
    else if (h.kind === 'auth' && !verified) status = s.message.includes('401') ? 'ON・ログイン情報の更新が必要' : 'ON・ログイン情報やアクセス拒否の確認が必要';
    else if (h.kind === 'config') status = 'ON・暗号化キーなどの設定確認が必要';
    else if (h.kind === 'auth' && verified) status = 'ON・接続修復を確認済み／自動実行待ち';
    else if (next > now) status = h.kind === 'rate' ? 'ON・回数制限で休止中' : h.kind ? 'ON・エラー後の休止中' : 'ON・次の実行待ち';
    else status = 'ON・定期実行待ち';
    blocks.push('アカウント ' + slot + '\n状態：' + status +
      '\n今日のスキ確認成功：' + today.count + '件（日本時間）' +
      '\n累計：' + s.total + '件\n最終自動実行：' + time(s.checked) + '\n最終送信成功：' + time(h.success_at) +
      (s.enabled ? '\n次回：' + (next > now ? time(next)+'以降の定期実行' : '次の定期実行') : '') +
      '\n失敗回数：' + h.errors + '\n429回数：' + h.rate_fail +
      '\n\n【手動の接続確認・Cookie更新】\n確認日時：' + time(c.checked) + '\n' + c.message +
      '\n※この確認日時時点の結果です。\nCookie保存先：' + (saved ? '暗号化保存済み（管理画面の設定を優先）' : 'CloudflareのSecret') +
      (saved ? '\nCookie更新日時：' + time(saved.updated) : '') +
      '\n\n前回の自動実行記録：' + s.message + '\n巡回順：' + orderFor(settings.tags,slot).join(' → '));
  }
    const stats = await sql(original,'SELECT tag,SUM(checks) AS checks,SUM(sent) AS sent,SUM(skips) AS skips,SUM(errors) AS errors FROM nh_v14_stats WHERE day>=? GROUP BY tag ORDER BY checks DESC', new Date(Date.now()+9*HOUR-6*24*HOUR).toISOString().slice(0,10)).all();
  blocks.push('【タグ別実績・直近7日／2アカウント合算】\n' + (stats.results.length ? stats.results.map(r=>'#'+r.tag+'：巡回 '+r.checks+'／送信成功 '+r.sent+'／見送り '+r.skips+'／エラー '+r.errors).join('\n') : 'v14導入後から記録します。') + '\n見送りには候補なし・スキ済み・作者の間隔待ちなどを含みます。結果未確認の送信を後から確認した分はタグ別成功数には含めません。');
  return [prefix,...blocks,'今日の件数はv13導入後に成功を確認した分です。過去の送信結果を後から確認した分も、確認した日に計上します。以前の累計は保持します。'].filter(Boolean).join('\n\n──────────\n\n');
}
export default {
  async fetch(request, original) {
    const url = new URL(request.url);
    if (url.pathname === '/' && request.method === 'GET') return page(undefined,url.searchParams.get('account') === '2' ? '2' : '1');
    if (url.pathname !== '/control' || request.method !== 'POST') return reply('Not found',false,404);
    if (request.headers.get('Origin') !== url.origin) return reply('操作画面を開き直してください。',false,403);
    if (!original.ADMIN_KEY || !original.DB) return page('ADMIN_KEY または DB の設定を確認してください。');
    let slot = '1';
    try {
      const body = await request.text();
      if (body.length > 100000) return reply('入力が長すぎます。',false,413);
      const form = new URLSearchParams(body);
      if (form.get('key') !== original.ADMIN_KEY) return reply('管理用の鍵が違います。',false,403);
      slot = form.get('account') || '1';
      const action = form.get('action');
      if (!SLOTS.includes(slot) || !['status','start','stop','check','save','settings','tg_pair','tg_connect','tg_test','tg_off'].includes(action)) return reply('操作を選んでください。',false,400);
      await prepare(original);
      const env = scoped(original,slot);
      let message = '';
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
            await sql(env,'UPDATE nh_control SET enabled=1, account=? WHERE id=1 AND token=?',id,token).run();
            message = 'アカウント ' + slot + ' をONにしました。休止期限は保持します。';
          }
        } finally { await release(env,token); }
      }
      try { await wakeScheduler(original); }
      catch { message += '\n実行予約の確認に失敗しました。CloudflareのSCHEDULER設定とログを確認してください。'; }
      return page(await dashboard(original,message),slot,await getSettings(original));
    } catch (error) {
      const message = error instanceof Trouble ? error.message : '接続・保存・設定の確認に失敗しました。';
      try { return page(await dashboard(original,message),slot,await getSettings(original)); } catch { return page(message,slot); }
    }
  },
  async scheduled(event, original, ctx) {
    // Cronは予約の復旧専用。ここから直接いいねは送信しない。
    ctx.waitUntil(wakeScheduler(original));
  }
};

async function wakeScheduler(env) {
  if (!env.SCHEDULER) throw new Error('Scheduler binding missing');
  const id = env.SCHEDULER.idFromName('note-helper-210-seconds');
  const response = await env.SCHEDULER.get(id).fetch('https://scheduler.internal/wake');
  if (!response.ok) throw new Error('Scheduler unavailable');
}

// 秒単位の予約だけを担当する。既存の履歴・認証・休止期限はD1で保持する。
export class NoteScheduler {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; this.busy = false; }
  async fetch() {
    if (!this.busy) {
      const at = await this.ctx.storage.getAlarm();
      // 既存の未来の予約を前倒ししない。予約喪失時だけ復旧する。
      if (at === null || at < Date.now() - 300000) {
        await this.ctx.storage.setAlarm(Date.now() + 1000);
      }
    }
    return new Response('OK');
  }
  async alarm() {
    this.busy = true;
    try {
      // 異常終了時にも次の確認を予約。D1のlease/next_atで再送を抑止する。
      await this.ctx.storage.setAlarm(Date.now() + 120000);
      await prepare(this.env);
      await Promise.all(SLOTS.map(async slot => {
        try { await run(scoped(this.env, slot)); }
        catch { console.error('note-helper: account ' + slot + ' storage/runtime failure'); }
      }));
      try { await flushAlerts(this.env); }
      catch { console.error('note-helper: notification delivery deferred'); }
      await this.plan();
    } finally { this.busy = false; }
  }
  async plan() {
    let next = Date.now() + 120000; // 停止・手動変更・通知再試行も定期確認する。
    for (const slot of SLOTS) {
      const env = scoped(this.env, slot);
      const state = await sql(env, 'SELECT * FROM nh_control WHERE id=1').first();
      const connection = await sql(env, 'SELECT hold_until FROM nh_v13_connection WHERE slot=?', slot).first();
      if (state.enabled) {
        next = Math.min(next, Math.max(Date.now()+1000, state.next_at, state.lease, connection?.hold_until || 0));
      }
    }
    await this.ctx.storage.setAlarm(next);
  }
}
