type Listener = (msg: unknown) => void

export class Broker {
  private channels = new Map<string, Set<Listener>>()

  subscribe(channel: string, listener: Listener): () => void {
    let set = this.channels.get(channel)
    if (!set) {
      set = new Set()
      this.channels.set(channel, set)
    }
    set.add(listener)
    return () => {
      set!.delete(listener)
      if (set!.size === 0) this.channels.delete(channel)
    }
  }

  publish(channel: string, msg: unknown): void {
    const set = this.channels.get(channel)
    if (!set) return
    for (const l of set) l(msg)
  }
}

export const broker = new Broker()

export const channels = {
  school: (schoolId: string) => `tap-events:school/${schoolId}`,
  student: (studentId: string) => `tap-events:student/${studentId}`,
}
