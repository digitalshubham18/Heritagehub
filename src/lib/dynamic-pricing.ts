import { PricingRule } from "@/models";
export * from "./pricing-rules";

export async function rulesFor(destinationId: any) { return (await PricingRule.find({ destination: destinationId, active: true }).lean()) as any[]; }
