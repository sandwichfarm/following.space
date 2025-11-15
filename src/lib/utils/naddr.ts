import { nip19 } from 'nostr-tools';
import { DEFAULT_RELAYS } from '$lib/nostr/ndk';
import { FOLLOW_LIST_KIND } from '$lib/types/follow-list';

/**
 * Encode a follow list identifier and pubkey into an naddr string.
 */
export function encodeFollowListNaddr(identifier: string, pubkey: string): string {
  if (!identifier || !pubkey) {
    throw new Error('Missing identifier or pubkey for naddr encoding');
  }

  return nip19.naddrEncode({
    identifier,
    kind: FOLLOW_LIST_KIND,
    pubkey,
    relays: DEFAULT_RELAYS
  });
}

/**
 * Build the canonical path for a follow list using its naddr identifier.
 */
export function buildFollowListPath(identifier: string, pubkey: string): string {
  return `/${encodeFollowListNaddr(identifier, pubkey)}`;
}
