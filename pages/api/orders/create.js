import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const {
    customer_id,
    ship_to_location_id,
    order_date,
    payment_terms_days,
    discount_pct,
    notes,
    subtotal,
    total_amount,
    lines,
  } = req.body;

  // ── 1. Validate ────────────────────────────────────────────────────────────
  if (!customer_id)          return res.status(400).json({ error: "customer_id is required" });
  if (!lines || lines.length === 0) return res.status(400).json({ error: "At least one product line is required" });
  if (!order_date)           return res.status(400).json({ error: "order_date is required" });

  for (const line of lines) {
    if (!line.product_id)        return res.status(400).json({ error: "All lines must have a product" });
    if (line.quantity_ordered < 1) return res.status(400).json({ error: "Quantity must be at least 1" });
  }

  // ── 2. Generate order number  SO-YYYY-XXXX ─────────────────────────────────
  const year = new Date(order_date).getFullYear();

  const { count } = await supabase
    .from("sales_orders")
    .select("*", { count: "exact", head: true })
    .like("order_number", `SO-${year}-%`);

  const seq = String((count ?? 0) + 1).padStart(4, "0");
  const order_number = `SO-${year}-${seq}`;

  // ── 3. Get default warehouse ───────────────────────────────────────────────
  const { data: warehouse } = await supabase
    .from("warehouses")
    .select("id")
    .eq("is_default", true)
    .single();

  const warehouse_id = warehouse?.id ?? null;

  // ── 4. Create the sales_order ──────────────────────────────────────────────
  const { data: order, error: orderErr } = await supabase
    .from("sales_orders")
    .insert({
      order_number,
      channel:           "wholesale",
      status:            "confirmed",
      order_date,
      customer_id,
      ship_to_location_id: ship_to_location_id || null,
      payment_terms_days,
      subtotal,
      tax_amount:        0,
      total_amount,
      notes: notes || null,
    })
    .select()
    .single();

  if (orderErr) {
    console.error("sales_orders insert error:", orderErr);
    return res.status(500).json({ error: orderErr.message });
  }

  // ── 5. Create sales_order_lines ────────────────────────────────────────────
  const orderLines = lines.map((l) => ({
    sales_order_id:    order.id,
    product_id:        l.product_id,
    sku:               l.sku,
    product_name:      l.product_name,
    quantity_ordered:  l.quantity_ordered,
    quantity_fulfilled: 0,
    quantity_returned: 0,
    unit_price:        l.unit_price,
    line_total:        l.line_total,
    cogs_unit_cost:    null, // filled on fulfillment with WACOG snapshot
    cogs_total:        null,
  }));

  const { data: insertedLines, error: linesErr } = await supabase
    .from("sales_order_lines")
    .insert(orderLines)
    .select();

  if (linesErr) {
    console.error("sales_order_lines insert error:", linesErr);
    // rollback: delete the order we just created
    await supabase.from("sales_orders").delete().eq("id", order.id);
    return res.status(500).json({ error: linesErr.message });
  }

  // ── 6. Update stock + record inventory movements ───────────────────────────
  // For each line:
  //   a) Upsert stock_levels: decrease qty_on_hand (can go negative for pre-orders)
  //   b) Insert inventory_movement of type 'allocation'

  const stockErrors = [];

  for (let i = 0; i < lines.length; i++) {
    const line      = lines[i];
    const orderLine = insertedLines[i];

    // a) Get current stock level
    const { data: currentStock } = await supabase
      .from("stock_levels")
      .select("qty_on_hand, qty_committed")
      .eq("product_id", line.product_id)
      .eq("warehouse_id", warehouse_id)
      .maybeSingle();

    const currentQty  = currentStock?.qty_on_hand  ?? 0;
    const currentComm = currentStock?.qty_committed ?? 0;

    // b) Upsert stock_levels
    const { error: stockErr } = await supabase
      .from("stock_levels")
      .upsert(
        {
          product_id:    line.product_id,
          warehouse_id,
          qty_on_hand:   currentQty  - line.quantity_ordered, // can go negative
          qty_committed: currentComm + line.quantity_ordered,
          last_updated_at: new Date().toISOString(),
        },
        { onConflict: "product_id,warehouse_id" }
      );

    if (stockErr) {
      console.error("stock_levels upsert error:", stockErr);
      stockErrors.push(stockErr.message);
    }

    // c) Record inventory movement
    if (warehouse_id) {
      const { error: movErr } = await supabase
        .from("inventory_movements")
        .insert({
          product_id:          line.product_id,
          warehouse_id,
          movement_type:       "allocation",
          quantity:            -line.quantity_ordered, // negative = stock going out
          reference_type:      "sales_order",
          reference_id:        order.id,
          reference_line_id:   orderLine.id,
          notes:               `Order ${order_number} — ${line.product_name}`,
          moved_at:            new Date().toISOString(),
        });

      if (movErr) {
        console.error("inventory_movements insert error:", movErr);
        stockErrors.push(movErr.message);
      }
    }
  }

  // ── 7. Return ──────────────────────────────────────────────────────────────
  return res.status(200).json({
    id:           order.id,
    order_number: order.order_number,
    stock_warnings: stockErrors.length > 0 ? stockErrors : undefined,
  });
}
