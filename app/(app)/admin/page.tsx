import { getCharacteristics } from "@/lib/data";
import { WeightsPanel } from "@/components/weights-panel";

export default async function WeightsPage() {
  const characteristics = await getCharacteristics();
  return <WeightsPanel characteristics={characteristics} />;
}
