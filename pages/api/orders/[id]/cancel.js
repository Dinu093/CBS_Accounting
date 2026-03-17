import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { id } = req.query;
  const { reason } = req.body ?? {};

  const { data: order, error: orderErr } = await supabase
    .from("sales_orders").select("*, sales_order_lines(*)").eq("id", id).single();

  if (orderErr || !order) return res.status(404).json({ error: "Order not found" });
  if (!["draft", "confirmed"].includes(order.status)) {
    return res.status(400).json({ error: `Cannot cancel order with status: ${order.status}` });
  }

  const { data: warehouse } = await supabase
    .from("warehouses").select("id").eq("is_default", true).single();
  const warehouse_id = warehouse?.id ?? null;
  const now = new Date().toISOString();
  const lines = order.sales_order_lines ?? [];

  // Release committed stock if order was confirmed
  if (order.status === "confirmed" && warehouse_id) {
    for (const line of lines) {
      const pendingQty = line.quantity_ordered - line.quantity_fulfilled;
      if (pendingQty <= 0) continue;

      const { data: stock } = await supabase
        .from("stock_levels").select("qty_on_hand, qty_committed")
        .eq("product_id", line.product_id).eq("warehouse_id", warehouse_id).maybeSingle();

      await supabase.from("stock_levels").upsert({
        product_id: line.product_id, warehouse_id,
        qty_on_hand:   (stock?.qty_on_hand ?? 0) + pendingQty,
        qty_committed: Math.max(0, (stock?.qty_committed ?? 0) - pendingQty),
        last_updated_at: now,
      }, { onConflict: "product_id,warehouse_id" });

      await supabase.from("inventory_movements").insert({
        product_id: line.product_id, warehouse_id,
        movement_type: "allocation_release",
        quantity: pendingQty,
        reference_type: "sales_order",
        reference_id: order.id,
        reference_line_id: line.id,
        notes: `Cancelled — ${order.order_number}`,
        moved_at: now,
      });
    }
  }

  // Void linked invoice if it exists
  if (order.invoice_id) {
    await supabase.from("invoices").update({
      status: "void",
      voided_reason: reason || "Order cancelled",
      voided_at: now,
    }).eq("id", order.invoice_id);
  }

  // Cancel the order
  await supabase.from("sales_orders").update({
    status: "cancelled",
    cancelled_reason: reason || null,
    cancelled_at: now,
    updated_at: now,
  }).eq("id", id);

  return res.status(200).json({ ok: true });
}
