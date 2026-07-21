export class Metrics {
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();
  increment(name: string, amount = 1): void { this.counters.set(name, (this.counters.get(name) ?? 0) + amount); }
  gauge(name: string, value: number): void { this.gauges.set(name, value); }
  snapshot(): Record<string, number> { return Object.fromEntries([...this.counters, ...this.gauges]); }
}
