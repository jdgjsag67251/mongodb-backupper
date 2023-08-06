import type { EventInstanceCallback, EventInstanceHandle, IEventInstance } from './types';
import crypto from 'crypto';

type EventNames = 'end';
type Emitter = (name: EventNames) => Promise<void>;
type Handlers = Map<EventNames, Map<string, EventInstanceCallback>>;

class EventInstance implements IEventInstance {
  #handlers: Handlers;

  constructor(handlers: Handlers) {
    this.#handlers = handlers;
  }

  onEnd(callback: EventInstanceCallback) {
    return EventInstance.createHandle(this.getHandler('end'), callback);
  }

  getHandler(name: EventNames): Map<string, EventInstanceCallback> {
    const map = this.#handlers.get(name);
    if (map) {
      return map;
    }

    const newMap = new Map();
    this.#handlers.set(name, newMap);
    return newMap;
  }

  private static createHandle(
    map: Map<string, EventInstanceCallback>,
    callback: EventInstanceCallback,
  ): EventInstanceHandle {
    const id = crypto.randomUUID();

    map.set(id, callback);
    return {
      id,
      remove: () => {
        map.delete(id);
      },
    };
  }
}

export default function createEventInstance(): [IEventInstance, Emitter] {
  const handlers: Handlers = new Map();
  const instance = new EventInstance(handlers);

  const emitter: Emitter = async (name) => {
    const handlers = [...instance.getHandler(name).values()];
    const promises = handlers.map((handler) => Promise.resolve(handler()));

    await Promise.all(promises);
  };

  return [instance, emitter];
}
