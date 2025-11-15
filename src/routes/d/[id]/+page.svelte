<script lang="ts">
  import FollowListPage from '$lib/components/FollowListPage.svelte';
  import type { PageData } from './$types';

  export let data: PageData;
</script>

<FollowListPage
  identifier={data.identifier}
  authorPubkey={data.pubkey}
  sharePath={data.sharePath}
  previewImageId={data.identifier}
/>
