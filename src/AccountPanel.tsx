import {useState,useEffect} from 'react';
import type {Member} from '@/server/roster';

type AccountMember=Member&{activated:number};

export function AccountPanel({me,onChanged}:{me:Member;onChanged:()=>Promise<void>}){
 const [members,setMembers]=useState<AccountMember[]>([]);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [busy,setBusy]=useState('');
 const [link,setLink]=useState('');
 const [target,setTarget]=useState('');
 const [copied,setCopied]=useState(false);
 const [newName,setNewName]=useState('');
 const [editing,setEditing]=useState('');
 const [editName,setEditName]=useState('');

 async function refresh(){
  const r=await fetch('/api/admin/members',{cache:'no-store'});
  const d=await r.json() as {error?:string;members:AccountMember[]};
  if(!r.ok)throw Error(d.error);
  setMembers(d.members);
 }
 useEffect(()=>{refresh().catch(e=>setError(e.message))},[]);

 async function change(action:{action:'add';name:string}|{action:'rename';memberId:string;name:string}){
  setBusy(action.action);setError('');setNotice('');
  try{
   const r=await fetch('/api/admin/members',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action)});
   const d=await r.json() as {error?:string;message?:string};
   if(!r.ok)throw Error(d.error);
   await refresh();await onChanged();
   setNotice(d.message||'已保存');setNewName('');setEditing('');
  }catch(e){setError((e as Error).message)}finally{setBusy('')}
 }

 async function invite(m:Member){
  setBusy(m.id);setError('');setNotice('');setLink('');setCopied(false);
  try{
   const r=await fetch('/api/admin/invite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({memberId:m.id})});
   const d=await r.json() as {error?:string;url:string};
   if(!r.ok)throw Error(d.error);
   setLink(d.url);setTarget(m.name);
  }catch(e){setError((e as Error).message)}finally{setBusy('')}
 }

 return <div>
  <form className="member-add" onSubmit={e=>{e.preventDefault();change({action:'add',name:newName})}}>
   <label htmlFor="new-member-name">添加队员</label>
   <div><input id="new-member-name" required maxLength={40} placeholder="填写完整姓名" value={newName} onChange={e=>setNewName(e.target.value)}/><button className="primary" disabled={!!busy} type="submit">{busy==='add'?'添加中…':'添加'}</button></div>
   <p>添加后，请为队员生成邀请链接并通过微信私聊发送。</p>
  </form>
  {error&&<div className="error" role="alert">{error}</div>}
  {notice&&<p className="member-notice" role="status">{notice}</p>}
  {link&&<div className="invite-result"><strong>{target}的专属邀请</strong><p>请通过微信私聊发给本人，不要发到群里。</p><textarea aria-label="专属邀请链接" readOnly value={link}/><button className="primary" onClick={async()=>{try{await navigator.clipboard.writeText(link);setCopied(true)}catch{setError('无法自动复制，请长按上方链接手动复制')}}}>{copied?'已复制':'复制邀请链接'}</button></div>}
  <div className="account-list">{members.map(m=><div className="account-row" key={m.id}>
   <div className="account-person">{editing===m.id?<form className="member-rename" onSubmit={e=>{e.preventDefault();change({action:'rename',memberId:m.id,name:editName})}}><input autoFocus required maxLength={40} aria-label={`修改${m.name}的姓名`} value={editName} onChange={e=>setEditName(e.target.value)}/><button className="secondary" disabled={!!busy} type="submit">保存</button><button className="secondary" type="button" onClick={()=>setEditing('')}>取消</button></form>:<strong>{m.name}</strong>}<span>{m.role} · {m.activated?'已激活':'未激活'}</span></div>
   {editing!==m.id&&<div className="account-actions"><button className="secondary" disabled={!!busy} onClick={()=>{setEditing(m.id);setEditName(m.name)}}>改名</button>{m.id!==me.id?<button className="secondary" disabled={!!busy} onClick={()=>invite(m)}>{busy===m.id?'生成中…':m.activated?'重置邀请':'生成邀请'}</button>:<small>当前账号</small>}</div>}
  </div>)}</div>
 </div>
}
