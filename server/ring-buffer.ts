export class RingBuffer {
  private buffer: string[];
  private head = 0;
  private count = 0;
  private capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  get size(): number {
    return this.count;
  }

  push(data: string): void {
    this.buffer[this.head] = data;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  getAll(): string[] {
    if (this.count === 0) return [];
    const result: string[] = [];
    const start = this.count < this.capacity ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      result.push(this.buffer[(start + i) % this.capacity]);
    }
    return result;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }
}
