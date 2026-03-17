import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { id } = req.query; // order id

  // Load order to get invoice_id
  const { data: order } = await supabase
    .from("sales_orders").select("id, invoice_id, total_amount").eq("id", id).single();

  if (!order?.invoice_id) return res.status(400).json({ error: "No invoice linked to this order" });

  const { error } = await supabase
    .from("invoices")
    .update({
      amount_paid: order.total_amount,
      status:      "paid",
      updated_at:  new Date().toISOString(),
    })
    .eq("id", order.invoice_id);

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ ok: true });
}
