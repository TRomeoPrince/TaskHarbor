/* Additive, permissioned public task catalog. Never changes claims or ledger. */
const CATEGORIES = new Set(['microtask','survey','ai','transcription','annotation','project','general']);
const UNITS = new Set(['task','item','batch','clip','recorded_minute','milestone']);
const LEVELS = new Set(['any','beginner','intermediate','advanced']);
const LIMIT = 43200;
function validationError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}
function normalize(body) {
  const id = body?.taskId;
  const category = body?.category;
  const rewardUnit = body?.rewardUnit;
  const skillLevel = body?.skillLevel || 'any';
  const expected = body?.expectedMinutes;
  const minutes = expected === null || expected === undefined || expected === ''
    ? null : Number(expected);
  const summary = body?.publicSummary || '';
  if (typeof id !== 'string' || !/^[0-9a-f-]{8,64}$/i.test(id))
    throw validationError('Invalid task reference');
  if (!CATEGORIES.has(category) || !UNITS.has(rewardUnit) || !LEVELS.has(skillLevel))
    throw validationError('Choose a supported category, reward unit and skill level');
  if (minutes !== null && (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > LIMIT))
    throw validationError('Expected duration must be 1–43200 minutes');
  if (typeof summary !== 'string' || summary.length > 300)
    throw validationError('Public summary must be 300 characters or fewer');
  return { id, category, rewardUnit, skillLevel, minutes, summary: summary.trim() };
}
export async function catalogRoute(db, user, path, body, method) {
  if (path !== '/api/task-catalog') return null;
  if (method !== 'POST') throw validationError('Method not allowed', 405);
  if (!user || user.role !== 'admin') throw validationError('Admin access required', 403);
  const value = normalize(body);
  const existing = await db.get('SELECT id FROM tasks WHERE id=?', value.id);
  if (!existing) throw validationError('Task not found', 404);
  try {
    await db.run(
      'INSERT INTO task_catalog(task_id,category,reward_unit,expected_minutes,skill_level,public_summary) ' +
      'VALUES(?,?,?,?,?,?) ON CONFLICT(task_id) DO UPDATE SET ' +
      'category=EXCLUDED.category, reward_unit=EXCLUDED.reward_unit, ' +
      'expected_minutes=EXCLUDED.expected_minutes, skill_level=EXCLUDED.skill_level, ' +
      'public_summary=EXCLUDED.public_summary',
      value.id, value.category, value.rewardUnit, value.minutes, value.skillLevel, value.summary
    );
  } catch (error) {
    if (error.code === '42P01') throw validationError('Catalog schema not installed; apply the additive migration first', 503);
    throw error;
  }
  return { ok: true };
}
export async function catalogState(db, snapshot) {
  const tasks = snapshot?.tasks;
  if (!Array.isArray(tasks) || !tasks.length) return { ...snapshot, catalogReady: true };
  const defaults = task => ({
    ...task, category: 'general', reward_unit: 'task',
    expected_minutes: null, skill_level: 'any', public_summary: ''
  });
  const ids = tasks.map(task => task.id);
  if (ids.length > 1000) return { ...snapshot, tasks: tasks.map(defaults), catalogReady: false };
  let metadata;
  try {
    metadata = await db.all(
      'SELECT * FROM task_catalog WHERE task_id IN (' + ids.map(() => '?').join(',') + ')',
      ...ids
    );
  } catch (error) {
    // Graceful rollback safety: existing live databases may not have been migrated.
    if (error.code === '42P01') return {
      ...snapshot, tasks: tasks.map(defaults), catalogReady: false
    };
    throw error;
  }
  const byId = new Map(metadata.map(item => [item.task_id, item]));
  return {
    ...snapshot, catalogReady: true,
    tasks: tasks.map(task => {
      const data = byId.get(task.id);
      return data ? {
        ...task, category: data.category, reward_unit: data.reward_unit,
        expected_minutes: data.expected_minutes, skill_level: data.skill_level,
        public_summary: data.public_summary
      } : defaults(task);
    })
  };
}
export const catalogValues = { categories: [...CATEGORIES], units: [...UNITS], levels: [...LEVELS] };
