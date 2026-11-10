import { askChoice } from '../project/dialogs';
import { FullScreen } from '../ui/icons';
import { enterFullscreen, fullscreenNoticeOff } from '../../utils/fullscreen';

let _asking = false;

export function askFullscreenFirst(): void {
  if (_asking) return;
  _asking = true;
  void askChoice(
    'Play in Full Screen',
    'For the best experience, play in full screen with your screen turned sideways.',
    [
      { label: "Don't Show Again", value: 'never' },
      { label: 'Enter Full Screen', value: 'full', primary: true },
    ],
    'close', undefined, FullScreen,
  ).then(answer => {
    _asking = false;
    if (answer === 'full') void enterFullscreen();
    else if (answer === 'never') fullscreenNoticeOff();
  });
}
