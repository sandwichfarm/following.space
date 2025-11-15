<script lang="ts">
  import { page } from '$app/stores';
  import { nip19 } from 'nostr-tools';
  import FollowListPage from '$lib/components/FollowListPage.svelte';
  import { FOLLOW_LIST_KIND } from '$lib/types/follow-list';

  type AddressPointer = {
    identifier: string;
    pubkey: string;
    kind: number;
    relays?: string[];
  };

  let identifier: string | null = null;
  let authorPubkey: string | null = null;
  let decodeError = '';

  $: naddrParam = $page.params.naddr;
  $: {
    decodeError = '';
    identifier = null;
    authorPubkey = null;

    if (naddrParam) {
      try {
        const decoded = nip19.decode(naddrParam);
        if (decoded.type !== 'naddr') {
          decodeError = 'Provided value is not an naddr.';
        } else {
          const pointer = decoded.data as AddressPointer;
          if (pointer.kind !== FOLLOW_LIST_KIND) {
            decodeError = 'Unsupported Nostr address kind.';
          } else {
            identifier = pointer.identifier;
            authorPubkey = pointer.pubkey;
          }
        }
      } catch (err) {
        console.error('Failed to decode naddr:', err);
        decodeError = 'Invalid Nostr address.';
      }
    } else {
      decodeError = 'Missing Nostr address.';
    }
  }
</script>

{#if decodeError}
  <div class="container py-10">
    <div class="bg-white rounded-lg shadow-sm p-8 text-center">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">Unable to load Follow Pack</h2>
      <p class="text-gray-600 mb-6">{decodeError}</p>
      <a href="/" class="btn btn-primary">Back to Home</a>
    </div>
  </div>
{:else if identifier && authorPubkey}
  <FollowListPage
    identifier={identifier}
    authorPubkey={authorPubkey}
    sharePath={`/${naddrParam}`}
    previewImageId={identifier}
  />
{:else}
  <div class="container py-10">
    <div class="bg-white rounded-lg shadow-sm p-8 text-center">
      <p class="text-gray-600">Loading follow pack…</p>
    </div>
  </div>
{/if}
