export interface TaskProgressResult {
  action: "start" | "advance" | "read" | "finish" | "cancel";
  status: string;
  current_step: string | null;
  pending_tasks: string[];
  completed_tasks: string[];
  total_pending: number;
  total_completed: number;
}

export class AgentTaskProgress {
  private status: "idle" | "running" | "completed" | "cancelled" = "idle";
  private pending: string[] = [];
  private completed: string[] = [];

  public start(tasks: string[]): TaskProgressResult {
    if (!Array.isArray(tasks) || tasks.length === 0) {
      throw new Error("start requires a non-empty array of tasks");
    }
    this.status = "running";
    this.pending = [...tasks];
    this.completed = [];
    return this.read("start");
  }

  public advance(options?: { add?: string[] }): TaskProgressResult {
    if (this.status !== "running") {
      throw new Error(`Cannot advance task progress in status: ${this.status}`);
    }

    if (this.pending.length > 0) {
      const current = this.pending.shift()!;
      this.completed.push(current);
    }

    if (options?.add && Array.isArray(options.add)) {
      for (const task of options.add) {
        if (typeof task === "string" && task.trim() !== "" && !this.pending.includes(task)) {
          this.pending.push(task);
        }
      }
    }

    return this.read("advance");
  }

  public read(action: "start" | "advance" | "read" | "finish" | "cancel" = "read"): TaskProgressResult {
    return {
      action,
      status: this.status,
      current_step: this.pending[0] ?? null,
      pending_tasks: [...this.pending],
      completed_tasks: [...this.completed],
      total_pending: this.pending.length,
      total_completed: this.completed.length,
    };
  }

  public finish(): TaskProgressResult {
    if (this.status !== "running") {
      throw new Error(`Cannot finish task progress in status: ${this.status}`);
    }
    if (this.pending.length > 0) {
      throw new Error(
        `Cannot finish task progress: ${this.pending.length} pending task(s) remain (${this.pending.join(", ")})`,
      );
    }
    this.status = "completed";
    return {
      action: "finish",
      status: "completed",
      current_step: null,
      pending_tasks: [],
      completed_tasks: [...this.completed],
      total_pending: 0,
      total_completed: this.completed.length,
    };
  }

  public cancel(): TaskProgressResult {
    this.status = "cancelled";
    this.pending = [];
    return {
      action: "cancel",
      status: "cancelled",
      current_step: null,
      pending_tasks: [],
      completed_tasks: [...this.completed],
      total_pending: 0,
      total_completed: this.completed.length,
    };
  }

  public read_pending_labels(): string[] {
    return [...this.pending];
  }

  public reset(): void {
    this.status = "idle";
    this.pending = [];
    this.completed = [];
  }
}
