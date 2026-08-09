import type { LocationProof, SeekState } from "@/contracts";
import { evaluateSeekState } from "@/features/discovery";
import { ApiProblem } from "@/server/api";

export function requireSafeSeek(spotId: string, location: LocationProof): { spotId: string; seekState: SeekState } {
  const evaluated = evaluateSeekState({ spotId, location });
  if (evaluated.ok) return { spotId: evaluated.spotId, seekState: evaluated.seekState };

  if (
    evaluated.reason === "unknown_spot" ||
    evaluated.reason === "seek_target_review_required" ||
    evaluated.reason === "seek_not_allowed"
  ) {
    throw new ApiProblem(400, "invalid_spot", "该公共地点尚未通过现场安全审核。 ");
  }
  if (evaluated.reason === "stale_location" || evaluated.reason === "future_location") {
    throw new ApiProblem(400, "stale_location", "位置证明已过期，请重新获取位置。 ");
  }
  if (evaluated.reason === "low_accuracy" || evaluated.reason === "boundary_uncertain") {
    throw new ApiProblem(400, "location_too_imprecise", "当前定位精度不足，请靠近公共地点后重试。 ");
  }
  throw new ApiProblem(400, "invalid_location", "需要有效的一次性位置证明。 ");
}
