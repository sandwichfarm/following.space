import { NDKRelaySet } from '@nostr-dev-kit/ndk';
import { ndk, DEFAULT_RELAYS } from '$lib/nostr/ndk';
import type { UserProfile } from '$lib/stores/user';

/**
 * Build a relay set for publishing events, combining default relays,
 * the user's preferred write relays, and any extra relays supplied.
 */
export function buildPublishRelaySet(
  currentUser?: UserProfile | null,
  extraRelays: Iterable<string> = []
): NDKRelaySet {
  const relayUrls = new Set(DEFAULT_RELAYS);
  for (const relay of extraRelays) {
    if (relay) relayUrls.add(relay);
  }

  if (currentUser) {
    const writeRelays =
      currentUser.writeRelays && currentUser.writeRelays.size > 0
        ? currentUser.writeRelays
        : currentUser.relays;
    for (const relay of writeRelays || []) {
      if (relay) relayUrls.add(relay);
    }
  }

  return NDKRelaySet.fromRelayUrls(Array.from(relayUrls), ndk, true, ndk.pool);
}
