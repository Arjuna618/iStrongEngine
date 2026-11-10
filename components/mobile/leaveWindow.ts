import { askChoice } from '../project/dialogs';
import { LogOut } from '../ui/icons';
import { installLeaveGuard, setLeaveWindowOpen } from '../../utils/leaveGuard';
import { mobileEligible } from '../../utils/mobileMode';
import { MOBILE_ARRAS } from '../../game/mobileSwitch';

let _open = false;

export function askLeaveGame(): void {
  if (_open) return;
  _open = true;
  setLeaveWindowOpen(true);
  void askChoice('Leave the Game?', 'Press Back again to leave.', [{ label: 'Stay', value: 'stay', primary: true }], 'close', undefined, LogOut)
    .then(() => { _open = false; setLeaveWindowOpen(false); });
}

export function installPhoneLeaveGuard(): void {
  if (MOBILE_ARRAS === 0 || !mobileEligible()) return;
  installLeaveGuard(askLeaveGame);
}
