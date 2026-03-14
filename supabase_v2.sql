-- Shipments (lots d'achat avec coûts)
create table shipments (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  reference text not null,
  date date not null,
  supplier text,
  freight_cost numeric(10,2) default 0,
  customs_cost numeric(10,2) default 0,
  packaging_cost numeric(10,2) default 0,
  other_cost numeric(10,2) default 0,
  note text,
  status text default 'draft'
);

-- Shipment line items
create table shipment_items (
  id uuid default gen_random_uuid() primary key,
  shipment_id uuid references shipments(id) on delete cascade,
  product_id uuid references inventory(id),
  quantity numeric(10,2) not null,
  unit_purchase_price numeric(10,2) not null,
  allocated_freight numeric(10,2) default 0,
  allocated_customs numeric(10,2) default 0,
  allocated_packaging numeric(10,2) default 0,
  total_unit_cost numeric(10,2) default 0
);

-- Distributors
create table distributors (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  name text not null,
  channel text not null,
  contact text,
  note text
);

-- Distributor price list per product
create table distributor_prices (
  id uuid default gen_random_uuid() primary key,
  distributor_id uuid references distributors(id) on delete cascade,
  product_id uuid references inventory(id) on delete cascade,
  retail_price numeric(10,2) default 0,
  wholesale_price numeric(10,2) default 0,
  unique(distributor_id, product_id)
);

-- Sales orders
create table sales_orders (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  date date not null,
  channel text not null,
  distributor_id uuid references distributors(id),
  reference text,
  note text,
  total_amount numeric(10,2) default 0
);

-- Sale line items
create table sale_items (
  id uuid default gen_random_uuid() primary key,
  order_id uuid references sales_orders(id) on delete cascade,
  product_id uuid references inventory(id),
  quantity numeric(10,2) not null,
  unit_price numeric(10,2) not null,
  unit_cost numeric(10,2) default 0,
  total_price numeric(10,2) default 0,
  margin numeric(10,2) default 0
);
