export class OfflineQueue {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this.processQueue());
    }
  }

  add(task: () => Promise<any>) {
    this.queue.push(task);
    if (navigator.onLine) {
      this.processQueue();
    }
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0 && navigator.onLine) {
      const task = this.queue.shift();
      if (task) {
        try {
          await task();
        } catch (error) {
          console.error("Offline queue task failed:", error);
          // Re-queue if still offline
          if (!navigator.onLine) {
            this.queue.unshift(task);
            break;
          }
        }
      }
    }

    this.processing = false;
  }
}
