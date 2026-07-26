/**
 * Binary min-heap over (value, index) with lexicographic ordering — the
 * deterministic priority queue used by hydrology filling and route search.
 * Equal values pop in ascending index order on every platform.
 */
export class MinHeap {
  private readonly values: number[];
  private readonly indexes: number[];
  size = 0;

  constructor(capacity: number) {
    this.values = new Array<number>(capacity);
    this.indexes = new Array<number>(capacity);
  }

  push(value: number, index: number): void {
    let slot = this.size;
    this.size += 1;
    this.values[slot] = value;
    this.indexes[slot] = index;
    while (slot > 0) {
      const parentSlot = (slot - 1) >> 1;
      if (this.less(slot, parentSlot)) {
        this.swap(slot, parentSlot);
        slot = parentSlot;
      } else {
        break;
      }
    }
  }

  pop(): number {
    const top = this.indexes[0] as number;
    this.size -= 1;
    if (this.size > 0) {
      this.values[0] = this.values[this.size] as number;
      this.indexes[0] = this.indexes[this.size] as number;
      let slot = 0;
      while (true) {
        const left = slot * 2 + 1;
        const right = left + 1;
        let smallest = slot;
        if (left < this.size && this.less(left, smallest)) {
          smallest = left;
        }
        if (right < this.size && this.less(right, smallest)) {
          smallest = right;
        }
        if (smallest === slot) {
          break;
        }
        this.swap(slot, smallest);
        slot = smallest;
      }
    }
    return top;
  }

  private less(a: number, b: number): boolean {
    const valueA = this.values[a] as number;
    const valueB = this.values[b] as number;
    if (valueA !== valueB) {
      return valueA < valueB;
    }
    return (this.indexes[a] as number) < (this.indexes[b] as number);
  }

  private swap(a: number, b: number): void {
    const value = this.values[a] as number;
    this.values[a] = this.values[b] as number;
    this.values[b] = value;
    const index = this.indexes[a] as number;
    this.indexes[a] = this.indexes[b] as number;
    this.indexes[b] = index;
  }
}
