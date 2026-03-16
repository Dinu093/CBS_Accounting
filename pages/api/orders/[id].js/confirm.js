import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { id } = req.query;

  // check current status
  const { data: order, error: fetchErr } = await supabase
    .from("sales_orders")
    .select("id, status, order_number")
    .eq("id", id)
    .single();

  if (fetchErr || !order) return res.status(404).json({ error: "Order not found" });
  if (order.status !== "draft") return res.status(400).json({ error: `Cannot confirm an order with status: ${order.status}` });

  const { error } = await supabase
    .from("sales_orders")
    .update({ status: "confirmed", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ ok: true, order_number: order.order_number });
}
