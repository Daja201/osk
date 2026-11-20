import { getCachedDay } from "./cache";

async function main() {
  const entry = await getCachedDay("olomouc-traffic-gates", "2026-11-20", {
    measurement_keys: ["gate_increment_value"],
    window: "1h",
    agg_func: "sum",
    group_by_tags: ["direction"], // <- přidáno
    format: "json",
  });

  const data = entry.data as { results?: Array<{ object_name: string }> };
  console.log("počet bran v odpovědi:", data.results?.length ?? 0);
  console.log("názvy bran:", data.results?.map((r) => r.object_name));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});