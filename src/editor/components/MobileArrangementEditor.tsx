import type { MobileComposition, MobileItemStyle } from '../../lib/content';

export interface MobileArrangementItem {
	key: string;
	label: string;
	kind: 'image' | 'text' | 'video' | 'section';
	thumbnail?: string;
}

function orderedItems(items: MobileArrangementItem[], mobile: MobileComposition): MobileArrangementItem[] {
	const byKey = new Map(items.map((item) => [item.key, item]));
	const ordered = mobile.order.flatMap((key) => {
		const item = byKey.get(key);
		if (!item) return [];
		byKey.delete(key);
		return [item];
	});
	return [...ordered, ...byKey.values()];
}

const withOrder = (mobile: MobileComposition, items: MobileArrangementItem[]): MobileComposition => ({
	...mobile,
	order: orderedItems(items, mobile).map((item) => item.key),
});

export default function MobileArrangementEditor({
	items,
	mobile,
	gridMode = false,
	simple = false,
	scope = 'gallery',
	label,
	onChange,
}: {
	items: MobileArrangementItem[];
	mobile?: MobileComposition;
	gridMode?: boolean;
	/** Page-section mode offers reorder/hide only; section widths stay responsive. */
	simple?: boolean;
	scope?: 'gallery' | 'page';
	/** Plain-language name used to distinguish this arrangement from others on the page. */
	label?: string;
	onChange: (mobile: MobileComposition | undefined) => void;
}) {
	const pageScope = scope === 'page';
	const mixedCanvas = !pageScope && items.some((item) => item.kind !== 'image');
	const subject = label || (pageScope ? 'this page' : mixedCanvas ? 'this canvas' : 'these images');
	if (!mobile) {
		return (
			<div className="phone-layout-callout" role="group" aria-label={`Automatic phone arrangement for ${subject}`}>
				<div>
					<strong>{pageScope ? 'Your phone version is ready automatically' : 'Your phone layout is ready automatically'}</strong>
					<p>{pageScope ? 'Nothing else to set up. It follows your desktop order and fits smaller screens. Customize only if you want a different order or want to hide something on phones.' : mixedCanvas ? 'Nothing else to set up. Your images, text, and videos already stack neatly; customize only if you want this canvas arranged differently on phones.' : 'Nothing else to set up. Your work already fits smaller screens; customize only if you want the images arranged differently on phones.'}</p>
				</div>
				<button
					type="button"
					className="btn-secondary"
					aria-label={`Arrange ${subject} differently on phones`}
					onClick={() => onChange({ mode: 'custom', order: items.map((item) => item.key) })}
				>
					{pageScope ? 'Arrange this page differently on phones' : mixedCanvas ? 'Arrange canvas differently on phones' : 'Arrange images differently on phones'}
				</button>
			</div>
		);
	}

	const normalized = withOrder(mobile, items);
	const rows = orderedItems(items, normalized);

	const move = (from: number, to: number) => {
		if (to < 0 || to >= rows.length) return;
		const order = rows.map((item) => item.key);
		const [key] = order.splice(from, 1);
		order.splice(to, 0, key);
		onChange({ ...normalized, order });
	};

	const styleFor = (key: string): MobileItemStyle => normalized.items?.[key] ?? {};
	const patchStyle = (key: string, patch: Partial<MobileItemStyle>) => {
		const next = { ...styleFor(key), ...patch };
		if (next.width === 100) delete next.width;
		if (next.align === 'center') delete next.align;
		if (!next.hidden) delete next.hidden;
		const styles = { ...normalized.items };
		if (Object.keys(next).length) styles[key] = next;
		else delete styles[key];
		onChange({ ...normalized, items: Object.keys(styles).length ? styles : undefined });
	};

	return (
		<div className="phone-layout-editor" role="group" aria-label={`Phone-only arrangement for ${subject}`}>
			<div className="phone-layout-heading">
				<div>
					<strong>{pageScope ? 'Phone-only page arrangement' : mixedCanvas ? 'Phone-only canvas arrangement' : 'Phone-only image arrangement'}</strong>
					<p>{pageScope ? 'Move or hide whole parts of this page on phones. Your desktop version stays exactly as it is.' : mixedCanvas ? 'Move, resize, or hide images, text, and videos here. Your desktop design stays exactly as it is.' : 'Move, resize, or hide images here. Your desktop design stays exactly as it is.'}</p>
				</div>
				<button
					type="button"
					className="btn-ghost"
					aria-label={pageScope ? `Make ${subject} match the desktop order automatically` : `Use the automatic phone layout for ${subject}`}
					onClick={() => {
						if (confirm(pageScope ? 'Use the automatic phone page order again? Your custom phone section order will be removed.' : 'Use the automatic phone layout again? Your custom phone arrangement will be removed.'))
							onChange(undefined);
					}}
				>
					{pageScope ? 'Match desktop automatically' : 'Use automatic phone layout'}
				</button>
			</div>

			{gridMode && !simple && (
				<label className="phone-columns">
					<span>Images per row on phones</span>
					<select
						className="select-input"
						value={normalized.columns ?? 1}
						onChange={(event) => onChange({ ...normalized, columns: Number(event.target.value) as 1 | 2 })}
					>
						<option value={1}>One — larger images</option>
						<option value={2}>Two — compact grid</option>
					</select>
				</label>
			)}

			<div className="phone-layout-list" role="list" aria-label={pageScope ? `Parts of ${subject} shown on phones` : `${subject} shown on phones`}>
				{rows.map((item, index) => {
					const style = styleFor(item.key);
					const positionLabel = `${item.label}, item ${index + 1} of ${rows.length}`;
					const kindLabel = item.kind === 'section' ? 'page part' : item.kind;
					return (
						<div className={`phone-layout-row ${style.hidden ? 'is-hidden' : ''}`} key={item.key} role="listitem">
							<div className="phone-layout-item">
								{item.thumbnail ? <img src={item.thumbnail} alt="" /> : <span className="phone-layout-kind">{kindLabel}</span>}
								<span>{item.label}</span>
							</div>
							<div className="phone-layout-actions" role="group" aria-label={`Phone settings for ${positionLabel}`}>
								<button type="button" className="btn-icon" disabled={index === 0} onClick={() => move(index, index - 1)} aria-label={`Move ${positionLabel} earlier on phones`}>↑</button>
								<button type="button" className="btn-icon" disabled={index === rows.length - 1} onClick={() => move(index, index + 1)} aria-label={`Move ${positionLabel} later on phones`}>↓</button>
								{!gridMode && !simple && (
									<>
										<label className="phone-select-label">
											<span aria-hidden="true">Size</span>
											<span className="sr-only">Size of {positionLabel} on phones</span>
											<select className="select-input" value={style.width ?? 100} onChange={(event) => patchStyle(item.key, { width: Number(event.target.value) })}>
												<option value={100}>Full width</option>
												<option value={75}>Large</option>
												<option value={50}>Half width</option>
											</select>
										</label>
										<label className="phone-select-label">
											<span aria-hidden="true">Position</span>
											<span className="sr-only">Position of {positionLabel} on phones</span>
											<select className="select-input" value={style.align ?? 'center'} onChange={(event) => patchStyle(item.key, { align: event.target.value as MobileItemStyle['align'] })}>
												<option value="left">Left</option>
												<option value="center">Center</option>
												<option value="right">Right</option>
											</select>
										</label>
									</>
								)}
								<label className="phone-hide">
									<input type="checkbox" checked={!!style.hidden} onChange={(event) => patchStyle(item.key, { hidden: event.target.checked })} />
									<span className="sr-only">Hide {positionLabel} on phones</span><span aria-hidden="true">Hide</span>
								</label>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
