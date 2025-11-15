import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		fs: {
			allow: ['cache']
		},
		allowedHosts: ['following.space', 'staging.following.space']
	},
	ssr: {
		noExternal: process.env.NODE_ENV === 'production' ? ['canvas', 'node-canvas-with-twemoji-and-discord-emoji'] : []
	},
	optimizeDeps: {
		exclude: ['canvas', 'node-canvas-with-twemoji-and-discord-emoji']
	}
});
