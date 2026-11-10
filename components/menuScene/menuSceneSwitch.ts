export const MENU_SCENES = { ON: 1 } as { ON: 0 | 1 };
export const PLAY_MENU_SCENE = { ON: 1 } as { ON: 0 | 1 };
export const MENU_SCENES_OLD: boolean = typeof location !== 'undefined' && /[?&]oldmenu(?:[=&]|$)/.test(location.search);
export const MENU_SCENE_ONLY: string = (typeof location !== 'undefined' && /[?&]menuscene=([a-z0-9-]+)/.exec(location.search)?.[1]) || '';
