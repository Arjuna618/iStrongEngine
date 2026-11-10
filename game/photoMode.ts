export const PHOTO_MODE: boolean = (typeof location !== 'undefined' && /[?&]photo(?:[=&]|$)/.test(location.search))
  || (typeof globalThis !== 'undefined' && (globalThis as { __istrongSceneWorker?: boolean }).__istrongSceneWorker === true);

let _hide = false;
export function photoHiding(): boolean { return _hide; }
export function setPhotoHide(on: boolean): void { _hide = PHOTO_MODE && on; }
