/* Additive, admin-verified task qualification policy (PostgreSQL). */
const SKILLS=['ai_evaluation','transcription','annotation','research','software','design','data_entry'];
const LEVELS={beginner:1,intermediate:2,advanced:3};
function reject(message,status=400){
 const error=new Error(message);error.status=status;throw error;
}
function skill(value){
 if(typeof value!=='string'||!SKILLS.includes(value))reject('Choose a supported skill');
 return value;
}
function level(value){
 const key=String(value||'').toLowerCase();
 if(!LEVELS[key])reject('Choose beginner, intermediate or advanced');
 return LEVELS[key];
}
function missingSchema(error){
 return error.code==='42P01';
}
export async function qualificationsRoute(db,user,path,body,method){
 const adminTask=path==='/api/qualification/requirement';
 const adminGrant=path==='/api/qualification/grant';
 const workerList=path==='/api/qualifications';
 if(!adminTask&&!adminGrant&&!workerList)return null;
 if(workerList){
  if(method!=='GET')reject('Method not allowed',405);
  try{
   const rows=await db.all(
    'SELECT skill,level,verified_at FROM worker_qualifications WHERE user_id=? ORDER BY skill',
    user.id
   );
   return {skills:rows};
  }catch(error){if(missingSchema(error))return {skills:[],schemaReady:false};throw error;}
 }
 if(method!=='POST')reject('Method not allowed',405);
 if(user.role!=='admin')reject('Admin access required',403);
 const field=skill(body?.skill);
 const rank=level(adminTask?body?.minimumLevel:body?.level);
 try{
  if(adminTask){
   if(typeof body.taskId!=='string'||body.taskId.length>90)reject('Invalid task reference');
   const task=await db.get('SELECT id FROM tasks WHERE id=?',body.taskId);
   if(!task)reject('Task not found',404);
   await db.run(
    'INSERT INTO task_requirements(task_id,skill,min_level) VALUES(?,?,?) '+
    'ON CONFLICT(task_id,skill) DO UPDATE SET min_level=EXCLUDED.min_level',
    body.taskId,field,rank
   );
  }else{
   const email=String(body.workerEmail||'').trim().toLowerCase();
   if(email.length<4||email.length>254||!email.includes('@'))reject('Enter the worker email');
   const target=await db.get("SELECT id FROM users WHERE lower(email)=? AND role='worker'",email);
   if(!target)reject('Worker account not found',404);
   await db.run(
    'INSERT INTO worker_qualifications(user_id,skill,level,verified_by) VALUES(?,?,?,?) '+
    'ON CONFLICT(user_id,skill) DO UPDATE SET level=EXCLUDED.level,'+
    'verified_by=EXCLUDED.verified_by,verified_at=NOW()',
    target.id,field,rank,user.id
   );
  }
  return {ok:true,skill:field,level:rank};
 }catch(error){
  if(missingSchema(error))reject('Qualification migration not installed',503);
  throw error;
 }
}
/** Check inside the SERIALIZABLE transaction before UPDATE tasks ... claimed. */
export async function requireQualification(tx,taskId,userId){
 try{
  const result=await tx.query(
   'SELECT r.skill,r.min_level FROM task_requirements r '+
   'LEFT JOIN worker_qualifications q ON q.user_id=$2 AND q.skill=r.skill '+
   'WHERE r.task_id=$1 AND (q.level IS NULL OR q.level<r.min_level) LIMIT 1',
   [taskId,userId]
  );
  const denied=result.rows[0];
  if(denied)reject('Verified qualification required: '+denied.skill+
   ' (level '+denied.min_level+')',403);
 }catch(error){
  // Old tasks must remain claimable until an explicit additive migration.
  if(missingSchema(error))return;
  throw error;
 }
}
export async function enrichQualifications(db,user,state){
 const tasks=state.tasks;
 if(!Array.isArray(tasks)||!tasks.length)return state;
 try{
  const ids=tasks.map(task=>task.id);
  const requirements=await db.all(
   'SELECT task_id,skill,min_level FROM task_requirements WHERE task_id=ANY(?::text[])',
   ids
  );
  const byTask=new Map();
  for(const entry of requirements){
   if(!byTask.has(entry.task_id))byTask.set(entry.task_id,[]);
   byTask.get(entry.task_id).push({skill:entry.skill,minimum_level:Number(entry.min_level)});
  }
  const own=user.role==='worker'
   ?await db.all('SELECT skill,level FROM worker_qualifications WHERE user_id=?',user.id):[];
  const bySkill=new Map(own.map(item=>[item.skill,Number(item.level)]));
  const mapped=tasks.map(task=>{
   const required=byTask.get(task.id)||[];
   return {...task,required_qualifications:required,qualified:user.role==='admin'||
    required.every(req=>(bySkill.get(req.skill)||0)>=req.minimum_level)};
  });
  return {...state,tasks:mapped,qualificationsReady:true};
 }catch(error){
  if(missingSchema(error))return {...state,qualificationsReady:false};
  throw error;
 }
}
export const qualificationSkills=Object.freeze([...SKILLS]);
export const qualificationLevels=Object.freeze({...LEVELS});
