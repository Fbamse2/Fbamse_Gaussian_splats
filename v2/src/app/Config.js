export const ENABLE_SAVE_VIEW = false;

// Change this to your own secret
export const MASTER_DELETE_CODE = "fbamse";

// 3×pos(f32) + 3×scale(f32) + 4×rgba(u8) + 4×rot(u8) = 32 bytes/splat
export const ROW_LENGTH = 3 * 4 + 3 * 4 + 4 + 4;

export const CAMERA = { fx: 1159.5880733038064, fy: 1164.6601287484507 };
