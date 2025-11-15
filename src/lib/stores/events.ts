import { writable, get } from 'svelte/store';
import type { NDKEvent } from '@nostr-dev-kit/ndk';

export type EventsState = {
  byId: Map<string, NDKEvent>;
  replaceableIndex: Map<string, string>;
  parameterizedIndex: Map<string, string>;
};

const initialState: EventsState = {
  byId: new Map(),
  replaceableIndex: new Map(),
  parameterizedIndex: new Map()
};

const eventsWritable = writable<EventsState>(initialState);
const { subscribe, update } = eventsWritable;

function cloneState(state: EventsState): EventsState {
  return {
    byId: new Map(state.byId),
    replaceableIndex: new Map(state.replaceableIndex),
    parameterizedIndex: new Map(state.parameterizedIndex)
  };
}

function shouldReplace(newEvent: NDKEvent, existingEvent?: NDKEvent): boolean {
  if (!existingEvent) return true;
  const newCreatedAt = newEvent.created_at ?? 0;
  const existingCreatedAt = existingEvent.created_at ?? 0;
  if (newCreatedAt > existingCreatedAt) return true;
  if (newCreatedAt < existingCreatedAt) return false;
  return newEvent.id.localeCompare(existingEvent.id) > 0;
}

function getReplaceableKey(kind: number, pubkey: string) {
  return `${kind}:${pubkey}`;
}

function getParameterizedKey(kind: number, pubkey: string, identifier: string) {
  return `${kind}:${pubkey}:${identifier}`;
}

function getDTag(event: NDKEvent): string | undefined {
  const dTag = event.tags.find((tag) => tag[0] === 'd');
  return dTag?.[1];
}

function isParameterizedReplaceable(kind: number) {
  return kind >= 30000 && kind < 40000;
}

function isReplaceable(kind: number) {
  return kind === 0 || kind === 3 || kind === 41 || (kind >= 10000 && kind < 20000);
}

export function addEvent(event: NDKEvent) {
  update((state) => {
    const cloned = cloneState(state);
    const existingEvent = cloned.byId.get(event.id);
    if (existingEvent && !shouldReplace(event, existingEvent)) {
      return state;
    }

    cloned.byId.set(event.id, event);
    const kind = event.kind ?? 0;

    if (isParameterizedReplaceable(kind)) {
      const identifier = getDTag(event);
      if (identifier) {
        const key = getParameterizedKey(kind, event.pubkey, identifier);
        const currentId = cloned.parameterizedIndex.get(key);
        const currentEvent = currentId ? cloned.byId.get(currentId) : undefined;
        if (shouldReplace(event, currentEvent)) {
          cloned.parameterizedIndex.set(key, event.id);
        }
      }
    } else if (isReplaceable(kind)) {
      const key = getReplaceableKey(kind, event.pubkey);
      const currentId = cloned.replaceableIndex.get(key);
      const currentEvent = currentId ? cloned.byId.get(currentId) : undefined;
      if (shouldReplace(event, currentEvent)) {
        cloned.replaceableIndex.set(key, event.id);
      }
    }

    return cloned;
  });
}

export function addEvents(events: Iterable<NDKEvent>) {
  for (const event of events) {
    addEvent(event);
  }
}

export function selectEventById(state: EventsState, id: string): NDKEvent | undefined {
  return state.byId.get(id);
}

export function selectReplaceableEvent(
  state: EventsState,
  kind: number,
  pubkey: string
): NDKEvent | undefined {
  const eventId = state.replaceableIndex.get(getReplaceableKey(kind, pubkey));
  return eventId ? state.byId.get(eventId) : undefined;
}

export function selectParameterizedEvent(
  state: EventsState,
  kind: number,
  pubkey: string,
  identifier: string
): NDKEvent | undefined {
  const key = getParameterizedKey(kind, pubkey, identifier);
  const eventId = state.parameterizedIndex.get(key);
  return eventId ? state.byId.get(eventId) : undefined;
}

export function getEventById(id: string): NDKEvent | undefined {
  return selectEventById(get(eventsWritable), id);
}

export function getReplaceableEvent(kind: number, pubkey: string): NDKEvent | undefined {
  return selectReplaceableEvent(get(eventsWritable), kind, pubkey);
}

export function getParameterizedReplaceableEvent(
  kind: number,
  pubkey: string,
  identifier: string
): NDKEvent | undefined {
  return selectParameterizedEvent(get(eventsWritable), kind, pubkey, identifier);
}

export const eventsStore = { subscribe };
