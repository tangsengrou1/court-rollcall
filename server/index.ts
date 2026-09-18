import {z} from 'zod';
import type {Event,Team,Member} from './roster';
type Env={DB:D1Database;ASSETS:Fetcher;AUTH_PEPPER:string};
type User=Member&{salt:string|null;password_hash:string|null;auth_version:number;enabled:number};
class ApiError extends Error{constructor(public status:number,message:string){super(message)}}
const json=(v:unknown,status=200,headers:Record<string,string>={})=>Response.json(v,{status,headers:{'Cache-Control':'no-store',...headers}});
const encoder=new TextEncoder();
const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('');
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
const sha=async(s:string)=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(s)));
async function passwordHash(password:string,salt:string,pepper:string){
 if(!pepper)throw new ApiError(503,'登录服务尚未完成配置');
 const pk=await crypto.subtle.importKey('raw',encoder.encode(pepper),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const material=await crypto.subtle.sign('HMAC',pk,encoder.encode(password));
 const key=await crypto.subtle.importKey('raw',material,'PBKDF2',false,['deriveBits']);
 return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(salt),iterations:100000,hash:'SHA-512'},key,256));
}
function equal(a:string,b:string){let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0}
const now=()=>Math.floor(Date.now()/1000);
function cookieName(req:Request){return new URL(req.url).protocol==='https:'?'__Host-court':'court_local'}
function cookie(req:Request,value:string,max=60*60*24*14){return `${cookieName(req)}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${max}${new URL(req.url).protocol==='https:'?'; Secure':''}`}
function sessionToken(req:Request){return (req.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName(req)+'='))?.split('=')[1]||''}
async function current(req:Request,env:Env):Promise<User>{const t=sessionToken(req);if(!/^[a-f0-9]{64}$/.test(t))throw new ApiError(401,'请先登录');const u=await env.DB.prepare('SELECT m.* FROM sessions s JOIN members m ON s.member_id=m.id WHERE s.hash=? AND s.expires>? AND s.auth_version=m.auth_version AND m.enabled=1').bind(await sha(t),now()).first<User>();if(!u)throw new ApiError(401,'登录已失效，请重新登录');return u}
async function session(env:Env,u:User){const t=random();await env.DB.prepare('INSERT INTO sessions(hash,member_id,auth_version,expires) VALUES(?,?,?,?)').bind(await sha(t),u.id,u.auth_version,now()+1209600).run();return t}
async function limit(req:Request,env:Env,account=''){
 const ip=req.headers.get('CF-Connecting-IP')||'local';const bucket=Math.floor(now()/900);
 for(const [key,max]of [[`ip:${ip}`,120],...(account?[[`account:${account}`,12]]:[])] as [string,number][]){const k=await sha(`${bucket}:${key}`);const row=await env.DB.prepare('INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(k,now()+1800).first<{count:number}>();if((row?.count||0)>max)throw new ApiError(429,'尝试次数较多，请 15 分钟后重试')}
}
function publicUser(u:User){return {id:u.id,name:u.name,role:u.role}}
const actionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),revision:z.number().int().nonnegative(),event:z.object({title:z.string().trim().min(1).max(60),type:z.enum(['训练','比赛']),date:z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/),place:z.string().trim().min(1).max(100)})}),
 z.object({action:z.literal('respond'),revision:z.number().int().nonnegative(),eventId:z.string().max(100),memberId:z.string().max(100),status:z.string().max(10),reason:z.string().max(200).optional()}),
 z.object({action:z.literal('attendance'),revision:z.number().int().nonnegative(),eventId:z.string().max(100),memberId:z.string().max(100),status:z.string().max(10)}),
 z.object({action:z.enum(['bulk','close']),revision:z.number().int().nonnegative(),eventId:z.string().max(100)})
]);
async function snapshot(env:Env,u:User){const row=await env.DB.prepare('SELECT data,revision FROM team_state WHERE id=?').bind('team').first<{data:string;revision:number}>();if(!row)throw new ApiError(503,'球队资料尚未初始化');const members=(await env.DB.prepare('SELECT id,name,role,joined_at FROM members WHERE enabled=1 ORDER BY rowid').all<Member>()).results;const events:Event[]=JSON.parse(row.data);for(const e of events){const reasons=e.leaveReasons||{};if(u.role!=='管理员')e.leaveReasons=u.role==='队员'&&reasons[u.id]?{[u.id]:reasons[u.id]}:{};if(u.role==='队员')e.attendance=e.attendance[u.id]?{[u.id]:e.attendance[u.id]}:{}}return {team:{members,events},revision:row.revision,me:publicUser(u)}}
async function api(req:Request,env:Env,ctx:ExecutionContext){
 const url=new URL(req.url),path=url.pathname;
 if(req.method!=='GET'&&req.method!=='POST')throw new ApiError(405,'不支持的操作');
 if(req.method==='POST'){
  if(req.headers.get('Origin')!==url.origin)throw new ApiError(403,'请求来源无效，请从网站页面操作');
  if(!req.headers.get('Content-Type')?.startsWith('application/json'))throw new ApiError(415,'请求格式无效');
  if(Number(req.headers.get('Content-Length')||0)>16384)throw new ApiError(413,'提交内容过长');
 }
 const body=async()=>{const text=await req.text();if(text.length>16384)throw new ApiError(413,'提交内容过长');try{return JSON.parse(text)}catch{throw new ApiError(400,'提交内容无效')}};
 if(path==='/api/auth/login'&&req.method==='POST'){
  const p=z.object({name:z.string().trim().min(1).max(40),password:z.string().min(1).max(128)}).parse(await body());await limit(req,env,p.name);
  const u=await env.DB.prepare('SELECT * FROM members WHERE name=? AND enabled=1').bind(p.name).first<User>();
  const hash=await passwordHash(p.password,u?.salt||'unknown-account-dummy-salt',env.AUTH_PEPPER);
  if(!u?.password_hash||!equal(hash,u.password_hash))throw new ApiError(401,'姓名或密码不正确，或账号尚未激活');
  const t=await session(env,u);return json({me:publicUser(u)},200,{'Set-Cookie':cookie(req,t)});
 }
 if(path==='/api/auth/invite'&&req.method==='POST'){
  const p=z.object({token:z.string().regex(/^[a-f0-9]{64}$/)}).parse(await body());await limit(req,env);
  const m=await env.DB.prepare('SELECT id,name,role FROM members WHERE invite_hash=? AND invite_expires>? AND enabled=1').bind(await sha(p.token),now()).first();if(!m)throw new ApiError(400,'邀请链接已失效，请联系管理员重新发放');return json({member:m});
 }
 if(path==='/api/auth/activate'&&req.method==='POST'){
  const p=z.object({token:z.string().regex(/^[a-f0-9]{64}$/),password:z.string().min(12).max(128)}).parse(await body());await limit(req,env);
  const ih=await sha(p.token);const existing=await env.DB.prepare('SELECT id FROM members WHERE invite_hash=? AND invite_expires>? AND enabled=1').bind(ih,now()).first();if(!existing)throw new ApiError(400,'邀请链接已失效，请联系管理员');
  const salt=random(),hash=await passwordHash(p.password,salt,env.AUTH_PEPPER);
  const u=await env.DB.prepare('UPDATE members SET salt=?,password_hash=?,invite_hash=NULL,invite_expires=NULL,auth_version=auth_version+1 WHERE invite_hash=? AND invite_expires>? AND enabled=1 RETURNING *').bind(salt,hash,ih,now()).first<User>();if(!u)throw new ApiError(409,'邀请已使用，请直接登录');
  await env.DB.prepare('INSERT INTO audit(actor,action,detail,created_at) VALUES(?,?,?,?)').bind(u.id,'activate',JSON.stringify({memberId:u.id}),now()).run();const t=await session(env,u);return json({me:publicUser(u)},200,{'Set-Cookie':cookie(req,t)});
 }
 const u=await current(req,env);
 if(path==='/api/auth/logout'&&req.method==='POST'){await env.DB.prepare('DELETE FROM sessions WHERE hash=?').bind(await sha(sessionToken(req))).run();return json({ok:true},200,{'Set-Cookie':cookie(req,'',0)})}
 if(path==='/api/team'&&req.method==='GET')return json(await snapshot(env,u));
 if(path==='/api/admin/members'&&req.method==='GET'){
  if(u.role!=='管理员')throw new ApiError(403,'仅管理员可以管理账号');
  return json({members:(await env.DB.prepare('SELECT id,name,role,enabled,password_hash IS NOT NULL AS activated,invite_expires FROM members ORDER BY rowid').all()).results});
 }
 if(path==='/api/admin/members'&&req.method==='POST'){
  if(u.role!=='管理员')throw new ApiError(403,'仅管理员可以维护名单');
  const p=z.discriminatedUnion('action',[
   z.object({action:z.literal('add'),name:z.string().trim().min(1).max(40)}),
   z.object({action:z.literal('rename'),memberId:z.string().max(100),name:z.string().trim().min(1).max(40)})
  ]).parse(await body());
  const duplicate=await env.DB.prepare('SELECT id FROM members WHERE name=?').bind(p.name).first<{id:string}>();
  if(duplicate&&('memberId' in p?duplicate.id!==p.memberId:true))throw new ApiError(409,'名单中已有这个姓名');
  if(p.action==='add'){
   const id=`member-${crypto.randomUUID()}`;
   await env.DB.batch([
    env.DB.prepare("INSERT INTO members(id,name,role,joined_at) VALUES(?,?,'队员',?)").bind(id,p.name,now()),
    env.DB.prepare('INSERT INTO audit(actor,action,detail,created_at) VALUES(?,?,?,?)').bind(u.id,'member_add',JSON.stringify({memberId:id,name:p.name}),now())
   ]);
   return json({member:{id,name:p.name,role:'队员'},message:'已添加队员，请为其生成专属邀请'},201);
  }
  const old=await env.DB.prepare('SELECT id,name FROM members WHERE id=? AND enabled=1').bind(p.memberId).first<{id:string;name:string}>();
  if(!old)throw new ApiError(404,'成员不存在');
  if(old.name!==p.name)await env.DB.batch([
   env.DB.prepare('UPDATE members SET name=? WHERE id=?').bind(p.name,p.memberId),
   env.DB.prepare('INSERT INTO audit(actor,action,detail,created_at) VALUES(?,?,?,?)').bind(u.id,'member_rename',JSON.stringify({memberId:p.memberId,oldName:old.name,newName:p.name}),now())
  ]);
  return json({member:{id:p.memberId,name:p.name},message:'姓名已更新，原出勤记录和账号保持关联'});
 }
 if(path==='/api/admin/invite'&&req.method==='POST'){
  if(u.role!=='管理员')throw new ApiError(403,'仅管理员可以发放邀请');
  const p=z.object({memberId:z.string().max(100)}).parse(await body());if(p.memberId===u.id)throw new ApiError(400,'请由另一位管理员为你重置账号');
  const target=await env.DB.prepare('SELECT id FROM members WHERE id=? AND enabled=1').bind(p.memberId).first();if(!target)throw new ApiError(404,'成员不存在');
  const t=random();await env.DB.batch([env.DB.prepare('UPDATE members SET invite_hash=?,invite_expires=? WHERE id=?').bind(await sha(t),now()+604800,p.memberId),env.DB.prepare('INSERT INTO audit(actor,action,detail,created_at) VALUES(?,?,?,?)').bind(u.id,'invite',JSON.stringify({memberId:p.memberId}),now())]);return json({url:`${url.origin}/#invite=${t}`,expires:now()+604800});
 }
 if(path==='/api/admin/audit'&&req.method==='GET'){if(u.role!=='管理员')throw new ApiError(403,'仅管理员可以查看操作记录');return json({entries:(await env.DB.prepare('SELECT a.id,m.name AS actor,a.action,a.detail,a.created_at FROM audit a LEFT JOIN members m ON m.id=a.actor ORDER BY a.id DESC LIMIT 100').all()).results})}
 if(path==='/api/team'&&req.method==='POST'){
  const p=actionSchema.parse(await body());
  if(p.action==='respond'&&p.memberId!==u.id)throw new ApiError(403,'只能修改自己的报名');
  if(p.action==='create'&&u.role!=='管理员')throw new ApiError(403,'仅管理员可以创建活动');
  if(['attendance','bulk','close'].includes(p.action)&&u.role==='队员')throw new ApiError(403,'仅管理员和教练可以点名');
  const row=await env.DB.prepare('SELECT data,revision FROM team_state WHERE id=?').bind('team').first<{data:string;revision:number}>();if(!row)throw new ApiError(503,'球队尚未初始化');if(p.revision!==row.revision)throw new ApiError(409,'记录已更新，请刷新后重试');
  const events:Event[]=JSON.parse(row.data);const members=(await env.DB.prepare("SELECT id,joined_at FROM members WHERE enabled=1 AND role<>'教练'").all<{id:string;joined_at:number}>()).results;
  if(p.action==='create'){
   const start=Date.parse(p.event.date+'+08:00');if(!Number.isFinite(start)||start<=Date.now())throw new ApiError(400,'请选择未来的活动时间');events.unshift({...p.event,id:crypto.randomUUID(),closed:false,responses:{},attendance:{}});
  }else{
   const e=events.find(e=>e.id===p.eventId);if(!e)throw new ApiError(404,'活动不存在');
   const participants=members.filter(m=>Date.parse(e.date+'+08:00')>=m.joined_at*1000);
   if(p.action==='respond'||p.action==='attendance'){
    if(!participants.some(m=>m.id===p.memberId))throw new ApiError(404,'该成员不在本场活动名单中');
    if(p.action==='respond'){
     if(!['参加','待定','请假'].includes(p.status))throw new ApiError(400,'报名状态无效');if(e.closed||Date.parse(e.date+'+08:00')<=Date.now())throw new ApiError(400,'活动已截止报名');
     if(p.status==='请假'){const reason=p.reason?.trim();if(!reason||Array.from(reason).length>50)throw new ApiError(400,'请填写 1～50 字的请假理由');e.leaveReasons??={};e.leaveReasons[u.id]=reason}else if(e.leaveReasons)delete e.leaveReasons[u.id];
     e.responses[u.id]=p.status;
    }else{
     if(!['到场','迟到','请假','缺席','未点名'].includes(p.status)||(e.closed&&p.status==='未点名'))throw new ApiError(400,'出勤状态无效');e.attendance[p.memberId]=p.status;
    }
   }else if(p.action==='bulk'){for(const m of participants)if(e.responses[m.id]==='参加'&&(!e.attendance[m.id]||e.attendance[m.id]==='未点名'))e.attendance[m.id]='到场'}
   else if(p.action==='close'){if(Date.parse(e.date+'+08:00')>Date.now())throw new ApiError(400,'活动开始后才能结束点名');if(participants.some(m=>!e.attendance[m.id]||e.attendance[m.id]==='未点名'))throw new ApiError(400,'请先完成所有成员的点名');e.closed=true}
  }
  const results=await env.DB.batch([
   env.DB.prepare('UPDATE team_state SET data=?,revision=revision+1 WHERE id=? AND revision=?').bind(JSON.stringify(events),'team',row.revision),
   env.DB.prepare('INSERT INTO audit(actor,action,detail,created_at) SELECT ?,?,?,? WHERE changes()>0').bind(u.id,p.action,JSON.stringify(p),now())
  ]);if(!results[0].meta.changes)throw new ApiError(409,'记录已更新，请刷新后重试');
  return json(await snapshot(env,u));
 }
 throw new ApiError(404,'页面不存在');
}
export default {async fetch(req:Request,env:Env,ctx:ExecutionContext){let response:Response;try{response=new URL(req.url).pathname.startsWith('/api/')?await api(req,env,ctx):await env.ASSETS.fetch(req)}catch(e){if(e instanceof ApiError)response=json({error:e.message},e.status);else if(e instanceof z.ZodError)response=json({error:'请检查填写内容；密码需为 12～128 个字符。'},400);else{console.error('Request failed',e instanceof Error?e.message:'unknown');response=json({error:'服务暂不可用，请稍后重试'},503)}}const r=new Response(response.body,response);r.headers.set('X-Content-Type-Options','nosniff');r.headers.set('Referrer-Policy','no-referrer');r.headers.set('X-Frame-Options','DENY');r.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");return r}};
