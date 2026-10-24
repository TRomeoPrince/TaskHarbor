export const TASK_STATES = Object.freeze(['available','in_progress','submitted','pending_review','approved','paid','rejected','cancelled']);
const transitions = {
  available: ['in_progress','cancelled'],
  in_progress: ['submitted','cancelled'],
  submitted: ['pending_review','rejected'],
  pending_review: ['approved','rejected'],
  approved: ['paid'],
  paid: [],
  rejected: [],
  cancelled: []
};
export class TaskEngine {
  constructor() { this.tasks = new Map(); this.events = []; }
  addTask({id, source, title, rewardUgx, sourceRewardUgx = null}) {
    if (!id || !source || !title || !Number.isInteger(rewardUgx) || rewardUgx < 0) throw new Error('Invalid task');
    if (this.tasks.has(id)) throw new Error('Duplicate task');
    const task = {id, source, title, rewardUgx, sourceRewardUgx, workerId: null, status: 'available', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()};
    this.tasks.set(id, task); return {...task};
  }
  getTask(id) { const task = this.tasks.get(id); return task ? {...task} : null; }
  listTasks(workerId = null) { return [...this.tasks.values()].filter(t => workerId === null || t.workerId === workerId).map(t => ({...t})); }
  assign(id, workerId) {
    const task = this.tasks.get(id);
    if (!task || task.status !== 'available' || !workerId) throw new Error('Task unavailable');
    task.workerId = workerId;
    return this.transition(id,'in_progress',workerId);
  }
  transition(id, next, actorId, note = '') {
    const task = this.tasks.get(id);
    if (!task || !TASK_STATES.includes(next)) throw new Error('Unknown task or status');
    if (!transitions[task.status].includes(next)) throw new Error('Invalid transition');
    if (task.workerId && actorId !== task.workerId && actorId !== 'admin') throw new Error('Forbidden');
    if (['approved','paid','rejected'].includes(next) && actorId !== 'admin') throw new Error('Admin confirmation required');
    const previous = task.status;
    task.status = next; task.updatedAt = new Date().toISOString();
    this.events.push({taskId:id,previous,next,actorId,note,at:task.updatedAt});
    return {...task};
  }
  balances(workerId) {
    const tasks = this.listTasks(workerId);
    return {
      pendingUgx: tasks.filter(t => ['submitted','pending_review','approved'].includes(t.status)).reduce((s,t)=>s+t.rewardUgx,0),
      paidUgx: tasks.filter(t => t.status === 'paid').reduce((s,t)=>s+t.rewardUgx,0)
    };
  }
}
