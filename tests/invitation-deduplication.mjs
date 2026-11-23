import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';

const source=await readFile(new URL('../worker.js',import.meta.url),'utf8');
const {Desk520,openInvite520}=await import('data:text/javascript;base64,'+
  Buffer.from(source+'\nexport {Desk520,openInvite520};').toString('base64'));

test('overlapping deliveries keep one usable invitation and preserve previously opened links',async t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  let serial=0;
  const storage={
    sql:{exec(q,...args){return {toArray:()=>db.prepare(q).all(...args)};}},
    transactionSync(fn){
      const name='step'+ ++serial;db.exec('SAVEPOINT '+name);
      try{const result=fn();db.exec('RELEASE '+name);return result;}
      catch(e){db.exec('ROLLBACK TO '+name);db.exec('RELEASE '+name);throw e;}
    }
  };
  const env={COOKIE_ENCRYPTION_KEY:'01'.repeat(32)};
  const desk=new Desk520(storage,env);desk.init();
  const id='md3a807653baf',base='https://note.com/join/'+id;
  const waiting=()=>db.prepare("SELECT * FROM desk_invite WHERE id=? AND phase='wait'").all(id);
  const receive=link=>desk.saveInvitationMail520('綴り灯の共同運営への招待 '+link);
  const result=await Promise.all([desk.saveInvitation520(base),receive(base),receive(base)]);
  assert.equal(result.filter(s=>s.includes('暗号化して保存')).length,1);
  assert.equal(waiting().length,1);
  assert.equal(await openInvite520(env,waiting()[0]),base);

  const opened=waiting()[0];
  db.prepare("UPDATE desk_invite SET phase='opened',iv='',ciphertext='' WHERE hash=?").run(opened.hash);
  const second=base+'?code=second',third=base+'?code=third';
  await receive(second);const retired=waiting()[0];
  await Promise.all([receive(third),desk.saveInvitation520(third),receive(base)]);
  assert.equal(waiting().length,1);assert.equal(await openInvite520(env,waiting()[0]),third);
  await receive(second);
  assert.equal(await openInvite520(env,waiting()[0]),third);
  assert.equal(db.prepare('SELECT phase FROM desk_invite WHERE hash=?').get(opened.hash).phase,'opened');
  assert.deepEqual({...db.prepare('SELECT phase,iv,ciphertext FROM desk_invite WHERE hash=?').get(retired.hash)},
    {phase:'replaced',iv:'',ciphertext:''});
  assert.equal(db.prepare('SELECT COUNT(*) n FROM desk_invite').get().n,3);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM desk_member WHERE id=? AND mode=\'auto\'').get(id).n,0);
});
