import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { id } = req.query;

  // ── 1. Load order + lines ──────────────────────────────────────────────────
  const { data: order, error: orderErr } = await supabase
    .from("sales_orders")
    .select("*, sales_order_lines(*)")
    .eq("id", id)
    .single();

  if (orderErr || !order) return res.status(404).json({ error: "Order not found" });
  if (!["confirmed", "partially_fulfilled"].includes(order.status)) {
    return res.status(400).json({ error: `Cannot fulfill order with status: ${order.status}` });
  }

  const lines = order.sales_order_lines ?? [];
  const pendingLines = lines.filter(l => l.quantity_fulfilled < l.quantity_ordered);
  if (pendingLines.length === 0) return res.status(400).json({ error: "All lines already fulfilled" });

  // ── 2. Get default warehouse ───────────────────────────────────────────────
  const { data: warehouse } = await supabase
    .from("warehouses").select("id").eq("is_default", true).single();
  const warehouse_id = warehouse?.id ?? null;

  const now = new Date().toISOString();

  // ── 3. Fulfill each pending line ───────────────────────────────────────────
  for (const line of pendingLines) {
    const qtyToFulfill = line.quantity_ordered - line.quantity_fulfilled;

    const { data: product } = await supabase
      .from("products").select("unit_cost_avg").eq("id", line.product_id).single();
    const cogsUnit  = Number(product?.unit_cost_avg ?? 0);
    const cogsTotal = cogsUnit * qtyToFulfill;

    await supabase.from("sales_order_lines").update({
      quantity_fulfilled: line.quantity_ordered,
      cogs_unit_cost: cogsUnit,
      cogs_total: cogsTotal,
    }).eq("id", line.id);

    if (warehouse_id) {
      const { data: stock } = await supabase
        .from("stock_levels").select("qty_on_hand, qty_committed")
        .eq("product_id", line.product_id).eq("warehouse_id", warehouse_id).maybeSingle();

      await supabase.from("stock_levels").upsert({
        product_id: line.product_id, warehouse_id,
        qty_on_hand:   stock?.qty_on_hand ?? 0,
        qty_committed: Math.max(0, (stock?.qty_committed ?? 0) - qtyToFulfill),
        last_updated_at: now,
      }, { onConflict: "product_id,warehouse_id" });

      await supabase.from("inventory_movements").insert({
        product_id: line.product_id, warehouse_id,
        movement_type: "fulfillment",
        quantity: -qtyToFulfill,
        unit_cost_snapshot: cogsUnit,
        total_cost: cogsTotal,
        reference_type: "sales_order",
        reference_id: order.id,
        reference_line_id: line.id,
        notes: `Fulfilled — ${order.order_number}`,
        moved_at: now,
      });
    }
  }

  // ── 4. Update order status ─────────────────────────────────────────────────
  await supabase.from("sales_orders")
    .update({ status: "fulfilled", updated_at: now })
    .eq("id", id);

  return res.status(200).json({ ok: true, fulfilled_lines: pendingLines.length });
}
