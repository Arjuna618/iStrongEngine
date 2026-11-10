import { SMALL_FIX } from '../game/smallFixSwitch';

export interface GpuCheckResult {
  status: 'hardware' | 'software' | 'unavailable';
  renderer: string;
}

const SOFTWARE_RENDERERS = [
  'swiftshader',
  'llvmpipe',
  'software',
  'microsoft basic render driver',
];

export function isSoftwareRendererName(renderer: string): boolean {
  const lower = renderer.toLowerCase();
  for (let i = 0; i < SOFTWARE_RENDERERS.length; i++) {
    if (lower.includes(SOFTWARE_RENDERERS[i])) return true;
  }
  return false;
}

const GPU_PROBE_ATTRS: WebGLContextAttributes = { powerPreference: 'high-performance' };

export function checkGpuAcceleration(): GpuCheckResult {
  const canvas = document.createElement('canvas');
  const gl = (canvas.getContext('webgl2', GPU_PROBE_ATTRS)
    || (SMALL_FIX.R742 !== 0 ? null : canvas.getContext('webgl', GPU_PROBE_ATTRS))) as WebGLRenderingContext | null;

  if (!gl) {
    return { status: 'unavailable', renderer: '' };
  }

  let status: GpuCheckResult['status'] = 'hardware';
  let renderer = '';

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  if (debugInfo) {
    renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string || '';
    if (isSoftwareRendererName(renderer)) status = 'software';
  }

  gl.getExtension('WEBGL_lose_context')?.loseContext();

  return { status, renderer };
}
