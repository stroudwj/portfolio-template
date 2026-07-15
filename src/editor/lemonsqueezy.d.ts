// Minimal typings for the lemon.js global loaded in editor.astro. We only use the overlay
// opener; the full SDK surface isn't needed. See https://docs.lemonsqueezy.com/help/lemonjs.
interface LemonSqueezySDK {
	Url: {
		/** Open a checkout URL as an on-page overlay. */
		Open(url: string): void;
	};
}

interface Window {
	/** Initializes the lemon.js SDK; present once the external script has loaded. */
	createLemonSqueezy?: () => void;
	/** The lemon.js SDK, available after createLemonSqueezy() runs. */
	LemonSqueezy?: LemonSqueezySDK;
}
