// Implement this interface in future adapters. Importing never assigns a task.
export class TaskProvider {
  async fetchTasks() { throw new Error('Implement fetchTasks(): [{externalId,title,description,rewardCents}]'); }
  async reportResult(externalId, result) { throw new Error('Implement reportResult'); }
}
