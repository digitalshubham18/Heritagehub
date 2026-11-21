import { handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { loyaltySummary } from "@/lib/loyalty";
import { EARN_MINOR_PER_POINT, REDEEM_MINOR_PER_POINT, MAX_REDEEM_PCT, NEW_SITE_BONUS, TIERS, expiryMonths } from "@/lib/loyalty-core";

/** Balance, tier and ledger for the signed-in visitor, plus the programme rules so the page never hard-codes them. */
export const GET = handle(async () => {
  const me = await requireUser();
  return ok({ ...(await loyaltySummary(me._id)), rules: { earnMinorPerPoint: EARN_MINOR_PER_POINT, redeemMinorPerPoint: REDEEM_MINOR_PER_POINT, maxRedeemPct: MAX_REDEEM_PCT, newSiteBonus: NEW_SITE_BONUS, expiryMonths: expiryMonths(), tiers: TIERS } });
});
export const dynamic = "force-dynamic";
