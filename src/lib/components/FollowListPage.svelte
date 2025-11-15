<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { user, followUsers } from '$lib/stores/user';
  import { getFollowListById, getAuthorProfile, getProfileInfoForEntries, createFollowListStore, getFollowListFromCache } from '$lib/services/follow-list.service';
  import { initOptionalAuth } from '$lib/services/auth';
  import { FOLLOW_LIST_KIND, type FollowList, type FollowListEntry } from '$lib/types/follow-list';
  import { getRelativeTime } from '$lib/utils/date';
  import PostTimeline from '$lib/components/PostTimeline.svelte';
  import PublicKeyDisplay from '$lib/components/PublicKeyDisplay.svelte';
  import FollowButton from '$lib/components/FollowButton.svelte';
  import { hexToNpub } from '$lib/utils/npub';
  import CopyEvent from '$lib/components/CopyEvent.svelte';
  import ProfileImage from '$lib/components/ProfileImage.svelte';

  export let identifier: string | null = null;
  export let authorPubkey: string | null = null;
  export let sharePath: string | null = null;
  export let previewImageId: string | null = null;

  let followList: FollowList | null = null;
  let loading = true;
  let error = false;
  let success = '';
  let followingAll = false;
  let activeTab = 'people';
  let mounted = false;
  let currentKey: string | null = null;
  let resolvedSharePath = '';
  let resolvedPreviewImageId = '';
  let previewImageUrl = '';
  let followListUnsubscribe: (() => void) | null = null;
  let lastHydratedEventId: string | null = null;
  let usingStore = false;

  const getRequestKey = (listId: string, pubkey?: string | null) =>
    `${listId}:${pubkey ?? ''}`;

  // Function to load profile for a specific entry
  async function loadProfileForEntry(entryIndex: number) {
    if (!followList) return;
    
    try {
      // Call getProfileInfoForEntries with a single entry index
      const updatedList = await getProfileInfoForEntries(
        { ...followList, entries: [...followList.entries] }, // Clone to avoid mutation
        undefined,
        entryIndex
      );
      
      if (updatedList && followList) {
        // Update just this one entry
        followList.entries[entryIndex] = updatedList.entries[entryIndex];
        // Force reactivity by reassigning
        followList = { ...followList };
      }
    } catch (error) {
      console.error(`Error loading profile for entry ${entryIndex}:`, error);
    }
  }

  onMount(() => {
    initOptionalAuth();
    mounted = true;
  });

  onDestroy(() => {
    followListUnsubscribe?.();
    followListUnsubscribe = null;
  });

  $: if (mounted) {
    const listId = identifier;
    if (!listId) {
      error = true;
      loading = false;
      followList = null;
      currentKey = null;
      teardownStoreSubscription();
    } else if (authorPubkey) {
      const key = getRequestKey(listId, authorPubkey);
      if (!usingStore || currentKey !== key) {
        usingStore = true;
        currentKey = key;
        subscribeToFollowList(listId, authorPubkey, key);
        void ensureFollowListLoaded(listId, authorPubkey, key);
      }
    } else {
      if (usingStore) {
        usingStore = false;
        lastHydratedEventId = null;
        teardownStoreSubscription();
      }
      if (currentKey !== listId) {
        currentKey = listId;
        void fetchLegacyFollowList(listId);
      }
    }
  }

  $: resolvedSharePath = sharePath ?? $page.url.pathname;
  $: resolvedPreviewImageId = previewImageId ?? identifier ?? followList?.id ?? '';
  $: previewImageUrl = $page.url.host && resolvedPreviewImageId
    ? `https://${$page.url.host}/preview-images/${resolvedPreviewImageId}.png`
    : '';

  function teardownStoreSubscription() {
    if (followListUnsubscribe) {
      followListUnsubscribe();
      followListUnsubscribe = null;
    }
  }

  function subscribeToFollowList(listId: string, pubkey: string, requestKey: string) {
    teardownStoreSubscription();
    const store = createFollowListStore(listId, pubkey);
    followListUnsubscribe = store.subscribe((value) => {
      if (currentKey !== requestKey) return;
      if (!value) {
        followList = null;
        loading = true;
        return;
      }

      const eventChanged = lastHydratedEventId !== value.eventId;
      followList = value;
      loading = false;
      error = false;

      if (eventChanged) {
        lastHydratedEventId = value.eventId;
        void hydrateFollowList(value.eventId);
      }
    });
  }

  async function ensureFollowListLoaded(listId: string, pubkey: string, requestKey: string) {
    try {
      const cached = getFollowListFromCache(listId, pubkey);
      if (cached && currentKey === requestKey) {
        followList = cached;
        loading = false;
        error = false;
        if (lastHydratedEventId !== cached.eventId) {
          lastHydratedEventId = cached.eventId;
          await hydrateFollowList(cached.eventId);
        }
        return;
      }

      loading = true;
      const fetchedList = await getFollowListById(listId, pubkey);
      if (currentKey !== requestKey) return;

      if (!fetchedList) {
        error = true;
        loading = false;
        followList = null;
        return;
      }

      followList = fetchedList;
      loading = false;
      error = false;

      if (lastHydratedEventId !== fetchedList.eventId) {
        lastHydratedEventId = fetchedList.eventId;
        await hydrateFollowList(fetchedList.eventId);
      }
    } catch (err) {
      if (currentKey !== requestKey) return;
      console.error('Error ensuring follow list:', err);
      error = true;
      loading = false;
      followList = null;
    }
  }

  async function fetchLegacyFollowList(listId: string) {
    loading = true;
    error = false;
    success = '';
    followingAll = false;

    try {
      const fetchedList = await getFollowListById(listId);
      if (currentKey !== listId) return;

      if (!fetchedList) {
        error = true;
        loading = false;
        followList = null;
        return;
      }

      followList = fetchedList;
      loading = false;
      error = false;

      if (lastHydratedEventId !== fetchedList.eventId) {
        lastHydratedEventId = fetchedList.eventId;
        await hydrateFollowList(fetchedList.eventId);
      }
    } catch (err) {
      if (currentKey !== listId) return;
      console.error('Error fetching follow list:', err);
      error = true;
      loading = false;
      followList = null;
    }
  }

  async function hydrateFollowList(eventId?: string) {
    if (!followList) return;
    const targetEventId = eventId ?? followList.eventId;

    try {
      const listWithAuthor = await getAuthorProfile(followList);
      if (followList && followList.eventId === targetEventId && listWithAuthor) {
        followList = listWithAuthor;
      }

      if (followList && followList.eventId === targetEventId) {
        for (let i = 0; i < followList.entries.length; i++) {
          loadProfileForEntry(i);
        }
      }
    } catch (err) {
      console.error('Error hydrating follow list:', err);
    }
  }

  // Check if the current user is the author of this follow list
  function isAuthor(): boolean {
    if (!$user || !followList) return false;
    return $user.pubkey === followList.pubkey;
  }

  // Handle edit button click
  function handleEdit() {
    if (!followList) return;
    goto(`/create?edit=${followList.id}&p=${followList.pubkey}`);
  }

  // Handle follow all button click
  async function handleFollowAll() {
    if (!$user || !followList || followingAll) return;
    
    followingAll = true;
    let followedCount = 0;
    let pubkeysToFollow: string[] = [];
    try {
      for (const entry of followList.entries) {
        // Skip already followed users
        if ($user.following && $user.following.has(entry.pubkey)) continue;

        pubkeysToFollow.push(entry.pubkey);
      }

      if (pubkeysToFollow.length > 0) {
        const result = await followUsers(pubkeysToFollow);
        if (result) {
          followedCount = pubkeysToFollow.length;
        }
      }
      if (followedCount > 0) {
        success = `You are now following ${followedCount} new user${followedCount === 1 ? '' : 's'} from this list`;
        setTimeout(() => { success = ''; }, 5000);
      } else {
        success = 'You were already following all users in this list';
        setTimeout(() => { success = ''; }, 5000);
      }
    } catch (err) {
      console.error('Error in follow all:', err);
    } finally {
      followingAll = false;
    }
  }

  function setActiveTab(tab: string) {
    activeTab = tab;
  }

  async function openProfilePage(pubkey: string) {
    const npub = await hexToNpub(pubkey);
    window.open(`https://njump.me/${npub}`, '_blank');
  }
</script>

<svelte:head>
  <title>Following._ {followList?.name || 'Nostr'}</title>
  <meta name="title" content="Following._ Nostr" />
  <meta name="description" content="{followList?.description || 'A Nostr Follow Pack'}" />

  <meta property="og:type" content="website" />
  <meta property="og:title" content="Following._ Nostr" />
  <meta property="og:description" content="{followList?.description || 'A Nostr Follow Pack'}" />
  <meta property="og:image" content={previewImageUrl} />
  <meta property="og:url" content={resolvedSharePath}/>

  <meta name="twitter:card" content="summary_large_image" />
  <meta property="twitter:title" content="Following._ Nostr" />
  <meta property="twitter:description" content="{followList?.description || 'A Nostr Follow Pack'}" />
  <meta property="twitter:image" content={previewImageUrl} />
</svelte:head>

<div class="container py-10 people-container">
  <!-- Loading state -->
  {#if loading}
    <div class="mb-8 relative animate-pulse">
      <div class="h-60 rounded-lg overflow-hidden bg-gray-200"></div>
      
      <div class="mt-6 flex flex-col-reverse sm:flex-row justify-between items-start gap-4 sm:gap-0">
        <!-- text elements -->
        <div>
          <div class="h-8 bg-gray-200 rounded w-3/4 mb-2"></div>
          
          <div class="flex mt-2">
            <div class="w-6 h-6 rounded-full bg-gray-200 mr-2"></div>
            <div class="h-5 bg-gray-200 rounded w-14"></div>
          </div>
          
          <div class="flex ml-1 mt-2">
            <div class="h-4 bg-gray-200 rounded w-1/4"></div>
          </div>
        </div>
        
        <!-- button elements -->
        <div class="flex flex-wrap w-full sm:w-auto justify-end gap-2">
          <div class="h-10 bg-gray-200 rounded w-24"></div>
          <div class="h-10 bg-gray-200 rounded w-24"></div>
        </div>
      </div>
    </div>
    
    <!-- Description skeleton -->
    <div class="mb-6 bg-white rounded-lg shadow-sm p-4 sm:p-6">
      <div class="h-4 bg-gray-200 rounded w-full mb-2"></div>
      <div class="h-4 bg-gray-200 rounded w-5/6"></div>
    </div>
    
    <!-- Tab selector skeleton -->
    <div class="mb-6 bg-white rounded-lg shadow-sm overflow-hidden people-container">
      <div class="grid grid-cols-2 border-b border-gray-200">
        <div class="py-4 px-6 flex justify-center">
          <div class="h-6 bg-gray-200 rounded w-16"></div>
        </div>
        <div class="py-4 px-6 flex justify-center">
          <div class="h-6 bg-gray-200 rounded w-16"></div>
        </div>
      </div>
    </div>
    
    <!-- User list skeleton -->
    <div class="bg-white rounded-lg shadow-sm overflow-hidden people-container">
      <ul class="divide-y divide-gray-200">
        {#each Array(5) as _, i}
          <li class="p-4 sm:p-6 flex items-start justify-between">
            <div class="flex items-start">
              <div class="min-w-[60px]">
                <div class="w-10 h-10 rounded-full bg-gray-200 mr-4"></div>
              </div>
              <div>
                <div class="h-5 bg-gray-200 rounded w-40 mb-2"></div>
                <div class="h-4 bg-gray-200 rounded w-64"></div>
              </div>
            </div>
            
            <div class="h-8 bg-gray-200 rounded w-20"></div>
          </li>
        {/each}
      </ul>
    </div>
  
  <!-- Error state -->
  {:else if error || !followList}
    <div class="bg-white rounded-lg shadow-sm p-8 text-center">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">Follow Pack Not Found</h2>
      <p class="text-gray-600 mb-6">The follow list you're looking for doesn't exist or could not be loaded.</p>
      <a href="/" class="btn btn-primary">Back to Home</a>
    </div>
  
  <!-- Success state -->
  {:else}
    <!-- Header with cover image -->
    <div class="mb-8 relative">
      {#if followList.coverImageUrl}
        <div class="h-60 rounded-lg overflow-hidden">
          <img 
            src={followList.coverImageUrl} 
            alt={followList.name} 
            class="w-full h-full object-cover"
            on:error={(e) => {
              (e.target as HTMLImageElement).src = 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';
            }}
          />
        </div>
      {/if}
      
      <div class="mt-6 flex flex-col-reverse sm:flex-row justify-between items-start gap-4 sm:gap-0">
        <!-- text elements -->
        <div>
          <h1 class="text-3xl font-bold text-gray-900">{followList.name}</h1>
          
            <div class="flex mt-2">
              <ProfileImage 
                src={followList.authorPicture} 
                alt={followList.authorName || 'Author'} 
                size="sm" 
                classes="mr-2"
                onClick={() => openProfilePage(followList?.pubkey || '')}
              />
              <button on:click={() => openProfilePage(followList?.pubkey || '')}>
              <span class="text-gray-600">Created by {followList.authorName || 'Unknown'}</span>
              </button>
              
            </div>
            <div class="flex ml-1 mt-2 items-center flex-wrap">
              <span class="text-xs text-gray-500 pb-1"><PublicKeyDisplay pubkey={followList.pubkey} />  · {getRelativeTime(followList.createdAt)} · {followList.entries.length} users</span>
            </div>
            <div class="flex ml-1 mt-2 items-center flex-wrap">
            <span class="text-xs text-gray-500 mb-1">
              <CopyEvent
                identifier={followList.id}
                pubkey={followList.pubkey}
                kind={FOLLOW_LIST_KIND}
              />
            </span>
          </div>
        </div>
        
        <!-- button elements -->
        <div class="flex flex-wrap w-full sm:w-auto justify-end gap-2">
          {#if $user}
            <button 
              on:click={handleFollowAll} 
              disabled={followingAll}
              class="btn btn-primary {followingAll ? 'opacity-70' : ''}"
            >
              {followingAll ? 'Following...' : 'Follow All'}
            </button>
          {/if}
          {#if isAuthor()}
            <button on:click={handleEdit} class="btn btn-secondary">Edit List</button>
          {/if}
        </div>
      </div>
    </div>
    
    <!-- Success message -->
    {#if success}
      <div class="bg-green-50 border border-green-200 rounded-md p-4 mb-6 text-green-700">
        {success}
      </div>
    {/if}
    
    <!-- Description -->
    {#if followList.description}
      <div class="mb-6 bg-white rounded-lg shadow-sm p-4 sm:p-6">
        <p class="text-gray-700">{followList.description}</p>
      </div>
    {/if}
    
    <!-- Tab selector -->
    <div class="mb-6 bg-white rounded-lg shadow-sm overflow-hidden people-container">
      <div class="grid grid-cols-2 border-b border-gray-200">
        <button 
          class="py-4 px-6 text-center text-gray-700 {activeTab === 'people' ? 'font-bold border-b-2 border-purple-500' : 'font-medium'}"
          on:click={() => setActiveTab('people')}
        >
          People
        </button>
        <button 
          class="py-4 px-6 text-center text-gray-700 {activeTab === 'posts' ? 'font-bold border-b-2 border-purple-500' : 'font-medium'}"
          on:click={() => setActiveTab('posts')}
        >
          Posts
        </button>
      </div>
    </div>
    
    {#if activeTab === 'people'}
      <!-- User list -->
      <div class="bg-white rounded-lg shadow-sm overflow-hidden people-container">
        <ul class="divide-y divide-gray-200">
          {#each followList.entries as entry}
            <li class="p-4 sm:p-6 flex items-start justify-between">
              <div class="flex items-start">
                <div class="min-w-[60px]">
                  <ProfileImage 
                    src={entry.picture} 
                    alt={entry.name || 'User'} 
                    size="lg" 
                    classes="mr-4"
                    style="margin-top: 0.5rem !important;"
                    onClick={() => openProfilePage(entry.pubkey)}
                  />
                </div>
                <div>
                  <h3 class="text-lg font-medium text-gray-900">
                    <button on:click={() => openProfilePage(entry.pubkey)}>
                    {entry.name || 'Unknown User'}
                    </button>
                    {#if entry.nip05}
                      <span class="text-xs text-gray-500 hover:text-gray-700 transition">
                        {entry.nip05}
                      </span>
                    {/if}
                    <span class="text-xs text-gray-500 ml-1"><PublicKeyDisplay pubkey={entry.pubkey} /></span>
                  </h3>
                  
                  {#if entry.bio}
                    <p class="text-sm font-normal text-gray-600 mt-1 break-words">{entry.bio.length > 100 ? entry.bio.substring(0, 100) + '...' : entry.bio}</p>
                  {/if}
                </div>
              </div>
              
              <FollowButton entry={entry} variant="primary" />
            </li>
          {/each}
          
          {#if followList.entries.length === 0}
            <li class="p-6 text-center text-gray-500">
              This follow list doesn't contain any users.
            </li>
          {/if}
        </ul>
      </div>
    {:else}
      <!-- Post timeline -->
      <PostTimeline pubkeys={followList.entries.map(entry => entry.pubkey)} entries={followList.entries} />
    {/if}
  {/if}
</div> 

<style>
  .people-container {
    max-width: 800px;
    margin: 0 auto;
  }
</style>
