import { useEffect, useMemo, useState } from 'react';
import type { StoreOffer, StoreProduct } from '../../lib/content';
import { isTestStripePaymentLink, normalizeStripePaymentLink } from '../../lib/stripe-payment-link';
import { useEditor } from '../store';
import { getAssetPreviewUrl } from '../lib/assets';
import { Field, Section, TextArea, TextInput } from './ui/controls';
import { ImageDrop } from './ui/ImageDrop';

type StripeLinkState = 'empty' | 'invalid' | 'test' | 'live';
const supportedCurrencyCodes =
	typeof Intl.supportedValuesOf === 'function'
		? new Set(Intl.supportedValuesOf('currency'))
		: null;

function stripeLinkState(raw: string): StripeLinkState {
	if (!raw.trim()) return 'empty';
	if (!normalizeStripePaymentLink(raw)) return 'invalid';
	return isTestStripePaymentLink(raw) ? 'test' : 'live';
}

function currencyDigits(currency: string): number {
	try {
		return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
			.maximumFractionDigits ?? 2;
	} catch {
		return 2;
	}
}

function amountForInput(amountMinor: number, currency: string): string {
	const digits = currencyDigits(currency);
	return (amountMinor / 10 ** digits).toFixed(digits);
}

function PriceInput({
	amountMinor,
	currency,
	label,
	onCommit,
}: {
	amountMinor: number;
	currency: string;
	label: string;
	onCommit: (amountMinor: number) => void;
}) {
	const [draft, setDraft] = useState(() => amountForInput(amountMinor, currency));
	const [invalid, setInvalid] = useState(false);

	useEffect(() => {
		setDraft(amountForInput(amountMinor, currency));
		setInvalid(false);
	}, [amountMinor, currency]);

	const commit = () => {
		const value = draft.trim() ? Number(draft) : 0;
		if (!Number.isFinite(value) || value < 0) {
			setInvalid(true);
			return;
		}
		const next = Math.round(value * 10 ** currencyDigits(currency));
		if (!Number.isSafeInteger(next)) {
			setInvalid(true);
			return;
		}
		setInvalid(false);
		setDraft(amountForInput(next, currency));
		if (next !== amountMinor) onCommit(next);
	};

	return (
		<label className="field store-price-field">
			<span className="field-label">Display price ({currency})</span>
			<input
				className={`text-input ${invalid ? 'invalid' : ''}`}
				value={draft}
				inputMode="decimal"
				aria-label={label}
				aria-invalid={invalid}
				onChange={(event) => {
					setDraft(event.target.value);
					setInvalid(false);
				}}
				onBlur={commit}
				onKeyDown={(event) => {
					if (event.key === 'Enter') event.currentTarget.blur();
				}}
			/>
			{invalid && <span className="field-error">Enter a price of zero or more.</span>}
		</label>
	);
}

function OfferEditor({
	product,
	offer,
	index,
	currency,
}: {
	product: StoreProduct;
	offer: StoreOffer;
	index: number;
	currency: string;
}) {
	const editor = useEditor();
	const state = stripeLinkState(offer.checkout.url);
	const offerName = offer.label || `option ${index + 1}`;

	return (
		<div className="store-offer">
			<div className="store-offer-head">
				<span className="block-label">Option {index + 1}</span>
				<div className="block-controls" role="group" aria-label={`Actions for ${offerName} on ${product.name || 'untitled product'}`}>
					<button
						type="button"
						className="btn-icon"
						disabled={index === 0}
						onClick={() => editor.moveProductOffer(product.id, index, index - 1)}
						aria-label={`Move ${offerName} earlier`}
					>
						↑
					</button>
					<button
						type="button"
						className="btn-icon"
						disabled={index === product.offers.length - 1}
						onClick={() => editor.moveProductOffer(product.id, index, index + 1)}
						aria-label={`Move ${offerName} later`}
					>
						↓
					</button>
					<button
						type="button"
						className="btn-icon danger"
						onClick={() => editor.removeProductOffer(product.id, offer.id)}
						aria-label={`Delete ${offerName}`}
					>
						✕
					</button>
				</div>
			</div>
			<div className="store-offer-fields">
				<Field label="Option name">
					<TextInput
						value={offer.label}
						placeholder="Signed print — 8 × 10 in"
						aria-label={`Name for option ${index + 1} on ${product.name || 'untitled product'}`}
						onChange={(event) =>
							editor.updateProductOffer(product.id, offer.id, { label: event.target.value })
						}
					/>
				</Field>
				<PriceInput
					amountMinor={offer.amountMinor}
					currency={currency}
					label={`Display price for ${offerName} on ${product.name || 'untitled product'}`}
					onCommit={(amountMinor) => editor.updateProductOffer(product.id, offer.id, { amountMinor })}
				/>
			</div>
			<Field
				label="Stripe Payment Link"
				hint={
					state === 'test'
						? 'This is a Stripe test link. Keep the product Draft until you replace it with a live link.'
						: 'Paste the buy.stripe.com link for this exact option.'
				}
				error={
					state === 'invalid'
						? 'Use a canonical https://buy.stripe.com Payment Link.'
						: product.status === 'available' && state !== 'live'
							? 'Available products need a live Stripe Payment Link.'
							: undefined
				}
			>
				<TextInput
					className={state === 'invalid' ? 'text-input invalid' : 'text-input'}
					value={offer.checkout.url}
					placeholder="https://buy.stripe.com/…"
					inputMode="url"
					aria-label={`Stripe Payment Link for ${offerName} on ${product.name || 'untitled product'}`}
					onChange={(event) =>
						editor.updateProductOffer(product.id, offer.id, {
							checkout: { provider: 'stripe_payment_link', url: event.target.value },
						})
					}
				/>
			</Field>
		</div>
	);
}

function ProductEditor({
	product,
	index,
	products,
	currency,
	galleryChoices,
}: {
	product: StoreProduct;
	index: number;
	products: StoreProduct[];
	currency: string;
	galleryChoices: Array<{
		key: string;
		folder: string;
		entryId: string;
		label: string;
		assetId: string | null;
		filename: string;
	}>;
}) {
	const editor = useEditor();
	const { doc } = editor;
	if (!doc) return null;

	const image = doc.productImages[product.id];
	const previewUrl = getAssetPreviewUrl(image?.assetId ?? null);
	const galleryValue =
		galleryChoices.find(
			(choice) =>
				(image?.assetId && choice.assetId === image.assetId) ||
				(!image?.assetId &&
					!!image?.filename &&
					product.image === `${choice.folder}/${choice.filename}`),
		)?.key ?? '';
	const hasChosenImage = Boolean(image?.filename || product.image);
	const availableProblems = [
		!product.name.trim() && 'a name',
		!hasChosenImage && 'an image',
		hasChosenImage &&
			!image?.assetId &&
			'a real product photo — the sample image can’t be published; upload your own or replace it',
		!product.imageAlt.trim() && 'an image description',
		product.offers.length === 0 && 'at least one buying option',
		product.offers.some((offer) => !offer.label.trim()) && 'a name for every buying option',
		product.offers.some((offer) => offer.amountMinor <= 0) &&
			'a positive display price for every buying option',
		product.offers.some((offer) => stripeLinkState(offer.checkout.url) !== 'live') &&
			'a live Stripe link for every buying option',
	].filter(Boolean);

	return (
		<article className="store-product-card">
			<header className="store-product-head">
				<div>
					<strong>{product.name.trim() || `Untitled product ${index + 1}`}</strong>
					<span>{product.status === 'sold_out' ? 'Sold out' : product.status === 'available' ? 'Available' : 'Draft'}</span>
				</div>
				<div className="block-controls" role="group" aria-label={`Actions for ${product.name || `product ${index + 1}`}`}>
					<button
						type="button"
						className="btn-icon"
						disabled={index === 0}
						onClick={() => editor.moveProduct(index, index - 1)}
						aria-label={`Move ${product.name || `product ${index + 1}`} earlier`}
					>
						↑
					</button>
					<button
						type="button"
						className="btn-icon"
						disabled={index === products.length - 1}
						onClick={() => editor.moveProduct(index, index + 1)}
						aria-label={`Move ${product.name || `product ${index + 1}`} later`}
					>
						↓
					</button>
					<button
						type="button"
						className="btn-icon danger"
						onClick={() => {
							if (
								confirm(
									`Delete “${product.name || `product ${index + 1}`}”? It will also be removed from selected Products blocks.`,
								)
							)
								editor.removeProduct(product.id);
						}}
						aria-label={`Delete ${product.name || `product ${index + 1}`}`}
					>
						✕
					</button>
				</div>
			</header>

			<div className="store-product-basics">
				<Field label="Product name">
					<TextInput
						value={product.name}
						placeholder="Blue Hour, archival print"
						onChange={(event) => editor.updateProduct(product.id, { name: event.target.value })}
					/>
				</Field>
				<Field label="Status">
					<select
						className="text-input"
						value={product.status}
						aria-label={`Status for ${product.name || `product ${index + 1}`}`}
						onChange={(event) =>
							editor.updateProduct(product.id, {
								status: event.target.value as StoreProduct['status'],
							})
						}
					>
						<option value="draft">Draft — private</option>
						<option value="available">Available — show checkout</option>
						<option value="sold_out">Sold out — keep visible</option>
					</select>
				</Field>
			</div>
			<Field label="Description (optional)">
				<TextArea
					rows={3}
					value={product.description ?? ''}
					placeholder="Materials, edition details, shipping notes…"
					onChange={(event) =>
						editor.updateProduct(product.id, { description: event.target.value || undefined })
					}
				/>
			</Field>

			<div className="field store-image-field">
				<span className="field-label">Product image</span>
				<div className="store-image-picker">
					{previewUrl ? (
						<img className="store-image-preview" src={previewUrl} alt="" />
					) : image?.filename || product.image ? (
						<div className="store-image-placeholder" title={image?.filename || product.image}>
							Image selected
						</div>
					) : null}
					<div className="store-image-actions">
						<ImageDrop
							ariaLabel={`Upload an image for ${product.name || `product ${index + 1}`}`}
							onFiles={(files) => editor.setProductImage(product.id, files[0])}
						>
							<span>{image?.filename || product.image ? 'Replace image' : '＋ Upload product image'}</span>
						</ImageDrop>
						{galleryChoices.length > 0 && (
							<label className="field store-gallery-choice">
								<span className="field-label">Or use artwork already on this site</span>
								<select
									className="text-input"
									value={galleryValue}
									aria-label={`Choose existing artwork for ${product.name || `product ${index + 1}`}`}
									onChange={(event) => {
										const choice = galleryChoices.find((item) => item.key === event.target.value);
										if (choice)
											editor.setProductImageFromGallery(
												product.id,
												choice.folder,
												choice.entryId,
											);
									}}
								>
									<option value="">Choose site artwork…</option>
									{galleryChoices.map((choice) => (
										<option key={choice.key} value={choice.key}>
											{choice.label}
										</option>
									))}
								</select>
							</label>
						)}
						{(image?.filename || product.image) && (
							<button
								type="button"
								className="btn-link store-remove-image"
								onClick={() => editor.removeProductImage(product.id)}
							>
								Remove product image
							</button>
						)}
					</div>
				</div>
			</div>
			<Field
				label="Image description"
				hint="Describe what a buyer can see. This is read aloud when the image cannot be seen."
			>
				<TextInput
					value={product.imageAlt}
					placeholder="Blue abstract print with layered cobalt shapes"
					onChange={(event) => editor.updateProduct(product.id, { imageAlt: event.target.value })}
				/>
			</Field>

			<div className="store-offers-head">
				<div>
					<strong>Buying options</strong>
					<span>Use one option for each size, edition, or format.</span>
				</div>
				<button
					type="button"
					className="btn-secondary"
					onClick={() => editor.addProductOffer(product.id)}
				>
					＋ Add option
				</button>
			</div>
			<div className="store-offer-list">
				{product.offers.map((offer, offerIndex) => (
					<OfferEditor
						key={offer.id}
						product={product}
						offer={offer}
						index={offerIndex}
						currency={currency}
					/>
				))}
				{product.offers.length === 0 && (
					<p className="muted store-empty-note">No buying options yet.</p>
				)}
			</div>

			{product.status === 'available' && availableProblems.length > 0 && (
				<p className="store-product-warning" role="status">
					Before this can publish as Available, add {availableProblems.join(', ')}.
				</p>
			)}
			{product.status === 'sold_out' && (
				<p className="store-product-note">
					The site will replace every checkout button with “Sold out.” Also deactivate or limit the
					Payment Link in Stripe so an old direct link cannot still take an order.
				</p>
			)}
		</article>
	);
}

export default function StoreEditor() {
	const editor = useEditor();
	const { doc } = editor;
	const store = doc?.content.store;
	const [currencyDraft, setCurrencyDraft] = useState(store?.currency ?? 'USD');

	useEffect(() => {
		setCurrencyDraft(store?.currency ?? 'USD');
	}, [store?.currency]);

	const galleryChoices = useMemo(
		() =>
			Object.entries(doc?.galleries ?? {}).flatMap(([folder, entries]) =>
				entries.map((entry, index) => ({
					key: `${folder}\t${entry.id}`,
					folder,
					entryId: entry.id,
					label: `${entry.meta.title || entry.filename || `Image ${index + 1}`} — ${folder}`,
					assetId: entry.assetId,
					filename: entry.filename,
				})),
			),
		[doc?.galleries],
	);

	if (!doc) return null;
	if (!store)
		return (
			<Section title="Sell your work">
				<div className="store-empty">
					<p>
						Create a simple catalog for prints and originals. Buyers choose an option here, then
						pay securely on Stripe’s hosted checkout.
					</p>
					<button type="button" className="btn-primary" onClick={editor.setupStore}>
						Set up store
					</button>
					<p className="muted">
						This also adds a visible Shop page at the next available address, beginning with
						<code>/shop</code>. Existing pages are never replaced.
					</p>
				</div>
			</Section>
		);

	const normalizedCurrency = currencyDraft.trim().toUpperCase();
	let currencyValid =
		/^[A-Z]{3}$/.test(normalizedCurrency) &&
		(!supportedCurrencyCodes || supportedCurrencyCodes.has(normalizedCurrency));
	if (currencyValid) {
		try {
			new Intl.NumberFormat('en', { style: 'currency', currency: normalizedCurrency }).format(0);
		} catch {
			currencyValid = false;
		}
	}
	const hasDisplayPrices = store.products.some((product) =>
		product.offers.some((offer) => offer.amountMinor > 0),
	);
	const saveCurrency = () => {
		if (!currencyValid || normalizedCurrency === store.currency) return;
		if (
			hasDisplayPrices &&
			!confirm(
				`Change the store currency from ${store.currency} to ${normalizedCurrency}? Existing display amounts will not be converted. Review every price and update the matching prices in Stripe.`,
			)
		)
			return;
		editor.setStoreCurrency(normalizedCurrency);
	};

	return (
		<>
			<Section title="Store settings">
				<div className="store-currency-row">
					<Field
						label="Store currency"
						hint="One ISO currency code applies to every display price. Stripe remains the source of truth."
						error={
							currencyDraft.trim() && !currencyValid
								? 'Enter a valid three-letter currency code, such as USD.'
								: undefined
						}
					>
						<TextInput
							value={currencyDraft}
							maxLength={3}
							autoCapitalize="characters"
							spellCheck={false}
							aria-label="Store currency code"
							onChange={(event) => setCurrencyDraft(event.target.value.toUpperCase())}
							onKeyDown={(event) => {
								if (event.key === 'Enter') saveCurrency();
							}}
						/>
					</Field>
					<button
						type="button"
						className="btn-secondary"
						disabled={!currencyValid || normalizedCurrency === store.currency}
						onClick={saveCurrency}
					>
						Change currency
					</button>
				</div>

				<details className="store-stripe-help">
					<summary>Set up checkout in Stripe</summary>
					<ol>
						<li>Create one Payment Link for each size, edition, or format you sell.</li>
						<li>In Stripe, choose quantity limits, shipping addresses, tax, receipts, and payment limits.</li>
						<li>Copy each <code>buy.stripe.com</code> link into its matching option below.</li>
					</ol>
					<a
						className="btn-secondary btn-inline"
						href="https://dashboard.stripe.com/payment-links"
						target="_blank"
						rel="noreferrer"
					>
						Open Stripe Payment Links ↗
					</a>
					<div className="store-stripe-resources">
						<a
							href="https://docs.stripe.com/payment-links"
							target="_blank"
							rel="noreferrer"
						>
							Payment Links guide
						</a>
						<a
							href="https://docs.stripe.com/payment-links/customize"
							target="_blank"
							rel="noreferrer"
						>
							Checkout customization
						</a>
					</div>
					<p className="muted">
						Prices entered here are for display. Stripe’s price and checkout settings are
						authoritative. Orders, buyer details, receipts, refunds, tax, shipping, and fulfillment
						stay in your Stripe account; Hangwork does not provide a cart or order dashboard.
					</p>
				</details>
			</Section>

			<Section
				title={`Products (${store.products.length})`}
				action={
					<button type="button" className="btn-secondary" onClick={editor.addProduct}>
						＋ Add product
					</button>
				}
			>
				<p className="muted store-products-intro">
					Drafts stay in this editor but are left out when you publish. Use ↑↓ to set the catalog
					order.
				</p>
				<div className="store-product-list">
					{store.products.map((product, index) => (
						<ProductEditor
							key={product.id}
							product={product}
							index={index}
							products={store.products}
							currency={store.currency}
							galleryChoices={galleryChoices}
						/>
					))}
					{store.products.length === 0 && (
						<div className="store-empty-products">
							<p>No products yet. Add a print or original when you’re ready.</p>
							<button type="button" className="btn-primary" onClick={editor.addProduct}>
								Add first product
							</button>
						</div>
					)}
				</div>
			</Section>
		</>
	);
}
