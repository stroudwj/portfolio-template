// React state for the license gate. Mirrors useGitHub: validate the stored key on load,
// expose activate/clear. When the gate isn't configured, it reports "licensed" so nothing
// is ever blocked.
import { useCallback, useEffect, useState } from 'react';
import { activateLicense, validateLicense } from '../lib/license/client';
import { clearLicense, getLicense, setLicense } from '../lib/license/session';
import { isLicenseGateEnabled } from '../lib/license/config';

export type LicenseStatus = 'checking' | 'unlicensed' | 'licensed';

export interface LicenseSession {
	status: LicenseStatus;
	/** Whether a license is required at all (false = gate not configured). */
	required: boolean;
	/** Activate + store a pasted key. Throws LicenseError on failure. */
	activate(key: string): Promise<void>;
	clear(): void;
}

export function useLicense(): LicenseSession {
	const required = isLicenseGateEnabled();
	const [status, setStatus] = useState<LicenseStatus>(required ? 'checking' : 'licensed');

	// On load, re-validate a stored key (only when the gate is on).
	useEffect(() => {
		if (!required) return;
		const stored = getLicense();
		if (!stored) {
			setStatus('unlicensed');
			return;
		}
		let alive = true;
		validateLicense(stored.key, stored.instanceId)
			.then((ok) => {
				if (!alive) return;
				if (ok) {
					setStatus('licensed');
				} else {
					clearLicense();
					setStatus('unlicensed');
				}
			})
			.catch(() => {
				// Network hiccup — don't lock someone out of a key they already activated;
				// treat as licensed for this session and re-check next load.
				if (alive) setStatus('licensed');
			});
		return () => {
			alive = false;
		};
	}, [required]);

	const activate = useCallback(async (key: string) => {
		const { instanceId } = await activateLicense(key.trim()); // throws on failure — caller shows it
		setLicense({ key: key.trim(), instanceId });
		setStatus('licensed');
	}, []);

	const clear = useCallback(() => {
		clearLicense();
		setStatus(required ? 'unlicensed' : 'licensed');
	}, [required]);

	return { status, required, activate, clear };
}
