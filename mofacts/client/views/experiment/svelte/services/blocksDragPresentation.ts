export interface BlocksDragRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface BlocksDragPoint {
  readonly x: number;
  readonly y: number;
}

export interface BlocksFlipTransform {
  readonly originX: number;
  readonly originY: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly translateX: number;
  readonly translateY: number;
}

export function calculateBlocksFlipTransform(params: {
  readonly sourceRect: BlocksDragRect;
  readonly sourceAnchor: BlocksDragPoint;
  readonly targetRect: BlocksDragRect;
  readonly targetAnchor: BlocksDragPoint;
}): BlocksFlipTransform {
  const { sourceRect, sourceAnchor, targetRect, targetAnchor } = params;
  if (
    !Number.isFinite(sourceRect.width) ||
    !Number.isFinite(sourceRect.height) ||
    sourceRect.width <= 0 ||
    sourceRect.height <= 0
  ) {
    throw new Error('Blocks drag source geometry must have positive dimensions');
  }
  if (
    !Number.isFinite(targetRect.width) ||
    !Number.isFinite(targetRect.height) ||
    targetRect.width <= 0 ||
    targetRect.height <= 0
  ) {
    throw new Error('Blocks drag target geometry must have positive dimensions');
  }

  return {
    originX: targetAnchor.x,
    originY: targetAnchor.y,
    scaleX: sourceRect.width / targetRect.width,
    scaleY: sourceRect.height / targetRect.height,
    translateX: sourceRect.left + sourceAnchor.x - targetRect.left - targetAnchor.x,
    translateY: sourceRect.top + sourceAnchor.y - targetRect.top - targetAnchor.y,
  };
}

export function serializeBlocksFlipTransform(transform: BlocksFlipTransform): string {
  return `translate3d(${transform.translateX}px, ${transform.translateY}px, 0) scale(${transform.scaleX}, ${transform.scaleY})`;
}
