import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { buildFollowListPath } from '$lib/utils/naddr';

export const load: PageLoad = async ({ params, url }) => {
  const identifier = params.id;
  const pubkey = url.searchParams.get('p');

  if (identifier && pubkey) {
    const path = buildFollowListPath(identifier, pubkey);
    throw redirect(308, path);
  }

  return {
    identifier,
    pubkey,
    sharePath: url.pathname + url.search
  };
};
