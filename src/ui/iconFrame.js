// Which drawing and viewBox an icon uses at a DS size (10 / 12 / 20). The drawings are in the 20px frame's coordinates:
// Size=20 is the whole frame; Figma's 12 and 10px variants are that drawing scaled from its inner 18x18 ("1 1 18 18").
// X, Euro and Dollar carry their own 10 and 12px drawings on their own frame.
export const ICON_SIZES = [10, 12, 20];
export function iconFrame(icon, size = 20) {
  const px = ICON_SIZES.includes(size) ? size : 20;
  const own = px !== 20 && icon.sizes && icon.sizes[px];
  return { px, drawing: own ? { ...icon, ...own } : icon, viewBox: own ? `0 0 ${px} ${px}` : px === 20 ? '0 0 20 20' : '1 1 18 18' };
}
