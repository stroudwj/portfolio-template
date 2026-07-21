// Project-specific state is injected from .hangwork/project.json by the Astro config,
// keeping this system-owned module identical in product and published repositories.
export const IS_PRODUCT_SITE = import.meta.env.PUBLIC_HANGWORK_IS_PRODUCT_SITE === 'true';
