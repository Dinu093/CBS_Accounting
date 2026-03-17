import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "DELETE") return res.status(405).json({ error: "Method not allowed" });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { id } = req.query;

  // ── 1. Load order ──────────────────────────────────────────────────────────
  const { data: order, error: fetchErr } = await supabase
    .from("sales_orders").select("id, status, order_number, invoice_id").eq("id", id).single();

  if (fetchErr || !order) return res.status(404).json({ error: "Order not found" });

  // Only allow deleting draft or cancelled orders
  if (!["draft", "cancelled"].includes(order.status)) {
    return res.status(400).json({
      error: `Cannot delete an order with status "${order.status}". Only draft or cancelled orders can be deleted.`
    });
  }

  // ── 2. Delete invoice lines if invoice exists ──────────────────────────────
  if (order.invoice_id) {
    await supabase.from("invoice_lines").delete().eq("invoice_id", order.invoice_id);
    await supabase.from("invoices").delete().eq("id", order.invoice_id);
  }

  // ── 3. Delete order lines ──────────────────────────────────────────────────
  await supabase.from("sales_order_lines").delete().eq("sales_order_id", id);

  // ── 4. Delete inventory movements linked to this order ────────────────────
  await supabase.from("inventory_movements")
    .delete()
    .eq("reference_type", "sales_order")
    .eq("reference_id", id);

  // ── 5. Delete the order ────────────────────────────────────────────────────
  const { error: deleteErr } = await supabase
    .from("sales_orders").delete().eq("id", id);

  if (deleteErr) return res.status(500).json({ error: deleteErr.message });

  return res.status(200).json({ ok: true, deleted: order.order_number });
}
