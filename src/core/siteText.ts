import { laundryClause } from './laundry'
import { explainSiteLayout } from './site'
import type { Plan, PlanConfig } from './types'

/**
 * 敷地の解説文（R-TEXT-10・R-TEXT-11）。敷地の配置の文（`explainSiteLayout`）の後ろに洗濯の1文（`laundryClause`）を足す。
 * site.ts と laundry.ts の循環参照を避けるため、2つをつなぐ層を別ファイルにしている。`explainPlan` とは別関数
 */
export function explainSite(cfg: Pick<PlanConfig, 'parking' | 'garden'>, plan: Plan): string {
  return explainSiteLayout(cfg, plan) + laundryClause(plan, cfg)
}
