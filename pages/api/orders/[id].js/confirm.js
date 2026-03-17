import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { id } = req.query;

  // ── 1. Load order + lines ──────────────────────────────────────────────────
  const { data: order, error: fetchErr } = await supabase
    .from("sales_orders")
    .select("*, sales_order_lines(*)")
    .eq("id", id)
    .single();

  if (fetchErr || !order) return res.status(404).json({ error: "Order not found" });
  if (order.status !== "draft") return res.status(400).json({ error: `Cannot confirm order with status: ${order.status}` });

  const now = new Date();

  // ── 2. Confirm the order ───────────────────────────────────────────────────
  const { error: confirmErr } = await supabase
    .from("sales_orders")
    .update({ status: "confirmed", updated_at: now.toISOString() })
    .eq("id", id);

  if (confirmErr) return res.status(500).json({ error: confirmErr.message });

  // ── 3. Generate invoice number  INV-YYYY-XXXX ─────────────────────────────
  const year = now.getFullYear();
  const { count } = await supabase
    .from("invoices")
    .select("*", { count: "exact", head: true })
    .like("invoice_number", `INV-${year}-%`);

  const seq = String((count ?? 0) + 1).padStart(4, "0");
  const invoice_number = `INV-${year}-${seq}`;

  // ── 4. Calculate due date from payment terms ───────────────────────────────
  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + (order.payment_terms_days ?? 30));
  const due_date = dueDate.toISOString().split("T")[0];
  const issue_date = now.toISOString().split("T")[0];

  // ── 5. Create invoice ──────────────────────────────────────────────────────
  const { data: invoice, error: invoiceErr } = await supabase
    .from("invoices")
    .insert({
      invoice_number,
      sales_order_id: order.id,
      customer_id:    order.customer_id,
      issue_date,
      due_date,
      subtotal:       order.subtotal,
      tax_amount:     order.tax_amount ?? 0,
      total_due:      order.total_amount,
      amount_paid:    0,
      status:         "sent",
    })
    .select()
    .single();

  if (invoiceErr) {
    console.error("Invoice creation error:", invoiceErr);
    // Don't fail the confirm — order is confirmed, invoice failed
    return res.status(200).json({ ok: true, warning: "Order confirmed but invoice creation failed: " + invoiceErr.message });
  }

  // ── 6. Link invoice to order ───────────────────────────────────────────────
  await supabase
    .from("sales_orders")
    .update({ invoice_id: invoice.id, updated_at: now.toISOString() })
    .eq("id", id);

  // ── 7. Create invoice lines from order lines ───────────────────────────────
  const lines = order.sales_order_lines ?? [];
  if (lines.length > 0) {
    const invoiceLines = lines.map(l => ({
      invoice_id:          invoice.id,
      sales_order_line_id: l.id,
      product_id:          l.product_id,
      description:         l.product_name,
      sku:                 l.sku,
      quantity:            l.quantity_ordered,
      unit_price:          l.unit_price,
      line_total:          l.line_total,
    }));
    await supabase.from("invoice_lines").insert(invoiceLines);
  }

  return res.status(200).json({
    ok: true,
    order_number:   order.order_number,
    invoice_id:     invoice.id,
    invoice_number: invoice.invoice_number,
  });
}
