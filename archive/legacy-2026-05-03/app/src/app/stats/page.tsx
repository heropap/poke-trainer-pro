import StatsPageClient from "./StatsPageClient";

export const metadata = {
  title: "效果覆盖统计 - Poke-Trainer Pro",
  description: "查看卡牌效果系统的覆盖率统计和层级分布",
};

export default function StatsPage() {
  return <StatsPageClient />;
}
