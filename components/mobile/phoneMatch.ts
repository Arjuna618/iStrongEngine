import { useEffect } from 'react';
import { mobileEligible } from '../../utils/mobileMode';
import { keepScreenAwake } from '../../utils/wakeLock';
import { setPageCover } from '../../utils/safeArea';
import { MOBILE_ARRAS } from '../../game/mobileSwitch';

export function usePhoneMatch(inMatch: boolean): void {
  useEffect(() => {
    const on = inMatch && MOBILE_ARRAS !== 0 && mobileEligible();
    keepScreenAwake(on);
    setPageCover(on);
    return () => { if (on) { keepScreenAwake(false); setPageCover(false); } };
  }, [inMatch]);
}
