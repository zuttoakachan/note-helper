const VERSION = 'v13';
const SLOTS = ['1', '2'];

const ORDERS = {
  '1': ['小説', '短編小説', '創作', '散文', 'エッセイ', '詩', '日記'],
  '2': ['エッセイ', '詩', '日記', '小説', '短編小説', '創作', '散文']
};

const HOUR = 3600000;
const INTERVAL = 240000;
const LEASE = 300000;

const sql = (env, q, ...a) =>
  env.DB.prepare(q).bind(...a);

const esc = v => String(v ?? '').replace(
  /[&<>"']/g,
  c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c])
);

const time = n => n
  ? new Date(n).toLocaleString(
      'ja-JP',
      { timeZone: 'Asia/Tokyo' }
    )
  : 'まだありません';

const day = () =>
  new Date(Date.now() + 9 * HOUR).toISOString().slice(0, 10);

function scoped(env, slot) {
  return {
    ...env,
    SLOT: slot,
    NOTE_SESSION: slot === '2'
      ? env.NOTE_SESSION_2
      : env.NOTE_SESSION,
    DB: slot === '1' ? env.DB : {
      prepare: q => env.DB.prepare(
        q.replace(
          /\b(nh_control|nh_seen|nh_health)\b/g,
          '$1_2'
        )
      ),
      batch: items => env.DB.batch(items)
    }
  };
}

function reply(body, html = false, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': html
        ? 'text/html; charset=utf-8'
        : 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function page(
  message = '管理用の鍵を入力してください。',
  slot = '1'
) {
  return reply(`<!doctype html>
<html lang="ja">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>note-helper ${VERSION}</title>
<style>
body {
  font:17px system-ui;
  max-width:700px;
  margin:24px auto;
  padding:0 18px;
  line-height:1.7
}
input,select,button {
  font:inherit;
  padding:12px;
  box-sizing:border-box
}
input,select {width:100%}
button {margin:12px 8px 0 0}
pre {
  white-space:pre-wrap;
  overflow-wrap:anywhere;
  background:#f3f4f6;
  padding:16px
}
details {margin-top:24px}
small {display:block}
</style>
<h1>note-helper ${VERSION}</h1>
<p>
約4分ごとに各アカウント最大1件。
対象：小説・短編小説・創作・散文・エッセイ・詩・日記。
</p>
<p>
エラー後は初回2時間、その後は3時間ずつ休止。
noteが長い待機時間を指定した場合は、その時間を守ります。
</p>
<pre>${esc(message)}</pre>
<form method="post" action="/control">
<label>
操作するアカウント
<select name="account">
<option value="1"${slot === '1' ? ' selected' : ''}>1：今までのnote</option>
<option value="2"${slot === '2' ? ' selected' : ''}>2：追加したnote</option>
</select>
</label>
<label>
管理用の鍵（ADMIN_KEY）
<input type="password" name="key" required
 autocomplete="off" autocapitalize="none" spellcheck="false">
</label>
<button name="action" value="status">両方の状態を確認</button>
<button name="action" value="check">選択したアカウントの接続確認</button>
<button name="action" value="start">自動運転を開始</button>
<button name="action" value="stop">停止</button>
<details>
<summary>ログイン情報を更新する</summary>
<p>
上で更新するアカウントを選び、
Cookie Editorの _note_session_v5 のValueだけを貼ってください。
</p>
<label>
新しいCookieの値
<input type="password" name="cookie" maxlength="16000"
 autocomplete="off" autocapitalize="none" spellcheck="false">
</label>
<button name="action" value="save">本人確認してCookieを保存</button>
<small>
登録済みのnote本人と確認できた場合だけ暗号化保存します。
失敗時は以前の設定を残します。いいねは送信しません。
</small>
</details>
</form>
<p>
接続確認・Cookie保存は各アカウント5分に1回まで。
回数制限の休止中やnoteが指定した待機中は実行しません。
画面は自動更新されません。
</p>
<p>
接続確認OKは確認日時時点の結果です。
いいね送信の制限解除を保証するものではありません。
開始やCookie保存では自動運転の休止期限を短縮しません。
停止直前の送信は取り消せません。
</p>
</html>`, true);
}

async function prepare(original) {
  for (const slot of SLOTS) {
    const env = scoped(original, slot);

    await env.DB.batch([
      env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS nh_control (" +
        "id INTEGER PRIMARY KEY, " +
        "enabled INTEGER NOT NULL DEFAULT 0, " +
        "account TEXT NOT NULL DEFAULT '', " +
        "cursor INTEGER NOT NULL DEFAULT 0, " +
        "token TEXT NOT NULL DEFAULT '', " +
        "lease INTEGER NOT NULL DEFAULT 0, " +
        "next_at INTEGER NOT NULL DEFAULT 0, " +
        "inflight TEXT NOT NULL DEFAULT '', " +
        "total INTEGER NOT NULL DEFAULT 0, " +
        "message TEXT NOT NULL DEFAULT '未開始', " +
        "checked INTEGER NOT NULL DEFAULT 0)"
      ),
      env.DB.prepare(
        'CREATE TABLE IF NOT EXISTS nh_seen (' +
        'key TEXT PRIMARY KEY, ' +
        'status TEXT NOT NULL, ' +
        'created INTEGER NOT NULL)'
      ),
      env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS nh_health (" +
        "id INTEGER PRIMARY KEY, " +
        "rate_fail INTEGER NOT NULL DEFAULT 0, " +
        "errors INTEGER NOT NULL DEFAULT 0, " +
        "kind TEXT NOT NULL DEFAULT '', " +
        "success_at INTEGER NOT NULL DEFAULT 0)"
      ),
      env.DB.prepare(
        'INSERT OR IGNORE INTO nh_control (id) VALUES (1)'
      ),
      env.DB.prepare(
        'INSERT OR IGNORE INTO nh_health (id) VALUES (1)'
      )
    ]);
  }

  await original.DB.batch([
    original.DB.prepare(
      'CREATE TABLE IF NOT EXISTS nh_shared (' +
      'key TEXT PRIMARY KEY, ' +
      'slot TEXT NOT NULL, ' +
      'token TEXT NOT NULL, ' +
      'created INTEGER NOT NULL)'
    ),
    original.DB.prepare(
      'CREATE TABLE IF NOT EXISTS nh_migrations (' +
      'name TEXT PRIMARY KEY)'
    ),
    original.DB.prepare(
      'CREATE TABLE IF NOT EXISTS nh_v13_credentials (' +
      'slot TEXT PRIMARY KEY, ' +
      'iv TEXT NOT NULL, ' +
      'ciphertext TEXT NOT NULL, ' +
      'updated INTEGER NOT NULL)'
    ),
    original.DB.prepare(
      "CREATE TABLE IF NOT EXISTS nh_v13_connection (" +
      "slot TEXT PRIMARY KEY, " +
      "next_check INTEGER NOT NULL DEFAULT 0, " +
      "hold_until INTEGER NOT NULL DEFAULT 0, " +
      "checked INTEGER NOT NULL DEFAULT 0, " +
      "ok INTEGER NOT NULL DEFAULT 0, " +
      "message TEXT NOT NULL DEFAULT '未確認')"
    ),
    original.DB.prepare(
      "INSERT OR IGNORE INTO nh_v13_connection (slot) VALUES ('1')"
    ),
    original.DB.prepare(
      "INSERT OR IGNORE INTO nh_v13_connection (slot) VALUES ('2')"
    ),
    original.DB.prepare(
      'CREATE TABLE IF NOT EXISTS nh_v13_success (' +
      'slot TEXT NOT NULL, ' +
      'key TEXT NOT NULL, ' +
      'day TEXT NOT NULL, ' +
      'confirmed INTEGER NOT NULL, ' +
      'PRIMARY KEY(slot,key))'
    ),
    original.DB.prepare(
      'CREATE INDEX IF NOT EXISTS nh_v13_success_day ' +
      'ON nh_v13_success(day,slot)'
    )
  ]);

  if (await sql(
    original,
    "SELECT name FROM nh_migrations WHERE name='v13-history'"
  ).first()) {
    return;
  }

  const items = [];

  for (const slot of SLOTS) {
    const env = scoped(original, slot);

    items.push(
      sql(
        env,
        "INSERT OR IGNORE INTO nh_shared " +
        "SELECT key, ?, 'history', created FROM nh_seen " +
        "WHERE NOT EXISTS (" +
        "SELECT 1 FROM nh_migrations WHERE name='v13-history')",
        slot
      ),
      sql(
        env,
        "INSERT OR IGNORE INTO nh_shared " +
        "SELECT inflight, ?, 'history', checked FROM nh_control " +
        "WHERE inflight<>'' AND NOT EXISTS (" +
        "SELECT 1 FROM nh_migrations WHERE name='v13-history')",
        slot
      )
    );
  }

  items.push(
    original.DB.prepare(
      "INSERT OR IGNORE INTO nh_migrations VALUES ('v13-history')"
    )
  );

  await original.DB.batch(items);
}

class Trouble extends Error {
  constructor(
    message,
    kind = 'network',
    retry = 0,
    code = 0
  ) {
    super(message);
    this.kind = kind;
    this.retry = retry;
    this.code = code;
  }
}

async function encryptionKey(env) {
  const hex = (env.COOKIE_ENCRYPTION_KEY || '').trim();

  if (!/^[a-f0-9]{64}$/i.test(hex)) {
    throw new Trouble(
      'COOKIE_ENCRYPTION_KEYの設定を確認してください',
      'config'
    );
  }

  return crypto.subtle.importKey(
    'raw',
    Uint8Array.from(
      hex.match(/../g),
      x => parseInt(x, 16)
    ),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt']
  );
}

const b64 = bytes =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)));

const unb64 = s =>
  Uint8Array.from(atob(s), c => c.charCodeAt(0));

const aad = (slot, id) =>
  new TextEncoder().encode(
    'note-helper:v13:' + slot + ':' + id
  );

async function encryptCookie(env, slot, id, value) {
  const key = await encryptionKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: aad(slot, id)
    },
    key,
    new TextEncoder().encode(value)
  );

  return {
    iv: b64(iv),
    ciphertext: b64(encrypted)
  };
}

async function loadCookie(env, id) {
  const row = await sql(
    env,
    'SELECT * FROM nh_v13_credentials WHERE slot=?',
    env.SLOT
  ).first();

  if (!row) return env;

  try {
    const key = await encryptionKey(env);

    const data = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: unb64(row.iv),
        additionalData: aad(env.SLOT, id)
      },
      key,
      unb64(row.ciphertext)
    );

    return {
      ...env,
      NOTE_SESSION: new TextDecoder().decode(data)
    };
  } catch {
    throw new Trouble(
      '保存済みCookieを復号できません。暗号化キーの変更・削除を確認してください',
      'config'
    );
  }
}

function cleanCookie(value) {
  const cookie = String(value || '').trim();

  if (
    !cookie ||
    cookie.length > 16000 ||
    /[\s;\x00-\x1f\x7f]/.test(cookie) ||
    cookie.startsWith('_note_session_v5=')
  ) {
    throw new Trouble(
      'CookieのValueだけを貼ってください。名前・空白・改行は含めません',
      'config'
    );
  }

  return cookie;
}

async function api(
  env,
  path,
  post = false,
  referer = 'https://note.com/'
) {
  if (!env.NOTE_SESSION?.trim()) {
    throw new Trouble(
      'ログイン情報が未設定です',
      'auth'
    );
  }

  const headers = {
    'Accept': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'Cookie': '_note_session_v5=' + env.NOTE_SESSION.trim()
  };

  if (post) {
    Object.assign(headers, {
      'Content-Type': 'application/json',
      'Origin': 'https://note.com',
      'Referer': referer
    });
  }

  let response;

  try {
    response = await fetch('https://note.com' + path, {
      method: post ? 'POST' : 'GET',
      headers,
      ...(post ? { body: '{}' } : {}),
      redirect: 'manual',
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    throw new Trouble('通信エラー・タイムアウト');
  }

  if (!response.ok) {
    const code = response.status;

    const raw = (
      response.headers.get('Retry-After') || ''
    ).trim();

    const parsed = /^\d+$/.test(raw)
      ? Number(raw) * 1000
      : Date.parse(raw) - Date.now();

    const retry = Number.isFinite(parsed)
      ? Math.max(0, parsed)
      : 0;

    await response.body?.cancel().catch(() => {});

    const kind = code === 429
      ? 'rate'
      : [401, 403].includes(code)
        ? 'auth'
        : code >= 500
          ? 'network'
          : 'response';

    const reason = code === 401
      ? 'ログイン情報の更新が必要'
      : code === 403
        ? 'アクセス拒否。ログイン情報や利用制限を確認'
        : code === 429
          ? '回数制限'
          : code === 422
            ? '送信内容などが受け付けられません'
            : '応答エラー';

    throw new Trouble(
      'note応答 ' + code + '：' + reason,
      kind,
      retry,
      code
    );
  }

  if (post) {
    await response.body?.cancel().catch(() => {});
    return;
  }

  try {
    const json = await response.json();
    const data = json?.data ?? json;

    if (!data || typeof data !== 'object') {
      throw new Error();
    }

    return data;
  } catch {
    throw new Trouble(
      '応答形式を確認できません',
      'response'
    );
  }
}

async function account(env) {
  const data = await api(env, '/api/v2/current_user');
  const user = data.user ?? data;

  if (!user?.id || !user?.urlname) {
    throw new Trouble(
      'ログイン情報の更新が必要です',
      'auth'
    );
  }

  return String(user.id);
}

async function article(env, key) {
  try {
    return await api(env, '/api/v3/notes/' + key);
  } catch (error) {
    if (error.code === 404) return null;
    throw error;
  }
}

async function acquire(env, automatic) {
  const now = Date.now();
  const token = crypto.randomUUID();

  const result = await sql(
    env,
    'UPDATE nh_control SET token=?, lease=?' +
    (automatic ? ', checked=?, next_at=?' : '') +
    ' WHERE id=1 AND lease<=?' +
    (automatic ? ' AND enabled=1 AND next_at<=?' : '') +
    ' AND NOT EXISTS (' +
    'SELECT 1 FROM nh_v13_connection ' +
    'WHERE slot=? AND hold_until>?)',
    token,
    now + LEASE,
    ...(automatic ? [now, now + 2 * HOUR] : []),
    now,
    ...(automatic ? [now] : []),
    env.SLOT,
    now
  ).run();

  return result.meta.changes ? token : null;
}

async function release(env, token) {
  await sql(
    env,
    "UPDATE nh_control SET token='', lease=0 " +
    "WHERE id=1 AND token=?",
    token
  ).run();
}

async function connection(original, slot, candidate = null) {
  let env = scoped(original, slot);

  if (candidate !== null) {
    candidate = cleanCookie(candidate);
    await encryptionKey(original);
  }

  const token = await acquire(env, false);

  if (!token) {
    return '処理中、またはnoteが指定した待機中です。状態欄を確認してください。';
  }

  try {
    const state = await sql(
      env,
      'SELECT * FROM nh_control WHERE id=1'
    ).first();

    const health = await sql(
      env,
      'SELECT * FROM nh_health WHERE id=1'
    ).first();

    if (
      health.kind === 'rate' &&
      state.next_at > Date.now()
    ) {
      return '回数制限のため ' +
        time(state.next_at) +
        ' 以降に接続確認してください。';
    }

    if (!state.account) {
      return 'この枠は未登録です。既存のNOTE_SESSION設定で開始し、登録してから利用してください。';
    }

    const gate = await sql(
      env,
      'UPDATE nh_v13_connection SET next_check=? ' +
      'WHERE slot=? AND next_check<=?',
      Date.now() + LEASE,
      slot,
      Date.now()
    ).run();

    if (!gate.meta.changes) {
      const row = await sql(
        env,
        'SELECT next_check FROM nh_v13_connection WHERE slot=?',
        slot
      ).first();

      return '次の接続確認・Cookie保存は ' +
        time(row.next_check) +
        ' 以降にできます。';
    }

    try {
      env = candidate !== null
        ? { ...env, NOTE_SESSION: candidate }
        : await loadCookie(env, state.account);

      const id = await account(env);

      if (id !== state.account) {
        throw new Trouble(
          '別のnoteです。選んだ枠に登録済みのnoteのCookieを使ってください',
          'mismatch'
        );
      }

      const other = await sql(
        scoped(original, slot === '1' ? '2' : '1'),
        'SELECT account FROM nh_control WHERE id=1'
      ).first();

      if (other.account === id) {
        throw new Trouble(
          'もう一方と同じnoteが登録されています。設定の確認が必要です',
          'mismatch'
        );
      }

      const message = candidate !== null
        ? '本人確認OK。新しいCookieを暗号化して保存しました。'
        : '接続確認OK。登録済みのnoteと一致しました。';

      const items = [];

      if (candidate !== null) {
        const encrypted = await encryptCookie(
          original,
          slot,
          id,
          candidate
        );

        items.push(
          sql(
            original,
            'INSERT INTO nh_v13_credentials ' +
            '(slot,iv,ciphertext,updated) VALUES (?,?,?,?) ' +
            'ON CONFLICT(slot) DO UPDATE SET ' +
            'iv=excluded.iv, ' +
            'ciphertext=excluded.ciphertext, ' +
            'updated=excluded.updated',
            slot,
            encrypted.iv,
            encrypted.ciphertext,
            Date.now()
          )
        );
      }

      items.push(
        sql(
          original,
          'UPDATE nh_v13_connection ' +
          'SET checked=?, ok=1, message=? WHERE slot=?',
          Date.now(),
          message,
          slot
        )
      );

      await original.DB.batch(items);

      return 'アカウント ' + slot + '：' + message +
        '\nいいねは送信していません。自動運転の休止期限は維持します。';
    } catch (error) {
      const message = error instanceof Trouble
        ? error.message
        : '通信・保存・内部処理のエラー。保存結果を確認できません。';

      const wait = error instanceof Trouble
        ? Math.max(
            error.retry,
            error.code === 429 ? 2 * HOUR : 0
          )
        : 0;

      await sql(
        original,
        'UPDATE nh_v13_connection ' +
        'SET checked=?, ok=0, message=?, ' +
        'hold_until=MAX(hold_until,?), ' +
        'next_check=MAX(next_check,?) WHERE slot=?',
        Date.now(),
        (candidate !== null ? '更新用Cookieの確認：' : '') +
          message,
        Date.now() + wait,
        Date.now() + Math.max(LEASE, wait),
        slot
      ).run();

      return 'アカウント ' + slot + '：' + message +
        '\n本人確認に失敗したCookieは保存しません。いいねは送信していません。';
    }
  } finally {
    await release(env, token);
  }
}

async function run(baseEnv) {
  const token = await acquire(baseEnv, true);

  if (!token) return;

  let env = baseEnv;
  let stage = 'ログイン確認';

  const finish = async (message, success = false) => {
    await env.DB.batch([
      sql(
        env,
        'UPDATE nh_control SET message=?, next_at=? ' +
        'WHERE id=1 AND token=?',
        message,
        Math.floor(Date.now() / INTERVAL) * INTERVAL +
          INTERVAL,
        token
      ),
      sql(
        env,
        "UPDATE nh_health SET " +
        "errors=CASE WHEN ? THEN 0 ELSE errors END, " +
        "kind='', " +
        "rate_fail=CASE WHEN ? THEN 0 ELSE rate_fail END, " +
        "success_at=CASE WHEN ? THEN ? ELSE success_at END " +
        "WHERE id=1",
        +success,
        +success,
        +success,
        Date.now()
      )
    ]);
  };

  try {
    const state = await sql(
      env,
      'SELECT * FROM nh_control WHERE id=1'
    ).first();

    env = await loadCookie(env, state.account);

    if (await account(env) !== state.account) {
      throw new Trouble(
        '登録済みのnoteとログイン情報が一致しません',
        'auth'
      );
    }

    if (state.inflight) {
      stage = '前回送信の確認';

      const data = await article(env, state.inflight);
      const liked = data?.is_liked === true;

      const before = await sql(
        env,
        'SELECT status FROM nh_seen WHERE key=?',
        state.inflight
      ).first();

      const add = liked && before?.status !== 'liked';

      const items = [
        sql(
          env,
          'INSERT INTO nh_seen VALUES (?,?,?) ' +
          'ON CONFLICT(key) DO UPDATE SET status=excluded.status',
          state.inflight,
          liked ? 'liked' : 'uncertain',
          Date.now()
        ),
        sql(
          env,
          "UPDATE nh_control SET inflight='', total=total+? " +
          "WHERE id=1 AND token=?",
          +add,
          token
        )
      ];

      if (add) {
        items.push(
          sql(
            env,
            'INSERT OR IGNORE INTO nh_v13_success VALUES (?,?,?,?)',
            env.SLOT,
            state.inflight,
            day(),
            Date.now()
          )
        );
      }

      await env.DB.batch(items);

      await finish(
        liked
          ? '前回の記事のスキを確認しました。次回から候補を確認します'
          : '前回の記事は再送せず除外しました'
      );

      return;
    }

    stage = '記事一覧の取得';

    const tags = ORDERS[env.SLOT];
    const tag = tags[state.cursor % tags.length];

    await sql(
      env,
      'UPDATE nh_control SET cursor=cursor+1 ' +
      'WHERE id=1 AND token=?',
      token
    ).run();

    const data = await api(
      env,
      '/api/v3/hashtags/' +
      encodeURIComponent(tag) +
      '/notes?order=new&page=1'
    );

    if (!Array.isArray(data.notes)) {
      throw new Trouble(
        '記事一覧の形式を確認できません',
        'response'
      );
    }

    const keys = [...new Set(
      data.notes
        .map(n => n?.key)
        .filter(k =>
          typeof k === 'string' &&
          /^n[a-z0-9]+$/.test(k)
        )
    )].slice(0, 50);

    if (!keys.length) {
      await finish('#' + tag + '：記事なし');
      return;
    }

    const marks = keys.map(() => '?').join(',');

    const seen = await sql(
      env,
      'SELECT key FROM nh_seen WHERE key IN (' +
      marks +
      ') UNION SELECT key FROM nh_shared WHERE key IN (' +
      marks + ')',
      ...keys,
      ...keys
    ).all();

    const done = new Set(seen.results.map(r => r.key));
    const key = keys.find(k => !done.has(k));

    if (!key) {
      await finish(
        '#' + tag + '：履歴・共通予約を除く候補なし'
      );
      return;
    }

    stage = '記事確認';

    const note = await article(env, key);

    if (
      !note ||
      note.is_liked === true ||
      String(note.user?.id ?? note.user_id) === state.account
    ) {
      await sql(
        env,
        "INSERT OR IGNORE INTO nh_seen VALUES (?, 'skip', ?)",
        key,
        Date.now()
      ).run();

      await finish(
        '#' + tag + '：削除済み・スキ済み・自分の記事を除外'
      );
      return;
    }

    const referer = note.note_url || (
      note.user?.urlname
        ? 'https://note.com/' +
          note.user.urlname + '/n/' + key
        : ''
    );

    let valid = false;

    try {
      const u = new URL(referer);

      valid =
        u.origin === 'https://note.com' &&
        u.pathname.endsWith('/n/' + key);
    } catch {}

    if (!valid) {
      throw new Trouble(
        '記事URLを確認できません',
        'response'
      );
    }

    stage = '共通予約の保存';

    const reserved = await env.DB.batch([
      sql(
        env,
        'INSERT OR IGNORE INTO nh_shared ' +
        '(key,slot,token,created) ' +
        'SELECT ?,?,?,? FROM nh_control ' +
        'WHERE id=1 AND token=? AND enabled=1 AND lease>?',
        key,
        env.SLOT,
        token,
        Date.now(),
        token,
        Date.now()
      ),
      sql(
        env,
        "INSERT OR IGNORE INTO nh_seen (key,status,created) " +
        "SELECT ?, 'pending', ? WHERE EXISTS (" +
        "SELECT 1 FROM nh_shared WHERE key=? AND token=?)",
        key,
        Date.now(),
        key,
        token
      ),
      sql(
        env,
        'UPDATE nh_control SET inflight=?, lease=? ' +
        'WHERE id=1 AND token=? AND enabled=1 AND lease>? ' +
        'AND EXISTS (' +
        'SELECT 1 FROM nh_shared WHERE key=? AND token=?)',
        key,
        Date.now() + LEASE,
        token,
        Date.now(),
        key,
        token
      )
    ]);

    if (
      !reserved[0].meta.changes ||
      !reserved[2].meta.changes
    ) {
      await finish(
        '共通予約済み、または停止操作により送信を見送りました'
      );
      return;
    }

    stage = 'スキ送信';

    await api(
      env,
      '/api/v3/notes/' + key + '/likes',
      true,
      referer
    );

    stage = '送信後の確認';

    if ((await article(env, key))?.is_liked !== true) {
      throw new Trouble(
        '送信結果は未確認。再送せず次回に確認します'
      );
    }

    await env.DB.batch([
      sql(
        env,
        "UPDATE nh_seen SET status='liked' WHERE key=?",
        key
      ),
      sql(
        env,
        "UPDATE nh_control SET inflight='', total=total+1 " +
        "WHERE id=1 AND token=?",
        token
      ),
      sql(
        env,
        'INSERT OR IGNORE INTO nh_v13_success VALUES (?,?,?,?)',
        env.SLOT,
        key,
        day(),
        Date.now()
      )
    ]);

    await finish(
      'スキ確認済み：' + key + '（#' + tag + '）',
      true
    );
  } catch (error) {
    const kind = error instanceof Trouble
      ? error.kind
      : 'storage';

    const h = await sql(
      env,
      'SELECT * FROM nh_health WHERE id=1'
    ).first();

    const errors = Number(h.errors) + 1;

    const rates = Number(h.rate_fail) +
      (kind === 'rate' ? 1 : 0);

    const serverWait = error instanceof Trouble
      ? error.retry
      : 0;

    const wait = Math.max(
      (errors === 1 ? 2 : 3) * HOUR,
      serverWait
    );

    const message =
      '自動再確認待ち：' + stage + '／' +
      (
        error instanceof Trouble
          ? error.message
          : '保存・内部処理のエラー'
      );

    await env.DB.batch([
      sql(
        env,
        'UPDATE nh_health SET rate_fail=?, errors=?, kind=? ' +
        'WHERE id=1',
        rates,
        errors,
        kind
      ),
      sql(
        env,
        'UPDATE nh_control SET next_at=?, message=? ' +
        'WHERE id=1 AND token=?',
        Date.now() + wait,
        message,
        token
      ),
      sql(
        env,
        'UPDATE nh_v13_connection ' +
        'SET hold_until=MAX(hold_until,?) WHERE slot=?',
        Date.now() + serverWait,
        env.SLOT
      )
    ]);
  } finally {
    await release(env, token);
  }
}

async function dashboard(original, prefix = '') {
  const blocks = [];

  for (const slot of SLOTS) {
    const env = scoped(original, slot);

    const s = await sql(
      env,
      'SELECT * FROM nh_control WHERE id=1'
    ).first();

    const h = await sql(
      env,
      'SELECT * FROM nh_health WHERE id=1'
    ).first();

    const c = await sql(
      env,
      'SELECT * FROM nh_v13_connection WHERE slot=?',
      slot
    ).first();

    const saved = await sql(
      env,
      'SELECT updated FROM nh_v13_credentials WHERE slot=?',
      slot
    ).first();

    const today = await sql(
      env,
      'SELECT COUNT(*) AS count FROM nh_v13_success ' +
      'WHERE slot=? AND day=?',
      slot,
      day()
    ).first();

    const now = Date.now();

    const next = Math.max(
      s.next_at,
      s.lease,
      c.hold_until
    );

    const verified =
      c.ok === 1 && c.checked >= s.checked;

    let status;

    if (!s.enabled) {
      status = '停止中（開始操作が必要）';
    } else if (s.lease > now) {
      status = 'ON・処理中';
    } else if (h.kind === 'auth' && !verified) {
      status = s.message.includes('401')
        ? 'ON・ログイン情報の更新が必要'
        : 'ON・ログイン情報やアクセス拒否の確認が必要';
    } else if (h.kind === 'config') {
      status = 'ON・暗号化キーなどの設定確認が必要';
    } else if (h.kind === 'auth' && verified) {
      status = 'ON・接続修復を確認済み／自動実行待ち';
    } else if (next > now) {
      status = h.kind === 'rate'
        ? 'ON・回数制限で休止中'
        : h.kind
          ? 'ON・エラー後の休止中'
          : 'ON・次の実行待ち';
    } else {
      status = 'ON・定期実行待ち';
    }

    blocks.push(
      'アカウント ' + slot +
      '\n状態：' + status +
      '\n今日のスキ確認成功：' +
      today.count + '件（日本時間）' +
      '\n累計：' + s.total + '件' +
      '\n最終自動実行：' + time(s.checked) +
      '\n最終送信成功：' + time(h.success_at) +
      (
        s.enabled
          ? '\n次回：' + (
              next > now
                ? time(next) + '以降の定期実行'
                : '次の定期実行'
            )
          : ''
      ) +
      '\n失敗回数：' + h.errors +
      '\n429回数：' + h.rate_fail +
      '\n\n【手動の接続確認・Cookie更新】' +
      '\n確認日時：' + time(c.checked) +
      '\n' + c.message +
      '\n※この確認日時時点の結果です。' +
      '\nCookie保存先：' + (
        saved
          ? '暗号化保存済み（管理画面の設定を優先）'
          : 'CloudflareのSecret'
      ) +
      (
        saved
          ? '\nCookie更新日時：' + time(saved.updated)
          : ''
      ) +
      '\n\n前回の自動実行記録：' + s.message +
      '\n巡回順：' + ORDERS[slot].join(' → ')
    );
  }

  return [
    prefix,
    ...blocks,
    '今日の件数はv13導入後に成功を確認した分です。過去の送信結果を後から確認した分も、確認した日に計上します。以前の累計は保持します。'
  ].filter(Boolean).join('\n\n──────────\n\n');
}

export default {
  async fetch(request, original) {
    const url = new URL(request.url);

    if (
      url.pathname === '/' &&
      request.method === 'GET'
    ) {
      return page(
        undefined,
        url.searchParams.get('account') === '2' ? '2' : '1'
      );
    }

    if (
      url.pathname !== '/control' ||
      request.method !== 'POST'
    ) {
      return reply('Not found', false, 404);
    }

    if (request.headers.get('Origin') !== url.origin) {
      return reply(
        '操作画面を開き直してください。',
        false,
        403
      );
    }

    if (!original.ADMIN_KEY || !original.DB) {
      return page(
        'ADMIN_KEY または DB の設定を確認してください。'
      );
    }

    let slot = '1';

    try {
      const body = await request.text();

      if (body.length > 100000) {
        return reply('入力が長すぎます。', false, 413);
      }

      const form = new URLSearchParams(body);

      if (form.get('key') !== original.ADMIN_KEY) {
        return reply(
          '管理用の鍵が違います。',
          false,
          403
        );
      }

      slot = form.get('account') || '1';
      const action = form.get('action');

      if (
        !SLOTS.includes(slot) ||
        !['status', 'start', 'stop', 'check', 'save'].includes(action)
      ) {
        return reply(
          '操作を選んでください。',
          false,
          400
        );
      }

      await prepare(original);

      const env = scoped(original, slot);
      let message = '';

      if (action === 'check' || action === 'save') {
        message = await connection(
          original,
          slot,
          action === 'save'
            ? form.get('cookie') || ''
            : null
        );
      } else if (action === 'stop') {
        await sql(
          env,
          'UPDATE nh_control SET enabled=0 WHERE id=1'
        ).run();

        message = 'アカウント ' + slot + ' を停止しました。';
      } else if (action === 'start') {
        const token = await acquire(env, false);

        if (!token) {
          message = '処理中、またはnoteが指定した待機中です。';
        } else {
          try {
            const s = await sql(
              env,
              'SELECT * FROM nh_control WHERE id=1'
            ).first();

            const id = s.account || await account(env);

            const other = await sql(
              scoped(original, slot === '1' ? '2' : '1'),
              'SELECT account FROM nh_control WHERE id=1'
            ).first();

            if (other.account === id) {
              message =
                'もう一方と同じnoteです。ログイン情報を確認してください。';
            } else {
              await sql(
                env,
                'UPDATE nh_control SET enabled=1, account=? ' +
                'WHERE id=1 AND token=?',
                id,
                token
              ).run();

              message = 'アカウント ' + slot +
                ' をONにしました。休止期限は保持します。';
            }
          } finally {
            await release(env, token);
          }
        }
      }

      return page(
        await dashboard(original, message),
        slot
      );
    } catch (error) {
      const message = error instanceof Trouble
        ? error.message
        : '接続・保存・設定の確認に失敗しました。';

      try {
        return page(
          await dashboard(original, message),
          slot
        );
      } catch {
        return page(message, slot);
      }
    }
  },

  async scheduled(event, original, ctx) {
    ctx.waitUntil((async () => {
      try {
        await prepare(original);
      } catch {
        console.error(
          'note-helper: database initialization failed'
        );
        return;
      }

      await Promise.all(SLOTS.map(async slot => {
        try {
          await run(scoped(original, slot));
        } catch {
          console.error(
            'note-helper: account ' + slot +
            ' storage/runtime failure'
          );
        }
      }));
    })());
  }
};
